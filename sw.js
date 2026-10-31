// Service worker del Panel v6: abre al instante aunque la red esté caída o "colgada".
// Estrategia: cache primero + actualización en segundo plano (stale-while-revalidate).
// Si cambias index.html, sube el número de versión (panel-v7, v8...) para forzar la actualización.
const V = "panel-v6";
const ARCHIVOS = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      .then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const r = e.request;
  // Solo archivos del propio panel; las llamadas a Google (nube) nunca se tocan
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(V);
    const hit = await c.match(r, { ignoreSearch: true });
    const net = fetch(r).then(res => {
      if (res && res.status === 200 && res.type === "basic") c.put(r, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }          // instantáneo desde caché
    const res = await net;
    if (res) return res;
    return r.mode === "navigate" ? (await c.match("index.html")) || Response.error() : Response.error();
  })());
});
