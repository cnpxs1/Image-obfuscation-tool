// 图片混淆工具 — CDN 资源加载中心
// =============================================
// 统管：早期日志存根、loadScriptWithFallback、Viewer.js 回退管理、
//       iro.js / fflate CDN 加载、getViewerLoadPromise
// 加载时机：<head> 中第一个脚本，早于所有 CDN 资源加载
// =============================================

// ---- 早期日志存根 ----
// 使用隐式全局赋值（无 var/let/const），避免跨文件重复声明 SyntaxError
logLog = function(...args) { console.log(...args); };
logInfo = function(fileName, reason, metadata) { console.info('[INFO] ' + fileName + ' - ' + reason, metadata || {}); };
logWarn = function(fileName, reason, metadata) { console.warn('[WARN] ' + fileName + ' - ' + reason, metadata || {}); };
logError = function(fileName, reason, metadata) { console.error('[ERROR] ' + fileName + ' - ' + reason, metadata || {}); };

// ---- 通用 CDN 回退加载器 ----
/**
 * 通用 CDN 回退加载函数
 * @param {string} globalName - 全局变量名，用于检测加载成功
 * @param {Object} stateObj - 状态对象 { loaded, loading, failed, _resolve, _reject }
 * @param {string} primaryUrl - 主 CDN 地址
 * @param {string[]} fallbackUrls - 备选 URL 列表
 * @param {Function} [onAllFailed] - 全部失败回调
 */
function loadScriptWithFallback(globalName, stateObj, primaryUrl, fallbackUrls, onAllFailed) {
    function tryNext(failedUrl, nextIndex) {
        console.warn('[WARN] ' + globalName + ' - 加载失败: ' + failedUrl);
        stateObj.loading = false;
        if (nextIndex < fallbackUrls.length) {
            load(fallbackUrls[nextIndex], nextIndex + 1);
        } else {
            stateObj.failed = true;
            if (typeof stateObj._reject === 'function') { stateObj._reject(new Error(globalName + ' 所有源均加载失败')); }
            console.error('[ERROR] ' + globalName + ' - 所有源均加载失败');
            if (onAllFailed) onAllFailed();
        }
    }

    function load(cdnUrl, index) {
        if (index === void 0) index = 0;
        if (stateObj.loaded || stateObj.loading) return;
        stateObj.loading = true;

        var script = document.createElement('script');
        script.src = cdnUrl;
        script.onload = function() {
            if (window[globalName] !== undefined) {
                stateObj.loaded = true;
                stateObj.loading = false;
                if (typeof stateObj._resolve === 'function') { stateObj._resolve(); }
                console.log(globalName + ' 加载成功:', cdnUrl);
            } else {
                console.warn('[WARN] ' + globalName + ' - 脚本加载但未定义，视为失败');
                tryNext(cdnUrl, index + 1);
            }
        };
        script.onerror = function() { tryNext(cdnUrl, index + 1); };
        document.head.appendChild(script);
    }
    load(primaryUrl, 0);
}

// ---- Viewer.js 资源管理 ----
/** Viewer.js 全局资源状态对象（在 CSS/JS CDN 加载前定义） */
window.viewerResources = { cssLoaded: false, jsLoaded: false, localFallback: false, promptShown: false, currentCDN: null };

