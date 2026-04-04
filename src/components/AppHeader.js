import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../context/ThemeContext';

const TOCAH_LOGO_SOURCES = [
  { uri: 'https://drive.google.com/uc?export=download&id=1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS' },
  { uri: 'https://drive.google.com/uc?export=view&id=1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS' },
  { uri: 'https://drive.google.com/thumbnail?id=1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS&sz=w512' },
  require('../../assets/icon.png'),
];

export function AppHeader({ title = 'República Tocah', subtitle = '', onBellPress, notificationCount = 0 }) {
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme } = useThemeMode();
  const [logoSourceIdx, setLogoSourceIdx] = useState(0);
  const contextLine = subtitle || title;
  const gradient = isDark ? ['#2a1d52', '#171225'] : ['#7a4bff', '#5c2dde'];
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { paddingTop: Math.max(10, insets.top * 0.4), marginTop: 0 }]}
    >
      <View style={styles.glowOrbTop} />
      <View style={styles.glowOrbBottom} />
      <View style={styles.left}>
        <View style={styles.logoOuterRing}>
          {logoSourceIdx < TOCAH_LOGO_SOURCES.length ? (
            <Image
              source={TOCAH_LOGO_SOURCES[logoSourceIdx]}
              style={styles.logo}
              resizeMode="contain"
              onError={() => setLogoSourceIdx((prev) => prev + 1)}
            />
          ) : (
            <View style={styles.logoFallback}>
              <MaterialCommunityIcons name="rabbit-variant" size={20} color="#6a1b9a" />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>Painel da Casa</Text>
          <Text style={styles.houseTitle} numberOfLines={2}>República Tocah do Coelho</Text>
          {!!contextLine && <Text style={styles.contextText} numberOfLines={1}>{contextLine}</Text>}
        </View>
      </View>
      <View style={styles.rightActions}>
        <Pressable style={styles.themeBtn} onPress={toggleTheme}>
          <MaterialCommunityIcons name={isDark ? 'white-balance-sunny' : 'moon-waning-crescent'} size={17} color="#fff" />
        </Pressable>
        <Pressable style={styles.bell} onPress={onBellPress}>
          <MaterialCommunityIcons name="bell-outline" size={20} color="#fff" />
          {notificationCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notificationCount > 99 ? '99+' : String(notificationCount)}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#3f2d87',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 9,
  },
  glowOrbTop: {
    position: 'absolute',
    top: -34,
    right: -16,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  glowOrbBottom: {
    position: 'absolute',
    bottom: -50,
    left: -34,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 10 },
  logoOuterRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  logo: { width: '100%', height: '100%', borderRadius: 26 },
  logoFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e8ff', borderRadius: 26 },
  houseTitle: { color: '#fff', fontSize: 18, lineHeight: 20, fontWeight: '900', letterSpacing: 0.15 },
  overline: { color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  contextText: { color: 'rgba(255,255,255,0.93)', fontSize: 12, marginTop: 2, fontWeight: '700' },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  themeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  badge: {
    position: 'absolute',
    right: -6,
    top: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
});
