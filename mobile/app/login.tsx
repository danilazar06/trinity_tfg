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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadows } from '../src/utils/theme';
import { LoginCredentials } from '../src/types';

const { width, height } = Dimensions.get('window');

const MOVIE_POSTERS = [
  'https://image.tmdb.org/t/p/w300/qNBAXBIQlnOThrVvA6mA2B5ber9.jpg',
  'https://image.tmdb.org/t/p/w300/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
  'https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  'https://image.tmdb.org/t/p/w300/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg',
  'https://image.tmdb.org/t/p/w300/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  'https://image.tmdb.org/t/p/w300/velWPhVMQeQKcxggNEU8YmIo52R.jpg',
];

export default function LoginScreen() {
  const { login, isLoading, error, clearError, loginWithGoogle, loginWithApple, isAuthenticated, getGoogleSignInAvailability } = useAuth();
  const [credentials, setCredentials] = useState<LoginCredentials>({ email: '', password: '' });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [googleMessage, setGoogleMessage] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const posterScrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
    ]).start();
    Animated.loop(Animated.timing(posterScrollAnim, { toValue: 1, duration: 30000, useNativeDriver: true })).start();
    
    // Verificar disponibilidad de Google Sign-In
    checkGoogleAvailability();
  }, []);

  const checkGoogleAvailability = async () => {
    try {
      const availability = await getGoogleSignInAvailability();
      setGoogleAvailable(availability.available);
      setGoogleMessage(availability.message);
    } catch (error) {
      setGoogleAvailable(false);
      setGoogleMessage('Error al verificar Google Sign-In');
    }
  };

  useEffect(() => { if (isAuthenticated) router.replace('/(tabs)'); }, [isAuthenticated]);
  useEffect(() => { if (error) Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]); }, [error]);

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};
    if (!credentials.email) newErrors.email = 'El email es requerido';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email)) newErrors.email = 'Email invalido';
    if (!credentials.password) newErrors.password = 'La contrasena es requerida';
    else if (credentials.password.length < 6) newErrors.password = 'Minimo 6 caracteres';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => { if (validate()) await login(credentials); };

  const translateX = posterScrollAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -width] });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.posterBackground}>
        <Animated.View style={[styles.posterRow, { transform: [{ translateX }] }]}>
          {[...MOVIE_POSTERS, ...MOVIE_POSTERS].map((poster, index) => (
            <Image key={index} source={{ uri: poster }} style={styles.posterImage} blurRadius={1} />
          ))}
        </Animated.View>
      </View>
      <LinearGradient colors={['rgba(10,10,15,0.3)', 'rgba(10,10,15,0.85)', 'rgba(10,10,15,0.98)']} locations={[0, 0.4, 0.7]} style={StyleSheet.absoluteFill} />
      <View style={styles.glowCirclePurple} />
      <View style={styles.glowCircleCyan} />
      <View style={styles.glowCircleRed} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
                <LinearGradient colors={['rgba(139,92,246,0.4)', 'rgba(6,182,212,0.2)']} style={styles.logoGlow} />
                <View style={styles.logo}>
                  <View style={styles.logoShape}>
                    <LinearGradient colors={[colors.secondary, colors.secondaryLight]} style={[styles.logoBar, { height: 28 }]} />
                    <LinearGradient colors={[colors.primary, colors.primaryLight]} style={[styles.logoBar, { height: 38 }]} />
                    <LinearGradient colors={[colors.accent, colors.accentLight]} style={[styles.logoBar, { height: 22 }]} />
                  </View>
                </View>
              </Animated.View>
              <Text style={styles.welcomeText}>Bienvenido a</Text>
              <Text style={styles.brandName}>Trinity</Text>
              <Text style={styles.subtitle}> Encuentra peliculas juntos </Text>
              <View style={styles.formContainer}>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Correo electronico</Text>
                  <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                    <TextInput
                      placeholder="tu@email.com"
                      value={credentials.email}
                      onChangeText={(v) => setCredentials(prev => ({ ...prev, email: v }))}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                    />
                  </View>
                  {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
                </View>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Contrasena</Text>
                  <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                    <TextInput
                      placeholder="********"
                      value={credentials.password}
                      onChangeText={(v) => setCredentials(prev => ({ ...prev, password: v }))}
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                    />
                  </View>
                  {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                </View>
                <TouchableOpacity onPress={handleLogin} disabled={isLoading} activeOpacity={0.85} style={styles.loginButtonWrapper}>
                  <LinearGradient colors={[colors.primary, '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginButton}>
                    <Text style={styles.loginButtonText}>{isLoading ? 'Entrando...' : 'Iniciar sesion'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
              <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>o continua con</Text><View style={styles.dividerLine} /></View>
              <View style={styles.socialButtons}>
                {googleAvailable ? (
                  <TouchableOpacity style={styles.socialButton} onPress={loginWithGoogle} activeOpacity={0.8}>
                    <Text style={styles.socialIcon}>G</Text>
                    <Text style={styles.socialButtonText}>Google</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.socialButton, styles.socialButtonDisabled]}>
                    <Text style={[styles.socialIcon, styles.socialIconDisabled]}>G</Text>
                    <Text style={[styles.socialButtonText, styles.socialButtonTextDisabled]}>Google</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.socialButton} onPress={loginWithApple} activeOpacity={0.8}>
                  <Text style={styles.socialIcon}>A</Text>
                  <Text style={styles.socialButtonText}>Apple</Text>
                </TouchableOpacity>
              </View>
              {!googleAvailable && (
                <View style={styles.googleMessageContainer}>
                  <Text style={styles.googleMessageText}>ℹ️ {googleMessage}</Text>
                </View>
              )}
              <View style={styles.footer}><Text style={styles.footerText}>No tienes cuenta? </Text><TouchableOpacity onPress={() => router.push('/register')}><Text style={styles.registerLink}>Registrate aqui</Text></TouchableOpacity></View>
              <TouchableOpacity onPress={() => router.push('/test-connection')} style={styles.testButton}>
                <Text style={styles.testButtonText}>🔍 Test de Conexión</Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  posterBackground: { position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.45, overflow: 'hidden' },
  posterRow: { flexDirection: 'row', height: height * 0.22 },
  posterImage: { width: 100, height: height * 0.20, marginHorizontal: 4, borderRadius: 8, opacity: 0.7 },
  glowCirclePurple: { position: 'absolute', top: height * 0.15, left: -80, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(139,92,246,0.25)' },
  glowCircleCyan: { position: 'absolute', top: height * 0.3, right: -60, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(6,182,212,0.2)' },
  glowCircleRed: { position: 'absolute', bottom: height * 0.15, left: width * 0.3, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(239,68,68,0.15)' },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: height * 0.08, paddingBottom: spacing.xl, justifyContent: 'center' },
  content: { alignItems: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: spacing.md, position: 'relative' },
  logoGlow: { position: 'absolute', width: 120, height: 120, borderRadius: 60, opacity: 0.8 },
  logo: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  logoShape: { flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 5 },
  logoBar: { width: 12, borderRadius: 6 },
  welcomeText: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 2, fontWeight: '500' },
  brandName: { fontSize: 38, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs, letterSpacing: -1 },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.lg },
  formContainer: { width: '100%', gap: spacing.md },
  inputWrapper: { width: '100%' },
  inputLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs, marginLeft: spacing.xs, fontWeight: '500' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: borderRadius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', paddingHorizontal: spacing.md, height: 52 },
  inputError: { borderColor: colors.error },
  input: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary, height: '100%' },
  errorText: { fontSize: fontSize.xs, color: colors.error, marginTop: spacing.xs, marginLeft: spacing.xs },
  loginButtonWrapper: { width: '100%', marginTop: spacing.sm, borderRadius: borderRadius.lg, overflow: 'hidden' },
  loginButton: { paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  loginButtonText: { fontSize: fontSize.md, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, width: '100%' },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: colors.textMuted, fontSize: fontSize.sm, paddingHorizontal: spacing.md },
  socialButtons: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  socialButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: borderRadius.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', gap: spacing.sm },
  socialButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.05)' },
  socialIcon: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
  socialIconDisabled: { color: colors.textMuted },
  socialButtonText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  socialButtonTextDisabled: { color: colors.textMuted },
  googleMessageContainer: { marginTop: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  googleMessageText: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl },
  footerText: { color: colors.textSecondary, fontSize: fontSize.sm },
  registerLink: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  testButton: { marginTop: spacing.md, padding: spacing.sm, alignItems: 'center' },
  testButtonText: { color: colors.textMuted, fontSize: fontSize.xs },
});
