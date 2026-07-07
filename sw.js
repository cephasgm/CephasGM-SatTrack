// =============================================
// CephasGM SatTrack - Service Worker
// PWA Offline Caching & Background Sync
// Version: 1.0.0
// =============================================

const CACHE_NAME = 'sattrack-cache-v1.0.0';
const DYNAMIC_CACHE = 'sattrack-dynamic-v1.0.0';
const API_CACHE = 'sattrack-api-v1.0.0';

// Resources to cache on install (app shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/signin.html',
  '/signup.html',
  '/dashboard.html',
  '/manifest.json',
  
  // External CDN resources we want to cache for offline
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  
  // Offline fallback page
  '/offline.html'
];

// Resources that can be cached dynamically
const CACHE_STRATEGIES = {
  // Network first, fallback to cache
  networkFirst: [
    '/api/',
    'ws://',
    'wss://'
  ],
  // Cache first, fallback to network
  cacheFirst: [
    'https://images.unsplash.com/',
    'https://cdnjs.cloudflare.com/',
    'https://unpkg.com/',
    '.png',
    '.jpg',
    '.jpeg',
    '.svg',
    '.woff2'
  ]
};

// =============================================
// INSTALL EVENT - Pre-cache static assets
// =============================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v1.0.0...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell assets...');
        return cache.addAll(STATIC_ASSETS).catch((err) => {
          console.warn('[SW] Some assets failed to cache:', err.message);
          // Continue even if some external assets fail
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('[SW] Installation complete. Skipping waiting...');
        return self.skipWaiting();
      })
  );
});

// =============================================
// ACTIVATE EVENT - Clean old caches
// =============================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete any cache that isn't current
            if (
              cacheName !== CACHE_NAME && 
              cacheName !== DYNAMIC_CACHE && 
              cacheName !== API_CACHE
            ) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete. Claiming clients...');
        return self.clients.claim();
      })
  );
});

// =============================================
// FETCH EVENT - Handle requests
// =============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip browser-sync and hot-reload requests during development
  if (url.hostname === 'localhost' && (url.port === '3000' || url.pathname.includes('browser-sync'))) {
    return;
  }
  
  // =============================================
  // Strategy 1: Network First (API calls, WebSocket)
  // =============================================
  if (isNetworkFirst(url)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }
  
  // =============================================
  // Strategy 2: Cache First (static assets, images)
  // =============================================
  if (isCacheFirst(url)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }
  
  // =============================================
  // Strategy 3: Stale While Revalidate (default)
  // =============================================
  event.respondWith(staleWhileRevalidateStrategy(request));
});

// =============================================
// CACHE STRATEGIES
// =============================================

// Network First: Try network, fallback to cache (good for API calls)
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request, { 
      mode: 'cors',
      credentials: 'same-origin'
    });
    
    // Cache the fresh response
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If it's an API call, return a JSON error
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({ 
          error: 'offline', 
          message: 'You are currently offline. Data will refresh when connection is restored.',
          timestamp: Date.now()
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // For page navigations, show offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html');
      if (offlinePage) return offlinePage;
    }
    
    throw error;
  }
}

