import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { mediaService, MediaItem, StreamingProvider } from '../../src/services/mediaService';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.lg * 2 - spacing.md) / 2;

type FilterType = 'Todo' | 'Películas' | 'Series';
type ViewMode = 'grid' | 'list';

export default function ExploreScreen() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('Todo');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [totalResults, setTotalResults] = useState(0);

  const filters: FilterType[] = ['Todo', 'Películas', 'Series'];

  const loadContent = useCallback(async (filter: FilterType, query?: string) => {
    try {
      setLoading(true);
      let response;

      if (query && query.trim()) {
        // Búsqueda
        response = await mediaService.searchContent(query);
        // Filtrar por tipo si es necesario
        if (filter === 'Películas') {
          response.results = response.results.filter(m => m.mediaType === 'movie');
        } else if (filter === 'Series') {
          response.results = response.results.filter(m => m.mediaType === 'tv');
        }
      } else {
        // Contenido por defecto según filtro
        if (filter === 'Películas') {
          response = await mediaService.getPopularMovies();
        } else if (filter === 'Series') {
          response = await mediaService.getPopularTV();
        } else {
          response = await mediaService.getTrending();
        }
      }

      setMedia(response.results);
      setTotalResults(response.totalResults);
    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContent(activeFilter, searchQuery);
  }, [activeFilter]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== '') {
        loadContent(activeFilter, searchQuery);
      } else {
        loadContent(activeFilter);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContent(activeFilter, searchQuery);
    setRefreshing(false);
  };

  const handleFilterChange = (filter: FilterType) => {
    setActiveFilter(filter);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Explorar</Text>
            <Text style={styles.subtitle}>DESCUBRE CONTENIDO NUEVO</Text>
          </View>
          <View style={styles.logoShape}>
            <View style={[styles.logoBar, styles.logoBar1]} />
            <View style={[styles.logoBar, styles.logoBar2]} />
            <View style={[styles.logoBar, styles.logoBar3]} />
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar películas, series..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Filters and View Toggle */}
        <View style={styles.filtersRow}>
          <View style={styles.filterTabs}>
            {filters.map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterTab,
                  activeFilter === filter && styles.filterTabActive,
                ]}
                onPress={() => handleFilterChange(filter)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    activeFilter === filter && styles.filterTabTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                viewMode === 'grid' && styles.viewToggleButtonActive,
              ]}
              onPress={() => setViewMode('grid')}
            >
              <Ionicons
                name="grid"
                size={18}
                color={viewMode === 'grid' ? '#fff' : colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                viewMode === 'list' && styles.viewToggleButtonActive,
              ]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons
                name="list"
                size={18}
                color={viewMode === 'list' ? '#fff' : colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Results Count */}
        <View style={styles.resultsHeader}>
          <Ionicons name="sparkles" size={18} color={colors.primary} />
          <Text style={styles.resultsText}>
            {loading ? 'Cargando...' : `${totalResults.toLocaleString()} resultados`}
          </Text>
        </View>

        {/* Loading State */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          /* Media Grid */
          <View style={styles.mediaGrid}>
            {media.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </View>
        )}

        {/* Empty State */}
        {!loading && media.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="film-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No se encontraron resultados</Text>
          </View>
        )}
      </ScrollView>

      {/* FAB for AI suggestions */}
      <TouchableOpacity style={styles.fab}>
        <Ionicons name="sparkles" size={24} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function MediaCard({ item }: { item: MediaItem }) {
  const handlePress = () => {
    router.push(`/media/${item.id}`);
  };

  return (
    <TouchableOpacity style={styles.mediaCard} activeOpacity={0.8} onPress={handlePress}>
      <View style={styles.mediaImageContainer}>
        {item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={styles.mediaImage} />
        ) : (
          <View style={[styles.mediaImage, styles.noImage]}>
            <Ionicons name="image-outline" size={32} color={colors.textMuted} />
          </View>
        )}

        {/* Rating Badge */}
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={12} color="#FFD700" />
          <Text style={styles.ratingText}>{item.rating}</Text>
        </View>

        {/* New Badge */}
        {item.isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>Nuevo</Text>
          </View>
        )}

        {/* Media Type Badge */}
        <View style={styles.typeBadge}>
          <Ionicons
            name={item.mediaType === 'movie' ? 'film' : 'tv'}
            size={10}
            color="#fff"
          />
        </View>

        {/* Streaming Providers Overlay */}
        {item.streamingProviders && item.streamingProviders.length > 0 && (
          <View style={styles.providersOverlay}>
            {item.streamingProviders.slice(0, 3).map((provider) => (
              <Image
                key={provider.id}
                source={{ uri: provider.logoPath }}
                style={styles.providerLogoSmall}
              />
            ))}
            {item.streamingProviders.length > 3 && (
              <View style={styles.moreProviders}>
                <Text style={styles.moreProvidersText}>+{item.streamingProviders.length - 3}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <Text style={styles.mediaTitle} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.mediaYear}>{item.year}</Text>
      
      {/* Plataformas de streaming debajo del título */}
      {item.streamingProviders && item.streamingProviders.length > 0 ? (
        <View style={styles.platformsRow}>
          {item.streamingProviders.slice(0, 2).map((provider) => (
            <View key={provider.id} style={styles.platformChip}>
              <Image source={{ uri: provider.logoPath }} style={styles.platformChipLogo} />
              <Text style={styles.platformChipText} numberOfLines={1}>{provider.name}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.mediaPlatform}>{item.platform || 'Cargando...'}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 4,
  },
  logoShape: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 40,
  },
  logoBar: {
    width: 10,
    marginHorizontal: 1,
    borderRadius: 3,
  },
  logoBar1: {
    height: 25,
    backgroundColor: '#00D4FF',
  },
  logoBar2: {
    height: 32,
    backgroundColor: '#6366F1',
  },
  logoBar3: {
    height: 22,
    backgroundColor: '#EC4899',
  },
  searchContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  filterButton: {
    width: 48,
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filtersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: 'transparent',
  },
  filterTabActive: {
    backgroundColor: colors.surface,
  },
  filterTabText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  filterTabTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: 4,
  },
  viewToggleButton: {
    width: 36,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  viewToggleButtonActive: {
    backgroundColor: colors.primary,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  resultsText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  mediaCard: {
    width: CARD_WIDTH,
    marginBottom: spacing.sm,
  },
  mediaImageContainer: {
    width: '100%',
    height: CARD_WIDTH * 1.4,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    position: 'relative',
    backgroundColor: colors.surface,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  noImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  ratingText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: '#fff',
  },
  newBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  newBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: '#fff',
  },
  typeBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 4,
    borderRadius: borderRadius.sm,
  },
  mediaTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  mediaYear: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  mediaPlatform: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  providersOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    padding: 4,
    borderRadius: borderRadius.md,
  },
  providerLogoSmall: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  moreProviders: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreProvidersText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
  },
  platformsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  platformChipLogo: {
    width: 14,
    height: 14,
    borderRadius: 2,
  },
  platformChipText: {
    fontSize: 10,
    color: colors.textSecondary,
    maxWidth: 50,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
