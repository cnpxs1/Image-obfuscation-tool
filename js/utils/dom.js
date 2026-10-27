// 图片混淆工具 — DOM 操作辅助函数

/** @type {{ bind: Function, unbind: Function }|null} 移动端气泡关闭处理器 */
let mobileTooltipCloser = null;
/** @type {Function|null} 缓存指示器 touch 滚动监听器引用（防泄漏） */
let cacheIndicatorTouchListeners = null;

/**
 * 关闭除当前元素外的所有气泡提示，防止多个气泡同时显示导致界面溢出
 * @param {HTMLElement} currentEl - 当前需要保留的气泡元素
 */
function dismissOtherTooltips(currentEl) {
    document.querySelectorAll('#cacheIndicator.tooltip-active, .text-tooltip.tooltip-active').forEach(el => {
        if (el !== currentEl) el.classList.remove('tooltip-active', 'edge-left', 'edge-right');
    });
    if (mobileTooltipCloser && currentEl?.id !== 'cacheIndicator') {
        mobileTooltipCloser.unbind();
        mobileTooltipCloser = null;
    }
}

/**
 * 更新缓存方案指示器显示
 * @param {string} cacheType - 缓存类型
 */
function updateCacheIndicator(cacheType) {
    const indicator = document.getElementById('cacheIndicator');
    if (indicator) {
        indicator.textContent = cacheType;
        indicator.style.display = 'block';
        // 设置气泡提示数据
        const tooltipText = cacheType === 'Cache API'
            ? t('storage.indicatorCacheApi')
            : t('storage.indicatorIndexedDb');
        indicator.setAttribute('data-tooltip', tooltipText);
        indicator.removeAttribute('title');

        // 清理旧的监听器
        if (mobileTooltipCloser) {
            mobileTooltipCloser.unbind();
            mobileTooltipCloser = null;
        }
        // 清理旧的 onclick
        indicator.onclick = null;

        // 清理旧的 touch 滚动监听器（无论当前屏幕尺寸，防止旧监听器残留）
        if (cacheIndicatorTouchListeners) {
            document.removeEventListener('touchstart', cacheIndicatorTouchListeners);
            document.removeEventListener('touchmove', cacheIndicatorTouchListeners);
            cacheIndicatorTouchListeners = null;
            indicator._touchDismissListener = null;
        }

        // 移动端点击事件
        if (window.innerWidth <= 768) {
            const closer = createClickOutsideCloser(indicator, ['tooltip-active']);
            mobileTooltipCloser = closer;

            indicator.onclick = function(e) {
                e.stopPropagation();
                // 激活前先关闭其他已展开的气泡，防止双气泡溢屏
                if (!this.classList.contains('tooltip-active')) {
                    dismissOtherTooltips(this);
                }
                this.classList.toggle('tooltip-active');
                closer.bind();
            };

            // 移动端滑动页面时关闭气泡
            cacheIndicatorTouchListeners = addTouchScrollDismiss(indicator);
        }
    }
}

/**
 * 更新缓存方案下拉菜单选项的可用状态
 * - 当前环境不支持的方案显示为灰色且禁止选择
 * - 仅在 StorageAdapter 初始化完成后调用
 */
function updateCacheSelectOptions() {
    const select = document.getElementById('cache-backend-select');
    if (!select) return;

    const avail = window.__cacheBackendAvail || { cacheApi: true, indexedDb: true };

    // 更新 Cache API 选项
    const cacheApiOption = select.querySelector('option[value="cache-api"]');
    if (cacheApiOption) {
        if (!avail.cacheApi) {
            cacheApiOption.disabled = true;
            cacheApiOption.style.color = 'gray';
        } else {
            cacheApiOption.disabled = false;
            cacheApiOption.style.color = '';
        }
    }

    // 更新 IndexedDB 选项
    const indexedDbOption = select.querySelector('option[value="indexeddb"]');
    if (indexedDbOption) {
        if (!avail.indexedDb) {
            indexedDbOption.disabled = true;
            indexedDbOption.style.color = 'gray';
        } else {
            indexedDbOption.disabled = false;
            indexedDbOption.style.color = '';
        }
    }

    // 同步下拉菜单值为当前实际使用的后端
    if (storage && storage.activeBackend) {
        const currentValue = storage.preference;
        if (select.value !== currentValue) {
            select.value = currentValue;
        }
    }
}

