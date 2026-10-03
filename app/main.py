import logging
import re
import time
from datetime import date as Date
from contextlib import asynccontextmanager
from datetime import timedelta
from urllib.parse import quote

import bcrypt
import fsrs
from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from itsdangerous import BadSignature, TimestampSigner
from markupsafe import Markup, escape
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import content, correction, llm, srs
from app.config import ROOT, get_settings
from app.db import get_db, init_db, local_date, local_day_start, utcnow
from app.models import Card, Error, Item, ReviewLog, Submission, TextDoc

logging.basicConfig(level=logging.INFO)
settings = get_settings()
if settings.is_production and not settings.app_password_hash:
    raise RuntimeError("APP_PASSWORD_HASH must be set in production")

APP_DIR = ROOT / "app"


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = FastAPI(docs_url=None, redoc_url=None, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")
templates = Jinja2Templates(directory=APP_DIR / "templates")


def _mark(s: str | None) -> Markup:
    """Escape, then turn [[x]] into <mark>x</mark>."""
    return Markup(re.sub(r"\[\[(.*?)\]\]", r"<mark>\1</mark>", str(escape(s or ""))))


templates.env.filters["mark"] = _mark


def render(request: Request, name: str, **ctx) -> HTMLResponse:
    return templates.TemplateResponse(request, name, {"llm_on": bool(settings.anthropic_api_key), "config_cap": settings.review_cap, **ctx})


# ---------- auth ----------

COOKIE = "fc_session"
SESSION_DAYS = 90
signer = TimestampSigner(settings.session_secret, salt="session")


class NotLoggedIn(Exception):
    pass


def require_login(request: Request) -> None:
    if not settings.app_password_hash:
        return  # dev without a password
    try:
        signer.unsign(request.cookies.get(COOKIE, ""), max_age=SESSION_DAYS * 86400)
    except BadSignature:
        raise NotLoggedIn


@app.exception_handler(NotLoggedIn)
def _not_logged_in(request: Request, _):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "Not logged in"}, status_code=401)
    return RedirectResponse("/login", status_code=303)


@app.get("/login")
def login_page(request: Request):
    return render(request, "login.html", error=None)


@app.post("/login")
def login(request: Request, password: str = Form(...)):
    if not settings.app_password_hash or bcrypt.checkpw(password.encode(), settings.app_password_hash.encode()):
        resp = RedirectResponse("/", status_code=303)
        resp.set_cookie(COOKIE, signer.sign("me").decode(), max_age=SESSION_DAYS * 86400, httponly=True, secure=settings.is_production, samesite="lax")
        return resp
    time.sleep(1)
    return render(request, "login.html", error="Wrong password")


@app.post("/logout")
def logout():
    resp = RedirectResponse("/login", status_code=303)
    resp.delete_cookie(COOKIE)
    return resp


auth = [Depends(require_login)]

# ---------- today ----------


def active_days(db: Session) -> set[str]:
    stamps = [
        *db.scalars(select(ReviewLog.reviewed_at)),
        *db.scalars(select(Submission.created_at)),
        *db.scalars(select(TextDoc.read_at).where(TextDoc.read_at.is_not(None))),
    ]
    return {local_date(ts) for ts in stamps}


def streak(days: set[str]) -> int:
    d = Date.fromisoformat(local_date())
    if d.isoformat() not in days:
        d -= timedelta(days=1)  # today not done yet doesn't break the streak
    n = 0
    while d.isoformat() in days:
        n, d = n + 1, d - timedelta(days=1)
    return n


def todays_mistake_ids(db: Session) -> list[int]:
    return list(db.scalars(select(Item.id).where(Item.kind == "mistake", Item.created_at >= local_day_start())))


@app.get("/", dependencies=auth)
def today(request: Request, db: Session = Depends(get_db)):
    start = local_day_start()
    reviewed_today = db.scalar(select(func.count()).select_from(ReviewLog).where(ReviewLog.reviewed_at >= start)) or 0
    due_now = len(srs.queue(db, limit=settings.review_cap))
    unread = db.scalars(select(TextDoc).where(TextDoc.read_at.is_(None)).order_by(TextDoc.created_at.desc())).first()
    read_today = db.scalar(select(func.count()).select_from(TextDoc).where(TextDoc.read_at >= start)) or 0
    wrote_today = db.scalars(select(Submission).where(Submission.created_at >= start).order_by(Submission.created_at.desc())).first()
    mistake_ids = todays_mistake_ids(db)
    drill_left = len(srs.queue(db, limit=100, only_item_ids=mistake_ids)) if mistake_ids else 0
    steps = [
        {"key": "review", "title": "Warm-up review", "href": "/review", "done": due_now == 0 or reviewed_today >= settings.review_cap,
         "detail": f"{due_now} due" if due_now else f"{reviewed_today} reviewed"},
        {"key": "read", "title": "Read", "href": f"/read/{unread.id}" if unread and not read_today else "/read", "done": read_today > 0,
         "detail": unread.title if unread and not read_today else ("done" if read_today else "pick or generate a text")},
        {"key": "write", "title": "Write", "href": f"/write/{wrote_today.id}" if wrote_today else "/write", "done": wrote_today is not None,
         "detail": content.prompt_of_the_day()},
        {"key": "drill", "title": "Drill today's mistakes", "href": "/review?drill=1", "done": wrote_today is not None and drill_left == 0,
         "detail": f"{drill_left} to drill" if drill_left else ("after writing" if not wrote_today else "done")},
    ]
    return render(request, "today.html", steps=steps, streak=streak(active_days(db)), all_done=all(s["done"] for s in steps))


