const CACHE = 'autocare-v4';
const ASSETS = ['/', '/index.html', '/styles.css', '/storage.js', '/recommendations.js', '/features.js', '/app.js'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener('fetch', e => {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

// Push notifications
self.addEventListener('push', e => {
    const data = e.data ? e.data.json() : { title: 'AutoCare', body: 'You have a maintenance reminder!' };
    e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon-192.png', badge: '/icon-192.png' }));
});
