// Service worker de "Emi aprende".
// Guarda la app en el telefono para que abra al instante y sin internet.
// Cada vez que hay conexion baja la version nueva en segundo plano; se ve en la
// siguiente apertura. Sube el numero de CACHE solo si quieres forzar un borrado.
const CACHE = "emi-v1";
const SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The page itself is always stored under "/" whatever URL it was opened with.
  const key = req.mode === "navigate" ? "/" : req;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(req.mode === "navigate" ? "/" : req, { cache: "no-cache" })
        .then((res) => {
          if (res && res.ok && res.type === "basic") cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) { e.waitUntil(fresh); return cached; }
      return fresh;
    })
  );
});
