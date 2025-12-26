import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { Button, Input } from '../src/components';
import { colors, spacing, fontSize } from '../src/utils/theme';
import { LoginCredentials } from '../src/types';

export default function LoginScreen() {
  const { login, isLoading, error, clearError, loginWithGoogle, loginWithApple, isAuthenticated } = useAuth();
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Redirigir cuando el usuario se autentique
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error]);

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};

    if (!credentials.email) {
      newErrors.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email)) {
      newErrors.email = 'Email inválido';
    }

    if (!credentials.password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (credentials.password.length < 6) {
      newErrors.password = 'Mínimo 6 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (validate()) {
      await login(credentials);
    }
  };

  const handleChange = (field: keyof LoginCredentials, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoShape}>
              <View style={[styles.logoBar, styles.logoBar1]} />
              <View style={[styles.logoBar, styles.logoBar2]} />
              <View style={[styles.logoBar, styles.logoBar3]} />
            </View>
          </View>

          {/* Título */}
          <Text style={styles.title}>Bienvenido a Trinity</Text>
          <Text style={styles.subtitle}>Ponte de acuerdo en un chin</Text>

          {/* Formulario */}
          <View style={styles.form}>
            <Input
              label="Correo electrónico"
              placeholder="tu@email.com"
              value={credentials.email}
              onChangeText={(v) => handleChange('email', v)}
              error={errors.email}
              leftIcon={<Ionicons name="mail-outline" size={20} color={colors.textMuted} />}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label="Contraseña"
              placeholder="••••••••"
              value={credentials.password}
              onChangeText={(v) => handleChange('password', v)}
              error={errors.password}
              leftIcon={<Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />}
              secureTextEntry
              autoCapitalize="none"
            />

            <Button
              title="Iniciar sesión"
              onPress={handleLogin}
              loading={isLoading}
              disabled={isLoading}
              style={styles.loginButton}
            />
          </View>

          {/* Separador */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o continúa con</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Botones sociales */}
          <View style={styles.socialButtons}>
            <Button
              title="Google"
              onPress={loginWithGoogle}
              variant="social"
              icon={<Text style={styles.googleIcon}>G</Text>}
              style={styles.socialButton}
            />
            <Button
              title="Apple"
              onPress={loginWithApple}
              variant="social"
              icon={<Ionicons name="logo-apple" size={20} color="#1F2937" />}
              style={styles.socialButton}
            />
          </View>

          {/* Registro */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>¿No tienes cuenta? </Text>
            <TouchableOpacity onPress={() => router.push('/register')}>
              <Text style={styles.registerLink}>Regístrate aquí</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  logoShape: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
  },
  logoBar: {
    width: 16,
    marginHorizontal: 2,
    borderRadius: 4,
  },
  logoBar1: {
    height: 40,
    backgroundColor: '#00D4FF',
  },
  logoBar2: {
    height: 50,
    backgroundColor: '#6366F1',
  },
  logoBar3: {
    height: 35,
    backgroundColor: '#EC4899',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  form: {
    marginBottom: spacing.lg,
  },
  loginButton: {
    marginTop: spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginHorizontal: spacing.md,
  },
  socialButtons: {
    gap: spacing.md,
  },
  socialButton: {
    marginBottom: spacing.sm,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4285F4',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  registerLink: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
