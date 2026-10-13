// Service worker RACIK-LOKAL: simpan cangkang aplikasi agar tetap terbuka di jaringan lemah.
// Data API tidak disimpan di cache (selalu dari server), sesuai PRD bagian 14.
const CACHE = "racik-lokal-v10";
const SHELL = [
  "/",
  "/static/styles.css?v=10",
  "/static/landing.css?v=10",
  "/static/js/app.js?v=10",
  "/static/assets/brand/mark-40.png",
  "/static/assets/brand/favicon-64.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  // Jaringan dulu, cache sebagai cadangan.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (url.origin === location.origin || url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});
