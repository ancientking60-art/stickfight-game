/* tiny service worker: only lets Android 'Add to Home screen' install the game as a full-screen app.
   It never caches anything: pages always come fresh from the network, other files are not touched,
   so an update can never be stuck behind an old copy. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch (err) {}
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;   // let the browser load everything else normally
  e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => new Response(
    '<meta name="viewport" content="width=device-width"><body style="background:#000;color:#fff;font:18px sans-serif;text-align:center;padding-top:40vh">No internet - the game will load when you are back online.<script>setTimeout(function(){location.reload()},5000)</script>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
