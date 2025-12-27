import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthState, User, LoginCredentials, RegisterData } from '../types';
import { authService } from '../services/authService';
import { setOnUnauthorizedCallback } from '../services/apiClient';

// Flag para usar mock o backend real
const USE_MOCK = false; // Cambiar a false para usar el backend real

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string } | undefined>;
  logout: () => Promise<void>;
  clearError: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }
  | { type: 'LOGOUT' };

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        isLoading: false,
        error: null,
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'LOGOUT':
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    checkAuthStatus();
    
    // Registrar callback para logout automático en caso de 401
    setOnUnauthorizedCallback(() => {
      logout();
    });
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        // Si es un token mock, limpiar automáticamente
        if (token.startsWith('mock-token-')) {
          await AsyncStorage.removeItem('authToken');
          await AsyncStorage.removeItem('userData');
          dispatch({ type: 'SET_USER', payload: null });
          return;
        }
        
        const savedUser = await AsyncStorage.getItem('userData');
        if (savedUser) {
          // Verificar si el token es válido haciendo una petición de prueba
          try {
            await authService.getProfile();
            dispatch({ type: 'SET_USER', payload: JSON.parse(savedUser) });
          } catch (error: any) {
            // Si el token es inválido, limpiar todo
            await AsyncStorage.removeItem('authToken');
            await AsyncStorage.removeItem('userData');
            dispatch({ type: 'SET_USER', payload: null });
          }
        } else {
          await AsyncStorage.removeItem('authToken');
          dispatch({ type: 'SET_USER', payload: null });
        }
      } else {
        dispatch({ type: 'SET_USER', payload: null });
      }
    } catch {
      // En caso de error, limpiar todo
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      dispatch({ type: 'SET_USER', payload: null });
    }
  };

  const login = async (credentials: LoginCredentials) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      if (USE_MOCK) {
        // Mock login para desarrollo sin backend
        if (credentials.email && credentials.password.length >= 6) {
          const mockUser: User = {
            id: 'mock-user-email',
            email: credentials.email,
            name: credentials.email.split('@')[0],
            avatar: 'https://i.pravatar.cc/150?img=1',
          };
          await AsyncStorage.setItem('authToken', 'mock-token-email');
          await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
          dispatch({ type: 'SET_USER', payload: mockUser });
        } else {
          dispatch({ type: 'SET_ERROR', payload: 'Credenciales inválidas' });
        }
      } else {
        // Login real con backend
        const response = await authService.login(credentials);
        if (response.success && response.data) {
          const { accessToken, idToken, user } = response.data;
          
          // Usar accessToken preferentemente, luego idToken
          let tokenToSave = '';
          if (accessToken && accessToken.length > 0) {
            tokenToSave = accessToken;
          } else if (idToken && idToken.length > 0) {
            tokenToSave = idToken;
          } else {
            dispatch({ type: 'SET_ERROR', payload: 'No se recibieron tokens válidos' });
            return;
          }
          
          // Verificar que el token tenga formato JWT válido
          const tokenParts = tokenToSave.split('.');
          if (tokenParts.length !== 3) {
            dispatch({ type: 'SET_ERROR', payload: 'Token recibido no es válido' });
            return;
          }
          
          // Asegurar que el usuario tenga los campos correctos
          const userWithAvatar = {
            ...user,
            name: user.displayName || user.username || user.email?.split('@')[0],
            displayName: user.displayName || user.username,
            avatar: user.avatarUrl || user.avatar || undefined,
            avatarUrl: user.avatarUrl || user.avatar || undefined,
          };
          
          await AsyncStorage.setItem('authToken', tokenToSave);
          await AsyncStorage.setItem('userData', JSON.stringify(userWithAvatar));
          dispatch({ type: 'SET_USER', payload: userWithAvatar });
        } else {
          dispatch({ type: 'SET_ERROR', payload: response.error || 'Error al iniciar sesión' });
        }
      }
    } catch (error: any) {
      console.error('Login error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
    }
  };

  const register = async (data: RegisterData) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      if (USE_MOCK) {
        const mockUser: User = {
          id: 'mock-user-new',
          email: data.email,
          name: data.name,
          avatar: undefined, // Cambiar null por undefined
        };
        await AsyncStorage.setItem('authToken', 'mock-token-register');
        await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
        dispatch({ type: 'SET_USER', payload: mockUser });
      } else {
        const response = await authService.register(data);
        if (response.success) {
          // Registro exitoso - el usuario puede hacer login directamente
          // (Cognito está configurado para no requerir confirmación por email)
          dispatch({ type: 'SET_LOADING', payload: false });
          return { success: true, message: 'Cuenta creada exitosamente. Ya puedes iniciar sesión.' };
        } else {
          dispatch({ type: 'SET_ERROR', payload: response.error || 'Error al registrarse' });
          return { success: false };
        }
      }
    } catch (error: any) {
      console.error('Register error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
      return { success: false };
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('userData');
    dispatch({ type: 'LOGOUT' });
  };

  const clearError = () => dispatch({ type: 'CLEAR_ERROR' });

  const loginWithGoogle = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      if (USE_MOCK) {
        // Mock para desarrollo
        const mockUser: User = {
          id: 'mock-user-123',
          email: 'usuario@trinity.app',
          name: 'Usuario Demo',
          avatar: 'https://i.pravatar.cc/150?img=3',
        };
        await AsyncStorage.setItem('authToken', 'mock-token-google');
        await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
        dispatch({ type: 'SET_USER', payload: mockUser });
      } else {
        // Google Sign-In no está implementado aún - usar login normal
        dispatch({ type: 'SET_ERROR', payload: 'Google Sign-In no está disponible. Usa email y contraseña.' });
      }
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: 'Error con Google' });
    }
  };

  const loginWithApple = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      if (USE_MOCK) {
        // Mock para desarrollo
        const mockUser: User = {
          id: 'mock-user-456',
          email: 'apple@trinity.app',
          name: 'Usuario Apple',
          avatar: 'https://i.pravatar.cc/150?img=5',
        };
        await AsyncStorage.setItem('authToken', 'mock-token-apple');
        await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
        dispatch({ type: 'SET_USER', payload: mockUser });
      } else {
        // Apple Sign-In no está implementado aún - usar login normal
        dispatch({ type: 'SET_ERROR', payload: 'Apple Sign-In no está disponible. Usa email y contraseña.' });
      }
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: 'Error con Apple' });
    }
  };

  const updateUser = async (updatedUser: User) => {
    await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
    dispatch({ type: 'SET_USER', payload: updatedUser });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        clearError,
        loginWithGoogle,
        loginWithApple,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
