// Boot + hash router.
import { openDb, saveNow } from "./db.js";
import { esc } from "./util.js";
import today from "./views/today.js";
import review from "./views/review.js";
import { readList, reader } from "./views/read.js";
import { write, feedback } from "./views/write.js";
import { stats, data, settingsView } from "./views/me.js";
import listen from "./views/listen.js";

const ROUTES = [
  [/^\/$/, today, "today"],
  [/^\/review$/, review, "review"],
  [/^\/read$/, readList, "read"],
  [/^\/read\/(\d+)$/, reader, "read"],
  [/^\/write$/, write, "write"],
  [/^\/write\/(\d+)$/, feedback, "write"],
  [/^\/listen$/, listen, "listen"],
  [/^\/me$/, stats, "me"],
  [/^\/data$/, data, "me"],
  [/^\/settings$/, settingsView, "me"],
];

const root = document.getElementById("view");

async function route() {
  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const match = ROUTES.find(([re]) => re.test(path));
  if (!match) return (location.hash = "#/");
  const [re, view, tab] = match;
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  window.scrollTo(0, 0);
  try {
    await view(root, { params: path.match(re).slice(1), query: new URLSearchParams(qs) });
  } catch (e) {
    console.error(e);
    root.innerHTML = `<h1>Oups</h1><p class="error">${esc(e.message)}</p><a href="#/">Back to today</a>`;
  }
}

async function boot() {
  await openDb();
  navigator.storage?.persist?.(); // ask the browser not to evict our data
  window.addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && saveNow());
  await route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
}

boot().catch((e) => {
  console.error(e);
  root.innerHTML = `<h1>Couldn't start</h1><p class="error">${esc(e.message)}</p>`;
});
