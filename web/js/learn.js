// Learn: new-word discovery, conjugation drills, pronunciation (free, offline).
import { all, get, run, scalar } from "./db.js";
import { addCard } from "./srs.js";
import { saveWord } from "./content.js";

// ---------- verbs & conjugation ----------

let verbs = null;
export async function loadVerbs(url = "dict/verbs.json") {
  verbs ??= await fetch(url).then((r) => r.json());
  return verbs;
}
export const setVerbs = (v) => (verbs = v); // tests
export const verbByInf = (inf) => verbs?.find((v) => v.inf === inf);

export const TENSES = {
  present: "Présent",
  passe_compose: "Passé composé",
  imparfait: "Imparfait",
  futur: "Futur simple",
  conditionnel: "Conditionnel",
  subjonctif: "Subjonctif",
  imperatif: "Impératif",
};
const SUBJECTS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"];
const REFLEXIVE = ["me", "te", "se", "nous", "vous", "se"];
const ETRE_PRESENT = ["suis", "es", "est", "sommes", "êtes", "sont"];
const AVOIR_PRESENT = ["ai", "as", "a", "avons", "avez", "ont"];
const VOWEL = /^[aeiouyhâàéèêîïôœù]/i;

/** The forms for one tense, as [je, tu, il, nous, vous, ils] (imperative: [tu, nous, vous]); null = doesn't exist. */
export function forms(verb, tense) {
  if (tense === "imperatif" && verb.reflexive) return verb.t.imperatif?.map((f, i) => f && `${f}-${["toi", "nous", "vous"][i]}`) || null;
  if (tense !== "passe_compose") return verb.t[tense] || null;
  const etre = verb.aux[0] === "être" || verb.reflexive;
  const pp = verb.pp;
  return (etre ? ETRE_PRESENT : AVOIR_PRESENT).map((aux, i) =>
    verb.t.present?.[i] == null ? null : `${aux} ${pp}${etre ? (i < 3 ? "(e)" : "(e)s") : ""}`);
}

/**
 * What goes before the answer: subject (+ reflexive pronoun), with French elision.
 * "j'" + aime, "je me" + lève, "il s'" + est levé, "que j'" + aille, "qu'il" + aille.
 */
export function subjectFor(verb, tense, person, form) {
  if (tense === "imperatif") return "";
  const vowelNext = VOWEL.test(form.split(" ")[0]);
  let pronoun = "";
  if (verb.reflexive) {
    const pr = REFLEXIVE[person];
    pronoun = vowelNext && (pr === "me" || pr === "te" || pr === "se") ? `${pr[0]}'` : `${pr} `;
  }
  let subj = person === 0 && !verb.reflexive && vowelNext ? "j'" : `${SUBJECTS[person]} `;
  if (tense === "subjonctif") subj = (person === 2 || person === 5 ? "qu'" : "que ") + subj;
  return subj + pronoun;
}

/** Imperative person labels. */
export const IMPERATIVE_LABELS = ["(tu)", "(nous)", "(vous)"];

/** Pick a random drill question from the chosen verbs/tenses. */
export function question(verbList, tenses, rand = Math.random) {
  for (let tries = 0; tries < 50; tries++) {
    const verb = verbList[Math.floor(rand() * verbList.length)];
    const tense = tenses[Math.floor(rand() * tenses.length)];
    const f = forms(verb, tense);
    if (!f) continue;
    const options = f.map((x, i) => [x, i]).filter(([x]) => x != null);
    if (!options.length) continue;
    const [answer, person] = options[Math.floor(rand() * options.length)];
    return { verb, tense, person, answer };
  }
  return null;
}

const norm = (s) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
const bare = (s) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Every acceptable spelling of an answer: "suis allé(e)" -> suis allé / allée; "(e)s" -> allés / allées. */
export function acceptable(answer) {
  if (!answer.includes("(e)")) return [answer];
  const base = answer.replace(/\(e\)s$/, "").replace(/\(e\)$/, "");
  return answer.endsWith("(e)s") ? [`${base}s`, `${base}es`] : [base, `${base}e`];
}

/** "ok" | "accent" (right apart from accents) | "wrong". Pronouns typed by habit are ignored. */
export function checkConj(q, typed) {
  const prefix = norm(subjectFor(q.verb, q.tense, q.person, q.answer));
  let t = norm(typed);
  if (prefix && t.startsWith(prefix)) t = t.slice(prefix.length).trim();
  const answers = acceptable(q.answer).map(norm);
  if (answers.includes(t)) return "ok";
  if (answers.map(bare).includes(bare(t))) return "accent";
  return "wrong";
}

