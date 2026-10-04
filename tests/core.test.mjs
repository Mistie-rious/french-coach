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
    useClaude: true,
    lt: async () => { throw new Error("LanguageTool must not be called when Claude works"); },
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
  assert.equal(db.scalar("SELECT grader FROM submission"), "claude");
  assert.equal(progress.todaysMistakeIds().length, 1);
});

test("correction falls back to LanguageTool when Claude is unavailable", async () => {
  await fresh();
  const text = "Je suis allé avec mes amie.";
  const { ClaudeError } = await import("../web/js/claude.js");
  const id = await correction.correct(text, null, {
    useClaude: true,
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

test("without a key, LanguageTool corrects alone", async () => {
  await fresh();
  let claudeCalled = false;
  const id = await correction.correct("Je suis allé avec mes amie.", null, {
    useClaude: false,
    lt: async () => [{ offset: 18, length: 8, original: "mes amie", suggestion: "mes amies", message: "Accord", rule: "GRAMMAR/AGREEMENT_X" }],
    claude: async () => { claudeCalled = true; },
  });
  assert.equal(claudeCalled, false);
  assert.equal(db.get("SELECT grader FROM submission WHERE id = ?", [id]).grader, "lt_only");
});

test("sentences save as French -> English cards, once", async () => {
  await fresh();
  const a = content.saveSentence({ sentence: "Il pleut.", translation: "It's raining.", notes: "impersonal verb", textId: null });
  const b = content.saveSentence({ sentence: "Il pleut.", translation: "It's raining.", notes: null, textId: null });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(srs.queue(10).map((c) => c.kind).join(), "sentence");
});

test("writing prompt follows the level and can step easier/harder offline", async () => {
  await fresh();
  db.kvSet("level", "A1");
  const p = content.todaysPrompt();
  assert.equal(p.level, "A1");
  db.kvSet("level", "B1");
  assert.equal(content.todaysPrompt().level, "A2"); // writing starts one level below reading
  const harder = await content.newPrompt("harder", { useClaude: false });
  assert.equal(harder.level, "B1");
  assert.equal(content.todaysPrompt().text, harder.text); // a chosen prompt sticks for the day
  assert.equal(content.writeLevel(), "B1"); // ...and the level sticks for future days
  assert.equal((await content.newPrompt("easier", { useClaude: false })).level, "A2");
  assert.equal(content.shiftLevel("A1", -1), "A1");
});

const listen = await import("../web/js/listen.js");

test("dictation compare: ok / accent / missing / extra words", () => {
  const r = listen.compare("Elle s'est assise à côté de moi.", "elle sest assise a cote de toi");
  const st = Object.fromEntries(r.tokens.map((t) => [t.w, t.status]));
  assert.equal(st["elle"], "ok");
  assert.equal(st["à"], "accent");
  assert.equal(st["côté"], "accent");
  assert.equal(st["moi"], "miss");
  assert.ok(r.extra.includes("toi"));
  assert.ok(r.score > 0.3 && r.score < 0.9);
  assert.equal(listen.compare("Vous avez gagné !", "Vous avez gagné").score, 1);
  assert.equal(listen.compare("Bonjour.", "").score, 0);
});

test("imperfect dictation becomes a listening card; perfect one doesn't", async () => {
  await fresh();
  const s = { id: 1, text: "Vous avez gagné !", en: "You've won!", audio: { url: "https://tatoeba.org/audio/download/1", author: "x", license: "CC BY 4.0", profile: "" } };
  assert.equal(listen.recordAttempt(s, "Vous avez gagné", 1).itemId, null);
  const { itemId } = listen.recordAttempt(s, "vous avez", 0.66);
  assert.ok(itemId);
  assert.equal(listen.recordAttempt(s, "vous", 0.33).itemId, itemId); // no duplicate card
  assert.equal(listen.listenedToday(), 3);
  const [card] = srs.queue(10);
  assert.equal(card.kind, "dictation");
  assert.equal(JSON.parse(card.audio).author, "x");
});

test("old databases (and backups) get the new audio column on open", async () => {
  await fresh();
  db.run("INSERT INTO item(kind, front, back, created_at) VALUES ('word','a','b',1)");
  db.run("ALTER TABLE item DROP COLUMN audio"); // simulate a pre-Listen database
  const oldBytes = db.exportBytes();
  await db.openDb({ locateFile: (f) => new URL(`../web/vendor/${f}`, import.meta.url).pathname, bytes: oldBytes });
  assert.ok(db.all("PRAGMA table_info(item)").some((c) => c.name === "audio"));
  assert.equal(db.scalar("SELECT COUNT(*) FROM item"), 1);
});

const translate = await import("../web/js/translate.js");
const claude = await import("../web/js/claude.js");

test("long texts are translated in sentence chunks under the API limit", async () => {
  await fresh();
  const sent = [];
  const fake = async (url) => {
    const q = new URL(url).searchParams.get("q");
    sent.push(q);
    return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: `[${q.length}]` } }));
  };
  const text = Array.from({ length: 30 }, (_, i) => `Voici la phrase numéro ${i} du texte.`).join(" ");
  const out = await translate.translateLong(text, { fetchImpl: fake });
  assert.ok(sent.length > 1 && sent.every((q) => q.length <= 450));
  assert.equal(sent.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
  assert.equal(out.split(" ").length, sent.length);
});

test("free translation: decodes entities, caches, and reports the daily limit", async () => {
  await fresh();
  let calls = 0;
  const ok = async () => {
    calls++;
    return new Response(JSON.stringify({ responseStatus: 200, quotaFinished: false, responseData: { translatedText: "She doesn&#39;t like crowds." } }));
  };
  assert.equal(await translate.translate("Elle n'aime pas la foule.", { fetchImpl: ok }), "She doesn't like crowds.");
  assert.equal(await translate.translate("Elle n'aime pas la foule.", { fetchImpl: ok }), "She doesn't like crowds.");
  assert.equal(calls, 1); // second call came from the cache
  const quota = async () => new Response(JSON.stringify({ responseStatus: 429, quotaFinished: true, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" } }));
  await assert.rejects(translate.translate("Autre phrase.", { fetchImpl: quota }), /limit/);
});

test("every Claude call uses Haiku and is counted in the cost meter", async () => {
  await fresh();
  const store = { anthropic_api_key: "sk-test" };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] },
  });
  const realFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (url, opts) => {
    bodies.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: "text", text: JSON.stringify({ translation: "It's raining.", notes: ["impersonal verb"] }) }] }));
  };
  try {
    const r = await content.explainSentence("Il pleut.");
    assert.equal(r.translation, "It's raining.");
    await content.explainSentence("Il pleut."); // cached: no second call
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].model, "claude-haiku-4-5");
    assert.equal(bodies[0].output_config.effort, undefined);
    const u = claude.usageSince(0);
    assert.equal(u.rows[0].purpose, "grammar");
    assert.ok(Math.abs(u.total - (1000 * 1e-6 + 200 * 5e-6)) < 1e-9); // $0.002
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.localStorage;
  }
});

