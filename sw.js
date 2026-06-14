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
        // 仅缓存成功的响应
        if (networkResponse.ok) {
            const cache = await caches.open(RUNTIME_NAME);
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (e) {
        // 优先精确匹配请求 URL
        const cached = await caches.match(request);
        if (cached) return cached;
        // 回退到预缓存的 index.html（App Shell 模式）
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
        // 最终回退：返回简单的离线提示页，避免 Promise 被拒绝导致浏览器报错
        return new Response(
            '<html lang="zh-CN"><body><h1>离线</h1><p>请连接网络后重试。</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}

function timeoutFetch(request, ms) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();  // 超时时取消正在进行的 fetch，避免资源泄漏
            reject(new Error('timeout'));
        }, ms);
        fetch(request, { signal: controller.signal }).then(response => {
            clearTimeout(timer);
            resolve(response);
        }).catch(err => {
            clearTimeout(timer);
            // AbortError 是超时导致的，统一转为 timeout 错误
            reject(err.name === 'AbortError' ? new Error('timeout') : err);
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
        // 网络失败且无缓存时，返回占位响应，避免 Promise 被拒绝
        // 对于图片/字体等资源返回透明占位，对于脚本/样式返回空内容
        const contentType = request.destination === 'image'
            ? 'image/gif'
            : 'text/plain';
        const body = request.destination === 'image'
            ? ''  // 浏览器会将空 body 的 image/gif 显示为透明
            : '';
        return new Response(body, {
            status: 503,
            headers: { 'Content-Type': contentType }
        });
    }
}
