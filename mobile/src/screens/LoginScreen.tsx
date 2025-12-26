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
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { LoginCredentials } from '../types';

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const { login, isLoading, error, clearError, loginWithGoogle, loginWithApple } = useAuth();
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

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

  // Iconos simples con emojis (se pueden reemplazar por react-native-vector-icons)
  const EmailIcon = () => <Text style={styles.inputIcon}>✉️</Text>;
  const LockIcon = () => <Text style={styles.inputIcon}>🔒</Text>;
  const GoogleIcon = () => <Text style={styles.socialIcon}>G</Text>;
  const AppleIcon = () => <Text style={styles.socialIcon}></Text>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
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
            <View style={styles.logo}>
              <View style={styles.logoShape}>
                <View style={[styles.logoBar, styles.logoBar1]} />
                <View style={[styles.logoBar, styles.logoBar2]} />
                <View style={[styles.logoBar, styles.logoBar3]} />
              </View>
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
              leftIcon={<EmailIcon />}
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
              leftIcon={<LockIcon />}
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
              icon={<GoogleIcon />}
              style={styles.socialButton}
            />
            <Button
              title="Apple"
              onPress={loginWithApple}
              variant="social"
              icon={<AppleIcon />}
              style={styles.socialButton}
            />
          </View>

          {/* Registro */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>¿No tienes cuenta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Regístrate aquí</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

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
  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  logo: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Títulos
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
  // Formulario
  form: {
    marginBottom: spacing.lg,
  },
  loginButton: {
    marginTop: spacing.md,
  },
  // Iconos
  inputIcon: {
    fontSize: 18,
  },
  // Separador
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
  // Botones sociales
  socialButtons: {
    gap: spacing.md,
  },
  socialButton: {
    marginBottom: spacing.sm,
  },
  socialIcon: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Footer
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
