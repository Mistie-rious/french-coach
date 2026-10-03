// Free sentence translation via MyMemory (mymemory.translated.net) — no key needed.
// Anonymous: ~5,000 characters/day. Adding an email in Settings raises it to ~50,000/day.
import { kvGet, run, scalar } from "./db.js";
import { hashtext } from "./util.js";

export class TranslateError extends Error {}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const decode = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
  ENTITIES[e.toLowerCase()] ?? (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m));

/** French -> English. Cached forever in gloss_cache. */
export async function translate(text, { fetchImpl = fetch } = {}) {
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
