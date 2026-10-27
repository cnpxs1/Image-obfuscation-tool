// 基于 dist/static 生成完全自包含的单文件 HTML
// 用法：node scripts/build-single.mjs（由 pnpm build 自动调用）
//
// 内联内容：
//   - 全部 CSS 与经典脚本（保持原有加载顺序）
//   - Viewer.js / fflate / iro.js 的 UMD 版本（作为 CDN 失败后的内联降级）
//   - favicon（data URI）
// 移除内容：
//   - PWA manifest / apple-touch-icon / Service Worker 注册（单文件不适用）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'html-minifier-terser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_DIR = path.join(ROOT, 'dist/static');
const OUT_DIR = path.join(ROOT, 'dist/single');
const OUT_FILE = path.join(OUT_DIR, 'index.html');

/** 读取 dist/static 下的文件（限制在 STATIC_DIR 内） */
function readStatic(rel) {
    const file = path.resolve(STATIC_DIR, rel);
    if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + path.sep)) {
        throw new Error(`非法的资源路径：${rel}`);
    }
    if (!fs.existsSync(file)) {
        throw new Error(`缺少构建资源：${rel}`);
    }
    return fs.readFileSync(file, 'utf8');
}

/** 内联脚本内容中出现 </script> 会提前闭合标签 */
function assertNoScriptClose(code, label) {
    if (/<\/script/i.test(code)) {
        throw new Error(`${label} 包含 </script>，无法安全内联到单文件 HTML`);
    }
}

if (!fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
    console.error('[single] 未找到 dist/static/index.html，请先运行 vite build');
    process.exit(1);
}

// 使用源码 HTML 作为结构模板：dist/static/index.html 已被压缩并移除注释，
// 无法再作为“CDN 资源加载”等锚点；资源内容仍从 dist/static 读取（已压缩）
const SOURCE_HTML = path.join(ROOT, 'index.html');
if (!fs.existsSync(SOURCE_HTML)) {
    console.error('[single] 未找到源码 index.html');
    process.exit(1);
}
let html = fs.readFileSync(SOURCE_HTML, 'utf8');

// ---- 1. 内联第三方库（放在 cdn.js 之前，作为 CDN 与本地 assets 之后的最终降级） ----
const viewerCss = readStatic('assets/viewerjs/viewer.min.css');
const viewerJs = readStatic('assets/viewerjs/viewer.min.js');
const iroJs = readStatic('assets/irojs/iro.js');
const fflateJs = readStatic('assets/fflate/fflate.js');
for (const [code, label] of [[viewerJs, 'Viewer.js'], [iroJs, 'iro.js'], [fflateJs, 'fflate.js']]) {
    assertNoScriptClose(code, label);
}

const inlineAssetsBlock = [
    '<style id="viewer-css-inline">',
    viewerCss,
    '</style>',
    '<script>window.__INLINE_ASSETS__ = { viewer: true, fflate: true, iro: true };</script>',
    '<script>',
    viewerJs,
    '</script>',
    '<script>',
    iroJs,
    '</script>',
    '<script>',
    // fflate 的 UMD 文件本身不含版权注释，此处补充 license 声明
    '/*! fflate v0.8.3 | MIT License | https://github.com/101arrowz/fflate */',
    fflateJs,
    '</script>',
].join('\n');

// 以 cdn.js 的脚本标签为锚点，不依赖 HTML 注释（多文件构建会移除注释）
const cdnScriptAnchor = '<script src="js/cdn.js"></script>';
if (!html.includes(cdnScriptAnchor)) {
    throw new Error('index.html 中未找到 js/cdn.js 脚本标签，无法确定第三方库内联位置');
}
// 必须使用函数替换：第三方库压缩代码包含 $& / $' 等序列，
// 字符串替换会被 String.replace 解释为特殊模式，破坏内联内容
html = html.replace(
    cdnScriptAnchor,
    () => '<!-- 单文件构建：内联的第三方降级资源（CDN 失败时使用） -->\n' +
        inlineAssetsBlock + '\n' +
        cdnScriptAnchor
);

// ---- 2. 设置单文件标志（早于所有脚本） ----
html = html.replace('<head>', '<head>\n    <script>window.__SINGLE_FILE__ = true;</script>');

// ---- 3. 内联 CSS ----
html = html.replace(
    /<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
    (match, href) => `<style>\n${readStatic(href)}\n</style>`
);

// ---- 4. 内联经典脚本（保持原有顺序） ----
html = html.replace(
    /<script\s+[^>]*src="([^"]+)"[^>]*><\/script>/g,
    (match, src) => `<script>\n${readStatic(src)}\n</script>`
);

// ---- 5. 移除 PWA 相关内容 ----
html = html.replace(/\s*<link rel="manifest"[^>]*>/g, '');
html = html.replace(/\s*<link rel="apple-touch-icon"[^>]*>/g, '');
html = html.replace(/<script id="sw-register">[\s\S]*?<\/script>/g, '');

// ---- 6. favicon 内联为 data URI ----
const favicon = fs.readFileSync(path.join(STATIC_DIR, 'favicon.svg'));
const faviconData = 'data:image/svg+xml;base64,' + favicon.toString('base64');
html = html.replace(
    /<link rel="icon"[^>]*>/,
    `<link rel="icon" href="${faviconData}" type="image/svg+xml">`
);

// ---- 7. 压缩 HTML：剔除 HTML 注释与多余空白 ----
// 关闭 minifyJS/minifyCSS，保留第三方库的 /*! ... */ 版权注释与已压缩的自有代码
html = await minify(html, {
    collapseWhitespace: 'conservative',
    removeComments: true,
    keepClosingSlash: true,
    caseSensitive: true,
    minifyCSS: false,
    minifyJS: false,
});

// ---- 8. 残留检查 ----
const leftovers = [...html.matchAll(/(?:src|href)="((?:js|css|i18n|assets)\/[^"]+)"/g)]
    .map(m => m[1]);
if (leftovers.length > 0) {
    console.warn('[single] 仍存在未内联的本地资源引用：' + leftovers.join(', '));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, html, 'utf8');

const sizeKb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
console.log(`[single] 单文件构建完成：${path.relative(ROOT, OUT_FILE)}（${sizeKb} KB）`);
