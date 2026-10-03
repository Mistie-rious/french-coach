"""spaCy tokenisation + lemmas for French."""

from functools import lru_cache

import spacy

GENDER = {"Masc": "m", "Fem": "f"}


@lru_cache(maxsize=1)
def get_nlp():
    return spacy.load("fr_core_news_sm", exclude=["ner"])


def analyze(text: str) -> list[dict]:
    """Sentences with tokens: [{"text", "tokens": [{"t", "ws", "lemma", "pos", "g", "w"}]}]."""
    out = []
    for sent in get_nlp()(text).sents:
        toks = []
        for tok in sent:
            gender = tok.morph.get("Gender")
            toks.append(
                {
                    "t": tok.text,
                    "ws": tok.whitespace_,
                    "lemma": tok.lemma_ if tok.pos_ == "PROPN" else tok.lemma_.lower(),
                    "pos": tok.pos_,
                    "g": GENDER.get(gender[0]) if gender else None,
                    "w": any(c.isalpha() for c in tok.text),
                }
            )
        out.append({"text": sent.text, "tokens": toks})
    return out


def sentence_span(text: str, offset: int) -> tuple[int, int]:
    for sent in get_nlp()(text).sents:
        if sent.start_char <= offset < sent.end_char:
            return sent.start_char, sent.end_char
    return 0, len(text)
