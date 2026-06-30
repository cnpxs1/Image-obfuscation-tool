// 图片混淆工具 — 日志系统（四级：Error / Warn / Info / Log）
// =============================================
// 日志系统
// =============================================

// 日志存根赋值（变量已在 loader.js 中通过 let 声明，此处覆盖接管日志系统）
// 注意：使用赋值而非 let 声明，避免重复声明导致的 SyntaxError
logLog = function(...args) { console.log(...args); };
logInfo = function(fileName, reason, metadata) { console.info('[INFO] ' + fileName + ' - ' + reason, metadata || {}); };
logWarn = function(fileName, reason, metadata) { console.warn('[WARN] ' + fileName + ' - ' + reason, metadata || {}); };
logError = function(fileName, reason, metadata) { console.error('[ERROR] ' + fileName + ' - ' + reason, metadata || {}); };

// ==================== 日志系统（四级：Error / Warn / Info / Log） ====================

// MAX_LOGS、LEVEL_COLORS、LEVEL_ORDER 已在 constants.js 中定义，此处直接引用
/** @type {Array<Object>} 日志数据存储 */
let logs = [];

/**
 * 日志管理器
 * 统一管理三级日志的添加、查询和清理
 */
const LogManager = {
    _counts: { error: 0, warn: 0, info: 0 },

    add(fileName, reason, level, metadata = {}) {
        const timestamp = new Date();
        const logEntry = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2),
            fileName,
            reason,
            level,
            timestamp,
            formattedTime: timestamp.toLocaleString('zh-CN', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            }),
            metadata: metadata,
        };
        logs.push(logEntry);
        if (level in this._counts) this._counts[level]++;
        if (logs.length > MAX_LOGS) {
            const removedLogs = logs.splice(0, logs.length - MAX_LOGS);
            for (const rl of removedLogs) {
                if (rl.level in this._counts) this._counts[rl.level]--;
            }
            this.cleanupLogs(removedLogs);
        }
        return logEntry;
    },

    cleanupLogs(targetLogs = logs) {
        targetLogs.forEach(log => {
            if (log.metadata) {
                Object.keys(log.metadata).forEach(key => {
                    const value = log.metadata[key];
                    if (typeof value === 'string' && value.startsWith('blob:')) {
                        try { URL.revokeObjectURL(value); } catch (e) { /* ignore */ }
                        delete log.metadata[key];
                    }
                });
            }
        });
    },

    remove(logId) {
        const index = logs.findIndex(log => log.id === logId);
        if (index !== -1) {
            const removedLog = logs.splice(index, 1)[0];
            if (removedLog.level in this._counts) this._counts[removedLog.level]--;
            this.cleanupLogs([removedLog]);
            return true;
        }
        return false;
    },

    clear() {
        this._counts = { error: 0, warn: 0, info: 0 };
        this.cleanupLogs();
        logs = [];
    },

    getByLevels(levels) {
        if (!levels || levels.size === 0) return logs;
        return logs.filter(l => levels.has(l.level));
    },

    getCounts() {
        return { ...this._counts };
    },

    /** 返回最高严重级别，无日志时返回 null */
    getHighestLevel() {
        for (const lv of LEVEL_ORDER) {
            if (logs.some(l => l.level === lv)) return lv;
        }
        return null;
    }
};

// LOG_LEVEL_HIERARCHY 已在 constants.js 中定义，此处直接引用

/** 检查给定级别是否满足当前日志输出阈值 */
function shouldOutputLog(level) {
    if (logLevel === 'off') return false;
    return LOG_LEVEL_HIERARCHY.indexOf(level) <= LOG_LEVEL_HIERARCHY.indexOf(logLevel);
}

// ---- 日志 API（同步 UI 面板 + 控制台）----

// 主日志函数（赋值覆盖早期存根，接管日志系统）
logError = function(fileName, reason, metadata = {}) {
    if (!shouldOutputLog('error')) return;
    LogManager.add(fileName, reason, 'error', metadata);
    console.error(`[ERROR] ${fileName} - ${reason}`, metadata);
    updateLogFab();
    if (logPanelVisible) renderLogPanel(currentFilter);
};

logWarn = function(fileName, reason, metadata = {}) {
    if (!shouldOutputLog('warn')) return;
    LogManager.add(fileName, reason, 'warn', metadata);
    _origConsoleWarn(`[WARN] ${fileName} - ${reason}`, metadata);
    updateLogFab();
    if (logPanelVisible) renderLogPanel(currentFilter);
};

logInfo = function(fileName, reason, metadata = {}) {
    if (!shouldOutputLog('info')) return;
    LogManager.add(fileName, reason, 'info', metadata);
    _origConsoleLog(`[INFO] ${fileName} - ${reason}`, metadata);
    updateLogFab();
    if (logPanelVisible) renderLogPanel(currentFilter);
};

logLog = function(...args) {
    if (!shouldOutputLog('log')) return;
    _origConsoleLog(...args);
};

// ---- UI 状态 ----

let logPanelVisible = false;
let currentFilter = new Set(); // 空集 = 全部, 多选: 'error'/'warn'/'info'
/** 跟踪列表中已渲染的日志 ID，用于增量更新 */
let renderedLogIds = new Set();
/** 上次渲染的筛选键，用于判断是否需要全量重建 */
let lastFilter = '';

// ---- 悬浮按钮 ----

