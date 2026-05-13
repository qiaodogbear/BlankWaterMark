param(
  [ValidateSet("aarch64", "armv7", "i686", "x86_64")]
  [string]$Target = "aarch64",
  [string]$AndroidSdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$NdkVersion = "27.2.12479018",
  [switch]$SkipProjectChecks
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-LastExitCode {
  param([string]$Action)
  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE."
  }
}

function Use-AndroidEnvironment {
  param(
    [string]$SdkRoot,
    [string]$NdkVersion
  )

  $javaHome = $env:JAVA_HOME
  $studioJbr = "C:\Program Files\Android\Android Studio\jbr"
  if (-not $javaHome -and (Test-Path (Join-Path $studioJbr "bin\java.exe"))) {
    $javaHome = $studioJbr
  }

  if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome "bin\java.exe"))) {
    throw "JAVA_HOME is not valid. Run scripts\setup-android-env.ps1 first."
  }

  $ndkHome = Join-Path $SdkRoot "ndk\$NdkVersion"
  $sdkManager = Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"
  $adb = Join-Path $SdkRoot "platform-tools\adb.exe"

  foreach ($path in @($sdkManager, $adb, $ndkHome)) {
    if (-not (Test-Path $path)) {
      throw "Android toolchain path is missing: $path. Run scripts\setup-android-env.ps1 first."
    }
  }

  $env:JAVA_HOME = $javaHome
  $env:ANDROID_HOME = $SdkRoot
  $env:ANDROID_SDK_ROOT = $SdkRoot
  $env:NDK_HOME = $ndkHome
  $env:Path = "$SdkRoot\cmdline-tools\latest\bin;$SdkRoot\platform-tools;$SdkRoot\emulator;$env:USERPROFILE\.cargo\bin;$env:Path"

  Write-Host "JAVA_HOME=$javaHome"
  Write-Host "ANDROID_HOME=$SdkRoot"
  Write-Host "NDK_HOME=$ndkHome"
}

function Get-AndroidTargetInfo {
  param([string]$Target)

  switch ($Target) {
    "aarch64" {
      return @{
        Abi = "arm64-v8a"
        GradleFlavor = "Arm64"
        OutputFlavor = "arm64"
        RustTriple = "aarch64-linux-android"
      }
    }
    "armv7" {
      return @{
        Abi = "armeabi-v7a"
        GradleFlavor = "Arm"
        OutputFlavor = "arm"
        RustTriple = "armv7-linux-androideabi"
      }
    }
    "i686" {
      return @{
        Abi = "x86"
        GradleFlavor = "X86"
        OutputFlavor = "x86"
        RustTriple = "i686-linux-android"
      }
    }
    "x86_64" {
      return @{
        Abi = "x86_64"
        GradleFlavor = "X86_64"
        OutputFlavor = "x86_64"
        RustTriple = "x86_64-linux-android"
      }
    }
    default {
      throw "Unsupported Android target: $Target"
    }
  }
}

function Invoke-GradleApkFallback {
  param(
    [string]$Target,
    [hashtable]$TargetInfo
  )

  Write-Step "Using Windows symlink fallback for $Target"

  $sourceLib = "src-tauri\target\$($TargetInfo.RustTriple)\debug\libblind_watermark_lib.so"
  if (-not (Test-Path $sourceLib)) {
    throw "Tauri did not produce the native library needed for fallback: $sourceLib"
  }

  $jniDir = "src-tauri\gen\android\app\src\main\jniLibs\$($TargetInfo.Abi)"
  New-Item -ItemType Directory -Force $jniDir | Out-Null
  Copy-Item -Force -LiteralPath $sourceLib -Destination (Join-Path $jniDir "libblind_watermark_lib.so")

  Push-Location "src-tauri\gen\android"
  try {
    $assembleTask = ":app:assemble$($TargetInfo.GradleFlavor)Debug"
    $skipRustTask = ":app:rustBuild$($TargetInfo.GradleFlavor)Debug"
    $gradleArgs = @(
      $assembleTask,
      "-x",
      $skipRustTask,
      "--console=plain",
      "--no-daemon",
      "-Pkotlin.incremental=false",
      "-Dkotlin.compiler.execution.strategy=in-process"
    )
    & .\gradlew.bat @gradleArgs
    Assert-LastExitCode "Gradle Android fallback build"
  }
  finally {
    Pop-Location
  }
}

Set-Location (Resolve-Path "$PSScriptRoot\..")

Use-AndroidEnvironment -SdkRoot $AndroidSdkRoot -NdkVersion $NdkVersion
$targetInfo = Get-AndroidTargetInfo -Target $Target
$isWindowsHost = [Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT

Write-Step "Validating required commands"
foreach ($command in @("node", "npm", "cargo", "rustup")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is required but was not found on PATH."
  }
}
node --version
npm --version
cargo --version
rustup target list --installed

if (-not $SkipProjectChecks) {
  Write-Step "Installing npm dependencies"
  npm install
  Assert-LastExitCode "npm install"

  Write-Step "Running frontend lint"
  npm run lint
  Assert-LastExitCode "npm run lint"

  Write-Step "Running frontend tests"
  npm test
  Assert-LastExitCode "npm test"

  Write-Step "Building web frontend"
  npm run build
  Assert-LastExitCode "npm run build"

  Write-Step "Running Rust tests"
  Push-Location src-tauri
  try {
    cargo test
    Assert-LastExitCode "cargo test"
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path "src-tauri\gen\android")) {
  Write-Step "Initializing Tauri Android project"
  npm exec -- tauri android init --ci
  Assert-LastExitCode "tauri android init"
}
else {
  Write-Step "Tauri Android project already initialized"
}

Write-Step "Building debug APK for $Target"
npm exec -- tauri android build --debug --apk --target $Target --ci
if ($LASTEXITCODE -ne 0) {
  if ($isWindowsHost) {
    Write-Host "tauri android build failed with exit code $LASTEXITCODE. Falling back to Gradle packaging without symlinks."
    Invoke-GradleApkFallback -Target $Target -TargetInfo $targetInfo
  }
  else {
    Assert-LastExitCode "tauri android build"
  }
}

Write-Step "Collecting APK artifact"
$outputsRoot = "src-tauri\gen\android\app\build\outputs"
if (-not (Test-Path $outputsRoot)) {
  throw "Android build outputs folder was not found: $outputsRoot"
}

$apk = Get-ChildItem -Path $outputsRoot -Recurse -Filter "*.apk" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $apk) {
  throw "No APK was produced under $outputsRoot."
}

$distAndroid = "dist-android"
New-Item -ItemType Directory -Force $distAndroid | Out-Null
$artifactName = "BlindWaterMark-$Target-debug.apk"
$artifactPath = Join-Path $distAndroid $artifactName
Copy-Item -Force -LiteralPath $apk.FullName -Destination $artifactPath

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $artifactPath
$hashPath = "$artifactPath.sha256"
"$($hash.Hash)  $artifactName" | Set-Content -Encoding ASCII -Path $hashPath

Write-Step "Android APK is ready"
Write-Host "APK: $((Resolve-Path $artifactPath).Path)"
Write-Host "SHA256: $($hash.Hash)"
