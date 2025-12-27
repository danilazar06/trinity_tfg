import React, { useState, useEffect, useRef } from 'react';
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
  Dimensions,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { Input } from '../src/components';
import { colors, spacing, fontSize, borderRadius, shadows } from '../src/utils/theme';
import { RegisterData } from '../src/types';

const { width, height } = Dimensions.get('window');

// Posters de películas para el fondo
const MOVIE_POSTERS = [
  'https://image.tmdb.org/t/p/w300/qNBAXBIQlnOThrVvA6mA2B5ber9.jpg',
  'https://image.tmdb.org/t/p/w300/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
  'https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  'https://image.tmdb.org/t/p/w300/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg',
  'https://image.tmdb.org/t/p/w300/velWPhVMQeQKcxggNEU8YmIo52R.jpg',
  'https://image.tmdb.org/t/p/w300/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
  'https://image.tmdb.org/t/p/w300/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
  'https://image.tmdb.org/t/p/w300/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg',
];

export default function RegisterScreen() {
  const { register, isLoading, error, clearError } = useAuth();
  const [formData, setFormData] = useState<RegisterData>({
    name: '',
    email: '',
    password: '',
    fullName: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    fullName?: string;
  }>({});

  // Animaciones
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const posterScrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.timing(posterScrollAnim, { toValue: 1, duration: 25000, useNativeDriver: true })
    ).start();
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!formData.fullName?.trim()) {
      newErrors.fullName = 'El nombre completo es requerido';
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Mínimo 2 caracteres';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre de usuario es requerido';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Mínimo 3 caracteres';
    } else if (formData.name.trim().length > 20) {
      newErrors.name = 'Máximo 20 caracteres';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.name.trim())) {
      newErrors.name = 'Solo letras, números y guiones bajos';
    }

    if (!formData.email) {
      newErrors.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    if (!formData.password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Mínimo 8 caracteres';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(formData.password)) {
      newErrors.password = 'Debe incluir mayúscula, minúscula, número y símbolo (@$!%*?&)';
    }

    if (confirmPassword !== formData.password) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (validate()) {
      const result = await register(formData);
      if (result?.success) {
        Alert.alert(
          'Cuenta creada',
          'Tu cuenta ha sido creada exitosamente. Ya puedes iniciar sesión.',
          [{ text: 'Ir a Login', onPress: () => router.replace('/login') }]
        );
      }
    }
  };

  const handleChange = (field: keyof RegisterData | 'confirmPassword', value: string) => {
    if (field === 'confirmPassword') {
      setConfirmPassword(value);
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
    if (errors[field as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const translateX = posterScrollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width * 0.8],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Fondo con posters */}
      <View style={styles.posterBackground}>
        <Animated.View style={[styles.posterRow, { transform: [{ translateX }] }]}>
          {[...MOVIE_POSTERS, ...MOVIE_POSTERS].map((poster, index) => (
            <Image key={index} source={{ uri: poster }} style={styles.posterImage} blurRadius={2} />
          ))}
        </Animated.View>
      </View>

      {/* Overlay gradiente */}
      <LinearGradient
        colors={['rgba(10, 10, 15, 0.4)', 'rgba(10, 10, 15, 0.9)', 'rgba(10, 10, 15, 0.98)']}
        locations={[0, 0.3, 0.6]}
        style={StyleSheet.absoluteFill}
      />

      {/* Círculos decorativos */}
      <View style={styles.glowCircleCyan} />
      <View style={styles.glowCirclePurple} />
      <View style={styles.glowCircleRed} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back button */}
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.2)', 'rgba(6, 182, 212, 0.1)']}
                style={styles.backButtonGradient}
              >
                <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
              </LinearGradient>
            </TouchableOpacity>

            <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              {/* Logo animado */}
              <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
                <LinearGradient
                  colors={['rgba(6, 182, 212, 0.3)', 'rgba(139, 92, 246, 0.2)']}
                  style={styles.logoGlow}
                />
                <View style={styles.logo}>
                  <View style={styles.logoShape}>
                    <LinearGradient colors={[colors.secondary, colors.secondaryLight]} style={[styles.logoBar, { height: 24 }]} />
                    <LinearGradient colors={[colors.primary, colors.primaryLight]} style={[styles.logoBar, { height: 32 }]} />
                    <LinearGradient colors={[colors.accent, colors.accentLight]} style={[styles.logoBar, { height: 18 }]} />
                  </View>
                </View>
              </Animated.View>

              {/* Título */}
              <Text style={styles.title}>Crear cuenta</Text>
              <Text style={styles.subtitle}>Únete a Trinity y encuentra películas 🎬</Text>

              {/* Formulario */}
              <View style={styles.form}>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Nombre completo</Text>
                  <View style={[styles.inputContainer, errors.fullName && styles.inputError]}>
                    <Text style={styles.inputIcon}>👤</Text>
                    <Input
                      placeholder="Tu nombre y apellidos"
                      value={formData.fullName || ''}
                      onChangeText={(v) => handleChange('fullName', v)}
                      autoCapitalize="words"
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.fullName && <Text style={styles.errorText}>{errors.fullName}</Text>}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Nombre de usuario</Text>
                  <View style={[styles.inputContainer, errors.name && styles.inputError]}>
                    <Text style={styles.inputIcon}>@</Text>
                    <Input
                      placeholder="usuario123"
                      value={formData.name}
                      onChangeText={(v) => handleChange('name', v)}
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Correo electrónico</Text>
                  <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                    <Text style={styles.inputIcon}>✉️</Text>
                    <Input
                      placeholder="tu@email.com"
                      value={formData.email}
                      onChangeText={(v) => handleChange('email', v)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Contraseña</Text>
                  <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                    <Text style={styles.inputIcon}>🔒</Text>
                    <Input
                      placeholder="Mín. 8 caracteres con Aa1@"
                      value={formData.password}
                      onChangeText={(v) => handleChange('password', v)}
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Confirmar contraseña</Text>
                  <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                    <Text style={styles.inputIcon}>🔐</Text>
                    <Input
                      placeholder="Repite tu contraseña"
                      value={confirmPassword}
                      onChangeText={(v) => handleChange('confirmPassword', v)}
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
                </View>

                {/* Botón de registro */}
                <TouchableOpacity
                  onPress={handleRegister}
                  disabled={isLoading}
                  activeOpacity={0.85}
                  style={styles.registerButtonWrapper}
                >
                  <LinearGradient
                    colors={[colors.secondary, '#3B82F6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.registerButton}
                  >
                    <Text style={styles.registerButtonText}>
                      {isLoading ? 'Creando cuenta...' : 'Crear cuenta'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
                <TouchableOpacity onPress={() => router.push('/login')}>
                  <Text style={styles.loginLink}>Inicia sesión</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  posterBackground: {
    position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.35, overflow: 'hidden',
  },
  posterRow: { flexDirection: 'row', height: height * 0.32 },
  posterImage: { width: 90, height: height * 0.3, marginHorizontal: 4, borderRadius: 10, opacity: 0.6 },
  glowCircleCyan: {
    position: 'absolute', top: height * 0.1, right: -50, width: 150, height: 150,
    borderRadius: 75, backgroundColor: 'rgba(6, 182, 212, 0.2)',
  },
  glowCirclePurple: {
    position: 'absolute', top: height * 0.25, left: -60, width: 180, height: 180,
    borderRadius: 90, backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  glowCircleRed: {
    position: 'absolute', bottom: height * 0.15, right: width * 0.2, width: 100, height: 100,
    borderRadius: 50, backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  backButton: { marginBottom: spacing.md, alignSelf: 'flex-start', borderRadius: 20, overflow: 'hidden' },
  backButtonGradient: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: spacing.md, position: 'relative' },
  logoGlow: { position: 'absolute', width: 100, height: 100, borderRadius: 50, opacity: 0.8 },
  logo: {
    width: 70, height: 70, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 22,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  logoShape: { flexDirection: 'row', alignItems: 'flex-end', height: 38, gap: 5 },
  logoBar: { width: 12, borderRadius: 6 },
  title: { fontSize: 32, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.lg },
  form: { width: '100%', gap: spacing.sm },
  inputWrapper: { width: '100%' },
  inputLabel: {
    fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs,
    marginLeft: spacing.xs, fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: spacing.md, height: 52,
  },
  inputError: { borderColor: colors.error },
  inputIcon: { fontSize: 16, marginRight: spacing.sm },
  input: {
    flex: 1, fontSize: fontSize.md, color: colors.textPrimary,
    backgroundColor: 'transparent', borderWidth: 0, paddingVertical: 0, paddingHorizontal: 0,
  },
  errorText: { fontSize: fontSize.xs, color: colors.error, marginTop: spacing.xs, marginLeft: spacing.xs },
  registerButtonWrapper: {
    width: '100%', marginTop: spacing.md, borderRadius: borderRadius.lg, overflow: 'hidden', ...shadows.glowCyan,
  },
  registerButton: { paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  registerButtonText: { fontSize: fontSize.md, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl },
  footerText: { color: colors.textSecondary, fontSize: fontSize.md },
  loginLink: { color: colors.secondary, fontSize: fontSize.md, fontWeight: '600' },
});
