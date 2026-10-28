// 图片混淆工具 — 图片加载与缩略图生成
// =============================================
// 图片加载与缩略图
// =============================================

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

    /** 从 Blob 绘制缩略图到画布，封装 withImageBitmap + getThumbnailSize + drawThumbnail 标准流程 */
    async function drawThumbnailFromBlob(canvas, blob, container) {
        await withImageBitmap(blob, async (bitmap) => {
            const { width, height } = getThumbnailSize(container, bitmap.width, bitmap.height);
            drawThumbnail(canvas, bitmap, width, height);
        });
    }

    // 缩略图绘制：智能缓存 + WebP 0.8 优先 + JPEG 0.9 兼容
    async function createAndDrawThumbnail(thumbnailContainer, imageData) {
        const canvas = document.createElement('canvas');
        canvas.className = 'thumbnail-canvas';
        canvas.style.cssText = 'display:block;max-width:100%;max-height:100%';

        try {
            // 1. 优先使用已缓存的缩略图
            let thumbBlob = await storage.get(`thumb_${imageData.id}`);

            if (!thumbBlob) {
                // 2. 缓存未命中：从原图生成缩略图
                const fullBlob = await storage.get(`current_${imageData.id}`);
                if (!fullBlob) return canvas;

                await drawThumbnailFromBlob(canvas, fullBlob, thumbnailContainer);

                // 3. 导出为压缩格式（WebP 优先）
                const [mime, quality] = await getThumbnailEncodeParams();
                thumbBlob = await canvasToBlobPromise(canvas, mime, quality);

                // 4. 缓存压缩结果，供后续直接使用
                await storage.set(`thumb_${imageData.id}`, thumbBlob);
            } else {
                // 5. 缓存命中：用压缩缩略图绘制（跳过原图解码）
                await drawThumbnailFromBlob(canvas, thumbBlob, thumbnailContainer);
            }
        } catch (e) {
            logWarn(t('log.category.image'), t('log.msg.thumbDrawFailed', { msg: e.message }));
            // 即使失败，若 Canvas 已有内容也会返回
        }

        return canvas;
    }

    /**
     * 后台预生成缩略图缓存（不创建 DOM Canvas，仅写缓存）
     * 上传时调用，确保滚动展示时直接命中缓存，避免解码原图造成卡顿
     * @param {Object} imageData - 图片数据对象
     * @returns {Promise<void>}
     */
    async function prefetchThumbnailCache(imageData) {
        const existing = await storage.get(`thumb_${imageData.id}`);
        if (existing) return;

        try {
            const fullBlob = await storage.get(`current_${imageData.id}`);
            if (!fullBlob) return;

            // 自适应：测量实际缩略图容器尺寸，而非硬编码固定值
            const item = getImageItemEl(imageData.id);
            const container = item?.querySelector('.thumbnail-container');
            const dpr = window.devicePixelRatio || 1;
            const maxWidth = (container?.clientWidth || 250) * dpr;
            const maxHeight = (container?.clientHeight || 150) * dpr;

            const thumbBlob = await withImageBitmap(fullBlob, bitmap =>
                generateThumbnailBlob(bitmap, maxWidth, maxHeight)
            );
            await storage.set(`thumb_${imageData.id}`, thumbBlob);
        } catch (e) {
            // 预缓存失败不阻塞主流程，滚动时会走正常的缓存未命中路径
        }
    }

    /**
     * 调度后台缩略图预缓存（使用 requestIdleCallback 避免阻塞主线程）
     * @param {Object} imageData - 图片数据对象
     */
    function schedulePrefetch(imageData) {
        const run = () => prefetchThumbnailCache(imageData);
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 2000 });
        } else {
            setTimeout(run, 100);
        }
    }

    /**
     * 计算缩略图在容器内的缩放尺寸
     * @param {HTMLElement} container - 缩略图容器元素
     * @param {number} imgWidth - 原始图片宽度
     * @param {number} imgHeight - 原始图片高度
     * @returns {{width: number, height: number}}
     */
    function getThumbnailSize(container, imgWidth, imgHeight) {
        // getBoundingClientRect 比 clientWidth/clientHeight 更可靠，会触发布局重算
        const rect = container.getBoundingClientRect();
        const maxWidth = rect.width || 250;
        const maxHeight = rect.height || 150;
        const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);
        return {
            width: Math.round(imgWidth * scale),
            height: Math.round(imgHeight * scale)
        };
    }

    /**
     * 将已解码源按目标尺寸绘制到缩略图 canvas
     * @param {HTMLCanvasElement} canvas
     * @param {ImageBitmap|HTMLCanvasElement} bitmap - 已解码的 ImageBitmap 或池化 Canvas
     * @param {number} drawWidth
     * @param {number} drawHeight
     */
    function drawThumbnail(canvas, bitmap, drawWidth, drawHeight) {
        canvas.width = drawWidth;
        canvas.height = drawHeight;
        const ctx = canvas.getContext('2d', { premultipliedAlpha: false });
        ctx.clearRect(0, 0, drawWidth, drawHeight);
        ctx.drawImage(bitmap, 0, 0, drawWidth, drawHeight);
    }

    /**
     * 将已解码源缩放后编码为缩略图 Blob
     * @param {ImageBitmap|HTMLCanvasElement} bitmap - 已解码的 ImageBitmap 或池化 Canvas
     * @param {number} maxWidth
     * @param {number} maxHeight
     * @returns {Promise<Blob>}
     */
    async function generateThumbnailBlob(bitmap, maxWidth, maxHeight) {
        // 极值防护：不可见容器可能返回 0 尺寸，降级使用默认值
        if (maxWidth < 1 || maxHeight < 1) {
            maxWidth = Math.max(maxWidth, 250);
            maxHeight = Math.max(maxHeight, 150);
        }
        const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);
        const canvas = getCanvasFromPool(width, height);
        try {
            drawThumbnail(canvas, bitmap, width, height);
            const [mime, quality] = await getThumbnailEncodeParams();
            return await canvasToBlobPromise(canvas, mime, quality);
        } finally {
            releaseCanvasToPool(canvas);
        }
    }

    /**
     * 获取缩略图编码参数（WebP 0.8 优先，否则 JPEG 0.9 兼容）
     * @returns {Promise<[string, number]>} [mime, quality]
     */
    async function getThumbnailEncodeParams() {
        return (await isWebPSupported())
            ? ['image/webp', 0.8]
            : ['image/jpeg', 0.9];
    }

    /**
     * 更新缩略图显示
     * @param {string} imageId - 图片 ID
     * @param {Blob} blob - 图片 Blob 对象（未提供 source 时用于解码）
     * @param {ImageBitmap|HTMLCanvasElement} [source] - 可复用的已解码源，传入时跳过整图二次解码
     *
     * 使用 ImageBitmap 或调用方已有的 canvas 将内容绘制到缩略图 canvas
     */
    async function updateThumbnail(imageId, blob, source) {
        let bitmap = source || null;
        const ownsBitmap = !source;
        try {
            if (!bitmap) bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });

            // 1. 获取实际容器尺寸（响应式网格下宽度可变，高度固定 150px）
            const dpr = window.devicePixelRatio || 1;
            const item = getImageItemEl(imageId);
            const container = item?.querySelector('.thumbnail-container');
            const rect = container?.getBoundingClientRect();
            const maxWidth = (rect?.width || 250) * dpr;
            const maxHeight = (rect?.height || 150) * dpr;

            // 2. 基于实际容器尺寸生成缩略图缓存
            const thumbBlob = await generateThumbnailBlob(bitmap, maxWidth, maxHeight);
            await storage.set(`thumb_${imageId}`, thumbBlob);

            // 3. 非列表模式下，同步更新 DOM 中的 canvas 显示
            if (currentViewMode !== 'list' && container) {
                const canvas = container.querySelector('.thumbnail-canvas');
                if (canvas) {
                    const size = getThumbnailSize(container, bitmap.width, bitmap.height);
                    drawThumbnail(canvas, bitmap, size.width, size.height);
                    updateImageInfo(imageId);
                }
            }
        } catch (e) {
            logWarn(t('log.category.image'), t('log.msg.thumbUpdateFailed', { msg: e.message || e }));
        } finally {
            // 仅关闭本函数自己创建的 ImageBitmap，调用方传入的源由调用方管理
            if (ownsBitmap) bitmap?.close();
        }
    }
