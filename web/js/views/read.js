import { all, get, kvGet, kvSet, run } from "../db.js";
import { hasKey } from "../claude.js";
import {
  LEVELS, addText, claudeGloss, explainSentence, generateText, level, nextBuiltinText, rewriteText,
  savedLemmas, savedSentences, saveSentence, saveWord,
} from "../content.js";
import { lemmaCandidates, loadDict, lookup, tokenize } from "../nlp.js";
import { translate } from "../translate.js";
import { GENRES, currentStory, endStory, episodes, nextEpisode, startStory, storyOf } from "../story.js";
import { t } from "../i18n.js";
import { canSpeak, speakSequence, stopSpeaking } from "../learn.js";
import { busy, esc, fmtDay, go, html, raw, toast } from "../util.js";
import { openAsk } from "./ask.js";

const LENGTH_LABELS = { short: "Short", medium: "Medium", long: "Long" };

export function readList(root) {
  const texts = all("SELECT id, title, source, episode, created_at, read_at FROM text ORDER BY created_at DESC LIMIT 100");
  const length = kvGet("text_length", "medium");
  const story = currentStory();
  const eps = story ? episodes(story.id) : [];
  const unread = eps.find((e) => !e.read_at);
  root.innerHTML = html`
    <h1>Lire</h1>
    <div class="card feuilleton">
      <p class="kind">📖 Le feuilleton</p>
      ${story ? html`
        <p class="big">${story.title}</p>
        <p class="small muted">${GENRES[story.genre]?.emoji || ""} ${GENRES[story.genre]?.fr || ""} · ${eps.length} épisode${eps.length > 1 ? "s" : ""}</p>
        ${unread ? html`<a class="button wide" href="#/read/${unread.id}">Read episode ${unread.episode} →</a>`
          : html`<button class="wide" id="next-ep">✨ Episode ${eps.length + 1}</button>`}
        <details class="small"><summary>Start a different story</summary>
          <div class="chips" id="genres">${Object.entries(GENRES).map(([k, g]) => html`<button class="chip" data-genre="${k}">${g.emoji} ${g.fr}</button>`)}<button class="chip" data-genre="surprise">🎲 Surprise</button></div>
        </details>`
      : html`
        <p class="small muted">A story in episodes, written at your level, with the same characters every day. Pick a genre:</p>
        <div class="chips" id="genres">${Object.entries(GENRES).map(([k, g]) => html`<button class="chip" data-genre="${k}">${g.emoji} ${g.fr}</button>`)}<button class="chip" data-genre="surprise">🎲 Surprise</button></div>`}
    </div>
    <div class="card stack">
      <div class="row gap">
        <label class="grow small muted">Level
          <select id="level">${LEVELS.map((l) => html`<option ${l === level() ? "selected" : ""}>${l}</option>`)}</select></label>
        <label class="grow small muted">Length
          <select id="length">${Object.entries(LENGTH_LABELS).map(([k, v]) => html`<option value="${k}" ${k === length ? "selected" : ""}>${v}</option>`)}</select></label>
      </div>
      <button id="gen" class="wide">✨ New text</button>
    </div>
    <details class="card">
      <summary>Paste a French text</summary>
      <div class="stack">
        <input id="title" placeholder="Title (optional)">
        <textarea id="body" rows="8" placeholder="Colle ton texte ici…"></textarea>
        <button id="add">Add</button>
      </div>
    </details>
    <ul class="list">
      ${texts.length ? texts.map((t) => html`
        <li><a href="#/read/${t.id}" class="card row between">
          <span class="grow"><strong>${t.title}</strong><small class="muted">${t.source === "story" ? `feuilleton · ép. ${t.episode}` : t.source} · ${fmtDay(t.created_at)}</small></span>
          ${t.read_at ? html`<span class="pill ok">read</span>` : html`<span class="pill">new</span>`}
        </a></li>`) : html`<li class="muted">No texts yet.</li>`}
    </ul>`;

  root.querySelector("#genres")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-genre]");
    if (!b) return;
    if (!hasKey()) return toast("The feuilleton needs a Claude key (Settings)");
    busy(b, "Writing episode 1… (~20s)", async () => {
      if (story) endStory(story.id);
      go(`#/read/${await startStory(b.dataset.genre)}`);
    });
  });
  root.querySelector("#next-ep")?.addEventListener("click", (e) => {
    if (!hasKey()) return toast("The feuilleton needs a Claude key (Settings)");
    busy(e.target, "Writing the next episode… (~20s)", async () => go(`#/read/${await nextEpisode(story.id)}`));
  });
  root.querySelector("#level").onchange = (e) => kvSet("level", e.target.value);
  root.querySelector("#length").onchange = (e) => kvSet("text_length", e.target.value);
  root.querySelector("#gen").onclick = (e) =>
    busy(e.target, hasKey() ? "Writing your text… (~20s)" : "…", async () => {
      let id;
      if (hasKey()) id = await generateText({ length: kvGet("text_length", "medium") });
      else {
        id = nextBuiltinText();
        if (!id) throw new Error("No built-in texts left. Add a Claude key in Settings, or paste a text.");
        toast("Built-in text (add a Claude key for texts at your level)");
      }
      go(`#/read/${id}`);
    });
  root.querySelector("#add").onclick = () => {
    const body = root.querySelector("#body").value;
    if (!body.trim()) return;
    go(`#/read/${addText(root.querySelector("#title").value, body, "paste")}`);
  };
}

