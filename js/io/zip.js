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
                    new Promise((_, reject) => setTimeout(() => reject(new Error('fflate 加载超时（12s）')), 12000))
                ]);
            } catch (e) {
                logError(zipFile.name, 'fflate 库未加载，无法解压 ZIP');
                return { added: 0, errors: [{ name: zipFile.name, error: 'fflate 库未加载' }] };
            }
        }

        batchStatusEl.innerHTML = `<div class="loading"></div> 正在解析 ZIP 文件...`;

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
                    errors.push({ name: baseName, error: '文件内容不是有效的图片格式' });
                    logWarn(baseName, '文件扩展名与内容不匹配，已跳过');
                    continue;
                }
                entries.push({ fileData, baseName, ext });
            }

            if (entries.length === 0) {
                showTempStatus('⚠️ ZIP 文件中未找到支持的图片格式', 3000);
                return { added: 0, errors };
            }

            // 第二趟：逐张准备数据，再批量渲染 DOM
            batchStatusEl.innerHTML = `<div class="loading"></div> 正在添加 ${entries.length} 张图片...`;
            const batch = [];
            for (let i = 0; i < entries.length; i++) {
                const { fileData, baseName, ext } = entries[i];
                try {
                    const mime = MIME_MAP[ext] || 'application/octet-stream';
                    const file = new File([fileData], baseName, { type: mime });
                    batch.push(await prepareImageData(file));
                } catch (e) {
                    errors.push({ name: baseName, error: e.message });
                    logError(baseName, `添加失败: ${e.message}`);
                }
                await updateProgressStatus(batchStatusEl, i + 1, entries.length, '添加图片');
            }
            commitImageBatch(batch);

            showTempStatus(`✅ 已从 ZIP 添加 ${batch.length} 张图片${errors.length ? `，${errors.length} 个文件失败` : ''}`, 3000);
            return { added: batch.length, errors };

        } catch (error) {
            showTempStatus(`❌ ZIP 解压失败: ${error.message}`, 3000);
            logError(zipFile.name, `ZIP 解压失败: ${error.message}`);
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
            logError('fflate', 'fflate 未加载，ZIP 打包功能不可用');
            showTempStatus('❌ ZIP 打包功能不可用（fflate 库未加载）', 3000);
            return;
        }

        const targetIds = guardEmptySelection();
        if (!targetIds) return;


        batchStatusEl.innerHTML = `<div class="loading"></div> 正在准备打包 ${targetIds.length} 张图片...`;

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
                    logError(imageData.name, '图片数据不存在');
                    continue;
                }

                if (targetFormat === 'webp' && !webpSupported) {
                    failureCount++;
                    logError(imageData.name, '浏览器不支持 WebP');
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
                                reject(new Error('fflate 内部错误：AsyncZipDeflate ondata 回调未设置'));
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
                    await updateProgressStatus(batchStatusEl, i + 1, targetIds.length, '压缩');
                }

            } catch (error) {
                failureCount++;
                logError(imageData.name, `打包失败: ${error.message || '未知错误'}`);
            }

            // 流错误不可恢复，立即终止循环
            if (streamError) break;
        }

        if (streamError) {
            showTempStatus('❌ ZIP 流写入错误，打包中断', 3000);
            return;
        }

        if (successCount === 0) {
            showTempStatus('❌ 打包失败，没有可用的图片', 3000);
            return;
        }

        batchStatusEl.innerHTML = `<div class="loading"></div> 正在完成 ZIP 文件...`;
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
            downloadBlob(zipBlob, `混淆图片_${timestamp}.zip`);

            showTempStatus(`✅ 打包完成，已下载 ${successCount} 张图片${failureCount ? `，${failureCount} 张失败` : ''}`, 3000);

        } catch (error) {
            showTempStatus(`❌ ZIP 创建失败: ${error.message}`, 3000);
            logError('ZIP打包', `创建失败: ${error.message}`);
        }
    }