/**
 * 检测屏幕边缘，防止气泡超出屏幕
 * @param {HTMLElement} el
 */
function checkTooltipEdge(el) {
    const rect = el.getBoundingClientRect();
    const tooltipWidth = 200; // 估算气泡宽度（px）
    const centerX = rect.left + rect.width / 2;
    el.classList.remove('edge-left', 'edge-right');
    if (centerX - tooltipWidth / 2 < 10) {
        el.classList.add('edge-left');
    } else if (centerX + tooltipWidth / 2 > window.innerWidth - 10) {
        el.classList.add('edge-right');
    }
}

/**
 * 为文字气泡元素绑定PC悬停+移动端点击，含屏幕边缘检测
 * @param {HTMLElement} el
 */
function initTextTooltip(el) {
    // PC端：鼠标进入时检测边缘
    el.addEventListener('mouseenter', () => checkTooltipEdge(el));
    el.addEventListener('mouseleave', () => el.classList.remove('edge-left', 'edge-right'));

    // 移动端点击行为
    if (window.innerWidth > 768) return;
    // 清理之前可能残留的移动端 Closer，防止监听器泄漏
    if (mobileTooltipCloser) { mobileTooltipCloser.unbind(); mobileTooltipCloser = null; }
    const closer = createClickOutsideCloser(el, ['tooltip-active', 'edge-left', 'edge-right']);
    mobileTooltipCloser = closer;

    el.addEventListener('click', function(e) {
        e.stopPropagation();
        // 激活前先关闭其他已展开的气泡，防止双气泡溢屏
        if (!el.classList.contains('tooltip-active')) {
            dismissOtherTooltips(el);
        }
        el.classList.toggle('tooltip-active');

        if (el.classList.contains('tooltip-active')) {
            checkTooltipEdge(el);
            closer.bind();
        } else {
            el.classList.remove('edge-left', 'edge-right');
            closer.unbind();
        }
    });

    addTouchScrollDismiss(el);
}

/**
 * 根据图片 ID 获取对应的 DOM 元素（消除重复的 [data-id] 查询）
 * @param {string} id - 图片 ID
 * @returns {HTMLElement|null}
 */
function getImageItemEl(id) {
    return document.querySelector(`[data-id="${id}"]`);
}

/**
 * 创建点击外部关闭处理器，用于 tooltip 等浮层组件
 * @param {HTMLElement} el - 目标元素
 * @param {string[]} classList - 关闭时需移除的 CSS 类名
 * @returns {{ bind: Function, unbind: Function }}
 */
function createClickOutsideCloser(el, classList) {
    let controller = null;
    function remove() {
        if (controller) {
            controller.abort();
            controller = null;
        }
    }
    return {
        bind() {
            remove();
            controller = new AbortController();
            const signal = controller.signal;
            // 使用 passive 优化移动端滚动性能
            document.addEventListener('click', (ev) => {
                if (!el.contains(ev.target)) {
                    el.classList.remove(...classList);
                    remove();
                }
            }, { signal, passive: true });
        },
        unbind: remove
    };
}

/** 检查 localStorage 是否可用于非保护键 */
function isStorageEnabledForKey(key) {
    return key === 'localStorageEnabled' || localStorageEnabled;
}

/**
 * 创建 ImageBitmap 并自动管理生命周期（消除重复的 createImageBitmap + finally close 模式）
 * @param {Blob} blob - 图片 Blob
 * @param {(bitmap: ImageBitmap) => Promise<any>} callback
 * @returns {Promise<any>} callback 的返回值
 */
