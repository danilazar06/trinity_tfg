/**
 * Ejemplo de App.js con Google + AWS Cognito Authentication
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Amplify } from 'aws-amplify';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { finalGoogleCognitoAuth } from '../services/finalGoogleCognitoAuth';
import { AWS_CONFIG } from '../config/aws-config';

// Configurar AWS Amplify
Amplify.configure({
  Auth: {
    region: AWS_CONFIG.region,
    userPoolId: AWS_CONFIG.userPoolId,
    userPoolWebClientId: AWS_CONFIG.userPoolWebClientId,
    identityPoolId: AWS_CONFIG.identityPoolId,
    oauth: AWS_CONFIG.oauth,
  },
  API: {
    endpoints: [
      {
        name: 'trinity-api',
        endpoint: AWS_CONFIG.graphqlEndpoint,
        region: AWS_CONFIG.region,
      },
    ],
  },
});

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    try {
      const currentUser = await finalGoogleCognitoAuth.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.log('No hay usuario autenticado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignInSuccess = (signedInUser: any) => {
    setUser(signedInUser);
  };

  const handleSignInError = (error: string) => {
    console.error('Error de autenticación:', error);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Cargando...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Trinity App</Text>
        <Text style={styles.subtitle}>Google + AWS Cognito Authentication</Text>
        
        {user ? (
          <View style={styles.userInfo}>
            <Text style={styles.welcomeText}>¡Bienvenido!</Text>
            <Text style={styles.userText}>Email: {user.email}</Text>
            <Text style={styles.userText}>Nombre: {user.name}</Text>
            <Text style={styles.userText}>ID: {user.userId}</Text>
            <Text style={styles.providerText}>Provider: {user.provider}</Text>
            
            <GoogleSignInButton
              onSignInSuccess={handleSignInSuccess}
              onSignInError={handleSignInError}
            />
          </View>
        ) : (
          <View style={styles.signInContainer}>
            <Text style={styles.signInText}>Inicia sesión para continuar</Text>
            
            <GoogleSignInButton
              onSignInSuccess={handleSignInSuccess}
              onSignInError={handleSignInError}
            />
          </View>
        )}
        
        <View style={styles.configInfo}>
          <Text style={styles.configTitle}>Configuración:</Text>
          <Text style={styles.configText}>✅ AWS Cognito User Pool</Text>
          <Text style={styles.configText}>✅ Google Identity Provider</Text>
          <Text style={styles.configText}>✅ Implementación nativa segura</Text>
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
    textAlign: 'center',
  },
  userInfo: {
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
  providerText: {
    fontSize: 14,
    color: '#4285F4',
    fontWeight: '600',
    marginBottom: 20,
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
    textAlign: 'center',
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