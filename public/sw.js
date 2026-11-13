// Xtreme PWA Service Worker — Zero-Stale Network-First & Persistent Push Alerts
const CACHE_NAME = 'xtreme-v6-network-first';

const OFFLINE_FALLBACKS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_FALLBACKS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // 1. API calls NEVER go through cache
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. HTML navigation, manifest, icons & entry points: strictly NETWORK-FIRST with no-store
  if (
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-store' }))
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((m) => m || caches.match('/index.html') || caches.match('/')))
    );
    return;
  }

  // 3. Vite hashed build assets (/assets/*): Network-first so broken/stale chunks never stick, fallback cache
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 4. Icons / static files: network first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

// Persistent Push Notification Handler (runs even when iPhone PWA is closed)
self.addEventListener('push', (event) => {
  let data = {
    title: '⚠️ URGENT: Weekly Duty Action Required',
    body: 'Your teacher-duty announcement is pending. Tap now to send on WhatsApp or mark done.',
    url: '/?tab=duty',
    tag: 'xtreme-urgent-duty',
    badgeCount: 1
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'xtreme-urgent-duty',
    renotify: true,
    requireInteraction: true,
    vibrate: [600, 150, 600, 150, 600, 200, 800],
    actions: [
      { action: 'open_duty', title: '📲 Open & Send' },
      { action: 'mark_done', title: '✅ Mark Done' }
    ],
    data: { url: data.url || '/?tab=duty' }
  };

  const badgeTask =
    typeof self.navigator !== 'undefined' && typeof self.navigator.setAppBadge === 'function'
      ? (typeof data.badgeCount === 'number' && data.badgeCount > 0
          ? self.navigator.setAppBadge(data.badgeCount).catch(() => {})
          : typeof self.navigator.clearAppBadge === 'function'
            ? self.navigator.clearAppBadge().catch(() => {})
            : Promise.resolve())
      : Promise.resolve();

  event.waitUntil(
    Promise.all([
      badgeTask,
      self.registration.showNotification(data.title, notificationOptions)
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const isMarkDone = event.action === 'mark_done';
  const targetUrl = isMarkDone
    ? '/?action=mark_done'
    : (event.notification.data?.url || '/?tab=duty');

  const markDoneTask = isMarkDone
    ? fetch('/api/push/mark-done', { method: 'POST' })
        .then(() => {
          if (typeof self.navigator !== 'undefined' && typeof self.navigator.clearAppBadge === 'function') {
            return self.navigator.clearAppBadge().catch(() => {});
          }
        })
        .catch(() => {})
    : Promise.resolve();

  event.waitUntil(
    Promise.all([
      markDoneTask,
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          client.postMessage({ type: isMarkDone ? 'MARK_DUTY_DONE' : 'OPEN_DUTY_TAB' });
        }

        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    ])
  );
});
