/* App shell for Rammy Alerts. This does not receive ntfy Web Push.
   ntfy only pushes to a page hosted on the same ntfy server. */

const CACHE = "rammy-alerts-pwa-v1";
const SHELL = [
  "/rammy-alerts/",
  "/rammy-alerts/index.html",
  "/rammy-alerts/install.html",
  "/rammy-alerts/manifest.json",
  "/rammy-alerts/app.css",
  "/rammy-alerts/app.js",
  "/rammy-alerts/logic.js",
  "/rammy-alerts/seal.js",
  "/rammy-alerts/ram.webp",
  "/rammy-alerts/icon-192.png",
  "/rammy-alerts/icon-512.png",
  "/rammy-alerts/icon-maskable-512.png",
  "/rammy-alerts/apple-touch-icon.png",
  "/rammy-alerts/vendor/jsQR.js",
  "/rammy-alerts/fonts/AtkinsonHyperlegible-Regular.woff2",
  "/rammy-alerts/fonts/AtkinsonHyperlegible-Bold.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match("/rammy-alerts/index.html")))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (let i = 0; i < clients.length; i += 1) {
        if (clients[i].focus) return clients[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/rammy-alerts/");
      return undefined;
    })
  );
});
