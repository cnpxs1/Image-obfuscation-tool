// 图片混淆工具 — ZIP 导入导出（依赖 fflate）
// ==================== ZIP 文件处理功能 ====================

    /**
     * 解压 ZIP 文件并添加其中的图片
     * @param {File} zipFile - ZIP 文件对象
     * @returns {Promise<{added: number, errors: Array}>}
     */
    async function importZip(zipFile) {
        if (typeof fflate === 'undefined') {
            try {
                // Promise.race 超时防护：防止 CDN 请求挂起导致 Promise 永久 pending
                await Promise.race([
                    window.fflateResources.promise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error(t('log.msg.fflateTimeout', { sec: 12 }))), 12000))
                ]);
            } catch (e) {
                logError(zipFile.name, t('log.msg.fflateNotLoaded'));
                return { added: 0, errors: [{ name: zipFile.name, error: t('log.msg.fflateLoadError') }] };
            }
        }

        batchStatusEl.innerHTML = '<div class="loading"></div> ' + t('progress.parsingZip');

        try {
            const zipData = new Uint8Array(await zipFile.arrayBuffer());
            /** @type {Record<string, Uint8Array>} */
            const unzipped = await new Promise((resolve, reject) =>
                fflate.unzip(zipData, (err, data) => err ? reject(err) : resolve(data))
            );

            // 第一趟：校验并收集有效图片条目
            const entries = [];
            const errors = [];
            for (const [filename, fileData] of Object.entries(unzipped)) {
                if (filename.endsWith('/')) continue;
                const ext = filename.split('.').pop()?.toLowerCase();
                if (!VALID_EXTENSIONS.includes(ext)) continue;
                const baseName = filename.split('/').pop();
                if (!baseName) continue;

                if (!isValidImageBytes(fileData)) {
                    errors.push({ name: baseName, error: t('log.msg.invalidImageContent') });
                    logWarn(baseName, t('log.msg.extMismatch'));
                    continue;
                }
                entries.push({ fileData, baseName, ext });
            }

            if (entries.length === 0) {
                showTempStatus(t('zip.noImages'), 3000);
                return { added: 0, errors };
            }

            // 第二趟：逐张准备数据，再批量渲染 DOM
            batchStatusEl.innerHTML = '<div class="loading"></div> ' + t('progress.addingZip', { n: entries.length });
            const batch = [];
            for (let i = 0; i < entries.length; i++) {
                const { fileData, baseName, ext } = entries[i];
                try {
                    const mime = MIME_MAP[ext] || 'application/octet-stream';
                    const file = new File([fileData], baseName, { type: mime });
                    batch.push(await prepareImageData(file));
                } catch (e) {
                    errors.push({ name: baseName, error: e.message });
                    logError(baseName, t('log.msg.zipAddFailed', { msg: e.message }));
                }
                await updateProgressStatus(batchStatusEl, i + 1, entries.length, 'action.add');
            }
            commitImageBatch(batch);

            showTempStatus(t('zip.added', { n: batch.length, extra: errors.length ? t('zip.addedFailedPart', { n: errors.length }) : '' }), 3000);
            return { added: batch.length, errors };

        } catch (error) {
            showTempStatus(t('zip.extractFailed', { msg: error.message }), 3000);
            logError(zipFile.name, t('log.msg.zipExtractFailed', { msg: error.message }));
            return { added: 0, errors: [{ name: zipFile.name, error: error.message }] };
        }
    }

    /**
     * 打包下载选中的图片为 ZIP 文件（流式压缩，逐张处理避免内存堆积）
     * @param {string} format - 保存格式：'png'|'jpg'|'bmp'|'webp'
     * @returns {Promise<void>}
     */
    async function saveImagesAsZip(format) {
        if (typeof fflate === 'undefined') {
            logError(t('log.category.fflate'), t('log.msg.zipPackUnavailable'));
            showTempStatus(t('zip.packUnavailable'), 3000);
            return;
        }

        const targetIds = guardEmptySelection();
        if (!targetIds) return;


        batchStatusEl.innerHTML = '<div class="loading"></div> ' + t('progress.preparingZip', { n: targetIds.length });

        const targetFormat = format.toLowerCase();
        const webpSupported = targetFormat === 'webp' ? await isWebPSupported() : false;

        // 流式 ZIP：数据通过 ZipDeflate 逐张推入，不在内存中保留所有图片原始数据
        const zipChunks = [];
        let streamError = null;
        const zip = new fflate.Zip((err, data) => {
            if (err) { streamError = err; return; }
            zipChunks.push(data);
        });

        let successCount = 0;
        let failureCount = 0;

        const usedNames = new Set();

        for (let i = 0; i < targetIds.length; i++) {
            const imageId = targetIds[i];
            const imageData = images.find(item => item.id === imageId);
            if (!imageData) {
                failureCount++;
                continue;
            }

            try {
                let blob = await storage.get(`current_${imageData.id}`);
                if (!blob) {
                    failureCount++;
                    logError(imageData.name, t('error.dataMissing'));
                    continue;
                }

                if (targetFormat === 'webp' && !webpSupported) {
                    failureCount++;
                    logError(imageData.name, t('error.webpUnsupported'));
                    continue;
                }

                const outputBlob = await convertImageBlob(blob, targetFormat);
                blob = null;

                const ext = getOutputExtension(targetFormat);
                const statusSuffix = getStatusInfo(imageData.scrambleLevel).suffix;
                let fileName = `${imageData.name.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]/g, '_')}_${statusSuffix}.${ext}`;
                // 同名冲突检测：同一 ZIP 内不允许重复文件名，重名时追加 (2)、(3)…
                if (usedNames.has(fileName)) {
                    let counter = 2;
                    const baseName = fileName.slice(0, -(ext.length + 1));
                    while (usedNames.has(`${baseName}_${counter}.${ext}`)) { counter++; }
                    fileName = `${baseName}_${counter}.${ext}`;
                }
                usedNames.add(fileName);

                const arrayBuffer = await outputBlob.arrayBuffer();
                const fileData = new Uint8Array(arrayBuffer);

                // 大文件用 AsyncZipDeflate（Web Worker，不阻塞主线程），小文件用 ZipDeflate
                if (fileData.length >= 160000) {
                    await new Promise((resolve, reject) => {
                        const entry = new fflate.AsyncZipDeflate(fileName, { level: 1 });
                        zip.add(entry);
                        const zipOndata = entry.ondata;
                        entry.ondata = function(err, chunk, final_) {
                            if (!zipOndata) {
                                reject(new Error(t('log.msg.fflateInternalError')));
                                return;
                            }
                            zipOndata.call(this, err, chunk, final_);
                            if (err) reject(err);
                            else if (final_) resolve();
                        };
                        entry.push(fileData, true);
                    });
                } else {
                    const entry = new fflate.ZipDeflate(fileName, { level: 1 });
                    zip.add(entry);
                    entry.push(fileData, true);
                }

                successCount++;

                // 每 5 张让出主线程并更新进度（已压缩数据保留在 zipChunks 中）
                if ((i + 1) % 5 === 0 || i === targetIds.length - 1) {
                    await updateProgressStatus(batchStatusEl, i + 1, targetIds.length, 'action.compress');
                }

            } catch (error) {
                failureCount++;
                logError(imageData.name, t('log.msg.zipPackFailed', { msg: error.message || t('error.unknown') }));
            }

            // 流错误不可恢复，立即终止循环
            if (streamError) break;
        }

        if (streamError) {
            showTempStatus(t('zip.streamError'), 3000);
            return;
        }

        if (successCount === 0) {
            showTempStatus(t('zip.noImagesToPack'), 3000);
            return;
        }

        batchStatusEl.innerHTML = '<div class="loading"></div> ' + t('progress.finishingZip');
        await new Promise(resolve => setTimeout(resolve, 10));

        try {
            // 结束 ZIP 流（写入中央目录）
            zip.end();

            // 合并所有压缩块
            const totalLength = zipChunks.reduce((sum, c) => sum + c.length, 0);
            const zipData = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of zipChunks) {
                zipData.set(chunk, offset);
                offset += chunk.length;
            }
            zipChunks.length = 0;

            const zipBlob = new Blob([zipData], { type: 'application/zip' });
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            downloadBlob(zipBlob, t('zip.fileNamePrefix') + '_' + timestamp + '.zip');

            showTempStatus(t('zip.packDone', { n: successCount, extra: failureCount ? t('zip.packFailedPart', { n: failureCount }) : '' }), 3000);

        } catch (error) {
            showTempStatus(t('zip.createFailed', { msg: error.message }), 3000);
            logError(t('log.category.zipPack'), t('log.msg.zipCreateFailed', { msg: error.message }));
        }
    }
