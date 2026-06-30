// 图片混淆工具 — 设置面板（背景色/质量/颜色选择器/许可证）
// =============================================
// 设置面板逻辑
// =============================================

    // =============================================
    // 透明检测
    // =============================================

    /**
     * 根据 Blob MIME 类型判断图片是否可能包含透明通道
     * JPEG/BMP 格式不支持 alpha 通道
     */
    function blobMayHaveTransparency(type) {
        return type === 'image/png' || type === 'image/webp' || type === 'image/gif';
    }

    // =============================================
    // 背景颜色管理
    // =============================================

    /**
     * 不透明格式的背景颜色（默认白色）
     * @type {string} 十六进制颜色值
     */
    let opaqueBackgroundColor = '#ffffff';

    /**
     * 图片输出质量 (0.0–1.0)，影响 JPG/WebP 有损压缩
     * @type {number}
     */
    let imageQuality = 1.0;

    /**
     * @typedef {Object} IroColorPicker
     * @property {function(string, function): void} on - 绑定事件
     * @property {function(string, function): void} off - 解绑事件
     * @property {{hexString: string, hsv: Object, rgb: {r: number, g: number, b: number}}} color - 当前颜色对象
     */

    /**
     * iro.js 颜色选择器实例
     * @type {IroColorPicker|null}
     */
    let colorPickerInstance = null;

    /**
     * iro.js 颜色选择器 ResizeObserver 引用
     * @type {ResizeObserver|null}
     */
    let colorPickerResizeObserver = null;

    /**
     * 颜色变更处理器（具名函数，便于重建时移除旧监听器）
     */
    function handleColorChange(color) {
        updateColorInputs(color);
        updateColorPreview(color.hexString);
        opaqueBackgroundColor = color.hexString;
    }

    /**
     * 创建颜色选择器实例并绑定事件
     * @param {Object} options - iro.js ColorPicker 配置
     * @returns {IroColorPicker} ColorPicker 实例
     */
    function createColorPicker(options) {
        const instance = new iro.ColorPicker('#color-picker-box', options);
        instance.on('color:change', handleColorChange);
        const c = instance.color;
        updateColorInputs(c);
        updateColorPreview(c.hexString);
        return instance;
    }

    /**
     * 销毁当前颜色选择器实例（不移除 ResizeObserver）
     */
    function disposeColorPicker() {
        if (colorPickerInstance) {
            colorPickerInstance.off('color:change', handleColorChange);
            colorPickerInstance = null;
        }
    }

    /**
     * 断开颜色选择器的 ResizeObserver（面板关闭时调用）
     */
    function disconnectColorPicker() {
        if (colorPickerResizeObserver) {
            colorPickerResizeObserver.disconnect();
            colorPickerResizeObserver = null;
        }
    }

    /**
     * 初始化 iro.js 颜色选择器
     */
    function initColorPicker() {
        if (!useIroJs) return;
        if (typeof window.iro === 'undefined' || typeof iro.ColorPicker !== 'function') {
            logWarn('颜色选择器', 'iro.js 未加载，颜色选择器不可用');
            return;
        }

        try {
            if (colorPickerResizeObserver) { colorPickerResizeObserver.disconnect(); colorPickerResizeObserver = null; }
            disposeColorPicker();

            const BASE_OPTS = { width: 200, borderWidth: 1, borderColor: '#ddd', containerStyle: 'border-radius: 0;' };
            const LAYOUT = [{ component: iro.ui.Box }, { component: iro.ui.Slider, options: { sliderType: 'hue' } }];

            colorPickerInstance = createColorPicker({ ...BASE_OPTS, layoutDirection: 'horizontal', layout: LAYOUT, color: opaqueBackgroundColor });
            logLog('颜色选择器初始化成功');

            let isWrapped = false;
            const pickerRow = document.getElementById('color-picker-box')?.parentElement;
            if (pickerRow) {
                colorPickerResizeObserver = new ResizeObserver(() => {
                    const wrapped = pickerRow.clientHeight > 250;
                    if (wrapped === isWrapped) return;
                    isWrapped = wrapped;
                    const currentColor = colorPickerInstance.color.hsv;
                    disposeColorPicker();
                    document.getElementById('color-picker-box').innerHTML = '';
                    colorPickerInstance = createColorPicker({ ...BASE_OPTS, layoutDirection: wrapped ? 'vertical' : 'horizontal', layout: LAYOUT, color: currentColor });
                });
                colorPickerResizeObserver.observe(pickerRow);
            }
        } catch (error) {
            logError('颜色选择器', `初始化失败: ${error.message || error}`);
        }
    }

    /**
     * 更新颜色输入框的值
     * @param {Object} color - iro.js 颜色对象
     */
    function updateColorInputs(color) {
        const hexInput = document.getElementById('hex-input');
        const rgbRInput = document.getElementById('rgb-r-input');
        const rgbGInput = document.getElementById('rgb-g-input');
        const rgbBInput = document.getElementById('rgb-b-input');
        const activeElement = document.activeElement;

        let hex, r, g, b;
        if (color) {
            hex = color.hexString;
            r = color.rgb.r;
            g = color.rgb.g;
            b = color.rgb.b;
        } else if (colorPickerInstance && colorPickerInstance.color) {
            hex = colorPickerInstance.color.hexString;
            r = colorPickerInstance.color.rgb.r;
            g = colorPickerInstance.color.rgb.g;
            b = colorPickerInstance.color.rgb.b;
        } else {
            hex = opaqueBackgroundColor || '#FFFFFF';
            // 将短格式 HEX (#FFF) 展开为 6 位 (#FFFFFF)
            const shortMatch = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
            if (shortMatch) {
                hex = '#' + shortMatch[1] + shortMatch[1] + shortMatch[2] + shortMatch[2] + shortMatch[3] + shortMatch[3];
            }
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (result) {
                r = parseInt(result[1], 16);
                g = parseInt(result[2], 16);
                b = parseInt(result[3], 16);
            }
        }

        if (hex !== undefined && hexInput && activeElement !== hexInput) {
            hexInput.value = hex;
        }
        if (r !== undefined && rgbRInput && activeElement !== rgbRInput) {
            rgbRInput.value = r;
        }
        if (g !== undefined && rgbGInput && activeElement !== rgbGInput) {
            rgbGInput.value = g;
        }
        if (b !== undefined && rgbBInput && activeElement !== rgbBInput) {
            rgbBInput.value = b;
        }
    }

    /**
     * 更新颜色预览框
     * @param {string} hexColor - 十六进制颜色值
     */
    function updateColorPreview(hexColor) {
        const preview = document.getElementById('color-preview');
        if (preview) {
            preview.style.backgroundColor = hexColor;
        }
    }

    /**
     * 从十六进制输入框更新颜色
     * @param {string} hexValue - 十六进制颜色值
     */
    function updateColorFromHex(hexValue) {
        // 验证十六进制格式
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        if (hexRegex.test(hexValue)) {
            if (colorPickerInstance) {
                colorPickerInstance.color.set(hexValue);
            }
            opaqueBackgroundColor = hexValue;
            updateColorPreview(hexValue);
        }
    }

    /**
     * 从 RGB 输入框更新颜色
     */
    function updateColorFromRgb() {
        const rgbRInput = document.getElementById('rgb-r-input');
        const rgbGInput = document.getElementById('rgb-g-input');
        const rgbBInput = document.getElementById('rgb-b-input');

        if (!rgbRInput || !rgbGInput || !rgbBInput) return;

        const r = parseInt(rgbRInput.value) || 0;
        const g = parseInt(rgbGInput.value) || 0;
        const b = parseInt(rgbBInput.value) || 0;

        // 验证范围
        if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
            const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
            if (colorPickerInstance) {
                colorPickerInstance.color.set({ r, g, b });
            }
            opaqueBackgroundColor = hex;
            updateColorPreview(hex);
        }
    }

    // =============================================
    // 开源许可证
    // =============================================

    // 显示开源许可证信息（新标签页打开）
    function showLicenseInfo() {
        const newTab = window.open('', '_blank');
        if (!newTab) {
            alert('请允许弹出窗口以查看许可证信息');
            return;
        }

        const doc = newTab.document;
        doc.title = '开源许可证 - 图片混淆工具';

        // 添加 viewport meta 标签以支持移动端响应式
        const meta = doc.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0';
        doc.head.appendChild(meta);

        // 添加响应式字体样式
        const style = doc.createElement('style');
        /* 许可证页面全局样式定义 */
        style.textContent = `
            /* 页面基础样式：重置边距，设置字体和背景 */
            body {
                margin: 0;
                padding: 20px;
                font-family: Arial, sans-serif;
                background: white;
            }
            /* 内容容器：限制最大宽度并居中显示 */
            .container {
                max-width: 900px;
                margin: 0 auto;
                padding: 20px 0;
            }
            /* 主标题样式：深灰色居中显示 */
            .main-title {
                color: #333;
                text-align: center;
                margin-bottom: 30px;
                font-size: 2em;
            }
            /* 副标题样式：蓝色带下划线分隔 */
            .section-title {
                color: #0091ff;
                margin: 30px 0 15px 0;
                border-bottom: 2px solid #0091ff;
                padding-bottom: 5px;
            }
            /* 链接样式：蓝色带下划线 */
            a {
                color: #0091ff;
                text-decoration: underline;
            }
            /* 描述文本样式：灰色斜体 */
            .description {
                color: #666;
                font-style: italic;
                margin-bottom: 15px;
            }
            /* 许可证内容样式：等宽字体，响应式字号，横向滚动 */
            .license-content {
                white-space: pre;
                overflow-x: auto;
                container-type: inline-size;
                font-size: clamp(0.01rem, calc(100cqw / 70), 1.1rem);
                font-family: 'Courier New', monospace;
                background: #f8f8f8;
                padding: 25px;
                border-radius: 4px;
                border-left: 4px solid #0091ff;
                margin-bottom: 30px;
            }
            /* 完整许可证链接样式 */
            .license-link {
                margin: 15px 0;
            }
            .license-link a {
                color: #666;
                font-size: 0.9em;
            }
            /* 长许可证可展开容器 */
            #long-license {
                min-height: 100px;
                padding-bottom: 10px;
            }
            /* 长许可证完整文本（默认隐藏） */
            #long-license-full {
                display: none;
                overflow-x: auto;
                white-space: pre;
            }
            /* 许可证展开/收起按钮 */
            .license-toggle-btn {
                display: block;
                background: transparent;
                color: #666;
                border: none;
                padding: 15px 0 0;
                cursor: pointer;
                font-size: 1rem;
            }
            /* 完整许可证文本 */
            .license-full-text {
                white-space: pre;
                margin: 0;
                font-family: 'Courier New', monospace;
            }
            /* ===== 移动端适配（≤768px） ===== */
            @media (max-width: 768px) {
                body {
                    padding: 12px;
                }
                .container {
                    padding: 10px 0;
                }
                .main-title {
                    font-size: 1.4em;
                    margin-bottom: 20px;
                }
                .section-title {
                    font-size: 1.1em;
                    margin: 20px 0 10px 0;
                }
                .description {
                    font-size: 0.85em;
                }
                .license-content {
                    padding: 12px;
                    font-size: clamp(0.6rem, 3.5vw, 0.85rem);
                    white-space: pre-wrap;
                    word-break: break-all;
                }
                #long-license-full {
                    white-space: pre-wrap;
                }
                .license-toggle-btn {
                    padding: 12px 0 0;
                    font-size: 0.9rem;
                    min-height: 44px;
                }
                .license-full-text {
                    white-space: pre-wrap;
                    font-size: 0.75rem;
                }
                .license-link a {
                    font-size: 0.8em;
                }
            }
        `;
        doc.head.appendChild(style);

        /* 创建副标题 */
        function createTitle(title, link) {
            const h2 = doc.createElement('h2');
            h2.className = 'section-title';
            const a = doc.createElement('a');
            a.href = link;
            a.target = '_blank';
            a.textContent = title;
            h2.appendChild(a);
            return h2;
        }

        /* 创建描述文本 */
        function createDesc(text) {
            const p = doc.createElement('p');
            p.className = 'description';
            p.textContent = text;
            return p;
        }

        /* 创建许可证内容 */
        function createLicense(text) {
            const div = doc.createElement('div');
            div.className = 'license-content';
            div.textContent = text;
            return div;
        }

        /* 创建完整许可证链接 */
        function createLicenseLink(url, text) {
            const p = doc.createElement('p');
            p.className = 'license-link';
            const a = doc.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.textContent = text || '查看完整许可证';
            p.appendChild(a);
            return p;
        }

        /* 创建可展开/收起的许可证内容 */
        function createExpandableLicense(summaryText, licenseFetchUrl) {
            const licenseContainer = doc.createElement('div');
            licenseContainer.id = 'long-license';
            licenseContainer.className = 'license-content';

            const summaryDiv = doc.createElement('div');
            summaryDiv.id = 'long-license-summary';
            summaryDiv.textContent = summaryText;
            licenseContainer.appendChild(summaryDiv);

            const fullDiv = doc.createElement('div');
            fullDiv.id = 'long-license-full';
            licenseContainer.appendChild(fullDiv);

            const toggleBtn = doc.createElement('button');
            toggleBtn.id = 'toggle-long-license';
            toggleBtn.className = 'license-toggle-btn';
            toggleBtn.textContent = '展开';
            licenseContainer.appendChild(toggleBtn);

            let isExpanded = false;
            toggleBtn.addEventListener('click', async function() {
                if (!isExpanded) {
                    if (!fullDiv.textContent.trim()) {
                        try {
                            const response = await fetch(licenseFetchUrl);
                            if (response.ok) {
                                const licenseText = await response.text();
                                const pre = doc.createElement('pre');
                                pre.className = 'license-full-text';
                                pre.textContent = licenseText;
                                fullDiv.appendChild(pre);
                            } else {
                                logError('LICENSE', `加载LICENSE文件失败: HTTP ${response.status}`);
                                fullDiv.textContent = '许可证文件加载失败';
                                fullDiv.style.color = 'red';
                            }
                        } catch (error) {
                            logError('LICENSE', `加载LICENSE文件失败: ${error.message || error}`);
                            fullDiv.textContent = '许可证文件加载失败';
                            fullDiv.style.color = 'red';
                        }
                    }
                    summaryDiv.style.display = 'none';
                    fullDiv.style.display = 'block';
                    toggleBtn.textContent = '收起';
                    isExpanded = true;
                } else {
                    summaryDiv.style.display = 'block';
                    fullDiv.style.display = 'none';
                    toggleBtn.textContent = '展开';
                    isExpanded = false;
                }
            });

            return licenseContainer;
        }

        const container = doc.createElement('div');
        container.className = 'container';

        const h1 = doc.createElement('h1');
        h1.className = 'main-title';
        h1.textContent = '开源许可证';
        container.appendChild(h1);

        /* Image-Obfuscation-Tool */
        const section1 = doc.createElement('div');
        section1.appendChild(createTitle('Image-Obfuscation-Tool', 'https://github.com/cnpxs1/Image-obfuscation-tool'));
        section1.appendChild(createDesc('基于希尔伯特曲线的轻量化纯前端图像混淆/解混淆工具'));
        section1.appendChild(createLicense(`MIT License\n\nCopyright © 2026-present cnpxs1\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.`));
        container.appendChild(section1);

        /* Viewer.js */
        const section2 = doc.createElement('div');
        section2.appendChild(createTitle('Viewer.js', 'https://github.com/fengyuanchen/viewerjs'));
        section2.appendChild(createDesc('JavaScript 图像查看器'));
        section2.appendChild(createLicense(`The MIT License (MIT)\n\nCopyright 2015-present Chen Fengyuan\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in\nall copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\nTHE SOFTWARE.`));
        container.appendChild(section2);

        /* fflate */
        const section3 = doc.createElement('div');
        section3.appendChild(createTitle('fflate', 'https://github.com/101arrowz/fflate'));
        section3.appendChild(createDesc('8kB 超小体积，实现高性能压缩与解压缩'));
        section3.appendChild(createLicense(`MIT License\n\nCopyright (c) 2023 Arjun Barrett\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.`));
        container.appendChild(section3);

        // iro.js 特殊处理（带展开/收起功能）
        const iroSection = doc.createElement('div');
        iroSection.appendChild(createTitle('iro.js', 'https://github.com/jaames/iro.js'));
        iroSection.appendChild(createDesc('模块化、注重设计的JavaScript色彩选择器小部件'));

        // 使用统一的完整许可证链接函数
        iroSection.appendChild(createLicenseLink('https://www.mozilla.org/en-US/MPL/2.0/', '完整MPL 2.0许可证'));

        iroSection.appendChild(createExpandableLicense(
            `Mozilla Public License Version 2.0\n==================================\n\n...\n\nExhibit A - Source Code Form License Notice\n-------------------------------------------\n\n  This Source Code Form is subject to the terms of the Mozilla Public\n  License, v. 2.0. If a copy of the MPL was not distributed with this\n  file, You can obtain one at http://mozilla.org/MPL/2.0/.\n\nIf it is not possible or desirable to put the notice in a particular\nfile, then You may include the notice in a location (such as a LICENSE\nfile in a relevant directory) where a recipient would be likely to look\nfor such a notice.\n\nYou may add additional accurate notices of copyright ownership.\n\nExhibit B - "Incompatible With Secondary Licenses" Notice\n---------------------------------------------------------\n\n  This Source Code Form is "Incompatible With Secondary Licenses", as\n  defined by the Mozilla Public License, v. 2.0.`,
            './assets/irojs/LICENSE'
        ));
        container.appendChild(iroSection);
        doc.body.appendChild(container);
    }

    /**
     * 解析 RGB 颜色字符串，支持多种格式：
     *   - rgb(128, 200, 100) 传统逗号分隔
     *   - rgb(128 200 100)   现代空格分隔
     *   - 128, 200, 100      纯数字逗号
     *   - 128 200 100        纯数字空格
     *   - #80C864 / 80C864   HEX 格式
     * 返回 {r,g,b} 或 null（无法解析时）
     */
    function parseColor(input) {
        if (!input || typeof input !== 'string') return null;
        const s = input.trim();
        if (!s) return null;

        const clamp = (v) => Math.max(0, Math.min(255, v));
        const toInteger = (value) => {
            if (value.endsWith('%')) return Math.round(parseFloat(value) * 2.55);
            return parseInt(value, 10);
        };

        let r, g, b;

        // 1) HEX 格式：#80C864、80C864、#80c、80c
        const hexMatch = s.match(/^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
        if (hexMatch) {
            let h = hexMatch[1];
            if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
            r = parseInt(h.substring(0, 2), 16);
            g = parseInt(h.substring(2, 4), 16);
            b = parseInt(h.substring(4, 6), 16);
        } else {
            // 2) 通用数值格式：按优先级依次尝试匹配，统一提取 r/g/b
            const patterns = [
                /^rgba?\(\s*(\d+%?)\s*[, ]\s*(\d+%?)\s*[, ]\s*(\d+%?)\s*(?:[, ]\s*[\d.]+%?\s*)?\)$/i,
                /^(\d+%?)\s*,\s*(\d+%?)\s*,\s*(\d+%?)$/,
                /^(\d+%?)\s+(\d+%?)\s+(\d+%?)$/
            ];
            let m = null;
            for (const p of patterns) { m = s.match(p); if (m) break; }
            if (m) { r = toInteger(m[1]); g = toInteger(m[2]); b = toInteger(m[3]); }
        }

        return r !== undefined ? { r: clamp(r), g: clamp(g), b: clamp(b) } : null;
    }
