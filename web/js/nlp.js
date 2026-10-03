// Tokenising French text + offline dictionary lookup (Wiktionary-derived, see tools/build_dict.py).

const L = "A-Za-zÀ-ÖØ-öø-ÿŒœÆæ";
const ELISIONS = { l: "le", d: "de", j: "je", m: "me", n: "ne", s: "se", t: "te", c: "ce", qu: "que", jusqu: "jusque", lorsqu: "lorsque", puisqu: "puisque", quoiqu: "quoique" };
const KEEP_APOS = new Set(["aujourd'hui", "prud'homme", "presqu'île", "quelqu'un", "quelqu'une"]);

// word (letters, inner hyphens/apostrophes) | anything else
const TOKEN_RE = new RegExp(`[${L}]+(?:[-'’][${L}]+)*|[^${L}]+`, "g");
const WORD_START = new RegExp(`^[${L}]`);

/** Split one word token on elision apostrophes: "l'homme" -> ["l'", "homme"], "aujourd'hui" stays. */
function splitElision(word) {
  const norm = word.replace(/’/g, "'");
  if (KEEP_APOS.has(norm.toLowerCase())) return [word];
  const m = norm.match(/^([A-Za-z]+)'(.+)$/);
  if (m && ELISIONS[m[1].toLowerCase()]) {
    const cut = m[1].length + 1;
    return [word.slice(0, cut), ...splitElision(word.slice(cut))];
  }
  return [word];
}

/** Sentences of tokens: [{text, tokens: [{t, w}]}]; concatenating every t reproduces the input. */
export function tokenize(text) {
  // A sentence ends at . ! ? … (plus closing quotes) or a line break, and keeps its trailing whitespace.
  const parts = text.match(/[^.!?…\n]*(?:[.!?…]+["»”)\]]*|\n|$)\s*/g).filter(Boolean);
  return parts.map((s) => {
    const tokens = [];
    for (const piece of s.match(TOKEN_RE) || []) {
      if (WORD_START.test(piece)) splitElision(piece).forEach((t) => tokens.push({ t, w: true }));
      else tokens.push({ t: piece, w: false });
    }
    return { text: s.trim(), tokens };
  });
}

// ---- dictionary ----
let dict = null;
let loading = null;

export function loadDict(url = "dict/fr-en.json") {
  loading ??= fetch(url).then((r) => r.json()).then((d) => (dict = d));
  return loading;
}
export const setDict = (d) => (dict = d); // tests

const norm = (w) => w.replace(/’/g, "'").toLowerCase();

/** Candidate lemmas for a surface word, most likely first. */
export function lemmaCandidates(word) {
  const w = norm(word);
  if (w.endsWith("'")) return [ELISIONS[w.slice(0, -1)] || w.slice(0, -1)];
  if (!dict) return [w];
  const out = [];
  const add = (l) => l && !out.includes(l) && out.push(l);
  // A word can be both a lemma and an inflected form (marché: noun / marcher).
  (dict.f[w] || []).forEach(add);
  if (dict.l[w]) add(w);
  if (!out.length && w.includes("-")) {
    const head = w.split("-")[0]; // inversion: "dit-il" -> "dit"
    (dict.f[head] || []).forEach(add);
    if (dict.l[head]) add(head);
  }
  if (!out.length) add(w);
  return out;
}

/** [{lemma, pos, gender, gloss, ex_fr, ex_en}] for each candidate lemma that's in the dictionary. */
export function lookup(word) {
  if (!dict) return [];
  return lemmaCandidates(word).flatMap((lemma) =>
    (dict.l[lemma] || []).map(([pos, gender, gloss, ex_fr, ex_en]) => ({ lemma, pos, gender, gloss, ex_fr, ex_en })),
  );
}
