const CACHE_NAME = "lincoln-barista-__BUILD_COMMIT__";
const APP_SHELL = [
    "/",
    "/index.html",
    "/style.css?v=1.18.4",
    "/js/app.js?v=1.18.4",
    "/js/bean-catalog-view.js?v=1.18.4",
    "/js/bean-record.js?v=1.18.4",
    "/js/bean-photo-save.js?v=1.18.4",
    "/js/csv-export.js?v=1.18.4",
    "/js/shot-record.js?v=1.18.4",
    "/js/brew-setup.js?v=1.18.4",
    "/js/best-shot.js?v=1.18.4",
    "/js/brew-setup-view.js?v=1.18.4",
    "/js/shot-form-view.js?v=1.18.4",
    "/js/care-status.js?v=1.18.4",
    "/js/starting-point.js?v=1.18.4",
    "/js/starting-point-view.js?v=1.18.4",
    "/js/tuning-session.js?v=1.18.4",
    "/js/analytics-view.js?v=1.18.4",
    "/js/auth-repository.js?v=1.18.4",
    "/js/bean-detail-view.js?v=1.18.4",
    "/js/bean-repository.js?v=1.18.4",
    "/js/collection-view.js?v=1.18.4",
    "/js/dom.js?v=1.18.4",
    "/js/brew-advice.js?v=1.18.4",
    "/js/shot-analytics.js?v=1.18.4",
    "/js/elizabeth-tuning.js?v=1.18.4",
    "/js/bianca-tuning.js?v=1.18.4",
    "/js/firebase-client.js?v=1.18.4",
    "/js/machine-config.js?v=1.18.4",
    "/js/maintenance-repository.js?v=1.18.4",
    "/js/maintenance-view.js?v=1.18.4",
    "/js/profile-repository.js?v=1.18.4",
    "/js/router.js?v=1.18.4",
    "/js/shot-repository.js?v=1.18.4",
    "/js/tuning-view.js?v=1.18.4",
    "/js/firebase-config.js?v=1.18.4",
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
            .then(clients => clients.forEach(client => {
                client.postMessage({ type: "APP_UPDATE_READY", build: "__BUILD_COMMIT__" });
            }))
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
