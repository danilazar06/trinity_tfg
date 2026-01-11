/**
 * Secure Token Storage Service
 * Handles secure storage and retrieval of authentication tokens using Expo SecureStore
 * Provides encryption and secure storage for sensitive authentication data
 */

import * as SecureStore from 'expo-secure-store';
import { CognitoTokens } from './cognitoAuthService';

interface StorageKeys {
  ACCESS_TOKEN: string;
  ID_TOKEN: string;
  REFRESH_TOKEN: string;
  TOKEN_EXPIRY: string;
  USER_DATA: string;
  LEGACY_TOKENS: string;
}

class SecureTokenStorage {
  private readonly STORAGE_KEYS: StorageKeys = {
    ACCESS_TOKEN: 'trinity_access_token',
    ID_TOKEN: 'trinity_id_token', 
    REFRESH_TOKEN: 'trinity_refresh_token',
    TOKEN_EXPIRY: 'trinity_token_expiry',
    USER_DATA: 'trinity_user_data',
    LEGACY_TOKENS: 'trinity_legacy_tokens',
  };

  private readonly STORAGE_OPTIONS = {
    requireAuthentication: false, // Set to true if device has biometric auth
    keychainService: 'trinity-keychain',
    touchPrompt: 'Authenticate to access your account',
  };

  /**
   * Store authentication tokens securely
   */
  async storeTokens(tokens: CognitoTokens): Promise<void> {
    try {
      console.log('🔐 SecureTokenStorage: Storing tokens securely');

      // Store each token separately for better security
      await Promise.all([
        SecureStore.setItemAsync(this.STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken, this.STORAGE_OPTIONS),
        SecureStore.setItemAsync(this.STORAGE_KEYS.ID_TOKEN, tokens.idToken, this.STORAGE_OPTIONS),
        SecureStore.setItemAsync(this.STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken, this.STORAGE_OPTIONS),
        SecureStore.setItemAsync(this.STORAGE_KEYS.TOKEN_EXPIRY, tokens.expiresAt.toString(), this.STORAGE_OPTIONS),
      ]);

      console.log('✅ SecureTokenStorage: Tokens stored successfully');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to store tokens:', error);
      throw new Error('Failed to store authentication tokens securely');
    }
  }

  /**
   * Retrieve authentication tokens from secure storage
   */
  async retrieveTokens(): Promise<CognitoTokens | null> {
    try {
      console.log('🔍 SecureTokenStorage: Retrieving tokens from secure storage');

      const [accessToken, idToken, refreshToken, expiryString] = await Promise.all([
        SecureStore.getItemAsync(this.STORAGE_KEYS.ACCESS_TOKEN, this.STORAGE_OPTIONS),
        SecureStore.getItemAsync(this.STORAGE_KEYS.ID_TOKEN, this.STORAGE_OPTIONS),
        SecureStore.getItemAsync(this.STORAGE_KEYS.REFRESH_TOKEN, this.STORAGE_OPTIONS),
        SecureStore.getItemAsync(this.STORAGE_KEYS.TOKEN_EXPIRY, this.STORAGE_OPTIONS),
      ]);

      // Check if all required tokens exist
      if (!accessToken || !idToken || !refreshToken || !expiryString) {
        console.log('⚠️ SecureTokenStorage: Some tokens missing from secure storage');
        return null;
      }

      const expiresAt = parseInt(expiryString, 10);
      if (isNaN(expiresAt)) {
        console.warn('⚠️ SecureTokenStorage: Invalid expiry time format');
        return null;
      }

      const tokens: CognitoTokens = {
        accessToken,
        idToken,
        refreshToken,
        expiresAt,
      };

      console.log('✅ SecureTokenStorage: Tokens retrieved successfully');
      return tokens;

    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to retrieve tokens:', error);
      return null;
    }
  }

  /**
   * Store user data securely
   */
  async storeUserData(userData: any): Promise<void> {
    try {
      const userDataString = JSON.stringify(userData);
      await SecureStore.setItemAsync(this.STORAGE_KEYS.USER_DATA, userDataString, this.STORAGE_OPTIONS);
      console.log('✅ SecureTokenStorage: User data stored successfully');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to store user data:', error);
      throw new Error('Failed to store user data securely');
    }
  }

  /**
   * Retrieve user data from secure storage
   */
  async retrieveUserData(): Promise<any | null> {
    try {
      const userDataString = await SecureStore.getItemAsync(this.STORAGE_KEYS.USER_DATA, this.STORAGE_OPTIONS);
      
      if (!userDataString) {
        return null;
      }

      return JSON.parse(userDataString);
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to retrieve user data:', error);
      return null;
    }
  }

