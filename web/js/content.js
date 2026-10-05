// Reading texts, word/sentence lookups, saving, writing prompts. Everything adapts to the chosen level.
import { structured } from "./claude.js";
import { all, get, kvGet, kvSet, run, scalar } from "./db.js";
import { addCard } from "./srs.js";
import { lookup } from "./nlp.js";
import { BUILTIN_TEXTS, LEVELS, PROMPTS_BY_LEVEL, THEMES } from "./seed.js";
import { hashtext, localDate } from "./util.js";

export { LEVELS };
export const level = () => kvGet("level", "B1");
export const shiftLevel = (lv, delta) => LEVELS[Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(lv) + delta))];

export const LEVEL_GUIDE = {
  A1: "very short simple sentences, present tense (some passé composé), the 500 most common words, concrete everyday topics",
  A2: "short clear sentences, present, passé composé, futur proche and some imparfait, high-frequency vocabulary",
  B1: "varied sentences, passé composé/imparfait, futur, conditionnel, relative pronouns, some subjonctif",
  B2: "natural complex sentences, full range of tenses incl. subjonctif and plus-que-parfait, some idioms",
  C1: "rich, idiomatic, nuanced French as in quality press or literature",
};
const BASE_WORDS = { A1: 70, A2: 110, B1: 180, B2: 250, C1: 300 };
export const LENGTHS = { short: 0.6, medium: 1, long: 1.6 };
const WRITE_WORDS = { A1: 40, A2: 70, B1: 120, B2: 180, C1: 220 };
const words = (lv, length = "medium") => Math.round((BASE_WORDS[lv] * (LENGTHS[length] ?? 1)) / 10) * 10;

// ---------- texts ----------

export const addText = (title, body, source) =>
  run("INSERT INTO text(source, title, body, created_at) VALUES (?,?,?,?)", [source, title.trim() || "Sans titre", body.trim().replace(/\r\n/g, "\n"), Date.now()]);

/** Saved words that aren't solid yet, weakest first. */
export const learningLemmas = (limit = 8) =>
  all(
    `SELECT DISTINCT item.lemma FROM item JOIN card ON card.item_id = item.id
     WHERE item.kind = 'word' AND item.suspended = 0 AND (card.stability IS NULL OR card.stability < 21)
     ORDER BY card.stability IS NOT NULL, card.stability LIMIT ?`,
    [limit],
  ).map((r) => r.lemma);

const TEXT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    body: { type: "string", description: "The French text; paragraphs separated by blank lines" },
  },
};
const textSystem = (lv) =>
  `You write French reading texts for an adult learner at CEFR ${lv}: ${LEVEL_GUIDE[lv]}. Texts are natural and interesting (everyday life, culture, stories, dialogues), never childish.`;

export async function generateText({ length = "medium" } = {}) {
  const lv = level();
  const recent = all("SELECT title FROM text ORDER BY created_at DESC LIMIT 10").map((r) => r.title);
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const res = await structured({
    system: textSystem(lv),
    user: `Write a text of about ${words(lv, length)} words.
Words I'm learning (use those that fit naturally at this level, any form): ${learningLemmas().join(", ") || "(none yet)"}
Also introduce 3-5 useful new ${lv} words.
Topic idea: ${theme}. Avoid these recent titles: ${recent.join("; ") || "(none)"}`,
    schema: TEXT_SCHEMA,
    purpose: "text",
  });
  return addText(res.title, res.body, "claude");
}

const REWRITES = {
  easier: (lv) => `Rewrite it one level easier, for a ${shiftLevel(lv, -1)} learner (${LEVEL_GUIDE[shiftLevel(lv, -1)]}). Keep the story and roughly the same length.`,
  harder: (lv) => `Rewrite it one level harder, for a ${shiftLevel(lv, 1)} learner (${LEVEL_GUIDE[shiftLevel(lv, 1)]}). Keep the story and roughly the same length.`,
  shorter: () => "Rewrite it about half as long, keeping the main story and the same difficulty.",
  longer: () => "Rewrite it about 1.5x longer: add detail or a further development, same difficulty.",
};
const SUFFIX = { easier: "plus facile", harder: "plus difficile", shorter: "court", longer: "long" };

/** New text that is an easier/harder/shorter/longer version of text `id`. */
export async function rewriteText(id, change) {
  const doc = get("SELECT title, body FROM text WHERE id = ?", [id]);
  const lv = level();
  const res = await structured({
    system: textSystem(lv),
    user: `Here is a French text:\n<<<\n${doc.body}\n>>>\n${REWRITES[change](lv)}`,
    schema: TEXT_SCHEMA,
    purpose: "rewrite",
  });
  const base = doc.title.replace(/ \((plus facile|plus difficile|court|long)\)$/, "");
  return addText(`${base} (${SUFFIX[change]})`, res.body, "claude");
}

