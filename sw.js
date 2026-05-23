const CACHE_VERSION = 'v1';
const PRECACHE_NAME = `image-tool-precache-${CACHE_VERSION}`;
const RUNTIME_NAME = `image-tool-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    './index.html',
    './manifest.json',
    './favicon.svg',
    './assets/viewerjs/viewer.min.css',
    './assets/viewerjs/viewer.min.js',
    './assets/irojs/iro.js',
    './assets/fflate/fflate.js',
    './img/icons/favicon/PWA/pwa-192.png',
    './img/icons/favicon/PWA/pwa-512.png'
];

// ---- Install: 预缓存所有静态资源 ----
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(PRECACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// ---- Activate: 清理旧版本缓存 ----
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names.filter(n =>
                n.startsWith('image-tool-') &&
                n !== PRECACHE_NAME &&
                n !== RUNTIME_NAME
            ).map(n => caches.delete(n))
        )).then(() => self.clients.claim())
    );
});

// ---- Fetch: 按资源类型路由到不同缓存策略 ----
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 仅拦截 GET 请求
    if (request.method !== 'GET') return;

    // 仅处理同源请求，跨域资源由页面自行处理（CDN 降级等）
    if (url.origin !== self.location.origin) return;

    // 同源导航请求 → Network-first（3 秒超时回退缓存）
    if (request.mode === 'navigate') {
        event.respondWith(networkFirstWithTimeout(request, 3000));
        return;
    }

    // 同源静态资源 → Cache-first
    event.respondWith(cacheFirst(request));
});

// ---- 缓存策略实现 ----

// Network-first + 超时回退缓存（用于 index.html）
async function networkFirstWithTimeout(request, timeoutMs) {
    try {
        const networkResponse = await timeoutFetch(request, timeoutMs);
        const cache = await caches.open(RUNTIME_NAME);
        await cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (e) {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
        throw e;
    }
}

function timeoutFetch(request, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms);
        fetch(request).then(response => {
            clearTimeout(timer);
            resolve(response);
        }).catch(err => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// Cache-first（用于同源静态资源）
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(RUNTIME_NAME);
            await cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        throw e;
    }
}
