// 图片混淆工具 — 视图模式管理（网格/列表切换）
// ==================== 视图模式管理 ====================
// var 前置声明：view-mode.js 在 app.js 之前加载，用 var 消除隐式声明警告
// app.js 中同名 var 声明会被视为同一变量（var 允许跨 script 重复声明）
var currentViewMode = 'grid'; // 'grid' 或 'list'
var isSwitchingViewMode = false;
/** @type {ImageLazyLoader|null} 图片缩略图懒加载管理器 */
var imageLazyLoader = null;

/**
 * 加载保存的视图模式偏好
 */
function loadViewModePreference() {
    const saved = loadSetting('imageViewMode');
    if (saved === 'grid' || saved === 'list') {
        currentViewMode = saved;
    } else {
        currentViewMode = 'grid';
    }
    updateViewModeButtonUi();
}

/**
 * 保存视图模式偏好
 */
function saveViewModePreference() {
    saveSetting('imageViewMode', currentViewMode);
}

/**
 * 更新切换按钮的图标高亮状态
 */
function updateViewModeButtonUi() {
    const gridIcon = document.getElementById('grid-view-icon');
    const listIcon = document.getElementById('list-view-icon');
    if (!gridIcon || !listIcon) return;

    const gridPath = gridIcon.querySelector('.view-icon-path');
    const listPath = listIcon.querySelector('.view-icon-path');

    if (currentViewMode === 'grid') {
        gridIcon.style.opacity = '1';
        listIcon.style.opacity = '0.4';
        if (gridPath) gridPath.setAttribute('stroke', '#333');
        if (listPath) listPath.setAttribute('stroke', '#999');
    } else {
        gridIcon.style.opacity = '0.4';
        listIcon.style.opacity = '1';
        if (gridPath) gridPath.setAttribute('stroke', '#999');
        if (listPath) listPath.setAttribute('stroke', '#333');
    }
}

/**
 * 获取占位符 SVG
 * ./img/placeholder.svg
 * @returns {string} SVG 字符串
 */
function getPlaceholderSvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="252" height="198" viewBox="0 0 252 198"><path fill="#fa4" d="M222.6,53.625c0,13.669-11.2824,24.75-25.2,24.75s-25.2-11.081-25.2-24.75,11.2824-24.75,25.2-24.75,25.2,11.081,25.2,24.75Z"/><path fill="#1a6" d="M91.476,87.615c-11.0428-9.638-27.6811-9.638-38.724,0L9,127.3013v61.6987h83.1633l55.5927-50.4-56.28-50.985Z"/><path fill="#fa4" d="M160.188,127.2975h0s-12.4321,11.3024-12.4321,11.3024l-55.5927,50.4h150.8368v-24.8636l-40.8122-36.8388c-12.0145-10.3562-29.9854-10.3563-41.9998,0Z"/><path fill="#4d4d4d" d="M242.9981,0H9.0019C4.0303,0,0,4.0303,0,9.0019v179.9962c0,4.9716,4.0303,9.0019,9.0019,9.0019h233.9962c4.9716,0,9.0019-4.0303,9.0019-9.0019V9.0019c0-4.9716-4.0303-9.0019-9.0019-9.0019ZM243,189H9V9h234v180Z"/></svg>';
}

/**
 * 切换视图模式（带并发锁，防止快速连续点击导致状态混乱）
 */
async function switchViewMode() {
    if (isSwitchingViewMode) return;
    isSwitchingViewMode = true;
    try {
        // 切换模式
        currentViewMode = currentViewMode === 'grid' ? 'list' : 'grid';
        saveViewModePreference();
        updateViewModeButtonUi();

        // 遍历所有现有图片项，动态修改其显示样式和缩略图内容
        const items = document.querySelectorAll('.image-item');
        for (const imageItem of items) {
            const imageId = imageItem.dataset.id;
            const imageData = images.find(item => item.id === imageId);
            if (!imageData) continue;

            // 更新 imageItem 的类名
            if (currentViewMode === 'list') {
                imageItem.classList.add('list-view');
            } else {
                imageItem.classList.remove('list-view');
            }

            // 获取缩略图容器
            const thumbnailContainer = imageItem.querySelector('.thumbnail-container');
            if (!thumbnailContainer) continue;

            // 根据当前模式重新构建缩略图内容
            if (currentViewMode === 'grid') {
                // 网格模式：无已加载缩略图则强制重置懒加载状态并重新注册
                const existingCanvas = thumbnailContainer.querySelector('.thumbnail-canvas');
                if (!existingCanvas) {
                    if (!thumbnailContainer.querySelector('.thumbnail-placeholder')) {
                        const placeholder = document.createElement('div');
                        placeholder.className = 'thumbnail-placeholder';
                        placeholder.innerHTML = PLACEHOLDER_SVG;
                        placeholder.title = t('view.loading');
                        thumbnailContainer.innerHTML = '';
                        thumbnailContainer.appendChild(placeholder);
                    }
                    delete imageItem.dataset.lazyLoaded;
                    if (imageLazyLoader) {
                        imageLazyLoader.unobserve(imageId);
                        imageLazyLoader.observe(imageItem, imageData);
                    }
                }
            } else {
                // 列表模式：显示占位符，取消懒加载观察，清除懒加载标记
                if (imageLazyLoader) {
                    imageLazyLoader.unobserve(imageId);
                }
                delete imageItem.dataset.lazyLoaded;
                let placeholder = thumbnailContainer.querySelector('.thumbnail-placeholder');
                if (!placeholder) {
                    placeholder = document.createElement('div');
                    placeholder.className = 'thumbnail-placeholder';
                    placeholder.innerHTML = getPlaceholderSvg();
                    placeholder.title = t('view.clickToPreview');
                    thumbnailContainer.innerHTML = '';
                    thumbnailContainer.appendChild(placeholder);
                }
            }
        }

        // 显示提示信息
        showTempStatus(currentViewMode === 'grid' ? t('toast.gridMode') : t('toast.listMode'));
    } finally {
        isSwitchingViewMode = false;
    }
}
