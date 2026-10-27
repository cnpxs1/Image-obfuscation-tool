// 由 i18n/*.json 生成 js/i18n/builtin-langs.js（file:// 与单文件构建的内嵌快照）
// 用法：node scripts/gen-builtin-langs.mjs（pnpm build 前自动执行）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['zh-CN', 'en-US'];
const out = [];

out.push('// 图片混淆工具 — 内置语言 JSON 快照（自动生成，勿手改）');
out.push('// ============================================================');
out.push('// 由 i18n/zh-CN.json 与 i18n/en-US.json 生成，内容保持一致。');
out.push('// 仅用于 file:// 与单文件构建等无法 fetch 的场景兜底；');
out.push('// 修改 i18n/*.json 后，请重新生成本文件（node scripts/gen-builtin-langs.mjs）。');
out.push('// ============================================================');
out.push('');
out.push('const BUILTIN_LANGS_JSON = {');

for (const id of ids) {
    const text = fs.readFileSync(path.join(ROOT, 'i18n', id + '.json'), 'utf8');
    if (text.indexOf('`') !== -1 || text.indexOf('${') !== -1) {
        console.error('ERROR: ' + id + '.json 包含反引号或 ${，无法嵌入模板字符串');
        process.exit(1);
    }
    out.push('    ' + JSON.stringify(id) + ': String.raw`' + text + '`,');
}

out.push('};');
out.push('');
out.push('// 供 js/i18n/i18n.js 使用（全局作用域）');

const dest = path.join(ROOT, 'js', 'i18n', 'builtin-langs.js');
fs.writeFileSync(dest, out.join('\n'), 'utf8');
console.log('builtin-langs.js written:', fs.statSync(dest).size, 'bytes');
