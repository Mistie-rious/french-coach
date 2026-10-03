import { all, get, run } from "../db.js";
import { hasKey } from "../claude.js";
import { addText, claudeGloss, generateText, nextBuiltinText, savedLemmas, saveWord } from "../content.js";
import { lemmaCandidates, loadDict, lookup, tokenize } from "../nlp.js";
import { busy, fmtDay, go, html, toast } from "../util.js";

export function readList(root) {
  const texts = all("SELECT id, title, source, created_at, read_at FROM text ORDER BY created_at DESC LIMIT 100");
  root.innerHTML = html`
    <h1>Lire</h1>
    <button id="gen" class="wide">✨ New text at my level</button>
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
          <span class="grow"><strong>${t.title}</strong><small class="muted">${t.source} · ${fmtDay(t.created_at)}</small></span>
          ${t.read_at ? html`<span class="pill ok">read</span>` : html`<span class="pill">new</span>`}
        </a></li>`) : html`<li class="muted">No texts yet.</li>`}
    </ul>`;

  root.querySelector("#gen").onclick = (e) =>
    busy(e.target, hasKey() ? "Writing your text… (~20s)" : "…", async () => {
      let id;
      if (hasKey()) id = await generateText();
      else {
        id = nextBuiltinText();
        if (!id) throw new Error("No built-in texts left. Add a Claude key in Settings, or paste a text.");
        toast("Built-in text (add a Claude key for fresh ones)");
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
  loadDict(); // start fetching in the background

  root.innerHTML = html`
    <h1>${doc.title}</h1>
    <p class="muted small">Tap a word for its meaning; save it to review.</p>
    <article class="reading">${sentences.map((s, si) => s.tokens.map((tok) =>
      tok.w ? html`<span class="w" data-s="${si}">${tok.t}</span>` : tok.t))}</article>
    <div class="row gap">
      <button id="done" class="grow">${doc.read_at ? "Done again ✓" : "Done ✓"}</button>
      <button id="del" class="secondary">Delete</button>
    </div>
    <div id="sheet" class="sheet" hidden>
      <button class="close link" aria-label="Close">✕</button>
      <div id="sheet-body"></div>
    </div>`;

  // Underline words whose lemma is already saved (once the dictionary is loaded).
  const markSaved = () =>
    root.querySelectorAll(".w").forEach((el) => {
      if (lemmaCandidates(el.textContent).some((l) => saved.has(l))) el.classList.add("saved");
    });
  loadDict().then(markSaved, () => {});

  root.querySelector("#done").onclick = () => {
    run("UPDATE text SET read_at = ? WHERE id = ?", [Date.now(), doc.id]);
    go("#/");
  };
  root.querySelector("#del").onclick = () => {
    if (!confirm("Delete this text? Saved words stay.")) return;
    run("DELETE FROM text WHERE id = ?", [doc.id]);
    go("#/read");
  };

  const sheet = root.querySelector("#sheet");
  const sheetBody = root.querySelector("#sheet-body");
  let current = null;
  const open = (h) => {
    sheetBody.innerHTML = h;
    sheet.hidden = false;
  };
  const close = () => {
    sheet.hidden = true;
    root.querySelectorAll(".w.sel").forEach((x) => x.classList.remove("sel"));
    current = null;
  };
  sheet.querySelector(".close").onclick = close;

  root.querySelector(".reading").onclick = async (e) => {
    const el = e.target.closest(".w");
    if (!el) return;
    root.querySelectorAll(".w.sel").forEach((x) => x.classList.remove("sel"));
    el.classList.add("sel");
    const word = el.textContent;
    const sentence = sentences[Number(el.dataset.s)].text;
    const me = (current = { el, word, sentence, gloss: null });

    await loadDict().catch(() => {});
    const entries = lookup(word);
    const renderSheet = (claudePart) => {
      if (current !== me) return;
      open(html`
        <p class="big">${word}</p>
        ${claudePart}
        ${entries.length ? html`
          <p class="small muted">Dictionary</p>
          <ul class="dict">${entries.slice(0, 4).map((d, i) => html`
            <li><span class="grow"><strong>${d.lemma}</strong> <small class="muted inline">${d.pos}${d.gender ? ` · ${d.gender}` : ""}</small> — ${d.gloss}</span>
            <button class="small-btn" data-save-dict="${i}">Save</button></li>`)}</ul>`
          : me.gloss ? "" : html`
          <p class="small muted">Not in the offline dictionary. Add it yourself:</p>
          <input id="m-lemma" value="${lemmaCandidates(word)[0]}" placeholder="dictionary form">
          <input id="m-meaning" placeholder="meaning in English">
          <button class="wide" id="save-manual">Save</button>`}`);
    };

    if (hasKey()) {
      renderSheet(html`<p class="muted">Asking Claude…</p>`);
      try {
        me.gloss = await claudeGloss(word, sentence);
        const g = me.gloss;
        renderSheet(html`
          <p><span class="accent big">${g.meaning}</span></p>
          <p><strong>${g.lemma}</strong> <small class="muted inline">${g.pos}${g.gender ? ` · ${g.gender}` : ""}</small> — ${g.lemma_meaning}</p>
          ${g.note ? html`<p class="note">${g.note}</p>` : ""}
          ${g.example_fr ? html`<p class="small">${g.example_fr}<br><span class="muted">${g.example_en}</span></p>` : ""}
          <p class="small muted">${g.sentence_en}</p>
          <button class="wide" id="save-claude">Save to review</button>`);
      } catch (err) {
        renderSheet(html`<p class="small error">${err.message}</p>`);
      }
    } else {
      renderSheet("");
    }
  };

  sheetBody.onclick = (e) => {
    if (!current) return;
    const b = e.target.closest("button");
    if (!b) return;
    let g = null;
    if (b.id === "save-claude") g = current.gloss;
    else if (b.dataset.saveDict != null) {
      const d = lookup(current.word)[Number(b.dataset.saveDict)];
      g = { lemma: d.lemma, pos: d.pos, gender: d.gender, lemma_meaning: d.gloss, example_fr: d.ex_fr, example_en: d.ex_en };
    } else if (b.id === "save-manual") {
      const lemma = sheetBody.querySelector("#m-lemma").value.trim();
      const meaning = sheetBody.querySelector("#m-meaning").value.trim();
      if (!lemma || !meaning) return;
      g = { lemma, pos: "", gender: "", lemma_meaning: meaning };
    }
    if (!g) return;
    const res = saveWord({ word: current.word, sentence: current.sentence, textId: doc.id, g });
    saved.add(g.lemma);
    markSaved();
    current.el.classList.add("saved");
    b.textContent = res.created ? "Saved ✓" : "Already saved ✓";
    b.disabled = true;
  };
}
