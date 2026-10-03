import { level } from "../content.js";
import { DAILY_GOAL, compare, fetchBatch, listenedToday, recordAttempt } from "../listen.js";
import { go, html } from "../util.js";

let batch = [];
let batchLevel = null;

export function playerHtml({ big = false } = {}) {
  return html`
    <div class="player${big ? " big" : ""}">
      <button class="play" data-play="1" aria-label="Play">▶</button>
      <button class="secondary slow" data-play="0.7" aria-label="Play slowly">🐢 slow</button>
    </div>`;
}

/** Wire up play buttons inside `el` for one audio clip. */
export function wirePlayer(el, url) {
  const audio = new Audio(url);
  audio.preload = "auto";
  el.querySelectorAll("[data-play]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      audio.pause();
      audio.currentTime = 0;
      audio.playbackRate = Number(b.dataset.play);
      audio.play().catch(() => b.classList.add("error"));
    };
  });
  return audio;
}

export function credit(a) {
  return html`<p class="credit">Voice: <a href="${a.profile}" target="_blank" rel="noopener">${a.author}</a> · ${a.license} · via <a href="https://tatoeba.org" target="_blank" rel="noopener">Tatoeba</a></p>`;
}

export default async function listen(root) {
  const lv = level();
  const done = listenedToday();
  root.innerHTML = html`<h1>Écouter</h1><p class="muted">Fetching sentences…</p>`;

  if (batchLevel !== lv) batch = [];
  if (!batch.length) {
    try {
      batch = await fetchBatch(lv);
      batchLevel = lv;
    } catch (e) {
      root.innerHTML = html`<h1>Écouter</h1><div class="card stack"><p class="error">${e.message}</p><button id="retry">Try again</button></div>`;
      root.querySelector("#retry").onclick = () => go("#/listen");
      return;
    }
  }
  const s = batch[0];
  if (!s) {
    root.innerHTML = html`<h1>Écouter</h1><div class="card">Tatoeba sent no usable sentences. <a href="#/listen">Try again</a></div>`;
    return;
  }

  root.innerHTML = html`
    <header class="row between">
      <h1>Écouter</h1>
      <span class="pill">${Math.min(done, DAILY_GOAL)} / ${DAILY_GOAL} today</span>
    </header>
    <p class="muted small">Listen, then type exactly what you hear. Level ${lv}.</p>
    <div class="card listen-card">
      ${playerHtml({ big: true })}
      <textarea id="typed" rows="3" placeholder="Écris ce que tu entends…" autocapitalize="sentences" spellcheck="false" autocomplete="off"></textarea>
      <div class="row gap" id="actions">
        <button id="check" class="grow">Check</button>
        <button id="hint" class="secondary">Hint</button>
        <button id="reveal" class="secondary">Reveal</button>
      </div>
      <p id="hint-text" class="muted small" hidden>${s.en}</p>
      <div id="result"></div>
    </div>
    ${credit(s.audio)}`;

  const card = root.querySelector(".listen-card");
  const audio = wirePlayer(card, s.audio.url);
  audio.play().catch(() => {}); // autoplay may be blocked until the first tap; that's fine
  const typed = root.querySelector("#typed");
  root.querySelector("#hint").onclick = () => (root.querySelector("#hint-text").hidden = false);

  // Check (scored) or Reveal (counts as not heard): either way show the answer and move on.
  const finish = (answer, revealed) => {
    const r = compare(s.text, answer);
    const score = revealed ? 0 : r.score;
    const { itemId } = recordAttempt(s, answer, score);
    batch.shift();
    typed.readOnly = true;
    root.querySelector("#actions").hidden = true;
    root.querySelector("#hint-text").hidden = true;
    const pct = Math.round(score * 100);
    root.querySelector("#result").innerHTML = html`
      <div class="dictation">
        ${revealed
          ? html`<p class="kind">the answer</p><p class="context">${s.text}</p>`
          : html`
            <p class="score ${pct === 100 ? "perfect" : pct >= 70 ? "good" : "low"}">${pct === 100 ? "Parfait !" : `${pct}%`}</p>
            <p class="context">${r.tokens.map((t) => html`<span class="d-${t.status}">${t.w}</span>${t.w.endsWith("'") ? "" : " "}`)}</p>
            ${r.extra.length ? html`<p class="small muted">Extra words you typed: <s>${r.extra.join(" ")}</s></p>` : ""}
            <p class="small muted">Original: ${s.text}</p>`}
        <p class="accent">${s.en}</p>
        ${itemId ? html`<p class="small muted">Added to your reviews so you hear it again.</p>` : ""}
        <button id="replay" class="secondary wide">▶ Listen again</button>
        <button id="next" class="wide">Next sentence →</button>
      </div>`;
    root.querySelector("#replay").onclick = () => {
      audio.currentTime = 0;
      audio.playbackRate = 1;
      audio.play().catch(() => {});
    };
    root.querySelector("#next").onclick = () => go("#/listen");
  };
  root.querySelector("#check").onclick = () => finish(typed.value.trim(), false);
  root.querySelector("#reveal").onclick = () => finish(typed.value.trim(), true);
  typed.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      root.querySelector("#check")?.click();
    }
  };
}

