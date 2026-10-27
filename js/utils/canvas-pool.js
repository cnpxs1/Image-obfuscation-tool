// 图片混淆工具 — Canvas 池管理（按尺寸分组复用）
// =============================================
// Canvas池管理函数（按尺寸分组）
// =============================================

/**
 * 按尺寸分组的Canvas池
 * key: "width×height", value: HTMLCanvasElement[]
 * @type {Map<string, HTMLCanvasElement[]>}
 */
const canvasPoolBySize = new Map();
const recentCanvasSizes = new Map(); // key: "WxH", value: 最近使用次数

/**
 * 从Canvas池获取指定尺寸的Canvas对象
 * @param {number} width - 所需Canvas宽度
 * @param {number} height - 所需Canvas高度
 * @returns {HTMLCanvasElement} Canvas对象
 *
 * 按尺寸精确匹配，减少重复设置宽高的开销
 * 池为空时创建新对象并设置对应尺寸
 */
function getCanvasFromPool(width, height) {
    const key = `${width}x${height}`;

    // 记录实际请求的尺寸，用于页面可见时的智能预创建
    recentCanvasSizes.set(key, (recentCanvasSizes.get(key) || 0) + 1);

    let pool = canvasPoolBySize.get(key);

    if (!pool) {
        pool = [];
        canvasPoolBySize.set(key, pool);
    }

    if (pool.length > 0) {
        const canvas = pool.pop();
        // 防御性校验：若 Canvas 尺寸异常（如被清理操作清零），丢弃并重建
        if (canvas.width > 0 && canvas.height > 0) {
            return canvas;
        }
        logWarn(t('log.category.canvas'), t('log.msg.discardedCanvas', { w: canvas.width, h: canvas.height, key: key }));
    }

    // 池为空时创建新Canvas并设置尺寸，初始化上下文避免后续getContext属性不匹配
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d', { willReadFrequently: true, premultipliedAlpha: false });
    return canvas;
}

/**
 * 将Canvas对象按尺寸放回对应的池中
 * @param {HTMLCanvasElement} canvas - 要回收的Canvas对象
 *
 * 按Canvas的实际尺寸进行分组存储
 * 每个尺寸组限制最大容量为5个对象
 */
function releaseCanvasToPool(canvas) {
    // 使用Canvas的实际尺寸作为键
    const key = `${canvas.width}x${canvas.height}`;

    // 确保该尺寸组存在
    if (!canvasPoolBySize.has(key)) {
        canvasPoolBySize.set(key, []);
    }

    const pool = canvasPoolBySize.get(key);

    // 限制每个尺寸组的最大容量为5个Canvas对象
    if (pool.length < 5) {
        pool.push(canvas);
    }
    // 超过容量限制的对象会被垃圾回收
}

/**
 * 智能清理Canvas池
 * 保留部分常用尺寸的Canvas，避免频繁重建影响性能
 */
function smartClearCanvasPools() {
    // 使用近期实际处理过的尺寸作为保留依据，而非硬编码尺寸
    const RETAIN_COUNT_PER_SIZE = 2; // 每个尺寸保留2个Canvas

    canvasPoolBySize.forEach((pool, key) => {
        if (recentCanvasSizes.has(key)) {
            // 对于常用尺寸，保留部分Canvas
            if (pool.length > RETAIN_COUNT_PER_SIZE) {
                const canvasesToKeep = pool.slice(0, RETAIN_COUNT_PER_SIZE);
                const canvasesToClear = pool.slice(RETAIN_COUNT_PER_SIZE);

                // 清理多余的Canvas
                canvasesToClear.forEach(canvas => {
                    canvas.width = 0;
                    canvas.height = 0;
                });

                // 保留指定数量的Canvas
                pool.length = 0;
                pool.push(...canvasesToKeep);
                logLog(t('log.msg.retainedCanvas', { key: key, n: canvasesToKeep.length }));
            }
        } else {
            // 非常用尺寸完全清理
            pool.forEach(canvas => {
                canvas.width = 0;
                canvas.height = 0;
            });
            const cleanedCount = pool.length;
            pool.length = 0;
            logLog(t('log.msg.cleanedUnusedCanvas', { key: key, n: cleanedCount }));
        }
    });

    // 清理完全空的池
    for (const [key, pool] of canvasPoolBySize.entries()) {
        if (pool.length === 0) {
            canvasPoolBySize.delete(key);
        }
    }

    logLog(t('log.msg.smartCleanDone'));
}

/**
 * 预创建常用尺寸的Canvas
 * 在页面重新可见时提前创建可能需要的Canvas
 */
function preCreateCommonCanvases() {
    // 基于近期实际处理的图片尺寸预创建，而非固定硬编码尺寸
    if (recentCanvasSizes.size === 0) return;

    // 按使用频率排序，取前4个最常用尺寸
    const topSizes = [...recentCanvasSizes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    topSizes.forEach(([key]) => {
        const [w, h] = key.split('x').map(Number);
        let pool = canvasPoolBySize.get(key);

        if (!pool) {
            pool = [];
            canvasPoolBySize.set(key, pool);
        }

        // 确保每个常用尺寸至少有2个Canvas
        while (pool.length < 2) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d', { willReadFrequently: true, premultipliedAlpha: false });
            pool.push(canvas);
        }
    });

    logLog(t('log.msg.precreateDone', { n: topSizes.length }));
}

/**
 * 清理所有Canvas池中的对象
 *
 * 在页面卸载时调用，完全释放所有Canvas资源
 */
function clearAllCanvasPools() {
    canvasPoolBySize.forEach((pool) => {
        pool.forEach(canvas => {
            // 重置尺寸以帮助垃圾回收
            canvas.width = 0;
            canvas.height = 0;
        });
        pool.length = 0;
    });
    canvasPoolBySize.clear();
    recentCanvasSizes.clear();
    logLog(t('log.msg.allCanvasCleared'));
}
