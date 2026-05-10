$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path "$PSScriptRoot\..")
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "Rust/Cargo is required for Tauri desktop builds. Install from https://rustup.rs/ and rerun."
}
npm install
npm run tauri:build
