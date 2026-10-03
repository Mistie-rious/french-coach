import { all, kvGet, kvSet } from "../db.js";
import { hasKey } from "../claude.js";
import { level } from "../content.js";
import { canSpeak, speak, stopSpeaking } from "../learn.js";
import { SCENARIOS, allCorrections, endConversation, getConversation, scenarioById, startConversation, takeTurn } from "../talk.js";
import { translate } from "../translate.js";
import { busy, fmtDay, go, html, mark, toast } from "../util.js";

const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
const autoplay = () => kvGet("talk_autoplay", true);

// ---------- scenario picker ----------

export function talkHome(root) {
  const past = all("SELECT id, title, setup, created_at, ended_at, messages FROM conversation ORDER BY created_at DESC LIMIT 15");
  root.innerHTML = html`
    <h1>Parler</h1>
    ${hasKey() ? "" : html`<div class="card warn">Conversations need a Claude key. <a href="#/settings">Add one in Settings →</a></div>`}
    <p class="muted small">Pick a situation. Claude plays the other person at your level (${level()}). Type or speak; corrections are saved for review.</p>
    <div class="scenarios">${SCENARIOS.map((s) => html`
      <button class="scenario" data-s="${s.id}"><span class="emoji">${s.emoji}</span><span>${s.title}</span></button>`)}
      <button class="scenario" data-s="custom"><span class="emoji">✏️</span><span>Ma situation</span></button>
    </div>
    <div class="card stack" id="custom" hidden>
      <strong>Describe the situation</strong>
      <textarea id="custom-text" rows="3" placeholder="e.g. Returning a jacket that's too small to a clothes shop"></textarea>
      <button id="custom-go">Start</button>
    </div>
    ${past.length ? html`
      <h2>Recent conversations</h2>
      <ul class="list">${past.map((c) => {
        const n = JSON.parse(c.messages).filter((m) => m.role === "me").length;
        return html`<li><a class="card row between gap" href="#/talk/${c.id}">
          <span class="grow"><strong>${JSON.parse(c.setup).emoji || "💬"} ${c.title}</strong><small class="muted">${fmtDay(c.created_at)} · ${n} message${n === 1 ? "" : "s"}${c.ended_at ? " · finished" : ""}</small></span>
          <span class="chev">→</span></a></li>`;
      })}</ul>` : ""}`;

  const begin = (scenario) => {
    if (!hasKey()) return toast("Add a Claude key in Settings first");
    go(`#/talk/${startConversation(scenario, level())}`);
  };
  root.querySelector(".scenarios").onclick = (e) => {
    const b = e.target.closest("[data-s]");
    if (!b) return;
    if (b.dataset.s === "custom") {
      root.querySelector("#custom").hidden = false;
      root.querySelector("#custom-text").focus();
    } else begin(scenarioById(b.dataset.s));
  };
  root.querySelector("#custom-go").onclick = () => {
    const text = root.querySelector("#custom-text").value.trim();
    if (!text) return;
    begin({ id: "custom", emoji: "✏️", title: text.length > 40 ? `${text.slice(0, 38)}…` : text,
      role: "whoever the learner would naturally be talking to in this situation", setting: text,
      goal: "Handle the situation successfully.", register: "vous" });
  };
}

// ---------- chat ----------

