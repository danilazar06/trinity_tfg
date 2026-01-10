# Implementation Plan: Trinity Voting System Fixes

## Overview

This implementation plan addresses the critical issues in Trinity's voting system through systematic fixes to the backend Lambda handlers, frontend voting logic, deep link system, and movie caching infrastructure. The plan prioritizes fixing vote processing errors first, then implementing performance improvements and new features.

## Tasks

- [x] 1. Fix Critical Vote Processing Errors
- [x] 1.1 Fix DynamoDB key structure in Vote Handler
  - Update vote.ts handler to use correct `{ PK: roomId, SK: 'ROOM' }` key format
  - Fix room lookup operations in `getRoomAndValidate` function
  - Update room status updates in `updateRoomWithMatch` function
  - _Requirements: 1.1, 1.2_

- [x] 1.2 Write property test for vote processing reliability
  - **Property 1: Vote Processing Reliability**
  - **Validates: Requirements 1.1, 1.2**

- [x] 1.3 Fix DynamoDB key structure in Room Handler
  - Update room.ts handler to use consistent `{ PK: roomId, SK: 'ROOM' }` format
  - Fix room creation, retrieval, and update operations
  - Ensure backward compatibility with existing data
  - _Requirements: 1.1_

- [x] 1.4 Write property test for Stop-on-Match algorithm
  - **Property 2: Stop-on-Match Algorithm Correctness**
  - **Validates: Requirements 1.3, 1.4**

- [x] 1.5 Enhance error handling in Vote Handler
  - Implement user-friendly error messages for DynamoDB failures
  - Add retry logic with exponential backoff for failed operations
  - Improve error logging for debugging while keeping user messages simple
  - _Requirements: 1.5, 9.1, 9.5_

- [ ] 1.6 Write property test for retry logic compliance
  - **Property 20: Retry Logic Compliance**
  - **Validates: Requirements 9.1**

- [x] 2. Fix Premature Completion Messages
- [x] 2.1 Fix frontend voting flow logic
  - Update room/[id].tsx to properly handle "NO" votes without showing completion
  - Fix progress tracking to accurately reflect queue position
  - Ensure completion message only appears at actual queue end
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 2.2 Write property test for progress tracking accuracy
  - **Property 3: Progress Tracking Accuracy**
  - **Validates: Requirements 2.1, 2.4**
  - Note: Test created but mobile Jest setup needs configuration

- [x] 2.3 Implement automatic movie skipping for load failures
  - Add error recovery logic in `loadCurrentMedia` function
  - Implement recursive retry for failed movie loads
  - Update progress tracking when movies are skipped
  - _Requirements: 2.5_

- [ ] 2.4 Write property test for error recovery behavior
  - **Property 5: Error Recovery Behavior**
  - **Validates: Requirements 2.5**

- [ ] 2.5 Enhance completion screen with proper navigation
  - Add "View Matches" and "Return to Rooms" buttons to completion screen
  - Implement navigation logic for post-completion actions
  - _Requirements: 2.3_

- [ ] 3. Checkpoint - Ensure vote processing tests pass
- Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement Movie Pre-caching System
- [ ] 4.1 Create Movie Cache Service
  - Implement cache manager for pre-fetching movies on room creation
  - Add TTL management with 24-hour expiration
  - Create cache key strategy for room-based and genre-based caching
  - _Requirements: 4.1, 4.3_

- [ ] 4.2 Write property test for movie pre-caching behavior
  - **Property 8: Movie Pre-caching Behavior**
  - **Validates: Requirements 4.1**

- [ ] 4.3 Implement genre-based movie filtering
  - Add genre filter logic to TMDB API calls
  - Ensure cached movies match room genre preferences
  - Implement fallback to popular movies when no genres specified
  - _Requirements: 4.2, 5.2, 5.3_

- [ ] 4.4 Write property test for genre filtering consistency
  - **Property 9: Genre Filtering Consistency**
  - **Validates: Requirements 4.2, 5.2**

- [ ] 4.5 Integrate cache with Room Handler
  - Trigger movie pre-caching on room creation
  - Store genre preferences in room metadata
  - Update room creation flow to populate cache
  - _Requirements: 4.1, 5.1_

- [ ] 4.6 Write property test for cache utilization
  - **Property 11: Cache Utilization**
  - **Validates: Requirements 4.4**

- [ ] 4.7 Enhance Circuit Breaker for TMDB API
  - Implement circuit breaker states (CLOSED/OPEN/HALF_OPEN)
  - Add fallback to cached content when API fails
  - Implement cache-first strategy for voting sessions
  - _Requirements: 4.5, 9.2_

- [ ] 4.8 Write property test for circuit breaker fallback
  - **Property 12: Circuit Breaker Fallback**
  - **Validates: Requirements 4.5, 9.2**

- [ ] 5. Implement Functional Invite Links System
- [ ] 5.1 Create Deep Link Service
  - Implement invite code generation with uniqueness guarantees
  - Create URL generation following "https://trinity.app/room/{inviteCode}" format
  - Add invite code validation and expiration logic
  - _Requirements: 3.1, 3.2, 7.1_

- [ ] 5.2 Write property test for invite code uniqueness
  - **Property 6: Invite Code Uniqueness**
  - **Validates: Requirements 3.1**

