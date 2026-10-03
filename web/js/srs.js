// FSRS scheduling (ts-fsrs) + review queue.
import { all, get, kvGet, run, scalar, tx } from "./db.js";
import { dayStart } from "./util.js";

const F = globalThis.FSRS;
const scheduler = F.fsrs(F.generatorParameters({ request_retention: 0.9, enable_fuzz: true }));
const LEARN_AHEAD = 15 * 60 * 1000; // show learning-step cards a bit early so a session can finish

export const settings = () => ({
  reviewCap: kvGet("review_cap", 20),
  newPerDay: kvGet("new_per_day", 15),
  knownDays: 21,
});

const parse = (row) => {
  const c = JSON.parse(row.fsrs);
  c.due = new Date(c.due);
  if (c.last_review) c.last_review = new Date(c.last_review);
  return c;
};

export function addCard(itemId, template = "recog", at = Date.now()) {
  const c = F.createEmptyCard(new Date(at));
  return run("INSERT INTO card(item_id, template, due, state, reps, stability, fsrs, created_at) VALUES (?,?,?,?,?,?,?,?)", [
    itemId, template, at, c.state, 0, null, JSON.stringify(c), at,
  ]);
}

/** {1: ms-until-due, 2: ..., 3: ..., 4: ...} for button labels. */
export function previews(cardRow, at = Date.now()) {
  const rec = scheduler.repeat(parse(cardRow), new Date(at));
  return Object.fromEntries([1, 2, 3, 4].map((r) => [r, rec[r].card.due.getTime() - at]));
}

export function review(cardId, rating, at = Date.now()) {
  const row = get("SELECT * FROM card WHERE id = ?", [cardId]);
  const { card } = scheduler.next(parse(row), new Date(at), rating);
  tx(() => {
    run("INSERT INTO review_log(card_id, rating, state_before, reviewed_at) VALUES (?,?,?,?)", [cardId, rating, row.state, at]);
    run("UPDATE card SET due = ?, state = ?, reps = ?, stability = ?, fsrs = ? WHERE id = ?", [
      card.due.getTime(), card.state, card.reps, card.stability, JSON.stringify(card), cardId,
    ]);
  });
  return card;
}

export const newReviewedToday = (at = Date.now()) =>
  scalar("SELECT COUNT(*) FROM (SELECT MIN(reviewed_at) AS first FROM review_log GROUP BY card_id) WHERE first >= ?", [dayStart(at)]);

const CARD_SQL = `
  SELECT card.id AS card_id, card.*, item.* FROM card JOIN item ON item.id = card.item_id
  WHERE item.suspended = 0`;
const ORDER = "ORDER BY (item.kind = 'mistake') DESC";

/** Due cards (mistakes first), then new cards within the daily budget. `itemIds` limits to those items (drill). */
export function queue(limit, { itemIds = null, at = Date.now() } = {}) {
  let filter = "";
  if (itemIds) {
    if (!itemIds.length) return [];
    filter = ` AND item.id IN (${itemIds.map(Number).join(",")})`;
  }
  // Order: due now → new → learning steps that are almost due (so a card you just rated
  // doesn't pop straight back while others are waiting).
  const due = all(`${CARD_SQL}${filter} AND card.reps > 0 AND card.due <= ? ${ORDER}, card.due LIMIT ?`, [at, limit]);
  let room = limit - due.length;
  if (!itemIds) room = Math.min(room, settings().newPerDay - newReviewedToday(at));
  const fresh = room > 0 ? all(`${CARD_SQL}${filter} AND card.reps = 0 ${ORDER}, card.created_at LIMIT ?`, [room]) : [];
  const left = limit - due.length - fresh.length;
  const ahead = left > 0
    ? all(`${CARD_SQL}${filter} AND card.reps > 0 AND card.state != 2 AND card.due > ? AND card.due <= ? ORDER BY card.due LIMIT ?`, [at, at + LEARN_AHEAD, left])
    : [];
  return [...due, ...fresh, ...ahead].map((r) => ({ ...r, id: r.card_id }));
}
