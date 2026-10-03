// Run with: node --test tests/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
globalThis.FSRS = require("../web/vendor/ts-fsrs.js");
globalThis.initSqlJs = require("../web/vendor/sql-wasm.js");

const db = await import("../web/js/db.js");
const srs = await import("../web/js/srs.js");
const nlp = await import("../web/js/nlp.js");
const correction = await import("../web/js/correction.js");
const content = await import("../web/js/content.js");
const progress = await import("../web/js/progress.js");

const fresh = () => db.openDb({ locateFile: (f) => new URL(`../web/vendor/${f}`, import.meta.url).pathname, bytes: null });

before(() => nlp.setDict(JSON.parse(readFileSync(new URL("../web/dict/fr-en.json", import.meta.url)))));

test("tokenize round-trips and splits elisions", () => {
  const text = "L'homme qu'on voit est allé chez lui aujourd'hui. Peut-être !\n\nNon.";
  const s = nlp.tokenize(text);
  assert.equal(s.flatMap((x) => x.tokens.map((t) => t.t)).join(""), text);
  const words = s.flatMap((x) => x.tokens.filter((t) => t.w).map((t) => t.t));
  assert.deepEqual(words.slice(0, 4), ["L'", "homme", "qu'", "on"]);
  assert.ok(words.includes("aujourd'hui") && words.includes("Peut-être"));
  assert.equal(s.length, 3);
});

test("dictionary maps inflected forms to lemmas", () => {
  assert.ok(nlp.lemmaCandidates("allées").includes("allée"));
  assert.equal(nlp.lemmaCandidates("yeux")[0], "œil");
  assert.equal(nlp.lemmaCandidates("l'")[0], "le");
  assert.ok(nlp.lookup("prendrait").some((d) => d.lemma === "prendre"));
});

test("new card -> learning -> review, mistakes first in queue", async () => {
  await fresh();
  const t0 = Date.now();
  const w = db.run("INSERT INTO item(kind, lemma, front, back, created_at) VALUES ('word','chat','le chat','cat',?)", [t0]);
  srs.addCard(w, "recog", t0);
  const m = db.run("INSERT INTO item(kind, front, back, created_at) VALUES ('mistake','x','y',?)", [t0]);
  srs.addCard(m, "fix", t0);

  const q = srs.queue(10, { at: t0 });
  assert.deepEqual(q.map((c) => c.kind), ["mistake", "word"]);

  const cardId = q[1].id;
  srs.review(cardId, 3, t0);
  srs.review(cardId, 3, t0 + 11 * 60000);
  const row = db.get("SELECT * FROM card WHERE id = ?", [cardId]);
  assert.equal(row.state, 2);
  assert.ok(row.due > t0 + 12 * 3600000);
  assert.ok(!srs.queue(10, { at: t0 + 12 * 60000 }).some((c) => c.id === cardId));
  assert.equal(db.scalar("SELECT COUNT(*) FROM review_log"), 2);
});

test("correction with Claude creates errors and mistake cards", async () => {
  await fresh();
  const text = "Hier, je suis allé au cinéma avec mes amie. Le film était bien.";
  const id = await correction.correct(text, "p", {
    lt: async () => [],
    claude: async () => ({
      corrected_text: text.replace("mes amie", "mes amies"),
      summary: "ok",
      errors: [{ original: "mes amie", suggestion: "mes amies", category: "agreement", explanation: "Plural." }],
    }),
  });
  const e = db.get("SELECT * FROM error WHERE submission_id = ?", [id]);
  assert.deepEqual([e.start, e.end, e.category], [34, 42, "agreement"]);
  const item = db.get("SELECT * FROM item WHERE kind = 'mistake'");
  assert.equal(item.front, "Hier, je suis allé au cinéma avec [[mes amie]].");
  assert.equal(item.back, "Hier, je suis allé au cinéma avec [[mes amies]].");
  assert.equal(db.scalar("SELECT grader FROM submission"), "lt_claude");
  assert.equal(progress.todaysMistakeIds().length, 1);
});

test("correction falls back to LanguageTool when Claude is unavailable", async () => {
  await fresh();
  const text = "Je suis allé avec mes amie.";
  const { ClaudeError } = await import("../web/js/claude.js");
  const id = await correction.correct(text, null, {
    lt: async () => [{ offset: 18, length: 8, original: "mes amie", suggestion: "mes amies", message: "Accord", rule: "GRAMMAR/AGREEMENT_X" }],
    claude: async () => { throw new ClaudeError("down"); },
  });
  const sub = db.get("SELECT * FROM submission WHERE id = ?", [id]);
  assert.equal(sub.grader, "lt_only");
  assert.equal(sub.corrected_text, "Je suis allé avec mes amies.");
  assert.equal(db.get("SELECT category FROM error").category, "agreement");
});

test("saving a word is idempotent per lemma; backup round-trips", async () => {
  await fresh();
  const g = { lemma: "marché", pos: "noun", gender: "m", lemma_meaning: "market" };
  const a = content.saveWord({ word: "marché", sentence: "Il va au marché.", textId: null, g });
  const b = content.saveWord({ word: "marchés", sentence: "Les marchés ferment.", textId: null, g });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  const item = db.get("SELECT * FROM item WHERE id = ?", [a.itemId]);
  assert.equal(item.front, "le marché");
  assert.equal(item.context, "Il va au [[marché]].");

  const bytes = db.exportBytes();
  await fresh();
  assert.equal(db.scalar("SELECT COUNT(*) FROM item"), 0);
  await db.importBytes(bytes);
  assert.equal(db.scalar("SELECT COUNT(*) FROM item"), 1);
  await assert.rejects(db.importBytes(new TextEncoder().encode("not a database at all")));
});

test("streak counts consecutive active days", async () => {
  await fresh();
  const day = 86400000;
  for (const ago of [0, 1, 2, 4]) db.run("INSERT INTO submission(raw_text, grader, created_at) VALUES ('x','lt_only',?)", [Date.now() - ago * day]);
  assert.equal(progress.streak(), 3);
});
