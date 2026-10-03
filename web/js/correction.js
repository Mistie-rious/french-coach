// Writing correction. Claude is the corrector; LanguageTool is the fallback when there's
// no key or Claude fails. Every error becomes a 'mistake' review card.
// Speak (later) reuses correct() on transcripts.
import { structured, hasKey, ClaudeError } from "./claude.js";
import { run, tx } from "./db.js";
import { addCard } from "./srs.js";
import { tokenize } from "./nlp.js";

export const CATEGORIES = [
  "agreement", "gender", "verb_tense", "conjugation", "mood", "prepositions", "articles",
  "pronouns", "word_order", "negation", "spelling", "vocabulary", "register", "punctuation", "other",
];

export async function languagetool(text) {
  const resp = await fetch("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text, language: "fr" }),
  });
  if (!resp.ok) throw new Error(`LanguageTool ${resp.status}`);
  const data = await resp.json();
  return data.matches.map((m) => ({
    offset: m.offset,
    length: m.length,
    original: text.slice(m.offset, m.offset + m.length),
    suggestion: m.replacements?.[0]?.value ?? "",
    message: m.message || "",
    rule: `${m.rule?.category?.id}/${m.rule?.id}`,
  }));
}

const LT_HINTS = [
  ["ACCORD", "agreement"], ["AGREEMENT", "agreement"], ["GENRE", "gender"], ["SUBJONCTIF", "mood"],
  ["CONJUG", "conjugation"], ["TEMPS", "verb_tense"], ["PREP", "prepositions"], ["TYPOS", "spelling"],
  ["DIACRITICS", "spelling"], ["CASING", "spelling"], ["PUNCT", "punctuation"], ["TYPOGRAPHY", "punctuation"],
];
/** Rough category for LanguageTool-only corrections. */
export function categoryFromLT(rule) {
  const r = rule.toUpperCase();
  return LT_HINTS.find(([needle]) => r.includes(needle))?.[1] ?? "other";
}

const SCHEMA = {
  type: "object",
  properties: {
    corrected_text: { type: "string", description: "The full text with all listed fixes applied" },
    errors: {
      type: "array",
      description: "In text order",
      items: {
        type: "object",
        properties: {
          original: { type: "string", description: "Exact substring copied verbatim from the learner's text, as short as possible while unambiguous" },
          suggestion: { type: "string", description: "Replacement for `original`" },
          category: { type: "string", enum: CATEGORIES },
          explanation: { type: "string", description: "1-2 sentences naming the rule, addressed to the learner" },
        },
      },
    },
    summary: { type: "string", description: "2-3 sentences of overall feedback: what went well, what to focus on next" },
  },
};

const SYSTEM = (level) => `You are a kind, precise French teacher correcting a CEFR ${level} learner's writing.
- Find every real error: spelling/accents, agreement, gender, conjugation, tense/mood choice, prepositions, articles, word order, and clearly unidiomatic phrasing.
- Fix what a ${level} learner should fix; don't rewrite for elegance and don't flag correct-but-different choices. Preserve the meaning.
- \`original\` must be copied exactly from the learner's text so it can be located; keep it as short as possible.
- Explanations in ${level.startsWith("A") ? "very simple English, one short sentence, with a mini example if helpful" : "concise English naming the rule"}.
- The summary is encouraging and names the one or two things to focus on.`;

/** Find `needle` in `text`, preferring at/after `from`; tolerant of whitespace/case. */
export function locate(text, needle, from = 0) {
  if (!needle) return -1;
  let pos = text.indexOf(needle, from);
  if (pos === -1) pos = text.indexOf(needle);
  if (pos === -1 && needle.trim()) {
    const re = new RegExp(needle.trim().split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");
    pos = text.search(re);
  }
  return pos;
}

/** The sentence containing `offset` as [start, end). */
export function sentenceSpan(text, offset) {
  let start = 0;
  for (const s of tokenize(text)) {
    const len = s.tokens.reduce((n, t) => n + t.t.length, 0);
    if (offset < start + len) {
      const lead = s.tokens.map((t) => t.t).join("").search(/\S/);
      return [start + Math.max(0, lead), start + len];
    }
    start += len;
  }
  return [0, text.length];
}

async function withClaude(text, prompt, level, claude) {
  const res = await claude({
    system: SYSTEM(level),
    user: `Prompt: ${prompt || "(free writing)"}\n\nLearner text:\n<<<\n${text}\n>>>`,
    schema: SCHEMA,
  });
  const errors = [];
  let cursor = 0;
  for (const e of res.errors) {
    const pos = locate(text, e.original, cursor);
    if (pos === -1) continue;
    cursor = pos + e.original.length;
    errors.push({ start: pos, end: pos + e.original.length, ...e });
  }
  return { grader: "claude", corrected: res.corrected_text, summary: res.summary, errors };
}

async function withLanguageTool(text, lt, why) {
  const matches = (await lt(text)).filter((m) => m.suggestion);
  let corrected = text;
  for (const m of [...matches].sort((a, b) => b.offset - a.offset)) {
    corrected = corrected.slice(0, m.offset) + m.suggestion + corrected.slice(m.offset + m.length);
  }
  return {
    grader: "lt_only",
    corrected,
    summary: `Checked by LanguageTool only (${why}), so explanations are basic and some errors may be missed.`,
    errors: matches.map((m) => ({
      start: m.offset, end: m.offset + m.length, original: m.original, suggestion: m.suggestion,
      category: categoryFromLT(m.rule), explanation: m.message,
    })),
  };
}

/** Correct, persist, and create mistake cards. Returns the submission id. */
export async function correct(text, prompt, { level = "B1", modality = "write", lt = languagetool, claude = structured, useClaude = hasKey() } = {}) {
  let result;
  if (useClaude) {
    try {
      result = await withClaude(text, prompt, level, claude);
    } catch (e) {
      if (!(e instanceof ClaudeError)) throw e;
      console.warn("Claude failed, falling back to LanguageTool", e);
      result = await withLanguageTool(text, lt, e.message).catch(() => {
        throw new Error(`Couldn't correct right now: ${e.message}, and LanguageTool is unreachable.`);
      });
    }
  } else {
    result = await withLanguageTool(text, lt, "no Claude key — add one in Settings for better corrections").catch(() => {
      throw new Error("Couldn't reach LanguageTool. Check your connection and try again.");
    });
  }

  const at = Date.now();
  return tx(() => {
    const subId = run("INSERT INTO submission(modality, prompt, raw_text, corrected_text, summary, grader, created_at) VALUES (?,?,?,?,?,?,?)", [
      modality, prompt || null, text, result.corrected, result.summary, result.grader, at,
    ]);
    for (const e of result.errors) {
      run("INSERT INTO error(submission_id, start, end, original, suggestion, category, explanation, created_at) VALUES (?,?,?,?,?,?,?,?)", [
        subId, e.start, e.end, e.original, e.suggestion, e.category, e.explanation, at,
      ]);
      const [s, end] = sentenceSpan(text, e.start);
      const sent = text.slice(s, end).trimEnd();
      const a = e.start - s;
      const b = e.end - s;
      const itemId = run("INSERT INTO item(kind, front, back, note, category, submission_id, created_at) VALUES ('mistake',?,?,?,?,?,?)", [
        `${sent.slice(0, a)}[[${sent.slice(a, b)}]]${sent.slice(b)}`,
        `${sent.slice(0, a)}[[${e.suggestion}]]${sent.slice(b)}`,
        e.explanation, e.category, subId, at,
      ]);
      addCard(itemId, "fix", at);
    }
    return subId;
  });
}
