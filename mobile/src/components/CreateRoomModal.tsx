import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Share,
  Linking,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { roomService, Room, ContentFilters } from '../services/roomService';

const { height } = Dimensions.get('window');

type Step = 'initial' | 'preferences' | 'participants' | 'share';

interface CreateRoomModalProps {
  visible: boolean;
  onClose: () => void;
  onGoToRooms: () => void;
  onRoomCreated?: (room: Room) => void;
}

const PLATFORMS = [
  { id: 'netflix', name: 'Netflix' },
  { id: 'prime', name: 'Prime Video' },
  { id: 'disney', name: 'Disney+' },
  { id: 'hbo', name: 'HBO Max' },
  { id: 'apple', name: 'Apple TV+' },
  { id: 'paramount', name: 'Paramount+' },
];

const GENRES = [
  { id: 28, name: 'Acción' },
  { id: 12, name: 'Aventura' },
  { id: 878, name: 'Ciencia Ficción' },
  { id: 35, name: 'Comedia' },
  { id: 18, name: 'Drama' },
  { id: 27, name: 'Terror' },
  { id: 53, name: 'Thriller' },
  { id: 10749, name: 'Romance' },
  { id: 14, name: 'Fantasía' },
  { id: 99, name: 'Documental' },
  { id: 16, name: 'Animación' },
  { id: 80, name: 'Crimen' },
  { id: 9648, name: 'Misterio' },
  { id: 10402, name: 'Musical' },
];

const EXAMPLE_TOPICS = [
  'Afrontar el bullying escolar',
  'Superación y motivación',
  'Diversidad e inclusión',
  'Salud mental y bienestar',
];

