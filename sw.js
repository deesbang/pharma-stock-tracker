// =====================================================
// PharmaStock Service Worker
// =====================================================
// 
// IMPORTANT FOR DEVELOPERS:
//   Every time you make significant changes and push,
//   increment the CACHE_NAME version below (v1 → v2 → v3...).
//   This forces the browser to download the latest files.
//
// Example: const CACHE_NAME = 'pharmastock-v3';

const CACHE_NAME = 'pharmastock-v2';

const APP_SHELL = [
  './',
  './index.html',
  './phlist.css',
  './phlist.js',
  './manifest.json'
];

const STATIC_ASSETS = [
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

// Install: Cache the app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_SHELL, ...STATIC_ASSETS]))
      .then(() => {
        console.log('[SW] App shell cached. Skipping waiting...');
        return self.skipWaiting(); // Activate new SW immediately
      })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Claiming clients...');
      return self.clients.claim(); // Take control of all pages immediately
    })
  );
});

// Fetch strategy:
// - For HTML, CSS, JS → Network first (so you see updates quickly)
// - For everything else → Cache first, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin requests (like Firebase, fonts, etc.)
  if (url.origin !== location.origin) {
    return;
  }

  // For app shell files (HTML, CSS, JS) → prefer network
  if (APP_SHELL.some(asset => event.request.url.endsWith(asset.replace('./', '')) || 
      event.request.url === location.origin + asset.replace('./', '/'))) {
    
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Update cache with fresh version
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => caches.match(event.request)) // Offline fallback
    );
    return;
  }

  // Default: Cache first, then network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((networkResponse) => {
        // Cache new resources we haven't seen before
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});

// Placeholder for future push notification handling
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  let data = {};
  if (event.data) {
    data = event.data.json();
  }

  const title = data.title || 'PharmaStock Alert';
  const options = {
    body: data.body || 'Stock level update',
    icon: 'icons/icon-192.svg',
    badge: 'icons/icon-192.svg',
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});