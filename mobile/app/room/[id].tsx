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
import { appSyncService } from '../../src/services/appSyncService';
import { matchService, Match } from '../../src/services/matchService';
import { mediaService, MediaItem, MediaItemDetails } from '../../src/services/mediaService';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.25;

interface VoteUpdate {
  roomId: string;
  userId: string;
  movieId: string;
  voteType: 'LIKE' | 'DISLIKE' | 'POLLING_UPDATE';
  currentVotes: number;
  totalMembers: number;
  timestamp: string;
}

interface MatchFound {
  roomId: string;
  movieId: string;
  movieTitle: string;
  participants: string[];
  timestamp: string;
}

interface RoomUpdate {
  id: string;
  status: string;
  resultMovieId?: string;
  memberCount: number;
  updatedAt: string;
}

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
  
  // Real-time subscription state
  const [voteCount, setVoteCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  
  // Subscription cleanup functions
  const unsubscribeVotes = useRef<(() => void) | null>(null);
  const unsubscribeMatches = useRef<(() => void) | null>(null);
  const unsubscribeRoom = useRef<(() => void) | null>(null);
  
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

  // Real-time subscription setup
  const setupSubscriptions = useCallback(async () => {
    if (!roomId) return;
    
    console.log('🔔 Setting up real-time subscriptions for room:', roomId);
    setRealtimeStatus('connecting');
    
    try {
      // Subscribe to vote updates
      unsubscribeVotes.current = await appSyncService.subscribeToVoteUpdates(
        roomId,
        (voteUpdate: VoteUpdate) => {
          console.log('📊 Vote update received:', voteUpdate);
          
          // Update vote count display
          setVoteCount(voteUpdate.currentVotes);
          setMemberCount(voteUpdate.totalMembers);
          
          // Show visual feedback for new votes
          if (voteUpdate.voteType === 'LIKE' && voteUpdate.userId !== 'polling-update') {
            // Could add a toast notification or animation here
            console.log(`👍 ${voteUpdate.userId} voted LIKE for ${voteUpdate.movieId}`);
          }
        }
      );
      
      // Subscribe to match found events
      unsubscribeMatches.current = await appSyncService.subscribeToMatchFound(
        roomId,
        (matchData: MatchFound) => {
          console.log('🎉 Match found via subscription:', matchData);
          
          // Show match immediately
          setMatchedMedia({
            id: `realtime-match-${Date.now()}`,
            roomId: matchData.roomId,
            mediaId: matchData.movieId,
            mediaTitle: matchData.movieTitle,
            mediaPosterPath: '', // Will be loaded from TMDB if needed
            participantCount: matchData.participants.length,
            createdAt: matchData.timestamp,
            consensusType: 'unanimous_like',
          });
          
          setShowMatch(true);
          setCurrentMedia(null); // Stop showing content to vote on
          
          // Optional: Navigate to match result screen after a delay
          setTimeout(() => {
            router.push(`/room/${roomId}/matches`);
          }, 3000); // Show match modal for 3 seconds, then navigate
        }
      );
      
      // Subscribe to room updates
      unsubscribeRoom.current = await appSyncService.subscribeToRoomUpdates(
        roomId,
        (roomUpdate: RoomUpdate) => {
          console.log('🏠 Room update received:', roomUpdate);
          
          // Update member count in real-time
          setMemberCount(roomUpdate.memberCount);
          
          // Handle room status changes
          if (roomUpdate.status === 'MATCHED' && roomUpdate.resultMovieId) {
            // Room has been matched, load match details
            mediaService.getMovieDetails(parseInt(roomUpdate.resultMovieId))
              .then(movieDetails => {
                setMatchedMedia({
                  id: `existing-match-${roomId}`,
                  roomId,
                  mediaId: roomUpdate.resultMovieId!,
                  mediaTitle: movieDetails.title,
                  mediaPosterPath: movieDetails.posterPath || '',
                  participantCount: roomUpdate.memberCount || 0,
                  createdAt: new Date().toISOString(),
                  consensusType: 'unanimous_like',
                });
                setShowMatch(true);
                setCurrentMedia(null);
              })
              .catch(error => {
                console.error('Error loading matched movie details:', error);
              });
          }
          
          // Update room details if available
          setRoomDetails(prevDetails => {
            if (prevDetails) {
              return {
                ...prevDetails,
                room: {
                  ...prevDetails.room,
                  status: roomUpdate.status,
                },
              };
            }
            return prevDetails;
          });
          
          // Handle different room states
          switch (roomUpdate.status) {
            case 'ACTIVE':
              console.log('🟢 Room is active and ready for voting');
              break;
            case 'PAUSED':
              console.log('⏸️ Room has been paused');
              Alert.alert('Sala pausada', 'El host ha pausado la votación temporalmente.');
              break;
            case 'COMPLETED':
              console.log('✅ Room voting completed');
              setCurrentMedia(null); // Stop showing content to vote on
              break;
            case 'MATCHED':
              console.log('🎉 Room has found a match');
              // Match handling is done above
              break;
            default:
              console.log(`🔄 Room status changed to: ${roomUpdate.status}`);
          }
        }
      );
      
      setRealtimeStatus('connected');
      console.log('✅ All subscriptions established successfully');
      
    } catch (error) {
      console.error('❌ Failed to setup subscriptions:', error);
      setRealtimeStatus('disconnected');
      
      // Show user-friendly error message
      Alert.alert(
        'Conexión en tiempo real',
        'No se pudo establecer la conexión en tiempo real. Las actualizaciones pueden no aparecer inmediatamente.',
        [{ text: 'Entendido' }]
      );
    }
  }, [roomId]); // Solo roomId como dependencia

  // Load matched movie details
  const loadMatchedMovie = useCallback(async (movieId: string) => {
    try {
      const movieDetails = await mediaService.getMovieDetails(parseInt(movieId));
      setMatchedMedia({
        id: `existing-match-${roomId}`,
        roomId: roomId!,
        mediaId: movieId,
        mediaTitle: movieDetails.title,
        mediaPosterPath: movieDetails.posterPath || '',
        participantCount: memberCount,
        createdAt: new Date().toISOString(),
        consensusType: 'unanimous_like',
      });
      setShowMatch(true);
      setCurrentMedia(null);
    } catch (error) {
      console.error('Error loading matched movie details:', error);
    }
  }, [roomId, memberCount]);

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  // Handle match found with automatic navigation
  const handleMatchFound = useCallback((matchData: MatchFound) => {
    console.log('🎉 Match found via subscription:', matchData);
    
    // Show match immediately
    setMatchedMedia({
      id: `realtime-match-${Date.now()}`,
      roomId: matchData.roomId,
      mediaId: matchData.movieId,
      mediaTitle: matchData.movieTitle,
      mediaPosterPath: '', // Will be loaded from TMDB if needed
      participantCount: matchData.participants.length,
      createdAt: matchData.timestamp,
      consensusType: 'unanimous_like',
    });
    
    setShowMatch(true);
    setCurrentMedia(null); // Stop showing content to vote on
    
    // Optional: Navigate to match result screen after a delay
    setTimeout(() => {
      router.push(`/room/${roomId}/matches`);
    }, 3000); // Show match modal for 3 seconds, then navigate
  }, [roomId]);

  // Cleanup subscriptions
  const cleanupSubscriptions = useCallback(() => {
    console.log('🧹 Cleaning up subscriptions');
    
    if (unsubscribeVotes.current) {
      unsubscribeVotes.current();
      unsubscribeVotes.current = null;
    }
    
    if (unsubscribeMatches.current) {
      unsubscribeMatches.current();
      unsubscribeMatches.current = null;
    }
    
    if (unsubscribeRoom.current) {
      unsubscribeRoom.current();
      unsubscribeRoom.current = null;
    }
    
    setRealtimeStatus('disconnected');
  }, []);

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

  const loadRoomData = useCallback(async () => {
    if (!roomId) return;
    
    try {
      setLoading(true);
      
      console.log('🏠 Loading room data for ID:', roomId);
      
      // Cargar detalles de la sala usando AppSync
      const roomResult = await appSyncService.getRoom(roomId);
      
      console.log('✅ Room data loaded:', roomResult);
      
      // Convertir formato GraphQL a formato esperado por el componente
      if (roomResult.getRoom) {
        const room = roomResult.getRoom;
        setRoomDetails({
          room: {
            id: room.id,
            name: room.name,
            hostId: room.hostId,
            status: room.status,
            inviteCode: room.inviteCode,
            createdAt: room.createdAt,
          },
          members: [], // Members list not available in GraphQL schema, using memberCount instead
        });
        
        // Set member count from GraphQL response
        setMemberCount(room.memberCount || 0);
        
        // Verificar si la sala ya tiene un match
        if (room.status === 'MATCHED' && room.resultMovieId) {
          // Cargar detalles de la película que hizo match
          try {
            const movieDetails = await mediaService.getMovieDetails(parseInt(room.resultMovieId));
            setMatchedMedia({
              id: `existing-match-${room.id}`,
              roomId,
              mediaId: room.resultMovieId,
              mediaTitle: movieDetails.title,
              mediaPosterPath: movieDetails.posterPath || '',
              participantCount: room.memberCount || 0,
              createdAt: room.updatedAt || room.createdAt,
              consensusType: 'unanimous_like',
            });
            setShowMatch(true);
            setCurrentMedia(null); // No mostrar más contenido para votar
            return;
          } catch (error) {
            console.error('Error loading matched movie details:', error);
          }
        }
      } else {
        throw new Error('No se encontraron datos de la sala');
      }
      
      // Si no hay match, cargar contenido actual para votar
      await loadCurrentMedia();
      
      // Inicializar progreso (en una implementación real, esto vendría del backend)
      setProgress({
        current: 0,
        total: 20, // Valor por defecto, debería venir del backend
        percentage: 0,
      });
      
    } catch (error: any) {
      console.error('❌ Error loading room:', error);
      
      let errorMessage = 'No se pudo cargar la sala.';
      
      if (error.message) {
        if (error.message.includes('No tienes acceso')) {
          errorMessage = 'No tienes acceso a esta sala. Verifica que tengas permisos o que la sala exista.';
        } else if (error.message.includes('Sala no encontrada')) {
          errorMessage = 'Esta sala no existe o ha sido eliminada.';
        } else if (error.message.includes('Unauthorized')) {
          errorMessage = 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.';
        } else {
          errorMessage = error.message;
        }
      }
      
      Alert.alert(
        'Error',
        errorMessage,
        [
          { text: 'Reintentar', onPress: () => loadRoomData() },
          { text: 'Volver', onPress: () => router.back() }
        ]
      );
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const loadCurrentMedia = useCallback(async () => {
    if (!roomId) return;
    
    try {
      // En una implementación real, esto debería obtener el contenido actual desde GraphQL
      // Por ahora, usamos un ID de película de ejemplo para demostrar la funcionalidad
      const currentMovieId = 550 + progress.current; // Fight Club + offset
      
      try {
        console.log('🎬 Loading movie details for ID:', currentMovieId);
        const mediaDetails = await mediaService.getMovieDetails(currentMovieId);
        console.log('✅ Movie details loaded:', mediaDetails.title);
        setCurrentMedia(mediaDetails);
      } catch (error) {
        console.error('❌ Error loading movie details:', error);
        
        // Show user-friendly error message
        Alert.alert(
          'Error cargando contenido',
          'No se pudo cargar el contenido multimedia. Esto puede deberse a problemas de conectividad o que el contenido no esté disponible.',
          [
            { text: 'Reintentar', onPress: () => loadCurrentMedia() },
            { text: 'Salir', onPress: () => router.back() }
          ]
        );
        
        // Si no se puede cargar la película, marcar como completado
        setCurrentMedia(null);
      }
    } catch (error) {
      console.error('❌ Error in loadCurrentMedia:', error);
      Alert.alert(
        'Error',
        'Ocurrió un error inesperado al cargar el contenido.',
        [{ text: 'Volver', onPress: () => router.back() }]
      );
    }
  }, [roomId, progress.current]);

  const handleVote = async (voteType: 'like' | 'dislike') => {
    if (!roomId || !currentMedia || isVoting) return;
    
    setIsVoting(true);
    
    try {
      // Solo procesar votos "like" - los "dislike" se ignoran en Stop-on-Match
      if (voteType === 'like') {
        const result = await appSyncService.vote(roomId, currentMedia.tmdbId.toString());
        
        console.log('🗳️ Vote result:', result);
        
        // Verificar si hay match inmediato (Stop-on-Match algorithm)
        if (result.vote && result.vote.status === 'MATCHED' && result.vote.resultMovieId) {
          // ¡Match encontrado localmente! Mostrar inmediatamente
          console.log('🎉 Local match detected, showing match screen');
          
          // Cargar detalles de la película que hizo match
          try {
            const movieDetails = await mediaService.getMovieDetails(parseInt(result.vote.resultMovieId));
            setMatchedMedia({
              id: `local-match-${Date.now()}`,
              roomId,
              mediaId: result.vote.resultMovieId,
              mediaTitle: movieDetails.title,
              mediaPosterPath: movieDetails.posterPath || '',
              participantCount: memberCount || roomDetails?.members.length || 0,
              createdAt: new Date().toISOString(),
              consensusType: 'unanimous_like',
            });
          } catch (movieError) {
            // Fallback si no se pueden cargar detalles
            setMatchedMedia({
              id: `local-match-${Date.now()}`,
              roomId,
              mediaId: result.vote.resultMovieId,
              mediaTitle: currentMedia.title,
              mediaPosterPath: currentMedia.posterPath || '',
              participantCount: memberCount || roomDetails?.members.length || 0,
              createdAt: new Date().toISOString(),
              consensusType: 'unanimous_like',
            });
          }
          
          setShowMatch(true);
          setCurrentMedia(null); // Detener votación
          
          // Reset posición
          position.setValue({ x: 0, y: 0 });
          return;
        }
        
        // Si no hay match local, actualizar conteo de votos optimísticamente
        setVoteCount(prev => prev + 1);
      }
      
      // Si no hay match, continuar con el siguiente contenido
      // Simular progreso (en una implementación real, esto vendría del backend)
      const newProgress = {
        current: progress.current + 1,
        total: progress.total,
        percentage: Math.round(((progress.current + 1) / progress.total) * 100),
      };
      setProgress(newProgress);
      
      // Cargar siguiente contenido si no hemos terminado
      if (newProgress.current < newProgress.total) {
        // En una implementación real, el backend devolvería el siguiente movieId
        // Por ahora, incrementamos el ID actual
        const nextMovieId = parseInt(currentMedia.tmdbId.toString()) + 1;
        try {
          const nextMediaDetails = await mediaService.getMovieDetails(nextMovieId);
          setCurrentMedia(nextMediaDetails);
        } catch (error) {
          console.error('Error loading next media:', error);
          // Si no se puede cargar el siguiente, marcar como completado
          setCurrentMedia(null);
        }
      } else {
        // Cola completada
        setCurrentMedia(null);
      }
      
      // Reset posición
      position.setValue({ x: 0, y: 0 });
      
    } catch (error: any) {
      console.error('Error voting:', error);
      
      // Manejar errores específicos de GraphQL
      const errorMessage = error?.message || error?.toString() || '';
      
      if (errorMessage.includes('duplicate') || errorMessage.includes('already voted')) {
        Alert.alert(
          'Voto duplicado', 
          'Ya has votado por este contenido. Continuando con el siguiente...'
        );
        // Cargar siguiente contenido
        await loadCurrentMedia();
      } else if (errorMessage.includes('MATCHED')) {
        // El error indica que ya hay un match - esto podría venir de la suscripción
        console.log('🎉 Match detected via error message, waiting for subscription update');
        Alert.alert(
          '¡Match encontrado!', 
          'Esta sala ya tiene un match. La pantalla se actualizará automáticamente.'
        );
      } else {
        Alert.alert('Error', 'No se pudo registrar el voto. Inténtalo de nuevo.');
      }
      
      position.setValue({ x: 0, y: 0 });
    } finally {
      setIsVoting(false);
    }
  };

  useEffect(() => {
    loadRoomData();
    
    // Setup real-time subscriptions after room data is loaded
    const initializeSubscriptions = async () => {
      await setupSubscriptions();
    };
    
    initializeSubscriptions();
    
    // Cleanup subscriptions when component unmounts or roomId changes
    return () => {
      cleanupSubscriptions();
    };
  }, [roomId]); // Solo roomId como dependencia - las funciones useCallback son estables

  // Additional useEffect to setup subscriptions when room details are loaded
  useEffect(() => {
    if (roomDetails && realtimeStatus === 'disconnected') {
      setupSubscriptions();
    }
  }, [roomDetails, realtimeStatus]); // setupSubscriptions es estable por useCallback

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
              {memberCount || 0} participantes
            </Text>
            {voteCount > 0 && (
              <>
                <Text style={styles.separator}>•</Text>
                <Ionicons name="heart" size={12} color={colors.primary} />
                <Text style={styles.voteCountText}>{voteCount} votos</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.headerRight}>
          {/* Real-time connection status */}
          <View style={styles.connectionStatus}>
            <View style={[
              styles.connectionDot,
              {
                backgroundColor: realtimeStatus === 'connected' ? '#4ECDC4' :
                                realtimeStatus === 'connecting' ? '#FFD93D' : '#FF6B6B'
              }
            ]} />
          </View>
          <TouchableOpacity style={styles.menuButton}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
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
  // Real-time UI styles
  separator: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginHorizontal: 4,
  },
  voteCountText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  connectionStatus: {
    padding: 4,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B6B',
  },
});
