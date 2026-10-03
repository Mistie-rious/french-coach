import { all, exportBytes, importBytes, kvGet, kvSet, run, saveNow } from "../db.js";
import { getKey, setKey, structured } from "../claude.js";
import { LEVELS } from "../content.js";
import { stats as getStats } from "../progress.js";
import { busy, fmtDay, go, html, localDate, mark, toast } from "../util.js";

// ---------- stats ----------

export function stats(root) {
  const s = getStats();
  const max = Math.max(1, ...s.top.map((t) => t.n));
  root.innerHTML = html`
    <h1>Moi</h1>
    <div class="tiles">
      <div class="card tile"><strong>${s.streak}</strong><small>day streak</small></div>
      <div class="card tile"><strong>${s.known}</strong><small>words known<br><span class="muted">of ${s.saved} saved</span></small></div>
      <div class="card tile"><strong>${s.retention == null ? "–" : `${s.retention}%`}</strong><small>recall (30d)</small></div>
    </div>
    <h2>Last 4 weeks</h2>
    <div class="card heat">${s.last28.map((d) => html`<span class="${d.active ? "on" : ""}" title="${d.date}"></span>`)}</div>
    <h2>Top mistakes this week</h2>
    <div class="card">
      ${s.top.length ? s.top.map((t) => html`
        <div class="bar"><span>${t.category.replace("_", " ")}</span><span class="track"><span style="width:${Math.round((100 * t.n) / max)}%"></span></span><span class="n">${t.n}</span></div>`)
        : html`<p class="muted">No mistakes logged this week.</p>`}
    </div>
    <a href="#/data" class="card row between"><span>💾 My data & backup</span><span class="chev">›</span></a>
    <a href="#/settings" class="card row between"><span>⚙︎ Settings</span><span class="chev">›</span></a>`;
}

// ---------- my data ----------

const TABS = { words: "Words", sentences: "Sentences", mistakes: "Mistakes", writing: "Writing" };

export function data(root, { query }) {
  const tab = TABS[query.get("tab")] ? query.get("tab") : "words";
  const q = (query.get("q") || "").trim();
  const like = `%${q}%`;
  let rows = [];
  if (tab === "words") {
    rows = all(`SELECT item.*, card.due, card.state, card.stability FROM item LEFT JOIN card ON card.item_id = item.id
                WHERE kind = 'word' AND (? = '' OR front LIKE ? OR back LIKE ? OR lemma LIKE ?) ORDER BY item.created_at DESC`, [q, like, like, like]);
  } else if (tab === "sentences") {
    rows = all(`SELECT * FROM item WHERE kind = 'sentence' AND (? = '' OR front LIKE ? OR back LIKE ?) ORDER BY created_at DESC`, [q, like, like]);
  } else if (tab === "mistakes") {
    rows = all(`SELECT * FROM item WHERE kind = 'mistake' AND (? = '' OR front LIKE ? OR back LIKE ? OR category LIKE ?) ORDER BY created_at DESC`, [q, like, like, like]);
  } else {
    rows = all(`SELECT * FROM submission WHERE (? = '' OR raw_text LIKE ?) ORDER BY created_at DESC`, [q, like]);
  }
  const lastBackup = kvGet("last_backup_at", 0);

  root.innerHTML = html`
    <h1>My data</h1>
    <div class="card stack">
      <p class="small muted">Everything lives on this phone. ${lastBackup ? `Last backup: ${fmtDay(lastBackup)}.` : "No backup yet."}
        The backup is a SQLite file — open it with any SQLite viewer (e.g. DB Browser for SQLite).</p>
      <button id="backup" class="wide">💾 Back up now</button>
      <div class="row gap">
        <button id="csv" class="secondary grow">Export CSV</button>
        <label class="button secondary grow">Restore…<input id="restore" type="file" accept=".db,.sqlite,application/octet-stream" hidden></label>
      </div>
    </div>
    <div class="tabs">${Object.entries(TABS).map(([k, label]) => html`<a href="#/data?tab=${k}" class="${k === tab ? "on" : ""}">${label}</a>`)}</div>
    <input id="q" type="search" placeholder="Search…" value="${q}">
    <p class="small muted">${rows.length} ${TABS[tab].toLowerCase()}</p>
    <ul class="list">${rows.map((r) => (tab === "writing" ? writingRow(r) : itemRow(r)))}</ul>`;

  root.querySelector("#q").onchange = (e) => go(`#/data?tab=${tab}&q=${encodeURIComponent(e.target.value)}`);
  root.querySelector("#backup").onclick = (e) => busy(e.target, "Preparing…", backup);
  root.querySelector("#csv").onclick = exportCsv;
  root.querySelector("#restore").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !confirm("Replace ALL data on this phone with this backup?")) return;
    try {
      await importBytes(new Uint8Array(await file.arrayBuffer()));
      toast("Restored ✓");
      go("#/");
    } catch (err) {
      toast(err.message, 5000);
    }
  };

  root.querySelector(".list").onclick = (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const li = b.closest("li");
    const id = Number(li.dataset.id);
    const act = b.dataset.act;
    if (act === "edit") li.classList.toggle("editing");
    else if (act === "save") {
      const v = (n) => li.querySelector(`[name=${n}]`).value;
      run("UPDATE item SET front = ?, back = ?, note = ? WHERE id = ?", [v("front"), v("back"), v("note") || null, id]);
      toast("Saved");
      go(location.hash);
    } else if (act === "suspend") {
      run("UPDATE item SET suspended = 1 - suspended WHERE id = ?", [id]);
      go(location.hash);
    } else if (act === "delete" && confirm("Delete permanently, including its review history?")) {
      run(tab === "writing" ? "DELETE FROM submission WHERE id = ?" : "DELETE FROM item WHERE id = ?", [id]);
      go(location.hash);
    }
  };
}

