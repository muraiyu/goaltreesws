// オフライン用のキャッシュ。アプリ本体は「まずネット、だめならキャッシュ」、ほかは「まずキャッシュ」
const VERSION = "20261102130249";
const CACHE = "goaltree-" + VERSION;
const SHELL = ["./", "index.html", "manifest.webmanifest", "firebase-config.js", "auth.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url), same = url.origin === location.origin;
  // アプリ本体と設定ファイルは「まずネット、だめならキャッシュ」(更新がすぐ届くように)
  if (req.mode === "navigate" || (same && !/\.png$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req.mode === "navigate" ? "index.html" : req, c)); } return r; })
      .catch(() => caches.match(req.mode === "navigate" ? "index.html" : req)));
    return;
  }
  // 画像・フォント・Firebaseの部品は「まずキャッシュ」
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (same || req.url.includes("fonts.g") || req.url.includes("gstatic.com/firebasejs"))) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
    return r;
  })));
});
