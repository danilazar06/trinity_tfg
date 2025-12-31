import { Redirect } from 'expo-router';
import { useCognitoAuth } from '../src/context/CognitoAuthContext';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { colors } from '../src/utils/theme';
import { useEffect, useState } from 'react';

export default function Index() {
  const { isAuthenticated, isLoading, error } = useCognitoAuth();
  const [navigationReady, setNavigationReady] = useState(false);

  useEffect(() => {
    // Add a small delay to ensure navigation is ready
    const timer = setTimeout(() => {
      setNavigationReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Show loading while auth is being checked or navigation isn't ready
  if (isLoading || !navigationReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  // Show error state if there's an authentication error
  if (error) {
    console.log('🔍 Index: Auth error detected, redirecting to login');
    return <Redirect href="/login" />;
  }

  // Navigate based on authentication state
  if (isAuthenticated) {
    console.log('🔍 Index: User authenticated, redirecting to tabs');
    return <Redirect href="/(tabs)" />;
  }

  console.log('🔍 Index: User not authenticated, redirecting to login');
  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 16,
    fontSize: 16,
  },
});