const learn = await import("../web/js/learn.js");
const VERBS = JSON.parse(readFileSync(new URL("../web/dict/verbs.json", import.meta.url)));
learn.setVerbs(VERBS);
const V = (inf, refl = false) => VERBS.find((v) => v.inf === inf && !!v.reflexive === refl);
const line = (inf, tense, person, refl = false) => {
  const v = V(inf, refl);
  const f = learn.forms(v, tense)[person];
  return `${learn.subjectFor(v, tense, person, f)}${f}`;
};

test("conjugation lines: elision, reflexives, être agreement, subjunctive", () => {
  assert.equal(line("aimer", "present", 0), "j'aime");
  assert.equal(line("parler", "present", 0), "je parle");
  assert.equal(line("aller", "subjonctif", 0), "que j'aille");
  assert.equal(line("aller", "subjonctif", 2), "qu'il/elle aille");
  assert.equal(line("aller", "passe_compose", 0), "je suis allé(e)");
  assert.equal(line("aller", "passe_compose", 5), "ils/elles sont allé(e)s");
  assert.equal(line("manger", "passe_compose", 3), "nous avons mangé");
  assert.equal(line("être", "passe_compose", 0), "j'ai été");
  assert.equal(line("lever", "present", 0, true), "je me lève");
  assert.equal(line("lever", "passe_compose", 2, true), "il/elle s'est levé(e)");
  assert.equal(line("amuser", "present", 3, true), "nous nous amusons");
  assert.equal(learn.forms(V("lever", true), "imperatif")[0], "lève-toi");
  assert.equal(learn.forms(V("falloir"), "present")[0], null); // no "je faut"
});

test("checking answers: ignores typed pronouns, tolerates agreement, flags accents", () => {
  const q = (inf, tense, person, refl = false) => ({ verb: V(inf, refl), tense, person, answer: learn.forms(V(inf, refl), tense)[person] });
  assert.equal(learn.checkConj(q("aller", "present", 3), "allons"), "ok");
  assert.equal(learn.checkConj(q("aller", "present", 3), "nous allons"), "ok");
  assert.equal(learn.checkConj(q("aller", "passe_compose", 0), "suis allée"), "ok");
  assert.equal(learn.checkConj(q("aller", "passe_compose", 0), "je suis allé"), "ok");
  assert.equal(learn.checkConj(q("aller", "passe_compose", 0), "ai allé"), "wrong");
  assert.equal(learn.checkConj(q("être", "present", 4), "etes"), "accent");
  assert.equal(learn.checkConj(q("lever", "present", 0, true), "je me lève"), "ok");
});

