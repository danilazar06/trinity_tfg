#!/bin/bash
# Bash script for installing Development Builds on macOS/Linux
# Trinity Mobile - Google Sign-In Development Build Installation Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
PLATFORM="android"
BUILD_ID=""
LATEST=false
HELP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--platform)
            PLATFORM="$2"
            shift 2
            ;;
        -b|--build-id)
            BUILD_ID="$2"
            shift 2
            ;;
        -l|--latest)
            LATEST=true
            shift
            ;;
        -h|--help)
            HELP=true
            shift
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

show_help() {
    echo -e "${CYAN}📱 Trinity Mobile - Development Build Installation Script

USAGE:
    ./scripts/install-development-build.sh [OPTIONS]

OPTIONS:
    -p, --platform <platform>    Platform to install (android, ios)
                                 Default: android
    -b, --build-id <id>          Specific build ID to install
    -l, --latest                 Install the latest build
    -h, --help                   Show this help message

EXAMPLES:
    ./scripts/install-development-build.sh --latest
    ./scripts/install-development-build.sh --platform android --latest
    ./scripts/install-development-build.sh --build-id abc123def456
    ./scripts/install-development-build.sh --platform ios --latest

REQUIREMENTS:
    - EAS CLI installed and logged in
    - For Android: ADB installed and device connected
    - For iOS: macOS with Xcode (device or simulator)

NOTES:
    - Development builds include Google Sign-In native dependencies
    - Ensure your device is connected and in developer mode
    - iOS installation requires macOS${NC}"
}

test_prerequisites() {
    local target_platform=$1
    
    echo -e "${BLUE}🔍 Checking prerequisites for $target_platform...${NC}"
    
    # Check if EAS CLI is installed
    if command -v eas &> /dev/null; then
        EAS_VERSION=$(eas --version 2>/dev/null || echo "unknown")
        echo -e "${GREEN}✅ EAS CLI found: $EAS_VERSION${NC}"
    else
        echo -e "${RED}❌ EAS CLI not found. Install with: npm install -g @expo/eas-cli${NC}"
        return 1
    fi
    
    # Check if logged in to Expo
    WHOAMI=$(eas whoami 2>/dev/null || echo "Not logged in")
    if [[ "$WHOAMI" == *"Not logged in"* ]]; then
        echo -e "${RED}❌ Not logged in to Expo. Run: eas login${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Logged in to Expo as: $WHOAMI${NC}"
    fi
    
    # Platform-specific checks
    if [[ "$target_platform" == "android" ]]; then
        if command -v adb &> /dev/null; then
            echo -e "${GREEN}✅ ADB found${NC}"
            
            # Check for connected devices
            DEVICES=$(adb devices 2>/dev/null | grep -E "device$" | wc -l)
            if [[ $DEVICES -gt 0 ]]; then
                echo -e "${GREEN}✅ $DEVICES Android device(s) connected${NC}"
            else
                echo -e "${YELLOW}⚠️  No Android devices connected${NC}"
                echo -e "${YELLOW}   Connect your Android device and enable USB debugging${NC}"
                return 1
            fi
        else
            echo -e "${RED}❌ ADB not found. Install Android SDK${NC}"
            return 1
        fi
    fi
    
    if [[ "$target_platform" == "ios" ]]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            if command -v xcrun &> /dev/null; then
                echo -e "${GREEN}✅ Xcode tools found${NC}"
            else
                echo -e "${RED}❌ Xcode not found. Install Xcode from App Store${NC}"
                return 1
            fi
        else
            echo -e "${RED}❌ iOS installation requires macOS${NC}"
            return 1
        fi
    fi
    
    return 0
}

