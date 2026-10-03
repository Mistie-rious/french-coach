// Reading texts, word lookups, saving words, the daily writing prompt.
import { structured, hasKey } from "./claude.js";
import { all, get, kvGet, run, scalar } from "./db.js";
import { addCard } from "./srs.js";
import { lookup } from "./nlp.js";
import { BUILTIN_TEXTS, PROMPTS, THEMES } from "./seed.js";
import { hashtext, localDate } from "./util.js";

export const level = () => kvGet("level", "B1");

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

export async function generateText() {
  const lv = level();
  const recent = all("SELECT title FROM text ORDER BY created_at DESC LIMIT 10").map((r) => r.title);
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const res = await structured({
    system: `You write short French reading texts for an adult learner at CEFR ${lv}: natural and interesting (everyday life, culture, news-style stories, narratives, dialogues), never childish. Mostly high-frequency vocabulary with varied ${lv} grammar.`,
    user: `Words I'm learning (use as many as fit naturally, any form): ${learningLemmas().join(", ") || "(none yet)"}
Also introduce 3-5 useful new ${lv} words.
Topic idea: ${theme}. Avoid these recent titles: ${recent.join("; ") || "(none)"}`,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string", description: "French text, 150-220 words, paragraphs separated by blank lines" },
      },
    },
  });
  return addText(res.title, res.body, "claude");
}

/** Next unused built-in text (no key / offline). */
export function nextBuiltinText() {
  const have = new Set(all("SELECT title FROM text WHERE source = 'builtin'").map((r) => r.title));
  const t = BUILTIN_TEXTS.find((t) => !have.has(t.title));
  return t ? addText(t.title, t.body, "builtin") : null;
}

// ---------- word lookup ----------

const GLOSS_SCHEMA = {
  type: "object",
  properties: {
    lemma: { type: "string", description: "Dictionary form: infinitive for verbs, masculine singular for adjectives" },
    pos: { type: "string", description: "noun, verb, adj, adv, prep, expression, ..." },
    gender: { type: "string", enum: ["m", "f", ""], description: "For nouns; empty otherwise" },
    meaning: { type: "string", description: "English meaning of the word as used in this sentence" },
    lemma_meaning: { type: "string", description: "Short English gloss of the lemma (1-3 senses)" },
    sentence_en: { type: "string", description: "Natural English translation of the whole sentence" },
    note: { type: "string", description: "Only if useful (idiom, false friend, irregular form, register); else empty" },
    example_fr: { type: "string", description: "A different short everyday example sentence using the lemma" },
    example_en: { type: "string" },
  },
};

/** Contextual gloss from Claude (cached). */
export async function claudeGloss(word, sentence) {
  const key = hashtext(`${word}|${sentence}`);
  const hit = scalar("SELECT data FROM gloss_cache WHERE key = ?", [key]);
  if (hit) return JSON.parse(hit);
  const dictHint = lookup(word).slice(0, 3).map((d) => `${d.lemma} (${d.pos}): ${d.gloss}`).join(" | ");
  const g = await structured({
    system: "You are a concise French-English learner's dictionary that explains words in context for an intermediate learner.",
    user: `Word: ${word}\nSentence: ${sentence}\nDictionary hints: ${dictHint || "(none)"}`,
    schema: GLOSS_SCHEMA,
    fast: true,
    maxTokens: 1000,
  });
  run("INSERT OR REPLACE INTO gloss_cache(key, data) VALUES (?, ?)", [key, JSON.stringify(g)]);
  return g;
}

export const canUseClaude = hasKey;

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
export function saveWord({ word, sentence, textId, g }) {
  const existing = get("SELECT id FROM item WHERE kind = 'word' AND lemma = ?", [g.lemma]);
  if (existing) return { itemId: existing.id, created: false };
  const note = [g.note, g.example_fr && `${g.example_fr} — ${g.example_en}`].filter(Boolean).join(" · ");
  const at = Date.now();
  const itemId = run(
    "INSERT INTO item(kind, lemma, front, back, context, context_en, note, text_id, created_at) VALUES ('word',?,?,?,?,?,?,?,?)",
    [g.lemma, displayLemma(g.lemma, g.pos, g.gender), g.lemma_meaning, sentence.replace(word, `[[${word}]]`), g.sentence_en || null, note || null, textId ?? null, at],
  );
  addCard(itemId, "recog", at);
  return { itemId, created: true };
}

export const savedLemmas = () => new Set(all("SELECT lemma FROM item WHERE kind = 'word'").map((r) => r.lemma));

// ---------- writing prompt ----------

export function promptOfTheDay(date = localDate()) {
  const [y, m, d] = date.split("-").map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return PROMPTS[day % PROMPTS.length];
}
