"""Reading texts, word glosses, saving words, daily writing prompt."""

import hashlib
import random
from datetime import date as Date

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import llm, nlp, srs
from app.config import get_settings
from app.db import local_date
from app.models import Card, GlossCache, Item, TextDoc
from app.seed import BUILTIN_TEXTS, PROMPTS, THEMES

# ---------- texts ----------


def add_text(db: Session, title: str, body: str, source: str) -> TextDoc:
    body = body.strip().replace("\r\n", "\n")
    doc = TextDoc(title=title.strip() or "Sans titre", body=body, source=source, tokens=nlp.analyze(body))
    db.add(doc)
    db.commit()
    return doc


def learning_lemmas(db: Session, limit: int = 8) -> list[str]:
    """Saved words that aren't solid yet, weakest first."""
    rows = db.scalars(
        select(Item.lemma)
        .join(Card)
        .where(Item.kind == "word", Item.suspended.is_(False))
        .where(Card.stability.is_(None) | (Card.stability < get_settings().known_stability_days))
        .order_by(Card.stability.is_not(None), Card.stability)
        .limit(limit)
    ).all()
    return list(dict.fromkeys(rows))


class GeneratedText(BaseModel):
    title: str
    body: str = Field(description="French text, 150-220 words, paragraphs separated by blank lines")


def generate_text(db: Session) -> TextDoc:
    level = get_settings().level
    recent = db.scalars(select(TextDoc.title).order_by(TextDoc.created_at.desc()).limit(10)).all()
    gen = llm.structured(
        system=(
            f"You write short French reading texts for an adult learner at CEFR {level}: natural and interesting "
            f"(everyday life, culture, news-style stories, narratives, dialogues), never childish. "
            f"Mostly high-frequency vocabulary with varied {level} grammar."
        ),
        user=(
            f"Words I'm learning (use as many as fit naturally, any form): {', '.join(learning_lemmas(db)) or '(none yet)'}\n"
            f"Also introduce 3-5 useful new {level} words.\n"
            f"Topic idea: {random.choice(THEMES)}. Avoid these recent titles: {'; '.join(recent) or '(none)'}"
        ),
        schema=GeneratedText,
    )
    return add_text(db, gen.title, gen.body, "llm")


def next_builtin_text(db: Session) -> TextDoc | None:
    have = set(db.scalars(select(TextDoc.title).where(TextDoc.source == "builtin")).all())
    for t in BUILTIN_TEXTS:
        if t["title"] not in have:
            return add_text(db, t["title"], t["body"], "builtin")
    return None


# ---------- glosses ----------


class Gloss(BaseModel):
    lemma: str = Field(description="Dictionary form: infinitive for verbs, masculine singular for adjectives")
    pos: str = Field(description="noun, verb, adjective, adverb, preposition, expression, ...")
    gender: str | None = Field(description="'m' or 'f' for nouns, else null")
    meaning: str = Field(description="English meaning of the word as used in this sentence")
    lemma_meaning: str = Field(description="Short English gloss of the lemma (1-3 senses)")
    sentence_en: str = Field(description="Natural English translation of the whole sentence")
    note: str | None = Field(description="Only if useful: idiom, false friend, irregular form, register. Else null")
    example_fr: str = Field(description="A different short everyday example sentence using the lemma")
    example_en: str


def gloss(db: Session, word: str, lemma: str, sentence: str) -> dict:
    key = hashlib.sha256(f"{word}|{sentence}".encode()).hexdigest()
    if hit := db.get(GlossCache, key):
        return hit.data
    data = llm.structured(
        system="You are a concise French-English learner's dictionary that explains words in context for a B1 learner.",
        user=f"Word: {word}\n(spaCy lemma guess: {lemma})\nSentence: {sentence}",
        schema=Gloss,
        fast=True,
        max_tokens=1000,
    ).model_dump()
    db.add(GlossCache(key=key, data=data))
    db.commit()
    return data


def display_lemma(lemma: str, pos: str, gender: str | None) -> str:
    if pos.lower().startswith("noun") and gender in ("m", "f"):
        if lemma[:1].lower() in "aeiouhâéèêîôœ":
            return f"l'{lemma} ({gender})"
        return f"{'le' if gender == 'm' else 'la'} {lemma}"
    return lemma


def save_word(db: Session, *, word: str, sentence: str, text_id: int | None, g: dict) -> tuple[Item, bool]:
    existing = db.scalar(select(Item).where(Item.kind == "word", Item.lemma == g["lemma"]))
    if existing:
        return existing, False
    item = Item(
        kind="word",
        lemma=g["lemma"],
        front=display_lemma(g["lemma"], g["pos"], g.get("gender")),
        back=g["lemma_meaning"],
        context=sentence.replace(word, f"[[{word}]]", 1),
        context_en=g.get("sentence_en"),
        note=" · ".join(x for x in [g.get("note"), f'{g["example_fr"]} — {g["example_en"]}' if g.get("example_fr") else None] if x),
        text_id=text_id,
    )
    db.add(item)
    srs.add_card(db, item)
    db.commit()
    return item, True


def saved_lemmas(db: Session) -> set[str]:
    return set(db.scalars(select(Item.lemma).where(Item.kind == "word")).all())


# ---------- writing prompt ----------


def prompt_of_the_day(date: str | None = None) -> str:
    """Cycles through the prompt list, one per day."""
    day = Date.fromisoformat(date or local_date()).toordinal()
    return PROMPTS[day % len(PROMPTS)]
