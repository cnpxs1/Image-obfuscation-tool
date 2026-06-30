// 图片混淆工具 — 安全函数与浏览器能力检测
// =============================================
// 安全函数
// =============================================

/**
 * HTML 转义函数，防止 XSS 攻击
 * @param {string} str - 需要转义的字符串
 * @returns {string} 转义后的安全字符串
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * WebP支持检测结果缓存
 * @type {Promise<boolean>|null}
 */
let webpSupportCache = null;

/**
 * 检测浏览器是否支持WebP格式（带缓存优化）
 * @returns {Promise<boolean>} 是否支持WebP
 *
 * 优化：首次检测后缓存结果，避免重复创建Canvas检测
 */
function isWebPSupported() {
    // 如果已有缓存结果，直接返回
    if (webpSupportCache !== null) {
        return webpSupportCache;
    }

    // 首次检测并缓存结果
    webpSupportCache = new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        try {
            canvas.toBlob((blob) => {
                const supported = blob !== null;
                logLog(`WebP 支持检测: ${supported ? '支持' : '不支持'}`);
                resolve(supported);
            }, 'image/webp');
        } catch (e) {
            logWarn('浏览器检测', `WebP 支持检测失败: ${e.message || e}`);
            resolve(false);
        }
    });

    return webpSupportCache;
}

/**
 * 全局遮罩层清理函数
 * 清理页面上所有残留的处理中遮罩层
 * 作为异常情况下的最终保障措施
 */
function clearOverlays() {
    try {
        const allOverlays = document.querySelectorAll('.processing-overlay');
        let cleanedCount = 0;

        allOverlays.forEach(overlay => {
            if (overlay && overlay.parentNode) {
                overlay.remove();
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            logLog(`已清理 ${cleanedCount} 个残留的处理遮罩层`);
        }

        return cleanedCount;
    } catch (error) {
        logError('遮罩层清理', `全局遮罩层清理失败: ${error.message || error}`);
        return 0;
    }
}
