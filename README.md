# BlindWaterMark

跨平台盲水印图片生成与解析工具。项目使用 React + TypeScript + Vite + Tailwind CSS 构建 Web 端，使用 Tauri v2 打包 Windows/macOS/Linux 桌面端并保留 Android APK 构建入口。图片和 payload 默认全部在本地处理，不上传到任何服务器。

## 功能

- 图片输入：拖拽、文件选择器、剪贴板粘贴、移动端图库选择。
- 支持 PNG、JPG、JPEG、WEBP，优先推荐 PNG/JPEG。
- 盲水印嵌入：文本、JSON、小型文件 payload。
- 默认 DCT 频域盲水印：亮度通道 8x8 分块、中频系数嵌入、密钥控制伪随机位置、重复冗余、CRC 校验。
- LSB 隐写模式：高容量轻量模式。
- payload gzip 压缩、AES-GCM 加密、SHA-256 完整性校验。
- 检测解析：自动尝试算法、显示置信度、数据长度、校验结果和失败原因。
- 导出：Web 下载、Tauri 桌面保存到指定路径、移动端 Web Share API 分享、解析结果 JSON、payload 文件导出。
- 扩展：预览对比滑块、批量嵌入、图片元数据、压缩/缩放鲁棒性测试。

盲水印不是绝对不可破坏。强压缩、裁剪、缩放、滤镜和重新编码都可能降低或破坏解析能力。

## 环境要求

- Node.js 20+
- npm 10+
- Web 端不需要 Rust。
- 桌面/Android 构建需要 Rust、Cargo 和 Tauri v2 依赖。
- Android APK 构建需要 Android Studio、Android SDK、NDK、JDK 和移动端 Rust target。

## 安装

```powershell
cd D:\VScode\coderesource\.vscode\BlindWaterMark
npm install
```

## Web 开发运行

```powershell
npm run dev
```

默认 Vite 端口为 `1420`。浏览器打开终端输出的本地地址即可使用。

## Web 构建

```powershell
npm run build
```

构建产物在 `dist/`。

## 测试与检查

```powershell
npm test
npm run lint
```

测试覆盖 DCT 嵌入/解析、错误密钥失败、LSB 解析、坏帧拒绝、空图片和非图片输入错误。

## 桌面端运行

安装 Rust 后执行：

```powershell
npm run tauri:dev
```

构建桌面安装包：

```powershell
npm run tauri:build
```

Windows 输出通常位于 `src-tauri\target\release\bundle\`。macOS/Linux 输出路径由 Tauri bundle target 决定。

如果出现 `failed to run 'cargo metadata' ... program not found`，说明当前机器没有安装 Rust/Cargo，先安装 <https://rustup.rs/> 并重新打开终端。

## Android APK

首次初始化：

```powershell
npm run tauri:android:init
```

连接设备开发运行：

```powershell
npm run tauri:android:dev
```

构建 APK/AAB：

```powershell
npm run tauri:android:build
```

完整环境说明见 [docs/ANDROID.md](docs/ANDROID.md)。

## 示例

```powershell
npm run examples
```

该命令生成 `examples/sample-image.png`。示例 payload 在 `examples/sample-payload.json`。

## 项目结构

```text
src/
  components/              React 产品界面
  lib/image.ts             图片读取、导出、元数据
  lib/watermark/           TypeScript 水印核心与测试
src-tauri/
  src/watermark_core.rs    Rust/Tauri 原生水印命令核心
docs/
  ARCHITECTURE.md
  WATERMARK_ALGORITHMS.md
  ANDROID.md
scripts/
  build-web.ps1
  build-desktop.ps1
  build-android.ps1
  generate-examples.mjs
examples/
  sample-payload.json
```

## 隐私与安全

- 不会把图片上传到服务器。
- 加密密码不硬编码，不写入仓库。
- 默认密钥只用于无密钥时的伪随机位置，不等同于安全密码。
- 文件 payload 默认限制为 128KB，实际可嵌入大小还取决于图片尺寸、算法和冗余参数。
