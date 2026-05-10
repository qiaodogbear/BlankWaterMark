# Blind Watermark Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete local-first blind watermark app with Web, Tauri desktop/mobile packaging, DCT/LSB watermarking, tests, docs, scripts, and GitHub publishing.

**Architecture:** The Web app uses React/TypeScript/Tailwind and a TypeScript watermark core so the browser build works without native services. Tauri v2 wraps the same product UI and exposes Rust commands for native image processing when Rust is available. Documentation and scripts make desktop and Android builds reproducible.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, Vitest, ESLint, Tauri v2, Rust, image crate, sha2, flate2, aes-gcm, GitHub CLI.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create: `.editorconfig`

- [ ] Write project configuration with scripts `dev`, `build`, `tauri:dev`, `tauri:build`, `test`, and `lint`.
- [ ] Add dependencies for React, Tauri API, lucide icons, fflate, clsx, and development dependencies for Vite, Tailwind, TypeScript, Vitest, ESLint, and PNG example generation.
- [ ] Run `npm install` and verify lockfile creation.

### Task 2: TypeScript Watermark Core

**Files:**
- Create: `src/lib/watermark/types.ts`
- Create: `src/lib/watermark/base64.ts`
- Create: `src/lib/watermark/crypto.ts`
- Create: `src/lib/watermark/frame.ts`
- Create: `src/lib/watermark/prng.ts`
- Create: `src/lib/watermark/dct.ts`
- Create: `src/lib/watermark/lsb.ts`
- Create: `src/lib/watermark/index.ts`
- Create: `src/lib/image.ts`
- Test: `src/lib/watermark/watermark.test.ts`

- [ ] Write failing tests for DCT round-trip, wrong-key failure, LSB round-trip, corrupt frame rejection, empty file validation, and non-image validation.
- [ ] Run `npm test -- --runInBand` or `npm test` and confirm tests fail due missing implementation.
- [ ] Implement minimal payload framing, CRC32, seeded placement, DCT embedding/extraction, LSB embedding/extraction, payload compression/encryption hooks, and image input validation.
- [ ] Run `npm test` and confirm tests pass.

### Task 3: React Product UI

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/components/AdvancedPanel.tsx`
- Create: `src/components/BatchPanel.tsx`
- Create: `src/components/DetectPanel.tsx`
- Create: `src/components/EmbedPanel.tsx`
- Create: `src/components/ImageDropzone.tsx`
- Create: `src/components/MetadataPanel.tsx`
- Create: `src/components/PreviewCompare.tsx`
- Create: `src/components/ResultPanel.tsx`
- Create: `src/components/StatusLog.tsx`
- Create: `src/components/ThemeToggle.tsx`

- [ ] Implement responsive light/dark UI with drag/drop, file picker, paste handling, payload form, algorithm settings, preview comparison slider, metadata, logs, batch queue, and robustness controls.
- [ ] Wire embed/parse actions to the TypeScript core.
- [ ] Wire download/share/export/copy actions with Web APIs and Tauri-friendly fallbacks.
- [ ] Run `npm run build` to verify the UI compiles.

### Task 4: Tauri v2 Native Shell

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/watermark_core.rs`
- Create: `src-tauri/.cargo/config.toml`

- [ ] Implement Tauri commands `embed_watermark`, `extract_watermark`, and `get_runtime_capabilities`.
- [ ] Implement Rust payload frame tests and safe error mapping.
- [ ] Add desktop bundle metadata and Android-capable identifier/config.
- [ ] If Rust is installed, run `cargo test` in `src-tauri`; otherwise document the missing toolchain.

### Task 5: Scripts, Examples, And Docs

**Files:**
- Create: `README.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/WATERMARK_ALGORITHMS.md`
- Create: `docs/ANDROID.md`
- Create: `examples/sample-payload.json`
- Create: `examples/README.md`
- Create: `scripts/generate-examples.mjs`
- Create: `scripts/build-web.ps1`
- Create: `scripts/build-desktop.ps1`
- Create: `scripts/build-android.ps1`

- [ ] Document installation, Web run/build, desktop run/build, Android APK setup/build, limitations, privacy, and troubleshooting.
- [ ] Generate a sample image using `npm run examples`.
- [ ] Run `npm run lint`, `npm test`, and `npm run build`.

### Task 6: GitHub Publish

**Files:**
- Modify: local git repository metadata only.

- [ ] Initialize git in the target project if needed.
- [ ] Review `git status` and stage only project files.
- [ ] Commit with a concise message.
- [ ] Use GitHub CLI or available connector to create repository `BlindWaterMark`.
- [ ] Push the branch and report the remote URL. If local `gh` is unauthenticated and connector cannot create repositories, record the blocker and exact recovery command.