test("new words skip saved, known and ambiguous forms; mistakes become conj cards once", async () => {
  await fresh();
  const dict = JSON.parse(readFileSync(new URL("../web/dict/fr-en.json", import.meta.url)));
  const first = learn.newWords(dict, "A1", { limit: 5 });
  assert.equal(first.length, 5);
  assert.ok(!first.some((w) => dict.f[w.lemma]));
  learn.markKnown(first[0].lemma);
  learn.learnWord(first[1]);
  const next = learn.newWords(dict, "A1", { limit: 5 }).map((w) => w.lemma);
  assert.ok(!next.includes(first[0].lemma) && !next.includes(first[1].lemma));
  assert.ok(learn.newWords(dict, "A2", { verbsOnly: true, limit: 5 }).every((w) => w.senses.every(([p]) => p === "verb")));

  const qq = { verb: V("aller"), tense: "imparfait", person: 3, answer: "allions" };
  const a = learn.saveConjMistake(qq);
  assert.equal(learn.saveConjMistake(qq), a);
  assert.equal(db.get("SELECT back FROM item WHERE id = ?", [a]).back, "nous allions");
});

const talk = await import("../web/js/talk.js");

test("conversation: Claude opens, corrections become logged mistakes and cards", async () => {
  await fresh();
  const calls = [];
  const fakeClaude = async ({ system, user, purpose }) => {
    calls.push({ system, user, purpose });
    if (calls.length === 1) return { reply: "Bonjour ! Qu'est-ce que je vous sers ?", corrections: [], suggestion: "Je voudrais un café, s'il vous plaît.", goal_done: false };
    return {
      reply: "Très bien, un café. Autre chose ?",
      corrections: [
        { original: "un café noire", suggestion: "un café noir", category: "agreement", explanation: "café is masculine." },
        { original: "not in the text", suggestion: "x", category: "other", explanation: "hallucinated" },
      ],
      suggestion: "Non merci, c'est tout.",
      goal_done: false,
    };
  };
  const id = talk.startConversation(talk.scenarioById("cafe"), "A2");
  let c = talk.getConversation(id);
  await talk.takeTurn(c, null, { claude: fakeClaude });
  assert.equal(c.messages.length, 1);
  assert.match(calls[0].system, /waiter/);
  assert.match(calls[0].system, /A2/);
  assert.equal(calls[0].purpose, "talk");

  await talk.takeTurn(c, "Je veux un café noire", { claude: fakeClaude });
  c = talk.getConversation(id); // reload from the database
  assert.deepEqual(c.messages.map((m) => m.role), ["ai", "me", "ai"]);
  assert.equal(c.messages[1].corrections.length, 1); // the made-up one was dropped
  assert.match(calls[1].user, /Learner: Je veux un café noire/);

  const sub = db.get("SELECT * FROM submission WHERE id = ?", [c.submission_id]);
  assert.equal(sub.modality, "speak");
  const err = db.get("SELECT * FROM error WHERE submission_id = ?", [sub.id]);
  assert.equal(sub.raw_text.slice(err.start, err.end), "un café noire");
  const item = db.get("SELECT * FROM item WHERE kind = 'mistake'");
  assert.equal(item.front, "Je veux [[un café noire]]");
  assert.equal(item.back, "Je veux [[un café noir]]");
  assert.equal(talk.allCorrections(c).length, 1);

  await talk.takeTurn(c, "Je voudrais aussi un croissant", { claude: async () => ({ reply: "D'accord.", corrections: [{ original: "un croissant", suggestion: "un croissant", category: "other", explanation: "x" }], suggestion: "", goal_done: true }) });
  const errs = db.all("SELECT * FROM error WHERE submission_id = ? ORDER BY id", [c.submission_id]);
  assert.equal(sub.raw_text.length + 1 + "Je voudrais aussi ".length, errs[1].start); // offsets continue across messages
  assert.equal(c.messages.at(-1).goalDone, true);
});

const story = await import("../web/js/story.js");

