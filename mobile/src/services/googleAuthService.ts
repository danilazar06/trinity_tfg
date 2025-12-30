/**
 * Google Authentication Service
 * Handles Google Sign-In integration with AWS Cognito
 */

import { GoogleSignin, GoogleSigninButton, statusCodes } from '@react-native-google-signin/google-signin';
import { getAWSConfig } from '../config/aws-config';
import { loggingService } from './loggingService';
import { CognitoIdentityCredentials } from 'amazon-cognito-identity-js';

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  givenName?: string;
  familyName?: string;
  photo?: string;
}

export interface GoogleAuthResult {
  user: GoogleUser;
  idToken: string;
  accessToken: string;
}

class GoogleAuthService {
  private config = getAWSConfig();
  private isConfigured = false;

  constructor() {
    this.configureGoogleSignIn();
  }

  /**
   * Configure Google Sign-In
   */
  private async configureGoogleSignIn() {
    try {
      await GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'YOUR_GOOGLE_WEB_CLIENT_ID',
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
        offlineAccess: false,
        hostedDomain: '', // Restrict to specific domain if needed
        forceCodeForRefreshToken: true,
        accountName: '',
        googleServicePlistPath: '',
        openIdConnect: {
          issuer: 'https://accounts.google.com',
          additionalParameters: {},
          customHeaders: {},
        },
      });

      this.isConfigured = true;
      loggingService.info('GoogleAuthService', 'Google Sign-In configured successfully');
    } catch (error) {
      console.error('Google Sign-In configuration error:', error);
      loggingService.error('GoogleAuthService', 'Failed to configure Google Sign-In', { error });
    }
  }

  /**
   * Check if user is already signed in to Google
   */
  async isSignedIn(): Promise<boolean> {
    try {
      return await GoogleSignin.isSignedIn();
    } catch (error) {
      console.error('Error checking Google sign-in status:', error);
      return false;
    }
  }

  /**
   * Get current Google user if signed in
   */
  async getCurrentUser(): Promise<GoogleUser | null> {
    try {
      const userInfo = await GoogleSignin.signInSilently();
      return this.mapGoogleUserInfo(userInfo);
    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_REQUIRED) {
        return null;
      }
      console.error('Error getting current Google user:', error);
      loggingService.error('GoogleAuthService', 'Failed to get current user', { error });
      return null;
    }
  }

  /**
   * Sign in with Google
   */
  async signIn(): Promise<{ success: boolean; data?: GoogleAuthResult; error?: string }> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Google Sign-In not configured properly',
      };
    }

    try {
      loggingService.logAuth('google_signin_attempt', {});

      // Check if Google Play Services are available
      await GoogleSignin.hasPlayServices();

      // Perform Google Sign-In
      const userInfo = await GoogleSignin.signIn();
      
      if (!userInfo.data) {
        throw new Error('No user data received from Google');
      }

      const user = this.mapGoogleUserInfo(userInfo);
      
      // Get tokens
      const tokens = await GoogleSignin.getTokens();

      const result: GoogleAuthResult = {
        user,
        idToken: tokens.idToken,
        accessToken: tokens.accessToken,
      };

      loggingService.logAuth('google_signin_success', {
        userId: user.id,
        email: user.email,
      });

      return {
        success: true,
        data: result,
      };

    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      
      loggingService.logAuth('google_signin_error', {
        errorCode: error.code,
        errorMessage: error.message,
      });

      let errorMessage = 'Error al iniciar sesión con Google';

      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        errorMessage = 'Inicio de sesión cancelado';
      } else if (error.code === statusCodes.IN_PROGRESS) {
        errorMessage = 'Inicio de sesión en progreso';
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        errorMessage = 'Google Play Services no disponible';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Sign out from Google
   */
  async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      await GoogleSignin.signOut();
      
      loggingService.logAuth('google_signout', { success: true });
      
      return { success: true };
    } catch (error: any) {
      console.error('Google Sign-Out error:', error);
      
      loggingService.logAuth('google_signout_error', {
        errorMessage: error.message,
      });
      
      return {
        success: false,
        error: error.message || 'Error al cerrar sesión de Google',
      };
    }
  }

  /**
   * Revoke Google access (complete sign out)
   */
  async revokeAccess(): Promise<{ success: boolean; error?: string }> {
    try {
      await GoogleSignin.revokeAccess();
      
      loggingService.logAuth('google_revoke_access', { success: true });
      
      return { success: true };
    } catch (error: any) {
      console.error('Google revoke access error:', error);
      
      loggingService.logAuth('google_revoke_access_error', {
        errorMessage: error.message,
      });
      
      return {
        success: false,
        error: error.message || 'Error al revocar acceso de Google',
      };
    }
  }

  /**
   * Map Google user info to our user interface
   */
  private mapGoogleUserInfo(userInfo: any): GoogleUser {
    const user = userInfo.data?.user || userInfo.user || userInfo;
    
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      givenName: user.givenName,
      familyName: user.familyName,
      photo: user.photo,
    };
  }

  /**
   * Get Google Sign-In button component
   */
  getSignInButton() {
    return GoogleSigninButton;
  }

  /**
   * Get available button sizes
   */
  getButtonSizes() {
    return GoogleSigninButton.Size;
  }

  /**
   * Get available button colors
   */
  getButtonColors() {
    return GoogleSigninButton.Color;
  }
}

export const googleAuthService = new GoogleAuthService();
export type { GoogleUser, GoogleAuthResult };