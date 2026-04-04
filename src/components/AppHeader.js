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
  return (
    <LinearGradient
      colors={['#6a1b9a', '#4a148c']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { paddingTop: Math.max(8, insets.top * 0.35), marginTop: 0 }]}
    >
      <View style={styles.left}>
        <View style={styles.logoWrap}>
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
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#4a148c',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: '100%', height: '100%' },
  logoFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e8ff' },
  houseTitle: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '900', letterSpacing: 0.1 },
  contextText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2, fontWeight: '700' },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  themeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
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