(function() {
    var viewerRes = window.viewerResources;
    viewerRes._resolve = null; viewerRes._reject = null; viewerRes._timeout = null;

    viewerRes._notifyReady = function() {
        if (viewerRes.jsLoaded && viewerRes.cssLoaded && window.Viewer && viewerRes._resolve) {
            clearTimeout(viewerRes._timeout);
            viewerRes._resolve(); viewerRes._resolve = viewerRes._reject = null;
        }
    };
    viewerRes._notifyFailed = function(reason) {
        if (viewerRes._reject) {
            clearTimeout(viewerRes._timeout);
            viewerRes._reject(new Error(reason)); viewerRes._resolve = viewerRes._reject = null;
        }
    };
    window.createViewerFallback = function(tag, url, onLoad, onError) {
        if (viewerRes.localFallback) return null;
        var el = document.createElement(tag);
        if (tag === 'link') { el.rel = 'stylesheet'; el.href = url; }
        else { el.src = url; }
        el.onload = function() { if (onLoad) onLoad(); };
        el.onerror = function() { if (onError) onError(); };
        document.head.appendChild(el);
        return el;
    };
    window.loadLocalViewerResource = function(type) {
        if (viewerRes.localFallback) return;
        var isCss = type === 'css';
        var url = './assets/viewerjs/viewer.min.' + (isCss ? 'css' : 'js');
        console.warn('[WARN] Viewer.js - CDN 加载失败，尝试本地 ' + type.toUpperCase());

        window.createViewerFallback(isCss ? 'link' : 'script', url,
            function() {
                if (isCss) viewerRes.cssLoaded = true; else viewerRes.jsLoaded = true;
                viewerRes.currentCDN = 'local';
                console.log('本地 Viewer.js ' + type.toUpperCase() + ' 加载成功');
                viewerRes._notifyReady();
            },
            function() {
                console.error('[ERROR] Viewer.js - 本地 ' + type.toUpperCase() + ' 加载失败');
                viewerRes.localFallback = true;
                viewerRes._notifyFailed((typeof t === 'function') ? t('log.msg.viewerLoadFailedDetail') : 'Viewer.js 资源加载失败');
                if (!viewerRes.promptShown) {
                    viewerRes.promptShown = true;
                    setTimeout(function() {
                        alert((typeof t === 'function') ? t('alert.viewerLoadFailed') : '❌ Viewer.js 资源加载失败\n\n系统将使用基础图片查看器为您展示图片。\n如需完整功能，请检查网络连接或本地资源后刷新页面。');
                    }, 100);
                }
            }
        );
    };
    window.loadCDNFallback = function(resourceType, failedCDN) {
        console.warn('[WARN] Viewer.js - ' + failedCDN + ' ' + resourceType + ' 加载失败，降级');
        if (resourceType === 'css') {
            if (failedCDN === 'bootcdn') {
                console.log('尝试 cdnjs CSS');
                window.createViewerFallback('link',
                    'https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.7/viewer.min.css',
                    function() { viewerRes.cssLoaded = true; viewerRes.currentCDN = 'cdnjs'; console.log('cdnjs CSS 加载成功'); viewerRes._notifyReady(); },
                    function() { console.warn('[WARN] Viewer.js - cdnjs CSS 加载失败'); window.loadLocalViewerResource('css'); }
                );
            } else { window.loadLocalViewerResource('css'); }
        } else if (resourceType === 'js') {
            if (failedCDN === 'bootcdn') {
                console.log('尝试 cdnjs JS');
                window.createViewerFallback('script',
                    'https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.7/viewer.min.js',
                    function() { viewerRes.jsLoaded = true; viewerRes.currentCDN = 'cdnjs'; console.log('cdnjs JS 加载成功'); viewerRes._notifyReady(); },
                    function() { console.warn('[WARN] Viewer.js - cdnjs JS 加载失败'); window.loadLocalViewerResource('js'); }
                );
            } else { window.loadLocalViewerResource('js'); }
        }
    };
})();

// ---- iro.js 颜色选择器 CDN 加载 | 许可证：MIT License ----
window.iroResources = { loaded: false, loading: false, failed: false, _resolve: null, _reject: null };
window.iroResources.promise = new Promise(function(resolve, reject) {
    window.iroResources._resolve = resolve;
    window.iroResources._reject = reject;
});
try {
    if (localStorage.getItem('iroJs') !== 'false') {
        loadScriptWithFallback(
            'iro', window.iroResources,
            'https://fastly.jsdelivr.net/npm/@jaames/iro@5.5.2/dist/iro.min.js',
            [
                'https://unpkg.com/@jaames/iro@5.5.2/dist/iro.min.js',
                './assets/irojs/iro.js'
            ],
            function() { logError('iro.js', (typeof t === 'function') ? t('log.msg.allSourcesFailed', { name: 'iro.js' }) : '所有源均加载失败，颜色选择器功能将不可用'); }
        );
    } else {
        window.iroResources._reject(new Error('iro.js 已被用户禁用'));
    }
} catch (e) {
    if (typeof window.iroResources._reject === 'function') {
        window.iroResources._reject(new Error('localStorage 不可用，iro.js 跳过加载'));
    }
}

