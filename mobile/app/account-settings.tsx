import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { colors, spacing, fontSize, borderRadius } from '../src/utils/theme';

export default function AccountSettingsScreen() {
  const { user, linkGoogleAccount, unlinkGoogleAccount, isLoading, error, clearError } = useAuth();
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [authProviders, setAuthProviders] = useState<string[]>(['email']);

  useEffect(() => {
    // Simular datos del usuario (en producción vendría del backend)
    if (user) {
      setIsGoogleLinked((user as any).isGoogleLinked || false);
      setAuthProviders((user as any).authProviders || ['email']);
    }
  }, [user]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error]);

  const handleLinkGoogle = async () => {
    Alert.alert(
      'Vincular Google',
      '¿Quieres vincular tu cuenta de Google para iniciar sesión más fácilmente?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vincular',
          onPress: async () => {
            try {
              await linkGoogleAccount();
              setIsGoogleLinked(true);
              setAuthProviders(prev => [...prev, 'google']);
              Alert.alert('Éxito', 'Cuenta de Google vinculada correctamente');
            } catch (error) {
              // Error ya manejado por el contexto
            }
          },
        },
      ]
    );
  };

  const handleUnlinkGoogle = async () => {
    if (authProviders.length <= 1) {
      Alert.alert(
        'No se puede desvincular',
        'No puedes desvincular Google porque es tu único método de autenticación. Configura una contraseña primero.'
      );
      return;
    }

    Alert.alert(
      'Desvincular Google',
      '¿Estás seguro de que quieres desvincular tu cuenta de Google? Podrás volver a vincularla más tarde.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: async () => {
            try {
              await unlinkGoogleAccount();
              setIsGoogleLinked(false);
              setAuthProviders(prev => prev.filter(provider => provider !== 'google'));
              Alert.alert('Éxito', 'Cuenta de Google desvinculada correctamente');
            } catch (error) {
              // Error ya manejado por el contexto
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuración de Cuenta</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Métodos de Autenticación */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Métodos de Autenticación</Text>
          <Text style={styles.sectionDescription}>
            Gestiona cómo inicias sesión en Trinity
          </Text>

          {/* Email/Contraseña */}
          <View style={styles.authMethod}>
            <View style={styles.authMethodInfo}>
              <View style={styles.authMethodIcon}>
                <Ionicons name="mail" size={20} color={colors.primary} />
              </View>
              <View style={styles.authMethodDetails}>
                <Text style={styles.authMethodTitle}>Email y Contraseña</Text>
                <Text style={styles.authMethodSubtitle}>
                  {user?.email}
                </Text>
              </View>
            </View>
            <View style={styles.authMethodStatus}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
          </View>

          {/* Google */}
          <View style={styles.authMethod}>
            <View style={styles.authMethodInfo}>
              <View style={styles.authMethodIcon}>
                <Ionicons name="logo-google" size={20} color="#DB4437" />
              </View>
              <View style={styles.authMethodDetails}>
                <Text style={styles.authMethodTitle}>Google</Text>
                <Text style={styles.authMethodSubtitle}>
                  {isGoogleLinked ? 'Vinculado' : 'No vinculado'}
                </Text>
              </View>
            </View>
            <View style={styles.authMethodAction}>
              {isGoogleLinked ? (
                <TouchableOpacity
                  onPress={handleUnlinkGoogle}
                  disabled={isLoading}
                  style={styles.unlinkButton}
                >
                  <Text style={styles.unlinkButtonText}>Desvincular</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleLinkGoogle}
                  disabled={isLoading}
                  style={styles.linkButton}
                >
                  <Text style={styles.linkButtonText}>Vincular</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Apple (placeholder) */}
          <View style={styles.authMethod}>
            <View style={styles.authMethodInfo}>
              <View style={styles.authMethodIcon}>
                <Ionicons name="logo-apple" size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.authMethodDetails}>
                <Text style={styles.authMethodTitle}>Apple</Text>
                <Text style={styles.authMethodSubtitle}>
                  Próximamente disponible
                </Text>
              </View>
            </View>
            <View style={styles.authMethodStatus}>
              <Ionicons name="time" size={20} color={colors.textMuted} />
            </View>
          </View>
        </View>

        {/* Información de Seguridad */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información de Seguridad</Text>
          
          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark" size={24} color={colors.success} style={styles.infoIcon} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Cuenta Segura</Text>
              <Text style={styles.infoDescription}>
                Tu cuenta está protegida con {authProviders.length} método{authProviders.length > 1 ? 's' : ''} de autenticación
              </Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={colors.primary} style={styles.infoIcon} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Recomendación</Text>
              <Text style={styles.infoDescription}>
                Mantén al menos dos métodos de autenticación para mayor seguridad
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  authMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  authMethodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  authMethodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  authMethodDetails: {
    flex: 1,
  },
  authMethodTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  authMethodSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  authMethodStatus: {
    marginLeft: spacing.md,
  },
  authMethodAction: {
    marginLeft: spacing.md,
  },
  linkButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  linkButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  unlinkButton: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  unlinkButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.error,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  infoIcon: {
    marginRight: spacing.md,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  infoDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});