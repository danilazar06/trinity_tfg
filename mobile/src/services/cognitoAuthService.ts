/**
 * AWS Cognito Authentication Service
 * Direct integration with AWS Cognito User Pool
 */

import { getAWSConfig } from '../config/aws-config';
import { networkService } from './networkService';
import { loggingService } from './loggingService';
import { secureTokenStorage } from './secureTokenStorage';

export interface CognitoUser {
  sub: string;
  email: string;
  email_verified: boolean;
  username?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

interface AuthResponse {
  user: CognitoUser;
  tokens: CognitoTokens;
}

interface CognitoError {
  name: string;
  message: string;
  code?: string;
}

class CognitoAuthService {
  private config = getAWSConfig();
  private cognitoUrl: string;

  constructor() {
    this.cognitoUrl = `https://cognito-idp.${this.config.region}.amazonaws.com/`;
    
    // Initialize logging context
    loggingService.info('CognitoAuthService', 'Service initialized', {
      region: this.config.region,
      userPoolId: this.config.userPoolId
    });
  }

  /**
   * Make authenticated request to Cognito with network resilience
   */
  private async cognitoRequest(action: string, body: any): Promise<any> {
    // Check network connectivity first
    if (!networkService.isConnected()) {
      loggingService.error('CognitoAuthService', 'No network connection available', { action });
      throw new Error('No network connection available');
    }

    loggingService.debug('CognitoAuthService', `Making Cognito request: ${action}`, { action });

    const response = await fetch(this.cognitoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      const error: CognitoError = {
        name: data.__type || 'CognitoError',
        message: data.message || 'Unknown error',
        code: data.__type,
      };
      
      loggingService.error('CognitoAuthService', `Cognito request failed: ${action}`, {
        action,
        errorName: error.name,
        errorCode: error.code,
        statusCode: response.status
      });
      
      throw error;
    }

    loggingService.debug('CognitoAuthService', `Cognito request successful: ${action}`, { action });
    return data;
  }

  /**
   * Parse JWT token to extract user information
   */
  private parseJWT(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error parsing JWT:', error);
      return null;
    }
  }