test("feuilleton: episode 1 creates the story; next episodes get a short recap, not the whole story", async () => {
  await fresh();
  const calls = [];
  const fake = async ({ user, purpose }) => {
    calls.push({ user, purpose });
    if (calls.length === 1) return { story_title: "Le mystère du 3e étage", setting: "Lyon today", premise: "A neighbour disappears.", characters: [{ name: "Léa", description: "a curious student" }], title: "Un bruit", body: "Léa entend un bruit.\n\nElle monte au troisième étage.", summary: "Léa entend un bruit bizarre." };
    return { title: `Épisode ${calls.length}`, body: `Texte ${calls.length}.\n\nFin ${calls.length}.`, summary: `Résumé ${calls.length}.` };
  };
  const t1 = await story.startStory("mystery", { claude: fake });
  const s = story.currentStory();
  assert.equal(s.title, "Le mystère du 3e étage");
  assert.equal(story.nextUnreadEpisode().id, t1);
  db.run("UPDATE text SET read_at = 1 WHERE id = ?", [t1]);
  assert.equal(story.nextUnreadEpisode(), null);

  for (let i = 0; i < 14; i++) await story.nextEpisode(s.id, { claude: fake });
  const eps = story.episodes(s.id);
  assert.equal(eps.length, 15);
  assert.deepEqual(eps.map((e) => e.episode), Array.from({ length: 15 }, (_, i) => i + 1));
  const last = calls.at(-1).user;
  assert.match(last, /Write episode 15/);
  assert.match(last, /Fin 14\./); // the end of the previous episode is included
  assert.ok(!last.includes("Texte 2.")); // ...but not old episode texts
  assert.ok(!last.includes("1. Léa entend")); // the recap is capped to recent episodes
  assert.equal(calls.every((c) => c.purpose === "story"), true);
  assert.equal(story.storyOf(eps[3].id).id, s.id);
});

test("typed answers in review: fix and conjugation cards", () => {
  const fix = learn.fixAnswers("Hier, je suis allé au cinéma avec [[mes amies]].");
  assert.equal(learn.checkTyped(fix, "mes amies"), "ok");
  assert.equal(learn.checkTyped(fix, "Mes amies."), "ok"); // case/punctuation forgiven
  assert.equal(learn.checkTyped(fix, "hier, je suis allé au cinéma avec mes amies"), "ok"); // whole sentence also fine
  assert.equal(learn.checkTyped(fix, "mes amie"), "wrong");
  assert.equal(learn.checkTyped(learn.fixAnswers("Le film était [[très intéressant]]."), "tres interessant"), "accent");
  assert.equal(learn.checkTyped(fix, ""), "wrong");

  assert.equal(learn.checkTyped(learn.conjAnswers("nous allions"), "allions"), "ok");
  assert.equal(learn.checkTyped(learn.conjAnswers("nous allions"), "nous allions"), "ok");
  assert.equal(learn.checkTyped(learn.conjAnswers("je suis allé(e)"), "suis allée"), "ok");
  assert.equal(learn.checkTyped(learn.conjAnswers("il/elle s'est levé(e)"), "est levé"), "ok");
  assert.equal(learn.checkTyped(learn.conjAnswers("qu'il/elle aille"), "aille"), "ok");
  assert.equal(learn.checkTyped(learn.conjAnswers("vous êtes"), "etes"), "accent");
  assert.equal(learn.checkTyped(learn.conjAnswers("lève-toi"), "lève-toi"), "ok");
  assert.equal(learn.checkTyped(learn.conjAnswers("nous allions"), "allons"), "wrong");
});

test("a card in a short learning step waits behind other due/new cards", async () => {
  await fresh();
  const t0 = Date.now();
  const ids = ["a", "b"].map((w) => {
    const id = db.run("INSERT INTO item(kind, front, back, created_at) VALUES ('mistake',?,?,?)", [w, w, t0]);
    srs.addCard(id, "fix", t0);
    return id;
  });
  const [first] = srs.queue(10, { itemIds: ids, at: t0 });
  srs.review(first.id, 3, t0); // Good -> back in ~10 minutes
  const q = srs.queue(10, { itemIds: ids, at: t0 + 1000 });
  assert.equal(q.length, 2);
  assert.notEqual(q[0].id, first.id); // the other card comes first
  assert.equal(q[1].id, first.id); // the just-rated one is still in today's session
});

test("free chat: you speak first, tutor prompt allows questions in English", async () => {
  await fresh();
  const calls = [];
  const fake = async ({ system, user }) => {
    calls.push({ system, user });
    return { reply: "Bonne question ! On dit « j'en ai marre ». Et toi, tu en as marre de quoi ?", corrections: [], suggestion: "J'en ai marre du travail.", goal_done: false };
  };
  const id = talk.startConversation(talk.CHAT, "B1");
  const c = talk.getConversation(id);
  assert.equal(c.setup.mode, "chat");
  await talk.takeTurn(c, "How do I say 'I'm fed up'?", { claude: fake });
  assert.match(calls[0].system, /Camille/);
  assert.match(calls[0].system, /in English first/);
  assert.match(calls[0].user, /Learner: How do I say/);
  assert.deepEqual(talk.getConversation(id).messages.map((m) => m.role), ["me", "ai"]);
});
