import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { roomService, RoomDetails } from '../../src/services/roomService';
import { voteService, VoteResponse } from '../../src/services/voteService';
import { matchService, Match } from '../../src/services/matchService';
import { mediaService, MediaItem, MediaItemDetails } from '../../src/services/mediaService';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.25;

export default function RoomSwipeScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [currentMedia, setCurrentMedia] = useState<MediaItemDetails | null>(null);
  const [nextMedia, setNextMedia] = useState<MediaItemDetails | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [isVoting, setIsVoting] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const [matchedMedia, setMatchedMedia] = useState<Match | null>(null);
  
  // Animaciones
  const position = useRef(new Animated.ValueXY()).current;
  const rotate = position.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: ['-15deg', '0deg', '15deg'],
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [0, width / 4],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const dislikeOpacity = position.x.interpolate({
    inputRange: [-width / 4, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          swipeRight();
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeLeft();
        } else {
          resetPosition();
        }
      },
    })
  ).current;

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  const swipeRight = async () => {
    Animated.timing(position, {
      toValue: { x: width + 100, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => handleVote('like'));
  };

  const swipeLeft = async () => {
    Animated.timing(position, {
      toValue: { x: -width - 100, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => handleVote('dislike'));
  };

  const loadRoomData = async () => {
    if (!roomId) return;
    
    try {
      setLoading(true);
      
      // Cargar detalles de la sala
      const details = await roomService.getRoomDetails(roomId);
      setRoomDetails(details);
      
      // Iniciar sesión de swipe
      const session = await voteService.startSwipeSession(roomId);
      setProgress({
        current: session.currentIndex,
        total: session.totalItems,
        percentage: Math.round((session.currentIndex / session.totalItems) * 100),
      });
      
      // Cargar contenido actual
      await loadCurrentMedia();
    } catch (error) {
      console.error('Error loading room:', error);
      Alert.alert('Error', 'No se pudo cargar la sala');
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentMedia = async () => {
    if (!roomId) return;
    
    try {
      const queueStatus = await voteService.getQueueStatus(roomId);
      
      if (queueStatus.isCompleted) {
        setCurrentMedia(null);
        return;
      }
      
      if (queueStatus.currentMediaId) {
        // Obtener detalles del media desde TMDB
        const mediaDetails = await mediaService.getMovieDetails(
          parseInt(queueStatus.currentMediaId)
        );
        setCurrentMedia(mediaDetails);
      }
    } catch (error) {
      console.error('Error loading current media:', error);
    }
  };

  const handleVote = async (voteType: 'like' | 'dislike') => {
    if (!roomId || !currentMedia || isVoting) return;
    
    setIsVoting(true);
    
    try {
      const result = await voteService.registerVote(roomId, {
        mediaId: currentMedia.tmdbId.toString(),
        voteType,
      });
      
      // Actualizar progreso
      setProgress({
        current: result.currentProgress.currentIndex,
        total: result.currentProgress.totalItems,
        percentage: result.currentProgress.progressPercentage,
      });
      
      // Verificar si hay match
      if (voteType === 'like') {
        const matchResult = await matchService.checkPendingMatches(
          roomId,
          currentMedia.tmdbId.toString()
        );
        
        if (matchResult.hasNewMatch && matchResult.match) {
          setMatchedMedia({
            id: matchResult.match.id,
            roomId,
            mediaId: currentMedia.tmdbId.toString(),
            mediaTitle: currentMedia.title,
            mediaPosterPath: currentMedia.posterPath || '',
            participantCount: matchResult.match.participantCount,
            createdAt: matchResult.match.createdAt,
            consensusType: 'unanimous_like',
          });
          setShowMatch(true);
        }
      }
      
      // Cargar siguiente contenido
      if (result.queueCompleted) {
        setCurrentMedia(null);
      } else if (result.nextMediaId) {
        const nextMediaDetails = await mediaService.getMovieDetails(
          parseInt(result.nextMediaId)
        );
        setCurrentMedia(nextMediaDetails);
      }
      
      // Reset posición
      position.setValue({ x: 0, y: 0 });
    } catch (error) {
      console.error('Error voting:', error);
      Alert.alert('Error', 'No se pudo registrar el voto');
    } finally {
      setIsVoting(false);
    }
  };

  useEffect(() => {
    loadRoomData();
  }, [roomId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando sala...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.roomName} numberOfLines={1}>
            {roomDetails?.room.name || 'Sala'}
          </Text>
          <View style={styles.membersRow}>
            <Ionicons name="people" size={14} color={colors.textMuted} />
            <Text style={styles.membersText}>
              {roomDetails?.members.length || 0} participantes
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.menuButton}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress.percentage}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {progress.current}/{progress.total} • {progress.percentage}%
        </Text>
      </View>

      {/* Card Area */}
      <View style={styles.cardContainer}>
        {currentMedia ? (
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.card,
              {
                transform: [
                  { translateX: position.x },
                  { translateY: position.y },
                  { rotate },
                ],
              },
            ]}
          >
            <Image
              source={{
                uri: currentMedia.posterPath
                  ? currentMedia.posterPath
                  : 'https://via.placeholder.com/500x750?text=No+Image',
              }}
              style={styles.cardImage}
            />
            
            {/* Like/Dislike Overlays */}
            <Animated.View style={[styles.likeOverlay, { opacity: likeOpacity }]}>
              <Text style={styles.overlayText}>LIKE</Text>
            </Animated.View>
            <Animated.View style={[styles.dislikeOverlay, { opacity: dislikeOpacity }]}>
              <Text style={styles.overlayText}>NOPE</Text>
            </Animated.View>
            
            {/* Card Info */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.9)']}
              style={styles.cardGradient}
            >
              <Text style={styles.cardTitle}>{currentMedia.title}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.cardYear}>
                  {currentMedia.year || 'N/A'}
                </Text>
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={styles.ratingText}>
                    {currentMedia.rating?.toFixed(1) || 'N/A'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardOverview} numberOfLines={3}>
                {currentMedia.overview || 'Sin descripción disponible'}
              </Text>
            </LinearGradient>
          </Animated.View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            <Text style={styles.emptyTitle}>¡Has terminado!</Text>
            <Text style={styles.emptySubtitle}>
              Has votado todo el contenido de esta sala
            </Text>
            <TouchableOpacity
              style={styles.viewMatchesButton}
              onPress={() => router.push(`/room/${roomId}/matches`)}
            >
              <Text style={styles.viewMatchesText}>Ver matches</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      {currentMedia && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.dislikeButton]}
            onPress={() => swipeLeft()}
            disabled={isVoting}
          >
            <Ionicons name="close" size={32} color="#FF6B6B" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => router.push(`/media/${currentMedia.tmdbId}`)}
          >
            <Ionicons name="information-circle" size={28} color={colors.textMuted} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.likeButton]}
            onPress={() => swipeRight()}
            disabled={isVoting}
          >
            <Ionicons name="heart" size={32} color="#4ECDC4" />
          </TouchableOpacity>
        </View>
      )}

      {/* Match Modal */}
      {showMatch && matchedMedia && (
        <View style={styles.matchOverlay}>
          <View style={styles.matchContent}>
            <Text style={styles.matchTitle}>🎉 ¡Es un Match!</Text>
            <Text style={styles.matchSubtitle}>
              Todos han votado por esta película
            </Text>
            <Image
              source={{
                uri: matchedMedia.mediaPosterPath
                  ? `https://image.tmdb.org/t/p/w300${matchedMedia.mediaPosterPath}`
                  : 'https://via.placeholder.com/300x450',
              }}
              style={styles.matchPoster}
            />
            <Text style={styles.matchMediaTitle}>{matchedMedia.mediaTitle}</Text>
            <TouchableOpacity
              style={styles.matchButton}
              onPress={() => setShowMatch(false)}
            >
              <Text style={styles.matchButtonText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  roomName: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  membersText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  menuButton: {
    padding: spacing.xs,
  },
  progressContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: width - spacing.lg * 2,
    height: height * 0.6,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  likeOverlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    padding: spacing.md,
    borderWidth: 4,
    borderColor: '#4ECDC4',
    borderRadius: borderRadius.md,
    transform: [{ rotate: '-20deg' }],
  },
  dislikeOverlay: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: spacing.md,
    borderWidth: 4,
    borderColor: '#FF6B6B',
    borderRadius: borderRadius.md,
    transform: [{ rotate: '20deg' }],
  },
  overlayText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: spacing.xs,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cardYear: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.8)',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  ratingText: {
    fontSize: fontSize.sm,
    color: '#FFF',
    fontWeight: '600',
  },
  cardOverview: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  viewMatchesButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  viewMatchesText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xl,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dislikeButton: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  likeButton: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  infoButton: {
    padding: spacing.sm,
  },
  matchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchContent: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  matchTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: spacing.sm,
  },
  matchSubtitle: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: spacing.xl,
  },
  matchPoster: {
    width: 200,
    height: 300,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  matchMediaTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  matchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  matchButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFF',
  },
});
