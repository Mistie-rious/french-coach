"""Build web/dict/fr-en.json and web/dict/verbs.json from Wiktionary (kaikki.org extract) + a frequency list.

Dev-only, stdlib only. Usage:
    curl -O https://kaikki.org/dictionary/French/kaikki.org-dictionary-French.jsonl.gz
    curl -O https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt
    python3 tools/build_dict.py kaikki.org-dictionary-French.jsonl.gz fr_50k.txt

fr-en.json: {"l": {lemma: [[pos, gender, gloss, ex_fr, ex_en], ...]}, "f": {form: [lemma, ...]}}
            "l" keys are in frequency order (most common first) — the app uses that order as the word rank.
verbs.json: [{"inf", "gloss", "aux": ["avoir"|"être"], "pp", "reflexive"?, "t": {tense: [je, tu, il, nous, vous, ils]}}]
            for CORE_VERBS, in that order. Imperative is [tu, nous, vous].
Dictionary data: Wiktionary contributors, CC BY-SA 4.0.
"""

from __future__ import annotations

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
# The verbs worth drilling, roughly in the order a learner needs them (hand-picked: corpus
# counts are too noisy — "suis" is also suivre, "monde" looks like a verb form, etc.).
# "se:lever" = reflexive (se lever); the app adds the pronouns and uses être.
CORE_VERBS = list(dict.fromkeys("""
être avoir aller faire dire pouvoir vouloir savoir devoir venir voir prendre mettre parler aimer
manger boire habiter travailler étudier acheter appeler finir choisir partir sortir dormir lire écrire
connaître croire comprendre apprendre attendre entendre répondre vendre perdre rendre descendre
penser trouver donner demander regarder écouter chercher jouer arriver entrer rester rentrer passer
tomber monter naître mourir devenir revenir tenir commencer continuer essayer payer envoyer
ouvrir offrir recevoir courir suivre vivre rire sourire conduire plaire falloir pleuvoir valoir
se:asseoir se:lever se:laver se:coucher se:réveiller se:habiller se:promener se:souvenir
laisser porter montrer oublier utiliser aider changer garder arrêter décider espérer préférer
sembler compter raconter expliquer rencontrer visiter voyager marcher nager danser chanter
cuisiner préparer nettoyer ranger fermer gagner dépenser coûter louer réserver commander
souhaiter rêver imaginer remarquer apporter emporter amener emmener retourner
reconnaître paraître disparaître permettre promettre remettre
battre craindre peindre éteindre atteindre rejoindre se:plaindre
construire détruire produire traduire cuire servir sentir mentir couvrir découvrir
souffrir obtenir appartenir retenir prévenir
réussir grandir grossir maigrir rougir réfléchir remplir obéir
se:occuper se:intéresser se:amuser se:ennuyer se:dépêcher se:tromper se:rappeler se:demander
se:sentir se:arrêter se:marier se:reposer se:taire se:battre
jeter lancer avancer placer partager bouger corriger diriger employer essuyer appuyer
mener lever enlever geler répéter célébrer considérer protéger
""".split()))
FRENCH_WORD = re.compile(r"^[a-zàâäæçéèêëîïôœùûüÿ'-]+$")
PERSON = {("first-person", "singular"): 0, ("second-person", "singular"): 1, ("third-person", "singular"): 2,
          ("first-person", "plural"): 3, ("second-person", "plural"): 4, ("third-person", "plural"): 5}
IMPERATIVE = {("second-person", "singular"): 0, ("first-person", "plural"): 1, ("second-person", "plural"): 2}


def tense_of(tags: set) -> str | None:
    if "indicative" in tags and "present" in tags:
        return "present"
    if "indicative" in tags and "imperfect" in tags:
        return "imparfait"
    if "indicative" in tags and "future" in tags:
        return "futur"
    if "conditional" in tags:
        return "conditionnel"
    if "subjunctive" in tags and "present" in tags:
        return "subjonctif"
    if "imperative" in tags:
        return "imperatif"
    return None


