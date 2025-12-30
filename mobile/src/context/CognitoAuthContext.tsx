/**
 * AWS Cognito Authentication Context
 * Manages authentication state using AWS Cognito User Pool
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { cognitoAuthService, CognitoUser, CognitoTokens } from '../services/cognitoAuthService';
import { migrationService } from '../services/migrationService';
import { useAppSync } from '../services/apiClient';

interface AuthState {
  user: CognitoUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  migrationStatus: 'checking' | 'completed' | 'relogin_required' | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateProfile: (attributes: { name?: string; picture?: string }) => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: { user: CognitoUser; tokens: CognitoTokens } | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_MIGRATION_STATUS'; payload: 'checking' | 'completed' | 'relogin_required' | null }
  | { type: 'LOGOUT' };

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  migrationStatus: null,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload?.user || null,
        isAuthenticated: !!action.payload?.user,
        isLoading: false,
        error: null,
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_MIGRATION_STATUS':
      return { ...state, migrationStatus: action.payload };
    case 'LOGOUT':
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
};

const CognitoAuthContext = createContext<AuthContextType | undefined>(undefined);

export const useCognitoAuth = () => {
  const context = useContext(CognitoAuthContext);
  if (!context) {
    throw new Error('useCognitoAuth debe usarse dentro de CognitoAuthProvider');
  }
  return context;
};

export const CognitoAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      // First, perform migration check
      console.log('🔍 Checking for legacy token migration...');
      dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'checking' });
      
      const migrationResult = await migrationService.performMigrationCheck();
      
      switch (migrationResult) {
        case 'no_migration_needed':
          console.log('✅ No migration needed');
          dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
          break;
          
        case 'migration_completed':
          console.log('✅ Migration completed successfully');
          dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
          break;
          
        case 'relogin_required':
          console.log('🔄 Re-login required after migration');
          dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'relogin_required' });
          
          // Show re-login message to user
          migrationService.showReloginMessage();
          
          // Clear any existing auth state
          dispatch({ type: 'SET_USER', payload: null });
          return;
      }
      
      // After migration check, proceed with normal auth check
      const authResult = await cognitoAuthService.checkStoredAuth();
      
      if (authResult.isAuthenticated && authResult.user && authResult.tokens) {
        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: authResult.user, 
            tokens: authResult.tokens 
          } 
        });
      } else {
        dispatch({ type: 'SET_USER', payload: null });
      }
    } catch (error) {
      console.error('Check auth status error:', error);
      dispatch({ type: 'SET_USER', payload: null });
      dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
    }
  };

  const login = async (email: string, password: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await cognitoAuthService.login(email, password);
      
      if (result.success && result.data) {
        // Store tokens
        await cognitoAuthService.storeTokens(result.data.tokens);
        
        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: result.data.user, 
            tokens: result.data.tokens 
          } 
        });
        
        // Mark migration as completed after successful login
        dispatch({ type: 'SET_MIGRATION_STATUS', payload: 'completed' });
        
        console.log('✅ Login successful with Cognito');
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error || 'Error al iniciar sesión' });
      }
    } catch (error: any) {
      console.error('Login error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
    }
  };

  const register = async (email: string, password: string, name: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await cognitoAuthService.register(email, password, name);
      
      dispatch({ type: 'SET_LOADING', payload: false });
      
      if (result.success) {
        return { 
          success: true, 
          message: result.message || 'Cuenta creada exitosamente. Ya puedes iniciar sesión.' 
        };
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.message || 'Error al registrarse' });
        return { success: false, message: result.message };
      }
    } catch (error: any) {
      console.error('Register error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
      return { success: false, message: error.message || 'Error de conexión' };
    }
  };

  const logout = async () => {
    try {
      // Get current tokens to sign out from Cognito
      const storedTokens = await cognitoAuthService.checkStoredAuth();
      if (storedTokens.isAuthenticated && storedTokens.tokens) {
        await cognitoAuthService.signOut(storedTokens.tokens.accessToken);
      }
    } catch (error) {
      console.warn('Error signing out from Cognito:', error);
    } finally {
      // Always clear local tokens and state
      await cognitoAuthService.clearTokens();
      dispatch({ type: 'LOGOUT' });
    }
  };

  const clearError = () => dispatch({ type: 'CLEAR_ERROR' });

  const updateProfile = async (attributes: { name?: string; picture?: string }) => {
    if (!state.user) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const storedTokens = await cognitoAuthService.checkStoredAuth();
      if (!storedTokens.isAuthenticated || !storedTokens.tokens) {
        throw new Error('No authenticated user found');
      }

      const updateAttributes: { name?: string; picture?: string; preferred_username?: string } = {};
      
      if (attributes.name) {
        updateAttributes.name = attributes.name;
        updateAttributes.preferred_username = attributes.name;
      }
      if (attributes.picture) {
        updateAttributes.picture = attributes.picture;
      }

      const result = await cognitoAuthService.updateUserAttributes(
        storedTokens.tokens.accessToken,
        updateAttributes
      );

      if (result.success) {
        // Update local user state
        const updatedUser: CognitoUser = {
          ...state.user,
          name: attributes.name || state.user.name,
          preferred_username: attributes.name || state.user.preferred_username,
          picture: attributes.picture || state.user.picture,
        };

        dispatch({ 
          type: 'SET_USER', 
          payload: { 
            user: updatedUser, 
            tokens: storedTokens.tokens 
          } 
        });
      } else {
        dispatch({ type: 'SET_ERROR', payload: result.error || 'Error al actualizar perfil' });
      }
    } catch (error: any) {
      console.error('Update profile error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error al actualizar perfil' });
    }
  };

  const forgotPassword = async (email: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await cognitoAuthService.forgotPassword(email);
      dispatch({ type: 'SET_LOADING', payload: false });
      
      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.message || 'Error al enviar código' });
      }
      
      return result;
    } catch (error: any) {
      console.error('Forgot password error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
      return { success: false, message: error.message || 'Error de conexión' };
    }
  };

  const confirmForgotPassword = async (email: string, code: string, newPassword: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const result = await cognitoAuthService.confirmForgotPassword(email, code, newPassword);
      dispatch({ type: 'SET_LOADING', payload: false });
      
      if (!result.success) {
        dispatch({ type: 'SET_ERROR', payload: result.message || 'Error al restablecer contraseña' });
      }
      
      return result;
    } catch (error: any) {
      console.error('Confirm forgot password error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
      return { success: false, message: error.message || 'Error de conexión' };
    }
  };

  return (
    <CognitoAuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        clearError,
        updateProfile,
        forgotPassword,
        confirmForgotPassword,
      }}
    >
      {children}
    </CognitoAuthContext.Provider>
  );
};

export default CognitoAuthProvider;