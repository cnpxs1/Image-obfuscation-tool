// 图片混淆工具 — 全局状态与事件绑定入口
// =============================================
// 全局变量声明
// =============================================

/** @type {Array} 存储所有图片数据的数组 */
let images = [];
/** @type {Set<string>} 存储选中图片 ID 的集合 */
let selectedImages = new Set();
/** @type {number[]} 按 (w,h) 升序的处理顺序索引，导入/删除时由 updateProcessOrder 更新 */
let processOrder = [];
/** 批量导入计数器，确保高并发场景下 ID 唯一性 */
let _batchIdCounter = 0;
var isProcessing = false, processingTimer = null, timerEnabled = false;
const OP = { encrypt: '混淆', decrypt: '解混淆', restore: '还原' };

// ==================== 高频 DOM 元素缓存（减少重复查询） ====================
/** @type {HTMLElement|null} 批量操作状态栏，在 DOMContentLoaded 中初始化 */
let batchStatusEl = null;
/** @type {HTMLElement|null} 日志面板遮罩层 */
let logPanelOverlayEl = null;

function startProcessingTimer(n, op) { processingTimer = { s: performance.now(), n, op: OP[op] }; }

/**
 * 停止处理计时器，计算并输出耗时统计信息
 */
function stopProcessingTimer() {
    if (!timerEnabled) return; const t = processingTimer; if (!t) return;
    const e = performance.now() - t.s;
    logLog(`[处理计时] ${t.op ? '[' + t.op + '] ' : ''}处理 ${t.n} 张图片，总耗时 ${e < 1e3 ? Math.round(e) + 'ms' : e < 6e4 ? (e / 1e3).toFixed(2) + 's' : Math.floor(e / 6e4) + 'min ' + ((e % 6e4) / 1e3).toFixed(1) + 's'}`);
    processingTimer = null;
}

/** @type {boolean} 首次导入文件标志 */
let hasImportedFiles = false;
/**
 * @typedef {Object} ViewerInstance
 * @property {function(): void} destroy - 销毁实例
 * @property {function(): void} show - 显示查看器
 * @property {function(number): void} view - 切换到指定索引的图片
 * @property {Array<{dataset: Object}>} images - 图片元素列表
 */

/** @type {ViewerInstance|null} Viewer.js 实例 */
let viewerInstance = null;
/** @type {number} 预览取消标志 */
let previewNonce = 0;
/**
 * 检查预览令牌是否已过期，防止竞态条件下旧预览覆盖新预览
 * @param {number} token - 预览令牌
 * @returns {boolean} 令牌是否已过期
 */
function isPreviewStale(token) { return token !== previewNonce; }
/** @type {string} 日志输出级别: 'error' | 'warn' | 'info' | 'log' */
let logLevel = 'info';
/** @type {boolean} 本地存储开关 */
let localStorageEnabled = true;
/** @type {boolean} 使用 Viewer.js 查看器 */
let useViewerJs = true;
/** @type {Function|null} 当前活跃基础查看器的关闭函数，用于新实例接管前彻底清理旧实例 */
var activeBasicViewerClose = null;
/** @type {boolean} 使用 iro.js 颜色选择器 */
let useIroJs = true;

// 保存原始 console 方法（在 console.log 被覆盖前）
const _origConsoleLog = console.log.bind(console);
const _origConsoleWarn = console.warn.bind(console);

// ==================== 视图模式管理 ====================
// 在 app.js 用 var 正式声明（全局状态归属地），view-mode.js/events.js 直接赋值引用
var currentViewMode = 'grid'; // 'grid' 或 'list'
var isSwitchingViewMode = false;
/** @type {ImageLazyLoader|null} 图片缩略图懒加载管理器 */
var imageLazyLoader = null;

// 全局存储实例（在 storage-adapter.js 加载后创建）
const storage = new StorageAdapter();

// =============================================
// 批量操作函数
// =============================================

