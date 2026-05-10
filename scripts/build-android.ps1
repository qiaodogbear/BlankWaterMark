$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path "$PSScriptRoot\..")
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "Rust/Cargo is required for Tauri Android builds. Install rustup and Android targets first."
}
if (-not $env:ANDROID_HOME) {
  throw "ANDROID_HOME is not set. See docs/ANDROID.md."
}
npm install
npm run tauri:android:build
