import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.lg * 2 - spacing.md * 2) / 3;

interface ListItem {
  id: string;
  title: string;
  year: string;
  platform: string;
  rating: number;
  image: string;
  isNew?: boolean;
}

// Datos mock
const myList: ListItem[] = [
  {
    id: '1',
    title: 'El Viaje Infinito',
    year: '2024',
    platform: 'Netflix +1',
    rating: 8.5,
    image: 'https://picsum.photos/200/300?random=10',
    isNew: true,
  },
  {
    id: '2',
    title: 'Sombras del Pasado',
    year: '2023',
    platform: 'HBO Max',
    rating: 9.1,
    image: 'https://picsum.photos/200/300?random=11',
  },
  {
    id: '3',
    title: 'Amor en Tokio',
    year: '2024',
    platform: 'Prime Video +1',
    rating: 7.8,
    image: 'https://picsum.photos/200/300?random=12',
    isNew: true,
  },
  {
    id: '4',
    title: 'La Última Frontera',
    year: '2023',
    platform: 'Disney+',
    rating: 8.2,
    image: 'https://picsum.photos/200/300?random=13',
  },
  {
    id: '5',
    title: 'Código Secreto',
    year: '2024',
    platform: 'Netflix',
    rating: 7.5,
    image: 'https://picsum.photos/200/300?random=14',
    isNew: true,
  },
];

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Perfil</Text>
          <View style={styles.logoShape}>
            <View style={[styles.logoBar, styles.logoBar1]} />
            <View style={[styles.logoBar, styles.logoBar2]} />
            <View style={[styles.logoBar, styles.logoBar3]} />
          </View>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Image
            source={{ uri: user?.avatar || 'https://i.pravatar.cc/150?img=3' }}
            style={styles.avatar}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{user?.name || 'Alex García'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'alex@example.com'}</Text>
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="person-outline" size={16} color={colors.textPrimary} />
              <Text style={styles.editButtonText}>Editar perfil</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>24</Text>
            <Text style={styles.statLabel}>VISTAS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>6</Text>
            <Text style={styles.statLabel}>MI LISTA</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>12</Text>
            <Text style={styles.statLabel}>MATCHES</Text>
          </View>
        </View>

        {/* My List Section */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="bookmark" size={18} color={colors.textPrimary} />
            <Text style={styles.sectionTitle}>MI LISTA</Text>
          </View>
          <TouchableOpacity style={styles.seeAllButton}>
            <Text style={styles.seeAllText}>Ver todo</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Horizontal List */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        >
          {myList.map((item) => (
            <ListCard key={item.id} item={item} />
          ))}
        </ScrollView>

        {/* Settings Section */}
        <View style={styles.settingsSection}>
          <SettingsItem
            icon="notifications-outline"
            title="Notificaciones"
            onPress={() => {}}
          />
          <SettingsItem
            icon="shield-outline"
            title="Privacidad"
            onPress={() => {}}
          />
          <SettingsItem
            icon="help-circle-outline"
            title="Ayuda"
            onPress={() => {}}
          />
          <SettingsItem
            icon="log-out-outline"
            title="Cerrar sesión"
            onPress={handleLogout}
            isDestructive
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ListCard({ item }: { item: ListItem }) {
  return (
    <TouchableOpacity style={styles.listCard} activeOpacity={0.8}>
      <View style={styles.listImageContainer}>
        <Image source={{ uri: item.image }} style={styles.listImage} />
        
        {/* Rating Badge */}
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={10} color="#FFD700" />
          <Text style={styles.ratingText}>{item.rating}</Text>
        </View>

        {/* New Badge */}
        {item.isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>Nuevo</Text>
          </View>
        )}
      </View>

      <Text style={styles.listTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.listYear}>{item.year}</Text>
      <Text style={styles.listPlatform}>{item.platform}</Text>
    </TouchableOpacity>
  );
}

function SettingsItem({
  icon,
  title,
  onPress,
  isDestructive = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
  isDestructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.settingsItem} onPress={onPress}>
      <View style={styles.settingsItemLeft}>
        <Ionicons
          name={icon}
          size={22}
          color={isDestructive ? colors.error : colors.textPrimary}
        />
        <Text
          style={[
            styles.settingsItemText,
            isDestructive && styles.settingsItemTextDestructive,
          ]}
        >
          {title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: spacing.md,
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  editButtonText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  listContainer: {
    paddingRight: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  listCard: {
    width: CARD_WIDTH,
  },
  listImageContainer: {
    width: '100%',
    height: CARD_WIDTH * 1.5,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.xs,
    position: 'relative',
  },
  listImage: {
    width: '100%',
    height: '100%',
  },
  ratingBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  newBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#fff',
  },
  listTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  listYear: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  listPlatform: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  settingsSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingsItemText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  settingsItemTextDestructive: {
    color: colors.error,
  },
});
