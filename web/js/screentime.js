// Screen time: how long the app has been open and visible, per day. Kept in localStorage on this device
// (it's about this phone, so it isn't part of the database backup).
import { localDate, toast } from "./util.js";

const TIME = "screen_time"; // {"YYYY-MM-DD": seconds}
const GOAL = "screen_goal_min"; // daily goal in minutes (0 = none)
const NUDGED = "screen_goal_nudged"; // date of the last "goal reached" toast
const KEEP_DAYS = 60;
const TICK_MS = 10000;
const MAX_GAP_S = 30; // a gap longer than this (phone asleep, tab frozen) isn't counted as time in the app

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
};

/** Pure: add `secs` to `date` in a {date: seconds} map and drop entries older than KEEP_DAYS. */
export function addSeconds(map, date, secs) {
  const out = { ...map, [date]: (map[date] || 0) + secs };
  const dates = Object.keys(out).sort();
  for (const d of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) delete out[d];
  return out;
}

export const dailyGoalMin = () => Number(read(GOAL, 0)) || 0;
export const setDailyGoalMin = (min) => write(GOAL, Math.max(0, Math.round(Number(min) || 0)));

/** Last `days` days, oldest first, ending today: [{date, seconds}]. */
export function lastDays(days = 7, map = read(TIME, {})) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = localDate(Date.now() - i * 86400000);
    out.push({ date, seconds: map[date] || 0 });
  }
  return out;
}

/** "1h 05m", "23m", "<1m" */
export function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  if (m < 1) return seconds > 0 ? "<1m" : "0m";
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** Start counting. Call once at boot. */
export function startScreenTime() {
  let last = document.visibilityState === "visible" ? Date.now() : null;
  const flush = () => {
    const now = Date.now();
    if (last != null) {
      const gap = (now - last) / 1000;
      if (gap > 0 && gap <= MAX_GAP_S) {
        const before = read(TIME, {});
        const date = localDate(now);
        write(TIME, addSeconds(before, date, gap));
        checkGoal(date, (before[date] || 0), (before[date] || 0) + gap);
      }
    }
    last = document.visibilityState === "visible" ? now : null;
  };
  setInterval(flush, TICK_MS);
  document.addEventListener("visibilitychange", flush);
  window.addEventListener("pagehide", flush);
}

function checkGoal(date, beforeSecs, afterSecs) {
  const goal = dailyGoalMin() * 60;
  if (!goal || beforeSecs >= goal || afterSecs < goal || read(NUDGED, "") === date) return;
  write(NUDGED, date);
  toast(`You've reached today's ${dailyGoalMin()} min goal 🎯`, 5000);
}
