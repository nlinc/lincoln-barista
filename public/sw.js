const CACHE_NAME = "lincoln-barista-v1.6.0";
const APP_SHELL = [
    "/",
    "/index.html",
    "/style.css?v=1.6.0",
    "/js/app.js?v=1.6.0",
    "/js/brew-advice.js",
    "/js/shot-analytics.js",
    "/js/firebase-config.js",
    "/manifest.json",
    "/icon.svg"
];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const requestUrl = new URL(event.request.url);
    if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                return response;
            })
            .catch(() => caches.match(event.request).then(cached => cached || caches.match("/index.html")))
    );
});
