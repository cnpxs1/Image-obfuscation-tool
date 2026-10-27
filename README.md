# Image-obfuscation-tool

**基于希尔伯特曲线的纯前端图像混淆/解混淆工具**

![GitHub Stars](https://img.shields.io/github/stars/cnpxs1/Image-obfuscation-tool?style=flat-square) ![GitHub Forks](https://img.shields.io/github/forks/cnpxs1/Image-obfuscation-tool?style=flat-square) ![License](https://img.shields.io/github/license/cnpxs1/Image-obfuscation-tool?style=flat-square) ![Commits](https://img.shields.io/github/commit-activity/y/cnpxs1/Image-obfuscation-tool?style=flat-square&label=Total%20Commits) ![HTML](https://img.shields.io/badge/language-HTML%20%2B%20Native%20JS-orange?style=flat-square)

---

## 📖 项目简介

Image-obfuscation-tool 是一款**纯前端运行**的图像工具，依托**希尔伯特空间填充曲线**算法实现像素级有序混淆与无损解混淆，全程无需后端服务器、无需上传图片至云端，所有像素运算在浏览器本地完成，彻底保障用户图片隐私安全。

工具主打开箱即用、极简交互，支持单张/批量图片拖拽上传、多格式导出、一键混淆/解混淆，核心优势是保留像素空间关联性，还原无失真、无画质损耗，适用于图像隐私脱敏、算法教学演示、像素艺术预处理、敏感图片临时加密等场景，无需安装环境，打开即用。

---

## 🧠 开发说明

**声明**：本项目核心代码***使用AI完成开发***，全程仅用于技术学习、算法验证与开源交流，无任何商业牟利、侵权违规用途，代码逻辑公开透明，符合开源社区合规规范。

---

## ✨ 核心特性

- **纯前端运行**：运行时无后端依赖，所有像素运算在浏览器本地完成；构建使用 Vite + pnpm，产物同时提供多文件静态站点与完全自包含的单文件 HTML

- **希尔伯特曲线算法**：采用空间填充分形曲线实现像素映射，有序打乱像素排布，混淆后保留图像空间结构，还原过程无像素丢失、无画质衰减

- **批量高效处理**：支持多张图片同时拖拽上传，支持批量混淆、批量解混淆、批量导出，大幅提升多图处理效率

- **本地隐私优先**：图片数据仅在用户浏览器本地缓存运算，全程不上传任何服务器，关闭页面后缓存自动清除，杜绝隐私泄露

- **多 格 式 兼 容**：支持JPG、JPEG、PNG、WebP等主流图片格式导入，保留PNG透明通道，导出可自选格式，适配各类使用需求

- **极简零门槛操作**：可视化拖拽上传、一键功能触发、实时效果预览，无需专业技术基础，新手可快速上手操作

- **跨浏览器适配**：兼容Chrome、Edge、Firefox、Safari等现代主流浏览器，响应式布局适配电脑端，加载速度快、运行稳定

- **界面国际化（i18n）**：所有界面文案抽离为 `i18n/` 目录下的独立 JSON 语言文件，支持动态切换内置语言、一键导入自定义语言文件，普通用户可直接编辑 JSON 定制界面文字

---

## 🌐 界面国际化（i18n）

所有界面文案（按钮、提示、日志、设置项等）均存放在 `i18n/` 目录下的 JSON 语言文件中，程序启动时动态加载，切换语言无需刷新页面。

### 语言文件

| 文件 | 说明 |
| --- | --- |
| `i18n/zh-CN.json` | 简体中文（默认语言，完整键值参考） |
| `i18n/en-US.json` | English（内置英文） |
| `i18n/template.json` | 自定义语言模板（复制后修改即可） |

### 使用方式

1. **切换语言**：点击标题下方的「界面语言」下拉框，选择内置语言或已导入的自定义语言，立即生效并自动记忆选择。
2. **编辑内置语言**：通过本地服务器访问时（`python server.py`），直接编辑 `i18n/zh-CN.json` 等文件，刷新页面即可生效，无需重新构建。
3. **导入自定义语言**：点击「导入语言文件」按钮，选择 `.json` 语言文件（可参考 `i18n/template.json`），导入后即可在下拉框中切换；自定义语言会保存在浏览器本地，刷新后依然可用。
4. **删除自定义语言**：选中已导入的自定义语言后，点击「删除当前语言」按钮即可移除。

### 语言文件格式

```json
{
  "meta": { "id": "my-lang", "name": "我的语言", "lang": "zh-CN", "author": "作者名" },
  "app": { "title": "图片混淆工具" },
  "common": { "encrypt": "混淆" }
}
```

- `meta.name` 必填，为下拉菜单中显示的语言名称；`meta.id` 缺省时取文件名。
- 键名采用「段.键」的点分形式，程序自动展平；缺失的键自动回退到 `zh-CN` 对应值。
- 文本中的 `{n}`、`{name}` 等占位符由程序替换为实际内容，请保留并仅调整位置。
- 修改 `i18n/*.json` 后，`pnpm build` 会自动重新生成 `js/i18n/builtin-langs.js` 内嵌快照（单文件与 `file://` 使用）；也可单独运行 `pnpm gen-langs`。

---

## 🛠️ 开发与构建

需要 Node.js（`>= 20.19` 或 `>= 22.12`）与 pnpm。

```bash
pnpm install        # 安装 Vite、Viewer.js、fflate、iro.js 等依赖
pnpm dev            # 启动 Vite 开发服务器（默认 http://localhost:5173）
pnpm build          # 生成多文件站点、单文件 HTML，并调用 7-Zip 打包 zip
pnpm preview        # 预览 dist/static 多文件产物
```

构建产物：

| 路径 | 说明 |
| --- | --- |
| `dist/static/` | 多文件静态站点，可直接部署到任意静态服务器 |
| `dist/single/index.html` | 完全自包含的单文件 HTML（第三方库与图标均已内联） |
| `dist/single/index.zip` | 单文件 HTML 经 7-Zip 最高压缩等级（`-mx=9`）打包的压缩包 |

- `assets/` 下的第三方库副本由 `pnpm sync-assets` 从 `node_modules` 生成，已加入 `.gitignore`；`pnpm dev` / `pnpm build` 会自动执行同步。
- 单文件打包依赖本机 7-Zip，脚本会自动探测常见安装路径，也可通过环境变量 `SEVEN_ZIP` 指定 `7z.exe` 路径。
- 单文件 HTML 保持 CDN 优先加载，CDN 失败时使用内联的 Viewer.js / fflate / iro.js 降级。
- 构建会剔除自有 HTML/JS/CSS 的注释与多余空白（HTML 由 html-minifier-terser 处理，JS/CSS 由 esbuild 压缩）；第三方库的 `/*! ... */` 版权注释会保留，多文件产物仍附带 `assets/*/LICENSE`。
- 分步构建：`pnpm build:static`、`pnpm build:single`、`pnpm zip`；`build:single` 会自动先执行 `build:static`，确保内联的是最新产物。

---

## 🚀 快速开始

### 一、使用构建产物（推荐）
1. 安装依赖并构建：`pnpm install && pnpm build`
2. 多文件部署：将 `dist/static/` 上传到任意静态服务器
3. 单文件使用：直接打开 `dist/single/index.html`，或分发 `dist/single/index.zip`

### 二、本地开发
1. 执行 `pnpm install`
2. 执行 `pnpm dev`，访问 Vite 输出的地址（默认 `http://localhost:5173`）

### 三、无 Node 环境预览
无 Node 环境时建议直接使用构建产物：部署 `dist/static/`，或打开 `dist/single/index.html`。若已获得包含 `assets/` 的源码包（或已在其他环境中执行过 `pnpm sync-assets`），也可使用 `python server.py` 或 `python -m http.server 8080` 启动静态服务器；`server.py` 仍保留 gzip 与 no-cache 支持。

### 四、在线预览（GitHub Pages）
直接访问在线地址：<https://cnpxs1.github.io/Image-obfuscation-tool/>

该站点需以 `dist/static/` 构建产物部署；源码根目录的 `assets/` 由 pnpm 生成且不入库，直接以源码根目录部署将缺少第三方库降级副本。

**温馨提示**：工具不兼容 IE 等老旧浏览器；处理 4K 及以上超大分辨率图片时，处理速度受设备 CPU/内存性能影响，请耐心等待运算完成。

---

## 📝 详细使用教程

### 1. 图片上传

- 直接选择/拖拽多张图片至浏览器上传区域
- 打包为 zip 后上传

### 2. 图像混淆操作

1. 图片加载完成后，预览区展示原始清晰图像

2. 点击界面【混淆图像】按钮，工具自动调用希尔伯特曲线算法打乱像素

3. 等待运算完成，预览区实时展示混淆后的视觉效果，可直观查看混淆程度

### 3. 图像解混淆操作

1. 上传**本工具生成的混淆图片**（第三方混淆图片不支持还原）

2. 点击【解混淆】按钮，工具逆向执行像素映射逻辑，快速还原原图

3. 解混淆完成后预览区展示原始清晰图像，像素、画质、透明度均无损耗

### 4. 导出与保存

混淆或解混淆操作完成后，点击【保存】按钮，选择保存格式与路径，即可将处理后的图片下载至本地，支持单张导出、批量导出、打包为zip下载。

---

## 🔬 核心技术原理

本工具基于**希尔伯特空间填充曲线**实现图像混淆与还原，算法逻辑如下：

- **曲 线 特 性**：希尔伯特曲线是连续分形曲线，可将二维平面像素坐标有序映射为一维序列，填满整个图像空间，兼顾连续性与空间关联性

- **混 淆 逻 辑**：遍历图像像素，按照希尔伯特曲线的路径顺序重新排布像素位置，实现视觉上的模糊混淆，并非随机打散像素

- **解混淆逻辑**：逆向读取希尔伯特曲线的映射关系，将混淆后的一维像素序列还原为原始二维坐标，实现百分百无损还原

- **算 法 优 势**：相比随机像素混淆、简单分块打乱，该算法还原精度更高、运算效率更快，且混淆效果可控，适合轻量化隐私处理场景

---

## 📂 项目文件结构

```plaintext
Image-obfuscation-tool/
├── package.json          # pnpm 依赖与构建脚本
├── pnpm-workspace.yaml   # pnpm 允许执行构建脚本的依赖（esbuild）
├── vite.config.js        # Vite 开发服务器与多文件静态构建
├── index.html            # 入口 HTML（骨架 + 脚本加载清单）
├── css/                  # 样式表（按依赖顺序加载）
├── js/                   # 模块化经典脚本（utils / core / io / ui / i18n / app / events）
├── i18n/                 # 语言文件（zh-CN / en-US / template）
├── img/                  # 图标素材与占位图
├── assets/               # 第三方库本地降级副本（pnpm sync-assets 生成，不入库）
├── scripts/
│   ├── sync-assets.mjs   # 从 node_modules 同步第三方库到 assets/
│   ├── build-entry.js    # Vite 构建占位入口
│   ├── build-single.mjs  # 生成完全自包含的单文件 HTML
│   └── zip-single.mjs    # 调用 7-Zip 打包单文件 zip
├── dist/                 # 构建产物（不入库）
│   ├── static/           # 多文件静态站点
│   └── single/           # index.html + index.zip
├── server.py             # 无构建预览用的 gzip 静态服务器
├── sw.js                 # Service Worker，PWA 离线缓存
├── manifest.json         # PWA 应用清单
├── favicon.svg           # 网站图标
├── README.md             # 项目说明文档
├── LICENSE               # MIT 开源许可证
└── .gitignore            # Git 忽略规则
```

---

## ⚠️ 注意事项

- 仅支持还原**本工具生成的混淆图片**，第三方加密/混淆图片无法保证还原效果

- 带透明背景的 PNG 及 WebP 格式，混淆与还原过程中支持保留 Alpha 透明度通道

- 超大分辨率图片（单图＞8K）建议拆分处理，避免浏览器内存占用过高

- 工具仅为本地运算工具，关闭浏览器页面后，未导出的图片缓存会自动清除

- 建议在正规现代浏览器中使用，避免影响功能运行

## 📜 免责声明

本工具仅供**技术交流、学习研究、个人隐私临时处理**使用，**严禁用于违法违规、商业侵权、隐私窃取、恶意篡改**等不正当场景。

使用者需自行承担因违规使用本工具所产生的全部法律责任，项目作者不承担任何连带责任。

---

## 📄 开源许可证

本项目采用 **MIT License** 开源协议，允许个人/企业免费使用、修改、分发源码，使用时需保留原作者版权声明，详情查看 [LICENSE](LICENSE) 文件。

---

## 📦第三方依赖
### 本项目使用以下开源库：
- [ViewerJS](https://github.com/fengyuanchen/viewerjs) - 实现图片预览功能，基于 **MIT** 协议开源
- [fflate](https://github.com/101arrowz/fflate) - 8kB 超小体积，实现高性能 ZIP 压缩与解压缩，基于 **MIT** 协议开源
- [iro.js](https://github.com/jaames/iro.js) - 模块化、注重设计的JavaScript色彩选择器小部件，基于 **MPL 2.0** 协议开源