/** Next unused built-in text (no key / offline). */
export function nextBuiltinText() {
  const have = new Set(all("SELECT title FROM text WHERE source = 'builtin'").map((r) => r.title));
  const t = BUILTIN_TEXTS.find((t) => !have.has(t.title));
  return t ? addText(t.title, t.body, "builtin") : null;
}

// ---------- lookups ----------

const cacheGet = (key) => {
  const hit = scalar("SELECT data FROM gloss_cache WHERE key = ?", [key]);
  return hit ? JSON.parse(hit) : null;
};
const cacheSet = (key, data) => run("INSERT OR REPLACE INTO gloss_cache(key, data) VALUES (?, ?)", [key, JSON.stringify(data)]);

// Kept short on purpose: fewer output tokens = faster answers.
const GLOSS_SCHEMA = {
  type: "object",
  properties: {
    lemma: { type: "string", description: "Dictionary form: infinitive for verbs, masculine singular for adjectives" },
    pos: { type: "string", description: "noun, verb, adj, adv, prep, expression, ..." },
    gender: { type: "string", enum: ["m", "f", ""], description: "For nouns; empty otherwise" },
    meaning: { type: "string", description: "English meaning of the word as used in this sentence (a few words)" },
    lemma_meaning: { type: "string", description: "Short English gloss of the lemma (1-3 senses)" },
    note: { type: "string", description: "Only if really useful (idiom, false friend, irregular form); else empty. Max 12 words." },
  },
};

/** Contextual word gloss from Claude (cached). Only called from the "Ask Claude" button. */
export async function claudeGloss(word, sentence) {
  const key = hashtext(`w2|${word}|${sentence}`);
  let g = cacheGet(key);
  if (!g) {
    const hint = lookup(word).slice(0, 3).map((d) => `${d.lemma} (${d.pos}): ${d.gloss}`).join(" | ");
    g = await structured({
      system: `Terse French-English learner's dictionary for a ${level()} learner. Explain the word as used in the sentence.`,
      user: `Word: ${word}\nSentence: ${sentence}\nDictionary hints: ${hint || "(none)"}`,
      schema: GLOSS_SCHEMA,
      purpose: "word",
      maxTokens: 400,
    });
    cacheSet(key, g);
  }
  return g;
}

// ---------- grammar explanations (on demand) ----------

/** Claude's explanation of a sentence: translation + up to 3 notes. Only called from the "Explain grammar" button. */
export async function explainSentence(sentence) {
  const key = hashtext(`g|${level()}|${sentence}`);
  const hit = cacheGet(key);
  if (hit) return hit;
  const res = await structured({
    system: `You help a ${level()} French learner understand a sentence. Translate it naturally, then explain the 1-3 things most worth noticing (grammar, tense/mood, idiom, tricky word). Short, concrete, in English.`,
    user: sentence,
    schema: {
      type: "object",
      properties: {
        translation: { type: "string" },
        notes: { type: "array", items: { type: "string" }, description: "1-3 notes, max 20 words each" },
      },
    },
    purpose: "grammar",
    maxTokens: 600,
  });
  cacheSet(key, res);
  return res;
}

// ---------- saving ----------

function displayLemma(lemma, pos, gender) {
  if (pos?.startsWith("noun") && (gender === "m" || gender === "f")) {
    return /^[aeiouhâàéèêîôœ]/i.test(lemma) ? `l'${lemma} (${gender})` : `${gender === "m" ? "le" : "la"} ${lemma}`;
  }
  return lemma;
}

/**
 * Save a word as a review item. `g` = {lemma, pos, gender, lemma_meaning, sentence_en?, note?, example_fr?, example_en?}.
 * Returns {itemId, created}.
 */
export function saveWord({ word, sentence, textId, g, mine = false }) {
  const existing = get("SELECT id FROM item WHERE kind = 'word' AND lemma = ?", [g.lemma]);
  if (existing) {
    if (mine) run("UPDATE item SET mine = 1 WHERE id = ?", [existing.id]);
    return { itemId: existing.id, created: false };
  }
  const note = [g.note, g.example_fr && `${g.example_fr} — ${g.example_en}`].filter(Boolean).join(" · ");
  const at = Date.now();
  const itemId = run(
    "INSERT INTO item(kind, lemma, front, back, context, context_en, note, text_id, mine, created_at) VALUES ('word',?,?,?,?,?,?,?,?,?)",
    [g.lemma, displayLemma(g.lemma, g.pos, g.gender), g.lemma_meaning, sentence.replace(word, `[[${word}]]`), g.sentence_en || null, note || null, textId ?? null, mine ? 1 : 0, at],
  );
  addCard(itemId, "recog", at);
  return { itemId, created: true };
}

