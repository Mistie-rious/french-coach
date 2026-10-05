// Streak, daily steps, and stats queries.
import { all, kvGet, scalar } from "./db.js";
import { queue, settings } from "./srs.js";
import { addDays, dayStart, localDate } from "./util.js";

/** Local dates with any activity (a review, a writing, or a finished text). */
export function activeDays() {
  const rows = all(`
    SELECT reviewed_at AS t FROM review_log
    UNION ALL SELECT created_at FROM submission
    UNION ALL SELECT created_at FROM listen_log
    UNION ALL SELECT read_at FROM text WHERE read_at IS NOT NULL`);
  return new Set(rows.map((r) => localDate(r.t)));
}

/** Consecutive active days up to today (today not done yet doesn't break it). */
export function streak(days = activeDays()) {
  let d = localDate();
  if (!days.has(d)) d = addDays(d, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export const todaysMistakeIds = () =>
  all("SELECT id FROM item WHERE kind = 'mistake' AND suspended = 0 AND created_at >= ?", [dayStart()]).map((r) => r.id);

export const myItemIds = () => all("SELECT id FROM item WHERE mine = 1 AND suspended = 0").map((r) => r.id);

export const reviewedToday = () => scalar("SELECT COUNT(*) FROM review_log WHERE reviewed_at >= ?", [dayStart()]);

export function backupDue() {
  const first = scalar("SELECT MIN(created_at) FROM item");
  if (!first) return false;
  const last = kvGet("last_backup_at", first); // never backed up: count from the first saved item
  return Date.now() - last > 7 * 86400000;
}

export function stats() {
  const weekAgo = Date.now() - 7 * 86400000;
  const monthAgo = Date.now() - 30 * 86400000;
  const known = scalar(
    `SELECT COUNT(DISTINCT item.id) FROM item JOIN card ON card.item_id = item.id
     WHERE item.kind = 'word' AND card.state = 2 AND card.stability >= ?`,
    [settings().knownDays],
  );
  const saved = scalar("SELECT COUNT(*) FROM item WHERE kind = 'word'");
  const top = all(
    "SELECT category, COUNT(*) AS n FROM error WHERE created_at >= ? GROUP BY category ORDER BY n DESC LIMIT 6",
    [weekAgo],
  );
  const r = all(
    "SELECT rating > 1 AS ok, COUNT(*) AS n FROM review_log WHERE reviewed_at >= ? AND state_before = 2 GROUP BY rating > 1",
    [monthAgo],
  );
  const total = r.reduce((s, x) => s + x.n, 0);
  const passed = r.filter((x) => x.ok).reduce((s, x) => s + x.n, 0);
  const days = activeDays();
  const today = localDate();
  const last28 = Array.from({ length: 28 }, (_, i) => {
    const d = addDays(today, i - 27);
    return { date: d, active: days.has(d) };
  });
  return {
    streak: streak(days),
    known,
    saved,
    top,
    retention: total ? Math.round((100 * passed) / total) : null,
    last28,
    dueNow: queue(1000).length,
  };
}
