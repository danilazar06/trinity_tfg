# PowerShell script for building Development Builds on Windows
# Trinity Mobile - Google Sign-In Development Build Script

param(
    [string]$Platform = "all",
    [switch]$Install = $false,
    [switch]$Help = $false
)

# Colors for output
$Red = [System.ConsoleColor]::Red
$Green = [System.ConsoleColor]::Green
$Yellow = [System.ConsoleColor]::Yellow
$Blue = [System.ConsoleColor]::Blue
$Cyan = [System.ConsoleColor]::Cyan

function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    } else {
        $input | Write-Output
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Show-Help {
    Write-ColorOutput $Cyan @"
🚀 Trinity Mobile - Development Build Script

USAGE:
    .\scripts\build-development.ps1 [OPTIONS]

OPTIONS:
    -Platform <platform>    Build for specific platform (android, ios, all)
                           Default: all
    -Install               Install build on connected device after completion
    -Help                  Show this help message

EXAMPLES:
    .\scripts\build-development.ps1
    .\scripts\build-development.ps1 -Platform android
    .\scripts\build-development.ps1 -Platform ios -Install
    .\scripts\build-development.ps1 -Install

REQUIREMENTS:
    - EAS CLI installed (npm install -g @expo/eas-cli)
    - Expo account configured (eas login)
    - Google Services files configured
    - Android SDK (for Android builds)
    - Xcode (for iOS builds, macOS only)

NOTES:
    - Development builds include Google Sign-In native dependencies
    - Builds are signed for internal distribution
    - Use -Install to automatically install on connected devices
"@
}

function Test-Prerequisites {
    Write-ColorOutput $Blue "🔍 Checking prerequisites..."
    
    # Check if EAS CLI is installed
    try {
        $easVersion = eas --version 2>$null
        Write-ColorOutput $Green "✅ EAS CLI found: $easVersion"
    } catch {
        Write-ColorOutput $Red "❌ EAS CLI not found. Install with: npm install -g @expo/eas-cli"
        return $false
    }
    
    # Check if logged in to Expo
    try {
        $whoami = eas whoami 2>$null
        if ($whoami -match "Not logged in") {
            Write-ColorOutput $Red "❌ Not logged in to Expo. Run: eas login"
            return $false
        }
        Write-ColorOutput $Green "✅ Logged in to Expo as: $whoami"
    } catch {
        Write-ColorOutput $Red "❌ Unable to check Expo login status"
        return $false
    }
    
    # Check if Google Services files exist
    $googleServicesAndroid = "google-services.json"
    $googleServicesIos = "GoogleService-Info.plist"
    
    if (Test-Path $googleServicesAndroid) {
        Write-ColorOutput $Green "✅ Android Google Services file found"
    } else {
        Write-ColorOutput $Yellow "⚠️  Android Google Services file not found: $googleServicesAndroid"
        Write-ColorOutput $Yellow "   Download from Firebase Console for production builds"
    }
    
    if (Test-Path $googleServicesIos) {
        Write-ColorOutput $Green "✅ iOS Google Services file found"
    } else {
        Write-ColorOutput $Yellow "⚠️  iOS Google Services file not found: $googleServicesIos"
        Write-ColorOutput $Yellow "   Download from Firebase Console for production builds"
    }
    
    return $true
}

function Start-Build {
    param([string]$BuildPlatform)
    
    Write-ColorOutput $Blue "🏗️  Starting Development Build for $BuildPlatform..."
    
    $buildCommand = "eas build --profile development"
    
    if ($BuildPlatform -ne "all") {
        $buildCommand += " --platform $BuildPlatform"
    }
    
    Write-ColorOutput $Cyan "Executing: $buildCommand"
    
    try {
        Invoke-Expression $buildCommand
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput $Green "✅ Build completed successfully!"
            return $true
        } else {
            Write-ColorOutput $Red "❌ Build failed with exit code: $LASTEXITCODE"
            return $false
        }
    } catch {
        Write-ColorOutput $Red "❌ Build failed: $($_.Exception.Message)"
        return $false
    }
}