# ---------- review ----------


@app.get("/review", dependencies=auth)
def review_page(request: Request, drill: bool = False, more: bool = False, db: Session = Depends(get_db)):
    reviewed_today = db.scalar(select(func.count()).select_from(ReviewLog).where(ReviewLog.reviewed_at >= local_day_start())) or 0
    if drill:
        ids = todays_mistake_ids(db)
        cards = srs.queue(db, limit=100, only_item_ids=ids) if ids else []
    else:
        cap_hit = reviewed_today >= settings.review_cap and not more
        cards = [] if cap_hit else srs.queue(db, limit=settings.review_cap)
    card = cards[0] if cards else None
    previews = {}
    if card:
        fc = srs.to_fsrs(card)
        for r in (1, 2, 3, 4):
            previews[r] = _fmt_interval(srs.preview_due(fc, r) - utcnow())
    return render(request, "review.html", card=card, remaining=len(cards), drill=drill, more=more,
                  reviewed_today=reviewed_today, previews=previews)


def _fmt_interval(td: timedelta) -> str:
    s = td.total_seconds()
    if s < 3600:
        return f"{max(1, round(s / 60))}m"
    if s < 86400:
        return f"{round(s / 3600)}h"
    d = s / 86400
    return f"{round(d)}d" if d < 60 else f"{d / 30:.0f}mo"


@app.post("/review/{card_id}", dependencies=auth)
def review_submit(card_id: int, rating: int = Form(...), drill: bool = Form(False), more: bool = Form(False), db: Session = Depends(get_db)):
    card = db.get(Card, card_id)
    if not card or rating not in (1, 2, 3, 4):
        raise HTTPException(400)
    srs.review(db, card, rating)
    db.commit()
    q = "drill=1" if drill else ("more=1" if more else "")
    return RedirectResponse(f"/review?{q}", status_code=303)


@app.post("/items/{item_id}/suspend", dependencies=auth)
def suspend(item_id: int, drill: bool = Form(False), db: Session = Depends(get_db)):
    item = db.get(Item, item_id)
    if item:
        item.suspended = True
        db.commit()
    return RedirectResponse("/review?drill=1" if drill else "/review", status_code=303)


# ---------- read ----------


@app.get("/read", dependencies=auth)
def read_list(request: Request, error: str | None = None, db: Session = Depends(get_db)):
    texts = db.scalars(select(TextDoc).order_by(TextDoc.created_at.desc()).limit(50)).all()
    return render(request, "read_list.html", texts=texts, error=error)


@app.post("/read/generate", dependencies=auth)
def read_generate(db: Session = Depends(get_db)):
    try:
        doc = content.generate_text(db)
    except llm.LlmUnavailable as e:
        doc = content.next_builtin_text(db)
        if not doc:
            return RedirectResponse(f"/read?error={quote(str(e))}", status_code=303)
    return RedirectResponse(f"/read/{doc.id}", status_code=303)


@app.post("/read/paste", dependencies=auth)
def read_paste(title: str = Form(""), body: str = Form(...), db: Session = Depends(get_db)):
    if not body.strip():
        return RedirectResponse("/read", status_code=303)
    doc = content.add_text(db, title, body, "paste")
    return RedirectResponse(f"/read/{doc.id}", status_code=303)


@app.get("/read/{text_id}", dependencies=auth)
def reader(request: Request, text_id: int, db: Session = Depends(get_db)):
    doc = db.get(TextDoc, text_id)
    if not doc:
        raise HTTPException(404)
    return render(request, "reader.html", doc=doc, saved=content.saved_lemmas(db))


@app.post("/read/{text_id}/done", dependencies=auth)
def read_done(text_id: int, db: Session = Depends(get_db)):
    doc = db.get(TextDoc, text_id)
    if doc and not doc.read_at:
        doc.read_at = utcnow()
        db.commit()
    return RedirectResponse("/", status_code=303)


