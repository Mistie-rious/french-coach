import { all, get } from "../db.js";
import { hasKey } from "../claude.js";
import { correct } from "../correction.js";
import { newPrompt, todaysPrompt, wordTarget } from "../content.js";
import { busy, fmtDay, go, html } from "../util.js";

const DRAFT = "draft";

export function write(root) {
  const p = todaysPrompt();
  const past = all(`SELECT s.id, s.raw_text, s.created_at, COUNT(e.id) AS n FROM submission s
                    LEFT JOIN error e ON e.submission_id = s.id GROUP BY s.id ORDER BY s.created_at DESC LIMIT 30`);
  root.innerHTML = html`
    <h1>Écrire</h1>
    <div class="card prompt">
      <span class="pill">${p.level}</span>
      <p>${p.text}</p>
      <div class="row gap">
        <button class="secondary small-btn" data-change="easier" ${p.level === "A1" ? "disabled" : ""}>Easier</button>
        <button class="secondary small-btn" data-change="harder" ${p.level === "C1" ? "disabled" : ""}>Harder</button>
        <button class="secondary small-btn" data-change="new">New prompt</button>
      </div>
    </div>
    <textarea id="text" rows="10" placeholder="Écris environ ${wordTarget(p.level)} mots…" autocapitalize="sentences" spellcheck="false"></textarea>
    <div class="row between">
      <small class="muted" id="count">0 mots</small>
      <button id="go">Correct it</button>
    </div>
    ${past.length ? html`
      <h2>Past writing</h2>
      <ul class="list">${past.map((s) => html`
        <li><a href="#/write/${s.id}" class="card row between gap">
          <span class="grow ellipsis">${s.raw_text.slice(0, 80)}</span>
          <small class="muted">${fmtDay(s.created_at)}</small>
          <span class="pill">${s.n} err</span>
        </a></li>`)}</ul>` : ""}`;

  const t = root.querySelector("#text");
  const count = root.querySelector("#count");
  try { t.value = localStorage.getItem(DRAFT) || ""; } catch {}
  const upd = () => (count.textContent = `${(t.value.match(/\S+/g) || []).length} / ~${wordTarget(p.level)} mots`);
  t.oninput = () => {
    upd();
    try { localStorage.setItem(DRAFT, t.value); } catch {}
  };
  upd();
  root.querySelectorAll("[data-change]").forEach((b) => {
    b.onclick = () => busy(b, "…", async () => {
      await newPrompt(b.dataset.change, { useClaude: hasKey() });
      go("#/write");
    });
  });
  root.querySelector("#go").onclick = (e) => {
    const text = t.value.trim();
    if (!text) return;
    busy(e.target, "Correcting… (~20s)", async () => {
      const id = await correct(text, p.text, { level: p.level });
      try { localStorage.removeItem(DRAFT); } catch {}
      go(`#/write/${id}`);
    });
  };
}

const GRADER = { claude: "Claude", lt_claude: "LanguageTool + Claude", lt_only: "LanguageTool", claude_only: "Claude" };

export function feedback(root, { params: [id] }) {
  const sub = get("SELECT * FROM submission WHERE id = ?", [Number(id)]);
  if (!sub) return go("#/write");
  const errors = all("SELECT * FROM error WHERE submission_id = ? ORDER BY start", [sub.id]);

  // Split the original into plain / error segments for highlighting.
  const segs = [];
  let pos = 0;
  errors.forEach((e, i) => {
    if (e.start < pos) return; // overlapping; still listed below
    segs.push(sub.raw_text.slice(pos, e.start));
    segs.push(html`<a href="#e${i + 1}" class="err" data-jump="${i + 1}">${sub.raw_text.slice(e.start, e.end)}<sup>${i + 1}</sup></a>`);
    pos = e.end;
  });
  segs.push(sub.raw_text.slice(pos));

  root.innerHTML = html`
    <h1>Correction</h1>
    ${sub.prompt ? html`<p class="muted small">${sub.prompt}</p>` : ""}
    <div class="card reading">${segs}</div>
    ${sub.summary ? html`<div class="card note">${sub.summary}</div>` : ""}
    <h2>${errors.length} correction${errors.length === 1 ? "" : "s"}</h2>
    <ol class="errors">${errors.map((e, i) => html`
      <li id="e${i + 1}" class="card">
        <span class="pill">${i + 1} · ${e.category.replace("_", " ")}</span>
        <p><s>${e.original}</s> → <strong class="good">${e.suggestion}</strong></p>
        ${e.explanation ? html`<p class="small">${e.explanation}</p>` : ""}
      </li>`)}</ol>
    ${sub.corrected_text ? html`<details class="card"><summary>Corrected text</summary><p class="reading">${sub.corrected_text}</p></details>` : ""}
    ${errors.length ? html`<a href="#/review?drill=1" class="button wide">Drill these mistakes →</a>` : html`<a href="#/" class="button wide">Back to today</a>`}
    <p class="muted small center">Checked with ${GRADER[sub.grader] || sub.grader}.</p>`;

  // In-page anchors would fight the hash router; scroll manually.
  root.querySelectorAll("[data-jump]").forEach((a) => {
    a.onclick = (ev) => {
      ev.preventDefault();
      root.querySelector(`#e${a.dataset.jump}`).scrollIntoView({ behavior: "smooth", block: "center" });
    };
  });
}
