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
  return hit ? JSON.parse(hit).en : null;
};
const cacheSet = (key, en) => run("INSERT OR REPLACE INTO gloss_cache(key, data) VALUES (?, ?)", [key, JSON.stringify({ en })]);

/** French -> English, natural. Cached forever. Uses Claude if there's a key, else (or if Claude fails) MyMemory. */
export async function translate(text, opts = {}) {
  if (hasKey()) {
    const key = hashtext(`cl|${text}`);
    const hit = cacheGet(key);
    if (hit) return hit;
    try {
      const single = text.trim().split(/\s+/).length <= 3 && !/[.!?]$/.test(text.trim());
      const res = await structured({
        system: "You translate French into natural English for a learner. Be accurate and idiomatic; never add commentary.",
        user: single
          ? `Word or expression: ${text}\nGive its common English meaning(s), most common first, separated by "; " (at most 3). For nouns don't add articles.`
          : `Translate naturally into English:\n${text}`,
        schema: { type: "object", properties: { translation: { type: "string" } } },
        purpose: "translate",
        maxTokens: 600,
      });
      cacheSet(key, res.translation);
      return res.translation;
    } catch (e) {
      if (!(e instanceof ClaudeError)) throw e;
      console.warn("Claude translation failed, using MyMemory", e);
    }
  }
  return myMemory(text, opts);
}

/** Free fallback: MyMemory. ~5,000 characters/day anonymous, ~50,000 with an email (Settings). */
async function myMemory(text, { fetchImpl = fetch } = {}) {
  const key = hashtext(`mm|${text}`);
  const hit = scalar("SELECT data FROM gloss_cache WHERE key = ?", [key]);
  if (hit) return JSON.parse(hit).en;

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
  run("INSERT OR REPLACE INTO gloss_cache(key, data) VALUES (?, ?)", [key, JSON.stringify({ en })]);
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
