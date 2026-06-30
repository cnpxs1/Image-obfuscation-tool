// 图片混淆工具 — DOM 事件绑定（DOMContentLoaded 统一入口）
// =============================================
// 事件监听器设置
// =============================================

// 页面加载完成后绑定事件（统一入口）
document.addEventListener('DOMContentLoaded', function() {
    // 初始化高频 DOM 元素缓存（避免后续重复查询）
    batchStatusEl = document.getElementById('batchStatus');
    logPanelOverlayEl = document.getElementById('logPanelOverlay');

    // 统一设置关闭按钮图标
    document.getElementById('close-settings-btn').innerHTML = CLOSE_ICON_SVG;
    document.getElementById('logPanelClose').innerHTML = CLOSE_ICON_SVG;

    // ---- 日志面板事件 ----
    const fab = document.getElementById('logFab');
    const overlay = logPanelOverlayEl;
    const panel = document.getElementById('logPanel');

    fab.addEventListener('click', toggleLogPanel);
    document.getElementById('logPanelClose').addEventListener('click', closeLogPanel);
    document.getElementById('logClearBtn').addEventListener('click', clearAllLogs);

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeLogPanel();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && logPanelVisible) closeLogPanel();
    });

    document.getElementById('logStats').addEventListener('click', function(e) {
        const btn = e.target.closest('.log-stat-btn');
        if (!btn) return;
        const lv = btn.dataset.level;
        const newFilter = new Set(currentFilter);
        if (newFilter.has(lv)) {
            newFilter.delete(lv);
        } else {
            newFilter.add(lv);
        }
        renderLogPanel(newFilter);
    });

    // 移动端右滑关闭
    let touchStartX = 0;
    panel.addEventListener('touchstart', function(e) {
        touchStartX = e.touches[0].clientX;
    }, { passive: true });
    panel.addEventListener('touchmove', function(e) {
        const dx = e.touches[0].clientX - touchStartX;
        if (dx > 0) {
            panel.style.transform = `translateX(${dx}px)`;
            panel.style.transition = 'none';
        }
    }, { passive: true });
    panel.addEventListener('touchend', function(e) {
        panel.style.transition = '';
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (dx > 80) {
            closeLogPanel();
        }
        panel.style.transform = '';
    });

    // ---- 全局 resize 监听 ----
    window.addEventListener('resize', handleWindowResize);

    // ---- 文件选择事件 ----
    document.getElementById('add-images').addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            void handleFiles(files);
            e.target.value = ''; // 清除选择，以便可以再次选择相同文件
        }
    });

    // ---- 按钮事件绑定 ----
    document.getElementById('select-all').addEventListener('click', selectAll);
    document.getElementById('clear-selection').addEventListener('click', clearSelection);
    document.getElementById('clear-all').addEventListener('click', deleteSelectedImages);

    document.getElementById('encrypt-btn').addEventListener('click', () => processBatch('encrypt'));
    document.getElementById('decrypt-btn').addEventListener('click', () => processBatch('decrypt'));
    document.getElementById('restore-btn').addEventListener('click', () => processBatch('restore'));

    document.getElementById('save-format-btn').addEventListener('click', () => {
        const format = document.getElementById('save-format-select').value;
        void saveImages(format);
    });

    // ---- 本地存储开关初始化 ----
    try {
        localStorageEnabled = localStorage.getItem('localStorageEnabled') !== 'false';
    } catch (e) {
        localStorageEnabled = true;
    }

    // 加载视图模式偏好
    loadViewModePreference();

    // 初始化保存按钮文字
    updateSaveButtonText();

    // ---- 视图切换按钮事件 ----
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            void switchViewMode();
        });
    }

    // ---- 事件委托：在 imageList 容器上统一处理图片项按钮点击 ----
    const imageList = document.getElementById('imageList');
    if (imageList) {
        imageList.addEventListener('click', function(event) {
            const actionButton = event.target.closest('.action-btn');
            if (actionButton) {
                event.stopPropagation();
                const operation = actionButton.getAttribute('data-operation');
                const imageItem = actionButton.closest('.image-item');

                if (imageItem && operation) {
                    const imageId = imageItem.dataset.id;

                    if (operation === 'delete') {
                        void deleteSingleImage(imageId);
                    } else {
                        void processSingle(imageId, operation);
                    }
                }
                return;
            }

            // 点击 image-item 空白区域时切换勾选状态
            const imageItem = event.target.closest('.image-item');
            if (imageItem &&
                !event.target.closest('.select-checkbox') &&
                !event.target.closest('.thumbnail-container')) {
                const checkbox = imageItem.querySelector('.select-checkbox');
                if (checkbox) {
                    checkbox.click();
                }
            }
        });
    }

    // ---- 刷新缩略图按钮事件 ----
    const refreshBtn = document.getElementById('refresh-list-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            void refreshAllThumbnails();
        });
    }

    // ---- 设置按钮事件 ----
    const settingsBtn = document.getElementById('settings-btn');
    const settingsContainer = document.getElementById('settings-container');
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    if (settingsBtn && settingsContainer) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const isHidden = settingsContainer.style.display === 'none' || settingsContainer.style.display === '';
            settingsContainer.style.display = isHidden ? 'block' : 'none';

            if (isHidden) {
                if (!colorPickerInstance) {
                    updateColorInputs(null);
                    setTimeout(() => initColorPicker(), 100);
                }
            } else {
                disconnectColorPicker();
            }
        });

        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                settingsContainer.style.display = 'none';
                disconnectColorPicker();
            });
        }
    }

    // ---- 颜色输入框事件绑定 ----
    const hexInput = document.getElementById('hex-input');
    const rgbRInput = document.getElementById('rgb-r-input');
    const rgbGInput = document.getElementById('rgb-g-input');
    const rgbBInput = document.getElementById('rgb-b-input');

    if (hexInput) {
        let isHexInputBusy = false;
        let lastValidValue = '#FFFFFF';

        hexInput.addEventListener('input', (e) => {
            if (isHexInputBusy) return;
            isHexInputBusy = true;

            const rawValue = e.target.value.trim();
            let value = '#' + rawValue.replace(/#/g, '').replace(/[^0-9A-Fa-f]/g, '').substring(0, 6);

            const hexPart = value.substring(1).toUpperCase();
            if (hexPart.length === 3 || hexPart.length === 6) {
                lastValidValue = value;
            }

            requestAnimationFrame(() => {
                e.target.value = value;
                updateColorFromHex(value);
                isHexInputBusy = false;
            });
        });

        hexInput.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                const cursorPos = hexInput.selectionStart;
                if (cursorPos <= 1) {
                    e.preventDefault();
                }
            }
        });

        hexInput.addEventListener('focus', () => {
            let value = hexInput.value.trim();
            value = value.replace(/#/g, '');
            value = '#' + value.replace(/[^0-9A-Fa-f]/g, '');
            if (value.length > 7) {
                value = value.substring(0, 7);
            }
            lastValidValue = value;
        });

        hexInput.addEventListener('paste', (e) => {
            const clipboardData = e.clipboardData || window.clipboardData;
            if (!clipboardData) return;
            const pasteText = clipboardData.getData('text');
            const rgb = parseColor(pasteText);
            if (rgb) {
                e.preventDefault();
                const hex = '#' + [rgb.r, rgb.g, rgb.b]
                    .map(c => c.toString(16).padStart(2, '0').toUpperCase())
                    .join('');
                hexInput.value = hex;
                lastValidValue = hex;
                updateColorFromHex(hex);
            }
        });

        hexInput.addEventListener('blur', () => {
            const hexPart = hexInput.value.substring(1);
            if (hexPart.length === 3 || hexPart.length === 6) {
                updateColorInputs(null);
            } else {
                hexInput.value = lastValidValue;
                updateColorFromHex(lastValidValue);
            }
        });
    }

    // 为所有RGB输入框添加粘贴事件监听
    [rgbRInput, rgbGInput, rgbBInput].forEach(input => {
        if (input) {
            input.addEventListener('paste', (e) => {
                const clipboardData = e.clipboardData || window.clipboardData;
                if (!clipboardData) return;
                const pasteText = clipboardData.getData('text');
                const rgb = parseColor(pasteText);

                if (rgb && rgbRInput && rgbGInput && rgbBInput) {
                    e.preventDefault();
                    rgbRInput.value = rgb.r;
                    rgbGInput.value = rgb.g;
                    rgbBInput.value = rgb.b;
                    updateColorFromRgb();
                }
            });
        }
    });

    for (const input of [rgbRInput, rgbGInput, rgbBInput]) {
        if (!input) continue;
        input.addEventListener('input', () => {
            validateRgbInput(input);
            updateColorFromRgb();
        });
        input.addEventListener('blur', () => {
            if (input.value === '') {
                input.value = '0';
            }
            updateColorInputs(null);
        });
    }

    // ---- 页面卸载清理 ----
    window.addEventListener('beforeunload', () => {
        if (resizeDebounceTimer) {
            clearTimeout(resizeDebounceTimer);
            resizeDebounceTimer = null;
        }

        if (imageLazyLoader) {
            imageLazyLoader.disconnect();
        }

        if (_workerPool) {
            _workerPool.terminate();
            _workerPool = null;
        }

        clearAllCanvasPools();

        window.viewerLoadPromise = null;
        logLog('页面卸载：已重置Viewer加载Promise');

        const cleanedOverlays = clearOverlays();
        if (cleanedOverlays > 0) {
            logLog(`页面卸载时清理了 ${cleanedOverlays} 个遮罩层`);
        }

        if (cacheIndicatorTouchListeners) {
            document.removeEventListener('touchstart', cacheIndicatorTouchListeners);
            document.removeEventListener('touchmove', cacheIndicatorTouchListeners);
            cacheIndicatorTouchListeners = null;
            const indicator = document.getElementById('cacheIndicator');
            if (indicator) indicator._touchDismissListener = null;
        }
        if (mobileTooltipCloser) {
            mobileTooltipCloser.unbind();
            mobileTooltipCloser = null;
        }

        cleanupExistingViewer();

        const basicViewer = document.querySelector('[data-basic-viewer]');
        if (basicViewer) {
            const img = basicViewer.querySelector('img');
            if (img && img.src && img.src.startsWith('blob:')) {
                URL.revokeObjectURL(img.src);
            }
            basicViewer.remove();
            logLog('页面卸载：已清理基础图片查看器');
        }

        try {
            if (storage.db) storage.db.close();
            indexedDB.deleteDatabase('ImageObfuscationDB');
        } catch (e) { /* 忽略异常 */ }
        try {
            if (typeof caches !== 'undefined') {
                caches.delete('image-obfuscation-cache-v1').catch(() => {});
            }
        } catch (e) { /* 忽略异常 */ }
        logLog('页面卸载：已清除所有图片缓存');
        logLog('页面卸载：所有图片资源将由浏览器自动回收');
    });

    // ---- 页面可见性变化处理 ----
    window.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            smartClearCanvasPools();
            clearOverlays();
            logLog('页面隐藏：已执行智能Canvas池清理');
        } else {
            preCreateCommonCanvases();
            logLog('页面可见：已预创建常用Canvas');
        }
    });

    // ---- 双向绑定辅助函数 ----
    /**
     * 双向绑定开关控件与 localStorage
     */
    function bindToggle(id, key, onChange) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            if (!localStorageEnabled) return;
            saveSetting(key, el.checked);
            if (onChange) onChange(el.checked);
        });
        const saved = loadSetting(key);
        if (saved !== null) el.checked = saved === 'true';
        if (onChange) onChange(el.checked);
    }
    /**
     * 双向绑定下拉框与 localStorage
     */
    function bindSelect(id, key, callback) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            if (!localStorageEnabled) return;
            saveSetting(key, el.value);
            if (callback) callback(el.value);
        });
        const saved = loadSetting(key);
        if (saved) {
            el.value = saved;
            if (callback) callback(saved);
        }
    }

    // ---- 图片质量 slider 与 number input 双向同步 ----
    const qualitySlider = document.getElementById('quality-slider');
    const qualityInput = document.getElementById('quality-input');

    function syncQuality(source, value) {
        const percent = Math.max(1, Math.min(100, parseInt(value) || 1));
        imageQuality = percent / 100;
        if (source !== 'slider' && qualitySlider) qualitySlider.value = percent;
        if (source !== 'input' && qualityInput) qualityInput.value = percent;
        if (localStorageEnabled) saveSetting('imageQuality', String(percent));
    }

    if (qualitySlider) {
        qualitySlider.addEventListener('input', () => syncQuality('slider', qualitySlider.value));
    }
    if (qualityInput) {
        qualityInput.addEventListener('input', () => {
            if (qualityInput.value === '') return;
            validateQualityInput(qualityInput);
            syncQuality('input', qualityInput.value);
        });
        qualityInput.addEventListener('blur', () => {
            validateQualityInput(qualityInput);
            syncQuality('input', qualityInput.value);
        });
    }

    // 初始化文字气泡
    const webpTooltip = document.querySelector('.text-tooltip');
    if (webpTooltip) initTextTooltip(webpTooltip);

    // ---- 本地存储开关 UI 绑定 ----
    const lsToggle = document.getElementById('localstorage-toggle');
    if (lsToggle) {
        lsToggle.checked = localStorageEnabled;
        lsToggle.addEventListener('change', function() {
            try {
                localStorageEnabled = this.checked;
                saveSetting('localStorageEnabled', this.checked);
                if (!this.checked) {
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const key = localStorage.key(i);
                        if (key !== 'localStorageEnabled') localStorage.removeItem(key);
                    }
                }
            } catch (e2) {
                localStorageEnabled = true;
            }
        });
    }

    bindToggle('webp-lossless-toggle', 'webpLossless');
    bindToggle('zip-download-toggle', 'zipDownload');
    bindSelect('save-format-select', 'saveFormat');
    bindSelect('log-level-select', 'logLevel', (v) => { logLevel = v; });
    bindToggle('viewerjs-toggle', 'viewerJs', (v) => { useViewerJs = v; });
    bindToggle('irojs-toggle', 'iroJs', (v) => { useIroJs = v; });

    // 缓存方案下拉菜单
    bindSelect('cache-backend-select', 'cacheBackend', async (v) => {
        if (images.length > 0) {
            const avail = window.__cacheBackendAvail || {};
            const effective = v === 'auto'
                ? (avail.cacheApi ? 'cache-api' : (avail.indexedDb ? 'indexeddb' : ''))
                : v;
            const label = v === 'auto'
                ? `Auto（${effective === 'cache-api' ? 'Cache API' : effective === 'indexeddb' ? 'IndexedDB' : '不可用'}）`
                : (v === 'cache-api' ? 'Cache API' : 'IndexedDB');
            if (!confirm(`切换缓存方案将迁移全部 ${images.length} 张图片的缓存数据，是否继续？\n\n目标方案：${label}`)) {
                const el = document.getElementById('cache-backend-select');
                if (el) el.value = storage.preference;
                saveSetting('cacheBackend', storage.preference);
                return;
            }
        }
        try {
            await storage.reinit(v);
            logLog(`缓存方案已切换至: ${v === 'auto' ? 'Auto (实际使用 ' + (storage.activeBackend === 'cache-api' ? 'Cache API' : 'IndexedDB') + ')' : (v === 'cache-api' ? 'Cache API' : 'IndexedDB')}`);
        } catch (e) {
            logWarn('存储适配层', `切换失败: ${e.message || e}`);
        }
    });
    bindToggle('timer-toggle', 'processingTimer', (v) => { timerEnabled = v; });

    // 清除 localStorage 按钮
    document.getElementById('clear-localstorage-btn')?.addEventListener('click', () => {
        if (!confirm('确定要清除全部 localStorage 数据吗？\n\n页面将刷新以应用默认设置。')) return;
        try {
            localStorage.clear();
            saveSetting('localStorageEnabled', 'true');
        } catch (e) { /* localStorage 不可用，跳过 */ }
        localStorageEnabled = true;
        const lsToggleEl = document.getElementById('localstorage-toggle');
        if (lsToggleEl) lsToggleEl.checked = true;
        logInfo('localStorage', '已清除全部 localStorage 数据');
        location.reload();
    });

    // 从 localStorage 恢复图片质量
    (function loadQuality() {
        const savedQuality = loadSetting('imageQuality');
        if (savedQuality !== null) {
            const percent = Math.max(1, Math.min(100, parseInt(savedQuality) || 100));
            imageQuality = percent / 100;
            if (qualitySlider) qualitySlider.value = percent;
            if (qualityInput) qualityInput.value = percent;
        }
    })();

    // 初始化图片懒加载器（IntersectionObserver）
    imageLazyLoader = new ImageLazyLoader({
        rootMargin: '300px',
        threshold: 0.01
    });
});
