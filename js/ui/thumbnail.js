// 图片混淆工具 — 缩略图刷新与图片项 DOM 创建
// =============================================
// 刷新缩略图 + 创建图片项
// =============================================

    /**
     * 创建图片项的 DOM 元素（纯工厂函数，不追加到 DOM）
     * 将 DOM 创建与挂载分离，支持批量渲染优化
     * @param {Object} imageData - 图片数据对象
     * @returns {HTMLDivElement} 完整的 .image-item 元素
     */
    function createImageItem(imageData) {
        const item = document.createElement('div');
        item.className = `image-item ${currentViewMode === 'list' ? 'list-view' : ''}`;
        item.dataset.id = imageData.id;

        // 创建复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'select-checkbox';
        checkbox.addEventListener('change', (event) => {
            event.stopPropagation();
            toggleSelect(imageData.id, event);
        });
        item.appendChild(checkbox);

        // 创建缩略图容器
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';
        thumbnailContainer.onclick = () => showPreview(imageData.id);

        // 统一先放置占位符，由懒加载器在进入视口时替换为缩略图
        const placeholder = document.createElement('div');
        placeholder.className = 'thumbnail-placeholder';
        if (currentViewMode === 'grid') {
            placeholder.innerHTML = PLACEHOLDER_SVG;
            placeholder.title = '加载中…';
        } else {
            placeholder.innerHTML = getPlaceholderSvg();
            placeholder.title = '点击预览图片';
        }
        thumbnailContainer.appendChild(placeholder);
        item.appendChild(thumbnailContainer);

        // 获取状态文本和样式
        const statusInfo = getStatusInfo(imageData.scrambleLevel);
        const statusText = statusInfo.text;
        const statusClass = statusInfo.className;

        // 创建信息区域
        const infoDiv = document.createElement('div');
        infoDiv.className = 'image-info';
        infoDiv.id = `info-${imageData.id}`;
        infoDiv.innerHTML = `
            <div class="text-multiline" style="font-weight: bold;">${escapeHtml(imageData.name)}</div>
            <div class="image-info-row">
                <span>${imageData.width > 0 ? `${imageData.width}×${imageData.height}` : '<span style="color:#999;">尺寸未知</span>'}</span>
            </div>
            <div class="file-size">格式：${imageData.format || 'N/A'} | ${formatFileSize(imageData.size)}</div>
            <div class="status-badge ${statusClass}">${statusText}</div>
        `;
        item.appendChild(infoDiv);

        // 创建操作按钮区域
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'image-actions';
        actionsDiv.innerHTML = `
            <button class="action-btn" data-operation="encrypt">混淆</button>
            <button class="action-btn" data-operation="decrypt">解混淆</button>
            <button class="action-btn" data-operation="restore">还原</button>
            <div class="action-group">
                <button class="action-btn delete-btn" data-operation="delete">删除</button>
                <button class="action-btn" data-operation="save">保存</button>
            </div>
        `;
        item.appendChild(actionsDiv);

        // 设置选中状态（如果之前已选中）
        if (selectedImages.has(imageData.id)) {
            checkbox.checked = true;
            item.classList.add('selected');
        }

        // 缓存 DOM 引用以便后续更新
        imageData.domCache = {
            sizeRow: infoDiv.querySelector('.image-info-row'),
            fileSize: infoDiv.querySelector('.file-size'),
            statusBadge: infoDiv.querySelector('.status-badge')
        };

        return item;
    }

    // =============================================
    // 刷新缩略图功能
    // =============================================

    let isRefreshingThumbnails = false;  // 刷新锁，防止并发刷新

    /**
     * 刷新所有图片的缩略图
     * 从存储中重新获取每张图片的 current blob 并重绘缩略图
     */
    async function refreshAllThumbnails() {
        // 列表模式下不执行缩略图刷新
        if (currentViewMode === 'list') {
            showTempStatus('ℹ️ 当前为列表模式，不显示缩略图，无需刷新');
            return;
        }

        const refreshBtn = document.getElementById('refresh-list-btn');

        // 防止重复刷新
        if (isRefreshingThumbnails) {
            logLog('刷新缩略图正在进行中，请稍后再试');
            return;
        }

        // 检查是否有图片
        if (images.length === 0) {
            showTempStatus('⚠️ 没有图片需要刷新');
            return;
        }

        isRefreshingThumbnails = true;
        // 禁用按钮防止误操作
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.style.opacity = '0.5';
            refreshBtn.style.cursor = 'not-allowed';
        }

        // 创建快照避免数组变化导致索引错乱
        const snapshot = [...images];

        const totalCount = snapshot.length;
        let successCount = 0;
        let failureCount = 0;

        batchStatusEl.innerHTML = `<div class="loading"></div> 正在刷新缩略图 (0/${totalCount})...`;

        try {
            // 串行刷新，避免大量并发导致内存压力
            for (let i = 0; i < totalCount; i++) {
                const imageData = snapshot[i];
                if (!imageData) continue;

                try {
                    const blob = await storage.get(`current_${imageData.id}`);
                    if (blob) {
                        // 清除旧缩略图缓存，确保进入视口时重新生成
                        await storage.delete(`thumb_${imageData.id}`);
                        await updateThumbnail(imageData.id, blob);
                        successCount++;
                    } else {
                        logWarn(imageData.name, 'Blob 数据不存在');
                        failureCount++;
                    }
                } catch (error) {
                    failureCount++;
                    logError(imageData.name, `刷新缩略图失败: ${error.message || '未知错误'}`);
                }

                // 更新进度显示
                await updateProgressStatus(batchStatusEl, i + 1, totalCount, '刷新缩略图', 10);
            }

            showBatchStatus(successCount, failureCount, '刷新');

            const logFn = failureCount === 0 ? logLog : failureCount === totalCount ? logError : logWarn;
            logFn('缩略图刷新', `缩略图刷新完成：成功 ${successCount}，失败 ${failureCount}`);
        } catch (error) {
            logError('缩略图刷新', `刷新缩略图过程出错: ${error.message || error}`);
            showTempStatus('❌ 刷新缩略图失败', 3000);
        } finally {
            isRefreshingThumbnails = false;
            // 恢复按钮状态
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.style.opacity = '';
                refreshBtn.style.cursor = '';
            }
        }
    }