export function reader(root, { params: [id] }) {
  const doc = get("SELECT * FROM text WHERE id = ?", [Number(id)]);
  if (!doc) return go("#/read");
  const sentences = tokenize(doc.body);
  const saved = savedLemmas();
  const savedSents = savedSentences();
  let mode = kvGet("reader_mode", "word");
  loadDict();

  const story = doc.story_id ? storyOf(doc.id) : null;
  const recap = story ? story.summary.split("\n").filter((l) => Number(l.split(".")[0]) < doc.episode) : [];
  const nextEp = story ? get("SELECT id FROM text WHERE story_id = ? AND episode = ?", [story.id, doc.episode + 1]) : null;
  root.innerHTML = html`
    ${story ? html`<p class="kind">📖 ${story.title} · Épisode ${doc.episode}</p>` : ""}
    <h1>${doc.title}</h1>
    ${recap.length ? html`<details class="card recap"><summary>Précédemment…</summary>${recap.slice(-4).map((l) => html`<p class="small">${l.replace(/^\d+\.\s*/, "")}</p>`)}</details>` : ""}
    <div class="row gap wrap reader-bar">
      <div class="segmented" id="mode">
        <button data-mode="word">Word</button><button data-mode="sentence">Sentence</button>
      </div>
      ${canSpeak() ? html`<button class="secondary small-btn" id="listen">▶ Listen</button>` : ""}
    </div>
    <p class="muted small" id="hint"></p>
    <article class="reading">${sentences.map((s, si) => {
      // Trailing spaces/line breaks go outside the sentence so highlights don't spill onto blank lines.
      // (punctuation and the following line break can share one token, e.g. ".\n\n")
      const tok = (t) => (t.w ? `<span class="w">${esc(t.t)}</span>` : esc(t.t));
      const inner = s.tokens.map(tok).join("");
      const body = inner.replace(/\s+$/, "");
      return html`<span class="sent${savedSents.has(s.text) ? " saved-sent" : ""}" data-s="${si}">${raw(body)}</span>${raw(inner.slice(body.length))}`;
    })}</article>
    ${hasKey() ? html`
      <p class="small muted">Rewrite this text</p>
      <div class="rewrite">
        ${[["easier", "Easier"], ["harder", "Harder"], ["shorter", "Shorter"], ["longer", "Longer"]].map(([k, label]) =>
          html`<button class="secondary" data-rewrite="${k}">${label}</button>`)}
      </div>` : ""}
    ${story && !story.ended_at ? html`<button class="wide" id="next-episode">${nextEp ? "Next episode →" : "✨ Next episode"}</button>` : ""}
    <div class="row gap">
      <button id="done" class="grow">${doc.read_at ? "Done again ✓" : "Done ✓"}</button>
      <button id="del" class="secondary">Delete</button>
    </div>
    <div id="sheet" class="sheet" hidden>
      <button class="close link" aria-label="Close">✕</button>
      <div id="sheet-body"></div>
    </div>`;

  const article = root.querySelector(".reading");
  const setMode = (m) => {
    mode = m;
    kvSet("reader_mode", m);
    root.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    article.classList.toggle("sentence-mode", m === "sentence");
    root.querySelector("#hint").textContent = m === "word" ? "Tap a word for its meaning; save it to review." : "Tap a sentence to translate it; save it to review.";
    close();
  };
  root.querySelector("#mode").onclick = (e) => e.target.dataset.mode && setMode(e.target.dataset.mode);

  // Read the whole text aloud, highlighting each sentence as it's spoken.
  const listenBtn = root.querySelector("#listen");
  let playing = false;
  const stopPlaying = () => {
    playing = false;
    stopSpeaking();
    root.querySelectorAll(".sent.speaking").forEach((x) => x.classList.remove("speaking"));
    if (listenBtn) listenBtn.textContent = "▶ Listen";
  };
  if (listenBtn) listenBtn.onclick = () => {
    if (playing) return stopPlaying();
    playing = true;
    listenBtn.textContent = "■ Stop";
    const spoken = sentences.map((s, i) => [s.text, i]).filter(([t]) => /\p{L}/u.test(t));
    speakSequence(spoken.map(([t]) => t), {
      onStart: (k) => {
        root.querySelectorAll(".sent.speaking").forEach((x) => x.classList.remove("speaking"));
        const el = root.querySelector(`.sent[data-s="${spoken[k][1]}"]`);
        el?.classList.add("speaking");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      onDone: stopPlaying,
    });
  };

  const markSaved = () =>
    root.querySelectorAll(".w").forEach((el) => {
      if (lemmaCandidates(el.textContent).some((l) => saved.has(l))) el.classList.add("saved");
    });
  loadDict().then(markSaved, () => {});

  root.querySelector("#done").onclick = () => {
    run("UPDATE text SET read_at = ? WHERE id = ?", [Date.now(), doc.id]);
    go("#/");
  };
  root.querySelector("#next-episode")?.addEventListener("click", (e) => {
    run("UPDATE text SET read_at = COALESCE(read_at, ?) WHERE id = ?", [Date.now(), doc.id]);
    if (nextEp) return go(`#/read/${nextEp.id}`);
    if (!hasKey()) return toast("The feuilleton needs a Claude key (Settings)");
    busy(e.target, "Writing the next episode… (~20s)", async () => go(`#/read/${await nextEpisode(story.id)}`));
  });
  root.querySelector("#del").onclick = () => {
    if (!confirm(t("Delete this text? Saved words stay."))) return;
    run("DELETE FROM text WHERE id = ?", [doc.id]);
    go("#/read");
  };
  root.querySelectorAll("[data-rewrite]").forEach((b) => {
    b.onclick = () => busy(b, "Rewriting…", async () => go(`#/read/${await rewriteText(doc.id, b.dataset.rewrite)}`));
  });

  // ---- bottom sheet ----
  const sheet = root.querySelector("#sheet");
  const sheetBody = root.querySelector("#sheet-body");
  let current = null;
  const open = (h) => {
    sheetBody.innerHTML = h;
    sheet.hidden = false;
  };
  function close() {
    sheet.hidden = true;
    root.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
    current = null;
  }
  sheet.querySelector(".close").onclick = close;

  article.onclick = (e) => {
    if (mode === "sentence") {
      const s = e.target.closest(".sent");
      if (s) showSentence(s);
    } else {
      const w = e.target.closest(".w");
      if (w) showWord(w);
    }
  };

  // Sheet state: what's selected plus whatever we've fetched for it.
  const select = (el) => {
    root.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
    el.classList.add("sel");
  };
  const translationLine = (me) =>
    me.en ? html`<p class="accent">${me.en}</p>`
    : me.enError ? html`<p class="small muted">${me.enError}</p>`
    : html`<p class="loading small">Translating</p>`;

  async function showSentence(el) {
    select(el);
    const sentence = sentences[Number(el.dataset.s)].text;
    const me = (current = { kind: "sentence", el, sentence, en: null, enError: null, explain: null, explaining: false });
    const render = () => {
      if (current !== me) return;
      open(html`
        <p class="context">${sentence} <button class="say" data-say="${sentence}" aria-label="Play">🔊</button></p>
        ${translationLine(me)}
        ${me.explain ? html`<ul class="notes">${me.explain.notes.map((n) => html`<li>${n}</li>`)}</ul>` : ""}
        ${me.enError && !me.explain ? html`<input id="m-translation" placeholder="Type your own translation">` : ""}
        <div class="row gap">
          <button class="grow" id="save-sentence" ${savedSents.has(sentence) ? "disabled" : ""}>${savedSents.has(sentence) ? "Saved ✓" : "Save sentence"}</button>
          ${hasKey() && !me.explain ? html`<button class="secondary" id="explain">${me.explaining ? "…" : "✦ Explain grammar"}</button>` : ""}
        </div>
        ${hasKey() ? html`<button class="secondary wide" id="chat">💬 Ask Claude a question</button>` : ""}`);
    };
    me.render = render;
    render();
    try {
      me.en = await translate(sentence);
    } catch (err) {
      me.enError = err.message;
    }
    render();
  }

  async function showWord(el) {
    select(el);
    const word = el.textContent;
    const sentence = sentences[Number(el.closest(".sent").dataset.s)].text;
    const me = (current = { kind: "word", el, word, sentence, en: null, enError: null, gloss: null, asking: false });
    await loadDict().catch(() => {});
    const entries = lookup(word);
    const render = () => {
      if (current !== me) return;
      const g = me.gloss;
      open(html`
        <p class="big">${word} <button class="say" data-say="${word}" aria-label="Play">🔊</button>${g ? html` <span class="accent small">→ ${g.meaning}</span>` : ""}</p>
        ${g ? html`
          <p><strong>${g.lemma}</strong> <small class="muted inline">${g.pos}${g.gender ? ` · ${g.gender}` : ""}</small> — ${g.lemma_meaning}</p>
          ${g.note ? html`<p class="note">${g.note}</p>` : ""}
          <button class="wide" id="save-claude">Save to review</button>` : ""}
        ${entries.length ? html`
          <ul class="dict">${entries.slice(0, 4).map((d, i) => html`
            <li><span class="grow"><strong>${d.lemma}</strong> <small class="muted inline">${d.pos}${d.gender ? ` · ${d.gender}` : ""}</small> — ${d.gloss}</span>
            <button class="small-btn" data-save-dict="${i}">Save</button></li>`)}</ul>`
          : g ? "" : html`
          <p class="small muted">Not in the offline dictionary${hasKey() ? " (try Ask Claude)" : ""}, or add it yourself:</p>
          <input id="m-lemma" value="${lemmaCandidates(word)[0]}" placeholder="dictionary form">
          <input id="m-meaning" placeholder="meaning in English">
          <button class="wide" id="save-manual">Save</button>`}
        <p class="small muted">${me.en || (me.enError ? "" : "…")}</p>
        ${hasKey() && !g ? html`<button class="secondary wide" id="ask">${me.asking ? "Asking Claude…" : "✦ Ask Claude (meaning in this sentence)"}</button>` : ""}
        ${hasKey() ? html`<button class="secondary wide" id="chat">💬 Ask Claude a question</button>` : ""}`);
    };
    me.render = render;
    render();
    translate(sentence).then((en) => (me.en = en), (err) => (me.enError = err.message)).then(render);
  }

  sheetBody.onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b || !current) return;
    const me = current;
    if (b.id === "chat") {
      return me.kind === "word"
        ? openAsk({
            label: `${me.word} · in “${me.sentence}”`,
            context: `The learner tapped the French word "${me.word}" in this sentence: "${me.sentence}"${me.en ? ` (translation: ${me.en})` : ""}.${me.gloss ? ` The app's gloss: ${me.gloss.lemma} (${me.gloss.pos}) = ${me.gloss.lemma_meaning}.` : ""}`,
            starters: ["What does it mean here?", "How is it used?", "Give me more examples"],
          })
        : openAsk({
            label: me.sentence,
            context: `French sentence: "${me.sentence}"${me.en || me.explain ? `\nTranslation: ${me.en || me.explain.translation}` : ""}${me.explain ? `\nThe app's grammar notes (the learner may find these confusing):\n- ${me.explain.notes.join("\n- ")}` : ""}`,
          });
    }
    if (b.id === "explain") {
      if (me.explaining) return;
      me.explaining = true;
      me.render();
      try {
        me.explain = await explainSentence(me.sentence);
        me.en ??= me.explain.translation;
      } catch (err) {
        toast(err.message, 4000);
      }
      me.explaining = false;
      return me.render();
    }
    if (b.id === "ask") {
      if (me.asking) return;
      me.asking = true;
      me.render();
      try {
        me.gloss = await claudeGloss(me.word, me.sentence);
      } catch (err) {
        toast(err.message, 4000);
      }
      me.asking = false;
      return me.render();
    }
    let res;
    if (b.id === "save-sentence") {
      const translation = me.en || me.explain?.translation || sheetBody.querySelector("#m-translation")?.value.trim();
      if (!translation) return toast("Add a translation first");
      res = saveSentence({ sentence: me.sentence, translation, notes: me.explain?.notes.join(" · "), textId: doc.id });
      savedSents.add(me.sentence);
      me.el.classList.add("saved-sent");
    } else {
      let g = null;
      if (b.id === "save-claude") g = { ...me.gloss, sentence_en: me.en };
      else if (b.dataset.saveDict != null) {
        const d = lookup(me.word)[Number(b.dataset.saveDict)];
        g = { lemma: d.lemma, pos: d.pos, gender: d.gender, lemma_meaning: d.gloss, example_fr: d.ex_fr, example_en: d.ex_en, sentence_en: me.en };
      } else if (b.id === "save-manual") {
        const lemma = sheetBody.querySelector("#m-lemma").value.trim();
        const meaning = sheetBody.querySelector("#m-meaning").value.trim();
        if (!lemma || !meaning) return;
        g = { lemma, pos: "", gender: "", lemma_meaning: meaning, sentence_en: me.en };
      }
      if (!g) return;
      res = saveWord({ word: me.word, sentence: me.sentence, textId: doc.id, g });
      saved.add(g.lemma);
      markSaved();
      me.el.classList.add("saved");
    }
    b.textContent = res.created ? "Saved ✓" : "Already saved ✓";
    b.disabled = true;
  };

  setMode(mode);
}
