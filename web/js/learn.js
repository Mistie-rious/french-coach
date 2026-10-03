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
if (typeof speechSynthesis !== "undefined") speechSynthesis.onvoiceschanged = () => (voice = undefined);

