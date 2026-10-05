// French -> English translations. Claude (Haiku) when there's a key: accurate and very cheap for short
// texts. MyMemory (free, crowd-sourced, often odd: "copain" -> "for you my friend") is only the fallback.
import { kvGet, run, scalar } from "./db.js";
import { hashtext } from "./util.js";
import { ClaudeError, hasKey, structured } from "./claude.js";

export class TranslateError extends Error {}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const decode = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
  ENTITIES[e.toLowerCase()] ?? (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m));

const cacheGet = (key) => {
  const hit = scalar("SELECT data FROM gloss_cache WHERE key = ?", [key]);
  return hit ? JSON.parse(hit) : null;
};
const cacheSet = (key, data) => run("INSERT OR REPLACE INTO gloss_cache(key, data) VALUES (?, ?)", [key, JSON.stringify(data)]);

/** A word or short expression (gets meanings + a dictionary lookup), rather than a sentence (gets a translation). */
export const isShort = (text) => text.trim().split(/\s+/).length <= 2 && !/[.!?…]$/.test(text.trim());

// Bump when the prompt changes, so old cached answers are asked again.
const PROMPT_VERSION = 2;

const WORD_PROMPT = (text) => `French word or expression, typed by a learner (accents may be missing, may have typos): ${text}
- fr: the correctly spelled French they meant (fix accents, typos, apostrophes); as typed if already correct.
- en: its common English meaning(s), most common first, separated by "; " (at most 3). No articles for nouns. If it's a conjugated verb form, translate that form and name the infinitive, e.g. "(I) am — être; (I) follow — suivre".
- literal: if it's an idiom whose word-for-word meaning differs, that literal meaning in English; otherwise "".`;

const SENTENCE_PROMPT = (text) => `French text, possibly typed by a learner (accents may be missing, may have typos):
${text}
- fr: the text with spelling, accents and apostrophes fixed; don't change the wording or grammar. As given if already correct.
- en: a natural English translation.
- literal: if it contains an idiom, its word-for-word meaning, e.g. "poser un lapin: lit. 'to put a rabbit'"; otherwise "".`;

/**
 * French -> English as {fr, en, literal}: `fr` is the input with typos/accents fixed, `literal` explains idioms (or "").
 * Cached forever. Uses Claude if there's a key, else (or if Claude fails) MyMemory, which only fills `en`.
 */
export async function translateFull(text, opts = {}) {
  if (hasKey()) {
    const key = hashtext(`cl${PROMPT_VERSION}|${text}`);
    const hit = cacheGet(key);
    if (hit) return hit;
    try {
      const res = await structured({
        system: "You translate French into natural English for a learner. Be accurate and idiomatic; never add commentary.",
        user: isShort(text) ? WORD_PROMPT(text) : SENTENCE_PROMPT(text),
        schema: { type: "object", properties: { fr: { type: "string" }, en: { type: "string" }, literal: { type: "string" } } },
        purpose: "translate",
        maxTokens: 600,
      });
      const out = { fr: res.fr.trim() || text, en: res.en, literal: res.literal.trim() };
      cacheSet(key, out);
      return out;
    } catch (e) {
      if (!(e instanceof ClaudeError)) throw e;
      console.warn("Claude translation failed, using MyMemory", e);
    }
  }
  return { fr: text, en: await myMemory(text, opts), literal: "" };
}

/** French -> English, natural (just the English). */
export const translate = async (text, opts) => (await translateFull(text, opts)).en;

/** Free fallback: MyMemory. ~5,000 characters/day anonymous, ~50,000 with an email (Settings). */
async function myMemory(text, { fetchImpl = fetch } = {}) {
  const key = hashtext(`mm|${text}`);
  const hit = cacheGet(key);
  if (hit) return hit.en;

  const params = new URLSearchParams({ q: text.slice(0, 500), langpair: "fr|en" });
  const email = kvGet("mymemory_email", "");
  if (email) params.set("de", email);
  let data;
  try {
    const resp = await fetchImpl(`https://api.mymemory.translated.net/get?${params}`);
    data = await resp.json();
  } catch {
    throw new TranslateError("Translation service unreachable (offline?)");
  }
  const raw = data?.responseData?.translatedText;
  const en = raw && decode(raw);
  if (data?.quotaFinished || data?.responseStatus !== 200 || !en || /MYMEMORY WARNING/i.test(en)) {
    throw new TranslateError("Free translation limit reached for today");
  }
  cacheSet(key, { en });
  return en;
}

/** Longer texts: translate in chunks of whole sentences (the free API takes ≤500 characters per request). */
export async function translateLong(text, opts) {
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["»”)]*|$)\s*/g) || [text];
  const chunks = [];
  for (const s of sentences) {
    if (chunks.length && (chunks.at(-1) + s).length <= 450) chunks[chunks.length - 1] += s;
    else chunks.push(s);
  }
  const out = [];
  for (const c of chunks.filter((c) => c.trim())) out.push(await translate(c.trim(), opts));
  return out.join(" ");
}
