# Architecture

## Overview

BlindWaterMark is a local-first image watermarking workspace. The same React UI runs in a browser, desktop WebView, and mobile WebView. The Web build uses a TypeScript watermark core so the minimum workflow works after `npm install`. Tauri v2 provides native packaging and Rust command entry points for desktop/mobile builds.

## Modules

### Frontend

- `src/App.tsx` owns application state: selected image, payload options, algorithm settings, logs, result, batch queue, and export actions.
- `src/components/*` are focused UI panels. They do not own watermark algorithms.
- `src/lib/image.ts` reads files into RGBA image data, validates file metadata, exports canvas blobs/data URLs, and exposes metadata.
- `src/lib/watermark/*` owns all Web-compatible watermark behavior.

### Watermark Core

The TypeScript core exposes:

- `embedWatermark(image, options)`
- `extractWatermark(image, options)`
- `estimateCapacity(image, algorithm, repetition)`
- frame helpers for tests and native parity.

Payloads are wrapped as JSON envelopes, optionally gzip-compressed, optionally AES-GCM encrypted, and always SHA-256 checked after extraction. Envelopes are then framed with magic/version/algorithm/length/CRC32 before being embedded into image pixels.

### Tauri Native Layer

`src-tauri/src/lib.rs` exposes commands:

- `embed_watermark`
- `extract_watermark`
- `get_runtime_capabilities`

`src-tauri/src/watermark_core.rs` implements the native frame format plus DCT/LSB embedding and extraction. Commands accept base64 image bytes and base64 payload bytes, then return base64 PNG output or parsed payload bytes.

The current frontend uses the TypeScript core by default for Web parity. Native commands are ready for a future runtime switch where desktop/mobile can offload heavy image processing to Rust.

## Data Flow

1. User loads an image through file picker, drag/drop, paste, or mobile gallery.
2. Browser decodes it into RGBA image data through canvas.
3. User configures payload, key, strength, repetition, compression, encryption, and algorithm.
4. Watermark core builds a payload envelope, frame, bitstream, and seeded position order.
5. DCT or LSB implementation writes bits into the image.
6. The UI renders side-by-side preview and exports a PNG.
7. Detection repeats the seeded order, decodes frame bits, validates CRC32, opens payload envelope, decrypts/decompresses if needed, verifies SHA-256, and returns a structured result.

## Error Strategy

Algorithm and image errors are converted to readable messages. Common cases include unsupported file type, empty image, insufficient capacity, missing password, wrong password, likely wrong key, checksum failure, and compression damage.

## Build Strategy

- Web: `npm run dev`, `npm run build`.
- Tests: `npm test`.
- Desktop: `npm run tauri:dev`, `npm run tauri:build`.
- Android: `npm run tauri:android:init`, `npm run tauri:android:build`.

Web build is the baseline because it does not require Rust. Desktop and Android builds require platform toolchains documented in `docs/ANDROID.md`.