// ---- fflate ZIP 库加载 | 许可证：MIT License ----
window.fflateResources = { loaded: false, loading: false, failed: false, _resolve: null, _reject: null };
window.fflateResources.promise = new Promise(function(resolve, reject) {
    window.fflateResources._resolve = resolve;
    window.fflateResources._reject = reject;
});

function disableZipToggle() {
    var zipToggle = document.getElementById('zip-download-toggle');
    if (zipToggle) {
        zipToggle.disabled = true;
        zipToggle.title = (typeof t === 'function') ? t('i18n.zipUnavailable') : 'fflate 库加载失败，ZIP 功能不可用';
    }
}

loadScriptWithFallback(
    'fflate', window.fflateResources,
    'https://fastly.jsdelivr.net/npm/fflate@0.8.3/umd/index.min.js',
    [
        'https://unpkg.com/fflate@0.8.3/umd/index.js',
        './assets/fflate/fflate.js'
    ],
    function() {
        logError('fflate', (typeof t === 'function') ? t('log.msg.allSourcesFailed', { name: 'fflate' }) : '所有源均加载失败，ZIP 功能将不可用');
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', disableZipToggle);
        } else {
            disableZipToggle();
        }
    }
);

// ---- Viewer.js 加载 Promise ----
window.viewerLoadPromise = null;

function getViewerLoadPromise() {
    var viewerRes = window.viewerResources;
    if (window.Viewer && viewerRes.jsLoaded && viewerRes.cssLoaded) {
        return Promise.resolve();
    }
    if (window.viewerLoadPromise) return window.viewerLoadPromise;

    window.viewerLoadPromise = new Promise(function(resolve, reject) {
        if (viewerRes.jsLoaded && viewerRes.cssLoaded && window.Viewer) { resolve(); return; }
        if (viewerRes.localFallback) { reject(new Error((typeof t === 'function') ? t('log.msg.viewerLoadFailedDetail') : 'Viewer.js 资源加载失败')); return; }

        viewerRes._resolve = resolve;
        viewerRes._reject = reject;

        viewerRes._timeout = setTimeout(function() {
            logError('Viewer.js', (typeof t === 'function') ? t('log.msg.loadTimeout', { sec: 5 }) : '加载超时 (5s)');
            reject(new Error((typeof t === 'function') ? t('log.msg.loadTimeout', { sec: 5 }) : 'Viewer.js 加载超时'));
            viewerRes._resolve = viewerRes._reject = null;
        }, 5000);
    }).catch(function(err) {
        clearTimeout(viewerRes._timeout);
        window.viewerLoadPromise = null; throw err;
    });

    return window.viewerLoadPromise;
}

// ---- Viewer.js CSS 动态加载（主 CDN：bootcdn，降级链由 loadCDNFallback 处理） ----
(function() {
    var link = document.createElement('link');
    link.id = 'viewer-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.bootcdn.net/ajax/libs/viewerjs/1.11.7/viewer.min.css';
    link.onload = function() {
        if (window.viewerResources) {
            window.viewerResources.cssLoaded = true;
            window.viewerResources.currentCDN = 'bootcdn';
            window.viewerResources._notifyReady();
        }
    };
    link.onerror = function() {
        if (window.viewerResources) { loadCDNFallback('css', 'bootcdn'); }
    };
    document.head.appendChild(link);
})();

// ---- Viewer.js JS 动态加载（defer，降级链同上） ----
(function() {
    var script = document.createElement('script');
    script.id = 'viewer-js-bootcdn';
    script.src = 'https://cdn.bootcdn.net/ajax/libs/viewerjs/1.11.7/viewer.min.js';
    script.defer = true;
    script.onload = function() {
        if (window.viewerResources) {
            window.viewerResources.jsLoaded = true;
            window.viewerResources.currentCDN = 'bootcdn';
            window.viewerResources._notifyReady();
        }
    };
    script.onerror = function() { loadCDNFallback('js', 'bootcdn'); };
    document.head.appendChild(script);
})();