/**
 * 按 (width, height) 升序生成处理顺序索引数组（纯函数，不修改 images）
 * 小图（max(w,h) ≤ threshold）使用双层计数排序 O(n)，大图使用快排 O(n log n)
 * @param {Array<{width: number, height: number}>} imageList
 * @param {number} [threshold=16384] - 计数排序的尺寸上限
 * @returns {number[]} 按 (w, h) 升序排列的 images 索引
 */
function buildDimensionProcessOrder(imageList, threshold = 16384) {
    const n = imageList.length;
    if (n === 0) return [];

    const smallIdx = [];
    const largeIdx = [];

    for (let i = 0; i < n; i++) {
        const { width: w, height: h } = imageList[i];
        if (Math.max(w, h) <= threshold) {
            smallIdx.push(i);
        } else {
            largeIdx.push(i);
        }
    }

    const countW = Array.from({ length: threshold + 1 }, () => []);
    for (const idx of smallIdx) {
        countW[imageList[idx].width].push(idx);
    }

    const smallOrder = [];
    for (let w = 0; w <= threshold; w++) {
        const group = countW[w];
        if (group.length === 0) continue;

        const countH = new Map();
        for (const idx of group) {
            const h = imageList[idx].height;
            if (!countH.has(h)) countH.set(h, []);
            countH.get(h).push(idx);
        }
        const sortedH = [...countH.keys()].sort((a, b) => a - b);
        for (const h of sortedH) {
            const indices = countH.get(h);
            for (let k = 0; k < indices.length; k++) {
                smallOrder.push(indices[k]);
            }
        }
    }

    largeIdx.sort((a, b) => {
        const diffW = imageList[a].width - imageList[b].width;
        if (diffW !== 0) return diffW;
        return imageList[a].height - imageList[b].height;
    });

    const result = new Array(n);
    let pos = 0;
    for (let i = 0; i < smallOrder.length; i++) result[pos++] = smallOrder[i];
    for (let i = 0; i < largeIdx.length; i++) result[pos++] = largeIdx[i];
    return result;
}

/** 更新全局 processOrder（导入/删除图片后调用） */
function updateProcessOrder() {
    processOrder = buildDimensionProcessOrder(images);
}

/** 空选择守卫，无选中图片时提示并返回 null */
function guardEmptySelection() {
    const targetIds = getTargetImageIds();
    if (targetIds.length === 0) {
        showTempStatus('⚠️ 请先选择图片');
        return null;
    }
    return targetIds;
}

/**
 * 批量遍历目标图片的通用循环骨架，消除 processBatch / saveImages 中的重复代码
 * @param {string} actionLabel - 操作名称（处理/保存）
 * @param {number|undefined} delayMs - 进度更新的延时
 * @param {Function} processorFn - (imageData, imageId) => Promise<void>
 * @returns {Promise<{successCount: number, failureCount: number}|null>}
 */
async function forEachTargetImage(actionLabel, delayMs, processorFn) {
    const targetIds = guardEmptySelection();
    if (!targetIds) return null;

    batchStatusEl.innerHTML = `<div class="loading"></div> 正在${actionLabel} ${targetIds.length} 张图片...`;

    const imageMap = new Map(images.map(item => [item.id, item]));
    let successCount = 0, failureCount = 0;
    for (let i = 0; i < targetIds.length; i++) {
        const imageId = targetIds[i];
        const imageData = imageMap.get(imageId);
        if (!imageData) {
            failureCount++;
            continue;
        }

        try {
            await processorFn(imageData, imageId, i);
            successCount++;
        } catch (error) {
            failureCount++;
            logError(imageData.name, `${actionLabel}失败: ${error.message || '未知错误'}`);
        }
        await updateProgressStatus(batchStatusEl, i + 1, targetIds.length, actionLabel, delayMs);
    }
    showBatchStatus(successCount, failureCount, actionLabel);
    return { successCount, failureCount };
}

/**
 * 批量处理图片（混淆/解混淆/还原）
 * @param {string} operation - 操作类型：'encrypt'|'decrypt'|'restore'
 */
