param(
  [string]$ApkPath = "$PSScriptRoot\..\dist-android\BlindWaterMark-aarch64-debug.apk",
  [string]$AndroidSdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$NdkVersion = "27.2.12479018",
  [string]$Abi = "arm64-v8a",
  [string]$PackageName = "com.qiaodogbear.blindwatermark",
  [switch]$SkipSignature
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

function Get-LatestBuildToolsPath {
  param([string]$SdkRoot)

  $buildToolsRoot = Join-Path $SdkRoot "build-tools"
  if (-not (Test-Path $buildToolsRoot)) {
    throw "Android build-tools folder was not found: $buildToolsRoot"
  }

  $latest = Get-ChildItem -LiteralPath $buildToolsRoot -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1

  if (-not $latest) {
    throw "No Android build-tools versions were found under $buildToolsRoot"
  }

  return $latest.FullName
}

function Get-NmPath {
  param(
    [string]$SdkRoot,
    [string]$NdkVersion
  )

  $preferredNdk = Join-Path $SdkRoot "ndk\$NdkVersion"
  $ndkRoot = $preferredNdk

  if (-not (Test-Path $ndkRoot)) {
    $ndkRoot = $env:NDK_HOME
  }

  if (-not $ndkRoot -or -not (Test-Path $ndkRoot)) {
    $ndkParent = Join-Path $SdkRoot "ndk"
    $latestNdk = Get-ChildItem -LiteralPath $ndkParent -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      Select-Object -First 1
    if ($latestNdk) {
      $ndkRoot = $latestNdk.FullName
    }
  }

  if (-not $ndkRoot -or -not (Test-Path $ndkRoot)) {
    throw "Android NDK was not found. Expected $preferredNdk or NDK_HOME."
  }

  $nm = Join-Path $ndkRoot "toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-nm.exe"
  if (-not (Test-Path $nm)) {
    throw "llvm-nm was not found: $nm"
  }

  return $nm
}

function Extract-NativeLibrary {
  param(
    [string]$Apk,
    [string]$Abi,
    [string]$Destination
  )

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $entryName = "lib/$Abi/libblind_watermark_lib.so"
  $zip = [System.IO.Compression.ZipFile]::OpenRead($Apk)
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq $entryName } | Select-Object -First 1
    if (-not $entry) {
      throw "APK does not contain required native library: $entryName"
    }

    $inputStream = $entry.Open()
    try {
      $outputStream = [System.IO.File]::Create($Destination)
      try {
        $inputStream.CopyTo($outputStream)
      }
      finally {
        $outputStream.Dispose()
      }
    }
    finally {
      $inputStream.Dispose()
    }
  }
  finally {
    $zip.Dispose()
  }
}

Set-Location (Resolve-Path "$PSScriptRoot\..")

if (-not (Test-Path $ApkPath)) {
  throw "APK was not found: $ApkPath"
}

$apkResolved = (Resolve-Path $ApkPath).Path
$buildToolsPath = Get-LatestBuildToolsPath -SdkRoot $AndroidSdkRoot
$aapt = Join-Path $buildToolsPath "aapt.exe"
$apksigner = Join-Path $buildToolsPath "apksigner.bat"
$nm = Get-NmPath -SdkRoot $AndroidSdkRoot -NdkVersion $NdkVersion

Write-Step "Verifying APK metadata"
if (-not (Test-Path $aapt)) {
  throw "aapt was not found: $aapt"
}

$badging = & $aapt dump badging $apkResolved
Assert-LastExitCode "aapt dump badging"

if (-not ($badging -match "package: name='$([regex]::Escape($PackageName))'")) {
  throw "APK package name is not $PackageName."
}

if (-not ($badging -match "native-code:.*'$([regex]::Escape($Abi))'")) {
  throw "APK native-code metadata does not include $Abi."
}

if (-not $SkipSignature) {
  Write-Step "Verifying APK signature"
  if (-not (Test-Path $apksigner)) {
    throw "apksigner was not found: $apksigner"
  }

  & $apksigner verify --verbose $apkResolved
  Assert-LastExitCode "apksigner verify"
}

Write-Step "Verifying Tauri Android JNI exports"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("BlindWaterMarkApkVerify-" + [guid]::NewGuid().ToString("N"))
$nativeLib = Join-Path $tempRoot "libblind_watermark_lib.so"
New-Item -ItemType Directory -Force $tempRoot | Out-Null

try {
  Extract-NativeLibrary -Apk $apkResolved -Abi $Abi -Destination $nativeLib

  $symbols = & $nm -D $nativeLib 2>&1
  Assert-LastExitCode "llvm-nm"

  $requiredSymbols = @(
    "Java_com_qiaodogbear_blindwatermark_Rust_create",
    "Java_com_qiaodogbear_blindwatermark_Rust_start",
    "Java_com_qiaodogbear_blindwatermark_Rust_ipc"
  )

  foreach ($symbol in $requiredSymbols) {
    if (-not ($symbols | Select-String -SimpleMatch $symbol -Quiet)) {
      throw "APK native library is missing required JNI symbol: $symbol"
    }
  }
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

Write-Step "Android APK verification passed"
Write-Host "APK: $apkResolved"
Write-Host "Package: $PackageName"
Write-Host "ABI: $Abi"