function itemRow(r) {
  const learned = r.state === 2 && r.stability >= 21;
  return html`
    <li class="card data-row ${r.suspended ? "suspended" : ""}" data-id="${r.id}">
      <div class="row between gap">
        <div class="grow">
          ${r.kind === "word" ? html`<strong>${r.front}</strong> — ${r.back}`
            : r.kind === "sentence" ? html`<span>${r.front}</span><br><span class="muted">${r.back}</span>`
            : html`<span>${mark(r.front)}</span><br><span class="good">${mark(r.back)}</span>`}
          <small class="muted">${r.kind === "word" ? (learned ? "known" : r.due ? "learning" : "") : r.kind === "sentence" ? "sentence" : (r.category || "").replace("_", " ")}
            ${r.suspended ? " · removed from reviews" : ""} · ${fmtDay(r.created_at)}</small>
        </div>
        <button class="link" data-act="edit">✎</button>
      </div>
      <div class="edit stack">
        <label class="small muted">Front<input name="front" value="${r.front}"></label>
        <label class="small muted">Back<input name="back" value="${r.back}"></label>
        <label class="small muted">Note<textarea name="note" rows="2">${r.note || ""}</textarea></label>
        ${r.context ? html`<p class="small">${mark(r.context)}</p>` : ""}
        <div class="row gap">
          <button data-act="save" class="grow">Save</button>
          <button data-act="suspend" class="secondary">${r.suspended ? "Restore" : "Remove"}</button>
          <button data-act="delete" class="secondary danger">Delete</button>
        </div>
      </div>
    </li>`;
}

const writingRow = (r) => html`
  <li class="card" data-id="${r.id}">
    <a href="#/write/${r.id}" class="ellipsis block">${r.raw_text.slice(0, 120)}</a>
    <div class="row between"><small class="muted">${fmtDay(r.created_at)} · ${r.grader}</small><button class="link small" data-act="delete">Delete</button></div>
  </li>`;

async function backup() {
  await saveNow();
  const name = `french-coach-${localDate()}.db`;
  const file = new File([exportBytes()], name, { type: "application/octet-stream" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      if (e.name === "AbortError") return; // user cancelled the share sheet
      throw e;
    }
  } else {
    download(file, name);
  }
  kvSet("last_backup_at", Date.now());
  toast("Backup ready ✓");
  go(location.hash);
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportCsv() {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = (rows, cols) => [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  const sentences = all("SELECT front AS french, back AS english, note, datetime(created_at/1000, 'unixepoch') AS created FROM item WHERE kind = 'sentence' ORDER BY created_at");
  const words = all("SELECT lemma, front, back, context, context_en, note, suspended, datetime(created_at/1000, 'unixepoch') AS created FROM item WHERE kind = 'word' ORDER BY created_at");
  const mistakes = all("SELECT category, front AS wrong, back AS right, note AS explanation, datetime(created_at/1000, 'unixepoch') AS created FROM item WHERE kind = 'mistake' ORDER BY created_at");
  const d = localDate();
  download(new Blob(["﻿" + csv(words, ["lemma", "front", "back", "context", "context_en", "note", "suspended", "created"])], { type: "text/csv" }), `words-${d}.csv`);
  setTimeout(() => download(new Blob(["﻿" + csv(mistakes, ["category", "wrong", "right", "explanation", "created"])], { type: "text/csv" }), `mistakes-${d}.csv`), 500);
  if (sentences.length) setTimeout(() => download(new Blob(["\ufeff" + csv(sentences, ["french", "english", "note", "created"])], { type: "text/csv" }), `sentences-${d}.csv`), 1000);
}

// ---------- settings ----------

export function settingsView(root) {
  const key = getKey();
  root.innerHTML = html`
    <h1>Settings</h1>
    <div class="card stack">
      <strong>Claude API key</strong>
      <p class="small muted">Stored only on this phone (not in backups). Get one at console.anthropic.com and set a monthly spend limit there.</p>
      <input id="key" type="password" placeholder="sk-ant-…" value="${key}" autocomplete="off">
      <div class="row gap">
        <button id="save-key" class="grow">Save key</button>
        <button id="test-key" class="secondary">Test</button>
      </div>
    </div>
    <div class="card stack">
      <label>Level
        <select id="level">${LEVELS.map((l) => html`<option ${l === kvGet("level", "B1") ? "selected" : ""}>${l}</option>`)}</select>
      </label>
      <label>Warm-up review size<input id="cap" type="number" min="5" max="200" value="${kvGet("review_cap", 20)}"></label>
      <label>New cards per day<input id="newpd" type="number" min="0" max="100" value="${kvGet("new_per_day", 15)}"></label>
      <button id="save-prefs">Save</button>
    </div>`;

  root.querySelector("#save-key").onclick = () => {
    setKey(root.querySelector("#key").value);
    toast(getKey() ? "Key saved ✓" : "Key removed");
  };
  root.querySelector("#test-key").onclick = (e) =>
    busy(e.target, "Testing…", async () => {
      setKey(root.querySelector("#key").value);
      const r = await structured({
        system: "Reply in French.",
        user: "Say hello in three words.",
        schema: { type: "object", properties: { reply: { type: "string" } } },
        fast: true,
        maxTokens: 200,
      });
      toast(`Works ✓ Claude says: ${r.reply}`, 4000);
    });
  root.querySelector("#save-prefs").onclick = () => {
    kvSet("level", root.querySelector("#level").value);
    kvSet("review_cap", Math.max(5, Number(root.querySelector("#cap").value) || 20));
    kvSet("new_per_day", Math.max(0, Number(root.querySelector("#newpd").value) || 0));
    toast("Saved ✓");
  };
}
