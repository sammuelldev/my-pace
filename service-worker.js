const CACHE_NAME = "mypace-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./manifest.webmanifest",
  "./assets/favicon.svg",
  "./assets/og-pace.png",
  "./js/app.js",
  "./js/cloud.js",
  "./js/firebase-config.js",
  "./js/core/schema.js",
  "./js/core/storage.js",
  "./js/data/achievement-definitions.js",
  "./js/data/nutrition-library.js",
  "./js/data/recommendation-rules.js",
  "./js/data/research-sources.js",
  "./js/data/workout-library.js",
  "./js/domains/nutrition-engine.js",
  "./js/domains/onboarding.js",
  "./js/domains/pace-engine.js",
  "./js/domains/progress-engine.js",
  "./js/domains/race-engine.js",
  "./js/domains/training-engine.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
