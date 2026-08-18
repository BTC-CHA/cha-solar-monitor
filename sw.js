const CACHE = "cha-solar-v5";
const APP_SHELL = [
  "./", "./index.html", "./battery.html", "./history.html", "./alarms.html",
  "./style.css", "./script.js", "./smart-dashboard.js", "./mobile-flow.js",
  "./battery.js", "./history-v18.js", "./pwa.js", "./manifest.webmanifest",
  "./icons/cha-solar-192.png", "./icons/cha-solar-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (event.request.mode === "navigate" || /\.(?:html|js|css)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response;
    }).catch(() => caches.match(event.request).then(hit => hit || caches.match("./index.html"))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
