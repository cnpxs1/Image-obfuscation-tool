// 使用本机 7-Zip 将单文件 HTML 压缩为 zip（最高压缩等级 -mx=9）
// 用法：node scripts/zip-single.mjs（由 pnpm build 自动调用）
// 可通过环境变量 SEVEN_ZIP 指定 7z.exe 路径
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SINGLE_DIR = path.join(ROOT, 'dist/single');
const HTML_FILE = path.join(SINGLE_DIR, 'index.html');
const ZIP_FILE = path.join(SINGLE_DIR, 'index.zip');

const CANDIDATES = [
    process.env.SEVEN_ZIP,
    'D:\\Software\\7-Zip\\7z.exe',
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    '7z',
    '7za',
].filter(Boolean);

function findSevenZip() {
    for (const candidate of CANDIDATES) {
        if (candidate === '7z' || candidate === '7za') {
            try {
                execFileSync(candidate, ['--help'], { stdio: 'ignore' });
                return candidate;
            } catch (e) { /* 继续尝试下一个 */ }
        } else if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error('未找到 7-Zip，请安装 7-Zip 或设置环境变量 SEVEN_ZIP 指向 7z.exe');
}

if (!fs.existsSync(HTML_FILE)) {
    console.error('[zip] 未找到 dist/single/index.html，请先运行 node scripts/build-single.mjs');
    process.exit(1);
}

const sevenZip = findSevenZip();
fs.rmSync(ZIP_FILE, { force: true });

// -tzip 指定 zip 格式，-mx=9 为最高压缩等级
execFileSync(sevenZip, ['a', '-tzip', '-mx=9', 'index.zip', 'index.html'], {
    cwd: SINGLE_DIR,
    stdio: 'inherit',
});

const sizeKb = (fs.statSync(ZIP_FILE).size / 1024).toFixed(1);
console.log(`[zip] 已生成 ${path.relative(ROOT, ZIP_FILE)}（${sizeKb} KB，-mx=9）`);
