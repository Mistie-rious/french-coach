// Writing correction: LanguageTool finds errors, Claude filters/adds/categorises/explains.
// Every error becomes a 'mistake' review card. Speak (later) reuses correct() on transcripts.
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

const SYSTEM = (level) => `You are a precise French teacher correcting a ${level} learner's writing.
You get the learner's text and LanguageTool's automatic matches.
- Keep LanguageTool's real errors; drop false positives and pure style preferences.
- Add errors it missed: tense/mood choice, prepositions, agreement, unidiomatic phrasing.
- Fix what a ${level} learner should fix; don't rewrite for elegance. Preserve the meaning.
- \`original\` must be copied exactly from the learner's text so it can be located.
- Explanations in English, concise, naming the rule (e.g. "past participle agrees with the subject after être").`;

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

/** Run the pipeline and persist. Returns the submission id. */
export async function correct(text, prompt, { level = "B1", modality = "write", lt = languagetool, claude = structured } = {}) {
  let matches = [];
  let ltOk = true;
  try {
    matches = await lt(text);
  } catch (e) {
    console.warn("LanguageTool failed", e);
    ltOk = false;
  }

  let grader, corrected, summary;
  const errors = [];
  try {
    if (!hasKey() && claude === structured) throw new ClaudeError("no API key");
    const lines = matches.map((m) => `- "${m.original}" -> "${m.suggestion}" [${m.rule}] ${m.message}`).join("\n") || "(none)";
    const res = await claude({
      system: SYSTEM(level),
      user: `Prompt: ${prompt || "(free writing)"}\n\nLearner text:\n<<<\n${text}\n>>>\n\nLanguageTool matches:\n${lines}`,
      schema: SCHEMA,
    });
    grader = ltOk ? "lt_claude" : "claude_only";
    corrected = res.corrected_text;
    summary = res.summary;
    let cursor = 0;
    for (const e of res.errors) {
      const pos = locate(text, e.original, cursor);
      if (pos === -1) continue;
      cursor = pos + e.original.length;
      errors.push({ start: pos, end: pos + e.original.length, ...e });
    }
  } catch (e) {
    if (!(e instanceof ClaudeError)) throw e;
    if (!ltOk) throw new Error(`Couldn't correct right now: LanguageTool is unreachable and Claude isn't available (${e.message}).`);
    grader = "lt_only";
    summary = hasKey() ? `Checked by LanguageTool only (${e.message}).` : "Checked by LanguageTool only. Add a Claude key in Settings for explanations and better corrections.";
    corrected = text;
    const usable = matches.filter((m) => m.suggestion);
    for (const m of [...usable].sort((a, b) => b.offset - a.offset)) {
      corrected = corrected.slice(0, m.offset) + m.suggestion + corrected.slice(m.offset + m.length);
    }
    for (const m of usable) {
      errors.push({ start: m.offset, end: m.offset + m.length, original: m.original, suggestion: m.suggestion, category: categoryFromLT(m.rule), explanation: m.message });
    }
  }

  const at = Date.now();
  return tx(() => {
    const subId = run("INSERT INTO submission(modality, prompt, raw_text, corrected_text, summary, grader, created_at) VALUES (?,?,?,?,?,?,?)", [
      modality, prompt || null, text, corrected, summary, grader, at,
    ]);
    for (const e of errors) {
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
