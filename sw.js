const CACHE = 'autocare-v47';
const ASSETS = ['./', './index.html', './classic.html', './styles.css', './i18n.js', './photos.js', './storage.js', './recommendations.js', './features.js', './app.js', './manifest.json', './icon-192.png', './icon-512.png',
    // index.html is the new design; classic.html is the screens it replaced
    './next/', './next/next.css', './next/next.js', './next/forms.js'];

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

// How long a weak signal gets before the app opens from its own copy. Plain
// network-first waited for the request to fail, and on a highway with one bar of
// signal that can take the better part of a minute of blank screen.
const NETWORK_TIMEOUT_MS = 2500;

// Network-first: deploys show up immediately when online; cache keeps the app working
// offline and on a connection too slow to wait for.
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const network = fetch(e.request).then(res => {
        const u = new URL(e.request.url);
        if (res.ok && (u.origin === location.origin || FONT_HOSTS.includes(u.hostname))) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
    });
    // Let a slow response finish and refresh the cache even after the timeout won
    e.waitUntil(network.catch(() => {}));
    e.respondWith(new Promise(resolve => {
        const timer = setTimeout(() => {
            caches.match(e.request).then(r => { if (r) resolve(r); });  // nothing cached: keep waiting
        }, NETWORK_TIMEOUT_MS);
        network
            .then(res => { clearTimeout(timer); resolve(res); })
            .catch(() => {
                clearTimeout(timer);
                caches.match(e.request)
                    .then(r => r || caches.match('./index.html'))
                    .then(r => resolve(r || Response.error()));
            });
    }));
});

// Push notifications
self.addEventListener('push', e => {
    const data = e.data ? e.data.json() : { title: 'AutoCare', body: 'You have a maintenance reminder!' };
    e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: './icon-192.png', badge: './icon-192.png' }));
});
