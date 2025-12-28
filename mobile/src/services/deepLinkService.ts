import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export interface DeepLinkHandler {
  (url: string): void;
}

class DeepLinkService {
  private handlers: Map<string, DeepLinkHandler> = new Map();

  /**
   * Inicializar el servicio de deep linking
   */
  initialize(): void {
    // Configurar WebBrowser para OAuth
    WebBrowser.maybeCompleteAuthSession();

    // Escuchar cambios de URL
    Linking.addEventListener('url', this.handleDeepLink.bind(this));

    // Manejar URL inicial si la app se abrió desde un deep link
    this.handleInitialURL();
  }

  /**
   * Manejar URL inicial
   */
  private async handleInitialURL(): Promise<void> {
    try {
      const initialURL = await Linking.getInitialURL();
      if (initialURL) {
        this.handleDeepLink({ url: initialURL });
      }
    } catch (error) {
      console.error('Error manejando URL inicial:', error);
    }
  }

  /**
   * Manejar deep link
   */
  private handleDeepLink(event: { url: string }): void {
    const { url } = event;
    console.log('📱 Deep link recibido:', url);

    try {
      const parsedURL = new URL(url);
      const path = parsedURL.pathname;

      // Buscar handler para esta ruta
      const handler = this.handlers.get(path);
      if (handler) {
        handler(url);
      } else {
        console.warn('⚠️ No hay handler para el deep link:', path);
      }
    } catch (error) {
      console.error('❌ Error procesando deep link:', error);
    }
  }

  /**
   * Registrar handler para una ruta específica
   */
  registerHandler(path: string, handler: DeepLinkHandler): void {
    this.handlers.set(path, handler);
    console.log('✅ Handler registrado para:', path);
  }

  /**
   * Desregistrar handler
   */
  unregisterHandler(path: string): void {
    this.handlers.delete(path);
    console.log('🗑️ Handler desregistrado para:', path);
  }

  /**
   * Abrir URL externa
   */
  async openURL(url: string): Promise<void> {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        console.error('❌ No se puede abrir la URL:', url);
      }
    } catch (error) {
      console.error('❌ Error abriendo URL:', error);
    }
  }

  /**
   * Obtener URL de callback para OAuth
   */
  getOAuthCallbackURL(): string {
    return 'trinity://auth/callback';
  }

  /**
   * Limpiar listeners
   */
  cleanup(): void {
    Linking.removeAllListeners('url');
    this.handlers.clear();
  }
}

// Exportar instancia singleton
export const deepLinkService = new DeepLinkService();