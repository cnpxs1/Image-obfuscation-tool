// 图片混淆工具 — 图片预览（Viewer.js 集成 + 基础查看器降级）

// 跨文件共享变量（app.js 中 var 声明，此处 var 可重复声明）
var activeBasicViewerClose;

    // getViewerLoadPromise 已在 js/lib/cdn.js 中定义，此处直接使用
    // 基础图片查看器 - 当所有Viewer.js 资源都失效时的兜底方案
    function showBasicViewer(imageData) {
        logLog(t('log.msg.basicViewerStarted'));

        // 彻底清理可能存在的旧实例（释放事件监听器 + Blob URL + overflow 状态）
        if (activeBasicViewerClose) {
            activeBasicViewerClose();
            activeBasicViewerClose = null;
        }

        // ========== 创建 DOM 元素 ==========

        const viewerContainer = document.createElement('div');
        viewerContainer.setAttribute('data-basic-viewer', 'true');
        viewerContainer.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.9); display: flex; align-items: center;
            justify-content: center; z-index: 10000; cursor: zoom-out;
            opacity: 0; transition: opacity 0.2s ease;
        `;

        const img = document.createElement('img');
        img.draggable = false;
        img.src = imageData.blobUrl || imageData.url;
        img.alt = escapeHtml(imageData.originalName);
        img.style.cssText = `
            display: block; max-width: calc(100vw - 50px); max-height: calc(100vh - 50px);
            object-fit: contain; opacity: 0; transition: opacity 0.2s ease;
            -webkit-user-drag: none; user-select: none;
        `;
        img.addEventListener('dragstart', (e) => e.preventDefault());

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.tabIndex = 0;
        closeBtn.setAttribute('aria-label', t('common.close'));
        closeBtn.style.cssText = `
            position: absolute; right: 20px; top: 20px; width: 40px; height: 40px;
            background-color: rgba(0, 0, 0, 0.5); border: none; border-radius: 50%;
            color: white; font-size: 24px; font-weight: normal; line-height: 1;
            cursor: pointer; transition: background-color 0.15s, opacity 0.2s ease;
            display: flex; align-items: center; justify-content: center; z-index: 10001;
            opacity: 0;
        `;

        // 组装 DOM
        viewerContainer.appendChild(img);
        viewerContainer.appendChild(closeBtn);

        // ========== 关闭逻辑（统一定义在前） ==========

        const handleCloseClick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            closeBasicViewer();
        };

        const handleCloseKey = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeBasicViewer();
            }
        };

        const handleEscapeKey = (e) => {
            if (e.key === 'Escape') {
                closeBasicViewer();
            }
        };

        const handleCloseHoverIn = () => {
            closeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        };

        const handleCloseHoverOut = () => {
            closeBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        };

        const handleImageStopPropagation = (e) => e.stopPropagation();

        function closeBasicViewer() {
            // 防止重复关闭
            if (closeBasicViewer._called) return;
            closeBasicViewer._called = true;

            // 移除按钮事件
            closeBtn.removeEventListener('click', handleCloseClick);
            closeBtn.removeEventListener('keydown', handleCloseKey);
            closeBtn.removeEventListener('mouseenter', handleCloseHoverIn);
            closeBtn.removeEventListener('mouseleave', handleCloseHoverOut);

            // 移除全局键盘事件
            document.removeEventListener('keydown', handleEscapeKey);

            // 淡出动画，完成后移除 DOM 并释放资源
            viewerContainer.style.opacity = '0';

            let cleaned = false;
            const finalize = () => {
                if (cleaned) return;
                cleaned = true;
                viewerContainer.removeEventListener('transitionend', finalize);
                if (viewerContainer.parentNode) {
                    viewerContainer.parentNode.removeChild(viewerContainer);
                }
                img.onload = null;
                img.onerror = null;
                img.onclick = null;
                if (img.src && img.src.startsWith('blob:')) {
                    try {
                        URL.revokeObjectURL(img.src);
                        logLog(t('log.msg.releasedBlobUrl'));
                    } catch (error) {
                        logWarn(t('log.category.basicViewer'), t('log.msg.releaseBlobUrlFailed', { msg: error.message || error }));
                    }
                }
                document.body.style.overflow = '';
                if (activeBasicViewerClose === closeBasicViewer) {
                    activeBasicViewerClose = null;
                }
                logLog(t('log.msg.basicViewerClosed'));
            };

            viewerContainer.addEventListener('transitionend', finalize);

            // fallback: 若 transitionend 未触发，400ms 后强制清理
            setTimeout(finalize, 400);
        }

        // 注册当前实例的关闭函数，供后续新实例接管时彻底清理
        activeBasicViewerClose = closeBasicViewer;

        // ========== 绑定事件 ==========

        closeBtn.addEventListener('click', handleCloseClick);
        closeBtn.addEventListener('keydown', handleCloseKey);
        closeBtn.addEventListener('mouseenter', handleCloseHoverIn);
        closeBtn.addEventListener('mouseleave', handleCloseHoverOut);
        document.addEventListener('keydown', handleEscapeKey);

        viewerContainer.onclick = closeBasicViewer;
        img.onclick = handleImageStopPropagation;

        // ========== 图片加载回调 ==========

        img.onload = () => {
            logLog(t('log.msg.basicViewerImageLoaded'));
        };

        img.onerror = () => {
            logError(t('log.category.basicViewer'), t('log.msg.basicViewerImageFailed'));
        };

        // ========== 展示 ==========

        document.body.style.overflow = 'hidden';
        document.body.appendChild(viewerContainer);

        // 背景蒙版先淡入，图片内容和关闭按钮延迟 250ms 后淡入
        requestAnimationFrame(() => {
            viewerContainer.style.opacity = '1';
            setTimeout(() => {
                img.style.opacity = '1';
                closeBtn.style.opacity = '1';
            }, 250);
        });

        logLog(t('log.msg.basicViewerReady'));
    }

    // ==================== Viewer.js 集成 ====================

    /** 为单张图片打开基础查看器（无需构建全部图片元素） */
    async function openBasicViewer(imageData, token) {
        if (isPreviewStale(token)) return;
        logLog(t('log.msg.enableBasicViewer'));
        try {
            const blob = await storage.get(`current_${imageData.id}`);
            if (blob && !isPreviewStale(token)) {
                const url = URL.createObjectURL(blob);
                showBasicViewer({ blobUrl: url, originalName: imageData.name });
            } else if (!blob) {
                logError(t('log.category.viewer'), t('log.msg.getImageDataFailed', { id: imageData.id }));
            }
        } catch (error) {
            if (!isPreviewStale(token)) {
                logError(t('log.category.viewer'), t('log.msg.getBlobFailed', { msg: error.message || error }));
            }
        }
    }

    async function showPreview(imageId) {
        const imageData = images.find(item => item.id === imageId);
        if (!imageData) {
            logWarn(t('log.category.viewer'), t('log.msg.viewerNotFound', { id: imageId }));
            return;
        }

        // 1. 彻底清理所有残留预览容器和实例（含 Blob URL）
        const existingContainers = document.querySelectorAll('.image-gallery-container');
        existingContainers.forEach(container => {
            revokeBlobUrls(container);
            if (container.parentNode) container.parentNode.removeChild(container);
        });
        cleanupExistingViewer();

        // 2. 递增令牌，使旧未完成的调用失效
        const token = ++previewNonce;

        // 3. 若关闭 Viewer.js 开关，跳过创建全部图片元素，直接用基础查看器
        if (!useViewerJs) {
            await openBasicViewer(imageData, token);
            return;
        }

        // 4. 等待 Viewer 资源加载（失败时降级到基础查看器）
        try {
            await getViewerLoadPromise();
        } catch (err) {
            logError(t('log.category.viewer'), t('log.msg.viewerResourceLoadFailed', { msg: err.message || err }));
        }

        if (isPreviewStale(token)) return;

        // 5. Viewer.js 不可用，降级到基础查看器（跳过创建全部图片元素）
        if (!window.Viewer) {
            logError(t('log.category.viewer'), t('log.msg.viewerUnavailable'));
            await openBasicViewer(imageData, token);
            return;
        }

        // 6. Viewer.js 可用，创建画廊容器（含全部图片元素）并初始化
        let galleryContainer;
        try {
            galleryContainer = await buildGallery();
        } catch (createError) {
            if (isPreviewStale(token)) return;
            logError(t('log.category.viewer'), t('log.msg.galleryCreateFailed', { msg: createError.message || createError }));
            await openBasicViewer(imageData, token);
            return;
        }

        try {
            if (isPreviewStale(token)) {
                destroyViewer(galleryContainer);
                return;
            }
            await initViewer(imageData, galleryContainer, imageId, token);
        } catch (error) {
            if (isPreviewStale(token)) {
                destroyViewer(galleryContainer);
                return;
            }
            logError(t('log.category.viewer'), t('log.msg.viewerInitFailed', { msg: error.message || error }));
            await fallbackViewer(galleryContainer, imageData, token);
        }
    }

    /**
     * 取消之前的预览操作
     * 防止多个预览实例同时存在造成内存泄漏
     */
    /**
     * 清理已存在的 viewer 实例
     */
    function cleanupExistingViewer() {
        // 统一销毁 viewer 实例
        if (viewerInstance) {
            try {
                viewerInstance.destroy();
                logLog(t('log.msg.destroyedOldViewer'));
            } catch (error) {
                logWarn(t('log.category.viewer'), t('log.msg.destroyViewerFailed', { msg: error.message || error }));
            }
            viewerInstance = null;
        }
        // 复用 destroyViewer 清理所有残留容器
        document.querySelectorAll('.image-gallery-container').forEach(container => {
            destroyViewer(container, true);
        });
    }

    /**
     * @typedef {HTMLElement & {_loadPromises?: Promise<any>, _cleanedUp?: boolean, _timeoutIds?: Array<number>}} GalleryContainer
     */

    /**
     * 创建图片画廊容器
     * @returns {Promise<GalleryContainer>} 容器元素
     */
    async function buildGallery() {
        const container = document.createElement('div');
        container.className = 'image-gallery-container';
        container.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 0;
            height: 0;
            overflow: hidden;
        `;

        // 存储所有超时 ID，以便取消预览时统一清除
        const timeoutIds = [];
        container._timeoutIds = timeoutIds;

        const PLACEHOLDER_SRC = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">'
            + '<path fill="#515151" d="M93.125,85l36.25-61.875H15c-8.125,0-15,6.875-15,15.625v122.5c0,8.125,6.875,15,15,15l80.8315.0084,29.7935-53.7584-32.5-37.5h0ZM15,35h93.125l-30.625,51.875,30.625,35c-12.5,8.125-22.5,8.125-35.625-1.25-22.5-15-48.125,2.5-61.25,15V38.75c.0084-1.9916,1.875-3.75,3.75-3.75ZM83.125,165H15c-1.875,0-3.75-1.875-3.75-3.75v-13.125c8.125-8.125,35-33.75,56.25-20,12.5,8.125,28.4663,12.7402,43.0281,1.5492l-20.3216,35.3343-7.0815-.0084ZM185,23.125h-41.25l-36.875,58.75,33.125,37.5-30.6517,56.8834,75.6517-.0084c8.125,0,15-6.875,15-15V38.75c0-8.75-6.875-15.625-15-15.625h0ZM150.625,35h34.375c1.875,0,3.75,1.875,3.75,3.75v61.875c-9.375-9.375-19.375-15.625-28.125-16.25-5.625-.625-11.25,1.25-15.625,5l-8.125,8.125-15-16.875,28.75-45.625h0ZM185,165h-56.25l25.3286-47.191-10.9537-13.434,8.75-8.125c2.5-1.875,5-3.125,8.125-2.5,8.75.625,20,9.375,28.75,21.25v46.25c-.0197,1.7275-1.875,3.75-3.75,3.75h0Z"/>'
            + '<circle cx="44.375" cy="68.75" r="14.0625" fill="none" stroke="#515151" stroke-width="9.375"/>'
            + '</svg>');

        // 预先创建所有图片元素，按顺序同步添加到 DOM，然后等待它们加载完成
        const imgElements = new Array(images.length); // 预分配数组
        logLog(t('log.msg.creatingImageElements', { n: images.length }));

        const loadPromises = images.map((imageData, index) => {
            return new Promise((resolve) => {
                // 对 storage.get 添加超时，防止存储层永久 pending
                const storagePromise = storage.get(`current_${imageData.id}`);
                let storageTimerId;
                const timeoutPromise = new Promise((_, reject) => {
                    storageTimerId = setTimeout(() => reject(new Error(t('log.msg.storageReadTimeout'))), 8000);
                });
                timeoutIds.push(storageTimerId);
                Promise.race([storagePromise, timeoutPromise]).then(blob => {
                    clearTimeout(storageTimerId);
                    if (!blob) throw new Error(t('log.msg.imageDataMissing', { name: imageData.name }));

                    const blobUrl = URL.createObjectURL(blob);
                    const img = document.createElement('img');
                    img.src = blobUrl;
                    img.alt = escapeHtml(imageData.name) || t('log.msg.imageAlt', { n: index + 1 });
                    img.dataset.imageId = imageData.id;
                    img.dataset.index = index.toString();
                    img.dataset.blobUrl = blobUrl;
                    img.loading = 'eager';
                    img.decoding = 'async';

                    // 保存引用到数组（保持顺序）- 在创建 img 后立即同步赋值
                    imgElements[index] = img;
                    logLog(t('log.msg.imageElementCreated', { idx: index, name: imageData.name }));

                    // 动态超时：按 blob 大小估算，每 MB 给 3 秒，最少 8 秒，最多 60 秒
                    const blobSizeMB = (blob?.size || 0) / (1024 * 1024);
                    const dynTimeout = Math.max(8000, Math.min(60000, blobSizeMB * 3000));
                    const timeoutId = setTimeout(() => {
                        logError(imageData.name, t('log.msg.imageLoadTimeout', { n: (dynTimeout/1000).toFixed(0) }));
                        releaseImgBlob(img);
                        img.onerror = null;
                        img.dataset.loadFailed = 'true';
                        img.src = PLACEHOLDER_SRC;
                        resolve(img);
                    }, dynTimeout);
                    timeoutIds.push(timeoutId);

                    img.onload = () => {
                        clearTimeout(timeoutId);
                        logLog(t('log.msg.imageLoaded', { name: img.alt, w: img.naturalWidth, h: img.naturalHeight }));
                        resolve(img);
                    };

                    img.onerror = () => {
                        clearTimeout(timeoutId);
                        logError(imageData.name, t('log.msg.imageLoadFailed'));
                        releaseImgBlob(img);
                        img.onerror = null;
                        img.dataset.loadFailed = 'true';
                        img.src = PLACEHOLDER_SRC;
                        resolve(img);
                    };
                }).catch((err) => {
                    clearTimeout(storageTimerId);
                    // 捕获 storage.get 失败或 then 中抛出的异常，防止 Promise 永久 pending
                    logError(imageData.name, t('log.msg.imageGetException', { msg: err?.message || err }));
                    const img = document.createElement('img');
                    img.src = PLACEHOLDER_SRC;
                    img.dataset.loadFailed = 'true';
                    img.alt = escapeHtml(imageData.name) || t('log.msg.imageAlt', { n: index + 1 });
                    img.dataset.imageId = imageData.id;
                    img.dataset.index = index.toString();
                    imgElements[index] = img;
                    resolve(img);
                });
            });
        });

        // 等待所有图片元素创建完成后再添加到 DOM
        await Promise.allSettled(loadPromises);

        logLog(t('log.msg.imageElementsReady', { total: imgElements.length, assigned: imgElements.filter(x => x).length }));

        // 按顺序将所有图片添加到容器（保证 DOM 顺序与 images 数组一致）
        imgElements.forEach((img, index) => {
            if (img) {
                container.appendChild(img);
            } else {
                logWarn(t('log.category.viewer'), t('log.msg.imageElementMissing', { idx: index }));
            }
        });

        logLog(t('log.msg.imageElementsAppended', { total: imgElements.length, added: container.children.length }));

        // 存储加载 Promise 到容器
        container._loadPromises = Promise.allSettled(loadPromises);

        document.body.appendChild(container);
        return container;
    }

    /**
     * 按照最佳实践初始化 Viewer.js
     * @param {Object} imageData - 图片数据
     * @param {HTMLElement & {_loadPromises?: Promise<any>}} container - 容器元素
     * @param {string} targetImageId - 目标图片 ID
     * @param {number} token - 并发控制令牌
     */
    async function initViewer(imageData, container, targetImageId, token) {
        // 最终检查是否被新调用取代
        if (isPreviewStale(token)) {
            logLog(t('log.msg.previewSuperseded'));
            destroyViewer(container);
            return;
        }

        try {
            // 等待所有图片至少尝试加载完成
            if (container._loadPromises) {
                logLog(t('log.msg.waitingImages'));
                await container._loadPromises;
                logLog(t('log.msg.allImagesLoaded'));
            }

            // 额外等待一小段时间，确保 DOM 渲染完成
            await new Promise(resolve => setTimeout(resolve, 100));

            // @ts-ignore - Viewer.js 是动态加载的，忽略类型检查
            const ViewerConstructor = window.Viewer;

            viewerInstance = new ViewerConstructor(container, {
                // 基础配置
                inline: false,
                backdrop: true,
                loading: true,

                // 导航和交互
                keyboard: true,
                focus: true,
                loop: true,

                // UI组件
                button: true,
                navbar: true,
                toolbar: TOOLBAR_CONFIG,
                title: false,

                // 行为配置
                movable: true,
                zoomable: true,
                rotatable: true,
                scalable: true,
                transition: false,   // 关闭动画
                fullscreen: true,
                preload: true,       // 预加载相邻图片，提升批量预览切换速度

                // 过滤器：排除加载失败的占位图，仅允许有效图片
                filter(image) {
                    // 仅允许加载成功的非占位图
                    return !image.dataset.loadFailed && !image.src.startsWith('data:image/svg+xml');
                },

                // 生命周期事件
                ready() {
                    logLog(t('log.msg.viewerReady'));
                },

                shown() {
                    // 统计加载成功和失败的图片
                    const viewerImages = container.querySelectorAll('img');
                    let loadedCount = 0;
                    let failedImages = [];

                    viewerImages.forEach((img, idx) => {
                        if (img.complete && img.naturalWidth > 0) {
                            loadedCount++;
                        } else {
                            failedImages.push(idx + 1);
                        }
                    });

                    if (failedImages.length === 0) {
                        logLog(t('log.msg.loadedImages', { n: loadedCount }));
                    } else {
                        logLog(t('log.msg.loadedImagesPartial', { n: loadedCount, ids: failedImages.join('、') }));
                    }
                },

                viewed(event) {
                    const { detail } = event;
                    const currentImage = detail.image;
                    const currentIndex = detail.index;
                    logLog(t('log.msg.viewingImage', { alt: currentImage.alt || t('log.msg.unknown'), idx: currentIndex }));

                    // 每次切换图片时检查加载状态
                    if (!currentImage.complete || currentImage.naturalWidth === 0) {
                        logWarn(t('log.category.viewer'), t('log.msg.currentImageNotLoaded'));
                    }
                },

                hide() {
                    logLog(t('log.msg.viewerHide'));
                },

                hidden() {
                    logLog(t('log.msg.viewerHidden'));
                    viewerInstance = null; // Viewer.js 已自毁，避免 destroyViewer 重复销毁
                    destroyViewer(container);
                },

                play() {
                    logLog(t('log.msg.fullscreen'));
                }
            });

            // 显示查看器
            viewerInstance.show();

            // 延迟一小段时间确保 DOM 完全渲染
            await new Promise(resolve => setTimeout(resolve, 50));

            // 定位到目标图片 - 通过 data-imageId 属性查找 DOM 中的实际位置
            // 检查 Viewer 实例是否仍然有效（用户可能在延时期间快速关闭了查看器）
            if (!viewerInstance) {
                logLog(t('log.msg.viewerDestroyedSkipLocate'));
                return;
            }

            const targetImg = container.querySelector(`img[data-image-id="${targetImageId}"]`);
            if (targetImg) {
                const domIndex = Array.from(container.children).indexOf(targetImg);
                logLog(t('log.msg.containerImageCount', { n: container.children.length }));
                logLog(t('log.msg.targetImageFound', { idx: domIndex }));
                viewerInstance.view(domIndex);
            } else {
                // 详细调试信息
                logError(t('log.category.viewer'), t('log.msg.targetImageNotFound', { id: targetImageId }));
                logLog(t('log.msg.containerImagesHeader'));
                Array.from(container.children).forEach((img, idx) => {
                    const imageId = img.dataset?.imageId || t('log.msg.noId');
                    logLog(`[${idx}] ID: ${imageId}, Alt: ${img.alt}`);
                });

                // 尝试使用 Viewer.js 的 images 数组访问（Viewer.js 1.x 使用 images 而非 list）
                if (viewerInstance && viewerInstance.images) {
                    logLog(t('log.msg.viewerImagesCount', { n: viewerInstance.images.length }));
                    viewerInstance.images.forEach((img, idx) => {
                        const imageId = img.dataset?.imageId || t('log.msg.noId');
                        logLog(`[${idx}] ID: ${imageId}, Alt: ${img.alt}`);
                    });

                    // 尝试在 Viewer.js 的 images 中查找
                    const foundIndex = viewerInstance.images.findIndex(img => img.dataset?.imageId === targetImageId);
                    if (foundIndex >= 0) {
                        logLog(t('log.msg.targetImageFoundViewer', { idx: foundIndex }));
                        viewerInstance.view(foundIndex);
                    }
                }
            }

        } catch (error) {
            logError(t('log.category.viewer'), t('log.msg.viewerInitError', { msg: error.message || error }));
            await fallbackViewer(container, imageData, token);
        }
    }

    /** Viewer.js 工具栏配置 */
    const TOOLBAR_CONFIG = {
        zoomIn: 1, zoomOut: 1, oneToOne: 1, reset: 1, prev: 1,
        play: { show: 1, size: 'large' }, next: 1,
        rotateLeft: 1, rotateRight: 1, flipHorizontal: 1, flipVertical: 1
    };

    /**
     * 处理 Viewer.js 初始化失败的情况
     * @param {HTMLElement} container - 容器元素
     * @param {Object} imageData - 图片数据
     * @param {number} token - 并发控制令牌
     */
    async function fallbackViewer(container, imageData, token) {
        destroyViewer(container);
        if (!isPreviewStale(token)) {
            logLog(t('log.msg.fallbackBasicViewer'));
            await openBasicViewer(imageData, token);
        }
    }

    /**
     * 清理 Viewer.js 相关资源
     * @param {GalleryContainer} container - 容器元素
     * @param {boolean} [skipViewerDestroy=false] - 跳过 Viewer 实例销毁（批量清理时由调用方统一销毁）
     */
    function destroyViewer(container, skipViewerDestroy = false) {
        // 重入防护：destroy() 可能触发 hidden 回调导致递归调用
        if (container && container._cleanedUp) return;
        if (container) container._cleanedUp = true;

        if (!skipViewerDestroy && viewerInstance) {
            try {
                viewerInstance.destroy();
            } catch (e) {
                logWarn(t('log.category.viewer'), t('log.msg.viewerDestroyError', { msg: e.message || e }));
            }
            viewerInstance = null;
        }
        if (container && container.parentNode) {
            // 清除所有图片加载超时定时器
            if (container._timeoutIds) {
                container._timeoutIds.forEach(id => clearTimeout(id));
                container._timeoutIds = null;
            }
            // 释放所有临时 blob URL
            revokeBlobUrls(container);
            container.parentNode.removeChild(container);
        }
        logLog(t('log.msg.viewerResourcesCleaned'));
    }

    /**
     * 窗口大小改变时的防抖处理
     * 避免频繁调用 update 导致性能问题
     */
    let resizeDebounceTimer = null;
    /**
     * 响应窗口大小变化，更新 UI 元素状态
     */
    function handleWindowResize() {
        // 清除之前的定时器
        if (resizeDebounceTimer) {
            clearTimeout(resizeDebounceTimer);
        }

        // 防抖延迟 150ms
        resizeDebounceTimer = setTimeout(() => {
            if (viewerInstance && viewerInstance.update) {
                try {
                    viewerInstance.update();
                    logLog(t('log.msg.windowResized'));
                } catch (_) { /* viewer 可能在定时器触发前已销毁 */ }
            }
        }, 150);
    }
