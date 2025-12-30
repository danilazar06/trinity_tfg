# PowerShell script for installing Development Builds on Windows
# Trinity Mobile - Google Sign-In Development Build Installation Script

param(
    [string]$Platform = "android",
    [string]$BuildId = "",
    [switch]$Latest = $false,
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
📱 Trinity Mobile - Development Build Installation Script

USAGE:
    .\scripts\install-development-build.ps1 [OPTIONS]

OPTIONS:
    -Platform <platform>    Platform to install (android, ios)
                           Default: android
    -BuildId <id>          Specific build ID to install
    -Latest                Install the latest build
    -Help                  Show this help message

EXAMPLES:
    .\scripts\install-development-build.ps1 -Latest
    .\scripts\install-development-build.ps1 -Platform android -Latest
    .\scripts\install-development-build.ps1 -BuildId abc123def456
    .\scripts\install-development-build.ps1 -Platform ios -Latest

REQUIREMENTS:
    - EAS CLI installed and logged in
    - For Android: ADB installed and device connected
    - For iOS: macOS with Xcode (device or simulator)

NOTES:
    - Development builds include Google Sign-In native dependencies
    - Ensure your device is connected and in developer mode
    - iOS installation requires macOS
"@
}

function Test-Prerequisites {
    param([string]$TargetPlatform)
    
    Write-ColorOutput $Blue "🔍 Checking prerequisites for $TargetPlatform..."
    
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
    
    # Platform-specific checks
    if ($TargetPlatform -eq "android") {
        try {
            $adbVersion = adb version 2>$null
            Write-ColorOutput $Green "✅ ADB found"
            
            # Check for connected devices
            $devices = adb devices 2>$null
            if ($devices -match "device$") {
                Write-ColorOutput $Green "✅ Android device(s) connected"
            } else {
                Write-ColorOutput $Yellow "⚠️  No Android devices connected"
                Write-ColorOutput $Yellow "   Connect your Android device and enable USB debugging"
                return $false
            }
        } catch {
            Write-ColorOutput $Red "❌ ADB not found. Install Android SDK"
            return $false
        }
    }
    
    if ($TargetPlatform -eq "ios") {
        if ($IsMacOS) {
            try {
                $xcodeVersion = xcrun --version 2>$null
                Write-ColorOutput $Green "✅ Xcode tools found"
            } catch {
                Write-ColorOutput $Red "❌ Xcode not found. Install Xcode from App Store"
                return $false
            }
        } else {
            Write-ColorOutput $Red "❌ iOS installation requires macOS"
            return $false
        }
    }
    
    return $true
}

function Get-LatestBuild {
    param([string]$TargetPlatform)
    
    Write-ColorOutput $Blue "🔍 Finding latest $TargetPlatform build..."
    
    try {
        $builds = eas build:list --platform=$TargetPlatform --status=finished --limit=1 --json 2>$null | ConvertFrom-Json
        
        if ($builds -and $builds.Count -gt 0) {
            $latestBuild = $builds[0]
            Write-ColorOutput $Green "✅ Latest build found: $($latestBuild.id)"
            Write-ColorOutput $Cyan "   Status: $($latestBuild.status)"
            Write-ColorOutput $Cyan "   Created: $($latestBuild.createdAt)"
            return $latestBuild.id
        } else {
            Write-ColorOutput $Red "❌ No finished builds found for $TargetPlatform"
            return $null
        }
    } catch {
        Write-ColorOutput $Red "❌ Error fetching builds: $($_.Exception.Message)"
        return $null
    }
}

