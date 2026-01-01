/**
 * APP.JS FINAL - Google Sign-In + AWS Cognito
 * Configuración completa y funcional
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { Amplify, Auth } from 'aws-amplify';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

// Configuración AWS Amplify
Amplify.configure({
  Auth: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_6UxioIj4z',
    userPoolWebClientId: '59dpqsm580j14ulkcha19shl64',
    identityPoolId: '', // Opcional para este caso
    oauth: {
      domain: 'trinity-auth-dev.auth.eu-west-1.amazoncognito.com',
      scope: ['email', 'openid', 'profile'],
      redirectSignIn: 'trinity://auth/callback',
      redirectSignOut: 'trinity://auth/logout',
      responseType: 'code',
    },
  },
});

// Configurar Google Sign-In
GoogleSignin.configure({
  webClientId: '230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com', // TU NUEVO WEB CLIENT ID
  offlineAccess: true,
  forceCodeForRefreshToken: true,
  scopes: ['email', 'profile'],
});

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    try {
      const currentUser = await Auth.currentAuthenticatedUser();
      setUser(currentUser);
      console.log('✅ Usuario autenticado:', currentUser.attributes?.email);
    } catch (error) {
      console.log('ℹ️ No hay usuario autenticado');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    
    try {
      console.log('🚀 Iniciando Google Sign-In...');

      // 1. Verificar Google Play Services (Android)
      try {
        await GoogleSignin.hasPlayServices();
        console.log('✅ Google Play Services disponible');
      } catch (playServicesError: any) {
        console.error('❌ Google Play Services error:', playServicesError);
        Alert.alert('Error', 'Google Play Services no disponible');
        return;
      }

      // 2. Realizar Google Sign-In nativo
      console.log('🔐 Ejecutando GoogleSignin.signIn()...');
      let googleUser;
      
      try {
        googleUser = await GoogleSignin.signIn();
        console.log('✅ Google Sign-In exitoso:', googleUser.user.email);
      } catch (googleError: any) {
        console.error('❌ Google Sign-In error:', googleError);
        
        if (googleError.message && googleError.message.includes('DEVELOPER_ERROR')) {
          Alert.alert(
            'Error de Configuración',
            'DEVELOPER_ERROR: Verifica la configuración de Google Cloud Console y AWS Cognito.',
            [{ text: 'OK' }]
          );
          return;
        }

        if (googleError.code === statusCodes.SIGN_IN_CANCELLED) {
          console.log('ℹ️ Usuario canceló el sign-in');
          return;
        }

        Alert.alert('Error', googleError.message || 'Error en Google Sign-In');
        return;
      }

      // 3. Validar que tenemos idToken
      if (!googleUser.idToken) {
        throw new Error('No se obtuvo idToken de Google');
      }

      console.log('🔑 ID Token obtenido de Google');

      // 4. Federar a AWS Cognito
      console.log('🔄 Federando a AWS Cognito...');
      
      try {
        const cognitoUser = await Auth.federatedSignIn(
          'google',
          { 
            token: googleUser.idToken,
            expires_at: Date.now() + 3600000 // 1 hora
          },
          {
            email: googleUser.user.email,
            name: googleUser.user.name,
            picture: googleUser.user.photo,
          }
        );

        console.log('✅ AWS Cognito federation exitosa');
        console.log('- Cognito User ID:', cognitoUser.attributes?.sub);
        console.log('- Email:', cognitoUser.attributes?.email);

        setUser(cognitoUser);

        Alert.alert(
          '¡Bienvenido!',
          `Hola ${cognitoUser.attributes?.name || cognitoUser.attributes?.email}!\n\nTu cuenta se creó automáticamente en AWS Cognito.`,
          [{ text: 'OK' }]
        );

      } catch (cognitoError: any) {
        console.error('❌ AWS Cognito federation error:', cognitoError);
        Alert.alert(
          'Error de Cognito',
          `No se pudo crear la sesión en AWS Cognito: ${cognitoError.message}`,
          [{ text: 'OK' }]
        );
      }

    } catch (error: any) {
      console.error('❌ Error general:', error);
      Alert.alert('Error', error.message || 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    // Implementación simple para email/password
    try {
      const cognitoUser = await Auth.signIn('prueba@prueba.com', 'TuPassword123');
      setUser(cognitoUser);
      Alert.alert('Éxito', 'Inicio de sesión con email exitoso');
    } catch (error: any) {
      console.error('❌ Email sign-in error:', error);
      Alert.alert('Error', error.message || 'Error en inicio de sesión con email');
    }
  };

  const handleSignOut = async () => {
    try {
      console.log('🚪 Cerrando sesión...');
      
      // Sign out de AWS Cognito
      await Auth.signOut();
      console.log('✅ AWS Cognito sign-out exitoso');

      // Sign out de Google
      try {
        await GoogleSignin.signOut();
        console.log('✅ Google sign-out exitoso');
      } catch (googleSignOutError) {
        console.log('ℹ️ Google sign-out no necesario o ya realizado');
      }

      setUser(null);
      Alert.alert('Sesión Cerrada', 'Has cerrado sesión correctamente');

    } catch (error: any) {
      console.error('❌ Error cerrando sesión:', error);
      Alert.alert('Error', 'Error cerrando sesión');
    }
  };

  if (isCheckingAuth) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Verificando autenticación...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Trinity App</Text>
        <Text style={styles.subtitle}>Google + AWS Cognito</Text>
        
        {user ? (
          <View style={styles.userContainer}>
            <Text style={styles.welcomeText}>¡Bienvenido!</Text>
            <Text style={styles.userText}>Email: {user.attributes?.email}</Text>
            <Text style={styles.userText}>Nombre: {user.attributes?.name || 'N/A'}</Text>
            <Text style={styles.userText}>ID: {user.attributes?.sub}</Text>
            
            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Text style={styles.buttonText}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.signInContainer}>
            <Text style={styles.signInText}>Inicia sesión para continuar</Text>
            
            <TouchableOpacity
              style={[styles.googleButton, isLoading && styles.buttonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Iniciar sesión con Google</Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.emailButton} onPress={handleEmailSignIn}>
              <Text style={styles.buttonText}>Probar Email/Password</Text>
            </TouchableOpacity>
          </View>
        )}
        
        <View style={styles.configInfo}>
          <Text style={styles.configTitle}>Configuración:</Text>
          <Text style={styles.configText}>✅ AWS Cognito User Pool</Text>
          <Text style={styles.configText}>✅ Google Identity Provider</Text>
          <Text style={styles.configText}>✅ Implementación nativa</Text>
          <Text style={styles.configText}>🔧 Web Client ID: ...cqb6dv3o58oeblrfrk49o0a6l7ecjtrn</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  userContainer: {
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4285F4',
    marginBottom: 16,
  },
  userText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  signInContainer: {
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  signInText: {
    fontSize: 18,
    color: '#333',
    marginBottom: 20,
  },
  googleButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginVertical: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  emailButton: {
    backgroundColor: '#34A853',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginVertical: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  signOutButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
    minWidth: 150,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  configInfo: {
    backgroundColor: '#e8f5e8',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  configTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  configText: {
    fontSize: 14,
    color: '#2e7d32',
    marginBottom: 4,
  },
});