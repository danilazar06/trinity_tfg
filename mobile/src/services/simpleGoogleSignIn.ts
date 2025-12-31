/**
 * Simplified Google Sign-In Service
 * Handles Google authentication for compiled APK/IPA builds
 */

import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
import { environmentDetectionService } from './environmentDetectionService';

// Import Google Sign-In conditionally
let GoogleSignin: any = null;
let statusCodes: any = null;

try {
  const googleSignInModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSignInModule.GoogleSignin;
  statusCodes = googleSignInModule.statusCodes;
  console.log('✅ Google Sign-In SDK loaded successfully');
} catch (error) {
  console.warn('⚠️ Google Sign-In SDK not available:', error);
}

export interface SimpleGoogleUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
  idToken: string;
  accessToken?: string;
}

export interface SimpleGoogleSignInResult {
  success: boolean;
  user?: SimpleGoogleUser;
  error?: string;
  canRetry?: boolean;
}

class SimpleGoogleSignInService {
  private isConfigured = false;
  private configurationAttempted = false;

  /**
   * Check if Google Sign-In is available and properly configured
   */
  async isAvailable(): Promise<boolean> {
    try {
      const env = environmentDetectionService.detectEnvironment();
      
      // Check if we have the SDK
      if (!GoogleSignin) {
        console.log('❌ Google Sign-In SDK not available');
        return false;
      }

      // Check if we have configuration
      const config = Constants.expoConfig?.extra;
      const hasWebClientId = config?.googleWebClientId && 
                            config.googleWebClientId !== 'your_google_web_client_id_here' &&
                            config.googleWebClientId !== 'YOUR_GOOGLE_WEB_CLIENT_ID';

      if (!hasWebClientId) {
        console.log('❌ Google Web Client ID not configured');
        return false;
      }

      // For compiled builds, we should have Google Services files
      if (env.runtime === 'production' || env.runtime === 'development-build') {
        if (!env.hasGoogleServicesFile) {
          console.log('❌ Google Services files not detected for compiled build');
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Error checking Google Sign-In availability:', error);
      return false;
    }
  }

  /**
   * Configure Google Sign-In
   */
  async configure(): Promise<boolean> {
    if (this.configurationAttempted) {
      return this.isConfigured;
    }

    this.configurationAttempted = true;

    try {
      if (!GoogleSignin) {
        console.log('❌ Cannot configure - Google Sign-In SDK not available');
        return false;
      }

      const config = Constants.expoConfig?.extra;
      const webClientId = config?.googleWebClientId;

      if (!webClientId || webClientId === 'your_google_web_client_id_here') {
        console.log('❌ Cannot configure - Google Web Client ID not set');
        return false;
      }

      console.log('🔧 Configuring Google Sign-In...');

      GoogleSignin.configure({
        webClientId: webClientId,
        iosClientId: config?.googleIosClientId,
        offlineAccess: true,
        hostedDomain: '',
        forceCodeForRefreshToken: true,
        accountName: '',
        googleServicePlistPath: '',
        openIdRealm: '',
        profileImageSize: 120,
      });

      this.isConfigured = true;
      console.log('✅ Google Sign-In configured successfully');
      return true;

    } catch (error) {
      console.error('❌ Error configuring Google Sign-In:', error);
      this.isConfigured = false;
      return false;
    }
  }

  /**
   * Sign in with Google
   */
  async signIn(): Promise<SimpleGoogleSignInResult> {
    try {
      // Check availability first
      const available = await this.isAvailable();
      if (!available) {
        return {
          success: false,
          error: 'Google Sign-In no está disponible en este entorno. Usa email y contraseña.',
          canRetry: false,
        };
      }

      // Configure if not already configured
      if (!this.isConfigured) {
        const configured = await this.configure();
        if (!configured) {
          return {
            success: false,
            error: 'No se pudo configurar Google Sign-In. Usa email y contraseña.',
            canRetry: false,
          };
        }
      }

      console.log('🔐 Starting Google Sign-In...');

      // Check Play Services (Android only)
      if (Platform.OS === 'android') {
        try {
          await GoogleSignin.hasPlayServices();
        } catch (playServicesError: any) {
          console.error('❌ Google Play Services error:', playServicesError);
          return {
            success: false,
            error: 'Google Play Services no está disponible o actualizado.',
            canRetry: true,
          };
        }
      }

      // Perform sign-in
      const userInfo = await GoogleSignin.signIn();
      
      if (!userInfo?.data?.user || !userInfo?.data?.idToken) {
        throw new Error('No se pudo obtener información del usuario de Google');
      }

      const user: SimpleGoogleUser = {
        id: userInfo.data.user.id,
        email: userInfo.data.user.email,
        name: userInfo.data.user.name || userInfo.data.user.email,
        photo: userInfo.data.user.photo || undefined,
        idToken: userInfo.data.idToken,
        accessToken: userInfo.data.serverAuthCode || undefined,
      };

      console.log('✅ Google Sign-In successful:', user.email);

      return {
        success: true,
        user,
      };

    } catch (error: any) {
      console.error('❌ Google Sign-In error:', error);

      // Handle specific error codes
      if (statusCodes && error.code) {
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            return {
              success: false,
              error: 'Inicio de sesión cancelado por el usuario.',
              canRetry: true,
            };

          case statusCodes.IN_PROGRESS:
            return {
              success: false,
              error: 'Ya hay un inicio de sesión en progreso.',
              canRetry: true,
            };

          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            return {
              success: false,
              error: 'Google Play Services no está disponible.',
              canRetry: false,
            };

          default:
            break;
        }
      }

      return {
        success: false,
        error: error.message || 'Error desconocido durante Google Sign-In.',
        canRetry: true,
      };
    }
  }

  /**
   * Sign out from Google
   */
  async signOut(): Promise<void> {
    try {
      if (GoogleSignin && this.isConfigured) {
        await GoogleSignin.signOut();
        console.log('✅ Google Sign-Out successful');
      }
    } catch (error) {
      console.error('❌ Google Sign-Out error:', error);
      // Don't throw - sign out should always succeed locally
    }
  }

  /**
   * Get current Google user
   */
  async getCurrentUser(): Promise<SimpleGoogleUser | null> {
    try {
      if (!GoogleSignin || !this.isConfigured) {
        return null;
      }

      const userInfo = await GoogleSignin.getCurrentUser();
      
      if (!userInfo?.data?.user) {
        return null;
      }

      return {
        id: userInfo.data.user.id,
        email: userInfo.data.user.email,
        name: userInfo.data.user.name || userInfo.data.user.email,
        photo: userInfo.data.user.photo || undefined,
        idToken: userInfo.data.idToken || '',
        accessToken: userInfo.data.serverAuthCode || undefined,
      };

    } catch (error) {
      console.error('❌ Error getting current Google user:', error);
      return null;
    }
  }

  /**
   * Check if user is signed in
   */
  async isSignedIn(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      return user !== null;
    } catch (error) {
      console.error('❌ Error checking Google sign-in status:', error);
      return false;
    }
  }

  /**
   * Show user-friendly error message
   */
  showErrorMessage(error: string): void {
    Alert.alert(
      'Google Sign-In',
      error,
      [
        {
          text: 'Usar Email/Contraseña',
          style: 'default'
        }
      ]
    );
  }

  /**
   * Get status message for debugging
   */
  getStatusMessage(): string {
    const env = environmentDetectionService.detectEnvironment();
    
    if (!GoogleSignin) {
      return 'Google Sign-In SDK no disponible';
    }

    if (env.runtime === 'expo-go') {
      return 'Expo Go - Google Sign-In no soportado';
    }

    if (!this.isConfigured && !this.configurationAttempted) {
      return 'Google Sign-In no configurado';
    }

    if (this.configurationAttempted && !this.isConfigured) {
      return 'Error en configuración de Google Sign-In';
    }

    if (this.isConfigured) {
      return 'Google Sign-In disponible';
    }

    return 'Google Sign-In inicializando...';
  }
}

// Export singleton instance
export const simpleGoogleSignInService = new SimpleGoogleSignInService();