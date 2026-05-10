# Android Build Notes

The repository contains Tauri v2 Android-capable configuration and npm scripts. Android build output still requires local mobile toolchains.

## Required Tools

- Rust and Cargo
- Node.js 20+
- Android Studio
- Android SDK Platform Tools
- Android SDK Build Tools
- Android NDK
- JDK 17+
- Tauri CLI installed through project dev dependency

## Rust Targets

Install mobile targets as needed:

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

## Environment Variables

Set these to match your Android Studio installation:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\<installed-version>"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

Add platform tools to PATH:

```powershell
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"
```

## Initialize Android Project

```powershell
npm run tauri:android:init
```

This generates `src-tauri/gen/android/`. The generated folder is machine/toolchain-specific and can be recreated.

## Development Run

```powershell
npm run tauri:android:dev
```

## APK/AAB Build

```powershell
npm run tauri:android:build
```

Generated APK/AAB paths are printed by Tauri/Gradle, usually under `src-tauri/gen/android/app/build/outputs/`.

## Current Repository Behavior

The React UI already supports mobile image selection through standard file inputs and system sharing through Web Share API when available. Native Android sharing can be added later through a Tauri mobile plugin if product requirements demand deeper OS integration.
