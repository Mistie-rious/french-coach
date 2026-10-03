// Small helpers: HTML escaping/templating, dates, UI bits.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(s);

/** Tagged template: interpolations are escaped unless wrapped in raw() or produced by html``. Arrays are joined. */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return raw(out);
}
function render(v) {
  if (v == null || v === false) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  return esc(v);
}

/** Escape, then turn [[x]] into <mark>x</mark>. */
export const mark = (s) => raw(esc(s).replace(/\[\[(.*?)\]\]/g, "<mark>$1</mark>"));

// ---- dates (device local time) ----
export const now = () => Date.now();
export function localDate(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dayStart(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n).getTime());
}
export function fmtInterval(ms) {
  const m = ms / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  const d = m / 1440;
  return d < 60 ? `${Math.round(d)}d` : `${Math.round(d / 30)}mo`;
}
export const fmtDay = (ms) => {
  let fr = false;
  try { fr = localStorage.getItem("ui_lang") === "fr"; } catch {}
  return new Date(ms).toLocaleDateString(fr ? "fr-FR" : undefined, { day: "numeric", month: "short" });
};

// ---- UI ----
export function toast(msg, ms = 2500) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export function hashtext(s) {
  // FNV-1a, good enough for cache keys
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// ---- theme ----
export const getTheme = () => {
  try { return localStorage.getItem("theme") || "light"; } catch { return "light"; }
};
export function setTheme(t) {
  try { localStorage.setItem("theme", t); } catch {}
  applyTheme();
}
export function applyTheme() {
  const t = getTheme();
  document.documentElement.dataset.theme = t;
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#18171c" : "#f6f5f2");
}

// ---- navigation ----
/** Navigate to a hash route; re-renders even if it's the current one. */
export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}
export const refresh = () => window.dispatchEvent(new HashChangeEvent("hashchange"));

/** Run an async action with a button disabled and relabelled; shows errors as a toast. */
export async function busy(button, label, fn) {
  const old = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), 5000);
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}
