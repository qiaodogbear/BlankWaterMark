# Android APK Build Notes

This project uses Tauri v2 mobile support to build the same React/Rust application as an Android APK. All image processing stays local on the device.

Official references:

- Tauri Android prerequisites: https://v2.tauri.app/start/prerequisites/
- Android Studio and command-line tools: https://developer.android.com/studio

## Default Windows Paths

The automation scripts use C-drive paths so the Android toolchain is stable across shells:

```powershell
ANDROID_HOME=C:\Users\15224\AppData\Local\Android\Sdk
ANDROID_SDK_ROOT=C:\Users\15224\AppData\Local\Android\Sdk
NDK_HOME=C:\Users\15224\AppData\Local\Android\Sdk\ndk\27.2.12479018
JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
```

The scripts also add these user PATH entries when missing:

```powershell
%USERPROFILE%\.cargo\bin
C:\Users\15224\AppData\Local\Android\Sdk\cmdline-tools\latest\bin
C:\Users\15224\AppData\Local\Android\Sdk\platform-tools
C:\Users\15224\AppData\Local\Android\Sdk\emulator
```

## One-Time Environment Setup

Run from the repository root:

```powershell
npm run android:setup
```

This script installs or configures:

- Android Studio through `winget`
- Android command-line tools from the official Android download page
- SDK platform `android-36`
- Build Tools `35.0.0`
- NDK `27.2.12479018`
- CMake `3.22.1`
- Rust Android targets:
  - `aarch64-linux-android`
  - `armv7-linux-androideabi`
  - `i686-linux-android`
  - `x86_64-linux-android`

Close and reopen PowerShell after setup if another terminal cannot see the new user environment variables.

## Build the APK

Run:

```powershell
npm run android:apk
```

The build script runs the normal project checks first:

```powershell
npm install
npm run lint
npm test
npm run build
cd src-tauri
cargo test
```

Then it initializes the Tauri Android project if needed:

```powershell
npm exec -- tauri android init --ci
```

Finally it builds an ARM64 debug APK:

```powershell
npm exec -- tauri android build --debug --apk --target aarch64 --ci
```

On Windows, Tauri may fail to create a symlink into Android `jniLibs` when Developer Mode is disabled. `scripts/build-android-apk.ps1` handles this automatically by copying the generated Rust `.so` and running the matching Gradle `assemble*Debug` task without the symlink step.

The final copied artifact is:

```powershell
dist-android\BlindWaterMark-aarch64-debug.apk
dist-android\BlindWaterMark-aarch64-debug.apk.sha256
```

`dist-android` is ignored by Git because APKs are build artifacts.
`src-tauri\gen\android` is also ignored because Tauri regenerates it with machine-specific Cargo registry paths.

## Install on a Phone

Enable USB debugging on the Android device, connect it, then run:

```powershell
adb devices
adb install -r dist-android\BlindWaterMark-aarch64-debug.apk
```

## Other Targets

Modern Android phones usually need `aarch64`. For another ABI:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1 -Target armv7
powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1 -Target x86_64
```

Use `x86_64` mainly for emulators.

## Common Failures

- `JAVA_HOME is not valid`: run `npm run android:setup` or confirm Android Studio exists at `C:\Program Files\Android\Android Studio`.
- `sdkmanager was not installed`: remove a partial `C:\Users\15224\AppData\Local\Android\Sdk\cmdline-tools\latest` folder and rerun setup.
- `NDK was not installed`: rerun setup and check that the Android SDK license step completed.
- `ANDROID_HOME is not visible in a new shell`: close and reopen PowerShell because user environment changes are loaded at process start.
- Gradle download is slow or fails: rerun `npm run android:apk`; Gradle caches downloaded dependencies and usually resumes cleanly.
