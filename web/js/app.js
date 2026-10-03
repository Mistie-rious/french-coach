// Boot + hash router.
import { openDb, saveNow } from "./db.js";
import { applyTheme, esc } from "./util.js";
import today from "./views/today.js";
import review from "./views/review.js";
import { readList, reader } from "./views/read.js";
import { write, feedback } from "./views/write.js";
import { stats, data, settingsView } from "./views/me.js";
import listen from "./views/listen.js";
import { learnHub, lessonView, speak, tipsView, verbTable, verbsView, wordsView } from "./views/learn.js";
import { stopSpeaking } from "./learn.js";

const ROUTES = [
  [/^\/$/, today, "today"],
  [/^\/review$/, review, "learn"],
  [/^\/learn$/, learnHub, "learn"],
  [/^\/learn\/words$/, wordsView, "learn"],
  [/^\/learn\/verbs$/, verbsView, "learn"],
  [/^\/learn\/verb\/([^/]+)$/, verbTable, "learn"],
  [/^\/learn\/tips$/, tipsView, "learn"],
  [/^\/learn\/tips\/([\w-]+)$/, lessonView, "learn"],
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
  stopSpeaking(); // don't keep reading a text after leaving it
  try {
    await view(root, { params: path.match(re).slice(1), query: new URLSearchParams(qs) });
  } catch (e) {
    console.error(e);
    root.innerHTML = `<h1>Oups</h1><p class="error">${esc(e.message)}</p><a href="#/">Back to today</a>`;
  }
}

async function boot() {
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
  await openDb();
  navigator.storage?.persist?.(); // ask the browser not to evict our data
  window.addEventListener("hashchange", route);
  // 🔊 buttons anywhere: pronounce with the phone's French voice.
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-say]");
    if (!b) return;
    e.stopPropagation();
    speak(b.dataset.say);
  });
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && saveNow());
  await route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
}

boot().catch((e) => {
  console.error(e);
  root.innerHTML = `<h1>Couldn't start</h1><p class="error">${esc(e.message)}</p>`;
});
