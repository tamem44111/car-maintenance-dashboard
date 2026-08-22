const CACHE = 'autocare-v25';
const ASSETS = ['./', './index.html', './styles.css', './i18n.js', './photos.js', './storage.js', './recommendations.js', './features.js', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Network-first: deploys show up immediately when online; cache keeps the app working offline.
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request)
            .then(res => {
                if (res.ok && new URL(e.request.url).origin === location.origin) {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, copy));
                }
                return res;
            })
            .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
});

// Push notifications
self.addEventListener('push', e => {
    const data = e.data ? e.data.json() : { title: 'AutoCare', body: 'You have a maintenance reminder!' };
    e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: './icon-192.png', badge: './icon-192.png' }));
});
