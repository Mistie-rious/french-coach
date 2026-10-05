// "Ask Claude": a follow-up chat sheet that already knows what you're looking at (a card, a sentence, a lesson,
// an explanation). Not saved; closing it discards the conversation.
import { converse } from "../claude.js";
import { level, LEVEL_GUIDE } from "../content.js";
import { esc, html, raw, toast } from "../util.js";

const STARTERS = ["Explain it more simply", "Why is it said this way?", "Give me more examples"];

/** Chat text → safe HTML: paragraphs, line breaks and **bold** only. */
export const fmt = (text) =>
  raw(esc(text).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>`).join(""));

const system = (context) => `You are a patient French tutor chatting with an adult English-speaking learner at CEFR ${level()} (${LEVEL_GUIDE[level()]}).
The learner is looking at this in their study app and has a question about it:
---
${context}
---
- Answer in English, in plain, friendly language. Assume they found the explanation above confusing, so use a different angle: a simple rule of thumb, a comparison with English, or a quick example.
- Put French in **bold** with its English meaning. Keep answers short (under ~120 words) unless asked for more.
- If the question is about something else in French, answer that instead. Stay on French learning.`;

/**
 * Open the chat sheet.
 * @param {string} context  plain-text description of what the learner is looking at (sent to Claude, not shown in full)
 * @param {string} label    short line shown at the top, e.g. the sentence being discussed
 */
export function openAsk({ context, label, starters = STARTERS }) {
  document.querySelector(".ask-backdrop")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "ask-backdrop";
  wrap.innerHTML = html`
    <section class="ask" role="dialog" aria-label="Ask a question">
      <header class="row between">
        <strong>✦ Ask a question</strong>
        <button class="link" id="ask-close" aria-label="Close">✕</button>
      </header>
      <p class="ask-ctx small muted">${label}</p>
      <div class="chat" id="ask-chat"></div>
      <div class="chips" id="ask-chips">${starters.map((s) => html`<button class="chip" type="button">${s}</button>`)}</div>
      <div class="row gap compose-row">
        <textarea id="ask-input" rows="1" placeholder="Ask anything about this…" autocapitalize="sentences"></textarea>
        <button id="ask-send" aria-label="Send">➤</button>
      </div>
    </section>`.toString();
  document.body.append(wrap);

  const chat = wrap.querySelector("#ask-chat");
  const input = wrap.querySelector("#ask-input");
  const sendBtn = wrap.querySelector("#ask-send");
  const history = []; // [{role, content}]
  let working = false;

  const close = () => {
    wrap.remove();
    window.removeEventListener("hashchange", close);
  };
  window.addEventListener("hashchange", close);
  wrap.querySelector("#ask-close").onclick = close;
  wrap.onclick = (e) => e.target === wrap && close();

  const bubble = (role, inner) => {
    const b = document.createElement("div");
    b.className = `bubble ${role === "user" ? "me" : "ai"}`;
    b.innerHTML = inner.toString();
    chat.append(b);
    b.scrollIntoView({ block: "end", behavior: "smooth" });
    return b;
  };

  const ask = async (text) => {
    text = text.trim();
    if (!text || working) return;
    working = true;
    sendBtn.disabled = true;
    wrap.querySelector("#ask-chips")?.remove();
    input.value = "";
    bubble("user", html`<p>${text}</p>`);
    history.push({ role: "user", content: text });
    const typing = bubble("ai", html`<p class="typing-dots"><span></span><span></span><span></span></p>`);
    try {
      const answer = await converse({ system: system(context), messages: history.slice(-12), purpose: "ask" });
      history.push({ role: "assistant", content: answer });
      typing.innerHTML = fmt(answer).toString();
    } catch (err) {
      history.pop();
      typing.remove();
      toast(err.message, 5000);
    }
    working = false;
    sendBtn.disabled = false;
    input.focus();
  };

  sendBtn.onclick = () => ask(input.value);
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(input.value);
    }
  };
  wrap.querySelector("#ask-chips").onclick = (e) => {
    const b = e.target.closest(".chip");
    if (b) ask(b.textContent);
  };
  input.focus();
}