async function withImageBitmap(blob, callback) {
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
    try {
        return await callback(bitmap);
    } finally {
        bitmap.close();
    }
}

/** 释放单个 img 元素的 Blob URL，避免内存泄漏 */
function releaseImgBlob(img) {
    if (img && img.dataset.blobUrl && img.dataset.blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(img.dataset.blobUrl);
        img.onerror = null;  // 避免清空 src 时触发虚假的"图片加载失败"日志
        img.src = '';
        delete img.dataset.blobUrl;
    }
}

/** 释放容器中所有图片元素的 Blob URL（复用 releaseImgBlob 逻辑） */
function revokeBlobUrls(container) {
    if (!container) return;
    container.querySelectorAll('img').forEach(img => releaseImgBlob(img));
}

/** 触发浏览器下载 Blob */
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = fileName;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

/** 在图片项上显示处理中遮罩，返回遮罩元素 */
function showProcessingOverlay(item) {
    const overlay = document.createElement('div');
    overlay.className = 'processing-overlay';
    overlay.innerHTML = '<div class="loading"></div>';
    item.querySelector('.thumbnail-container').appendChild(overlay);
    return overlay;
}

/** 显示批量操作结果状态消息 */
function showBatchStatus(successCount, failureCount, actionVerbKey) {
    let message;
    if (failureCount === 0) {
        message = t('toast.allSucceeded', { action: t(actionVerbKey), n: successCount });
    } else if (successCount === 0) {
        message = t('toast.allFailed', { action: t(actionVerbKey), n: failureCount });
    } else {
        message = t('toast.partial', { ok: successCount, fail: failureCount });
    }
    showTempStatus(message, 3000);
}

/** 校验 RGB 输入值（过滤非数字字符 + 钳位到 0-255），返回数值 */
function validateRgbInput(input) {
    // 过滤所有非数字字符，仅保留 0-9
    let raw = input.value.replace(/[^0-9]/g, '');
    // 限制最大 3 位数字（0-255）
    if (raw.length > 3) raw = raw.slice(0, 3);
    input.value = raw;
    // 解析并钳位
    let value = raw === '' ? 0 : parseInt(raw);
    if (value > 255) {
        value = 255;
        input.value = '255';
    }
    return value;
}

/** 校验质量输入值（钳位到 1-100），返回数值 */
function validateQualityInput(input) {
    let value = parseInt(input.value) || 1;
    if (value > 100) value = 100;
    if (value < 1) value = 1;
    input.value = String(value);
    return value;
}

function saveSetting(key, value) {
    if (!isStorageEnabledForKey(key)) return;
    try { localStorage.setItem(key, value); } catch (e) {}
}
function loadSetting(key) {
    if (!isStorageEnabledForKey(key)) return null;
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function addTouchScrollDismiss(element) {
    if (element._touchDismissListener) {
        document.removeEventListener('touchstart', element._touchDismissListener);
        document.removeEventListener('touchmove', element._touchDismissListener);
    }
    let startY = 0;
    const closeOnScroll = (e) => {
        if (!element.classList.contains('tooltip-active')) return;
        if (e.type === 'touchstart') { startY = e.touches[0].clientY; }
        else if (Math.abs(e.touches[0].clientY - startY) > 10) {
            element.classList.remove('tooltip-active', 'edge-left', 'edge-right');
        }
    };
    document.addEventListener('touchstart', closeOnScroll, { passive: true });
    document.addEventListener('touchmove', closeOnScroll, { passive: true });
    element._touchDismissListener = closeOnScroll;
    return closeOnScroll;
}

function cleanupImageFromUi(imageId, skipUI = false) {
    const item = getImageItemEl(imageId);
    if (item) item.remove();
    if (imageLazyLoader) imageLazyLoader.unobserve(imageId);
    images = images.filter(item => item.id !== imageId);
    selectedImages.delete(imageId);
    if (!skipUI) {
        updateSaveButtonText();
        updateImageCounter();
        if (images.length === 0) toggleEmptyState(true);
    }
}