export async function talkChat(root, { params: [id] }) {
  const c = getConversation(Number(id));
  if (!c) return go("#/talk");

  root.innerHTML = html`
    <header class="chat-head">
      <a href="#/talk" class="back">← Parler</a>
      <h1>${c.setup.emoji} ${c.title}</h1>
      <p class="small muted goal">🎯 ${c.setup.goal}</p>
      <label class="small muted autoplay"><input type="checkbox" id="autoplay" ${autoplay() ? "checked" : ""}> Read replies aloud</label>
    </header>
    <div id="chat" class="chat"></div>
    <div id="composer" class="composer" ${c.ended_at ? "hidden" : ""}>
      <div class="row gap">
        <button class="secondary small-btn" id="hint">💡 Hint</button>
        <span class="grow"></span>
        <button class="secondary small-btn" id="end">Finish</button>
      </div>
      <div class="row gap compose-row">
        <textarea id="say" rows="1" placeholder="Écris ou parle en français…" autocapitalize="sentences" spellcheck="false"></textarea>
        ${Recognition ? html`<button class="mic secondary" id="mic" aria-label="Speak">🎤</button>` : ""}
        <button id="send" aria-label="Send">➤</button>
      </div>
      ${Recognition ? "" : html`<p class="tiny muted">Tip: use the 🎤 on your keyboard (French keyboard) to dictate.</p>`}
    </div>
    <div id="summary"></div>`;

  const chat = root.querySelector("#chat");
  const input = root.querySelector("#say");
  const sendBtn = root.querySelector("#send");
  root.querySelector("#autoplay").onchange = (e) => kvSet("talk_autoplay", e.target.checked);

  const renderMessages = () => {
    chat.innerHTML = html`${c.messages.map((m, i) => m.role === "ai"
      ? html`
        <div class="bubble ai" data-i="${i}">
          <p>${m.text}</p>
          <div class="bubble-tools">
            ${canSpeak() ? html`<button class="say" data-say="${m.text}" aria-label="Play">🔊</button>` : ""}
            <button class="say" data-en="${i}" aria-label="Translate">🇬🇧</button>
          </div>
          <p class="small muted en" hidden></p>
        </div>`
      : html`
        <div class="bubble me">
          <p>${m.text}</p>
          ${m.corrections == null ? html`<p class="tiny muted">…</p>`
            : m.corrections.length ? html`
              <details class="fixes"><summary>${m.corrections.length} fix${m.corrections.length > 1 ? "es" : ""}</summary>
                ${m.corrections.map((e) => html`<p class="small"><s>${e.original}</s> → <b>${e.suggestion}</b><br><span class="muted">${e.explanation}</span></p>`)}
              </details>`
            : html`<p class="tiny ok-mark">✓ parfait</p>`}
        </div>`)}`;
    chat.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  chat.onclick = (e) => {
    const b = e.target.closest("[data-en]");
    if (!b) return;
    const bubble = b.closest(".bubble");
    const out = bubble.querySelector(".en");
    if (!out.hidden) return (out.hidden = true);
    translate(c.messages[Number(b.dataset.en)].text).then((en) => { out.textContent = en; out.hidden = false; }, (err) => toast(err.message));
  };

  const thinking = (on) => {
    sendBtn.disabled = on;
    chat.querySelector(".typing")?.remove();
    if (on) chat.insertAdjacentHTML("beforeend", `<div class="bubble ai typing"><p><span></span><span></span><span></span></p></div>`);
    chat.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const turn = async (said) => {
    thinking(true);
    try {
      await takeTurn(c, said);
      renderMessages();
      const last = c.messages.at(-1);
      if (autoplay() && canSpeak()) speak(last.text);
      if (last.goalDone && !c.goalToastShown) {
        c.goalToastShown = true;
        toast("🎯 Goal reached! Keep chatting or tap Finish.", 4000);
      }
    } catch (err) {
      renderMessages();
      toast(err.message, 5000);
    } finally {
      thinking(false);
    }
  };

  renderMessages();
  if (!c.messages.length && !c.ended_at) turn(null); // Claude opens the scene
  if (c.ended_at) showSummary();

  const send = () => {
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = "";
    autosize();
    stopSpeaking();
    c.messages.push({ role: "me", text });
    renderMessages();
    c.messages.pop(); // takeTurn adds it for real (and saves)
    turn(text);
  };
  sendBtn.onclick = send;
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };
  const autosize = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  };
  input.oninput = autosize;

  root.querySelector("#hint").onclick = () => {
    const s = [...c.messages].reverse().find((m) => m.role === "ai")?.suggestion;
    if (!s) return toast("No hint yet");
    toast(`💡 ${s}`, 6000);
  };

  // Speech recognition (French). Tap to start, tap again to stop; you can edit before sending.
  const mic = root.querySelector("#mic");
  let rec = null;
  if (mic) mic.onclick = () => {
    if (rec) return rec.stop();
    stopSpeaking();
    rec = new Recognition();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = false;
    const before = input.value ? `${input.value.trim()} ` : "";
    rec.onresult = (e) => {
      input.value = before + Array.from(e.results).map((r) => r[0].transcript).join("");
      autosize();
    };
    rec.onerror = (e) => toast(e.error === "not-allowed" ? "Microphone access was blocked" : `Speech recognition: ${e.error}`);
    rec.onend = () => { rec = null; mic.classList.remove("on"); };
    mic.classList.add("on");
    rec.start();
  };

  root.querySelector("#end").onclick = () => {
    stopSpeaking();
    endConversation(c);
    c.ended_at = Date.now();
    root.querySelector("#composer").hidden = true;
    showSummary();
  };

  function showSummary() {
    const fixes = allCorrections(c);
    const said = c.messages.filter((m) => m.role === "me").length;
    root.querySelector("#summary").innerHTML = html`
      <div class="card stack summary">
        <p class="score ${fixes.length ? "" : "good"}">${fixes.length ? "Bien joué !" : "Parfait !"}</p>
        <p>You sent ${said} message${said === 1 ? "" : "s"}${fixes.length ? ` with ${fixes.length} thing${fixes.length > 1 ? "s" : ""} to fix. They're in your reviews now.` : " without a single mistake."}</p>
        ${fixes.map((e) => html`<div class="fix-line"><p class="small">${mark(e.said.replace(e.original, `[[${e.original}]]`))}</p><p class="small"><b>${e.suggestion}</b> · <span class="muted">${e.explanation}</span></p></div>`)}
        <a class="button wide" href="#/talk">Another conversation</a>
      </div>`;
  }
}
