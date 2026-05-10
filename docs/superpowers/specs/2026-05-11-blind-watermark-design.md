# Blind Watermark Tool Design

## Goal

Build a local-first blind watermark image tool that runs as a Web app and is packaged for desktop/mobile through Tauri v2. The first working release prioritizes a real DCT blind watermark flow with a Web-compatible TypeScript implementation, a Rust/Tauri implementation surface, and clear fallbacks when the local machine lacks Rust or Android tooling.

## Product Scope

The app supports image input from drag-and-drop, file picker, clipboard paste, and mobile browser/WebView file selection. Users can embed text, JSON, or a small file payload, optionally compress and encrypt it, choose a key, tune strength, and export the generated image. Users can also parse a watermarked image, inspect confidence/checksum status, export the parsed result as JSON, copy text, and review image metadata.

The UI is a single-page React workspace with a first-screen product header, upload area, embed panel, detect panel, preview comparison slider, operation log, metadata card, advanced algorithm settings, batch queue, and robustness test controls. It is responsive and supports light/dark theme without sending images to a server.

## Architecture

- `src/lib/watermark`: TypeScript core used by the Web app and tests. It owns payload framing, compression/encryption, seeded pseudo-random placement, DCT embedding/extraction, LSB fallback, capacity checks, image validation, and robustness helpers.
- `src/components`: Focused React UI components for upload, controls, previews, logging, metadata, and results.
- `src-tauri`: Tauri v2 shell and Rust commands. Rust exposes `embed_watermark` and `extract_watermark` commands and contains a matching watermarked-payload implementation surface for desktop/mobile builds.
- `docs`: User documentation, architecture, and algorithm notes.
- `scripts`: Example generation and platform build helper scripts.

## Algorithms

The default algorithm is block DCT on luma. Each 8x8 block is transformed, a pair of mid-frequency coefficients is adjusted to encode one bit, and the changed luma delta is applied back to RGB. Payload bits are repeated and placed in a seeded pseudo-random block order derived from the user key or a documented default key. Extraction repeats the same placement, decodes by coefficient comparison, applies majority voting, validates magic/header/CRC32, and reports confidence and failure reasons.

LSB is included as a lightweight mode for high-capacity local hiding. DWT is documented as experimental and not exposed as a production parser in this release.

## Error Handling

All user-facing operations return structured errors: unsupported file, empty image, insufficient capacity, checksum failure, likely wrong key, encrypted payload requiring password, decompression failure, and unsupported algorithm. The UI shows readable messages and keeps logs without exposing internal panics.

## Security And Privacy

All image processing is local. Payload encryption uses WebCrypto AES-GCM with PBKDF2-derived keys in the Web core. No key is hardcoded for encryption. The default placement seed only applies when the user chooses no key and is documented as not secret. Payload size is checked against image capacity before embedding.

## Testing

Vitest covers:

- DCT embed then extract returns the original payload.
- Wrong key fails validation.
- Empty and non-image file metadata returns readable validation errors.
- LSB fallback round-trips a payload.
- CRC32 and payload framing reject corrupted frames.

Rust unit tests are included for payload framing and can run when Rust is installed.

## Build Strategy

The Web app must install with `npm install`, run with `npm run dev`, test with `npm test`, lint with `npm run lint`, and build with `npm run build`. Tauri scripts are included for desktop and Android. If Rust/Android SDK tooling is unavailable, README documents the exact setup and the verified Web fallback.