@app.post("/read/{text_id}/delete", dependencies=auth)
def read_delete(text_id: int, db: Session = Depends(get_db)):
    if doc := db.get(TextDoc, text_id):
        db.delete(doc)
        db.commit()
    return RedirectResponse("/read", status_code=303)


class GlossIn(BaseModel):
    word: str
    lemma: str
    sentence: str


@app.post("/api/gloss", dependencies=auth)
def api_gloss(body: GlossIn, db: Session = Depends(get_db)):
    try:
        return content.gloss(db, body.word, body.lemma, body.sentence)
    except llm.LlmUnavailable as e:
        return JSONResponse({"detail": str(e)}, status_code=503)


class SaveIn(BaseModel):
    word: str
    sentence: str
    text_id: int | None = None
    gloss: dict


@app.post("/api/save", dependencies=auth)
def api_save(body: SaveIn, db: Session = Depends(get_db)):
    g = body.gloss
    if not g.get("lemma") or not g.get("lemma_meaning"):
        raise HTTPException(422, "lemma and lemma_meaning are required")
    g.setdefault("pos", "")
    item, created = content.save_word(db, word=body.word, sentence=body.sentence, text_id=body.text_id, g=g)
    return {"item_id": item.id, "created": created, "lemma": item.lemma}


# ---------- write ----------


@app.get("/write", dependencies=auth)
def write_page(request: Request, error: str | None = None, db: Session = Depends(get_db)):
    past = db.scalars(select(Submission).order_by(Submission.created_at.desc()).limit(20)).all()
    return render(request, "write.html", prompt=content.prompt_of_the_day(), past=past, error=error)


@app.post("/write", dependencies=auth)
def write_submit(text: str = Form(...), prompt: str = Form(""), db: Session = Depends(get_db)):
    if not text.strip():
        return RedirectResponse("/write", status_code=303)
    try:
        sub = correction.correct(db, text.strip(), prompt or None)
    except llm.LlmUnavailable as e:
        return RedirectResponse(f"/write?error={quote('Correction unavailable: ' + str(e))}", status_code=303)
    return RedirectResponse(f"/write/{sub.id}", status_code=303)


@app.get("/write/{sub_id}", dependencies=auth)
def feedback(request: Request, sub_id: int, db: Session = Depends(get_db)):
    sub = db.get(Submission, sub_id)
    if not sub:
        raise HTTPException(404)
    # Split the original text into plain / error segments for highlighting.
    segments, pos = [], 0
    for i, e in enumerate(sub.errors, 1):
        if e.start < pos:
            continue  # overlapping span; still listed below
        segments.append({"text": sub.raw_text[pos : e.start]})
        segments.append({"text": sub.raw_text[e.start : e.end], "n": i, "category": e.category})
        pos = e.end
    segments.append({"text": sub.raw_text[pos:]})
    return render(request, "feedback.html", sub=sub, segments=segments)


# ---------- stats ----------


@app.get("/stats", dependencies=auth)
def stats(request: Request, db: Session = Depends(get_db)):
    now = utcnow()
    week_ago, month_ago = now - timedelta(days=7), now - timedelta(days=30)
    known = db.scalar(
        select(func.count(func.distinct(Item.id))).join(Card)
        .where(Item.kind == "word", Card.state == fsrs.State.Review.value, Card.stability >= settings.known_stability_days)
    )
    saved = db.scalar(select(func.count()).select_from(Item).where(Item.kind == "word"))
    top = db.execute(
        select(Error.category, func.count()).where(Error.created_at >= week_ago)
        .group_by(Error.category).order_by(func.count().desc()).limit(6)
    ).all()
    mature = db.execute(
        select(ReviewLog.rating > 1, func.count())
        .where(ReviewLog.reviewed_at >= month_ago, ReviewLog.state_before == fsrs.State.Review.value)
        .group_by(ReviewLog.rating > 1)
    ).all()
    passed = sum(n for ok, n in mature if ok)
    total = sum(n for _, n in mature)
    days = active_days(db)
    today = Date.fromisoformat(local_date())
    last28 = [{"date": (d := today - timedelta(days=i)).isoformat(), "active": d.isoformat() in days} for i in range(27, -1, -1)]
    return render(
        request, "stats.html",
        streak=streak(days), known=known or 0, saved=saved or 0, top=top,
        top_max=max((n for _, n in top), default=1),
        retention=round(100 * passed / total) if total else None, last28=last28,
    )


# ---------- PWA ----------


@app.get("/sw.js")
def service_worker():
    return FileResponse(APP_DIR / "static" / "sw.js", media_type="text/javascript", headers={"Cache-Control": "no-cache"})


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(APP_DIR / "static" / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/healthz")
def healthz():
    return {"ok": True}
