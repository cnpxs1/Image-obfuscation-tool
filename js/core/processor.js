// 图片混淆工具 — 图片处理核心（encrypt/decrypt/restore + Worker 池）
// =============================================
// Worker 池 + 图片处理核心
// =============================================

    // ---- Worker 池并发处理 ----

    /** 像素映射 Worker 内联代码（Blob URL 方式创建，沿用 canvasToBmpAsync 的模式） */
    const PIXEL_WORKER_CODE = `
        self.onmessage = function(e) {
            var srcBuffer = e.data.srcBuffer;
            var curve = e.data.curve;
            var shiftedCurve = e.data.shiftedCurve;
            var totalPixels = e.data.totalPixels;
            var operation = e.data.operation;

            var srcU32 = new Uint32Array(srcBuffer);
            var dstBuffer = new ArrayBuffer(totalPixels * 4);
            var dstU32 = new Uint32Array(dstBuffer);

            var to = operation === 'encrypt' ? shiftedCurve : curve;
            var from = operation === 'encrypt' ? curve : shiftedCurve;
            for (var i = 0; i < totalPixels; i++) {
                dstU32[to[i]] = srcU32[from[i]];
            }

            // Transferable 回传 dstBuffer，零拷贝
            self.postMessage({ dstBuffer: dstBuffer }, [dstBuffer]);
        };
    `;

    /**
     * 信号量：控制并发数量
     * 用于 Worker 池 + I/O 预取的并发调度
     */
    class Semaphore {
        constructor(max) { this.max = max; this.count = 0; this.queue = []; }
        acquire() {
            if (this.count < this.max) { this.count++; return Promise.resolve(); }
            return new Promise(function(resolve) { this.queue.push(resolve); }.bind(this));
        }
        release() {
            this.count--;
            const next = this.queue.shift();
            if (next) { this.count++; next(); }
        }
    }

    // =============================================
    // Worker 池管理器
    // =============================================

    /**
     * Web Worker 池：管理像素映射 Worker 的创建、调度、销毁
     * 大小 = navigator.hardwareConcurrency - 1（最小 1），全局单例
     */
    class WorkerPool {
        constructor(size) {
            this.size = size;
            this._blobUrl = null;  // 所有 Worker 共享的 Blob URL
            this.workers = [];     // { worker, busy }
            this.queue = [];       // { task, resolve, reject }
            this._init();
        }

        _init() {
            this._failed = false;
            const blob = new Blob([PIXEL_WORKER_CODE], { type: 'application/javascript' });
            this._blobUrl = URL.createObjectURL(blob);
            for (let i = 0; i < this.size; i++) {
                try {
                    const worker = new Worker(this._blobUrl);
                    this.workers.push({ worker: worker, busy: false });
                } catch (e) {
                    // file:// 下 Chrome 拒绝 Worker，标记失败并清理
                    this._failed = true;
                    this.terminate();
                    return;
                }
            }
        }

        /** Worker 池是否不可用（如 file:// 协议被浏览器拒绝） */
        get failed() { return this._failed; }

        /**
         * 提交像素映射任务到空闲 Worker，无空闲时排队
         * @param {{srcBuffer: ArrayBuffer, curve: Uint32Array, shiftedCurve: Uint32Array, totalPixels: number, operation: string}} task
         * @returns {Promise<ArrayBuffer>} dstBuffer
         */
        process(task) {
            const self = this;
            return new Promise(function(resolve, reject) {
                let idle = null;
                for (let i = 0; i < self.workers.length; i++) {
                    if (!self.workers[i].busy) { idle = self.workers[i]; break; }
                }
                if (idle) {
                    self._dispatch(idle, task, resolve, reject);
                } else {
                    self.queue.push({ task: task, resolve: resolve, reject: reject });
                }
            });
        }

        _dispatch(entry, task, resolve, reject) {
            const self = this;
            entry.busy = true;

            entry.worker.onmessage = function(e) {
                entry.busy = false;
                resolve(e.data.dstBuffer);
                self._processQueue();
            };

            entry.worker.onerror = function(err) {
                entry.worker.terminate();
                entry.busy = false;
                const idx = self.workers.indexOf(entry);
                if (idx !== -1) self.workers.splice(idx, 1);
                reject(err);
                // 尝试重建 Worker 替代崩溃的实例，避免池容量持续缩减
                self._tryRecreateWorker();
                self._processQueue();
            };

            // srcBuffer 用 Transferable 传递，Worker 获取所有权
            // 包裹 try/catch：若 Worker 在排队期间被意外终止，postMessage 可能同步抛异常
            try {
                entry.worker.postMessage(task, [task.srcBuffer]);
            } catch (e) {
                entry.worker.terminate();
                entry.busy = false;
                const idx = self.workers.indexOf(entry);
                if (idx !== -1) self.workers.splice(idx, 1);
                reject(e);
                // 尝试重建 Worker 替代崩溃的实例
                self._tryRecreateWorker();
                self._processQueue();
            }
        }

        _processQueue() {
            if (this.queue.length === 0) return;
            // 所有 Worker 均崩溃时，排空队列并 reject 全部等待任务，防止 Promise 永久 pending
            // 使用 while 循环 + try/catch 确保单个 reject 异常不影响后续任务处理
            if (this.workers.length === 0) {
                while (this.queue.length > 0) {
                    const item = this.queue.shift();
                    try {
                        item.reject(new Error('Worker 池已耗尽，所有 Worker 均不可用'));
                    } catch (_) {
                        // reject 不应抛异常，但防御性捕获确保后续任务仍被处理
                    }
                }
                return;
            }
            let idle = null;
            for (let i = 0; i < this.workers.length; i++) {
                if (!this.workers[i].busy) { idle = this.workers[i]; break; }
            }
            if (!idle) return;

            const next = this.queue.shift();
            this._dispatch(idle, next.task, next.resolve, next.reject);
        }

        /**
         * 尝试重建一个 Worker 替代已崩溃的实例
         * - 仅当 Blob URL 仍有效且池未标记为失败时尝试
         * - 创建失败时静默放弃（不标记 _failed，避免影响现有健康 Worker）
         */
        _tryRecreateWorker() {
            if (this._failed || !this._blobUrl) return;
            try {
                const worker = new Worker(this._blobUrl);
                this.workers.push({ worker: worker, busy: false });
            } catch (_) {
                // 重建失败（如 file:// 限制），不改变池状态
            }
        }

        /** 终止所有 Worker 并释放 Blob URL */
        terminate() {
            for (let i = 0; i < this.workers.length; i++) {
                this.workers[i].worker.terminate();
            }
            if (this._blobUrl) {
                URL.revokeObjectURL(this._blobUrl);
                this._blobUrl = null;
            }
            this.workers = [];
            this.queue = [];
        }
    }

    /** Worker 池全局单例（懒初始化） */
    let _workerPool = null;

    /**
     * 获取 Worker 池单例
     * @returns {WorkerPool}
     */
    function getWorkerPool() {
        if (!_workerPool) {
            const count = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
            _workerPool = new WorkerPool(count);
        }
        return _workerPool;
    }

    // =============================================
    // 图片处理核心函数
    // =============================================

    /** 共享还原逻辑：从 original 备份恢复，processSingleImage 和 processOneImageConcurrent 共用 */
    async function restoreImageData(imageData) {
        const originalBlob = await storage.get(`original_${imageData.id}`);
        if (!originalBlob) throw new Error('原始图片数据不存在');
        await storage.set(`current_${imageData.id}`, originalBlob);
        imageData.scrambleLevel = 0;
        imageData.format = (originalBlob.type || 'image/png').replace('image/', '').toUpperCase();
        imageData.processed = false;
        imageData.size = originalBlob.size;
        await updateThumbnail(imageData.id, originalBlob);
        updateImageInfo(imageData.id);
    }

    /**
     * 处理单张图片（串行版本，Worker 不可用时降级使用）
     */
    async function processSingleImage(imageData, operation) {
        if (operation === 'restore') { await restoreImageData(imageData); return; }

        // 获取当前图片 Blob
        const sourceBlob = await storage.get(`current_${imageData.id}`);
        if (!sourceBlob) throw new Error('图片数据不存在');

        // 通过 ImageBitmap 加载到 canvas
        const bitmap = await createImageBitmap(sourceBlob, { premultiplyAlpha: 'none' });
        const canvas = getCanvasFromPool(bitmap.width, bitmap.height);
        try {
            const ctx = drawBitmapToCanvas(canvas, bitmap, { willReadFrequently: true });

            // 获取像素数据
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const totalPixels = canvas.width * canvas.height;
            const { curve, shiftedCurve } = getCachedCurve(canvas.width, canvas.height);

            const srcU32 = new Uint32Array(imgData.data.buffer, imgData.data.byteOffset, totalPixels);
            const newImageData = new ImageData(canvas.width, canvas.height);
            const dstU32 = new Uint32Array(newImageData.data.buffer);

            const to = operation === 'encrypt' ? shiftedCurve : curve;
            const from = operation === 'encrypt' ? curve : shiftedCurve;
            for (let i = 0; i < totalPixels; i++) {
                dstU32[to[i]] = srcU32[from[i]];
            }
            imageData.scrambleLevel = (imageData.scrambleLevel || 0) + (operation === 'encrypt' ? 1 : -1);

            ctx.putImageData(newImageData, 0, 0);

            // 生成新 Blob (PNG 格式存储)
            const newBlob = await canvasToBlobPromise(canvas, 'image/png');
            await storage.set(`current_${imageData.id}`, newBlob);

            imageData.format = 'PNG';
            imageData.processed = true;
            imageData.size = newBlob.size;

            await updateThumbnail(imageData.id, newBlob);
            updateImageInfo(imageData.id);
        } finally {
            if (bitmap) bitmap.close();
            releaseCanvasToPool(canvas);
        }
    }

    /**
     * 并发单张图片处理（Worker 池版本）
     * 阶段 1（主线程）：storage.get → createImageBitmap → getImageData → 提取 srcBuffer
     * 阶段 2（Worker ）：像素映射循环 dst[to[i]] = src[from[i]]
     * 阶段 3（主线程）：new ImageData → putImageData → encode PNG → storage.set → updateThumbnail
     * @param {Object} imageData - 图片数据对象
     * @param {string} operation - 操作类型：'encrypt'|'decrypt'|'restore'
     * @param {WorkerPool} pool - Worker 池实例
     */
    async function processOneImageConcurrent(imageData, operation, pool) {
        if (operation === 'restore') { await restoreImageData(imageData); return; }

        // --- 阶段 1：I/O 读取 + 解码（主线程）---
        const sourceBlob = await storage.get('current_' + imageData.id);
        if (!sourceBlob) throw new Error('图片数据不存在');

        const bitmap = await createImageBitmap(sourceBlob, { premultiplyAlpha: 'none' });
        const canvas = getCanvasFromPool(bitmap.width, bitmap.height);
        try {
            const ctx = drawBitmapToCanvas(canvas, bitmap, { willReadFrequently: true });
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const totalPixels = canvas.width * canvas.height;
            // 分离 ArrayBuffer（getImageData 返回的 buffer 可能与 Canvas 共享，不能直接 Transfer）
            // 注意：必须考虑 byteOffset，getImageData 的 ArrayBuffer 可能并非从偏移 0 开始
            const srcBuffer = imgData.data.buffer.slice(imgData.data.byteOffset, imgData.data.byteOffset + imgData.data.byteLength);

            // --- 阶段 2：像素映射（Worker 池）---
            const curveResult = getCachedCurve(canvas.width, canvas.height);
            const dstBuffer = await pool.process({
                srcBuffer: srcBuffer,
                curve: curveResult.curve,
                shiftedCurve: curveResult.shiftedCurve,
                totalPixels: totalPixels,
                operation: operation
            });

            // --- 阶段 3：写回 + 编码 + 存储（主线程）---
            const newImageData = new ImageData(
                new Uint8ClampedArray(dstBuffer),
                canvas.width,
                canvas.height
            );
            ctx.putImageData(newImageData, 0, 0);

            const newBlob = await canvasToBlobPromise(canvas, 'image/png');
            await storage.set('current_' + imageData.id, newBlob);

            imageData.scrambleLevel = (imageData.scrambleLevel || 0) + (operation === 'encrypt' ? 1 : -1);
            imageData.format = 'PNG';
            imageData.processed = true;
            imageData.size = newBlob.size;

            await updateThumbnail(imageData.id, newBlob);
            updateImageInfo(imageData.id);
        } finally {
            if (bitmap) bitmap.close();
            releaseCanvasToPool(canvas);
        }
    }

    /**
     * 并发批量处理图片（Worker 池 + 并发 I/O）
     * 替代 forEachTargetImage 中串行 await，实现流水线重叠
     * 按 processOrder 顺序遍历，并发数 = Worker 数量 × 2
     * @param {string} operation - 操作类型：'encrypt'|'decrypt'|'restore'
     * @returns {Promise<boolean|null>} true=处理完成，null=无目标（计时器未启动）
     */
    async function processBatchConcurrent(operation) {
        const targetIds = guardEmptySelection();
        if (!targetIds) return null;


        const targetSet = new Set(targetIds);

        // 按 processOrder 顺序收集目标图片
        // 使用 Map 快照防御 images 数组在构建期间被外部修改（如并发删除导致索引失效）
        // 与 forEachTargetImage 的 Map 快照模式保持一致
        const imageMap = new Map(images.map(item => [item.id, item]));
        const tasks = [];
        const seen = new Set();
        for (let i = 0; i < processOrder.length; i++) {
            const idx = processOrder[i];
            // 防御性边界检查：processOrder 索引可能因 images 变更而越界
            if (idx < 0 || idx >= images.length) continue;
            const imgData = images[idx];
            if (!imgData || !targetSet.has(imgData.id) || seen.has(imgData.id)) continue;
            seen.add(imgData.id);
            tasks.push(imgData);
        }
        // 补充 processOrder 中可能遗漏的目标图片（防御 processOrder 未及时同步的场景）
        for (const id of targetIds) {
            if (seen.has(id)) continue;
            const imgData = imageMap.get(id);
            if (imgData) {
                tasks.push(imgData);
                seen.add(id);
            }
        }

        if (tasks.length === 0) {
            showTempStatus('⚠️ 请先选择图片');
            return null;
        }

        batchStatusEl.innerHTML = '<div class="loading"></div> 正在处理 ' + tasks.length + ' 张图片...';

        startProcessingTimer(tasks.length, operation);

        const pool = getWorkerPool();

        // Worker 池不可用（如 file:// 协议下 Chrome 拒绝 Worker），降级到串行处理
        if (pool.failed) {
            logWarn('Worker 池', 'Worker 不可用，降级到串行处理');
            let successCount = 0, failureCount = 0;
            for (let i = 0; i < tasks.length; i++) {
                const imageData = tasks[i];
                const item = getImageItemEl(imageData.id);
                const overlay = item ? showProcessingOverlay(item) : null;
                try {
                    await processSingleImage(imageData, operation);
                    successCount++;
                } catch (error) {
                    failureCount++;
                    logError(imageData.name, ('处理失败: ' + (error.message || '未知错误')));
                } finally {
                    if (overlay) overlay.remove();
                    await updateProgressStatus(batchStatusEl, i + 1, tasks.length, '处理');
                }
            }
            showBatchStatus(successCount, failureCount, '处理');
            return true;
        }

        // 并发限制：Worker 数量的 2 倍（Worker 跑像素时，主线程可预读/编码下一张）
        const CONCURRENCY = Math.max(1, pool.size * 2);
        const semaphore = new Semaphore(CONCURRENCY);

        let successCount = 0, failureCount = 0;
        let completed = 0;

        const promises = tasks.map(function(imageData) {
            return (async function() {
                const item = getImageItemEl(imageData.id);
                const overlay = item ? showProcessingOverlay(item) : null;

                await semaphore.acquire();
                try {
                    await processOneImageConcurrent(imageData, operation, pool);
                    successCount++;
                } catch (error) {
                    failureCount++;
                    logError(imageData.name, ('处理失败: ' + (error.message || '未知错误')));
                } finally {
                    if (overlay) overlay.remove();
                    completed++;
                    await updateProgressStatus(batchStatusEl, completed, tasks.length, '处理');
                    semaphore.release();
                }
            })();
        });

        await Promise.allSettled(promises);

        showBatchStatus(successCount, failureCount, '处理');
        return true;
    }