function Install-Build {
    param(
        [string]$TargetPlatform,
        [string]$TargetBuildId
    )
    
    Write-ColorOutput $Blue "📱 Installing $TargetPlatform build: $TargetBuildId"
    
    $installCommand = "eas build:run --platform $TargetPlatform"
    
    if ($TargetBuildId) {
        $installCommand += " --id $TargetBuildId"
    } else {
        $installCommand += " --latest"
    }
    
    Write-ColorOutput $Cyan "Executing: $installCommand"
    
    try {
        Invoke-Expression $installCommand
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput $Green "✅ Installation completed successfully!"
            return $true
        } else {
            Write-ColorOutput $Red "❌ Installation failed with exit code: $LASTEXITCODE"
            return $false
        }
    } catch {
        Write-ColorOutput $Red "❌ Installation failed: $($_.Exception.Message)"
        return $false
    }
}

function Show-PostInstallInstructions {
    param([string]$TargetPlatform)
    
    Write-ColorOutput $Cyan @"

🎉 Development Build Installation Complete!

NEXT STEPS:
1. 🚀 Launch the Trinity app on your device
2. 🔐 Test Google Sign-In functionality:
   - Navigate to Login screen
   - Try the Google Sign-In button
   - Check for proper authentication flow
3. 🧪 Use Debug > Google Sign-In Test for diagnostics
4. 🐛 Check device logs if issues occur

TESTING CHECKLIST:
□ App launches successfully
□ Google Sign-In button appears (if available)
□ Authentication flow works correctly
□ Fallback to email/password works
□ Error messages are clear and helpful

TROUBLESHOOTING:
- If Google Sign-In doesn't work, check Google Services configuration
- Verify Firebase Console setup matches your app
- Check device logs for detailed error messages
- Ensure device has Google Play Services (Android)

USEFUL COMMANDS:
- View device logs: adb logcat (Android)
- View builds: eas build:list
- View build details: eas build:view [build-id]
"@

    if ($TargetPlatform -eq "android") {
        Write-ColorOutput $Yellow @"

ANDROID SPECIFIC:
- Check Google Play Services are installed and updated
- Verify app signing certificate matches Firebase configuration
- Use 'adb logcat | grep Trinity' for app-specific logs
"@
    }
    
    if ($TargetPlatform -eq "ios") {
        Write-ColorOutput $Yellow @"

iOS SPECIFIC:
- Check device is registered in Apple Developer account
- Verify provisioning profile includes your device
- Use Xcode Console for detailed logs
"@
    }
}

# Main execution
if ($Help) {
    Show-Help
    exit 0
}

Write-ColorOutput $Cyan @"
📱 Trinity Mobile - Development Build Installation Script
========================================================
Platform: $Platform
Build ID: $(if ($BuildId) { $BuildId } else { "Latest" })
"@

# Validate platform parameter
$validPlatforms = @("android", "ios")
if ($Platform -notin $validPlatforms) {
    Write-ColorOutput $Red "❌ Invalid platform: $Platform"
    Write-ColorOutput $Yellow "Valid platforms: $($validPlatforms -join ', ')"
    exit 1
}

# Check prerequisites
if (-not (Test-Prerequisites -TargetPlatform $Platform)) {
    Write-ColorOutput $Red "❌ Prerequisites check failed. Please resolve issues above."
    exit 1
}

# Determine build ID to install
$targetBuildId = $BuildId
if ($Latest -or -not $BuildId) {
    $targetBuildId = Get-LatestBuild -TargetPlatform $Platform
    if (-not $targetBuildId) {
        Write-ColorOutput $Red "❌ Could not find build to install"
        exit 1
    }
}

# Install the build
$installSuccess = Install-Build -TargetPlatform $Platform -TargetBuildId $targetBuildId

if ($installSuccess) {
    Show-PostInstallInstructions -TargetPlatform $Platform
} else {
    Write-ColorOutput $Red @"
❌ Installation failed!

COMMON ISSUES:
- Device not connected or not in developer mode
- Build not compatible with device architecture
- Insufficient storage space on device
- Network issues downloading build

Try:
1. Reconnect your device
2. Enable developer mode and USB debugging
3. Check device storage space
4. Try installing manually from EAS dashboard
"@
    exit 1
}

Write-ColorOutput $Green "🎉 Script completed successfully!"