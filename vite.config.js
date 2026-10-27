import { defineConfig } from 'vite';
import { transform } from 'esbuild';
import { minify } from 'html-minifier-terser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, 'dist/static');

// 需要原样复制到 dist/static 的源码资源
// assets/ 由 scripts/sync-assets.mjs 从 node_modules 生成
const COPY_ITEMS = [
    'index.html',
    'css',
    'js',
    'i18n',
    'img',
    'assets',
    'favicon.svg',
    'manifest.json',
    'sw.js',
];

/** 递归收集指定扩展名的文件 */
function walkFiles(dir, ext, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkFiles(full, ext, out);
        else if (entry.name.endsWith(ext)) out.push(full);
    }
    return out;
}

/** 用 esbuild 压缩单个 JS/CSS 文件（保持全局经典脚本语义，剔除自有代码注释） */
async function minifyFile(file, loader) {
    const code = fs.readFileSync(file, 'utf8');
    const options = { loader, minify: true, legalComments: 'none' };
    if (loader === 'js') options.target = 'es2020';
    const result = await transform(code, options);
    fs.writeFileSync(file, result.code);
}

/** 压缩 HTML：移除注释、多余空白；内联脚本/样式一并压缩 */
const HTML_MINIFY_OPTIONS = {
    collapseWhitespace: 'conservative',
    removeComments: true,
    removeRedundantAttributes: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: true,
    keepClosingSlash: true,
    // SVG 属性（如 viewBox）区分大小写，必须保留
    caseSensitive: true,
};

/**
 * 多文件静态构建：
 * 经典脚本不使用 ES Module，Vite 的 HTML 资源处理会破坏 <script src> / <link>，
 * 因此这里按原目录结构复制源码，再用 esbuild 压缩自有 JS/CSS。
 */
async function buildStaticSite() {
    if (!fs.existsSync(path.join(ROOT, 'assets/viewerjs/viewer.min.js'))) {
        throw new Error('[build] assets/ 未同步，请先运行 pnpm sync-assets');
    }

    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });

    for (const item of COPY_ITEMS) {
        const src = path.join(ROOT, item);
        if (!fs.existsSync(src)) {
            console.warn(`[build] 跳过不存在的资源：${item}`);
            continue;
        }
        fs.cpSync(src, path.join(OUT_DIR, item), { recursive: true });
    }

    for (const file of walkFiles(path.join(OUT_DIR, 'js'), '.js')) {
        await minifyFile(file, 'js');
    }
    for (const file of walkFiles(path.join(OUT_DIR, 'css'), '.css')) {
        await minifyFile(file, 'css');
    }

    // HTML 压缩：剔除 HTML 注释与多余空白，同时压缩内联的 SW 注册脚本
    const htmlFile = path.join(OUT_DIR, 'index.html');
    const html = fs.readFileSync(htmlFile, 'utf8');
    fs.writeFileSync(htmlFile, await minify(html, HTML_MINIFY_OPTIONS));

    console.log(`[build] 多文件静态构建完成：${path.relative(ROOT, OUT_DIR)}`);
}

function staticBuildPlugin() {
    return {
        name: 'static-build',
        apply: 'build',
        async closeBundle() {
            await buildStaticSite();
        },
    };
}

/** 开发服务器下移除 Service Worker 注册，避免 SW 缓存干扰 Vite HMR */
function disableSwInDevPlugin() {
    return {
        name: 'disable-sw-in-dev',
        apply: 'serve',
        transformIndexHtml(html) {
            return html.replace(/<script id="sw-register">[\s\S]*?<\/script>/, '');
        },
    };
}

export default defineConfig({
    base: './',
    publicDir: false,
    build: {
        // 不写出 Rollup 产物，多文件站点由 staticBuildPlugin 生成
        write: false,
        rollupOptions: {
            input: 'scripts/build-entry.js',
        },
    },
    plugins: [staticBuildPlugin(), disableSwInDevPlugin()],
});
