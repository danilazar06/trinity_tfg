import { ApiResponse, LoginCredentials, RegisterData, User } from '../types';
import { apiClient } from './apiClient';

interface AuthResponse {
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  user: User;
  tokens?: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
  };
}

interface RegisterResponse {
  message: string;
  userSub?: string;
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResponse>> {
    try {
      const data = await apiClient.post<any>('/auth/login', {
        email: credentials.email,
        password: credentials.password,
      });
      
      // Normalizar la respuesta - el backend puede devolver tokens anidados o planos
      const normalizedData: AuthResponse = {
        user: data.user,
        accessToken: data.tokens?.accessToken || data.accessToken,
        idToken: data.tokens?.idToken || data.idToken,
        refreshToken: data.tokens?.refreshToken || data.refreshToken,
      };
      
      return { success: true, data: normalizedData };
    } catch (error: any) {
      // Manejar errores de validación que vienen como array
      let errorMessage = 'Error al iniciar sesión';
      const responseMessage = error.response?.data?.message;
      if (Array.isArray(responseMessage)) {
        errorMessage = responseMessage.join('. ');
      } else if (typeof responseMessage === 'string') {
        errorMessage = responseMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async register(data: RegisterData): Promise<ApiResponse<RegisterResponse>> {
    try {
      const response = await apiClient.post<RegisterResponse>('/auth/register', {
        email: data.email,
        password: data.password,
        username: data.name, // Backend espera 'username' no 'name'
        displayName: data.fullName, // Nombre completo del usuario
      });
      return { success: true, data: response };
    } catch (error: any) {
      console.error('AuthService register error:', error);
      // Manejar errores de validación que vienen como array
      let errorMessage = 'Error al registrarse';
      const responseMessage = error.response?.data?.message;
      if (Array.isArray(responseMessage)) {
        errorMessage = responseMessage.join('. ');
      } else if (typeof responseMessage === 'string') {
        errorMessage = responseMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async confirmSignUp(email: string, code: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post<{ message: string }>('/auth/confirm-signup', {
        email,
        code,
      });
      return { success: true, data: response };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Código de confirmación inválido',
      };
    }
  }

  async resendConfirmation(email: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post<{ message: string }>('/auth/resend-confirmation', {
        email,
      });
      return { success: true, data: response };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Error al reenviar código',
      };
    }
  }

  async forgotPassword(email: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post<{ message: string }>('/auth/forgot-password', {
        email,
      });
      return { success: true, data: response };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Error al enviar código de recuperación',
      };
    }
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post<{ message: string }>('/auth/reset-password', {
        email,
        code,
        newPassword,
      });
      return { success: true, data: response };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Error al restablecer contraseña',
      };
    }
  }

  async getProfile(): Promise<ApiResponse<User>> {
    try {
      const user = await apiClient.get<User>('/auth/profile');
      return { success: true, data: user };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Error al obtener perfil',
      };
    }
  }

  async updateProfile(data: { displayName?: string; avatarUrl?: string; phoneNumber?: string }): Promise<ApiResponse<User>> {
    try {
      const user = await apiClient.put<User>('/auth/profile', data);
      return { success: true, data: user };
    } catch (error: any) {
      let errorMessage = 'Error al actualizar perfil';
      const responseMessage = error.response?.data?.message;
      if (Array.isArray(responseMessage)) {
        errorMessage = responseMessage.join('. ');
      } else if (typeof responseMessage === 'string') {
        errorMessage = responseMessage;
      }
      return { success: false, error: errorMessage };
    }
  }

  // Métodos de Google OAuth
  async loginWithGoogle(idToken: string): Promise<ApiResponse<AuthResponse>> {
    try {
      const data = await apiClient.post<any>('/auth/google/login', {
        idToken,
      });
      
      // Normalizar la respuesta
      const normalizedData: AuthResponse = {
        user: data.data.user,
        accessToken: data.data.tokens?.accessToken || data.data.accessToken,
        idToken: data.data.tokens?.idToken || data.data.idToken,
        refreshToken: data.data.tokens?.refreshToken || data.data.refreshToken,
      };
      
      return { success: true, data: normalizedData };
    } catch (error: any) {
      let errorMessage = 'Error al iniciar sesión con Google';
      const responseMessage = error.response?.data?.message;
      if (typeof responseMessage === 'string') {
        errorMessage = responseMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }

  async linkGoogleAccount(idToken: string): Promise<ApiResponse<User>> {
    try {
      const response = await apiClient.post<{ user: User }>('/auth/google/link', {
        idToken,
      });
      return { success: true, data: response.user };
    } catch (error: any) {
      let errorMessage = 'Error al vincular cuenta de Google';
      const responseMessage = error.response?.data?.message;
      if (typeof responseMessage === 'string') {
        errorMessage = responseMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }

  async unlinkGoogleAccount(): Promise<ApiResponse<User>> {
    try {
      const response = await apiClient.delete<{ user: User }>('/auth/google/unlink');
      return { success: true, data: response.user };
    } catch (error: any) {
      let errorMessage = 'Error al desvincular cuenta de Google';
      const responseMessage = error.response?.data?.message;
      if (typeof responseMessage === 'string') {
        errorMessage = responseMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  }

  async getGoogleLinkStatus(): Promise<ApiResponse<{
    isGoogleLinked: boolean;
    authProviders: string[];
    canUnlinkGoogle: boolean;
    googleAuthAvailable: boolean;
  }>> {
    try {
      const response = await apiClient.get<{
        isGoogleLinked: boolean;
        authProviders: string[];
        canUnlinkGoogle: boolean;
        googleAuthAvailable: boolean;
      }>('/auth/google/status');
      return { success: true, data: response };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Error al obtener estado de Google',
      };
    }
  }

  async checkGoogleAuthAvailability(): Promise<ApiResponse<{
    available: boolean;
    message: string;
  }>> {
    try {
      const response = await apiClient.get<{
        available: boolean;
        message: string;
      }>('/auth/google/available');
      return { success: true, data: response };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Error al verificar disponibilidad de Google Auth',
      };
    }
  }
}

export const authService = new AuthService();
