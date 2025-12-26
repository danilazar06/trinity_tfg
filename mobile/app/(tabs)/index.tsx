import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing, fontSize } from '../../src/utils/theme';
import { mediaService, MediaItem } from '../../src/services/mediaService';
import CreateRoomModal from '../../src/components/CreateRoomModal';

export default function HomeScreen() {
  const [recentMatches, setRecentMatches] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadRecentContent();
  }, []);

  const loadRecentContent = async () => {
    try {
      setLoading(true);
      const trending = await mediaService.getTrending('week');
      // Tomar los primeros 5 como "matches recientes"
      setRecentMatches(trending.results.slice(0, 5));
    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToRooms = () => {
    router.push('/rooms');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Inicio</Text>
          <View style={styles.logo}>
            <View style={[styles.logoBar, { height: 20, backgroundColor: '#00D4FF' }]} />
            <View style={[styles.logoBar, { height: 26, backgroundColor: '#6366F1' }]} />
            <View style={[styles.logoBar, { height: 16, backgroundColor: '#EC4899' }]} />
          </View>
        </View>

        {/* Banner principal */}
        <TouchableOpacity 
          style={styles.banner}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.9}
        >
          <View style={styles.bannerHeader}>
            <Ionicons name="grid" size={16} color="#FFF" />
            <Text style={styles.bannerLabel}>Descubre</Text>
            <Ionicons name="chevron-forward" size={20} color="#FFF" style={styles.bannerArrow} />
          </View>
          <Text style={styles.bannerTitle}>¿Qué vemos hoy?</Text>
          <Text style={styles.bannerSubtitle}>Crea una sala y empieza a hacer swipe</Text>
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Ionicons name="heart" size={16} color="#EC4899" />
              <Text style={styles.statLabel}>CHINES</Text>
            </View>
            <Text style={styles.statNumber}>3</Text>
            <Text style={styles.statDescription}>Matches guardados</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Ionicons name="people" size={16} color={colors.primary} />
              <Text style={styles.statLabel}>SALAS</Text>
            </View>
            <Text style={[styles.statNumber, { color: colors.primary }]}>4</Text>
            <Text style={styles.statDescription}>Salas activas</Text>
          </View>
        </View>

        {/* Matches recientes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="heart" size={18} color="#EC4899" />
            <Text style={styles.sectionTitle}>CHINES RECIENTES</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            recentMatches.map((match) => (
              <TouchableOpacity 
                key={match.id} 
                style={styles.matchCard} 
                activeOpacity={0.8}
                onPress={() => router.push(`/media/${match.id}`)}
              >
                <Image source={{ uri: match.posterPath || '' }} style={styles.matchImage} />
                <View style={styles.matchInfo}>
                  <Text style={styles.matchTitle} numberOfLines={1}>{match.title}</Text>
                  <Text style={styles.matchMeta}>
                    {match.mediaType === 'movie' ? 'Película' : 'Serie'} · {match.year}
                  </Text>
                  <View style={styles.matchPlatform}>
                    <View style={styles.matchBadge}>
                      <Ionicons name="heart" size={10} color="#FFF" />
                      <Text style={styles.matchBadgeText}>Match</Text>
                    </View>
                    {/* Mostrar plataformas de streaming reales */}
                    {match.streamingProviders && match.streamingProviders.length > 0 ? (
                      <View style={styles.streamingLogos}>
                        {match.streamingProviders.slice(0, 3).map((provider) => (
                          <Image
                            key={provider.id}
                            source={{ uri: provider.logoPath }}
                            style={styles.streamingLogoSmall}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.platformText}>{match.platform}</Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Modal de crear sala */}
      <CreateRoomModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onGoToRooms={handleGoToRooms}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  logoBar: {
    width: 8,
    marginHorizontal: 1,
    borderRadius: 2,
  },
  banner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.primary,
    overflow: 'hidden',
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bannerLabel: {
    color: '#FFF',
    fontSize: fontSize.sm,
    marginLeft: spacing.xs,
    opacity: 0.9,
  },
  bannerArrow: {
    marginLeft: 'auto',
  },
  bannerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: spacing.xs,
  },
  bannerSubtitle: {
    fontSize: fontSize.sm,
    color: '#FFF',
    opacity: 0.8,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: spacing.xs,
    fontWeight: '600',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#EC4899',
  },
  statDescription: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    letterSpacing: 1,
  },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  matchImage: {
    width: 60,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
  },
  matchInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  matchTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  matchMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  matchPlatform: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EC4899',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: spacing.sm,
  },
  matchBadgeText: {
    fontSize: 10,
    color: '#FFF',
    marginLeft: 4,
    fontWeight: '600',
  },
  platformText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  streamingLogos: {
    flexDirection: 'row',
    gap: 4,
  },
  streamingLogoSmall: {
    width: 22,
    height: 22,
    borderRadius: 4,
  },
});
