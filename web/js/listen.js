// Listening: dictation with native-speaker recordings from Tatoeba (tatoeba.org).
// Sentences: CC BY 2.0 FR. Audio: per-recording licence (shown with the attribution).
import { get, run, scalar, tx } from "./db.js";
import { addCard } from "./srs.js";
import { dayStart } from "./util.js";

const API = "https://api.tatoeba.org/v1/sentences";
export const audioUrl = (audioId) => `https://tatoeba.org/audio/download/${audioId}`;
export const DAILY_GOAL = 5;

/** Sentence length (words) per level. */
const WORDS = { A1: "3-6", A2: "4-8", B1: "6-11", B2: "8-15", C1: "10-20" };

/** A batch of random French sentences with audio + an English translation. */
export async function fetchBatch(level, limit = 10) {
  const params = new URLSearchParams({
    lang: "fra", has_audio: "yes", sort: "random", limit: String(limit), include: "audios",
    showtrans: "matching", "trans:lang": "eng", word_count: WORDS[level] || WORDS.B1,
  });
  let resp;
  try {
    resp = await fetch(`${API}?${params}`);
  } catch {
    throw new Error("Can't reach Tatoeba (offline?)");
  }
  if (!resp.ok) throw new Error(`Tatoeba error ${resp.status}`);
  const { data } = await resp.json();
  return data
    .filter((s) => s.audios?.length && s.translations?.length)
    .map((s) => {
      const a = s.audios[0];
      const en = s.translations.find((t) => t.is_direct) || s.translations[0];
      return {
        id: s.id,
        text: s.text,
        en: en.text,
        audio: { url: audioUrl(a.id), author: a.author, license: a.license, profile: a.attribution_url },
      };
    });
}

// ---------- comparing what was typed with what was said ----------

const words = (s) =>
  s.replace(/[’`]/g, "'").replace(/'/g, "' ").toLowerCase()
    .split(/[^a-zà-öø-ÿœæ0-9']+/i).map((w) => w.trim()).filter(Boolean);
const bare = (w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Align typed words to expected words (LCS on accent-insensitive forms).
 * Returns {tokens: [{w, status: "ok"|"accent"|"miss"}], extra: [...], score}.
 * "accent" = right word, wrong/missing accent (counts half).
 */
export function compare(expected, typed) {
  const E = words(expected);
  const T = words(typed);
  const n = E.length, m = T.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = bare(E[i]) === bare(T[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const tokens = [];
  const extra = [];
  let i = 0, j = 0;
  while (i < n) {
    if (j < m && bare(E[i]) === bare(T[j])) {
      tokens.push({ w: E[i], status: E[i] === T[j] ? "ok" : "accent" });
      i++; j++;
    } else if (j < m && L[i][j + 1] >= L[i + 1][j]) {
      extra.push(T[j++]);
    } else {
      tokens.push({ w: E[i++], status: "miss" });
    }
  }
  extra.push(...T.slice(j));
  const points = tokens.reduce((p, t) => p + (t.status === "ok" ? 1 : t.status === "accent" ? 0.5 : 0), 0);
  const score = n ? Math.max(0, (points - 0.5 * extra.length) / n) : 1;
  return { tokens, extra, score: Math.round(score * 100) / 100 };
}

// ---------- persistence ----------

/** Log an attempt; anything short of perfect becomes a listening review card. Returns {itemId|null}. */
export function recordAttempt(sentence, typed, score) {
  return tx(() => {
    run("INSERT INTO listen_log(tatoeba_id, text, typed, score, created_at) VALUES (?,?,?,?,?)", [sentence.id, sentence.text, typed, score, Date.now()]);
    if (score >= 1) return { itemId: null };
    return { itemId: saveDictation(sentence).itemId };
  });
}

export function saveDictation(sentence) {
  const existing = get("SELECT id FROM item WHERE kind = 'dictation' AND front = ?", [sentence.text]);
  if (existing) return { itemId: existing.id, created: false };
  const at = Date.now();
  const itemId = run("INSERT INTO item(kind, front, back, audio, created_at) VALUES ('dictation',?,?,?,?)", [
    sentence.text, sentence.en, JSON.stringify(sentence.audio), at,
  ]);
  addCard(itemId, "listen", at);
  return { itemId, created: true };
}

export const listenedToday = () => scalar("SELECT COUNT(*) FROM listen_log WHERE created_at >= ?", [dayStart()]);