async function processBatch(operation) {
    if (isProcessing) return;
    isProcessing = true;
    try {
        const timerStarted = await processBatchConcurrent(operation);
        if (timerStarted) stopProcessingTimer();
    } catch (error) {
        logError('批量处理', '批量处理失败: ' + (error.message || error));
        showTempStatus('❌ 处理失败');
        stopProcessingTimer();
    } finally {
        isProcessing = false;
    }
}

/** 保存图片（根据 ZIP 开关选择打包/逐个下载） */
async function saveImages(format) {
    try {
        if (document.getElementById('zip-download-toggle')?.checked) {
            await saveImagesAsZip(format);
        } else {
            await forEachTargetImage('保存', 50, async (imageData) => {
                await saveImageInFormat(imageData, format);
            });
        }
    } catch (error) {
        logError('批量保存', `保存失败: ${error.message || error}`);
        showTempStatus('❌ 保存失败');
    }
}

/**
 * 保存图片到本地（公共函数）
 */
async function saveImageInFormat(imageData, format) {
    const blob = await storage.get(`current_${imageData.id}`);
    if (!blob) throw new Error('图片数据不存在');

    const targetFormat = format.toLowerCase();
    if (targetFormat === 'webp' && !(await isWebPSupported())) {
        throw new Error('浏览器不支持 WebP');
    }
    const outputBlob = await convertImageBlob(blob, targetFormat);

    const ext = getOutputExtension(targetFormat);
    const statusSuffix = getStatusInfo(imageData.scrambleLevel).suffix;
    const fileName = `${imageData.name.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]/g, '_')}_${statusSuffix}.${ext}`;
    downloadBlob(outputBlob, fileName);
}

// =============================================
// 选择功能函数
// =============================================

/**
 * 更新保存按钮文字
 */
function updateSaveButtonText() {
    const saveBtn = document.getElementById('save-format-btn');
    if (saveBtn) {
        saveBtn.textContent = selectedImages.size > 0 ? '保存所选' : '保存所有';
    }
}

/**
 * 切换图片选择状态
 * @param {string} imageId - 图片ID
 * @param {Event} event - 事件对象
 */
function toggleSelect(imageId, event) {
    event.stopPropagation();

    const checked = event.target.checked;
    const item = getImageItemEl(imageId);

    if (checked) {
        selectedImages.add(imageId);
        if (item) item.classList.add('selected');
    } else {
        selectedImages.delete(imageId);
        if (item) item.classList.remove('selected');
    }

    updateSaveButtonText();
}

/** 全选所有图片 */
function selectAll() {
    selectedImages.clear();
    const items = document.querySelectorAll('.image-item');
    for (const item of items) {
        const id = item.dataset.id;
        if (!id) continue;
        selectedImages.add(id);
        item.classList.add('selected');
        const checkbox = item.querySelector('.select-checkbox');
        if (checkbox) checkbox.checked = true;
    }
    updateSaveButtonText();
}

/** 清空所有图片选择 */
function clearSelection() {
    const selectedItems = document.querySelectorAll('.image-item.selected');
    for (const item of selectedItems) {
        item.classList.remove('selected');
        const checkbox = item.querySelector('.select-checkbox');
        if (checkbox) checkbox.checked = false;
    }
    selectedImages.clear();
    updateSaveButtonText();
}

/**
 * 内部函数：删除指定 ID 的图片（批量或单张）
 * @param {string[]} imageIds - 要删除的图片 ID 数组
 * @param {boolean} isBatch - 是否为批量操作
 */
async function _deleteImagesByIds(imageIds, isBatch) {
    for (const id of imageIds) {
        await storage.deleteImageData(id);
    }
    imageIds.forEach(id => cleanupImageFromUi(id, true));

    if (!isBatch) {
        updateSaveButtonText();
        updateImageCounter();
    }

    if (images.length === 0) {
        toggleEmptyState(true);
        await storage.clear();
        logLog('所有图片已删除：已清除全部缓存');
    }

    updateProcessOrder();
}

