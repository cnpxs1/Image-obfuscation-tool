// 图片混淆工具 — 缩略图懒加载（IntersectionObserver）
// =============================================
// 图片懒加载管理器（IntersectionObserver）
// =============================================

/**
 * 基于 IntersectionObserver 的图片缩略图懒加载器
 * 仅当图片项进入视口时才加载缩略图，减少初始渲染开销
 */
class ImageLazyLoader {
    /** @param {{ rootMargin?: string, threshold?: number }} [options] */
    constructor(options = {}) {
        this.loaded = new Set();
        this.loading = new Set();
        this.queued = new Map();
        this.rootMargin = options.rootMargin || '200px';
        this.threshold = options.threshold || 0.01;

        this.observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    const item = /** @type {HTMLElement} */ (entry.target);
                    void this._loadItem(item);
                }
            }
        }, {
            rootMargin: this.rootMargin,
            threshold: this.threshold
        });
    }

    /**
     * 注册图片项到观察列表
     * @param {HTMLElement} item - .image-item 元素
     * @param {Object} imageData - 图片数据对象
     */
    observe(item, imageData) {
        const id = imageData.id;
        if (this.loaded.has(id) || this.loading.has(id)) return;
        this.queued.set(id, { item, imageData });
        this.observer.observe(item);
    }

    /**
     * 取消观察指定图片项
     * @param {string} imageId - 图片 ID
     */
    unobserve(imageId) {
        this.loaded.delete(imageId);
        this.loading.delete(imageId);
        const entry = this.queued.get(imageId);
        if (entry) {
            this.observer.unobserve(entry.item);
            this.queued.delete(imageId);
        }
    }

    /**
     * 断开观察器并清空所有状态
     */
    disconnect() {
        this.observer.disconnect();
        this.loaded.clear();
        this.loading.clear();
        this.queued.clear();
    }

    /** @private */
    async _loadItem(item) {
        const imageId = item.dataset.id;
        if (!imageId || this.loaded.has(imageId) || this.loading.has(imageId)) return;

        const entry = this.queued.get(imageId);
        if (!entry) return;

        const { imageData } = entry;
        const thumbnailContainer = item.querySelector('.thumbnail-container');
        if (!thumbnailContainer) {
            this.observer.unobserve(item);
            this.queued.delete(imageId);
            return;
        }

        // 列表模式下跳过，不标记 loaded（等切回网格时重新 observe）
        if (currentViewMode === 'list') {
            this.observer.unobserve(item);
            this.queued.delete(imageId);
            return;
        }

        // 检查是否已有缩略图 canvas
        if (thumbnailContainer.querySelector('.thumbnail-canvas')) {
            this.observer.unobserve(item);
            this.queued.delete(imageId);
            return;
        }

        // 标记加载中，取消观察
        this.observer.unobserve(item);
        this.queued.delete(imageId);
        this.loading.add(imageId);

        try {
            const canvas = await createAndDrawThumbnail(thumbnailContainer, imageData);
            // 加载成功：替换占位符为缩略图
            const placeholder = thumbnailContainer.querySelector('.thumbnail-placeholder');
            if (placeholder) placeholder.remove();
            thumbnailContainer.appendChild(canvas);
            item.dataset.lazyLoaded = 'true';
            this.loaded.add(imageId);
        } catch (e) {
            logWarn('懒加载', `缩略图加载失败: ${imageData.name} - ${e.message}`);
            // 保留 placeholder，允许视图切换后重新加载
        } finally {
            this.loading.delete(imageId);
        }
    }
}
