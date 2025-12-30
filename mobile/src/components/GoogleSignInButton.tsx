import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';

interface GoogleSignInButtonProps {
  onSuccess?: (user: any) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  style?: any;
  showFallbackInfo?: boolean;
}

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSuccess,
  onError,
  disabled = false,
  style,
  showFallbackInfo = true,
}) => {
  const {
    isAvailable,
    isSigningIn,
    signIn,
    error,
    capabilities,
    getStatusMessage,
  } = useGoogleSignIn();

  const handleGoogleSignIn = async () => {
    try {
      const result = await signIn();
      
      if (result.success && result.user) {
        onSuccess?.(result.user);
      } else {
        const errorMessage = result.error || 'Error desconocido en Google Sign-In';
        onError?.(errorMessage);
        
        // Show fallback information if Google Sign-In is not available
        if (!isAvailable && showFallbackInfo) {
          showFallbackAlert();
        }
      }
    } catch (err: any) {
      const errorMessage = `Error durante Google Sign-In: ${err.message || err}`;
      onError?.(errorMessage);
    }
  };

  const showFallbackAlert = () => {
    const isExpoGo = capabilities?.environment === 'expo-go';
    
    Alert.alert(
      'Google Sign-In No Disponible',
      isExpoGo
        ? '🔄 Google Sign-In no está disponible en Expo Go.\n\n' +
          '💡 Opciones disponibles:\n' +
          '• Usa email y contraseña para iniciar sesión\n' +
          '• Crea un Development Build para probar Google Sign-In\n\n' +
          '📱 Para crear un Development Build:\n' +
          '1. Ejecuta: npx eas build --profile development\n' +
          '2. Instala el build en tu dispositivo\n' +
          '3. Prueba Google Sign-In en el build'
        : '⚠️  Google Sign-In no está configurado correctamente.\n\n' +
          '💡 Verifica:\n' +
          '• Archivos de configuración de Google Services\n' +
          '• Dependencias de Google Sign-In instaladas\n' +
          '• Configuración en app.json\n\n' +
          '🔄 Mientras tanto, puedes usar email y contraseña.',
      [
        {
          text: 'Entendido',
          style: 'default',
        },
        ...(isExpoGo ? [{
          text: 'Ver Guía',
          onPress: () => {
            // TODO: Navigate to setup guide or open documentation
            console.log('Navigate to Google Sign-In setup guide');
          },
        }] : []),
      ]
    );
  };

  // Don't render button if Google Sign-In is not available and we don't want to show fallback info
  if (!isAvailable && !showFallbackInfo) {
    return null;
  }

  // Render informational message if not available
  if (!isAvailable) {
    return (
      <View style={[styles.unavailableContainer, style]}>
        <View style={styles.unavailableContent}>
          <Ionicons name="information-circle" size={20} color="#FF9800" />
          <Text style={styles.unavailableText}>
            {capabilities?.environment === 'expo-go'
              ? 'Google Sign-In requiere Development Build'
              : 'Google Sign-In no disponible'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.infoButton}
          onPress={showFallbackAlert}
        >
          <Text style={styles.infoButtonText}>Más Info</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.button,
        disabled && styles.buttonDisabled,
        isSigningIn && styles.buttonLoading,
        style,
      ]}
      onPress={handleGoogleSignIn}
      disabled={disabled || isSigningIn || !isAvailable}
      activeOpacity={0.8}
    >
      <View style={styles.buttonContent}>
        {isSigningIn ? (
          <ActivityIndicator size="small" color="#757575" />
        ) : (
          <Ionicons name="logo-google" size={20} color="#4285F4" />
        )}
        <Text style={[
          styles.buttonText,
          disabled && styles.buttonTextDisabled,
          isSigningIn && styles.buttonTextLoading,
        ]}>
          {isSigningIn ? 'Iniciando sesión...' : 'Continuar con Google'}
        </Text>
      </View>
      
      {error && (
        <Text style={styles.errorText} numberOfLines={2}>
          {error}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  buttonDisabled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  buttonLoading: {
    backgroundColor: '#FAFAFA',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3C4043',
  },
  buttonTextDisabled: {
    color: '#9AA0A6',
  },
  buttonTextLoading: {
    color: '#757575',
  },
  errorText: {
    fontSize: 12,
    color: '#D93025',
    marginTop: 8,
    textAlign: 'center',
  },
  unavailableContainer: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFB74D',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  unavailableContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  unavailableText: {
    fontSize: 14,
    color: '#E65100',
    flex: 1,
  },
  infoButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  infoButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default GoogleSignInButton;