/** 删除选中的图片 */
async function deleteSelectedImages() {
    if (guardProcessing()) return;
    if (selectedImages.size === 0) { showTempStatus('⚠️ 请先选择要删除的图片'); return; }

    const idsToDelete = Array.from(selectedImages);
    await _deleteImagesByIds(idsToDelete, true);
    selectedImages.clear();
    updateSaveButtonText();
    updateImageCounter();
    logLog(`已删除 ${idsToDelete.length} 张选中的图片`);
}

/** 删除单张图片 */
async function deleteSingleImage(imageId) {
    if (guardProcessing()) return;
    const imageData = images.find(item => item.id === imageId);
    if (!imageData) { logWarn('图片删除', `未找到要删除的图片: ${imageId}`); return; }

    try {
        await _deleteImagesByIds([imageId], false);
        logLog('已删除图片:', imageData.name);
    } catch (error) {
        logError('图片删除', `删除图片时出错: ${error.message || error}`);
        alert('删除图片失败: ' + (error.message || '未知错误'));
    }
}

// =============================================
// 单张图片处理函数
// =============================================

/** 处理单张图片（UI 入口，含保存） */
async function processSingle(imageId, operation) {
    if (isProcessing) return;

    isProcessing = true;
    if (operation !== 'save') startProcessingTimer(1, operation);

    const imageData = images.find(item => item.id === imageId);
    if (!imageData) {
        stopProcessingTimer();
        isProcessing = false;
        return;
    }

    let overlay = null;
    try {
        if (operation === 'save') {
            await saveSingleImage(imageId);
        } else {
            const item = getImageItemEl(imageId);
            if (item) overlay = showProcessingOverlay(item);

            await processSingleImage(imageData, operation);

            showTempStatus(`✅ "${imageData.name}" 处理完成`);
        }
    } catch (error) {
        logError(imageData.name, `处理失败: ${error.message || error}`);
        showTempStatus(`❌ "${imageData.name}" 处理失败`);
    } finally {
        overlay?.remove();
        stopProcessingTimer();
        isProcessing = false;
    }
}

/** 保存单张图片到本地 */
async function saveSingleImage(imageId) {
    const imageData = images.find(item => item.id === imageId);
    if (!imageData) {
        logError('图片管理', `未找到指定图片: ${imageId}`);
        return;
    }

    const format = document.getElementById('save-format-select').value;

    batchStatusEl.innerHTML = `<div class="loading"></div> 正在保存 "${imageData.name}"...`;

    try {
        await saveImageInFormat(imageData, format);
        showTempStatus(`✅ "${imageData.name}" 保存完成`);
    } catch (error) {
        logError(imageData.name, `保存失败: ${error.message || error}`);
        showTempStatus(`❌ "${imageData.name}" 保存失败`);
    }
}

// =============================================
// 辅助函数
// =============================================

/** 格式化字节数为易读格式 (B/KB/MB/GB/TB) */
function formatFileSize(bytes) {
    if (!bytes || bytes < 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 更新图片信息显示
 * @param {string} imageId - 图片 ID
 */
function updateImageInfo(imageId) {
    const imageData = images.find(item => item.id === imageId);
    if (!imageData) return;

    const cache = imageData.domCache;
    if (!cache) return;

    if (cache.sizeRow) {
        const hasSize = imageData.width > 0 && imageData.height > 0;
        cache.sizeRow.innerHTML = `<span>${hasSize ?
            `${imageData.width}×${imageData.height}` :
            '<span style="color: #999; font-style: italic;">尺寸未知</span>'}</span>`;
    }

    if (cache.fileSize) {
        cache.fileSize.textContent = `格式：${imageData.format || 'N/A'} | ${formatFileSize(imageData.size)}`;
    }

    if (cache.statusBadge) {
        const statusInfo = getStatusInfo(imageData.scrambleLevel);
        cache.statusBadge.className = `status-badge ${statusInfo.className}`;
        cache.statusBadge.textContent = statusInfo.text;
    }
}

/** 更新图片计数器显示 */
function updateImageCounter() {
    document.getElementById('imageCounter').textContent = `共 ${images.length} 张图片`;
}

/** 切换空状态提示的显示/隐藏 */
function toggleEmptyState(visible) {
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
        emptyState.style.display = visible ? 'block' : 'none';
    }
}
