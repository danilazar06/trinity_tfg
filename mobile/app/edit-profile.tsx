import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { authService } from '../src/services/authService';
import { Button, Input } from '../src/components';
import { colors, spacing, fontSize, borderRadius } from '../src/utils/theme';

export default function EditProfileScreen() {
  const { user, logout, updateUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [displayName, setDisplayName] = useState(user?.name || user?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || user?.avatarUrl || '');
  const [errors, setErrors] = useState<{ displayName?: string }>({});

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!displayName.trim()) {
      newErrors.displayName = 'El nombre es requerido';
    } else if (displayName.trim().length < 3) {
      newErrors.displayName = 'Mínimo 3 caracteres';
    } else if (displayName.trim().length > 50) {
      newErrors.displayName = 'Máximo 50 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePickImage = async () => {
    // TODO: Implementar selección de imagen con expo-image-picker
    // Por ahora, mostrar mensaje informativo
    Alert.alert(
      'Próximamente',
      'La función de cambiar foto de perfil estará disponible pronto.',
      [{ text: 'OK' }]
    );
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      // Actualizar el usuario localmente
      const updatedUser = {
        ...user!,
        name: displayName.trim(),
        displayName: displayName.trim(),
        avatar: avatarUrl || user?.avatar,
        avatarUrl: avatarUrl || user?.avatarUrl,
      };
      
      await updateUser(updatedUser);

      Alert.alert('Éxito', 'Perfil actualizado correctamente', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'No se pudo actualizar el perfil', [
        { text: 'OK' }
      ]);
    } finally {
      setIsLoading(false);
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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>Editar perfil</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
              <Image
                source={{ uri: avatarUrl || 'https://i.pravatar.cc/150?img=3' }}
                style={styles.avatar}
              />
              <View style={styles.editAvatarBadge}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickImage}>
              <Text style={styles.changePhotoText}>Cambiar foto</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Nombre"
              placeholder="Tu nombre"
              value={displayName}
              onChangeText={setDisplayName}
              error={errors.displayName}
              leftIcon={<Ionicons name="person-outline" size={20} color={colors.textMuted} />}
              autoCapitalize="words"
            />

            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Email</Text>
              <View style={styles.infoValue}>
                <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
                <Text style={styles.infoText}>{user?.email || 'No disponible'}</Text>
              </View>
              <Text style={styles.infoHint}>El email no se puede cambiar</Text>
            </View>
          </View>

          {/* Save Button */}
          <Button
            title="Guardar cambios"
            onPress={handleSave}
            loading={isLoading}
            disabled={isLoading}
            style={styles.saveButton}
          />

          {/* Danger Zone */}
          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Zona de peligro</Text>
            <TouchableOpacity 
              style={styles.dangerButton}
              onPress={() => {
                Alert.alert(
                  'Cerrar sesión',
                  '¿Estás seguro de que quieres cerrar sesión?',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { 
                      text: 'Cerrar sesión', 
                      style: 'destructive',
                      onPress: async () => {
                        await logout();
                        router.replace('/login');
                      }
                    }
                  ]
                );
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={styles.dangerButtonText}>Cerrar sesión</Text>
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
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  placeholder: {
    width: 32,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  changePhotoText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '600',
  },
  form: {
    marginBottom: spacing.xl,
  },
  infoField: {
    marginBottom: spacing.md,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  infoValue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    flex: 1,
  },
  infoHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  saveButton: {
    marginBottom: spacing.xl,
  },
  dangerZone: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  dangerTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: borderRadius.md,
  },
  dangerButtonText: {
    fontSize: fontSize.md,
    color: colors.error,
    fontWeight: '500',
  },
});
