import os
from datetime import timedelta

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["ANTHROPIC_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import correction, db as dbmod, llm, srs
from app.db import Base, utcnow
from app.models import Card, Item


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(dbmod, "engine", engine)
    monkeypatch.setattr(dbmod, "SessionLocal", Session)
    with Session() as s:
        yield s


def _word(db, lemma="marché"):
    item = Item(kind="word", lemma=lemma, front=lemma, back="market")
    db.add(item)
    srs.add_card(db, item)
    db.commit()
    return item


def test_new_card_is_queued_then_scheduled(db):
    item = _word(db)
    [card] = srs.queue(db, limit=10)
    assert card.item_id == item.id and card.reps == 0

    now = utcnow()
    srs.review(db, card, 3, now=now)  # Good on a new card -> next learning step
    srs.review(db, card, 3, now=now + timedelta(minutes=11))  # Good again -> graduates
    db.commit()
    assert card.reps == 2 and card.state == 2  # Review
    assert card.due > now + timedelta(hours=12)
    assert srs.queue(db, limit=10, now=now + timedelta(minutes=12)) == []


def test_again_keeps_card_in_session(db):
    _word(db)
    card = db.scalar(select(Card))
    srs.review(db, card, 1)
    db.commit()
    assert srs.queue(db, limit=10) == [card]  # learning step is within the learn-ahead window


def test_mistakes_come_before_words(db):
    _word(db)
    m = Item(kind="mistake", front="x", back="y")
    db.add(m)
    srs.add_card(db, m)
    db.commit()
    assert [c.item.kind for c in srs.queue(db, limit=10)] == ["mistake", "word"]


def test_correction_creates_mistake_items(db, monkeypatch):
    text = "Hier, je suis allé au cinéma avec mes amie. Le film était bien."
    monkeypatch.setattr(correction, "languagetool", lambda t: [])
    monkeypatch.setattr(
        llm,
        "structured",
        lambda **kw: correction.Correction(
            corrected_text=text.replace("mes amie", "mes amies"),
            errors=[correction.FoundError(original="mes amie", suggestion="mes amies", category="agreement", explanation="Plural.")],
            summary="ok",
        ),
    )
    sub = correction.correct(db, text, "prompt")
    assert [(e.start, e.end, e.category) for e in sub.errors] == [(34, 42, "agreement")]
    item = db.scalar(select(Item).where(Item.kind == "mistake"))
    assert item.front == "Hier, je suis allé au cinéma avec [[mes amie]]."
    assert item.back == "Hier, je suis allé au cinéma avec [[mes amies]]."
    assert len(item.cards) == 1


def test_correction_without_any_checker_raises(db, monkeypatch):
    import httpx

    def boom(t):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(correction, "languagetool", boom)
    with pytest.raises(llm.LlmUnavailable):
        correction.correct(db, "Bonjour.", None)


def test_login_required_when_password_set(db, monkeypatch):
    import bcrypt

    from app import main

    monkeypatch.setattr(main.settings, "app_password_hash", bcrypt.hashpw(b"secret", bcrypt.gensalt()).decode())
    client = TestClient(main.app)
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/login"
    assert client.post("/api/gloss", json={"word": "a", "lemma": "a", "sentence": "a"}).status_code == 401
    assert "Wrong password" in client.post("/login", data={"password": "nope"}).text
    r = client.post("/login", data={"password": "secret"}, follow_redirects=False)
    assert r.status_code == 303
    assert client.get("/", follow_redirects=False).status_code == 200
