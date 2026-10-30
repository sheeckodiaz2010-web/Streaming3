/* Panel Inventario · v7: apertura rápida con datos móviles y fallback offline */
const CACHE_NAME = "panel-v7";
const SHELL_URL = "./index.html";
const ROOT_URL = "./";
const OPTIONAL_ASSETS = ["./manifest.json", "./icon-192.png", "./icon-512.png"];

async function saveShell(response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(SHELL_URL, response.clone());
  await cache.put(ROOT_URL, response.clone());
}

async function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // El HTML es obligatorio; los iconos y el manifest son complementarios.
    const response = await fetchWithTimeout(SHELL_URL, 12000);
    if (!response.ok) throw new Error("No se pudo descargar index.html");
    await saveShell(response);
    await Promise.all(OPTIONAL_ASSETS.map(async asset => {
      try {
        const item = await fetchWithTimeout(asset, 5000);
        if (item.ok) await cache.put(asset, item.clone());
      } catch (_) {}
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
  // Nunca interceptar Google Apps Script, WhatsApp ni otros servicios externos.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = (await cache.match(request)) ||
                     (await cache.match(SHELL_URL)) ||
                     (await cache.match(ROOT_URL));

      try {
        // En redes móviles lentas, no dejar la pantalla esperando indefinidamente.
        const response = await fetchWithTimeout(request, cached ? 2800 : 12000);
        if (response && response.ok) {
          await saveShell(response.clone());
        }
        return response;
      } catch (_) {
        if (cached) return cached;
        return new Response(
          "No se pudo conectar. Comprueba tus datos móviles o abre el panel con internet.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  // Recursos locales: caché primero para abrir rápido; red como respaldo.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetchWithTimeout(request, 8000);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return new Response("Recurso no disponible", { status: 504 });
    }
  })());
});
