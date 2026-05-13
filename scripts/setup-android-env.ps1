param(
  [string]$AndroidSdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$NdkVersion = "27.2.12479018",
  [string]$AndroidPlatform = "android-36",
  [string]$BuildToolsVersion = "35.0.0",
  [switch]$SkipAndroidStudio
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

function Set-UserEnvironment {
  param(
    [string]$Name,
    [string]$Value
  )
  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Set-Item -Path "Env:$Name" -Value $Value
}

function Add-UserPathEntry {
  param([string]$Entry)

  $expandedEntry = [Environment]::ExpandEnvironmentVariables($Entry).TrimEnd("\")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $userParts = @()
  if ($userPath) {
    $userParts = $userPath -split ";" | Where-Object { $_ }
  }

  $alreadyInUserPath = $false
  foreach ($part in $userParts) {
    if ([Environment]::ExpandEnvironmentVariables($part).TrimEnd("\") -ieq $expandedEntry) {
      $alreadyInUserPath = $true
      break
    }
  }

  if (-not $alreadyInUserPath) {
    $newPath = if ($userPath) { "$userPath;$Entry" } else { $Entry }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  }

  $processParts = $env:Path -split ";" | Where-Object { $_ }
  $alreadyInProcessPath = $false
  foreach ($part in $processParts) {
    if ([Environment]::ExpandEnvironmentVariables($part).TrimEnd("\") -ieq $expandedEntry) {
      $alreadyInProcessPath = $true
      break
    }
  }

  if (-not $alreadyInProcessPath) {
    $env:Path = "$expandedEntry;$env:Path"
  }
}

function Resolve-CommandLineToolsUrl {
  Write-Step "Resolving latest Android command-line tools URL"
  $studioPage = Invoke-WebRequest -UseBasicParsing "https://developer.android.com/studio"
  $match = [regex]::Match(
    $studioPage.Content,
    "https://dl\.google\.com/android/repository/commandlinetools-win-[^`"'<>\s]+_latest\.zip"
  )
  if (-not $match.Success) {
    throw "Could not locate the official Android command-line tools download URL on developer.android.com/studio."
  }
  return $match.Value
}

function Install-AndroidStudio {
  $studioJbr = "C:\Program Files\Android\Android Studio\jbr"
  if (Test-Path (Join-Path $studioJbr "bin\java.exe")) {
    Write-Host "Android Studio JBR found at $studioJbr"
    return $studioJbr
  }

  if ($SkipAndroidStudio) {
    throw "Android Studio JBR was not found and -SkipAndroidStudio was specified."
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is required to install Android Studio automatically."
  }

  Write-Step "Installing Android Studio with winget"
  & winget install --id Google.AndroidStudio -e --accept-package-agreements --accept-source-agreements | Out-Host
  Assert-LastExitCode "Android Studio installation"

  if (-not (Test-Path (Join-Path $studioJbr "bin\java.exe"))) {
    throw "Android Studio installed, but JBR was not found at $studioJbr."
  }

  return $studioJbr
}

function Install-CommandLineTools {
  param([string]$SdkRoot)

  $sdkManager = Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"
  if (Test-Path $sdkManager) {
    Write-Host "Android command-line tools already found at $sdkManager"
    return $sdkManager
  }

  $toolsUrl = Resolve-CommandLineToolsUrl
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("blindwatermark-android-tools-" + [guid]::NewGuid())
  $zipPath = Join-Path $tempRoot "commandlinetools.zip"
  $extractPath = Join-Path $tempRoot "extract"
  $latestPath = Join-Path $SdkRoot "cmdline-tools\latest"

  New-Item -ItemType Directory -Force $tempRoot, $extractPath, $latestPath | Out-Null

  try {
    Write-Step "Downloading Android command-line tools"
    Invoke-WebRequest -UseBasicParsing -Uri $toolsUrl -OutFile $zipPath

    Write-Step "Extracting Android command-line tools"
    Expand-Archive -Force -Path $zipPath -DestinationPath $extractPath

    $source = Join-Path $extractPath "cmdline-tools"
    if (-not (Test-Path (Join-Path $source "bin\sdkmanager.bat"))) {
      throw "Downloaded command-line tools archive did not contain cmdline-tools\bin\sdkmanager.bat."
    }

    Copy-Item -Force -Recurse -Path (Join-Path $source "*") -Destination $latestPath
  }
  finally {
    if (Test-Path $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }

  if (-not (Test-Path $sdkManager)) {
    throw "sdkmanager was not installed at $sdkManager."
  }

  return $sdkManager
}

function Invoke-SdkManager {
  param(
    [string]$SdkManager,
    [string[]]$Arguments
  )
  & $SdkManager "--sdk_root=$AndroidSdkRoot" @Arguments
  Assert-LastExitCode "sdkmanager $($Arguments -join ' ')"
}

Write-Step "Preparing Android SDK root on C drive"
New-Item -ItemType Directory -Force $AndroidSdkRoot | Out-Null

$javaHome = Install-AndroidStudio
Set-UserEnvironment "JAVA_HOME" $javaHome
Set-UserEnvironment "ANDROID_HOME" $AndroidSdkRoot
Set-UserEnvironment "ANDROID_SDK_ROOT" $AndroidSdkRoot

Add-UserPathEntry "%USERPROFILE%\.cargo\bin"
Add-UserPathEntry "$AndroidSdkRoot\cmdline-tools\latest\bin"
Add-UserPathEntry "$AndroidSdkRoot\platform-tools"
Add-UserPathEntry "$AndroidSdkRoot\emulator"

$sdkManager = Install-CommandLineTools -SdkRoot $AndroidSdkRoot

Write-Step "Accepting Android SDK licenses"
1..80 | ForEach-Object { "y" } | & $sdkManager "--sdk_root=$AndroidSdkRoot" --licenses
Assert-LastExitCode "Android SDK license acceptance"

Write-Step "Installing Android SDK, build tools, NDK, and CMake"
$sdkPackages = @(
  "platform-tools",
  "platforms;$AndroidPlatform",
  "build-tools;$BuildToolsVersion",
  "ndk;$NdkVersion",
  "cmake;3.22.1"
)
Invoke-SdkManager -SdkManager $sdkManager -Arguments $sdkPackages

$ndkHome = Join-Path $AndroidSdkRoot "ndk\$NdkVersion"
if (-not (Test-Path $ndkHome)) {
  throw "NDK was not installed at $ndkHome."
}
Set-UserEnvironment "NDK_HOME" $ndkHome

Write-Step "Installing Rust Android targets"
if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
  throw "rustup is required before Android targets can be installed."
}
$rustTargets = @(
  "aarch64-linux-android",
  "armv7-linux-androideabi",
  "i686-linux-android",
  "x86_64-linux-android"
)
& rustup target add @rustTargets
Assert-LastExitCode "Rust Android target installation"

Write-Step "Validating Android toolchain"
& (Join-Path $javaHome "bin\java.exe") -version
Assert-LastExitCode "java validation"
& $sdkManager "--sdk_root=$AndroidSdkRoot" --version
Assert-LastExitCode "sdkmanager validation"
& (Join-Path $AndroidSdkRoot "platform-tools\adb.exe") version
Assert-LastExitCode "adb validation"
& rustup target list --installed
Assert-LastExitCode "rustup target validation"

Write-Step "Android environment is ready"
Write-Host "ANDROID_HOME=$AndroidSdkRoot"
Write-Host "ANDROID_SDK_ROOT=$AndroidSdkRoot"
Write-Host "NDK_HOME=$ndkHome"
Write-Host "JAVA_HOME=$javaHome"
