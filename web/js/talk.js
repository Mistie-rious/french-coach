// Talk: role-play conversations with Claude in French, with gentle corrections that feed reviews.
import { structured } from "./claude.js";
import { get, run, tx } from "./db.js";
import { addCard } from "./srs.js";
import { LEVEL_GUIDE } from "./content.js";
import { CATEGORIES, NATURAL_RULES, locate } from "./correction.js";

export const SCENARIOS = [
  { id: "cafe", emoji: "☕", title: "Au café", role: "a friendly waiter in a Paris café", setting: "a busy café terrace in the morning", goal: "Order something to drink and eat, ask a question about the menu, then ask for the bill.", register: "vous" },
  { id: "boulangerie", emoji: "🥖", title: "À la boulangerie", role: "the baker", setting: "a small neighbourhood bakery", goal: "Buy bread and a pastry, ask what they recommend, and pay.", register: "vous" },
  { id: "voisin", emoji: "🏠", title: "Un nouveau voisin", role: "a curious, chatty neighbour who just moved in next door", setting: "the stairwell of your building", goal: "Introduce yourself, say where you're from and what you do, and suggest meeting up.", register: "vous" },
  { id: "ami", emoji: "🍷", title: "Ton week-end", role: "a close French friend", setting: "a phone call on Monday evening", goal: "Tell your friend about your weekend and ask about theirs.", register: "tu" },
  { id: "chemin", emoji: "🗺️", title: "Demander son chemin", role: "a passer-by who knows the neighbourhood", setting: "a street corner in Lyon", goal: "Ask how to get to the train station and check you understood the directions.", register: "vous" },
  { id: "gare", emoji: "🚆", title: "À la gare", role: "a ticket agent at the SNCF counter", setting: "a train station; the train you wanted is cancelled", goal: "Buy a ticket to Bordeaux, find out about the cancellation and choose another train.", register: "vous" },
  { id: "restaurant", emoji: "🍽️", title: "Un problème au restaurant", role: "a slightly stressed restaurant waiter", setting: "a restaurant at dinner time; your dish arrived cold and wrong", goal: "Politely explain the problem and get it fixed.", register: "vous" },
  { id: "medecin", emoji: "🩺", title: "Chez le médecin", role: "a calm general practitioner (médecin généraliste)", setting: "a doctor's office", goal: "Explain your symptoms (you've had a sore throat and fever for three days) and understand the advice.", register: "vous" },
  { id: "appart", emoji: "🔑", title: "Visiter un appartement", role: "an estate agent showing a flat", setting: "a two-room flat for rent", goal: "Ask about the rent, charges, neighbourhood and when you can move in.", register: "vous" },
  { id: "service", emoji: "📞", title: "Le service client", role: "a customer-service agent for an internet provider", setting: "a phone call; your internet hasn't worked for two days", goal: "Explain the problem, answer their questions and get a solution.", register: "vous" },
  { id: "entretien", emoji: "💼", title: "Entretien d'embauche", role: "a recruiter interviewing you for a job you'd like", setting: "a job interview", goal: "Present yourself, talk about your experience and ask a question about the job.", register: "vous" },
  { id: "debat", emoji: "💬", title: "Un petit débat", role: "a friend who enjoys a friendly argument and gives their own opinions", setting: "chatting over coffee about whether social media does more harm than good", goal: "Give your opinion with reasons and respond to theirs.", register: "tu" },
  { id: "libre", emoji: "✨", title: "Discussion libre", role: "a warm, curious French friend", setting: "a relaxed chat about anything: your day, plans, interests", goal: "Just talk! Keep the conversation going.", register: "tu" },
];

/** Free chat: no scene, no goal; questions about French (in English) are welcome. */
export const CHAT = {
  id: "chat", emoji: "💬", title: "Avec Camille", mode: "chat", register: "tu",
  role: "Camille, a warm, funny French friend in her thirties who lives in Lyon and loves helping people learn French",
  setting: "a relaxed chat", goal: "",
};

export const scenarioById = (id) => (id === "chat" ? CHAT : SCENARIOS.find((s) => s.id === id));

/** Start a conversation (no Claude call yet). Returns its id. */
export function startConversation(scenario, level) {
  const setup = { role: scenario.role, setting: scenario.setting, goal: scenario.goal, register: scenario.register, emoji: scenario.emoji, mode: scenario.mode || "scene" };
  return run("INSERT INTO conversation(scenario, title, setup, level, messages, created_at) VALUES (?,?,?,?,?,?)", [
    scenario.id, scenario.title, JSON.stringify(setup), level, "[]", Date.now(),
  ]);
}

export function getConversation(id) {
  const c = get("SELECT * FROM conversation WHERE id = ?", [id]);
  if (!c) return null;
  return { ...c, setup: JSON.parse(c.setup), messages: JSON.parse(c.messages) };
}

const save = (c) => run("UPDATE conversation SET messages = ? WHERE id = ?", [JSON.stringify(c.messages), c.id]);

const SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Your next line in the conversation, in French" },
    corrections: {
      type: "array",
      description: "Real errors in the learner's LAST message only; empty if it was fine or there was none",
      items: {
        type: "object",
        properties: {
          original: { type: "string", description: "Exact substring of the learner's message" },
          suggestion: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          explanation: { type: "string", description: "One short sentence in simple English" },
        },
      },
    },
    suggestion: { type: "string", description: "One natural thing the learner could say next, in French at their level" },
    goal_done: { type: "boolean", description: "True once the learner has achieved the scenario goal" },
  },
};

const system = (c) => {
  const s = c.setup;
  if (s.mode === "chat") {
    return `You are ${s.role}. You're chatting with an adult French learner at CEFR ${c.level} (${LEVEL_GUIDE[c.level]}).
- Reply in French at that level, using "tu". Be natural, curious and a bit playful; share your own (invented) life and opinions too.
- Keep replies short (1-4 sentences) and usually end with a question so the chat keeps going.
- If the learner asks something ABOUT French (often in English: a word, "how do I say…", a grammar question), answer it clearly and briefly in English first, with a French example, then continue the chat in French.
- If the learner writes in English for other things, gently answer in simple French and encourage them to try in French.
- Never correct the learner inside your reply; corrections go in "corrections" only (real errors in their French, not style; ignore English text).
- goal_done is always false.
How to correct the learner's last message:
${NATURAL_RULES}`;
  }
  return `You are role-playing ${s.role}. Setting: ${s.setting}.
You're talking with an adult French learner at CEFR ${c.level} (${LEVEL_GUIDE[c.level]}).
- Speak only French, in that level's vocabulary and grammar. Address the learner with "${s.register}".
- Keep each reply short (1-3 sentences) and natural, like real speech. Ask questions to keep things going. Stay in character.
- The learner's goal: ${s.goal} Help them get there naturally, without lecturing.
- Never correct the learner inside your reply; corrections go in "corrections" only (real errors, not style).
How to correct the learner's last message:
${NATURAL_RULES}`;
};

const transcript = (c) => {
  const msgs = c.messages.slice(-14); // keep requests small and cheap
  return msgs.map((m) => `${m.role === "ai" ? "You" : "Learner"}: ${m.text}`).join("\n");
};

/** Get Claude's next turn. If `said` is given, it's appended as the learner's message first. */
export async function takeTurn(c, said, { claude = structured } = {}) {
  if (said) {
    c.messages.push({ role: "me", text: said });
    save(c);
  }
  const user = c.messages.length
    ? `Conversation so far:\n${transcript(c)}\n\nWrite your next line and check the learner's last message.`
    : "Open the conversation with your first line (the learner hasn't spoken yet; corrections must be empty).";
  const res = await claude({ system: system(c), user, schema: SCHEMA, purpose: "talk", maxTokens: 1200 });
  const last = c.messages.at(-1);
  if (last?.role === "me") {
    last.corrections = res.corrections.filter((e) => locate(last.text, e.original) !== -1);
    logMistakes(c, last);
  }
  c.messages.push({ role: "ai", text: res.reply, suggestion: res.suggestion, goalDone: res.goal_done });
  save(c);
  return c;
}

/** Each correction becomes an error (for stats) and a mistake card, like in Write. */
function logMistakes(c, msg) {
  if (!msg.corrections?.length) return;
  tx(() => {
    if (!c.submission_id) {
      c.submission_id = run("INSERT INTO submission(modality, prompt, raw_text, summary, grader, created_at) VALUES ('speak',?,?,?,?,?)", [
        c.title, "", "Conversation practice", "claude", Date.now(),
      ]);
      run("UPDATE conversation SET submission_id = ? WHERE id = ?", [c.submission_id, c.id]);
    }
    const sub = get("SELECT raw_text FROM submission WHERE id = ?", [c.submission_id]);
    const offset = sub.raw_text.length ? sub.raw_text.length + 1 : 0;
    run("UPDATE submission SET raw_text = ? WHERE id = ?", [sub.raw_text ? `${sub.raw_text}\n${msg.text}` : msg.text, c.submission_id]);
    const at = Date.now();
    for (const e of msg.corrections) {
      const pos = locate(msg.text, e.original);
      run("INSERT INTO error(submission_id, start, end, original, suggestion, category, explanation, created_at) VALUES (?,?,?,?,?,?,?,?)", [
        c.submission_id, offset + pos, offset + pos + e.original.length, e.original, e.suggestion, e.category, e.explanation, at,
      ]);
      const front = `${msg.text.slice(0, pos)}[[${msg.text.slice(pos, pos + e.original.length)}]]${msg.text.slice(pos + e.original.length)}`;
      const back = `${msg.text.slice(0, pos)}[[${e.suggestion}]]${msg.text.slice(pos + e.original.length)}`;
      const itemId = run("INSERT INTO item(kind, front, back, note, category, submission_id, created_at) VALUES ('mistake',?,?,?,?,?,?)", [
        front, back, e.explanation, e.category, c.submission_id, at,
      ]);
      addCard(itemId, "fix", at);
    }
  });
}

export function endConversation(c) {
  run("UPDATE conversation SET ended_at = ? WHERE id = ?", [Date.now(), c.id]);
}

export const allCorrections = (c) => c.messages.filter((m) => m.role === "me").flatMap((m) => (m.corrections || []).map((e) => ({ ...e, said: m.text })));
