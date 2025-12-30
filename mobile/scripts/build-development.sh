#!/bin/bash
# Bash script for building Development Builds on macOS/Linux
# Trinity Mobile - Google Sign-In Development Build Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
PLATFORM="all"
INSTALL=false
HELP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--platform)
            PLATFORM="$2"
            shift 2
            ;;
        -i|--install)
            INSTALL=true
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
    echo -e "${CYAN}🚀 Trinity Mobile - Development Build Script

USAGE:
    ./scripts/build-development.sh [OPTIONS]

OPTIONS:
    -p, --platform <platform>    Build for specific platform (android, ios, all)
                                 Default: all
    -i, --install               Install build on connected device after completion
    -h, --help                  Show this help message

EXAMPLES:
    ./scripts/build-development.sh
    ./scripts/build-development.sh --platform android
    ./scripts/build-development.sh --platform ios --install
    ./scripts/build-development.sh --install

REQUIREMENTS:
    - EAS CLI installed (npm install -g @expo/eas-cli)
    - Expo account configured (eas login)
    - Google Services files configured
    - Android SDK (for Android builds)
    - Xcode (for iOS builds, macOS only)

NOTES:
    - Development builds include Google Sign-In native dependencies
    - Builds are signed for internal distribution
    - Use --install to automatically install on connected devices${NC}"
}

test_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
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
    
    # Check if Google Services files exist
    if [[ -f "google-services.json" ]]; then
        echo -e "${GREEN}✅ Android Google Services file found${NC}"
    else
        echo -e "${YELLOW}⚠️  Android Google Services file not found: google-services.json${NC}"
        echo -e "${YELLOW}   Download from Firebase Console for production builds${NC}"
    fi
    
    if [[ -f "GoogleService-Info.plist" ]]; then
        echo -e "${GREEN}✅ iOS Google Services file found${NC}"
    else
        echo -e "${YELLOW}⚠️  iOS Google Services file not found: GoogleService-Info.plist${NC}"
        echo -e "${YELLOW}   Download from Firebase Console for production builds${NC}"
    fi
    
    # Check platform-specific requirements
    if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
        if command -v adb &> /dev/null; then
            echo -e "${GREEN}✅ Android SDK (ADB) found${NC}"
        else
            echo -e "${YELLOW}⚠️  ADB not found - install Android SDK for device installation${NC}"
        fi
    fi
    
    if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            if command -v xcrun &> /dev/null; then
                echo -e "${GREEN}✅ Xcode tools found${NC}"
            else
                echo -e "${YELLOW}⚠️  Xcode not found - required for iOS builds${NC}"
            fi
        else
            echo -e "${YELLOW}ℹ️  iOS builds require macOS with Xcode${NC}"
        fi
    fi
    
    return 0
}

start_build() {
    local build_platform=$1
    
    echo -e "${BLUE}🏗️  Starting Development Build for $build_platform...${NC}"
    
    local build_command="eas build --profile development"
    
    if [[ "$build_platform" != "all" ]]; then
        build_command+=" --platform $build_platform"
    fi
    
    echo -e "${CYAN}Executing: $build_command${NC}"
    
    if $build_command; then
        echo -e "${GREEN}✅ Build completed successfully!${NC}"
        return 0
    else
        echo -e "${RED}❌ Build failed${NC}"
        return 1
    fi
}

install_build() {
    local build_platform=$1
    
    echo -e "${BLUE}📱 Installing build on connected devices...${NC}"
    
    if [[ "$build_platform" == "android" || "$build_platform" == "all" ]]; then
        echo -e "${CYAN}Installing Android build...${NC}"
        if command -v adb &> /dev/null; then
            # Check for connected Android devices
            DEVICES=$(adb devices 2>/dev/null | grep -E "device$" | wc -l)
            if [[ $DEVICES -gt 0 ]]; then
                echo -e "${GREEN}📱 $DEVICES Android device(s) detected${NC}"
                echo -e "${YELLOW}ℹ️  Download and install the APK from EAS Build dashboard${NC}"
                echo -e "${YELLOW}   Or use: eas build:run --platform android --latest${NC}"
            else
                echo -e "${YELLOW}⚠️  No Android devices connected${NC}"
            fi
        else
            echo -e "${YELLOW}⚠️  ADB not found - install Android SDK${NC}"
        fi
    fi
    
    if [[ "$build_platform" == "ios" || "$build_platform" == "all" ]]; then
        echo -e "${CYAN}Installing iOS build...${NC}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            if command -v xcrun &> /dev/null; then
                echo -e "${GREEN}📱 iOS Simulator available${NC}"
                echo -e "${YELLOW}ℹ️  Download and install from EAS Build dashboard${NC}"
                echo -e "${YELLOW}   Or use: eas build:run --platform ios --latest${NC}"
            else
                echo -e "${YELLOW}⚠️  Xcode not found - iOS builds require macOS with Xcode${NC}"
            fi
        else
            echo -e "${YELLOW}ℹ️  iOS installation requires macOS${NC}"
            echo -e "${YELLOW}   Download from EAS Build dashboard and install via Xcode${NC}"
        fi
    fi
}

show_post_build_instructions() {
    echo -e "${CYAN}
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
- View logs: eas build:view [build-id]${NC}"
}

# Main execution
if [[ "$HELP" == true ]]; then
    show_help
    exit 0
fi

echo -e "${CYAN}🚀 Trinity Mobile - Development Build Script
============================================
Platform: $PLATFORM
Install: $INSTALL${NC}"

# Check prerequisites
if ! test_prerequisites; then
    echo -e "${RED}❌ Prerequisites check failed. Please resolve issues above.${NC}"
    exit 1
fi

# Validate platform parameter
case $PLATFORM in
    android|ios|all)
        ;;
    *)
        echo -e "${RED}❌ Invalid platform: $PLATFORM${NC}"
        echo -e "${YELLOW}Valid platforms: android, ios, all${NC}"
        exit 1
        ;;
esac

# Start build process
if start_build "$PLATFORM"; then
    if [[ "$INSTALL" == true ]]; then
        install_build "$PLATFORM"
    fi
    
    show_post_build_instructions
else
    echo -e "${RED}❌ Build failed!

COMMON ISSUES:
- Check Google Services files are present and valid
- Verify Expo account has necessary permissions
- Ensure app.json configuration is correct
- Check network connection for build uploads

For detailed logs, check the EAS Build dashboard.${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 Script completed successfully!${NC}"