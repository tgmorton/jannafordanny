const CACHE_NAME = 'video-study-cache-v1';

// Assets to cache on install
const ASSETS_TO_CACHE = [
  'assets/ff1.mp4',
  'assets/ff2.mp4',
  'assets/ff3.mp4',
  'assets/ff4.mp4',
  'assets/ff5.mp4',
  'assets/ff6.mp4',
  'assets/ff7.mp4',
  'assets/ff8.mp4',
  'assets/ff9.mp4',
  'assets/fm1.mp4',
  'assets/fm2.mp4',
  'assets/fm3.mp4',
  'assets/fm4.mp4',
  'assets/fm5.mp4',
  'assets/fm6.mp4',
  'assets/fm7.mp4',
  'assets/fm8.mp4',
  'assets/fm9.mp4',
  'assets/nature.mp4',
  'assets/naturalpractice.mp4',
  'assets/observepractice.mp4',
  'assets/participatepractice.mp4',
  'assets/natural.mp3',
  'assets/observe.mp3',
  'assets/participate.mp3',
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching assets...');
      // Cache assets one by one to handle large files better
      return Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[ServiceWorker] Failed to cache:', url, err);
          })
        )
      );
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log('[ServiceWorker] Serving from cache:', event.request.url);
        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetch(event.request).then((networkResponse) => {
        // Cache video/audio files for future use
        if (
          event.request.url.endsWith('.mp4') ||
          event.request.url.endsWith('.mp3')
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
            console.log('[ServiceWorker] Cached new asset:', event.request.url);
          });
        }
        return networkResponse;
      });
    })
  );
});
