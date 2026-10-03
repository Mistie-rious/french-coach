import { get, scalar } from "../db.js";
import { hasKey } from "../claude.js";
import { todaysPrompt } from "../content.js";
import { backupDue, reviewedToday, streak, todaysMistakeIds } from "../progress.js";
import { queue, settings } from "../srs.js";
import { dayStart, html } from "../util.js";

export default function today(root) {
  const start = dayStart();
  const cap = settings().reviewCap;
  const reviewed = reviewedToday();
  const dueNow = queue(cap).length;
  const unread = get("SELECT id, title FROM text WHERE read_at IS NULL ORDER BY created_at DESC LIMIT 1");
  const readToday = scalar("SELECT COUNT(*) FROM text WHERE read_at >= ?", [start]);
  const wrote = get("SELECT id FROM submission WHERE created_at >= ? ORDER BY created_at DESC LIMIT 1", [start]);
  const mistakeIds = todaysMistakeIds();
  const drillLeft = mistakeIds.length ? queue(100, { itemIds: mistakeIds }).length : 0;

  const steps = [
    {
      title: "Warm-up review", href: "#/review",
      done: dueNow === 0 || reviewed >= cap,
      detail: dueNow ? `${dueNow} due` : `${reviewed} reviewed`,
    },
    {
      title: "Read", href: unread && !readToday ? `#/read/${unread.id}` : "#/read",
      done: readToday > 0,
      detail: readToday ? "done" : unread ? unread.title : "pick or generate a text",
    },
    {
      title: "Write", href: wrote ? `#/write/${wrote.id}` : "#/write",
      done: !!wrote,
      detail: todaysPrompt().text,
    },
    {
      title: "Drill today's mistakes", href: "#/review?drill=1",
      done: !!wrote && drillLeft === 0,
      detail: drillLeft ? `${drillLeft} to drill` : wrote ? "done" : "after writing",
    },
  ];
  const n = streak();

  root.innerHTML = html`
    <header class="row between">
      <h1>Aujourd'hui</h1>
      <span class="pill">🔥 ${n} day${n === 1 ? "" : "s"}</span>
    </header>
    ${steps.every((s) => s.done) ? html`<div class="card done-banner">C'est fini pour aujourd'hui. Bravo ! 🎉</div>` : ""}
    ${backupDue() ? html`<a href="#/data" class="card warn">💾 It's been a while since your last backup. Back up now →</a>` : ""}
    <ol class="steps">
      ${steps.map((s, i) => html`
        <li class="${s.done ? "done" : ""}">
          <a href="${s.href}" class="card step">
            <span class="check">${s.done ? "✓" : i + 1}</span>
            <span class="grow"><strong>${s.title}</strong><small>${s.detail}</small></span>
            <span class="chev">›</span>
          </a>
        </li>`)}
    </ol>
    ${hasKey() ? "" : html`<p class="muted small">No Claude key yet: texts come from the built-in set, word lookups use the offline dictionary, and corrections use LanguageTool only. <a href="#/settings">Add a key →</a></p>`}
  `;
}
