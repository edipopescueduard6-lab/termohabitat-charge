/* cache offline pentru Termohabitat Charge — versiunea se schimbă la fiecare build */
const V = 'thc-132f13e15b';
const CORE = ["./", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "img/v/atto3-s.webp", "img/v/atto3.webp", "img/v/daf-s.webp", "img/v/daf.webp", "img/v/eactros-s.webp", "img/v/eactros.webp", "img/v/etgx-s.webp", "img/v/etgx.webp", "img/v/etransit-s.webp", "img/v/etransit.webp", "img/v/fh-s.webp", "img/v/fh.webp", "img/v/ix2-s.webp", "img/v/ix2.webp", "img/v/model-y-s.webp", "img/v/model-y.webp", "img/v/puma-s.webp", "img/v/puma.webp", "img/v/q8-s.webp", "img/v/q8.webp", "img/v/spring-s.webp", "img/v/spring.webp", "index.html", "manifest.webmanifest"];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') { e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put('./', cp)); return res; }).catch(() => caches.match('./'))); return; }
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })));
});
