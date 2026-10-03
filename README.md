# Français: coach

A phone-first web app (installable PWA) for a daily ~20-minute session: **review** (FSRS flashcards) → **read** (tap words to look up and save) → **write** (corrected by LanguageTool + Claude) → **drill** today's mistakes. Every saved word and every mistake becomes a review card.

There's no server. Everything runs in the phone's browser:

- **Data**: SQLite (sql.js) saved in the browser's IndexedDB. *Me → My data* lets you browse/edit it, export CSV, and back up/restore the `.db` file (opens in any SQLite viewer).
- **Claude**: called directly from the phone with your own API key (Settings; stored only on the device, never in backups). Sonnet 5.5 writes texts and explains corrections; Haiku 4.5 does word lookups. Roughly $2–3/month.
- **Without a key** it still works: built-in texts, offline dictionary, LanguageTool-only corrections.
- **Hosting**: static files on GitHub Pages ($0).

## Run locally

```sh
cd web && python3 -m http.server 8000   # http://localhost:8000
node --test tests/*.test.mjs             # tests
```

## Deploy

Push to `main` on GitHub. The workflow in `.github/workflows/pages.yml` runs the tests and publishes `web/`. Enable it once under the repo's Settings → Pages → Source: **GitHub Actions**. Then open the Pages URL on your phone and choose Share → **Add to Home Screen**.

## Layout

```
web/
  index.html, app.css, sw.js, manifest.webmanifest
  js/db.js          SQLite schema, persistence, backup/restore
  js/srs.js         FSRS scheduling (ts-fsrs) + review queue
  js/nlp.js         tokeniser + offline dictionary lookup
  js/claude.js      Claude API calls (structured JSON output)
  js/correction.js  LanguageTool → Claude → errors → mistake cards
  js/content.js     texts, word lookups/saving, daily prompt
  js/progress.js    streak + stats
  js/views/         screens
  dict/fr-en.json   built by tools/build_dict.py
  vendor/           sql.js, ts-fsrs
```

Later phases fit the schema as-is: Speak = `submission.modality = 'speak'` through `correct()`; Listen = new `item.kind`/`card.template`; DELF grading = `submission.grader`/`score`.

## Credits

Dictionary: [Wiktionary](https://en.wiktionary.org) via [kaikki.org](https://kaikki.org) (CC BY-SA 4.0). Word frequencies: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC BY-SA 4.0). [sql.js](https://github.com/sql-js/sql.js) (MIT), [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (MIT).
