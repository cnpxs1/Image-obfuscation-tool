// 图片混淆工具 — 进度条与状态显示

    /** 获取当前操作的目标图片 ID 列表（优先选中，否则全部） */
    function getTargetImageIds() {
        return selectedImages.size > 0
            ? Array.from(selectedImages)
            : images.map(item => item.id);
    }

    /** 处理中守卫：阻止并发操作，提示用户等待 */
    function guardProcessing() {
        if (isProcessing) {
            alert('正在处理中，请稍后...');
            return true;
        }
        return false;
    }

    /** 在 batchStatus 区域显示临时消息，默认 2 秒后清除 */
    function showTempStatus(message, duration = 2000) {

        batchStatusEl.innerHTML = message;
        setTimeout(() => { batchStatusEl.innerHTML = ''; }, duration);
    }

    /** 首次创建进度 DOM 或复用已创建的节点，仅更新文本和宽度 */
    function updateProgressStatus(statusEl, current, total, actionText, delay = 0) {
        const pct = Math.round(current / total * 100);
        const cached = statusEl._progressEls;
        if (cached && cached.fill.isConnected) {
            cached.text.nodeValue = `正在${actionText} ${current}/${total} (${pct}%)`;
            cached.fill.style.width = `${pct}%`;
        } else {
            const text = document.createTextNode('');
            const bar = document.createElement('div');
            bar.className = 'progress-bar';
            const fill = document.createElement('div');
            fill.className = 'progress-fill';
            bar.appendChild(fill);
            text.nodeValue = `正在${actionText} ${current}/${total} (${pct}%)`;
            fill.style.width = `${pct}%`;
            statusEl.textContent = '';
            statusEl.appendChild(text);
            statusEl.appendChild(bar);
            statusEl._progressEls = { text, fill };
        }
        if (delay > 0) {
            return new Promise(resolve => setTimeout(resolve, delay));
        }
        return Promise.resolve();
    }