function Install-Build {
    param([string]$BuildPlatform)
    
    Write-ColorOutput $Blue "📱 Installing build on connected devices..."
    
    if ($BuildPlatform -eq "android" -or $BuildPlatform -eq "all") {
        Write-ColorOutput $Cyan "Installing Android build..."
        try {
            # Check for connected Android devices
            $devices = adb devices 2>$null
            if ($devices -match "device$") {
                Write-ColorOutput $Green "📱 Android device(s) detected"
                Write-ColorOutput $Yellow "ℹ️  Download and install the APK from EAS Build dashboard"
                Write-ColorOutput $Yellow "   Or use: eas build:run --platform android --latest"
            } else {
                Write-ColorOutput $Yellow "⚠️  No Android devices connected"
            }
        } catch {
            Write-ColorOutput $Yellow "⚠️  ADB not found - install Android SDK"
        }
    }
    
    if ($BuildPlatform -eq "ios" -or $BuildPlatform -eq "all") {
        Write-ColorOutput $Cyan "Installing iOS build..."
        if ($IsMacOS) {
            try {
                # Check for connected iOS devices
                $devices = xcrun simctl list devices 2>$null
                Write-ColorOutput $Green "📱 iOS Simulator available"
                Write-ColorOutput $Yellow "ℹ️  Download and install from EAS Build dashboard"
                Write-ColorOutput $Yellow "   Or use: eas build:run --platform ios --latest"
            } catch {
                Write-ColorOutput $Yellow "⚠️  Xcode not found - iOS builds require macOS with Xcode"
            }
        } else {
            Write-ColorOutput $Yellow "ℹ️  iOS installation requires macOS"
            Write-ColorOutput $Yellow "   Download from EAS Build dashboard and install via Xcode"
        }
    }
}

function Show-PostBuildInstructions {
    Write-ColorOutput $Cyan @"

🎉 Development Build Process Complete!

NEXT STEPS:
1. 📱 Download your build from: https://expo.dev/accounts/[your-account]/projects/trinity/builds
2. 🔧 Install on your device:
   - Android: Install APK directly or use ADB
   - iOS: Install via Xcode or TestFlight (if configured)
3. 🧪 Test Google Sign-In functionality
4. 🐛 Use React Native Debugger for debugging

TESTING GOOGLE SIGN-IN:
- Open the app and navigate to Login screen
- Try Google Sign-In button
- Check Debug > Google Sign-In Test screen for diagnostics
- Verify fallback behavior in different scenarios

TROUBLESHOOTING:
- If Google Sign-In doesn't work, check Google Services configuration
- Ensure Firebase Console is properly configured
- Verify app signing certificates match Firebase configuration
- Check device logs for detailed error messages

USEFUL COMMANDS:
- View builds: eas build:list
- Download build: eas build:run --platform [android|ios] --latest
- View logs: eas build:view [build-id]
"@
}

# Main execution
if ($Help) {
    Show-Help
    exit 0
}

Write-ColorOutput $Cyan @"
🚀 Trinity Mobile - Development Build Script
============================================
Platform: $Platform
Install: $Install
"@

# Check prerequisites
if (-not (Test-Prerequisites)) {
    Write-ColorOutput $Red "❌ Prerequisites check failed. Please resolve issues above."
    exit 1
}

# Validate platform parameter
$validPlatforms = @("android", "ios", "all")
if ($Platform -notin $validPlatforms) {
    Write-ColorOutput $Red "❌ Invalid platform: $Platform"
    Write-ColorOutput $Yellow "Valid platforms: $($validPlatforms -join ', ')"
    exit 1
}

# Start build process
$buildSuccess = Start-Build -BuildPlatform $Platform

if ($buildSuccess) {
    if ($Install) {
        Install-Build -BuildPlatform $Platform
    }
    
    Show-PostBuildInstructions
} else {
    Write-ColorOutput $Red @"
❌ Build failed!

COMMON ISSUES:
- Check Google Services files are present and valid
- Verify Expo account has necessary permissions
- Ensure app.json configuration is correct
- Check network connection for build uploads

For detailed logs, check the EAS Build dashboard.
"@
    exit 1
}

Write-ColorOutput $Green "🎉 Script completed successfully!"