// 图片混淆工具 — 国际化管理器（动态加载语言文件 / 自定义 JSON 导入）
// ============================================================
// 功能：
//   1. 内置语言：i18n/*.json（HTTP 模式 fetch 加载；file:// 模式
//      使用 js/i18n/builtin-langs.js 中的内嵌快照兜底）
//   2. 自定义语言：用户通过「导入语言文件」按钮加载 .json 文件，
//      解析成功后保存在 localStorage，刷新后依然可用
//   3. t(key, params) 全局翻译函数，{var} 占位符插值
//   4. applyLanguage() 将翻译应用到带 data-i18n 系列属性的 DOM 元素，
//      并触发 'i18n:changed' 事件供动态内容刷新
//   5. 当前语言选择持久化在 localStorage（键 i18n.lang）
//
// 语言文件结构（JSON，可直接编辑）：
//   {
//     "meta": { "id": "my-lang", "name": "显示名称", "lang": "zh-CN", "author": "" },
//     "app":  { "title": "..." },
//     ...
//   }
//   键名使用「段.键」的点分形式（如 app.title），程序会自动展平。
// ============================================================

(function (global) {
    'use strict';

    const STORAGE_LANG_KEY = 'i18n.lang';
    const STORAGE_CUSTOM_KEY = 'i18n.custom';
    const FALLBACK_LANG = 'zh-CN';

    const I18n = {
        /** @type {Object} 当前语言的扁平字典 */
        dict: {},
        /** @type {Object} zh-CN 兜底字典（缺失键时回退） */
        fallbackDict: {},
        /** @type {string} 当前语言标识 */
        langId: FALLBACK_LANG,
        /** @type {string} 当前语言的 locale（用于日期时间格式化） */
        locale: 'zh-CN',
        /** @type {Array<{id: string, name: string, author: string, builtin: boolean}>} 语言列表 */
        languages: [],
        /** @type {Array<{id: string, name: string, author: string, json: string}>} 自定义语言（原始 JSON 文本） */
        customLangs: [],
        /** @type {Promise|null} 初始化 Promise */
        _ready: null,
        _warnedKeys: new Set()
    };

    /** 全局翻译函数（缺失键回退 zh-CN，再回退键名本身） */
    function t(key, params) {
        const lang = I18n;
        let text = lang.dict[key];
        if (text === undefined) text = lang.fallbackDict[key];
        if (text === undefined) {
            if (!lang._warnedKeys.has(key)) {
                lang._warnedKeys.add(key);
                console.warn('[i18n] 缺少翻译键: ' + key + '（当前语言: ' + lang.langId + '）');
            }
            text = key;
        }
        return interpolate(String(text), params);
    }

    /** {var} 占位符插值 */
    function interpolate(text, params) {
        if (!params) return text;
        return text.replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
            const value = params[name];
            return value === undefined || value === null ? match : String(value);
        });
    }

    /** 将嵌套 JSON 展平为点分键字典 */
    function flattenDict(nested, prefix, out) {
        for (const key of Object.keys(nested)) {
            const value = nested[key];
            const flatKey = prefix ? prefix + '.' + key : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                flattenDict(value, flatKey, out);
            } else {
                out[flatKey] = value;
            }
        }
        return out;
    }

    /** 解析语言 JSON 并校验 [meta]，返回 { dict, meta }，失败抛错 */
    function parseLanguageJson(jsonText) {
        let data;
        try {
            data = JSON.parse(jsonText);
        } catch (e) {
            throw new Error('JSON: ' + e.message);
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error(t('i18n.missingMeta'));
        }
        const rawMeta = (data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta))
            ? data.meta
            : {};
        const rawId = rawMeta.id;
        const rawLang = rawMeta.lang || rawId;
        const meta = {
            // id/lang 必须是字符串，否则 localStorage 持久化后再读取会因类型不一致而失效
            id: typeof rawId === 'string' ? rawId.trim() : '',
            name: rawMeta.name,
            lang: typeof rawLang === 'string' ? rawLang.trim() : '',
            author: typeof rawMeta.author === 'string' ? rawMeta.author : ''
        };
        if (!meta.name || typeof meta.name !== 'string' || meta.name.trim() === '') {
            throw new Error(t('i18n.missingMeta'));
        }
        return { dict: flattenDict(data, '', {}), meta: meta };
    }

    /** 读取 localStorage（异常安全） */
    function readStorage(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeStorage(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* 存储不可用时忽略 */ }
    }

    /** 获取内置语言快照（builtin-langs.js 顶层 const，同全局词法作用域，非 window 属性） */
    function getBuiltinSnapshots() {
        return (typeof BUILTIN_LANGS_JSON !== 'undefined') ? BUILTIN_LANGS_JSON : {};
    }

    /** 解析内置语言快照（同步，保证 t() 立即可用） */
    function seedBuiltinLangs() {
        I18n.languages = [];
        const snapshots = getBuiltinSnapshots();
        for (const id of Object.keys(snapshots)) {
            try {
                const parsed = parseLanguageJson(snapshots[id]);
                I18n.languages.push({
                    id: parsed.meta.id || id,
                    name: parsed.meta.name,
                    author: parsed.meta.author,
                    builtin: true
                });
                if (id === FALLBACK_LANG) I18n.fallbackDict = parsed.dict;
            } catch (e) {
                console.warn('[i18n] 内置语言 ' + id + ' 解析失败: ' + e.message);
            }
        }
        // 同步种子字典：当前语言尚未加载时先用 zh-CN，保证 t() 可用
        if (Object.keys(I18n.dict).length === 0) I18n.dict = I18n.fallbackDict;
    }

    /** 恢复 localStorage 中的自定义语言 */
    function restoreCustomLangs() {
        I18n.customLangs = [];
        try {
            const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
            if (!raw) return;
            const list = JSON.parse(raw);
            if (!Array.isArray(list)) return;
            for (const entry of list) {
                if (!entry || typeof entry.json !== 'string') continue;
                if (typeof entry.id !== 'string' || entry.id === '') continue;
                const name = typeof entry.name === 'string' && entry.name ? entry.name : entry.id;
                const author = typeof entry.author === 'string' ? entry.author : '';
                // 跳过与内置语言或已有条目重复的 id，避免下拉框出现重复项
                if (findLanguage(entry.id)) continue;
                try {
                    parseLanguageJson(entry.json);
                    I18n.customLangs.push({ id: entry.id, name: name, author: author, json: entry.json });
                    I18n.languages.push({ id: entry.id, name: name, author: author, builtin: false });
                } catch (e) {
                    console.warn('[i18n] 自定义语言 ' + entry.id + ' 恢复失败: ' + e.message);
                }
            }
        } catch (e) { /* localStorage 不可用 */ }
    }

    /** 按 id 查找语言 */
    function findLanguage(id) {
        return I18n.languages.find(function (l) { return l.id === id; }) || null;
    }

    /** 加载指定语言的字典（内置：fetch JSON → 快照兜底；自定义：解析存储的 JSON） */
    async function loadDict(id) {
        const lang = findLanguage(id);
        if (!lang) throw new Error('Unknown language: ' + id);

        if (!lang.builtin) {
            const custom = I18n.customLangs.find(function (l) { return l.id === id; });
            if (!custom) throw new Error('Unknown language: ' + id);
            const parsed = parseLanguageJson(custom.json);
            I18n.locale = parsed.meta.lang || id;
            return parsed.dict;
        }

        // 内置语言：优先 fetch i18n/{id}.json（用户可直接编辑生效），失败回退内嵌快照
        let parsed = null;
        const jsonSnapshot = getBuiltinSnapshots()[id];
        const singleFile = typeof window !== 'undefined' && window.__SINGLE_FILE__ === true;
        if (singleFile) {
            // 单文件构建没有独立的 i18n 目录，直接使用内嵌快照
            if (jsonSnapshot) parsed = parseLanguageJson(jsonSnapshot);
        } else {
            try {
                // 不使用时间戳查询参数：由 sw.js 对 i18n/ 路径采用 network-first，
                // 既能保证编辑 JSON 后刷新生效，也避免每次请求生成新的缓存条目
                const url = 'i18n/' + id + '.json';
                const response = await fetch(url, { cache: 'no-store' });
                if (response.ok) {
                    parsed = parseLanguageJson(await response.text());
                } else {
                    console.warn('[i18n] ' + url + ' 加载失败 (HTTP ' + response.status + ')，使用内嵌快照');
                }
            } catch (e) {
                if (!jsonSnapshot) throw e;
                // file:// 等无法 fetch 的场景
            }
        }
        if (!parsed && jsonSnapshot) {
            parsed = parseLanguageJson(jsonSnapshot);
        }
        if (!parsed) throw new Error('Language not found: ' + id);
        I18n.locale = parsed.meta.lang || id;
        return parsed.dict;
    }

    /** 判断当前语言或 zh-CN 兜底字典是否包含指定键 */
    function hasTranslation(key) {
        return I18n.dict[key] !== undefined || I18n.fallbackDict[key] !== undefined;
    }

    /** 将翻译应用到带 data-i18n 系列属性的 DOM 元素 */
    function applyLanguage() {
        if (!I18n.dict) return;

        // <html lang>
        const langAttr = I18n.locale || I18n.langId;
        if (document.documentElement) document.documentElement.lang = langAttr;
        // 页面标题与描述（当前语言缺失时由 t() 回退 zh-CN）
        if (hasTranslation('app.title')) document.title = t('app.title');
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && hasTranslation('app.metaDescription')) metaDesc.content = t('app.metaDescription');

        // 静态元素文本
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            const key = el.getAttribute('data-i18n');
            if (key && hasTranslation(key)) el.textContent = t(key);
        });
        // placeholder / title / aria-label / value / html
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key && hasTranslation(key)) el.setAttribute('placeholder', t(key));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-title');
            if (key && hasTranslation(key)) el.setAttribute('title', t(key));
        });
        document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-aria');
            if (key && hasTranslation(key)) el.setAttribute('aria-label', t(key));
        });
        // data-tooltip 气泡提示（content: attr(data-tooltip)）
        document.querySelectorAll('[data-i18n-tooltip]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-tooltip');
            if (key && hasTranslation(key)) el.setAttribute('data-tooltip', t(key));
        });
        document.querySelectorAll('[data-i18n-value]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-value');
            if (key && hasTranslation(key) && el.value !== '') el.value = t(key);
        });
        document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-html');
            if (key && hasTranslation(key)) el.innerHTML = t(key);
        });

        // 通知动态内容刷新（bubbles 冒泡到 window 上的监听器）
        document.dispatchEvent(new CustomEvent('i18n:changed', { bubbles: true, detail: { id: I18n.langId } }));
    }

    /** 切换语言并持久化 */
    async function setLanguage(id, persist) {
        if (persist === undefined) persist = true;
        const lang = findLanguage(id);
        if (!lang) throw new Error('Unknown language: ' + id);

        // 先加载字典再切换 langId，加载失败时保持原语言状态不变
        const dict = await loadDict(id);
        I18n.langId = id;
        I18n.dict = dict;
        if (persist) writeStorage(STORAGE_LANG_KEY, id);
        applyLanguage();
        renderLanguageSelect();
    }

    /** 初始化：恢复自定义语言 → 加载上次选择的语言 → 应用翻译 + 渲染选择器 */
    function init() {
        if (I18n._ready) return I18n._ready;
        I18n._ready = (async function () {
            seedBuiltinLangs();
            restoreCustomLangs();
            let savedLang = readStorage(STORAGE_LANG_KEY);
            if (!findLanguage(savedLang)) savedLang = FALLBACK_LANG;
            try {
                await setLanguage(savedLang, false);
            } catch (e) {
                // 语言文件缺失/损坏时退回内置中文，避免初始化 Promise 拒绝导致界面停摆
                console.warn('[i18n] 初始化语言失败，使用 zh-CN 兜底: ' + (e && e.message ? e.message : e));
                I18n.langId = FALLBACK_LANG;
                I18n.locale = FALLBACK_LANG;
                I18n.dict = I18n.fallbackDict;
                applyLanguage();
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () {
                    renderLanguageSelect();
                    bindLanguageControls();
                });
            } else {
                renderLanguageSelect();
                bindLanguageControls();
            }
        })();
        return I18n._ready;
    }

    /** 渲染语言下拉框 */
    function renderLanguageSelect() {
        const select = document.getElementById('lang-select');
        if (!select) return;
        select.innerHTML = '';
        I18n.languages.forEach(function (lang) {
            const option = document.createElement('option');
            option.value = lang.id;
            option.textContent = lang.name + (lang.author ? '（' + lang.author + '）' : '');
            select.appendChild(option);
        });
        select.value = I18n.langId;
        updateRemoveButton();
    }

    function updateRemoveButton() {
        const btn = document.getElementById('lang-remove-btn');
        if (!btn) return;
        const lang = findLanguage(I18n.langId);
        btn.style.display = (lang && !lang.builtin) ? 'inline-block' : 'none';
    }

    /** 绑定语言栏控件（下拉切换 / 导入 / 删除） */
    function bindLanguageControls() {
        const select = document.getElementById('lang-select');
        if (select) {
            select.addEventListener('change', function () {
                void setLanguage(select.value, true).catch(function (e) {
                    alert(t('i18n.invalidFile', { msg: e.message }));
                    renderLanguageSelect();
                });
            });
        }

        const importBtn = document.getElementById('lang-import-btn');
        const importInput = document.getElementById('lang-import-input');
        if (importBtn && importInput) {
            importBtn.addEventListener('click', function () { importInput.click(); });
            importInput.addEventListener('change', function () {
                const files = Array.from(importInput.files || []);
                importInput.value = '';
                void importLanguages(files);
            });
        }

        const removeBtn = document.getElementById('lang-remove-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', function () {
                const lang = findLanguage(I18n.langId);
                if (!lang || lang.builtin) return;
                if (!confirm(t('i18n.removeConfirm', { name: lang.name }))) return;
                void removeLanguage(I18n.langId).catch(function (e) {
                    alert(t('i18n.invalidFile', { msg: e && e.message ? e.message : e }));
                });
            });
        }
    }

    /** 导入一个或多个 .json 语言文件 */
    async function importLanguages(files) {
        for (const file of files) {
            try {
                const text = await file.text();
                const parsed = parseLanguageJson(text);
                const id = parsed.meta.id || file.name.replace(/\.json$/i, '') || ('custom_' + Date.now());

                if (findLanguage(id)) {
                    const existing = findLanguage(id);
                    if (existing.builtin) {
                        alert(t('i18n.reservedId', { id: id }));
                        continue;
                    }
                    // 覆盖已存在的自定义语言
                    if (!confirm(t('i18n.replaceConfirm', { name: existing.name }))) continue;
                }

                const entry = { id: id, name: parsed.meta.name, author: parsed.meta.author, json: text };
                I18n.customLangs = I18n.customLangs.filter(function (l) { return l.id !== id; });
                I18n.customLangs.push(entry);
                // 替换自定义列表中的同名条目（内置语言不在此列）
                I18n.languages = I18n.languages.filter(function (l) { return !(l.id === id && !l.builtin); });
                I18n.languages.push({ id: id, name: parsed.meta.name, author: parsed.meta.author, builtin: false });
                try { localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(I18n.customLangs)); } catch (e) { /* 忽略 */ }

                await setLanguage(id, true);
                alert(t('i18n.imported', { name: parsed.meta.name }));
            } catch (e) {
                alert(t('i18n.invalidFile', { msg: e.message }));
            }
        }
    }

    /** 删除自定义语言（当前语言被删除时回退到 zh-CN） */
    async function removeLanguage(id) {
        I18n.customLangs = I18n.customLangs.filter(function (l) { return l.id !== id; });
        I18n.languages = I18n.languages.filter(function (l) { return !(l.id === id && !l.builtin); });
        try { localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(I18n.customLangs)); } catch (e) { /* 忽略 */ }
        if (I18n.langId === id) {
            await setLanguage(FALLBACK_LANG, true);
        } else {
            renderLanguageSelect();
        }
    }

    /** 获取当前语言名称（供界面显示） */
    function getCurrentName() {
        const lang = findLanguage(I18n.langId);
        return lang ? lang.name : I18n.langId;
    }

    // ---- 导出到全局 ----
    global.I18n = I18n;
    global.t = t;
    I18n.t = t;
    I18n.init = init;
    I18n.applyLanguage = applyLanguage;
    I18n.setLanguage = setLanguage;
    I18n.importLanguages = importLanguages;
    I18n.removeLanguage = removeLanguage;
    I18n.getCurrentName = getCurrentName;

    // 立即启动初始化（异步，不阻塞脚本加载）；catch 防止未处理的 Promise 拒绝
    void init().catch(function (e) {
        console.warn('[i18n] 初始化异常: ' + (e && e.message ? e.message : e));
    });
})(typeof window !== 'undefined' ? window : globalThis);
