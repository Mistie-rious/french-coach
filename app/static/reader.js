// Tap a word → gloss sheet → save to review.
(() => {
  const { textId, sentences } = window.READER;
  const sheet = document.getElementById("sheet");
  const body = document.getElementById("sheet-body");
  let current = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  async function post(url, data) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.detail || r.statusText);
    return json;
  }

  function open(html) {
    body.innerHTML = html;
    sheet.hidden = false;
  }

  document.querySelector(".reading").addEventListener("click", async (e) => {
    const el = e.target.closest(".w");
    if (!el) return;
    document.querySelectorAll(".w.sel").forEach((x) => x.classList.remove("sel"));
    el.classList.add("sel");
    const word = el.textContent;
    const sentence = sentences[+el.dataset.s];
    current = { el, word, sentence, lemma: el.dataset.l };
    open(`<p class="big">${esc(word)}</p><p class="muted">Looking up…</p>`);
    try {
      const g = await post("/api/gloss", { word, lemma: current.lemma, sentence });
      current.gloss = g;
      open(`
        <p class="big">${esc(word)} <span class="muted">→ ${esc(g.meaning)}</span></p>
        <p><strong>${esc(g.lemma)}</strong> <small class="muted">${esc(g.pos)}${g.gender ? " · " + esc(g.gender) : ""}</small> — ${esc(g.lemma_meaning)}</p>
        ${g.note ? `<p class="note">${esc(g.note)}</p>` : ""}
        <p class="small">${esc(g.example_fr)}<br><span class="muted">${esc(g.example_en)}</span></p>
        <p class="small muted">${esc(g.sentence_en)}</p>
        <button id="save" class="wide">${el.classList.contains("saved") ? "Saved ✓" : "Save to review"}</button>`);
    } catch (err) {
      // No API key / API down: let me type the meaning myself.
      current.gloss = null;
      open(`
        <p class="big">${esc(word)}</p>
        <p class="small muted">Lookup unavailable (${esc(err.message)}). Add it manually:</p>
        <input id="m-lemma" value="${esc(current.lemma)}" placeholder="lemma">
        <input id="m-meaning" placeholder="meaning in English">
        <button id="save" class="wide">Save to review</button>`);
    }
  });

  body.addEventListener("click", async (e) => {
    if (e.target.id !== "save" || !current) return;
    const btn = e.target;
    let gloss = current.gloss;
    if (!gloss) {
      const lemma = document.getElementById("m-lemma").value.trim();
      const meaning = document.getElementById("m-meaning").value.trim();
      if (!lemma || !meaning) return;
      gloss = { lemma, lemma_meaning: meaning, pos: "" };
    }
    btn.disabled = true;
    try {
      const res = await post("/api/save", { word: current.word, sentence: current.sentence, text_id: textId, gloss });
      document.querySelectorAll(".w").forEach((w) => {
        if (w.dataset.l === current.lemma || w.dataset.l === res.lemma) w.classList.add("saved");
      });
      current.el.classList.add("saved");
      btn.textContent = res.created ? "Saved ✓" : "Already saved ✓";
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Error: " + err.message;
    }
  });

  sheet.querySelector(".close").addEventListener("click", () => {
    sheet.hidden = true;
    document.querySelectorAll(".w.sel").forEach((x) => x.classList.remove("sel"));
  });
})();
