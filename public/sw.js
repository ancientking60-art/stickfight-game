/* tiny service worker: only makes 'Add to Home screen' install the game as a full-screen app.
   It does not cache anything, so updates always show right away. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request)); });
