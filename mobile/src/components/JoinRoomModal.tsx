import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { roomService, Room } from '../services/roomService';

interface JoinRoomModalProps {
  visible: boolean;
  onClose: () => void;
  onRoomJoined?: (room: Room) => void;
}

export default function JoinRoomModal({ visible, onClose, onRoomJoined }: JoinRoomModalProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setInviteCode('');
    setError(null);
    setIsJoining(false);
    onClose();
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      setError('Introduce un código de invitación');
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const room = await roomService.joinRoom(inviteCode.toUpperCase().trim());
      
      if (onRoomJoined) {
        onRoomJoined(room);
      }
      
      Alert.alert(
        '¡Te has unido!',
        `Ahora eres parte de "${room.name}"`,
        [{ text: 'OK', onPress: resetAndClose }]
      );
    } catch (err: any) {
      setError(err.message || 'Código de invitación inválido');
    } finally {
      setIsJoining(false);
    }
  };

  const formatCode = (text: string) => {
    // Solo permitir letras y números, convertir a mayúsculas
    const cleaned = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    // Limitar a 6 caracteres
    return cleaned.slice(0, 6);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView 
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="enter-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.title}>Unirse a una sala</Text>
            <Text style={styles.subtitle}>
              Introduce el código de invitación que te han compartido
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={resetAndClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.codeInput}
              value={inviteCode}
              onChangeText={(text) => {
                setInviteCode(formatCode(text));
                setError(null);
              }}
              placeholder="ABC123"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              keyboardType="default"
            />
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              El código tiene 6 caracteres y lo puedes encontrar en el enlace de invitación o en la pantalla de compartir de la sala.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.joinButton,
                (!inviteCode.trim() || isJoining) && styles.buttonDisabled,
              ]}
              onPress={handleJoin}
              disabled={!inviteCode.trim() || isJoining}
            >
              {isJoining ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="enter" size={20} color="#FFF" />
                  <Text style={styles.joinButtonText}>Unirse</Text>
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={resetAndClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: spacing.xs,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  codeInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: colors.border,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    alignItems: 'center',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    width: '100%',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  cancelText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
});