def conjugation(e: dict) -> dict | None:
    t: dict[str, list] = {}
    pp, aux = None, []
    for f in e.get("forms", []):
        tags, form = set(f.get("tags", [])), f.get("form", "")
        if "multiword-construction" in tags:
            if "infinitive" in tags:
                aux += [a for a in ("avoir", "être") if a in form and a not in aux]
            continue
        if "reflexive" in tags:  # "me souviens", "souviens-toi" -> "souviens"
            form = re.sub(r"^(?:(?:me|te|se|nous|vous) |[mts]')|-(?:toi|nous|vous)$", "", form)
        if form == "-" or not FRENCH_WORD.match(form):
            continue  # skips IPA and table junk
        if "infinitive" in tags and form in ("avoir", "être") and form not in aux:
            aux.append(form)  # "avoir or être" verbs list the plain auxiliary too
            continue
        if "participle" in tags and "past" in tags and not pp:
            pp = form
            continue
        tense = tense_of(tags)
        if not tense:
            continue
        person = next((v for k, v in (IMPERATIVE if tense == "imperatif" else PERSON).items() if set(k) <= tags), None)
        if person is None:
            continue
        slots = t.setdefault(tense, [None] * (3 if tense == "imperatif" else 6))
        if slots[person] is None:
            slots[person] = form
    if not pp or not any(t.get("present", [])):
        return None  # impersonal verbs (il faut, il pleut) keep None for the missing persons
    if e.get("word") in ("avoir", "être", "falloir"):
        aux = ["avoir"]  # j'ai eu, j'ai été, il a fallu
    return {"aux": aux or ["avoir"], "pp": pp, "t": t}
JUNK = re.compile(r"^(archaic|obsolete|nonstandard|alternative|dated|rare|eye dialect|misspelling|pre-\d+ spelling)\b.*\b(spelling|form|of)\b", re.I)


def clean(gloss: str) -> str:
    gloss = re.sub(r"\s+", " ", gloss).strip()
    return gloss[:120]


def main(dump: str, freq_path: str, out: str = "web/dict/fr-en.json") -> None:
    freq, counts = {}, {}
    for i, line in enumerate(Path(freq_path).read_text().splitlines()):
        w, _, n = line.partition(" ")
        freq.setdefault(w, i)
        counts.setdefault(w, int(n or 0))
    wanted_forms = set(freq)

    lemmas: dict[str, list] = defaultdict(list)
    forms: dict[str, set] = defaultdict(set)
    conj: dict[str, dict] = {}

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
            # Conjugations; reflexive entries ("se souvenir") are stored under the bare verb if it has none.
            base = re.sub(r"^(se |s')", "", word) if pos == "verb" else word
            if pos == "verb" and " " not in base and base not in conj and (c := conjugation(e)):
                conj[base] = {"inf": base, "gloss": gloss, **c}
            for fm in (e.get("forms", []) if " " not in word and "'" not in word else []):
                form = fm.get("form", "")
                if form and form != word and form in wanted_forms and " " not in form:
                    forms[form.lower()].add(word)

    # Keep lemmas that are frequent themselves or are the target of a frequent form.
    targets = {l for ls in forms.values() for l in ls}
    keep = {l for l in lemmas if l.lower() in freq or l in targets}
    # Lemma frequency = its own count + counts of inflected forms that clearly belong to it
    # (a form that is itself a word, or could belong to several lemmas, isn't counted:
    # "suis" would otherwise make "suivre" as common as "être").
    score = defaultdict(int)
    for l in keep:
        score[l] += counts.get(l.lower(), 0)
    for f, ls in forms.items():
        if len(ls) == 1 and f not in lemmas:
            score[next(iter(ls))] += counts.get(f, 0)
    clean_word = lambda l: FRENCH_WORD.match(l) is not None
    ranked = sorted((l for l in keep if clean_word(l)), key=lambda l: (-score[l], l)) + sorted(l for l in keep if not clean_word(l))
    out_l = {l: lemmas[l] for l in ranked}
    out_f = {f: sorted(ls & keep, key=lambda l: freq.get(l, 10**9)) for f, ls in forms.items()}
    out_f = {f: ls for f, ls in out_f.items() if ls and ls != [f]}

    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps({"l": out_l, "f": out_f}, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(out_l)} lemmas, {len(out_f)} forms -> {out} ({Path(out).stat().st_size / 1e6:.1f} MB)")

    verbs, missing = [], []
    for entry in CORE_VERBS:
        refl, _, inf = entry.rpartition(":")
        if inf not in conj:
            missing.append(inf)
            continue
        v = dict(conj[inf])
        if refl:
            v.update(reflexive=True, aux=["être"])
        verbs.append(v)
    if missing:
        print("no conjugation found for:", ", ".join(missing))
    vout = Path(out).with_name("verbs.json")
    vout.write_text(json.dumps(verbs, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(verbs)} verbs -> {vout} ({vout.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main(*sys.argv[1:])
