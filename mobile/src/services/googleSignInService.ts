import Constants from 'expo-constants';

// Importar Google Sign-In de forma condicional
let GoogleSignin: any = null;
let statusCodes: any = null;

try {
  const googleSignInModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSignInModule.GoogleSignin;
  statusCodes = googleSignInModule.statusCodes;
} catch (error) {
  console.warn('⚠️ Google Sign-In SDK no está disponible en este entorno');
}

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  photo?: string;
  idToken: string;
  accessToken?: string;
}

export interface GoogleSignInConfig {
  webClientId: string;
  iosClientId?: string;
  androidClientId?: string;
}

class GoogleSignInService {
  private isConfigured = false;

  /**
   * Configurar Google Sign-In
   */
  async configure(): Promise<void> {
    try {
      if (!GoogleSignin) {
        console.warn('⚠️ Google Sign-In SDK no está disponible');
        return;
      }

      const config = Constants.expoConfig?.extra as any;
      
      if (!config?.googleWebClientId || config.googleWebClientId === 'your_google_web_client_id_here') {
        console.warn('⚠️ Google Web Client ID no configurado');
        return;
      }

      GoogleSignin.configure({
        webClientId: config.googleWebClientId,
        iosClientId: config.googleIosClientId,
        offlineAccess: true,
        hostedDomain: '',
        forceCodeForRefreshToken: true,
        accountName: '',
        googleServicePlistPath: '',
        openIdRealm: '',
        profileImageSize: 120,
      });

      this.isConfigured = true;
      console.log('✅ Google Sign-In configurado correctamente');
      
    } catch (error) {
      console.error('❌ Error configurando Google Sign-In:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Verificar si Google Sign-In está disponible
   */
  async isAvailable(): Promise<boolean> {
    if (!GoogleSignin) {
      return false;
    }
    
    if (!this.isConfigured) {
      await this.configure();
    }
    
    return this.isConfigured;
  }

  /**
   * Iniciar sesión con Google
   */
  async signIn(): Promise<GoogleUser> {
    try {
      if (!GoogleSignin || !statusCodes) {
        throw new Error('Google Sign-In SDK no está disponible en este entorno');
      }

      if (!await this.isAvailable()) {
        throw new Error('Google Sign-In no está configurado');
      }

      // Verificar si Google Play Services está disponible (Android)
      await GoogleSignin.hasPlayServices();

      // Realizar sign-in
      const userInfo = await GoogleSignin.signIn();
      
      if (!userInfo.data?.user || !userInfo.data?.idToken) {
        throw new Error('No se pudo obtener información del usuario');
      }

      const googleUser: GoogleUser = {
        id: userInfo.data.user.id,
        email: userInfo.data.user.email,
        name: userInfo.data.user.name || userInfo.data.user.email,
        photo: userInfo.data.user.photo || undefined,
        idToken: userInfo.data.idToken,
        accessToken: userInfo.data.serverAuthCode || undefined,
      };

      console.log('✅ Google Sign-In exitoso:', googleUser.email);
      return googleUser;
      
    } catch (error: any) {
      console.error('❌ Error en Google Sign-In:', error);
      
      // Manejar errores específicos solo si statusCodes está disponible
      if (statusCodes && error.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('Inicio de sesión cancelado por el usuario');
      } else if (statusCodes && error.code === statusCodes.IN_PROGRESS) {
        throw new Error('Inicio de sesión en progreso');
      } else if (statusCodes && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services no está disponible');
      } else {
        throw new Error(error.message || 'Error desconocido en Google Sign-In');
      }
    }
  }

  /**
   * Cerrar sesión de Google
   */
  async signOut(): Promise<void> {
    try {
      if (!GoogleSignin || !await this.isAvailable()) {
        return;
      }

      await GoogleSignin.signOut();
      console.log('✅ Google Sign-Out exitoso');
      
    } catch (error) {
      console.error('❌ Error en Google Sign-Out:', error);
      // No lanzar error, ya que el sign-out local puede continuar
    }
  }

  /**
   * Revocar acceso de Google
   */
  async revokeAccess(): Promise<void> {
    try {
      if (!GoogleSignin || !await this.isAvailable()) {
        return;
      }

      await GoogleSignin.revokeAccess();
      console.log('✅ Google Access revocado');
      
    } catch (error) {
      console.error('❌ Error revocando acceso de Google:', error);
      // No lanzar error, ya que la revocación local puede continuar
    }
  }

  /**
   * Obtener usuario actual de Google (si está autenticado)
   */
  async getCurrentUser(): Promise<GoogleUser | null> {
    try {
      if (!GoogleSignin || !await this.isAvailable()) {
        return null;
      }

      const userInfo = GoogleSignin.getCurrentUser();
      
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
      console.error('❌ Error obteniendo usuario actual de Google:', error);
      return null;
    }
  }

  /**
   * Verificar si el usuario está autenticado con Google
   */
  async isSignedIn(): Promise<boolean> {
    try {
      if (!await this.isAvailable()) {
        return false;
      }

      const currentUser = this.getCurrentUser();
      return currentUser !== null;
      
    } catch (error) {
      console.error('❌ Error verificando estado de Google Sign-In:', error);
      return false;
    }
  }
}

// Exportar instancia singleton
export const googleSignInService = new GoogleSignInService();