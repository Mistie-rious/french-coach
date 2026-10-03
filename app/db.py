from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    """Naive UTC — everything is stored as naive UTC in SQLite."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def local_date(dt_utc: datetime | None = None) -> str:
    """The learner's local calendar date (YYYY-MM-DD) for a naive-UTC datetime (default: now)."""
    dt = (dt_utc or utcnow()).replace(tzinfo=timezone.utc)
    return dt.astimezone(ZoneInfo(get_settings().user_tz)).date().isoformat()


def local_day_start(date: str | None = None) -> datetime:
    """Naive-UTC instant at which the local `date` (default: today) begins."""
    start = datetime.fromisoformat(date or local_date()).replace(tzinfo=ZoneInfo(get_settings().user_tz))
    return start.astimezone(timezone.utc).replace(tzinfo=None)


def make_engine(url: str):
    if url.startswith("sqlite:///") and ":memory:" not in url:
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _pragmas(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")

    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    import app.models  # noqa: F401  (register tables)

    Base.metadata.create_all(engine)


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db
