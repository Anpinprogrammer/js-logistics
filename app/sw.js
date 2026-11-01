/* Guarda los archivos de la app para que abra aunque no haya señal.
   Primero intenta la red (para recibir siempre la versión nueva) y, si no hay, usa la copia guardada. */
const CACHE = "js-logistics-v2";
const ARCHIVOS = ["./", "index.html", "css/estilos.css", "js/app.js", "js/plataforma.js", "js/firebase-config.js",
  "img/logo.png", "img/logo-splash.png", "img/icono-96.png", "img/icono-180.png", "img/icono-192.png", "img/icono-512.png", "manifest.webmanifest"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  const propio = u.origin === location.origin;
  const libreria = /gstatic\.com\/firebasejs|cdn\.jsdelivr\.net\/npm\/exceljs|fonts\.(googleapis|gstatic)\.com/.test(u.href);
  if(e.request.method !== "GET" || !(propio || libreria)) return; // la base de datos va siempre directo a Firebase
  e.respondWith(fetch(e.request).then(r => {
    if(r.ok || r.type === "opaque"){ const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: propio })));
});
