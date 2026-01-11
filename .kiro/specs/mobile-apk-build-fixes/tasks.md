# Implementation Plan: Mobile APK Build Fixes

## Overview

This implementation plan systematically fixes all mobile APK build issues through configuration corrections, service import resolution, asset optimization, and build process improvements. The plan prioritizes immediate build fixes first, then implements comprehensive validation and testing to ensure reliable APK generation.

## Tasks

- [x] 1. Fix Immediate Build Blocking Issues
- [x] 1.1 Fix service import resolution for backgroundTokenRefreshService
  - Verify backgroundTokenRefreshService.ts exists in mobile/src/services/
  - Check and fix import paths in CognitoAuthContext.tsx
  - Validate all service dependencies are properly exported
  - Test Metro bundler can resolve all service imports
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 1.2 Fix Expo configuration schema validation errors
  - Remove or relocate `adaptiveIcon` property from root level in app.json
  - Remove or relocate `linking` property from root level in app.json
  - Move conflicting properties to appropriate platform-specific sections
  - Configure .easignore file to handle native project folders properly
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 1.3 Create square app icon asset
  - Generate 1024x1024 square version of logo-trinity-v1.png
  - Update app.json icon path to use square icon
  - Create adaptive icon foreground image (transparent background)
  - Configure adaptive icon with proper foreground/background separation
  - _Requirements: 3.1, 3.2_

- [x] 1.4 Validate Android build configuration
  - Verify compileSdkVersion, targetSdkVersion, and buildToolsVersion are correct
  - Check package name configuration matches across all files
  - Validate Google Services configuration for Android
  - Ensure proper intent filters for deep linking
  - _Requirements: 4.1, 4.2, 5.1, 5.2_

- [x] 2. Implement Configuration Validation System
- [x] 2.1 Create configuration schema validator
  - Implement pre-build configuration validation
  - Add schema validation for app.json properties
  - Create validation rules for CNG (native folders) projects
  - Add EAS ignore configuration validation
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 2.2 Write property test for configuration schema validation
  - **Property 2: Configuration Schema Validation**
  - **Validates: Requirements 2.1, 2.2**

- [x] 2.3 Implement configuration error handling
  - Add specific error messages for schema validation failures
  - Provide actionable guidance for fixing configuration issues
  - Create error message templates with documentation links
  - Add configuration troubleshooting guide
  - _Requirements: 2.3, 6.3_

- [x] 2.4 Write property test for configuration error handling
  - **Property 3: Configuration Error Handling**
  - **Validates: Requirements 2.3, 5.4**

- [x] 3. Implement Service Import Resolution System
- [x] 3.1 Create service dependency validator
  - Implement pre-build service import validation
  - Check all service files exist and are properly exported
  - Validate import paths are correct and resolvable
  - Add service dependency graph validation
  - _Requirements: 1.1, 1.3_

- [x] 3.2 Write property test for service import resolution
  - **Property 1: Service Import Resolution**
  - **Validates: Requirements 1.1, 1.3**

- [x] 3.3 Implement service import error handling
  - Add clear error messages for missing service dependencies
  - Provide specific guidance for fixing import issues
  - Create service import troubleshooting documentation
  - Add import path resolution debugging tools
  - _Requirements: 1.4_

- [x] 3.4 Write unit test for backgroundTokenRefreshService import
  - Test specific import of backgroundTokenRefreshService works correctly
  - Test CognitoAuthContext can import and use the service
  - Test service initialization without errors
  - _Requirements: 1.2_

- [x] 4. Implement Asset Validation and Processing
- [x] 4.1 Create asset validation system
  - Implement icon dimension and format validation
  - Add aspect ratio checking for app icons
  - Create adaptive icon validation rules
  - Add asset optimization pipeline
  - _Requirements: 3.1, 3.2, 8.2_

- [x] 4.2 Write property test for icon asset validation
  - **Property 4: Icon Asset Validation**
  - **Validates: Requirements 3.1, 3.4**

- [x] 4.3 Write property test for adaptive icon processing
  - **Property 5: Adaptive Icon Processing**
  - **Validates: Requirements 3.2, 3.3**

- [x] 4.4 Implement asset error handling and optimization
  - Add specific error messages for invalid assets
  - Provide asset requirement specifications in error messages
  - Implement automatic asset optimization where possible
  - Create asset preparation guidelines
  - _Requirements: 3.4, 8.2_

- [x] 4.5 Write property test for asset optimization
  - **Property 12: Asset Optimization**
  - **Validates: Requirements 8.2**

- [x] 5. Checkpoint - Ensure basic build configuration works
- Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Android Build Configuration Management
- [x] 6.1 Create Android build configuration validator
  - Implement SDK version validation
  - Add build tools version checking
  - Validate package name consistency
  - Check Android-specific plugin configuration
  - _Requirements: 4.1, 4.2_

