// 图片混淆工具 — 图片格式转换（PNG/JPG/BMP/WebP 互转）
// =============================================
// 图片格式转换函数
// =============================================

    /** 将 'jpeg' 规范化为 'jpg' (同一 MIME 类型)，其余原样返回 */
    function getOutputExtension(format) {
        return format === 'jpeg' ? 'jpg' : format;
    }

    /**
     * 将图片 Blob 转换为目标格式
     * @param {Blob} blob - 原始图片 Blob
     * @param {string} targetFormat - 目标格式 (png/jpg/jpeg/bmp/webp)
     * @param {{fillColor?: string, quality?: number, lossless?: boolean}} [opts] - 选项
     * @returns {Promise<Blob>} 转换后的 Blob
     */
    async function convertImageBlob(blob, targetFormat, opts = {}) {
        // 规范化格式：jpeg→jpg，统一后续分支
        const fmt = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
        const mime = fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`;
        if (blob.type === mime) return blob;

        const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
        const canvas = getCanvasFromPool(bitmap.width, bitmap.height);
        try {
            const ctx = canvas.getContext('2d', { premultipliedAlpha: false });
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if ((fmt === 'jpg' || fmt === 'bmp') && blobMayHaveTransparency(blob.type)) {
                ctx.fillStyle = opts.fillColor || opaqueBackgroundColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(bitmap, 0, 0);

            if (fmt === 'bmp') {
                const bmpData = await canvasToBmpAsync(canvas);
                return new Blob([bmpData], { type: 'image/bmp' });
            }
            // png / jpg / webp 统一走 toBlob
            const q = fmt === 'webp'
                ? ((opts.lossless != null ? opts.lossless : document.getElementById('webp-lossless-toggle')?.checked) ? 1.0 : (opts.quality != null ? opts.quality : imageQuality))
                : (opts.quality != null ? opts.quality : imageQuality);
            return await canvasToBlobPromise(canvas, mime, q);
        } finally {
            bitmap.close();
            releaseCanvasToPool(canvas);
        }
    }

    // =============================================
    // 图片格式转换函数
    // =============================================

    /**
     * 将Canvas转换为BMP格式的二进制数据（优化版本）
     * @param {HTMLCanvasElement} canvas - 要转换的Canvas元素
     * @returns {ArrayBuffer} BMP格式的二进制数据
     *
     * 优化点：
     * 1. 使用Uint8Array直接填充文件头，减少DataView开销
     * 2. 预计算行对齐参数，避免循环中重复计算
     * 3. 对大图(>2MB)可考虑使用Web Worker处理
     */
    /**
     * 将 RGBA 像素数据编码为 BMP 24位格式
     * 供同步 canvasToBmp 和异步 Web Worker 共用，消除维护双份代码的风险
     */
    function encodeBmpData(width, height, pixels) {
        const bytesPerPixel = 3;
        const rowPadding = (4 - (width * bytesPerPixel) % 4) % 4;
        const rowSize = width * bytesPerPixel + rowPadding;
        const pixelDataSize = rowSize * height;
        const totalSize = 54 + pixelDataSize;

        const result = new Uint8Array(totalSize);

        // BMP文件头 (14字节)
        result[0] = 0x42; result[1] = 0x4D;
        result[2] = totalSize & 0xFF;
        result[3] = (totalSize >> 8) & 0xFF;
        result[4] = (totalSize >> 16) & 0xFF;
        result[5] = (totalSize >> 24) & 0xFF;
        result[10] = 54 & 0xFF;
        result[11] = (54 >> 8) & 0xFF;

        // BMP信息头 (40字节)
        result[14] = 40;
        result[18] = width & 0xFF;
        result[19] = (width >> 8) & 0xFF;
        result[20] = (width >> 16) & 0xFF;
        result[21] = (width >> 24) & 0xFF;
        const negativeHeight = -height;
        result[22] = negativeHeight & 0xFF;
        result[23] = (negativeHeight >> 8) & 0xFF;
        result[24] = (negativeHeight >> 16) & 0xFF;
        result[25] = (negativeHeight >> 24) & 0xFF;
        result[26] = 1; result[28] = 24;
        result[34] = pixelDataSize & 0xFF;
        result[35] = (pixelDataSize >> 8) & 0xFF;
        result[36] = (pixelDataSize >> 16) & 0xFF;
        result[37] = (pixelDataSize >> 24) & 0xFF;
        // 72 DPI = 2835 ppm = 0x0B13，小端：低字节 0x13(19)、高字节 0x0B(11)
        result[38] = 19; result[39] = 11;
        result[42] = 19; result[43] = 11;

        // 像素数据转换：RGBA -> BGR
        let srcIndex = 0;
        let dstIndex = 54;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                result[dstIndex++] = pixels[srcIndex + 2];
                result[dstIndex++] = pixels[srcIndex + 1];
                result[dstIndex++] = pixels[srcIndex];
                srcIndex += 4;
            }
            dstIndex += rowPadding;
        }

        return result;
    }

    /** canvas.toBlob 的 Promise 封装，消除重复的 new Promise 样板代码，null Blob 时 reject */
    function canvasToBlobPromise(canvas, mime, quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error(t('error.canvasToBlobNull', { mime: mime })));
            }, mime, quality);
        });
    }

    /** Canvas 绘制 bitmap 的标准三步操作：getContext + clearRect + drawImage */
    function drawBitmapToCanvas(canvas, bitmap, opts = {}) {
        const ctxOptions = { premultipliedAlpha: false };
        if (opts.willReadFrequently) ctxOptions.willReadFrequently = true;
        const ctx = canvas.getContext('2d', ctxOptions);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        return ctx;
    }

    /**
     * 将 Canvas 内容转换为 BMP 格式的 ArrayBuffer
     * @param {HTMLCanvasElement} canvas - 源 Canvas 元素
     * @returns {ArrayBuffer} BMP 格式的二进制数据
     */
    function canvasToBmp(canvas) {
        const ctx = canvas.getContext('2d', { premultipliedAlpha: false });
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return encodeBmpData(canvas.width, canvas.height, imageData.data).buffer;
    }

    /**
     * 异步BMP生成函数（用于大图处理）
     * @param {HTMLCanvasElement} canvas - 要转换的Canvas元素
     * @returns {Promise<ArrayBuffer>} BMP格式的二进制数据
     *
     * 对于大图(>2MB)使用Web Worker避免主线程阻塞
     */
    async function canvasToBmpAsync(canvas) {
        const dataSize = canvas.width * canvas.height * 4;

        // 小图直接同步处理
        if (dataSize <= 2 * 1024 * 1024) {  // 2MB阈值
            return canvasToBmp(canvas);
        }

        // 大图使用Web Worker处理
        return new Promise((resolve, reject) => {
            let blobUrl = null;
            let worker = null;
            let settled = false;
            function finalize(err) {
                if (settled) return;
                settled = true;
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                if (worker) worker.terminate();
                reject(err);
            }

            try {
                // 创建内联Worker处理大图（复用 encodeBmpData，消除双份维护）
                const workerCode = `
                    ${encodeBmpData.toString()}
                    self.onmessage = function(e) {
                        const { width, height, imageData } = e.data;
                        const result = encodeBmpData(width, height, imageData);
                        self.postMessage(result.buffer, [result.buffer]);
                        self.close();
                    };
                `;

                const blob = new Blob([workerCode], { type: 'application/javascript' });
                blobUrl = URL.createObjectURL(blob);
                worker = new Worker(blobUrl);

                worker.onmessage = function(e) {
                    if (settled) return;
                    settled = true;
                    URL.revokeObjectURL(blobUrl);
                    worker.terminate();
                    resolve(e.data);
                };

                worker.onerror = function(error) {
                    finalize(new Error(t('error.workerFailed', { msg: error.message })));
                };

                worker.addEventListener('messageerror', function() {
                    finalize(new Error(t('error.workerMessageFailed')));
                });

                const ctx = canvas.getContext('2d', { premultipliedAlpha: false });
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                // 复制像素数据到独立 buffer，通过 Transferable 传输避免结构化克隆开销
                const dataBuffer = imageData.data.buffer.slice(0);
                const transferData = new Uint8Array(dataBuffer);

                worker.postMessage(
                    { width: canvas.width, height: canvas.height, imageData: transferData },
                    [dataBuffer]
                );

            } catch (error) {
                // 设置 settled 防止后续 onerror 重复 reject 已 resolve 的 Promise
                settled = true;
                logWarn(t('log.category.image'), t('log.msg.workerUnavailable', { msg: error.message || error }));
                if (worker) worker.terminate();
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                resolve(canvasToBmp(canvas));
            }
        });
    }

    // =============================================
    /**
     * 根据混淆级别返回对应的状态信息
     * @param {number} level - 混淆级别（0=原始，1=混淆，2=解混淆）
     * @returns {{text: string, className: string, suffix: string}} 状态显示信息
     */
    function getStatusInfo(level) {
        if (level === 0) return { text: t('status.original'), className: 'status-original', suffix: 'original' };
        if (level > 0) {
            return {
                text: level === 1 ? t('status.encrypted') : t('status.encryptedMulti', { n: level }),
                className: 'status-encrypted',
                suffix: level === 1 ? 'encrypted' : `encrypted_${level}`
            };
        }
        const absLevel = Math.abs(level);
        return {
            text: absLevel === 1 ? t('status.decrypted') : t('status.decryptedMulti', { n: absLevel }),
            className: 'status-decrypted',
            suffix: absLevel === 1 ? 'decrypted' : `decrypted_${absLevel}`
        };
    }
