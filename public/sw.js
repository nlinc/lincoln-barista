const CACHE_NAME = "lincoln-barista-__BUILD_COMMIT__";
const APP_SHELL = [
    "/",
    "/index.html",
    "/style.css?v=1.7.1",
    "/js/app.js?v=1.7.1",
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

    const network = fetch(event.request);
    const update = network.then(response => {
        if (!response.ok) return;
        const copy = response.clone();
        return caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    });

    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || network.catch(() => caches.match("/index.html"));
        })
    );
    event.waitUntil(update.catch(() => {}));
});