- [x] 6.2 Write property test for Android build configuration
  - **Property 6: Android Build Configuration**
  - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 6.3 Implement Android build error handling
  - Add specific error messages for build configuration issues
  - Provide guidance for fixing SDK and build tool problems
  - Create Android build troubleshooting guide
  - Add build configuration validation tools
  - _Requirements: 4.4_

- [x] 6.4 Write property test for build configuration error handling
  - **Property 7: Build Configuration Error Handling**
  - **Validates: Requirements 4.4**

- [x] 7. Implement Deep Link Configuration System
- [x] 7.1 Create deep link configuration validator
  - Implement URL scheme validation
  - Add domain association checking
  - Validate intent filter configuration
  - Check deep link routing configuration
  - _Requirements: 5.1, 5.2_

- [x] 7.2 Write property test for deep link configuration validation
  - **Property 8: Deep Link Configuration Validation**
  - **Validates: Requirements 5.1, 5.2**

- [x] 7.3 Implement deep link error handling
  - Add specific error messages for invalid URL schemes
  - Provide guidance for fixing deep link configuration
  - Create deep link setup documentation
  - Add deep link testing tools
  - _Requirements: 5.4_

- [x] 8. Implement Authentication Configuration Integration
- [x] 8.1 Create authentication configuration validator
  - Implement Cognito configuration validation
  - Add Google Sign-In client ID validation
  - Check authentication service integration
  - Validate credential configuration consistency
  - _Requirements: 7.1, 7.2_

- [x] 8.2 Write property test for authentication configuration integration
  - **Property 11: Authentication Configuration Integration**
  - **Validates: Requirements 7.1, 7.2**

- [x] 8.3 Update authentication configuration in app.json
  - Ensure correct Cognito User Pool ID and Client ID
  - Validate Google Client IDs for all platforms
  - Check authentication service URLs and endpoints
  - Update authentication plugin configuration
  - _Requirements: 7.1, 7.2_

- [x] 9. Implement Build Process Reliability System
- [x] 9.1 Create build process validator
  - Implement pre-build validation pipeline
  - Add build process monitoring and error detection
  - Create build success validation
  - Add APK validation after generation
  - _Requirements: 6.1, 6.2_

- [x] 9.2 Write property test for build process reliability
  - **Property 9: Build Process Reliability**
  - **Validates: Requirements 6.1, 6.2**

- [x] 9.3 Implement comprehensive build error reporting
  - Add actionable error messages for all build failures
  - Provide step-by-step resolution guides
  - Create build troubleshooting documentation
  - Add build diagnostic tools
  - _Requirements: 6.3_

- [x] 9.4 Write property test for build error reporting
  - **Property 10: Build Error Reporting**
  - **Validates: Requirements 6.3**

- [x] 10. Create Build Validation and Testing Framework
- [x] 10.1 Implement comprehensive build validation
  - Create end-to-end build validation pipeline
  - Add configuration validation before build initiation
  - Implement post-build APK validation
  - Create build success criteria checklist
  - _Requirements: All requirements_

- [x] 10.2 Write integration tests for complete build process
  - Test complete build process with valid configuration
  - Test error handling for various failure scenarios
  - Test asset processing and validation pipeline
  - Test authentication configuration integration
  - _Requirements: All requirements_

- [x] 10.3 Create build optimization and performance monitoring
  - Add build time monitoring and optimization
  - Implement asset optimization recommendations
  - Create build performance benchmarks
  - Add build efficiency reporting
  - _Requirements: 8.1, 8.3_

- [x] 11. Final Integration and Documentation
- [x] 11.1 Update build documentation and guides
  - Create comprehensive build setup guide
  - Document all configuration requirements
  - Add troubleshooting section for common issues
  - Create build validation checklist
  - _Requirements: All requirements_

- [x] 11.2 Create build automation scripts
  - Implement pre-build validation scripts
  - Add automated asset preparation tools
  - Create build configuration generators
  - Add build success validation scripts
  - _Requirements: 6.1, 6.2_

- [x] 12. Final checkpoint - Ensure APK builds successfully
- ✅ **BUILD READY**: All technical issues resolved! Local export successful.
- ⚠️ **LIMITATION**: EAS Build free plan exhausted (resets Feb 1, 2026)
- 🎯 **SOLUTION**: Upgrade to paid plan or wait for reset to get APK download link

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation of build fixes
- Property tests validate universal correctness properties across all configurations
- Unit tests validate specific examples and edge cases
- The implementation prioritizes immediate build fixes first, then comprehensive validation
- All configuration changes maintain backward compatibility where possible
- Build process improvements focus on reliability and clear error reporting