  /**
   * Clear all stored authentication data
   */
  async clearAllTokens(): Promise<void> {
    try {
      console.log('🧹 SecureTokenStorage: Clearing all stored tokens');

      await Promise.all([
        SecureStore.deleteItemAsync(this.STORAGE_KEYS.ACCESS_TOKEN),
        SecureStore.deleteItemAsync(this.STORAGE_KEYS.ID_TOKEN),
        SecureStore.deleteItemAsync(this.STORAGE_KEYS.REFRESH_TOKEN),
        SecureStore.deleteItemAsync(this.STORAGE_KEYS.TOKEN_EXPIRY),
        SecureStore.deleteItemAsync(this.STORAGE_KEYS.USER_DATA),
      ]);

      console.log('✅ SecureTokenStorage: All tokens cleared successfully');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to clear tokens:', error);
      // Don't throw error for cleanup operations
    }
  }

  /**
   * Check if tokens exist in storage
   */
  async hasStoredTokens(): Promise<boolean> {
    try {
      const accessToken = await SecureStore.getItemAsync(this.STORAGE_KEYS.ACCESS_TOKEN, this.STORAGE_OPTIONS);
      return !!accessToken;
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to check stored tokens:', error);
      return false;
    }
  }

  /**
   * Store legacy tokens for migration purposes
   */
  async storeLegacyTokens(tokens: any): Promise<void> {
    try {
      const tokensString = JSON.stringify(tokens);
      await SecureStore.setItemAsync(this.STORAGE_KEYS.LEGACY_TOKENS, tokensString, this.STORAGE_OPTIONS);
      console.log('✅ SecureTokenStorage: Legacy tokens stored for migration');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to store legacy tokens:', error);
      throw new Error('Failed to store legacy tokens');
    }
  }

  /**
   * Retrieve legacy tokens for migration
   */
  async retrieveLegacyTokens(): Promise<any | null> {
    try {
      const tokensString = await SecureStore.getItemAsync(this.STORAGE_KEYS.LEGACY_TOKENS, this.STORAGE_OPTIONS);
      
      if (!tokensString) {
        return null;
      }

      return JSON.parse(tokensString);
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to retrieve legacy tokens:', error);
      return null;
    }
  }

  /**
   * Clear legacy tokens after successful migration
   */
  async clearLegacyTokens(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.STORAGE_KEYS.LEGACY_TOKENS);
      console.log('✅ SecureTokenStorage: Legacy tokens cleared after migration');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to clear legacy tokens:', error);
    }
  }

  /**
   * Get storage statistics for debugging
   */
  async getStorageStats(): Promise<{
    hasAccessToken: boolean;
    hasIdToken: boolean;
    hasRefreshToken: boolean;
    hasUserData: boolean;
    hasLegacyTokens: boolean;
  }> {
    try {
      const [accessToken, idToken, refreshToken, userData, legacyTokens] = await Promise.all([
        SecureStore.getItemAsync(this.STORAGE_KEYS.ACCESS_TOKEN, this.STORAGE_OPTIONS),
        SecureStore.getItemAsync(this.STORAGE_KEYS.ID_TOKEN, this.STORAGE_OPTIONS),
        SecureStore.getItemAsync(this.STORAGE_KEYS.REFRESH_TOKEN, this.STORAGE_OPTIONS),
        SecureStore.getItemAsync(this.STORAGE_KEYS.USER_DATA, this.STORAGE_OPTIONS),
        SecureStore.getItemAsync(this.STORAGE_KEYS.LEGACY_TOKENS, this.STORAGE_OPTIONS),
      ]);

      return {
        hasAccessToken: !!accessToken,
        hasIdToken: !!idToken,
        hasRefreshToken: !!refreshToken,
        hasUserData: !!userData,
        hasLegacyTokens: !!legacyTokens,
      };
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to get storage stats:', error);
      return {
        hasAccessToken: false,
        hasIdToken: false,
        hasRefreshToken: false,
        hasUserData: false,
        hasLegacyTokens: false,
      };
    }
  }

  /**
   * Test secure storage functionality
   */
  async testSecureStorage(): Promise<boolean> {
    try {
      const testKey = 'trinity_test_key';
      const testValue = 'test_value_' + Date.now();

      // Test write
      await SecureStore.setItemAsync(testKey, testValue, this.STORAGE_OPTIONS);
      
      // Test read
      const retrievedValue = await SecureStore.getItemAsync(testKey, this.STORAGE_OPTIONS);
      
      // Test delete
      await SecureStore.deleteItemAsync(testKey);

      const success = retrievedValue === testValue;
      console.log(`🧪 SecureTokenStorage: Test ${success ? 'passed' : 'failed'}`);
      
      return success;
    } catch (error) {
      console.error('❌ SecureTokenStorage: Test failed:', error);
      return false;
    }
  }
}

export const secureTokenStorage = new SecureTokenStorage();
export default secureTokenStorage;