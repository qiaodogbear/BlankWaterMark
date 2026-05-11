# BlindWaterMark

BlindWaterMark is a local-first blind watermark tool for embedding, detecting, extracting, saving, and sharing hidden payloads in images. It provides a shared React interface for Web, desktop, and mobile packaging, with a TypeScript image-processing core for the browser and a Rust/Tauri native backend for desktop/mobile builds.

The app is designed for offline workflows: images and payloads are processed locally by default and are not uploaded to any server.

## Features

- Image input through drag and drop, file picker, clipboard paste, and mobile gallery selection.
- PNG, JPEG/JPG, and WEBP input support, with PNG/JPEG as the recommended formats.
- Blind watermark embedding for text, JSON, and small file payloads.
- Default DCT frequency-domain watermark algorithm using luma blocks and keyed pseudo-random placement.
- LSB steganography mode for lightweight, high-capacity local hiding.
- Optional payload compression, AES-GCM encryption, and SHA-256 integrity verification.
- Watermark detection with confidence, data length, checksum status, and readable failure reasons.
- Original/watermarked preview comparison slider.
- Batch image processing.
- Image metadata panel.
- Robustness checks that simulate compression and scaling before extraction.
- Web download, desktop save dialog, mobile share support, copied text results, JSON result export, and extracted file export.

Blind watermarks improve traceability and hidden-data survivability, but they are not indestructible. Heavy compression, cropping, resizing, filtering, and re-encoding can reduce or destroy extractability.

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- Vitest + ESLint
- Tauri v2
- Rust image-processing backend

## Requirements

### Web

- Node.js 20+
- npm 10+

### Desktop

- Node.js 20+
- npm 10+
- Rust and Cargo, installed through <https://rustup.rs/>
- Tauri desktop prerequisites for your OS

### Android

- Android Studio
- Android SDK and NDK
- JDK 17+
- Rust Android targets

See [docs/ANDROID.md](docs/ANDROID.md) for Android setup details.

## Install

```powershell
git clone https://github.com/qiaodogbear/BlankWaterMark.git
cd BlankWaterMark
npm install
```

If you are working from the original local folder:

```powershell
cd D:\VScode\coderesource\.vscode\BlindWaterMark
npm install
```

## Run The Web App

```powershell
npm run dev
```

Vite uses port `1420` by default. Open the local URL printed in the terminal.

## Build The Web App

```powershell
npm run build
```

The production Web build is written to `dist/`.

## Test And Lint

```powershell
npm test
npm run lint
```

The test suite covers:

- DCT embed and extract round-trip.
- Wrong-key extraction failure.
- LSB round-trip.
- Corrupt frame rejection.
- Empty file validation.
- Non-image file validation.

## Run The Desktop App

```powershell
npm run tauri:dev
```

If Tauri reports `failed to run 'cargo metadata' ... program not found`, install Rust/Cargo through rustup and reopen your terminal.

## Build Desktop Packages

```powershell
npm run tauri:build
```

Windows builds generate an executable and installer bundles under:

```text
src-tauri/target/release/
src-tauri/target/release/bundle/
```

On macOS and Linux, output paths depend on the Tauri bundle target.

## Android Build

Initialize the Android project:

```powershell
npm run tauri:android:init
```

Run on a connected Android device:

```powershell
npm run tauri:android:dev
```

Build APK/AAB:

```powershell
npm run tauri:android:build
```

Android output is usually under `src-tauri/gen/android/app/build/outputs/`.

## Generate Examples And Icons

```powershell
npm run examples
npm run icons
```

Example files live in `examples/`. Tauri icon assets live in `src-tauri/icons/`.

## Project Structure

```text
src/
  components/              React UI panels
  lib/image.ts             Image loading, export, and metadata helpers
  lib/watermark/           TypeScript watermark core and tests
src-tauri/
  src/watermark_core.rs    Rust native watermark core
  src/lib.rs               Tauri command registration
docs/
  ARCHITECTURE.md          Architecture notes
  WATERMARK_ALGORITHMS.md  Algorithm details
  ANDROID.md               Android build guide
scripts/
  build-web.ps1
  build-desktop.ps1
  build-android.ps1
  generate-examples.mjs
  generate-icons.mjs
examples/
  sample-image.png
  sample-payload.json
```

## Algorithm Summary

The default DCT mode converts image pixels to a luma channel, splits the image into 8x8 blocks, embeds payload bits into a pair of mid-frequency DCT coefficients, and uses a key-derived pseudo-random block order. Extraction repeats the same order, decodes coefficient comparisons, applies redundancy voting, and validates the frame checksum.

LSB mode writes payload bits into pseudo-random RGB least-significant bits. It has higher capacity but is fragile under JPEG compression and image transformations.

More details are available in [docs/WATERMARK_ALGORITHMS.md](docs/WATERMARK_ALGORITHMS.md).

## Privacy And Security

- Images are processed locally by default.
- No image upload endpoint is included.
- Encryption passwords are never hardcoded.
- The default placement key is only a fallback for deterministic placement and should not be treated as a secret.
- File payloads are size-limited in the UI to reduce the risk of capacity overflow and damaged output images.

## License

MIT
