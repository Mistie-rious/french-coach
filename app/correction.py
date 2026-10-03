"""Writing correction: LanguageTool finds errors, Claude filters/adds/categorises/explains.

Each error becomes a 'mistake' review item. Speak will later reuse `correct()` on transcripts.
"""

import logging
import re
from typing import Literal

import httpx
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import llm, nlp, srs
from app.config import get_settings
from app.models import ERROR_CATEGORIES, Error, Item, Submission

log = logging.getLogger(__name__)


class LtMatch(BaseModel):
    offset: int
    length: int
    original: str
    suggestion: str
    message: str
    rule: str


def languagetool(text: str) -> list[LtMatch]:
    resp = httpx.post(get_settings().languagetool_url, data={"text": text, "language": "fr"}, timeout=20)
    resp.raise_for_status()
    out = []
    for m in resp.json()["matches"]:
        reps = m.get("replacements") or []
        out.append(
            LtMatch(
                offset=m["offset"],
                length=m["length"],
                original=text[m["offset"] : m["offset"] + m["length"]],
                suggestion=reps[0]["value"] if reps else "",
                message=m.get("message", ""),
                rule=f'{m["rule"]["category"]["id"]}/{m["rule"]["id"]}',
            )
        )
    return out


def category_from_lt(rule: str) -> str:
    """Rough category for LanguageTool-only fallback."""
    r = rule.upper()
    for needle, cat in [
        ("ACCORD", "agreement"), ("AGREEMENT", "agreement"), ("GENRE", "gender"), ("SUBJONCTIF", "mood"),
        ("CONJUG", "conjugation"), ("TEMPS", "verb_tense"), ("PREP", "prepositions"), ("TYPOS", "spelling"),
        ("DIACRITICS", "spelling"), ("CASING", "spelling"), ("PUNCT", "punctuation"), ("TYPOGRAPHY", "punctuation"),
    ]:
        if needle in r:
            return cat
    return "other"


class FoundError(BaseModel):
    original: str = Field(description="Exact substring copied verbatim from the learner's text, as short as possible while unambiguous")
    suggestion: str = Field(description="Replacement for `original`")
    category: Literal[tuple(ERROR_CATEGORIES)]  # type: ignore[valid-type]
    explanation: str = Field(description="1-2 sentences naming the rule, addressed to the learner")


class Correction(BaseModel):
    corrected_text: str = Field(description="The full text with all listed fixes applied")
    errors: list[FoundError] = Field(description="In text order")
    summary: str = Field(description="2-3 sentences of overall feedback: what went well, what to focus on next")


SYSTEM = """You are a precise French teacher correcting a {level} learner's writing.
You get the learner's text and LanguageTool's automatic matches.
- Keep LanguageTool's real errors; drop false positives and pure style preferences.
- Add errors it missed: tense/mood choice, prepositions, agreement, unidiomatic phrasing.
- Fix what a {level} learner should fix; don't rewrite for elegance. Preserve the meaning.
- `original` must be copied exactly from the learner's text so it can be located.
- Explanations in English, concise, naming the rule (e.g. "past participle agrees with the subject after être")."""


def _locate(text: str, needle: str, start: int) -> int:
    pos = text.find(needle, start)
    if pos == -1:
        pos = text.find(needle)
    if pos == -1 and needle.strip():
        m = re.search(r"\s+".join(map(re.escape, needle.split())), text, flags=re.IGNORECASE)
        pos = m.start() if m else -1
    return pos


def correct(db: Session, text: str, prompt: str | None, modality: str = "write") -> Submission:
    try:
        lt, lt_ok = languagetool(text), True
    except (httpx.HTTPError, KeyError) as e:
        log.warning("LanguageTool failed: %s", e)
        lt, lt_ok = [], False

    sub = Submission(modality=modality, prompt=prompt, raw_text=text)
    try:
        lt_lines = "\n".join(f'- "{m.original}" -> "{m.suggestion}" [{m.rule}] {m.message}' for m in lt) or "(none)"
        res = llm.structured(
            system=SYSTEM.format(level=get_settings().level),
            user=f"Prompt: {prompt or '(free writing)'}\n\nLearner text:\n<<<\n{text}\n>>>\n\nLanguageTool matches:\n{lt_lines}",
            schema=Correction,
        )
        sub.grader = "lt_llm" if lt_ok else "llm_only"
        sub.corrected_text, sub.summary = res.corrected_text, res.summary
        cursor = 0
        for e in res.errors:
            pos = _locate(text, e.original, cursor)
            if pos == -1:
                log.info("Couldn't locate %r in submission", e.original)
                continue
            cursor = pos + len(e.original)
            sub.errors.append(Error(start=pos, end=pos + len(e.original), original=e.original, suggestion=e.suggestion, category=e.category, explanation=e.explanation))
    except llm.LlmUnavailable as e:
        if not lt_ok:
            raise
        log.warning("Claude unavailable, LanguageTool only: %s", e)
        sub.grader = "lt_only"
        sub.summary = "Checked by LanguageTool only (Claude unavailable), so no explanations or categories beyond its rules."
        fixed = text
        for m in sorted((m for m in lt if m.suggestion), key=lambda m: m.offset, reverse=True):
            fixed = fixed[: m.offset] + m.suggestion + fixed[m.offset + m.length :]
        sub.corrected_text = fixed
        for m in lt:
            if m.suggestion:
                sub.errors.append(Error(start=m.offset, end=m.offset + m.length, original=m.original, suggestion=m.suggestion, category=category_from_lt(m.rule), explanation=m.message))

    db.add(sub)
    db.flush()
    for err in sub.errors:
        s, e = nlp.sentence_span(text, err.start)
        sentence = text[s:e]
        a, b = err.start - s, err.end - s
        item = Item(
            kind="mistake",
            front=(sentence[:a] + "[[" + sentence[a:b] + "]]" + sentence[b:]).strip(),
            back=(sentence[:a] + "[[" + err.suggestion + "]]" + sentence[b:]).strip(),
            note=err.explanation,
            category=err.category,
            submission_id=sub.id,
        )
        db.add(item)
        srs.add_card(db, item, template="fix")
    db.commit()
    return sub
