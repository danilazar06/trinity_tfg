import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Clipboard,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RoomDetails, roomService } from '../../../src/services/roomService';
import { borderRadius, colors, fontSize, spacing } from '../../../src/utils/theme';

// Genre mapping for display
const GENRES = [
  { id: '28', name: 'Acción', icon: '💥' },
  { id: '12', name: 'Aventura', icon: '🗺️' },
  { id: '878', name: 'Ciencia Ficción', icon: '🚀' },
  { id: '35', name: 'Comedia', icon: '😂' },
  { id: '18', name: 'Drama', icon: '🎭' },
  { id: '27', name: 'Terror', icon: '👻' },
  { id: '53', name: 'Thriller', icon: '😱' },
  { id: '10749', name: 'Romance', icon: '💕' },
  { id: '14', name: 'Fantasía', icon: '🧙' },
  { id: '99', name: 'Documental', icon: '📹' },
  { id: '16', name: 'Animación', icon: '🎨' },
  { id: '80', name: 'Crimen', icon: '🔍' },
];

export default function RoomDetailsScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [isHost, setIsHost] = useState(false);

  // Load room data
  useEffect(() => {
    if (!roomId) return;
    
    const loadRoomData = async () => {
      try {
        setLoading(true);
        const details = await roomService.getRoomDetails(roomId);
        setRoomDetails(details);
        
        // Check if current user is host based on userRole from service
        setIsHost(details.userRole === 'creator' || details.userRole === 'host');
        
      } catch (error) {
        console.error('Error loading room details:', error);
        Alert.alert('Error', 'No se pudo cargar los detalles de la sala');
      } finally {
        setLoading(false);
      }
    };

    loadRoomData();
  }, [roomId]);

  const handleStartVoting = () => {
    // Navigate to voting screen
    router.push(`/room/${roomId}`);
  };

  const handleCopyInviteCode = async () => {
    try {
      const inviteCode = roomDetails?.room.inviteCode || 'ABC123';
      Clipboard.setString(inviteCode);
      Alert.alert('¡Copiado!', 'Código de invitación copiado al portapapeles');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'No se pudo copiar el código');
    }
  };

  const handleCopyShareLink = async () => {
    try {
      const inviteCode = roomDetails?.room.inviteCode || 'ABC123';
      const shareLink = `http://localhost:3000/room/${inviteCode}`;
      Clipboard.setString(shareLink);
      Alert.alert('¡Copiado!', 'Enlace de invitación copiado al portapapeles');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'No se pudo copiar el enlace');
    }
  };

  const handleLeaveRoom = () => {
    Alert.alert(
      'Salir de la sala',
      '¿Estás seguro de que quieres salir de esta sala?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Salir', 
          style: 'destructive',
          onPress: () => router.back()
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando detalles...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!roomDetails) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={colors.error} />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>No se pudieron cargar los detalles de la sala</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalles de la Sala</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Room Info */}
        <View style={styles.section}>
          <Text style={styles.roomName}>{roomDetails.room.name}</Text>
          {roomDetails.room.description && (
            <Text style={styles.roomDescription}>{roomDetails.room.description}</Text>
          )}
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={styles.statusText}>Esperando participantes</Text>
          </View>
        </View>

        {/* Invite Code Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Código de Invitación</Text>
          <View style={styles.inviteCodeContainer}>
            <Text style={styles.inviteCode}>{roomDetails.room.inviteCode || 'ABC123'}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyInviteCode}>
              <Ionicons name="copy" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={handleCopyShareLink}>
            <Text style={styles.shareText}>
              Comparte: http://localhost:3000/room/{roomDetails.room.inviteCode || 'ABC123'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Members Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👥 Miembros ({roomDetails.room.memberCount || 1})</Text>
          
          {/* Show actual members if available */}
          {roomDetails.members && roomDetails.members.length > 0 ? (
            roomDetails.members.map((member, index) => (
              <View key={member.userId} style={styles.memberItem}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {member.userId.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.userId === roomDetails.room.hostId ? 'Tú (Host)' : member.userId}
                  </Text>
                  <Text style={styles.memberRole}>
                    {member.role === 'creator' ? 'Host' : 'Miembro'}
                  </Text>
                </View>
                <View style={styles.memberStatus}>
                  <View style={[
                    styles.statusDot, 
                    { backgroundColor: member.status === 'active' ? colors.success : colors.textMuted }
                  ]} />
                </View>
              </View>
            ))
          ) : (
            // Fallback display for when member data is not available
            <View style={styles.memberItem}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>T</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>test@trinity.app</Text>
                <Text style={styles.memberRole}>Host</Text>
              </View>
              <View style={styles.memberStatus}>
                <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              </View>
            </View>
          )}
          
          {roomDetails.room.memberCount === 1 && (
            <Text style={styles.emptyMembersText}>Solo tú por ahora</Text>
          )}
        </View>

        {/* Configuration Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎭 Configuración</Text>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Géneros:</Text>
            <Text style={styles.configValue}>
              {roomDetails.room.genrePreferences && roomDetails.room.genrePreferences.length > 0
                ? roomDetails.room.genrePreferences
                    .map(genreId => GENRES.find(g => g.id === genreId)?.name || genreId)
                    .join(', ')
                : 'Todos los géneros'}
            </Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Películas:</Text>
            <Text style={styles.configValue}>
              {roomDetails.room.masterList?.length > 0 
                ? `${roomDetails.room.masterList.length} películas` 
                : '~50 películas'}
            </Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Votación:</Text>
            <Text style={styles.configValue}>Sistema Like/Dislike</Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Tipo:</Text>
            <Text style={styles.configValue}>
              {roomDetails.room.isPrivate ? 'Sala privada' : 'Sala pública'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {isHost ? (
          <TouchableOpacity style={styles.startButton} onPress={handleStartVoting}>
            <Ionicons name="play" size={20} color="#FFF" style={styles.buttonIcon} />
            <Text style={styles.startButtonText}>🚀 Empezar Votación</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>Esperando al host...</Text>
          </View>
        )}
        
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveRoom}>
          <Text style={styles.leaveButtonText}>Salir de la Sala</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  headerRight: {
    width: 40, // Same width as back button for centering
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  roomName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  roomDescription: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  inviteCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  inviteCode: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: spacing.sm,
  },
  shareText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontFamily: 'monospace',
    textDecorationLine: 'underline',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  memberAvatarText: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: 'bold',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberRole: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  memberStatus: {
    padding: spacing.xs,
  },
  emptyMembersText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  configLabel: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  configValue: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  actionsContainer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  startButtonText: {
    color: '#FFF',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  waitingContainer: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  waitingText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontStyle: 'italic',
  },
  leaveButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});