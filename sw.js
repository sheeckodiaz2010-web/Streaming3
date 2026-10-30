/* Panel Inventario · caché segura para conexiones inestables */
const CACHE_NAME = "panel-v6";
const SHELL_URL = "./index.html";
const OPTIONAL_ASSETS = ["./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // La app principal es el único recurso obligatorio para instalar la caché.
    const response = await fetch(SHELL_URL, { cache: "reload" });
    if (!response.ok) throw new Error("No se pudo descargar index.html");
    await cache.put(SHELL_URL, response.clone());
    await cache.put("./", response.clone());
    // Los iconos/manifesto son complementarios: un icono ausente no debe
    // impedir que la aplicación se pueda abrir con datos móviles.
    await Promise.all(OPTIONAL_ASSETS.map(async asset => {
      try {
        const item = await fetch(asset, { cache: "reload" });
        if (item.ok) await cache.put(asset, item.clone());
      } catch (_) { /* se descargará cuando vuelva la conexión */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("panel-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Las llamadas a Google Apps Script y otros servicios externos no se interceptan.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(SHELL_URL, response.clone());
          await cache.put("./", response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match(request)) ||
          (await caches.match(SHELL_URL)) ||
          new Response("Sin conexión. Abre la aplicación cuando recuperes internet.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      }
    })());
    return;
  }

  // Para iconos y archivos estáticos: primero caché, luego red y actualización.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const network = fetch(request).then(async response => {
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || new Response("Recurso no disponible sin conexión", { status: 504 });
  })());
});
