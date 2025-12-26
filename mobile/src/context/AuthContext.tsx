import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthState, User, LoginCredentials, RegisterData } from '../types';
import { authService } from '../services/authService';

// Flag para usar mock o backend real
const USE_MOCK = false; // Cambiar a false para usar el backend real

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
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
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        const savedUser = await AsyncStorage.getItem('userData');
        if (savedUser) {
          dispatch({ type: 'SET_USER', payload: JSON.parse(savedUser) });
        } else {
          await AsyncStorage.removeItem('authToken');
          dispatch({ type: 'SET_USER', payload: null });
        }
      } else {
        dispatch({ type: 'SET_USER', payload: null });
      }
    } catch {
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
          await AsyncStorage.setItem('authToken', accessToken || idToken);
          await AsyncStorage.setItem('userData', JSON.stringify(user));
          dispatch({ type: 'SET_USER', payload: user });
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
          avatar: 'https://i.pravatar.cc/150?img=2',
        };
        await AsyncStorage.setItem('authToken', 'mock-token-register');
        await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
        dispatch({ type: 'SET_USER', payload: mockUser });
      } else {
        const response = await authService.register(data);
        if (response.success) {
          // Después del registro, el usuario necesita confirmar su email
          // Por ahora, mostramos un mensaje de éxito
          dispatch({ type: 'SET_LOADING', payload: false });
          // Podrías navegar a una pantalla de confirmación aquí
        } else {
          dispatch({ type: 'SET_ERROR', payload: response.error || 'Error al registrarse' });
        }
      }
    } catch (error: any) {
      console.error('Register error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error de conexión' });
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
      // Por ahora, mock - Google Sign-In requiere configuración adicional
      const mockUser: User = {
        id: 'mock-user-123',
        email: 'usuario@trinity.app',
        name: 'Usuario Demo',
        avatar: 'https://i.pravatar.cc/150?img=3',
      };
      await AsyncStorage.setItem('authToken', 'mock-token-google');
      await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
      dispatch({ type: 'SET_USER', payload: mockUser });
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: 'Error con Google' });
    }
  };

  const loginWithApple = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      // Por ahora, mock - Apple Sign-In requiere configuración adicional
      const mockUser: User = {
        id: 'mock-user-456',
        email: 'apple@trinity.app',
        name: 'Usuario Apple',
        avatar: 'https://i.pravatar.cc/150?img=5',
      };
      await AsyncStorage.setItem('authToken', 'mock-token-apple');
      await AsyncStorage.setItem('userData', JSON.stringify(mockUser));
      dispatch({ type: 'SET_USER', payload: mockUser });
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: 'Error con Apple' });
    }
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