// Cache First: Try cache, fallback to network (good for static assets)
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Update cache in background (stale-while-revalidate for cache-first)
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, networkResponse);
          });
        }
      })
      .catch(() => {});
    
    return cachedResponse;
  }
  
  // Not in cache, get from network
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network and cache both failed:', request.url);
    
    // Return a placeholder for images
    if (request.url.match(/\.(png|jpg|jpeg|svg|gif)/)) {
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
          <rect fill="#0a0e1a" width="400" height="300"/>
          <text fill="#8892b0" font-family="sans-serif" font-size="14" text-anchor="middle" x="200" y="150">
            📡 Offline - Image Unavailable
          </text>
        </svg>`,
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    }
    
    throw error;
  }
}

// Stale While Revalidate: Return cached, update in background
async function staleWhileRevalidateStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, networkResponse.clone());
        });
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log('[SW] Background fetch failed:', error);
    });
  
  return cachedResponse || fetchPromise;
}

// =============================================
// HELPERS
// =============================================

function isNetworkFirst(url) {
  return CACHE_STRATEGIES.networkFirst.some(pattern => {
    if (pattern.startsWith('ws')) {
      return url.protocol === 'ws:' || url.protocol === 'wss:';
    }
    return url.href.includes(pattern) || url.pathname.includes(pattern);
  });
}

function isCacheFirst(url) {
  return CACHE_STRATEGIES.cacheFirst.some(pattern => {
    if (pattern.startsWith('.')) {
      return url.pathname.endsWith(pattern);
    }
    return url.href.includes(pattern);
  });
}

// =============================================
// PUSH NOTIFICATIONS (Optional - Uncomment to enable)
// =============================================

/*
self.addEventListener('push', (event) => {
  let data = {
    title: 'SatTrack Alert',
    body: 'New satellite pass detected!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    data: {
      url: '/dashboard.html'
    }
  };
  
  if (event.data) {
    try {
      data = { ...data, ...JSON.parse(event.data.text()) };
    } catch (e) {}
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [200, 100, 200],
    data: data.data,
    actions: [
      { action: 'open', title: 'View Dashboard' },
      { action: 'close', title: 'Dismiss' }
    ],
    tag: 'sattrack-notification',
    renotify: true,
    requireInteraction: false
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data?.url || '/dashboard.html';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // If a window is already open, focus it
          for (const client of clientList) {
            if (client.url.includes(urlToOpen) && 'focus' in client) {
              return client.focus();
            }
          }
          // Otherwise open a new window
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});
*/

// =============================================
// BACKGROUND SYNC (Optional - Uncomment to enable)
// =============================================

/*
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-telemetry') {
    event.waitUntil(syncTelemetryData());
  }
});

async function syncTelemetryData() {
  try {
    const cache = await caches.open(API_CACHE);
    const pendingRequests = await cache.keys();
    
    for (const request of pendingRequests) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
        }
      } catch (err) {
        console.log('[SW] Sync failed for:', request.url);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync error:', error);
  }
}
*/

// =============================================
// MESSAGE HANDLER - Communication from pages
// =============================================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.keys().then((names) => {
          return Promise.all(names.map(name => caches.delete(name)));
        }).then(() => {
          console.log('[SW] All caches cleared');
          // Notify client
          event.ports?.[0]?.postMessage({ result: 'success' });
        })
      );
      break;
      
    case 'GET_VERSION':
      event.ports?.[0]?.postMessage({ version: '1.0.0', cache: CACHE_NAME });
      break;
      
    case 'UPDATE_CACHE':
      if (payload?.url) {
        event.waitUntil(
          fetch(payload.url)
            .then(res => {
              if (res.ok) {
                return caches.open(DYNAMIC_CACHE).then(cache => {
                  return cache.put(payload.url, res);
                });
              }
            })
            .catch(err => console.log('[SW] Cache update failed:', err))
        );
      }
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// =============================================
// PERIODIC BACKGROUND SYNC (Optional)
// =============================================

/*
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-satellite-passes') {
    event.waitUntil(checkSatellitePasses());
  }
});

async function checkSatellitePasses() {
  // Fetch latest satellite data from API
  try {
    const response = await fetch('/api/satellites/upcoming-passes');
    if (response.ok) {
      const data = await response.json();
      // Notify user about upcoming passes
      if (data.passes && data.passes.length > 0) {
        self.registration.showNotification('Upcoming Satellite Pass', {
          body: `${data.passes[0].name} will pass overhead in ${data.passes[0].timeRemaining} minutes`,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          tag: 'satellite-pass',
          data: { url: '/dashboard.html' }
        });
      }
    }
  } catch (error) {
    console.error('[SW] Periodic sync failed:', error);
  }
}
*/

console.log('[SW] Service Worker loaded and ready!');