export default function CreateRoomModal({ visible, onClose, onGoToRooms, onRoomCreated }: CreateRoomModalProps) {
  const [step, setStep] = useState<Step>('initial');
  const [aiPrompt, setAiPrompt] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [participants, setParticipants] = useState(2);
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const resetAndClose = () => {
    setStep('initial');
    setAiPrompt('');
    setSelectedPlatforms([]);
    setSelectedGenres([]);
    setParticipants(2);
    setRoomCode('');
    setRoomName('');
    setRoomId('');
    setIsCreating(false);
    onClose();
  };

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleGenre = (id: number) => {
    setSelectedGenres(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const clearFilters = () => {
    setSelectedPlatforms([]);
    setSelectedGenres([]);
    setAiPrompt('');
  };

  const createRoom = async () => {
    setIsCreating(true);
    
    // Generar nombre basado en filtros o AI prompt
    const name = aiPrompt 
      ? aiPrompt.substring(0, 30) 
      : selectedGenres.length > 0 
        ? `Búsqueda: ${GENRES.find(g => g.id === selectedGenres[0])?.name}`
        : 'Nueva sala';

    const filters: ContentFilters = {
      genres: selectedGenres.length > 0 ? selectedGenres : undefined,
      platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
      aiPrompt: aiPrompt || undefined,
      contentType: 'all',
    };

    try {
      const room = await roomService.createRoom({
        name,
        filters,
        participantCount: participants,
      });

      setRoomCode(room.inviteCode);
      setRoomName(room.name);
      setRoomId(room.id);
      setStep('share');
      
      if (onRoomCreated) {
        onRoomCreated(room);
      }
    } catch (error: any) {
      console.error('Error creating room:', error);
      Alert.alert(
        'Error', 
        error.message || 'No se pudo crear la sala. Inténtalo de nuevo.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const shareViaWhatsApp = () => {
    const url = `https://trinity.app/room/${roomCode}`;
    const message = `¡Únete a mi sala en Trinity! ${url}`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
  };

  const copyLink = async () => {
    const url = `https://trinity.app/room/${roomCode}`;
    await Share.share({ message: url });
  };

  const renderInitialStep = () => (
    <View style={styles.initialContainer}>
      <View style={styles.logoCircle}>
        <View style={styles.logoInner}>
          <View style={[styles.logoBar, { height: 14, backgroundColor: '#00D4FF' }]} />
          <View style={[styles.logoBar, { height: 18, backgroundColor: '#6366F1' }]} />
          <View style={[styles.logoBar, { height: 12, backgroundColor: '#EC4899' }]} />
        </View>
      </View>
      
      <Text style={styles.initialTitle}>¿Qué deseas hacer?</Text>
      <Text style={styles.initialSubtitle}>Crea una nueva sala o revisa tus salas activas</Text>

      <TouchableOpacity 
        style={styles.primaryOption} 
        onPress={() => setStep('preferences')}
        activeOpacity={0.8}
      >
        <View style={styles.optionIcon}>
          <Ionicons name="add" size={24} color="#FFF" />
        </View>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>Crear nueva sala</Text>
          <Text style={styles.optionSubtitle}>Configura filtros y empieza a hacer swipe</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#FFF" />
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryOption} 
        onPress={() => { resetAndClose(); onGoToRooms(); }}
        activeOpacity={0.8}
      >
        <View style={[styles.optionIcon, styles.secondaryIcon]}>
          <Ionicons name="list" size={20} color={colors.primary} />
        </View>
        <View style={styles.optionText}>
          <Text style={[styles.optionTitle, styles.secondaryTitle]}>Ir a mis salas</Text>
          <Text style={styles.optionSubtitle}>Revisa tus salas activas</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity onPress={resetAndClose}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderPreferencesStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setStep('initial')}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.stepTitleContainer}>
          <View style={styles.stepIconCircle}>
            <Ionicons name="funnel" size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.stepTitle}>Nueva Sala</Text>
            <Text style={styles.stepSubtitle}>Configura tus preferencias</Text>
          </View>
        </View>
        <TouchableOpacity onPress={resetAndClose}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        {/* Asistente IA */}
        <View style={styles.aiSection}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={styles.aiTitle}>Asistente IA</Text>
          </View>
          <Text style={styles.aiDescription}>
            Describe qué tema te interesa o qué situación quieres explorar. Puedo ayudarte a encontrar contenido educativo, motivacional o sobre temas sociales importantes.
          </Text>
          <View style={styles.aiInputContainer}>
            <TextInput
              style={styles.aiInput}
              placeholder="Ej: Quiero ver algo sobre cómo afrontar el bullying en la escuela..."
              placeholderTextColor={colors.textMuted}
              value={aiPrompt}
              onChangeText={setAiPrompt}
              multiline
            />
            <TouchableOpacity style={styles.aiSendButton}>
              <Ionicons name="send" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.examplesLabel}>Ejemplos de temas:</Text>
          <View style={styles.exampleChips}>
            {EXAMPLE_TOPICS.map((topic, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.exampleChip}
                onPress={() => setAiPrompt(topic)}
              >
                <Text style={styles.exampleChipText}>{topic}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Plataformas */}
        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>Plataformas</Text>
          <View style={styles.filterGrid}>
            {PLATFORMS.map((platform) => (
              <TouchableOpacity
                key={platform.id}
                style={[
                  styles.filterChip,
                  selectedPlatforms.includes(platform.id) && styles.filterChipSelected,
                ]}
                onPress={() => togglePlatform(platform.id)}
              >
                <Text style={[
                  styles.filterChipText,
                  selectedPlatforms.includes(platform.id) && styles.filterChipTextSelected,
                ]}>
                  {platform.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Géneros */}
        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>Géneros</Text>
          <View style={styles.filterGrid}>
            {GENRES.map((genre) => (
              <TouchableOpacity
                key={genre.id}
                style={[
                  styles.filterChip,
                  selectedGenres.includes(genre.id) && styles.filterChipSelected,
                ]}
                onPress={() => toggleGenre(genre.id)}
              >
                <Text style={[
                  styles.filterChipText,
                  selectedGenres.includes(genre.id) && styles.filterChipTextSelected,
                ]}>
                  {genre.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.stepFooter}>
        <TouchableOpacity 
          style={styles.continueButton} 
          onPress={() => setStep('participants')}
        >
          <Text style={styles.continueButtonText}>Continuar</Text>
          <Ionicons name="chevron-forward" size={20} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={clearFilters}>
          <Text style={styles.clearFiltersText}>Limpiar filtros</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderParticipantsStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={() => setStep('preferences')}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.stepTitleContainer}>
          <View style={styles.stepIconCircle}>
            <Ionicons name="people" size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.stepTitle}>Participantes</Text>
            <Text style={styles.stepSubtitle}>¿Cuántos sois?</Text>
          </View>
        </View>
        <TouchableOpacity onPress={resetAndClose}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.participantsContent}>
        <Text style={styles.participantsDescription}>
          Selecciona cuántas personas deben estar de acuerdo para hacer match
        </Text>

        <View style={styles.participantsGrid}>
          {[2, 3, 4, 5, 6].map((num) => (
            <TouchableOpacity
              key={num}
              style={[
                styles.participantCard,
                participants === num && styles.participantCardSelected,
              ]}
              onPress={() => setParticipants(num)}
            >
              <Ionicons 
                name="people-outline" 
                size={28} 
                color={participants === num ? colors.primary : colors.textMuted} 
              />
              <Text style={[
                styles.participantNumber,
                participants === num && styles.participantNumberSelected,
              ]}>
                {num}
              </Text>
              <Text style={styles.participantLabel}>personas</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.participantHint}>
          <Text style={styles.participantHintText}>
            {participants === 2 
              ? 'Perfecto para una cita o con un amigo'
              : participants <= 4
                ? 'Ideal para un grupo pequeño'
                : 'Para reuniones familiares o grupos grandes'}
          </Text>
        </View>
      </View>

      <View style={styles.stepFooter}>
        <TouchableOpacity 
          style={[styles.continueButton, isCreating && styles.buttonDisabled]} 
          onPress={createRoom}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.continueButtonText}>Crear sala</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderShareStep = () => (
    <View style={styles.shareContainer}>
      <View style={styles.shareHeader}>
        <Ionicons name="share-social" size={20} color={colors.textPrimary} />
        <Text style={styles.shareTitle}>Compartir sala</Text>
        <TouchableOpacity onPress={resetAndClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.roomInfoCard}>
        <Text style={styles.roomName}>{roomName}</Text>
        <Text style={styles.roomWaiting}>
          Esperando {participants} personas para hacer match
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.whatsappButton} 
        onPress={shareViaWhatsApp}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-whatsapp" size={22} color="#FFF" />
        <Text style={styles.whatsappButtonText}>Compartir por WhatsApp</Text>
      </TouchableOpacity>

      <Text style={styles.orText}>O copia el enlace para compartirlo</Text>

      <View style={styles.linkContainer}>
        <Text style={styles.linkText} numberOfLines={1}>
          https://trinity.app/room/{roomCode}
        </Text>
        <TouchableOpacity style={styles.copyButton} onPress={copyLink}>
          <Ionicons name="copy-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.waitingText}>
        Espera a que todos estén listos antes de empezar
      </Text>

      {/* Botón para empezar */}
      <TouchableOpacity 
        style={styles.startButton} 
        onPress={resetAndClose}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>Empezar a hacer swipe</Text>
        <Ionicons name="play" size={20} color="#FFF" />
      </TouchableOpacity>

      {/* Botón cancelar */}
      <TouchableOpacity onPress={resetAndClose}>
        <Text style={styles.cancelShareText}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={resetAndClose}
    >
      <View style={styles.overlay}>
        <View style={[
          styles.modalContainer,
          step === 'initial' && styles.modalInitial,
        ]}>
          {step === 'initial' && renderInitialStep()}
          {step === 'preferences' && renderPreferencesStep()}
          {step === 'participants' && renderParticipantsStep()}
          {step === 'share' && renderShareStep()}
        </View>
      </View>
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
    maxHeight: height * 0.9,
  },
  modalInitial: {
    paddingBottom: spacing.xl,
  },
  // Initial Step
  initialContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  logoBar: {
    width: 6,
    marginHorizontal: 1,
    borderRadius: 2,
  },
  initialTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  initialSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  primaryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.md,
  },
  secondaryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.xl,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  secondaryIcon: {
    backgroundColor: colors.primary + '20',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  secondaryTitle: {
    color: colors.textPrimary,
  },
  optionSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  cancelText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  // Step Container
  stepContainer: {
    height: height * 0.85,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: spacing.md,
  },
  stepIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  stepTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  stepSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  stepContent: {
    flex: 1,
    padding: spacing.lg,
  },
  stepFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  continueButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
    marginRight: spacing.xs,
  },
  clearFiltersText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  // AI Section
  aiSection: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  aiTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  aiDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  aiInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  aiInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    maxHeight: 80,
  },
  aiSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  examplesLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  exampleChips: {
    gap: spacing.xs,
  },
  exampleChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  exampleChipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  // Filter Section
  filterSection: {
    marginBottom: spacing.xl,
  },
  filterTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterChip: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipSelected: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  filterChipTextSelected: {
    color: colors.primary,
    fontWeight: '500',
  },
  // Participants
  participantsContent: {
    flex: 1,
    padding: spacing.lg,
  },
  participantsDescription: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  participantsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
  },
  participantCard: {
    width: 90,
    height: 100,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  participantCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  participantNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  participantNumberSelected: {
    color: colors.primary,
  },
  participantLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  participantHint: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  participantHintText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  // Share
  shareContainer: {
    padding: spacing.xl,
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  shareTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
    flex: 1,
    marginLeft: spacing.sm,
  },
  roomInfoCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  roomName: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  roomWaiting: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  whatsappButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: spacing.sm,
  },
  orText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  linkText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  copyButton: {
    padding: spacing.sm,
  },
  waitingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  closeButton: {
    padding: spacing.xs,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  startButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
    marginRight: spacing.sm,
  },
  cancelShareText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
