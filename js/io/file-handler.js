// 图片混淆工具 — 文件导入处理（拖放/选择/ZIP）
// =============================================
// 文件处理
// =============================================

// 跨文件共享变量（app.js 中 var 声明，此处 var 可重复声明）
var isProcessing;

    function isValidImageBytes(data) {
        if (!data || data.length < 4) return false;
        const b = data; // 别名，便于书写

        // JPEG: FF D8 FF
        if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true;

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return true;

        // GIF: 47 49 46 38 (GIF87a / GIF89a)
        if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true;

        // BMP: 42 4D
        if (b[0] === 0x42 && b[1] === 0x4D) return true;

        // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF....WEBP)
        if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
            && data.length >= 12
            && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true;

        // SVG: 文本格式，尝试解码前几个字节检查是否以 <svg 或 <?xml 开头
        try {
            const head = new TextDecoder().decode(data.slice(0, 256)).trimStart();
            if (/^\s*<(svg|SVG)\b/.test(head) || /^\s*<\?(xml|XML)\b/.test(head)) return true;
        } catch (e) { /* 解码失败则不是 SVG */ }

        return false;
    }

    // =============================================
    // 图片管理函数
    // =============================================

    /** 存储错误统一处理，消除重复的 quota / 通用错误弹窗 */
    function handleStorageError(storageErr) {
        if (storageErr.type === 'quota') {
            alert(t('alert.storageFull'));
        } else {
            alert(t('alert.storageFailed', { msg: storageErr.message }));
        }
    }

    /**
     * 【Phase 1】准备图片数据：读取文件、存储到 IndexedDB、获取尺寸
     * 纯异步工作，不涉及任何 DOM 操作，为批量渲染做准备
     * @param {File} file - 图片文件对象
     * @returns {Promise<Object>} imageData 对象（含 id、尺寸、格式等）
     */
    async function prepareImageData(file) {
        const id = Date.now().toString(36) + (_batchIdCounter++).toString(36) + Math.random().toString(36).substring(2);
        let blob;
        let originalFormat = file.type.split('/')[1]?.toUpperCase() || 'UNKNOWN';
        try {
            // 优先使用 arrayBuffer
            const buffer = await file.arrayBuffer();
            blob = new Blob([buffer], { type: file.type });
        } catch (firstError) {
            logWarn(file.name, t('log.msg.arrayBufferFailed', { msg: firstError.message || firstError }));
            try {
                // 回退到 FileReader
                /** @type {ArrayBuffer} */
                const buffer = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsArrayBuffer(file);
                });
                blob = new Blob([buffer], { type: file.type });
            } catch (secondError) {
                logWarn(file.name, t('log.msg.fileReaderFailed', { msg: secondError.message || secondError }));
                try {
                    // 最终回退：尝试直接使用 createImageBitmap 获取图像数据（绕过文件读取）
                    const bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none' });
                    // 将 ImageBitmap 绘制到 canvas 并导出为 PNG Blob
                    const canvas = getCanvasFromPool(bitmap.width, bitmap.height);
                    try {
                        drawBitmapToCanvas(canvas, bitmap);
                        blob = await canvasToBlobPromise(canvas, 'image/png');
                    } finally {
                        bitmap.close();
                        releaseCanvasToPool(canvas);
                    }
                    originalFormat = 'PNG'; // 强制格式为 PNG
                    logWarn(file.name, t('log.msg.convertedToPng'));
                } catch (thirdError) {
                    logError(file.name, t('log.msg.allReadFailed', { msg: thirdError.message || thirdError }));
                    throw thirdError; // 彻底失败
                }
            }
        }

        // 存储原始图片（带存储空间检查）
        try {
            await storage.set(`original_${id}`, blob);
        } catch (storageErr) {
            handleStorageError(storageErr);
            throw storageErr;
        }
        try {
            await storage.set(`current_${id}`, blob); // 当前图片初始为原始
        } catch (storageErr) {
            // 回滚已存的 original 数据
            await storage.delete(`original_${id}`).catch(() => {});
            handleStorageError(storageErr);
            throw storageErr;
        }

        // 获取图片尺寸
        const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
        const width = bitmap.width;
        const height = bitmap.height;
        bitmap.close();

        return {
            id,
            name: file.name,
            originalName: file.name,
            scrambleLevel: 0,
            size: blob.size,
            width: width,
            height: height,
            naturalWidth: width,
            naturalHeight: height,
            format: originalFormat,
            processed: false
        };
    }

    /**
     * 【Phase 2】批量提交图片数据到应用：一次性创建所有 DOM 容器
     * 使用 DocumentFragment 减少浏览器重排/重绘次数
     * @param {Object[]} imageDataArray - prepareImageData 返回的 imageData 数组
     */
    function commitImageBatch(imageDataArray) {
        if (!imageDataArray || imageDataArray.length === 0) return;

        const imageList = document.getElementById('imageList');
        const fragment = document.createDocumentFragment();

        for (const imageData of imageDataArray) {
            // 加入数据数组
            images.push(imageData);

            // 使用工厂函数创建 DOM 元素（不单独追加）
            const item = createImageItem(imageData);
            fragment.appendChild(item);

            // 网格模式：注册到懒加载器
            if (currentViewMode === 'grid' && imageLazyLoader) {
                imageLazyLoader.observe(item, imageData);
            }

            // 后台预生成缩略图缓存
            schedulePrefetch(imageData);
        }

        // ===== 一次性插入所有容器，触发单次重排 =====
        imageList.appendChild(fragment);

        // ===== 统一更新 UI 状态（只执行一次） =====
        updateImageCounter();
        toggleEmptyState(false);

        if (!hasImportedFiles) {
            hasImportedFiles = true;
            const desc = document.getElementById('description-text');
            if (desc) desc.style.display = 'none';
        }

        // 导入后更新处理顺序（按图片尺寸排序）
        updateProcessOrder();
    }

    // =============================================
    // 拖拽功能
    // =============================================

    const dropZone = document.getElementById('dropZone');

    // =============================================
    // 整页拖拽支持 - 在页面任意位置拖拽文件
    // =============================================

    // 拖拽经过时：阻止默认行为并添加高亮样式
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    // 拖拽离开时：智能判断鼠标位置再移除高亮
    document.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null || !dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drag-over');
        }
    });

    // 文件放置时：处理拖拽的文件
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            void handleFiles(files);
        }
    });

    // =============================================
    // 点击拖拽区域：触发文件选择
    // =============================================
    dropZone.addEventListener('click', () => {
        document.getElementById('add-images').click();
    });

    /**
     * 处理文件添加
     * @param {File[]} files - 文件数组
     *
     * 处理通过拖拽或文件选择添加的图片文件
     */
    async function handleFiles(files) {
        // 入口加锁：防止快速连续拖拽/点击导致多个 handleFiles 并发执行，
        // images 数组和 DOM 操作交错可能引发重复添加、processOrder 冲突
        if (isProcessing) {
            showTempStatus(t('toast.busy'), 2000);
            return;
        }
        isProcessing = true;
        try {
        // ========== 第一趟：分离 ZIP / 预统计有效图片数量 ==========
        const validImages = [];   // 普通图片（已验证）
        const zipFiles = [];      // ZIP 文件（保持原有逻辑不变）
        let errorCount = 0;

        for (const file of files) {
            const isZip = file.type === 'application/zip' ||
                          file.name.toLowerCase().endsWith('.zip');
            if (isZip) {
                zipFiles.push(file);
                continue;
            }
            // 普通图片：先校验格式，统计有效数量
            if (!isValidImageFile(file)) {
                logWarn(file.name, t('log.msg.notSupportedFile'));
                errorCount++;
                continue;
            }
            validImages.push(file);
        }

        const totalImages = validImages.length;
        const totalZips = zipFiles.length;


        // 展示预统计结果
        if (totalImages > 0 || totalZips > 0) {
            const parts = [];
            if (totalImages > 0) parts.push(t('progress.partImages', { n: totalImages }));
            if (totalZips > 0) parts.push(t('progress.partZips', { n: totalZips }));
            batchStatusEl.innerHTML = '<div class="loading"></div> ' + t('progress.importing', { parts: parts.join(' + ') });
        } else if (errorCount > 0) {
            showTempStatus(t('toast.allUnsupported', { n: errorCount }), 3000);
            return;
        } else {
            return;
        }

        // ========== 第二趟：批量导入 ==========
        let addedCount = 0;

        // 图片分支：先并行准备所有图片数据，再批量渲染 DOM
        const regularImageDataBatch = [];
        for (let i = 0; i < totalImages; i++) {
            try {
                const imageData = await prepareImageData(validImages[i]);
                regularImageDataBatch.push(imageData);
                addedCount++;
            } catch (err) {
                logError(validImages[i].name, t('log.msg.addFailed', { msg: err.message || t('error.unknown') }));
                errorCount++;
            }
            // 每张图更新一次进度（短暂延迟让浏览器刷新 UI，同时避免 I/O 争用）
            if (i < totalImages - 1) {
                await updateProgressStatus(batchStatusEl, i + 1, totalImages, 'action.prepare', 16);
            } else {
                await updateProgressStatus(batchStatusEl, i + 1, totalImages, 'action.prepare');
            }
        }
        // 批量渲染所有普通图片的 DOM 容器（单次重排）
        commitImageBatch(regularImageDataBatch);

        // ZIP 分支：每个压缩包内部已改为批量渲染（prepareImageData → commitImageBatch）
        for (const zipFile of zipFiles) {
            const result = await importZip(zipFile);
            addedCount += result.added;
            errorCount += result.errors.length;
        }

        // ========== 结果汇总 ==========
        let message = '';
        if (addedCount > 0 && errorCount > 0) {
            message = ' ' + t('toast.addedPartial', { n: addedCount, m: errorCount });
        } else if (addedCount > 0) {
            message = ' ' + t('toast.added', { n: addedCount });
        } else if (errorCount > 0) {
            message = ' ' + t('toast.allRejected', { n: errorCount });
        }

        if (message) {
            showTempStatus(message, 3000);
        }
        } finally {
            isProcessing = false;
        }
    }

    /**
     * 验证文件是否为图片
     * @param {File} file - 文件对象
     * @returns {boolean} 是否为有效的图片文件
     *
     * 检查文件的MIME类型和扩展名来确定是否为图片
     */
    function isValidImageFile(file) {
        if (VALID_MIME_TYPES.includes(file.type.toLowerCase())) return true;
        const fileName = file.name.toLowerCase();
        return VALID_EXTENSIONS.some(ext => fileName.endsWith('.' + ext));
    }
