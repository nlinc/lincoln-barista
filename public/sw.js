const CACHE_NAME = "lincoln-barista-__BUILD_COMMIT__";
const APP_SHELL = [
    "/",
    "/index.html",
    "/style.css?v=1.9.3",
    "/js/app.js?v=1.9.3",
    "/js/brew-advice.js?v=1.9.3",
    "/js/shot-analytics.js?v=1.9.3",
    "/js/elizabeth-tuning.js?v=1.9.3",
    "/js/bianca-tuning.js?v=1.9.3",
    "/js/firebase-config.js?v=1.9.3",
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
            .then(() => self.clients.matchAll({ type: "window" }))
            .then(clients => Promise.all(clients.map(client => {
                client.postMessage({ type: "APP_UPDATE_READY", build: "__BUILD_COMMIT__" });
                return client.navigate(client.url);
            })))
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

    if (event.request.mode === "navigate") {
        event.respondWith(network.catch(() => caches.match("/index.html")));
        event.waitUntil(update.catch(() => {}));
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || network.catch(() => caches.match("/index.html"));
        })
    );
    event.waitUntil(update.catch(() => {}));
});
