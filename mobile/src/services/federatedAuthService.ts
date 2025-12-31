/**
 * Federated Authentication Service
 * Integrates Google Sign-In with AWS Cognito User Pool
 */

import { getAWSConfig } from '../config/aws-config';
import { googleAuthService, GoogleAuthResult } from './googleAuthService';
import { cognitoAuthService, CognitoUser, CognitoTokens } from './cognitoAuthService';
import { loggingService } from './loggingService';
import { CognitoIdentityCredentials } from 'amazon-cognito-identity-js';

export interface FederatedAuthResult {
  user: CognitoUser;
  tokens: CognitoTokens;
  provider: 'google' | 'cognito';
}

class FederatedAuthService {
  private config = getAWSConfig();

  constructor() {
    loggingService.info('FederatedAuthService', 'Service initialized', {
      region: this.config.region,
      userPoolId: this.config.userPoolId,
      identityPoolId: this.config.identityPoolId,
    });
  }

  /**
   * Sign in with Google and authenticate with Cognito
   */
  async signInWithGoogle(): Promise<{ success: boolean; data?: FederatedAuthResult; error?: string }> {
    try {
      loggingService.logAuth('federated_google_signin_attempt', {});

      // Check if Google Sign-In is available in current environment
      const googleSignInService = await import('./googleSignInService');
      const availability = await googleSignInService.googleSignInService.getAvailabilityStatus();
      
      if (!availability.canSignIn) {
        console.log('❌ Google Sign-In not available:', availability.message);
        return {
          success: false,
          error: availability.message,
        };
      }

      // Step 1: Sign in with Google
      const googleResult = await googleAuthService.signIn();
      
      if (!googleResult.success || !googleResult.data) {
        return {
          success: false,
          error: googleResult.error || 'Failed to sign in with Google',
        };
      }

      const { user: googleUser, idToken } = googleResult.data;

      // Step 2: Use Cognito Hosted UI for federated authentication
      // Since we can't directly exchange Google tokens with User Pool without Amplify,
      // we'll use the hosted UI approach or implement a custom Lambda function
      
      // For now, we'll create a user in Cognito with Google info if they don't exist
      // This is a simplified approach - in production, you'd want proper federated auth
      
      const cognitoResult = await this.createOrAuthenticateUserWithGoogleInfo(googleUser, idToken);
      
      if (!cognitoResult.success) {
        return {
          success: false,
          error: cognitoResult.error || 'Failed to authenticate with Cognito',
        };
      }

      loggingService.logAuth('federated_google_signin_success', {
        userId: cognitoResult.data!.user.sub,
        email: cognitoResult.data!.user.email,
        provider: 'google',
      });

      return {
        success: true,
        data: {
          ...cognitoResult.data!,
          provider: 'google',
        },
      };

    } catch (error: any) {
      console.error('Federated Google Sign-In error:', error);
      
      loggingService.logAuth('federated_google_signin_error', {
        errorMessage: error.message,
      });

      return {
        success: false,
        error: error.message || 'Error en autenticación federada con Google',
      };
    }
  }

  /**
   * Create or authenticate user with Google information
   * This is a simplified approach - in production, use proper federated auth
   */
  private async createOrAuthenticateUserWithGoogleInfo(
    googleUser: any,
    googleIdToken: string
  ): Promise<{ success: boolean; data?: { user: CognitoUser; tokens: CognitoTokens }; error?: string }> {
    
    // For this implementation, we'll use a special email format to identify Google users
    // and create them in Cognito if they don't exist
    
    const googleEmail = googleUser.email;
    const tempPassword = this.generateTempPassword();
    
    try {
      // First, try to sign in (user might already exist)
      const loginResult = await cognitoAuthService.login(googleEmail, tempPassword);
      
      if (loginResult.success && loginResult.data) {
        // User exists and can login
        return {
          success: true,
          data: loginResult.data,
        };
      }

      // If login failed, try to register the user
      const registerResult = await cognitoAuthService.register(
        googleEmail,
        tempPassword,
        googleUser.name || googleUser.givenName || 'Google User'
      );

      if (!registerResult.success) {
        // If registration failed, the user might exist but with different password
        // In a real implementation, you'd handle this through proper federated auth
        return {
          success: false,
          error: 'Usuario ya existe. Use el método de autenticación original.',
        };
      }

      // Now try to login with the newly created user
      const newLoginResult = await cognitoAuthService.login(googleEmail, tempPassword);
      
      if (newLoginResult.success && newLoginResult.data) {
        return {
          success: true,
          data: newLoginResult.data,
        };
      }

      return {
        success: false,
        error: 'Failed to authenticate after registration',
      };

    } catch (error: any) {
      console.error('Error creating/authenticating Google user:', error);
      return {
        success: false,
        error: error.message || 'Error en autenticación con información de Google',
      };
    }
  }

  /**
   * Generate a temporary password for Google users
   * In production, this would be handled by proper federated authentication
   */
  private generateTempPassword(): string {
    // Generate a secure temporary password that meets Cognito requirements
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    
    // Ensure password meets requirements: 8+ chars, upper, lower, digit
    password += 'A'; // Uppercase
    password += 'a'; // Lowercase  
    password += '1'; // Digit
    
    // Add random characters
    for (let i = 3; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return password;
  }

  /**
   * Sign out from both Google and Cognito
   */
  async signOut(accessToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Sign out from Google
      await googleAuthService.signOut();
      
      // Sign out from Cognito if we have an access token
      if (accessToken) {
        await cognitoAuthService.signOut(accessToken);
      }
      
      // Clear stored tokens
      await cognitoAuthService.clearTokens();
      
      loggingService.logAuth('federated_signout', { success: true });
      
      return { success: true };
      
    } catch (error: any) {
      console.error('Federated sign out error:', error);
      
      loggingService.logAuth('federated_signout_error', {
        errorMessage: error.message,
      });
      
      return {
        success: false,
        error: error.message || 'Error al cerrar sesión',
      };
    }
  }

  /**
   * Check if user is signed in with Google
   */
  async isGoogleSignedIn(): Promise<boolean> {
    return await googleAuthService.isSignedIn();
  }

  /**
   * Get current Google user if signed in
   */
  async getCurrentGoogleUser() {
    return await googleAuthService.getCurrentUser();
  }
}

export const federatedAuthService = new FederatedAuthService();
export type { FederatedAuthResult };