// 将 pnpm 依赖中的第三方库同步到 assets/，供 CDN 降级路线使用
// 用法：pnpm sync-assets（dev/build 前自动执行）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ASSETS = [
    // Viewer.js（与 CDN 使用的 1.11.7 保持一致）
    ['node_modules/viewerjs/dist/viewer.min.js', 'assets/viewerjs/viewer.min.js'],
    ['node_modules/viewerjs/dist/viewer.min.css', 'assets/viewerjs/viewer.min.css'],
    ['node_modules/viewerjs/LICENSE', 'assets/viewerjs/LICENSE'],
    // fflate（npm 包仅提供 UMD 非压缩版）
    ['node_modules/fflate/umd/index.js', 'assets/fflate/fflate.js'],
    ['node_modules/fflate/LICENSE', 'assets/fflate/LICENSE'],
    // iro.js
    ['node_modules/@jaames/iro/dist/iro.min.js', 'assets/irojs/iro.js'],
    ['node_modules/@jaames/iro/LICENSE.txt', 'assets/irojs/LICENSE'],
];

let copied = 0;
for (const [from, to] of ASSETS) {
    const src = path.join(root, from);
    const dest = path.join(root, to);
    if (!fs.existsSync(src)) {
        console.error(`[sync-assets] 缺少依赖文件：${from}`);
        process.exit(1);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copied++;
    console.log(`[sync-assets] ${from} -> ${to}`);
}
console.log(`[sync-assets] 完成，共同步 ${copied} 个文件`);