/** Save a whole sentence (French -> English card). */
export function saveSentence({ sentence, translation, notes, textId, mine = false }) {
  const existing = get("SELECT id FROM item WHERE kind = 'sentence' AND front = ?", [sentence]);
  if (existing) {
    if (mine) run("UPDATE item SET mine = 1 WHERE id = ?", [existing.id]);
    return { itemId: existing.id, created: false };
  }
  const at = Date.now();
  const itemId = run("INSERT INTO item(kind, front, back, note, text_id, mine, created_at) VALUES ('sentence',?,?,?,?,?,?)", [
    sentence, translation, notes || null, textId ?? null, mine ? 1 : 0, at,
  ]);
  addCard(itemId, "recog", at);
  return { itemId, created: true };
}

export const savedLemmas = () => new Set(all("SELECT lemma FROM item WHERE kind = 'word'").map((r) => r.lemma));
export const savedSentences = () => new Set(all("SELECT front FROM item WHERE kind = 'sentence'").map((r) => r.front));

// ---------- writing prompt ----------

/** Writing level: one below the reading level unless changed with Easier/Harder (producing is harder than understanding). */
export const writeLevel = () => kvGet("write_level", null) ?? shiftLevel(level(), -1);

/** Today's prompt: fixed for the day unless changed with newPrompt(). */
export function todaysPrompt() {
  const today = localDate();
  const saved = kvGet("prompt_today", null);
  if (saved?.date === today && (saved.manual || saved.level === writeLevel())) return saved;
  const lv = writeLevel();
  const list = PROMPTS_BY_LEVEL[lv];
  const [y, m, d] = today.split("-").map(Number);
  const p = { date: today, level: lv, text: list[Math.floor(Date.UTC(y, m - 1, d) / 86400000) % list.length] };
  kvSet("prompt_today", p);
  return p;
}

/** Replace today's prompt: change = "easier" | "harder" | "new". Uses Claude if possible, else the built-in lists. */
export async function newPrompt(change, { useClaude = true } = {}) {
  const cur = todaysPrompt();
  const lv = change === "easier" ? shiftLevel(cur.level, -1) : change === "harder" ? shiftLevel(cur.level, 1) : cur.level;
  if (lv !== cur.level) kvSet("write_level", lv); // Easier/Harder sticks for future days too
  let text;
  if (useClaude) {
    const res = await structured({
      system: `You write short writing prompts (in French) for an adult French learner at CEFR ${lv}: ${LEVEL_GUIDE[lv]}.`,
      user: `Give one new prompt at ${lv} level. Expected answer length: about ${WRITE_WORDS[lv]} words${lv.startsWith("A") ? "; add 2-3 guiding questions" : ""}.
It must be different from: "${cur.text}". Make it about everyday life, opinions or stories. Write the prompt in simple French${lv.startsWith("A") ? " a beginner can understand" : ""}.`,
      schema: { type: "object", properties: { prompt: { type: "string" } } },
      purpose: "prompt",
      maxTokens: 500,
    });
    text = res.prompt;
  } else {
    const list = PROMPTS_BY_LEVEL[lv].filter((p) => p !== cur.text);
    text = list[Math.floor(Math.random() * list.length)];
  }
  const p = { date: localDate(), level: lv, text, manual: true };
  kvSet("prompt_today", p);
  return p;
}

export const wordTarget = (lv) => WRITE_WORDS[lv];

/** A few sentence starters to get going, by level. */
export const STARTERS = {
  A1: ["Je m'appelle…", "J'aime… parce que…", "Le week-end, je…", "Il y a…", "Je n'aime pas…"],
  A2: ["Hier, j'ai…", "D'abord… ensuite… enfin…", "Quand j'étais petit(e), je…", "Je vais… demain.", "À mon avis, …"],
  B1: ["À mon avis, …", "D'un côté… de l'autre…", "Ce qui m'a surpris, c'est que…", "Si j'avais le temps, je…", "Par exemple, …"],
  B2: ["Il est vrai que… cependant…", "Bien que…, …", "Il me semble que…", "En revanche, …", "Pour conclure, …"],
  C1: ["Force est de constater que…", "Il n'en demeure pas moins que…", "Loin de…, …", "Quoi qu'il en soit, …", "En définitive, …"],
};
