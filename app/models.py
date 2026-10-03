"""Data model.

Everything reviewable is an Item (kind: word | mistake; later cloze, dictation...).
Each Item has one Card per template carrying FSRS state. Submissions cover Write now
and Speak later (modality), with `grader` leaving room for DELF-style scoring.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, utcnow

ERROR_CATEGORIES = [
    "agreement", "gender", "verb_tense", "conjugation", "mood", "prepositions", "articles",
    "pronouns", "word_order", "negation", "spelling", "vocabulary", "register", "punctuation", "other",
]


class Item(Base):
    __tablename__ = "item"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    lemma: Mapped[str | None] = mapped_column(String(100), index=True)  # word items
    front: Mapped[str] = mapped_column(Text)
    back: Mapped[str] = mapped_column(Text)
    context: Mapped[str | None] = mapped_column(Text)  # source sentence, target marked [[like this]]
    context_en: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)  # explanation / usage note
    category: Mapped[str | None] = mapped_column(String(20))  # mistake items
    text_id: Mapped[int | None] = mapped_column(ForeignKey("text.id", ondelete="SET NULL"))
    submission_id: Mapped[int | None] = mapped_column(ForeignKey("submission.id", ondelete="CASCADE"))
    suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)

    cards: Mapped[list["Card"]] = relationship(back_populates="item", cascade="all, delete-orphan")


class Card(Base):
    __tablename__ = "card"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("item.id", ondelete="CASCADE"), index=True)
    template: Mapped[str] = mapped_column(String(20), default="recog")
    due: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    stability: Mapped[float | None] = mapped_column(Float)
    difficulty: Mapped[float | None] = mapped_column(Float)
    state: Mapped[int] = mapped_column(Integer, default=1)  # fsrs.State: 1 learning, 2 review, 3 relearning
    step: Mapped[int | None] = mapped_column(Integer, default=0)
    last_review: Mapped[datetime | None] = mapped_column()
    reps: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    item: Mapped[Item] = relationship(back_populates="cards")


class ReviewLog(Base):
    __tablename__ = "review_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("card.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    state_before: Mapped[int] = mapped_column(Integer)
    reviewed_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)


class TextDoc(Base):
    __tablename__ = "text"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20))  # llm | paste | builtin
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    tokens: Mapped[dict] = mapped_column(JSON)  # spaCy analysis, see nlp.analyze
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    read_at: Mapped[datetime | None] = mapped_column()


class Submission(Base):
    __tablename__ = "submission"

    id: Mapped[int] = mapped_column(primary_key=True)
    modality: Mapped[str] = mapped_column(String(10), default="write")  # write | speak
    prompt: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str] = mapped_column(Text)
    corrected_text: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    grader: Mapped[str] = mapped_column(String(20), default="lt_llm")  # lt_llm | lt_only | llm_only | delf_b2
    score: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)

    errors: Mapped[list["Error"]] = relationship(back_populates="submission", cascade="all, delete-orphan", order_by="Error.start")


class Error(Base):
    __tablename__ = "error"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submission.id", ondelete="CASCADE"), index=True)
    start: Mapped[int] = mapped_column(Integer)
    end: Mapped[int] = mapped_column(Integer)
    original: Mapped[str] = mapped_column(Text)
    suggestion: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(20), index=True)
    explanation: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)

    submission: Mapped[Submission] = relationship(back_populates="errors")


class GlossCache(Base):
    __tablename__ = "gloss_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)
