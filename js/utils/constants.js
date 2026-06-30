// 图片混淆工具 — 全局常量与配置
// =============================================
// 共享常量
// =============================================

/** 日志最大数量限制 */
const MAX_LOGS = 100;

const LEVEL_COLORS = { error: '#d81e06', warn: '#ec7a40', info: '#1296db' };
const LEVEL_ORDER = ['error', 'warn', 'info']; // 严重程度降序

// ---- 日志级别层级 ----
const LOG_LEVEL_HIERARCHY = ['off', 'error', 'warn', 'info', 'log'];

// ---- SVG 图标内联 ----
// error: img/icons/error.svg
// warn:  img/icons/warn.svg
// info:  img/icons/info.svg

const LOG_ICONS = {
    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="471" stroke="#d81e06" stroke-width="81" fill="none"/><path d="M330 330L694 694M694 330L330 694" stroke="#d81e06" stroke-width="81" stroke-linecap="round" fill="none"/></svg>',
    warn: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 215 200"><path fill="#ec7a40" d="M187.6 199.4H27.4c-10.7 0-19.4-4.2-23.7-11.6-4.3-7.4-3.8-17 1.4-26.5L86 15.5c5.3-9.5 13.1-15 21.5-15s16.2 5.4 21.5 14.9l80.9 145.8c5.2 9.4 5.8 19.1 1.5 26.5-4.3 7.4-12.9 11.6-23.7 11.6ZM107.5 15.8c-2.7 0-5.7 2.7-8.2 7.1L18.4 168.8c-2.5 4.6-3.1 8.7-1.6 11.3 1.5 2.6 5.4 4.1 10.6 4.1h160.2c5.2 0 9.1-1.5 10.6-4.1 1.5-2.6 0.9-6.7-1.6-11.3L115.6 23c-2.5-4.4-5.5-7.1-8.2-7.1Z"/><line x1="107.5" y1="54" x2="107.5" y2="124" stroke="#ec7a40" stroke-width="15" stroke-linecap="round"/><circle cx="107.5" cy="156" r="12" fill="#ec7a40"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="471" stroke="#1296db" stroke-width="81" fill="none"/><line x1="512" y1="300" x2="512" y2="580" stroke="#1296db" stroke-width="81" stroke-linecap="round"/><circle cx="512" cy="720" r="47" fill="#1296db"/></svg>'
};

/** 通用关闭按钮 × 图标 SVG */
const CLOSE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path stroke="#333" stroke-width="150" stroke-linecap="round" fill="none" d="M100 100L924 924M924 100L100 924"/></svg>';
/** 缩略图加载前占位符 SVG（网格/列表视图通用） */
const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="display:block;width:60px;height:60px;margin:auto;opacity:.3"><rect width="100" height="100" fill="#ccc" rx="8"/><text x="50" y="58" text-anchor="middle" font-size="40" fill="#999">…</text></svg>';

/** 扩展名 → MIME 类型映射 */
const MIME_MAP = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    svg: 'image/svg+xml'
};
/** 有效图片扩展名列表 */
const VALID_EXTENSIONS = Object.keys(MIME_MAP);
/** 有效 MIME 类型列表 */
const VALID_MIME_TYPES = [...new Set(Object.values(MIME_MAP))];
