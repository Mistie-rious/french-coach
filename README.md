# Français — personal daily French coach

A daily ~20-minute session: **review** (FSRS flashcards) → **read** (tap words to save them) → **write** (corrected by LanguageTool + Claude) → **drill** today's mistakes. Every saved word and every mistake becomes a review card.

Stack: FastAPI + Jinja templates + a bit of vanilla JS, SQLite, spaCy (`fr_core_news_sm`), `fsrs`, Claude (Sonnet for texts/corrections, Haiku for word lookups). Installable as a PWA.

## Run locally

```sh
cp .env.example .env          # add ANTHROPIC_API_KEY if you have one
uv run uvicorn app.main:app --reload
# http://localhost:8000
```

Without an API key it still works: built-in texts, manual word meanings, LanguageTool-only corrections.
Without `APP_PASSWORD_HASH` there's no login (dev only; production refuses to start without it).

Open it on your phone on the same Wi-Fi: `uv run uvicorn app.main:app --host 0.0.0.0` then visit `http://<your-mac-ip>:8000`.

Tests: `uv run pytest`

## Deploy (Fly.io)

```sh
brew install flyctl && fly auth login
# edit `app` in fly.toml to a unique name, then:
fly launch --copy-config --no-deploy
fly volumes create data --size 1 --region cdg
fly secrets set ANTHROPIC_API_KEY=sk-ant-... \
  SESSION_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))") \
  APP_PASSWORD_HASH="$(uv run python -m app.hashpw)" \
  USER_TZ=Africa/Lagos
fly deploy
```

Then on your phone open `https://<app>.fly.dev`, log in, and use Share → **Add to Home Screen**.

Backup: `fly ssh sftp get /data/coach.db ./backup.db`

## Layout

```
app/
  main.py        routes (pages + 2 JSON endpoints for the reader)
  models.py      Item/Card/ReviewLog, TextDoc, Submission/Error, GlossCache
  srs.py         FSRS scheduling + queue
  correction.py  LanguageTool → Claude → errors → mistake cards
  content.py     text generation, glosses, saving words, daily prompt
  nlp.py         spaCy tokenising/lemmas
  templates/ static/
```

Later phases fit the model as-is: Speak = `Submission(modality="speak")` through `correction.correct()`; Listen = new `Item.kind`/`Card.template`; DELF grading = `Submission.grader`/`score`.