- [ ] 5.3 Create web landing page for invite links
  - Build static web page to handle browser access to invite links
  - Add app store download links for iOS and Android
  - Implement invite code validation on web page
  - _Requirements: 3.4, 7.2_

- [ ] 5.4 Implement mobile deep link handling
  - Update mobile app to handle trinity.app deep links
  - Add automatic room joining for valid invite codes
  - Implement authentication flow for unauthenticated users
  - _Requirements: 3.3, 7.3, 7.5_

- [ ] 5.5 Write property test for deep link URL format
  - **Property 7: Deep Link URL Format**
  - **Validates: Requirements 3.2, 7.1**

- [ ] 5.6 Integrate invite system with Room Handler
  - Update room creation to generate functional invite links
  - Store invite URLs in room metadata
  - Add invite code expiration management
  - _Requirements: 3.1, 3.2_

- [ ] 6. Enhance AI-powered Movie Recommendations
- [ ] 6.1 Update AI Handler with genre awareness
  - Modify AI handler to include room genre preferences in context
  - Implement genre-based recommendation prioritization
  - Add confidence scores and reasoning to AI responses
  - _Requirements: 6.1, 6.2, 6.4_

- [ ] 6.2 Write property test for AI genre integration
  - **Property 14: AI Genre Integration**
  - **Validates: Requirements 6.1, 6.2**

- [ ] 6.3 Implement AI fallback system
  - Add fallback to TMDB API recommendations when AI fails
  - Implement graceful degradation for AI service unavailability
  - _Requirements: 6.5_

- [ ] 6.4 Write property test for AI fallback behavior
  - **Property 16: AI Fallback Behavior**
  - **Validates: Requirements 6.5**

- [ ] 7. Checkpoint - Ensure caching and AI tests pass
- Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Enhance Real-time Voting Updates
- [ ] 8.1 Improve AppSync subscription system
  - Enhance vote update broadcasting with detailed progress information
  - Implement immediate match notifications with participant details
  - Add connection status monitoring and reconnection logic
  - _Requirements: 8.1, 8.3, 8.4_

- [ ] 8.2 Write property test for real-time vote broadcasting
  - **Property 17: Real-time Vote Broadcasting**
  - **Validates: Requirements 8.1**

- [ ] 8.3 Implement state synchronization on reconnection
  - Add full room state refresh when connections are restored
  - Ensure vote counts and progress are accurately synced
  - _Requirements: 8.5_

- [ ] 8.4 Write property test for state synchronization
  - **Property 19: State Synchronization**
  - **Validates: Requirements 8.5**

- [ ] 8.5 Update frontend real-time handling
  - Enhance subscription management in room/[id].tsx
  - Add connection status indicators in UI
  - Implement automatic reconnection with user feedback
  - _Requirements: 8.2, 8.4_

- [ ] 9. Implement Movie Pre-loading System
- [ ] 9.1 Add background movie pre-loading
  - Implement pre-loading of next 3 movies during voting sessions
  - Add pre-loaded content utilization for instant movie display
  - Implement fallback to on-demand loading with loading indicators
  - _Requirements: 10.1, 10.2, 10.3_

- [ ] 9.2 Write property test for movie pre-loading
  - **Property 23: Movie Pre-loading**
  - **Validates: Requirements 10.1**

- [ ] 9.3 Implement local image caching
  - Add image caching for offline viewing capability
  - Implement cache management with size limits
  - _Requirements: 10.4_

- [ ] 9.4 Write property test for image caching
  - **Property 26: Image Caching**
  - **Validates: Requirements 10.4**

- [ ] 9.5 Add smooth transitions and animations
  - Implement smooth movie transitions in voting interface
  - Add loading animations and progress indicators
  - _Requirements: 10.5_

- [ ] 10. Comprehensive Error Handling Implementation
- [ ] 10.1 Implement operation queuing for poor connectivity
  - Add operation queue for network-dependent actions
  - Implement retry logic when connection improves
  - _Requirements: 9.4_

- [ ] 10.2 Write property test for operation queuing
  - **Property 21: Operation Queuing**
  - **Validates: Requirements 9.4**

- [ ] 10.3 Enhance error logging and user messaging
  - Implement dual error handling (detailed logs + simple user messages)
  - Add contextual error messages with suggested actions
  - _Requirements: 9.3, 9.5_

- [ ] 10.4 Write property test for error logging dual behavior
  - **Property 22: Error Logging Dual Behavior**
  - **Validates: Requirements 9.5**

- [ ] 11. Integration and Testing
- [ ] 11.1 Update GraphQL schema for new features
  - Add genre preferences fields to room creation mutations
  - Add invite URL fields to room responses
  - Update vote responses with enhanced progress information
  - _Requirements: 5.1, 3.2, 8.1_

- [ ] 11.2 Update mobile app services
  - Enhance appSyncService with new GraphQL operations
  - Update roomService to handle genre preferences and invite URLs
  - Improve error handling in all service layers
  - _Requirements: 5.1, 3.2, 9.3_

- [ ] 11.3 Write integration tests for end-to-end flows
  - Test complete voting flow from room creation to match finding
  - Test invite link generation and deep link handling
  - Test movie caching and real-time updates

- [ ] 12. Final checkpoint - Ensure all tests pass
- Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation prioritizes fixing critical vote processing errors first
- Movie caching and deep links can be implemented in parallel after vote fixes
- Real-time enhancements build upon the fixed vote processing system