function updateLogFab() {
    const fab = document.getElementById('logFab');
    if (!fab) return; // DOM 尚未加载完成，跳过更新
    const counts = LogManager.getCounts();
    const total = counts.error + counts.warn + counts.info;

    if (total === 0) {
        fab.style.display = 'none';
        return;
    }

    fab.style.display = 'flex';
    const highest = LogManager.getHighestLevel();
    fab.style.borderColor = LEVEL_COLORS[highest];

    let html = '';
    for (const lv of LEVEL_ORDER) {
        const count = counts[lv];
        if (count === 0) continue;
        const color = LEVEL_COLORS[lv];
        const displayCount = count > 99 ? '99+' : count;
        html += `<div class="log-fab-level">
            ${LOG_ICONS[lv]}
            <span class="log-fab-count" style="color:${color};background:${color}15;">${displayCount}</span>
        </div>`;
    }
    fab.innerHTML = html;
}

// ---- 日志面板 ----

/** 创建单个日志条目 DOM 元素 */
function createLogItem(l) {
    const item = document.createElement('div');
    item.className = `log-panel-item level-${l.level}`;
    item.dataset.logId = l.id;

    const ts = document.createElement('span');
    ts.className = 'log-timestamp';
    ts.textContent = `[${l.formattedTime}]`;

    const file = document.createElement('span');
    file.className = 'log-file';
    file.textContent = l.fileName;
    file.title = l.fileName;

    const reason = document.createElement('span');
    reason.className = 'log-reason';
    reason.textContent = `- ${l.reason}`;

    item.append(ts, file, reason);
    return item;
}

/** 清理 renderedLogIds 中已被 LogManager 移除的过期 ID */
function pruneRenderedIds(filteredLogs) {
    const liveIds = new Set(filteredLogs.map(l => l.id));
    for (const id of renderedLogIds) {
        if (!liveIds.has(id)) renderedLogIds.delete(id);
    }
}

function renderLogPanel(levels) {
    currentFilter = levels;
    const list = document.getElementById('logPanelList');
    const stats = document.getElementById('logStats');
    const filteredLogs = LogManager.getByLevels(levels);

    // 过滤器变化 → 全量重建
    const filterKey = levels.size === 0 ? '' : [...levels].sort().join(',');
    if (filterKey !== lastFilter) {
        lastFilter = filterKey;
        renderedLogIds.clear();

        if (filteredLogs.length === 0) {
            list.innerHTML = '<div class="log-panel-empty">暂无日志</div>';
        } else {
            const frag = document.createDocumentFragment();
            for (let i = filteredLogs.length - 1; i >= 0; i--) {
                frag.appendChild(createLogItem(filteredLogs[i]));
                renderedLogIds.add(filteredLogs[i].id);
            }
            list.innerHTML = '';
            list.appendChild(frag);
        }
    } else {
        // 同过滤器 → 增量追加新日志到顶部
        pruneRenderedIds(filteredLogs);
        const newLogs = filteredLogs.filter(l => !renderedLogIds.has(l.id));
        if (newLogs.length === 0) {
            renderStats(stats, levels);
            return;
        }

        const empty = list.querySelector('.log-panel-empty');
        if (empty) empty.remove();

        const frag = document.createDocumentFragment();
        for (let i = newLogs.length - 1; i >= 0; i--) {
            frag.appendChild(createLogItem(newLogs[i]));
            renderedLogIds.add(newLogs[i].id);
        }
        list.insertBefore(frag, list.firstChild);

        // 超出上限时移除底部旧 DOM 节点，同步清理 renderedLogIds 防止内存泄漏
        while (list.children.length > MAX_LOGS) {
            const last = list.lastElementChild;
            if (last && last.dataset && last.dataset.logId) {
                renderedLogIds.delete(last.dataset.logId);
            }
            last.remove();
        }
    }

    renderStats(stats, levels);
}

/** 渲染底部统计筛选按钮 */
function renderStats(statsEl, levels) {
    const counts = LogManager.getCounts();
    const allActive = levels.size === 0;
    statsEl.innerHTML = LEVEL_ORDER.map(lv => {
        const color = LEVEL_COLORS[lv];
        const active = levels.has(lv) ? ' active' : '';
        const borderStyle = allActive ? `border-color:${color};` : '';
        return `<button class="log-stat-btn${active}" data-level="${lv}" style="color:${color};${borderStyle}">
            ${LOG_ICONS[lv]} ${counts[lv]}
        </button>`;
    }).join('');
}

function openLogPanel() {
    logPanelVisible = true;
    logPanelOverlayEl.classList.add('open');
    currentFilter = new Set();
    lastFilter = ''; // 强制全量重建
    renderLogPanel(new Set());
}

function closeLogPanel() {
    logPanelVisible = false;
    logPanelOverlayEl.classList.remove('open');
}

/**
 * 切换日志浮动面板的显示/隐藏状态
 */
function toggleLogPanel() {
    if (logPanelVisible) closeLogPanel();
    else openLogPanel();
}

/**
 * 清空所有日志记录并关闭日志面板
 */
function clearAllLogs() {
    LogManager.clear();
    renderedLogIds.clear();
    lastFilter = '';
    updateLogFab();
    if (logPanelVisible) {
        renderLogPanel(new Set());
        closeLogPanel();
    }
}

// ---- 事件绑定（日志面板） ----
// （合并到下方 DOMContentLoaded 统一入口中）
