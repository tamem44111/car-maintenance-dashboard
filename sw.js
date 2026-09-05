const CACHE = 'autocare-v39';
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

// The typefaces come from Google Fonts, which is cross-origin, so the same-origin
// test below skipped them and they were never cached. Offline — a highway with no
// signal, which is this car's normal condition — the app silently lost its
// typeface and fell back to system fonts. They are cacheable: Google serves them
// with CORS.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Network-first: deploys show up immediately when online; cache keeps the app working offline.
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request)
            .then(res => {
                const u = new URL(e.request.url);
                if (res.ok && (u.origin === location.origin || FONT_HOSTS.includes(u.hostname))) {
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