get_latest_build() {
    local target_platform=$1
    
    echo -e "${BLUE}🔍 Finding latest $target_platform build...${NC}"
    
    local builds_json
    builds_json=$(eas build:list --platform="$target_platform" --status=finished --limit=1 --json 2>/dev/null || echo "[]")
    
    if [[ "$builds_json" != "[]" ]] && [[ -n "$builds_json" ]]; then
        local build_id
        build_id=$(echo "$builds_json" | jq -r '.[0].id' 2>/dev/null || echo "")
        
        if [[ -n "$build_id" && "$build_id" != "null" ]]; then
            echo -e "${GREEN}✅ Latest build found: $build_id${NC}"
            
            local status
            status=$(echo "$builds_json" | jq -r '.[0].status' 2>/dev/null || echo "unknown")
            local created_at
            created_at=$(echo "$builds_json" | jq -r '.[0].createdAt' 2>/dev/null || echo "unknown")
            
            echo -e "${CYAN}   Status: $status${NC}"
            echo -e "${CYAN}   Created: $created_at${NC}"
            echo "$build_id"
            return 0
        fi
    fi
    
    echo -e "${RED}❌ No finished builds found for $target_platform${NC}"
    return 1
}

install_build() {
    local target_platform=$1
    local target_build_id=$2
    
    echo -e "${BLUE}📱 Installing $target_platform build: $target_build_id${NC}"
    
    local install_command="eas build:run --platform $target_platform"
    
    if [[ -n "$target_build_id" ]]; then
        install_command+=" --id $target_build_id"
    else
        install_command+=" --latest"
    fi
    
    echo -e "${CYAN}Executing: $install_command${NC}"
    
    if $install_command; then
        echo -e "${GREEN}✅ Installation completed successfully!${NC}"
        return 0
    else
        echo -e "${RED}❌ Installation failed${NC}"
        return 1
    fi
}

show_post_install_instructions() {
    local target_platform=$1
    
    echo -e "${CYAN}
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
- View build details: eas build:view [build-id]${NC}"

    if [[ "$target_platform" == "android" ]]; then
        echo -e "${YELLOW}
ANDROID SPECIFIC:
- Check Google Play Services are installed and updated
- Verify app signing certificate matches Firebase configuration
- Use 'adb logcat | grep Trinity' for app-specific logs${NC}"
    fi
    
    if [[ "$target_platform" == "ios" ]]; then
        echo -e "${YELLOW}
iOS SPECIFIC:
- Check device is registered in Apple Developer account
- Verify provisioning profile includes your device
- Use Xcode Console for detailed logs${NC}"
    fi
}

# Main execution
if [[ "$HELP" == true ]]; then
    show_help
    exit 0
fi

echo -e "${CYAN}📱 Trinity Mobile - Development Build Installation Script
========================================================
Platform: $PLATFORM
Build ID: $(if [[ -n "$BUILD_ID" ]]; then echo "$BUILD_ID"; else echo "Latest"; fi)${NC}"

# Validate platform parameter
case $PLATFORM in
    android|ios)
        ;;
    *)
        echo -e "${RED}❌ Invalid platform: $PLATFORM${NC}"
        echo -e "${YELLOW}Valid platforms: android, ios${NC}"
        exit 1
        ;;
esac

# Check prerequisites
if ! test_prerequisites "$PLATFORM"; then
    echo -e "${RED}❌ Prerequisites check failed. Please resolve issues above.${NC}"
    exit 1
fi

# Determine build ID to install
TARGET_BUILD_ID="$BUILD_ID"
if [[ "$LATEST" == true || -z "$BUILD_ID" ]]; then
    if ! TARGET_BUILD_ID=$(get_latest_build "$PLATFORM"); then
        echo -e "${RED}❌ Could not find build to install${NC}"
        exit 1
    fi
fi

# Install the build
if install_build "$PLATFORM" "$TARGET_BUILD_ID"; then
    show_post_install_instructions "$PLATFORM"
else
    echo -e "${RED}❌ Installation failed!

COMMON ISSUES:
- Device not connected or not in developer mode
- Build not compatible with device architecture
- Insufficient storage space on device
- Network issues downloading build

Try:
1. Reconnect your device
2. Enable developer mode and USB debugging
3. Check device storage space
4. Try installing manually from EAS dashboard${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 Script completed successfully!${NC}"