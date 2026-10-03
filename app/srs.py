"""FSRS scheduling and the review queue."""

import copy
from datetime import datetime, timedelta, timezone

import fsrs
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.db import local_day_start, utcnow
from app.models import Card, Item, ReviewLog

scheduler = fsrs.Scheduler(desired_retention=0.9)
LEARN_AHEAD = timedelta(minutes=15)  # show learning-step cards a bit early so a session can finish


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt else None


def _naive(dt):
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt else None


def add_card(db: Session, item: Item, template: str = "recog") -> Card:
    card = Card(item=item, template=template, due=utcnow())
    db.add(card)
    return card


def to_fsrs(card: Card) -> fsrs.Card:
    return fsrs.Card(
        card_id=card.id,
        state=fsrs.State(card.state),
        step=card.step,
        stability=card.stability,
        difficulty=card.difficulty,
        due=_aware(card.due),
        last_review=_aware(card.last_review),
    )


def preview_due(fc: fsrs.Card, rating: int, now: datetime | None = None) -> datetime:
    """When the card would next be due if rated `rating` now (for button labels)."""
    nxt, _ = scheduler.review_card(copy.deepcopy(fc), fsrs.Rating(rating), review_datetime=_aware(now or utcnow()))
    return _naive(nxt.due)


def review(db: Session, card: Card, rating: int, now: datetime | None = None) -> Card:
    now = now or utcnow()
    fc = to_fsrs(card)
    db.add(ReviewLog(card_id=card.id, rating=rating, state_before=card.state, reviewed_at=now))
    fc, _ = scheduler.review_card(fc, fsrs.Rating(rating), review_datetime=_aware(now))
    card.state, card.step = fc.state.value, fc.step
    card.stability, card.difficulty = fc.stability, fc.difficulty
    card.due, card.last_review = _naive(fc.due), _naive(fc.last_review)
    card.reps += 1
    return card


def new_reviewed_today(db: Session) -> int:
    first = select(func.min(ReviewLog.reviewed_at).label("first")).group_by(ReviewLog.card_id).subquery()
    return db.scalar(select(func.count()).select_from(first).where(first.c.first >= local_day_start())) or 0


def queue(db: Session, limit: int, only_item_ids: list[int] | None = None, now: datetime | None = None) -> list[Card]:
    """Due cards (mistakes first), then new cards within the daily new-card budget."""
    now = now or utcnow()
    base = select(Card).join(Item).options(joinedload(Card.item)).where(Item.suspended.is_(False))
    if only_item_ids is not None:
        base = base.where(Item.id.in_(only_item_ids))
    mistakes_first = case((Item.kind == "mistake", 0), else_=1)
    is_review = Card.state == fsrs.State.Review.value

    due = db.scalars(
        base.where(Card.reps > 0, (is_review & (Card.due <= now)) | (~is_review & (Card.due <= now + LEARN_AHEAD)))
        .order_by(mistakes_first, Card.due)
        .limit(limit)
    ).all()

    room = limit - len(due)
    if only_item_ids is None:
        room = min(room, get_settings().new_cards_per_day - new_reviewed_today(db))
    new = []
    if room > 0:
        new = db.scalars(base.where(Card.reps == 0).order_by(mistakes_first, Card.created_at).limit(room)).all()
    return [*due, *new]