export const promptText = (q) =>
  q.tense === "imperatif" ? `${IMPERATIVE_LABELS[q.person]}` : SUBJECTS[q.person];
export const verbLabel = (v) => (v.reflexive ? (VOWEL.test(v.inf) ? `s'${v.inf}` : `se ${v.inf}`) : v.inf);

const PRONOUN = /^(se |s'|je |j'|tu |il |elle |on |nous |vous |ils |elles )/;

/** Verbs matching what was typed: an infinitive ("etre", "se lever") or any conjugated form ("suis" -> être, suivre). */
export function findVerbs(typed) {
  const refl = /^(se |s')/.test(bare(typed));
  const q = bare(typed).replace(PRONOUN, "");
  if (!q || !verbs) return [];
  const exact = verbs.filter((v) => bare(v.inf) === q);
  if (exact.length) return exact.length > 1 && exact.some((v) => !!v.reflexive === refl) ? exact.filter((v) => !!v.reflexive === refl) : exact;
  return verbs.filter((v) => bare(v.pp) === q || Object.values(v.t).some((f) => f.some((x) => x && bare(x) === q)));
}

/** A missed conjugation becomes a review card ("nous · aller · imparfait" -> "nous allions"). */
export function saveConjMistake(q) {
  const front = `${verbLabel(q.verb)} · ${TENSES[q.tense]} · ${promptText(q)}`;
  const existing = get("SELECT id FROM item WHERE kind = 'conj' AND front = ?", [front]);
  if (existing) return existing.id;
  const at = Date.now();
  const full = `${subjectFor(q.verb, q.tense, q.person, q.answer)}${q.answer}`.trim();
  const id = run("INSERT INTO item(kind, lemma, front, back, note, created_at) VALUES ('conj',?,?,?,?,?)", [
    q.verb.inf, front, full, q.verb.gloss, at,
  ]);
  addCard(id, "recog", at);
  return id;
}

// ---------- new words ----------

/** Word-rank ranges per level (rank = position in the frequency-ordered dictionary). */
export const BANDS = { A1: [0, 800], A2: [800, 2000], B1: [2000, 4000], B2: [4000, 8000], C1: [8000, 16000] };
const CONTENT_POS = new Set(["noun", "verb", "adj", "adv", "phrase"]); // grammar words are covered in Tips

/**
 * Next words to discover at a level: in frequency order, not saved, not marked known,
 * skipping function words and forms that double as inflections ("est", "été").
 */
export function newWords(dict, level, { verbsOnly = false, limit = 10 } = {}) {
  const [from, to] = BANDS[level] || BANDS.B1;
  const skip = new Set([
    ...all("SELECT lemma FROM item WHERE kind = 'word' AND lemma IS NOT NULL").map((r) => r.lemma),
    ...all("SELECT lemma FROM known_word").map((r) => r.lemma),
  ]);
  const out = [];
  const keys = Object.keys(dict.l);
  for (let i = from; i < Math.min(to, keys.length) && out.length < limit; i++) {
    const lemma = keys[i];
    // dict.f[lemma] = it's also an inflected form of something ("est" → être): skip, it'd be misleading.
    if (skip.has(lemma) || dict.f[lemma] || !/^[a-zàâäæçéèêëîïôœùûüÿ-]+$/.test(lemma)) continue;
    const senses = dict.l[lemma].filter(([pos]) => CONTENT_POS.has(pos) && (!verbsOnly || pos === "verb"));
    if (!senses.length) continue;
    out.push({ lemma, rank: i, senses });
  }
  return out;
}

export const markKnown = (lemma) => run("INSERT OR IGNORE INTO known_word(lemma, created_at) VALUES (?, ?)", [lemma, Date.now()]);
export const knownCount = () => scalar("SELECT COUNT(*) FROM known_word");

export function learnWord(entry) {
  const [pos, gender, gloss, ex_fr, ex_en] = entry.senses[0];
  return saveWord({
    word: entry.lemma,
    sentence: ex_fr || entry.lemma,
    textId: null,
    g: { lemma: entry.lemma, pos, gender, lemma_meaning: gloss, sentence_en: ex_en || null },
  });
}

// ---------- pronunciation (phone's built-in French voice; free) ----------

let voice;
function frenchVoice() {
  if (voice !== undefined) return voice;
  const vs = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("fr"));
  voice = vs.find((v) => /fr[-_]FR/i.test(v.lang) && /premium|enhanced|amélie|thomas|google/i.test(v.name)) || vs.find((v) => /fr[-_]FR/i.test(v.lang)) || vs[0] || null;
  return voice;
}
export const canSpeak = () => typeof speechSynthesis !== "undefined";
export function speak(text, rate = 0.9) {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  u.rate = rate;
  const v = frenchVoice();
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
/** Read several texts one after another; onStart(i) fires as each begins, onDone when finished or stopped. */
let seq = 0;
export function speakSequence(texts, { onStart = () => {}, onDone = () => {}, rate = 0.9 } = {}) {
  if (!canSpeak()) return onDone();
  speechSynthesis.cancel();
  const run = ++seq;
  const next = (i) => {
    if (run !== seq) return;
    if (i >= texts.length) return onDone();
    const u = new SpeechSynthesisUtterance(texts[i]);
    u.lang = "fr-FR";
    u.rate = rate;
    const v = frenchVoice();
    if (v) u.voice = v;
    u.onstart = () => run === seq && onStart(i);
    u.onend = () => next(i + 1);
    u.onerror = () => run === seq && onDone();
    speechSynthesis.speak(u);
  };
  next(0);
}
export function stopSpeaking() {
  seq++;
  if (canSpeak()) speechSynthesis.cancel();
}

if (typeof speechSynthesis !== "undefined") speechSynthesis.onvoiceschanged = () => (voice = undefined);


// ---------- typed answers in Review/Drill ----------

const loose = (s) => norm(s.replace(/[.,!?;:…«»"“”]+/g, " "));

/** Compare a typed answer with the accepted answers: "ok" | "accent" | "wrong". Case and punctuation don't matter. */
export function checkTyped(accepted, typed) {
  const t = loose(typed);
  if (!t) return "wrong";
  const answers = accepted.map(loose);
  if (answers.includes(t)) return "ok";
  if (answers.map(bare).includes(bare(t))) return "accent";
  return "wrong";
}

/** Accepted answers for a fix-the-mistake card: the corrected bit, or the whole corrected sentence. */
export function fixAnswers(back) {
  const part = back.match(/\[\[(.*?)\]\]/)?.[1];
  const whole = back.replace(/\[\[|\]\]/g, "");
  return part != null ? [part, whole] : [whole];
}

const SUBJECT = /^(?:que |qu')?(?:je |j'|tu |il\/elle |nous |vous |ils\/elles )(?:me |m'|te |t'|se |s'|nous |vous )?/;
/** Accepted answers for a conjugation card ("nous allions"): with or without the subject, any agreement. */
export function conjAnswers(back) {
  const full = acceptable(back);
  return [...full, ...full.map((f) => f.replace(SUBJECT, ""))];
}

const SMALL = new Set("le la les l' un une des du de d' à au aux en y ne n' pas me te se lui leur nous vous il elle on que qu' et ou".split(" "));
const toWords = (s) => loose(s).replace(/'/g, "' ").split(" ").filter(Boolean);
const q = (w) => `« ${w.trim()} »`;

/**
 * Local (free) grading of a fix-the-mistake answer: {verdict: "ok"|"almost"|"wrong", note}.
 * One word off (missing, extra or different, e.g. a forgotten "une") counts as "almost", with a note saying which.
 */
export function gradeFix(back, typed) {
  const accepted = fixAnswers(back);
  const basic = checkTyped(accepted, typed);
  if (basic === "ok") return { verdict: "ok", note: "" };
  if (basic === "accent") return { verdict: "almost", note: "Check the accents." };
  const t = toWords(typed);
  if (!t.length) return { verdict: "wrong", note: "" };
  for (const a of accepted) {
    const e = toWords(a);
    // longest common subsequence on accent-free words
    const n = e.length, m = t.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = bare(e[i]) === bare(t[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const missing = [], extra = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && bare(e[i]) === bare(t[j])) { i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) extra.push(t[j++]);
      else missing.push(e[i++]);
    }
    if (n < 2 || missing.length + extra.length === 0) continue;
    if (missing.length === 1 && extra.length === 0) return { verdict: "almost", note: `You missed ${q(missing[0])}.` };
    if (missing.length === 0 && extra.length === 1) return { verdict: "almost", note: `${q(extra[0])} isn't needed.` };
    if (missing.length === 1 && extra.length === 1 && (SMALL.has(missing[0]) || SMALL.has(extra[0]) || bare(missing[0]).slice(0, 4) === bare(extra[0]).slice(0, 4)))
      return { verdict: "almost", note: `${q(extra[0])} → ${q(missing[0])}.` };
  }
  return { verdict: "wrong", note: "" };
}
