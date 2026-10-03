from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    env: str = "dev"  # "dev" | "production"
    database_url: str = f"sqlite:///{ROOT / 'data' / 'coach.db'}"

    # Login password as a bcrypt hash: `uv run python -m app.hashpw`. Unset in dev = no login.
    app_password_hash: str | None = None
    session_secret: str = "dev-insecure-secret-change-me"

    anthropic_api_key: str | None = None
    llm_model: str = "claude-sonnet-5-5"
    llm_fast_model: str = "claude-haiku-4-5"
    languagetool_url: str = "https://api.languagetool.org/v2/check"

    user_tz: str = "Africa/Lagos"
    level: str = "B1"
    review_cap: int = 20
    new_cards_per_day: int = 15
    known_stability_days: float = 21.0

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
