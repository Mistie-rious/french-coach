"""Build web/dict/fr-en.json from Wiktionary (kaikki.org extract) + a frequency list.

Dev-only, stdlib only. Usage:
    curl -O https://kaikki.org/dictionary/French/kaikki.org-dictionary-French.jsonl.gz
    curl -O https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt
    python3 tools/build_dict.py kaikki.org-dictionary-French.jsonl.gz fr_50k.txt

Output: {"l": {lemma: [[pos, gender, gloss, ex_fr, ex_en], ...]}, "f": {form: [lemma, ...]}}
Dictionary data: Wiktionary contributors, CC BY-SA 4.0.
"""

import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

POS = {"noun": "noun", "verb": "verb", "adj": "adj", "adv": "adv", "prep": "prep", "pron": "pron", "det": "det",
       "conj": "conj", "intj": "intj", "num": "num", "phrase": "phrase", "prep_phrase": "phrase", "article": "det",
       "particle": "particle", "contraction": "contraction"}
MAX_SENSES = 3
JUNK = re.compile(r"^(archaic|obsolete|nonstandard|alternative|dated|rare|eye dialect|misspelling|pre-\d+ spelling)\b.*\b(spelling|form|of)\b", re.I)


def clean(gloss: str) -> str:
    gloss = re.sub(r"\s+", " ", gloss).strip()
    return gloss[:120]


def main(dump: str, freq_path: str, out: str = "web/dict/fr-en.json") -> None:
    freq = {}
    for i, line in enumerate(Path(freq_path).read_text().splitlines()):
        w = line.split(" ")[0]
        freq.setdefault(w, i)
    wanted_forms = set(freq)

    lemmas: dict[str, list] = defaultdict(list)
    forms: dict[str, set] = defaultdict(set)

    with gzip.open(dump, "rt") as f:
        for line in f:
            e = json.loads(line)
            if e.get("lang_code") != "fr":
                continue
            word, pos = e.get("word", ""), POS.get(e.get("pos", ""))
            if not word or not pos:
                continue
            senses = e.get("senses", [])
            form_of = [t["word"] for s in senses for t in s.get("form_of", []) if t.get("word")]
            real = [
                s for s in senses
                if not s.get("form_of") and s.get("glosses") and "form-of" not in s.get("tags", [])
                and not JUNK.match(s["glosses"][-1]) and not {"obsolete", "archaic"} & set(s.get("tags", []))
            ]

            if form_of and not real:
                if word in wanted_forms:
                    forms[word.lower()].update(t for t in form_of if " " not in t and "'" not in t)
                continue
            if not real:
                continue

            gender = None
            if pos == "noun":
                args = (e.get("head_templates") or [{}])[0].get("args", {})
                g = args.get("1", "") or args.get("g", "")
                gender = "m" if g.startswith("m") else "f" if g.startswith("f") else None
            gloss = "; ".join(dict.fromkeys(clean(s["glosses"][-1]) for s in real[:MAX_SENSES]))
            ex_fr = ex_en = ""
            for s in real:
                for ex in s.get("examples", []):
                    en = ex.get("english") or ex.get("translation")
                    if en and ex.get("text") and len(ex["text"]) < 120:
                        ex_fr, ex_en = ex["text"], en
                        break
                if ex_fr:
                    break
            lemmas[word].append([pos, gender, gloss, ex_fr, ex_en])
            for fm in (e.get("forms", []) if " " not in word and "'" not in word else []):
                form = fm.get("form", "")
                if form and form != word and form in wanted_forms and " " not in form:
                    forms[form.lower()].add(word)

    # Keep lemmas that are frequent themselves or are the target of a frequent form.
    targets = {l for ls in forms.values() for l in ls}
    keep = {l for l in lemmas if l.lower() in freq or l in targets}
    out_l = {l: lemmas[l] for l in keep}
    out_f = {f: sorted(ls & keep, key=lambda l: freq.get(l, 10**9)) for f, ls in forms.items()}
    out_f = {f: ls for f, ls in out_f.items() if ls and ls != [f]}

    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps({"l": out_l, "f": out_f}, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(out_l)} lemmas, {len(out_f)} forms -> {out} ({Path(out).stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main(*sys.argv[1:])