  /**
   * Register new user
   */
  async register(email: string, password: string, name: string): Promise<{ success: boolean; message?: string; userSub?: string }> {
    loggingService.logAuth('register', { email, name });
    
    try {
      const response = await this.cognitoRequest('SignUp', {
        ClientId: this.config.userPoolWebClientId,
        Username: email,
        Password: password,
        UserAttributes: [
          {
            Name: 'email',
            Value: email,
          },
          {
            Name: 'name',
            Value: name,
          },
          {
            Name: 'preferred_username',
            Value: name,
          },
        ],
      });

      loggingService.logAuth('register', { 
        success: true, 
        userSub: response.UserSub,
        email 
      });

      return {
        success: true,
        message: 'Usuario registrado exitosamente. Puedes iniciar sesión ahora.',
        userSub: response.UserSub,
      };
    } catch (error: any) {
      console.error('Cognito register error:', error);
      
      loggingService.logAuth('auth_error', {
        operation: 'register',
        errorName: error.name,
        errorCode: error.code,
        email
      });
      
      let message = 'Error al registrarse';
      if (error.name === 'UsernameExistsException') {
        message = 'Este email ya está registrado';
      } else if (error.name === 'InvalidPasswordException') {
        message = 'La contraseña debe tener al menos 8 caracteres';
      } else if (error.name === 'InvalidParameterException') {
        message = 'Email o contraseña inválidos';
      } else if (error.message) {
        message = error.message;
      }

      return { success: false, message };
    }
  }

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<{ success: boolean; data?: AuthResponse; error?: string }> {
    loggingService.logAuth('login', { email });
    
    try {
      // Step 1: Initiate authentication
      const authResponse = await this.cognitoRequest('InitiateAuth', {
        ClientId: this.config.userPoolWebClientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      if (authResponse.ChallengeName) {
        // Handle challenges (MFA, password reset, etc.)
        loggingService.logAuth('auth_error', {
          operation: 'login',
          challenge: authResponse.ChallengeName,
          email
        });
        
        return {
          success: false,
          error: `Authentication challenge required: ${authResponse.ChallengeName}`,
        };
      }

      const tokens = authResponse.AuthenticationResult;
      if (!tokens) {
        loggingService.logAuth('auth_error', {
          operation: 'login',
          error: 'No tokens received',
          email
        });
        
        return {
          success: false,
          error: 'No tokens received from Cognito',
        };
      }

      // Step 2: Parse user information from ID token
      const idTokenPayload = this.parseJWT(tokens.IdToken);
      if (!idTokenPayload) {
        loggingService.logAuth('auth_error', {
          operation: 'login',
          error: 'Invalid ID token',
          email
        });
        
        return {
          success: false,
          error: 'Invalid ID token received',
        };
      }

      const user: CognitoUser = {
        sub: idTokenPayload.sub,
        email: idTokenPayload.email,
        email_verified: idTokenPayload.email_verified || false,
        username: idTokenPayload['cognito:username'] || idTokenPayload.username,
        preferred_username: idTokenPayload.preferred_username,
        name: idTokenPayload.name,
        given_name: idTokenPayload.given_name,
        family_name: idTokenPayload.family_name,
        picture: idTokenPayload.picture,
      };

      const authData: AuthResponse = {
        user,
        tokens: {
          accessToken: tokens.AccessToken,
          idToken: tokens.IdToken,
          refreshToken: tokens.RefreshToken,
        },
      };

      // Set user context for logging
      loggingService.setUserId(user.sub);
      
      loggingService.logAuth('login', {
        success: true,
        userId: user.sub,
        email: user.email,
        emailVerified: user.email_verified
      });

      return { success: true, data: authData };
    } catch (error: any) {
      console.error('Cognito login error:', error);
      
      loggingService.logAuth('auth_error', {
        operation: 'login',
        errorName: error.name,
        errorCode: error.code,
        email
      });
      
      let message = 'Error al iniciar sesión';
      if (error.name === 'NotAuthorizedException') {
        message = 'Email o contraseña incorrectos';
      } else if (error.name === 'UserNotConfirmedException') {
        message = 'Usuario no confirmado. Revisa tu email.';
      } else if (error.name === 'UserNotFoundException') {
        message = 'Usuario no encontrado';
      } else if (error.name === 'TooManyRequestsException') {
        message = 'Demasiados intentos. Intenta más tarde.';
      } else if (error.message) {
        message = error.message;
      }

      return { success: false, error: message };
    }
  }

  /**
   * Refresh access token with network resilience
   */
  async refreshToken(refreshToken: string): Promise<{ success: boolean; tokens?: CognitoTokens; error?: string }> {
    loggingService.logAuth('token_refresh', { hasRefreshToken: !!refreshToken });
    
    try {
      // Use network service for retry logic and connectivity checks
      const result = await networkService.executeWithRetry(
        async () => {
          const response = await this.cognitoRequest('InitiateAuth', {
            ClientId: this.config.userPoolWebClientId,
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            AuthParameters: {
              REFRESH_TOKEN: refreshToken,
            },
          });

          const tokens = response.AuthenticationResult;
          if (!tokens) {
            throw new Error('No tokens received from refresh');
          }

          return {
            accessToken: tokens.AccessToken,
            idToken: tokens.IdToken,
            refreshToken: refreshToken, // Refresh token doesn't change
          };
        },
        'Token Refresh',
        {
          maxAttempts: 3,
          baseDelay: 2000, // 2 seconds
          maxDelay: 10000  // 10 seconds
        }
      );

      loggingService.logAuth('token_refresh', { success: true });

      return {
        success: true,
        tokens: result,
      };

    } catch (error: any) {
      console.error('Token refresh error after all retries:', error);
      
      loggingService.logAuth('auth_error', {
        operation: 'token_refresh',
        errorName: error.name,
        errorCode: error.code,
        networkError: error.message?.includes('network') || error.message?.includes('timeout')
      });
      
      let message = 'Error al renovar sesión';
      
      // Handle specific error types
      if (error.name === 'NotAuthorizedException') {
        message = 'Sesión expirada. Inicia sesión nuevamente.';
      } else if (error.message?.includes('No network connection')) {
        message = 'Sin conexión a internet. Verifica tu conexión e inténtalo de nuevo.';
      } else if (error.message?.includes('timeout')) {
        message = 'Tiempo de espera agotado. Verifica tu conexión e inténtalo de nuevo.';
      } else if (error.message) {
        message = error.message;
      }

      return { success: false, error: message };
    }
  }

  /**
   * Get user information from access token
   */
  async getUser(accessToken: string): Promise<{ success: boolean; user?: CognitoUser; error?: string }> {
    try {
      const response = await this.cognitoRequest('GetUser', {
        AccessToken: accessToken,
      });

      // Parse user attributes
      const attributes: { [key: string]: string } = {};
      response.UserAttributes.forEach((attr: any) => {
        attributes[attr.Name] = attr.Value;
      });

      const user: CognitoUser = {
        sub: response.Username, // In Cognito, Username is actually the sub
        email: attributes.email,
        email_verified: attributes.email_verified === 'true',
        username: response.Username,
        preferred_username: attributes.preferred_username,
        name: attributes.name,
        given_name: attributes.given_name,
        family_name: attributes.family_name,
        picture: attributes.picture,
      };

      return { success: true, user };
    } catch (error: any) {
      console.error('Get user error:', error);
      
      let message = 'Error al obtener información del usuario';
      if (error.name === 'NotAuthorizedException') {
        message = 'Token de acceso inválido';
      } else if (error.message) {
        message = error.message;
      }

      return { success: false, error: message };
    }
  }

  /**
   * Update user attributes
   */
  async updateUserAttributes(
    accessToken: string,
    attributes: { name?: string; picture?: string; preferred_username?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userAttributes = [];
      
      if (attributes.name) {
        userAttributes.push({ Name: 'name', Value: attributes.name });
      }
      if (attributes.picture) {
        userAttributes.push({ Name: 'picture', Value: attributes.picture });
      }
      if (attributes.preferred_username) {
        userAttributes.push({ Name: 'preferred_username', Value: attributes.preferred_username });
      }

      if (userAttributes.length === 0) {
        return { success: true };
      }

      await this.cognitoRequest('UpdateUserAttributes', {
        AccessToken: accessToken,
        UserAttributes: userAttributes,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Update user attributes error:', error);
      
      let message = 'Error al actualizar perfil';
      if (error.name === 'NotAuthorizedException') {
        message = 'No autorizado para actualizar perfil';
      } else if (error.message) {
        message = error.message;
      }

      return { success: false, error: message };
    }
  }

  /**
   * Sign out user (invalidate tokens)
   */
  async signOut(accessToken: string): Promise<{ success: boolean; error?: string }> {
    loggingService.logAuth('logout', { hasAccessToken: !!accessToken });
    
    try {
      await this.cognitoRequest('GlobalSignOut', {
        AccessToken: accessToken,
      });

      // Clear user context from logging
      loggingService.clearUserId();
      loggingService.logAuth('logout', { success: true });

      return { success: true };
    } catch (error: any) {
      console.error('Sign out error:', error);
      
      loggingService.logAuth('auth_error', {
        operation: 'logout',
        errorName: error.name,
        errorCode: error.code
      });
      
      // Even if sign out fails, we should clear local tokens
      loggingService.clearUserId();
      return { success: true };
    }
  }

  /**
   * Forgot password - send reset code
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message?: string }> {
    try {
      await this.cognitoRequest('ForgotPassword', {
        ClientId: this.config.userPoolWebClientId,
        Username: email,
      });

      return {
        success: true,
        message: 'Código de recuperación enviado a tu email',
      };
    } catch (error: any) {
      console.error('Forgot password error:', error);
      
      let message = 'Error al enviar código de recuperación';
      if (error.name === 'UserNotFoundException') {
        message = 'Usuario no encontrado';
      } else if (error.name === 'LimitExceededException') {
        message = 'Demasiados intentos. Intenta más tarde.';
      } else if (error.message) {
        message = error.message;
      }

      return { success: false, message };
    }
  }

  /**
   * Confirm forgot password with code
   */
  async confirmForgotPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      await this.cognitoRequest('ConfirmForgotPassword', {
        ClientId: this.config.userPoolWebClientId,
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
      });

      return {
        success: true,
        message: 'Contraseña restablecida exitosamente',
      };
    } catch (error: any) {
      console.error('Confirm forgot password error:', error);
      
      let message = 'Error al restablecer contraseña';
      if (error.name === 'CodeMismatchException') {
        message = 'Código de verificación incorrecto';
      } else if (error.name === 'ExpiredCodeException') {
        message = 'Código de verificación expirado';
      } else if (error.name === 'InvalidPasswordException') {
        message = 'La nueva contraseña no cumple los requisitos';
      } else if (error.message) {
        message = error.message;
      }

      return { success: false, message };
    }
  }

  /**
   * Check if tokens are stored and valid
   */
  async checkStoredAuth(): Promise<{ isAuthenticated: boolean; user?: CognitoUser; tokens?: CognitoTokens }> {
    try {
      const storedTokens = await secureTokenStorage.retrieveTokens();
      if (!storedTokens) {
        return { isAuthenticated: false };
      }

      // Check if access token is expired
      const accessTokenPayload = this.parseJWT(storedTokens.accessToken);
      if (!accessTokenPayload || accessTokenPayload.exp * 1000 < Date.now()) {
        // Try to refresh token
        const refreshResult = await this.refreshToken(storedTokens.refreshToken);
        if (refreshResult.success && refreshResult.tokens) {
          const newTokens = refreshResult.tokens;
          await secureTokenStorage.storeTokens(newTokens);
          
          // Get user info with new token
          const userResult = await this.getUser(newTokens.accessToken);
          if (userResult.success && userResult.user) {
            return {
              isAuthenticated: true,
              user: userResult.user,
              tokens: newTokens,
            };
          }
        }
        
        // If refresh failed, clear stored tokens
        await secureTokenStorage.clearTokens();
        return { isAuthenticated: false };
      }

      // Get user info
      const userResult = await this.getUser(storedTokens.accessToken);
      if (userResult.success && userResult.user) {
        return {
          isAuthenticated: true,
          user: userResult.user,
          tokens: storedTokens,
        };
      }

      return { isAuthenticated: false };
    } catch (error) {
      console.error('Check stored auth error:', error);
      await secureTokenStorage.clearTokens();
      return { isAuthenticated: false };
    }
  }

  /**
   * Store tokens securely using device keychain/keystore
   */
  async storeTokens(tokens: CognitoTokens): Promise<void> {
    await secureTokenStorage.storeTokens(tokens, {
      requireAuthentication: false, // Set to true for biometric protection
      keychainService: 'trinity-cognito-auth',
    });
  }

  /**
   * Clear stored tokens securely
   */
  async clearTokens(): Promise<void> {
    await secureTokenStorage.clearTokens();
  }
}

export const cognitoAuthService = new CognitoAuthService();