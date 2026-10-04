// Offline support: serve app files from cache, refresh them in the background
// (stale-while-revalidate), so updates show up on the next launch.
const CACHE = "fc-v17";
const FILES = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/app.js", "js/util.js", "js/db.js", "js/srs.js", "js/nlp.js", "js/claude.js", "js/correction.js",
  "js/content.js", "js/progress.js", "js/seed.js", "js/listen.js", "js/translate.js", "js/learn.js", "js/lessons.js", "js/talk.js", "js/i18n.js", "js/story.js",
  "js/views/today.js", "js/views/review.js", "js/views/read.js", "js/views/write.js", "js/views/me.js", "js/views/listen.js", "js/views/learn.js", "js/views/talk.js",
  "vendor/sql-wasm.js", "vendor/sql-wasm.wasm", "vendor/ts-fsrs.js",
  "dict/fr-en.json", "dict/verbs.json",
  "fonts/instrument-serif-latin-400-normal.woff2", "fonts/instrument-serif-latin-400-italic.woff2",
  "fonts/space-grotesk-latin-500-normal.woff2", "fonts/space-grotesk-latin-700-normal.woff2",
  "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Claude / LanguageTool go straight to the network
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request)
        .then((resp) => {
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
