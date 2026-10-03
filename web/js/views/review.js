import { run } from "../db.js";
import { previews, queue, review, settings } from "../srs.js";
import { reviewedToday, todaysMistakeIds } from "../progress.js";
import { fmtInterval, go, html, mark } from "../util.js";

export default function reviewView(root, { query }) {
  const drill = query.get("drill") === "1";
  const more = query.get("more") === "1";
  const cap = settings().reviewCap;
  const reviewed = reviewedToday();
  const cards = drill
    ? queue(100, { itemIds: todaysMistakeIds() })
    : reviewed >= cap && !more ? [] : queue(cap);
  const self = `#/review${drill ? "?drill=1" : more ? "?more=1" : ""}`;
  const card = cards[0];

  if (!card) {
    root.innerHTML = html`
      <h1>${drill ? "Drill" : "Review"}</h1>
      <div class="card center stack">
        ${drill ? html`<p>No mistakes left to drill today. 👌</p>`
          : reviewed >= cap && !more ? html`<p>Warm-up done: ${reviewed} cards today.</p><a href="#/review?more=1">Keep going →</a>`
          : html`<p>Nothing due. 🎉</p>`}
        <a href="#/">Back to today</a>
      </div>`;
    return;
  }

  const p = previews(card);
  const body = card.kind === "word"
    ? html`
        <p class="kind">word</p>
        ${card.context ? html`<p class="context">${mark(card.context)}</p>` : html`<p class="big">${card.front}</p>`}
        <div class="answer">
          <p class="big">${card.front}</p>
          <p class="big accent">${card.back}</p>
          ${card.context_en ? html`<p class="muted">${card.context_en}</p>` : ""}
          ${card.note ? html`<p class="note">${card.note}</p>` : ""}
        </div>`
    : html`
        <p class="kind">fix the mistake · ${(card.category || "").replace("_", " ")}</p>
        <p class="context">${mark(card.front)}</p>
        <div class="answer">
          <p class="context good">${mark(card.back)}</p>
          ${card.note ? html`<p class="note">${card.note}</p>` : ""}
        </div>`;

  root.innerHTML = html`
    <header class="row between">
      <h1>${drill ? "Drill" : "Review"}</h1>
      <span class="pill">${cards.length} left</span>
    </header>
    <div class="card flash" id="flash">${body}</div>
    <button id="show" class="wide">Show answer</button>
    <div class="ratings" id="ratings">
      ${[["Again", 1], ["Hard", 2], ["Good", 3], ["Easy", 4]].map(([label, r]) =>
        html`<button data-r="${r}" class="r${r}">${label}<small>${fmtInterval(p[r])}</small></button>`)}
    </div>
    <p class="center"><button class="link small" id="remove">Remove card</button></p>
  `;

  const flash = root.querySelector("#flash");
  const show = root.querySelector("#show");
  const ratings = root.querySelector("#ratings");
  const reveal = () => {
    flash.classList.add("revealed");
    ratings.classList.add("visible");
    show.hidden = true;
  };
  const rate = (r) => {
    review(card.id, r);
    go(self);
  };
  show.onclick = reveal;
  flash.onclick = reveal;
  ratings.onclick = (e) => {
    const b = e.target.closest("button[data-r]");
    if (b) rate(Number(b.dataset.r));
  };
  root.querySelector("#remove").onclick = () => {
    if (!confirm("Remove this card from reviews? (You can restore it in My data.)")) return;
    run("UPDATE item SET suspended = 1 WHERE id = ?", [card.item_id]);
    go(self);
  };
  document.onkeydown = (e) => {
    if (!location.hash.startsWith("#/review")) return (document.onkeydown = null);
    if (e.key === " " && !show.hidden) { e.preventDefault(); reveal(); }
    else if ("1234".includes(e.key) && show.hidden) rate(Number(e.key));
  };
}
