import { run } from "../db.js";
import { previews, queue, review, settings } from "../srs.js";
import { myItemIds, reviewedToday, todaysMistakeIds } from "../progress.js";
import { fmtInterval, go, html, mark } from "../util.js";
import { t } from "../i18n.js";
import { credit, playerHtml, wirePlayer } from "./listen.js";
import { checkTyped, conjAnswers, gradeFix } from "../learn.js";
import { judgeFix } from "../correction.js";
import { hasKey } from "../claude.js";
import { level } from "../content.js";
import { compare } from "../listen.js";
import { openAsk } from "./ask.js";

export default function reviewView(root, { query }) {
  const drill = query.get("drill") === "1";
  const mine = query.get("mine") === "1";
  const more = query.get("more") === "1";
  const cap = settings().reviewCap;
  const reviewed = reviewedToday();
  const cards = drill
    ? queue(100, { itemIds: todaysMistakeIds() })
    : mine ? queue(100, { itemIds: myItemIds() })
    : reviewed >= cap && !more ? [] : queue(cap);
  const self = `#/review${drill ? "?drill=1" : mine ? "?mine=1" : more ? "?more=1" : ""}`;
  const title = drill ? "Drill" : mine ? "My words" : "Review";
  const card = cards[0];

  if (!card) {
    root.innerHTML = html`
      <h1>${title}</h1>
      <div class="card center stack">
        ${drill ? html`<p>No mistakes left to drill today. 👌</p>`
          : mine ? html`<p>None of your words are due right now. 👌</p><a href="#/learn/add">Add more →</a>`
          : reviewed >= cap && !more ? html`<p>Warm-up done: ${reviewed} cards today.</p><a href="#/review?more=1">Keep going →</a>`
          : html`<p>Nothing due. 🎉</p>`}
        <a href="#/">Back to today</a>
      </div>`;
    return;
  }

  const p = previews(card);
  const checkable = card.kind === "mistake" || card.kind === "conj" || card.kind === "dictation";
  const audio = card.audio ? JSON.parse(card.audio) : null;
  const say = (t) => html`<button class="say" data-say="${t.replace(/\[\[|\]\]/g, "")}" aria-label="Pronounce">🔊</button>`;
  const body = card.kind === "conj"
    ? html`
        <p class="kind">conjugate</p>
        <p class="big">${card.front.split(" · ")[0]}</p>
        <p class="context">${card.front.split(" · ").slice(1).join(" · ")} → ?</p>
        <div class="answer">
          <p class="big accent">${card.back} ${say(card.back)}</p>
          ${card.note ? html`<p class="small muted">${card.note}</p>` : ""}
          <a class="small" href="#/learn/verb/${encodeURIComponent(card.lemma || "")}">Full table →</a>
        </div>`
    : card.kind === "dictation"
    ? html`
        <p class="kind">listen · what do you hear?</p>
        ${playerHtml()}
        <div class="answer">
          <p class="context">${card.front}</p>
          <p class="accent">${card.back}</p>
          ${credit(audio)}
        </div>`
    : card.kind === "sentence"
    ? html`
        <p class="kind">sentence · translate it</p>
        <p class="context">${card.front} ${say(card.front)}</p>
        <div class="answer">
          <p class="context accent">${card.back}</p>
          ${card.note ? html`<p class="note">${card.note}</p>` : ""}
        </div>`
    : card.kind === "word"
    ? html`
        <p class="kind">word</p>
        ${card.context ? html`<p class="context">${mark(card.context)} ${say(card.context)}</p>` : html`<p class="big">${card.front} ${say(card.front.replace(/ \([mf]\)$/, ""))}</p>`}
        <div class="answer">
          <p class="big">${card.front} ${say(card.front.replace(/ \([mf]\)$/, ""))}</p>
          <p class="big accent">${card.back}</p>
          ${card.context_en ? html`<p class="muted">${card.context_en}</p>` : ""}
          ${card.note ? html`<p class="note">${card.note}</p>` : ""}
        </div>`
    : html`
        <p class="kind">fix the mistake · ${(card.category || "").replace("_", " ")}</p>
        <p class="context">${mark(card.front)}</p>
        <p class="small muted">Type the correct version of the highlighted part:</p>
        <div class="answer">
          <p class="context good">${mark(card.back)} ${say(card.back)}</p>
          ${card.note ? html`<p class="note">${card.note}</p>` : ""}
        </div>`;

  root.innerHTML = html`
    <header class="row between">
      <h1>${title}</h1>
      <span class="pill">${cards.length} left</span>
    </header>
    <div class="card flash" id="flash">${body}</div>
    ${checkable ? html`
      <div class="answer-box" id="answer-box">
        <input id="typed" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${card.kind === "dictation" ? "Type what you hear…" : "Your answer…"}">
        <div class="row gap">
          <button class="grow" id="check">Check</button>
          <button class="secondary" id="show">I don't know</button>
        </div>
      </div>` : html`<button id="show" class="wide">Show answer</button>`}
    <div class="ratings" id="ratings">
      ${[["Again", 1], ["Hard", 2], ["Good", 3], ["Easy", 4]].map(([label, r]) =>
        html`<button data-r="${r}" class="r${r}">${label}<small>${fmtInterval(p[r])}</small></button>`)}
    </div>
    <p class="center">
      ${hasKey() ? html`<button class="link small" id="ask-card">✦ Ask a question</button> · ` : ""}<button class="link small" id="remove">Remove card</button>
    </p>
  `;

  const flash = root.querySelector("#flash");
  if (audio) wirePlayer(flash, audio.url).play().catch(() => {});
  const show = root.querySelector("#show");
  const ratings = root.querySelector("#ratings");
  let suggested = null;
  const reveal = () => {
    flash.classList.add("revealed");
    ratings.classList.add("visible");
    show.hidden = true;
    const box = root.querySelector("#answer-box");
    if (box) box.hidden = true;
  };
  // Typed answers: check, show a verdict, and highlight the rating that fits.
  const typed = root.querySelector("#typed");
  // verdict: "ok" | "almost" | "wrong"; shown above the correct answer, with the fitting rating outlined.
  const slot = document.createElement("div");
  const showVerdict = (verdict, answer, { note = "", detail = "", better = "", checking = false } = {}) => {
    suggested = verdict === "ok" ? 3 : verdict === "almost" ? 2 : 1;
    slot.innerHTML = html`
      <div class="verdict ${verdict}">
        <p class="score">${verdict === "ok" ? "Juste !" : verdict === "almost" ? "Presque !" : "Pas tout à fait"}</p>
        ${verdict !== "ok" ? html`<p class="small">You wrote: <s>${answer}</s></p>` : html`<p class="small">You wrote: ${answer}</p>`}
        ${note ? html`<p class="small">${note}</p>` : ""}
        ${better ? html`<p class="small good">${better}</p>` : ""}
        ${checking ? html`<p class="small muted loading">Claude is checking your version</p>` : ""}
        ${detail}
      </div>`;
    ratings.querySelectorAll(".suggest").forEach((x) => x.classList.remove("suggest"));
    ratings.querySelector(`[data-r="${suggested}"]`)?.classList.add("suggest");
  };
  const check = async () => {
    const answer = typed.value.trim();
    if (!answer) return typed.focus();
    flash.querySelector(".answer").before(slot);
    if (card.kind === "dictation") {
      const r = compare(card.front, answer);
      const verdict = r.score >= 1 ? "ok" : r.score >= 0.7 ? "almost" : "wrong";
      showVerdict(verdict, answer, { detail: html`<p class="context">${r.tokens.map((x) => html`<span class="d-${x.status}">${x.w}</span>${x.w.endsWith("'") ? "" : " "}`)}</p>` });
    } else if (card.kind === "conj") {
      const v = checkTyped(conjAnswers(card.back), answer);
      showVerdict(v === "accent" ? "almost" : v, answer, { note: v === "accent" ? "Check the accents." : "" });
    } else {
      // Fix-the-mistake: free local check first (exact / accents / one word off), then Claude judges anything else,
      // so a different-but-natural correction still counts.
      const local = gradeFix(card.back, answer);
      const askClaude = local.verdict !== "ok" && hasKey();
      showVerdict(local.verdict, answer, { note: local.note, checking: askClaude });
      reveal();
      if (askClaude) {
        try {
          const j = await judgeFix({ front: card.front, back: card.back, answer, level: level() });
          const verdict = j.verdict === "correct" ? "ok" : j.verdict;
          showVerdict(verdict, answer, { note: j.feedback, better: verdict === "ok" ? "" : j.better });
        } catch (err) {
          showVerdict(local.verdict, answer, { note: local.note });
        }
      }
      return;
    }
    reveal();
  };
  root.querySelector("#check")?.addEventListener("click", check);
  if (typed) {
    typed.focus();
    typed.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        check();
      }
    };
  }
  const rate = (r) => {
    review(card.id, r);
    go(self);
  };
  show.onclick = reveal;
  flash.onclick = (e) => !checkable && !e.target.closest("[data-say], a") && reveal();
  ratings.onclick = (e) => {
    const b = e.target.closest("button[data-r]");
    if (b) rate(Number(b.dataset.r));
  };
  const askCard = root.querySelector("#ask-card");
  if (askCard) askCard.onclick = () => {
    // Don't give away the answer to the learner by accident: the chat is for after (or instead of) revealing,
    // and Claude is told which side the learner has seen.
    const seen = flash.classList.contains("revealed") ? "has already seen the answer" : "has NOT revealed the answer yet; explain without just giving it away unless asked";
    const lines = [
      `Flashcard type: ${card.kind}`,
      card.context ? `Sentence: ${card.context.replace(/\[\[|\]\]/g, "")}${card.context_en ? ` (${card.context_en})` : ""}` : "",
      `Front: ${card.front.replace(/\[\[|\]\]/g, "")}`,
      `Back (answer): ${card.back.replace(/\[\[|\]\]/g, "")}`,
      card.note ? `Card note: ${card.note}` : "",
      `The learner ${seen}.`,
    ].filter(Boolean);
    openAsk({ label: card.front.replace(/\[\[|\]\]/g, ""), context: lines.join("\n") });
  };
  root.querySelector("#remove").onclick = () => {
    if (!confirm(t("Remove this card from reviews? (You can restore it in My data.)"))) return;
    run("UPDATE item SET suspended = 1 WHERE id = ?", [card.item_id]);
    go(self);
  };
  document.onkeydown = (e) => {
    if (!location.hash.startsWith("#/review")) return (document.onkeydown = null);
    if (e.target.closest?.("input, textarea")) return;
    if (e.key === " " && !show.hidden) { e.preventDefault(); reveal(); }
    else if (e.key === "Enter" && suggested) rate(suggested);
    else if ("1234".includes(e.key) && show.hidden) rate(Number(e.key));
  };
}
