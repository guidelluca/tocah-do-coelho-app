import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useResident } from '../context/ResidentContext';
import { useNotifications } from '../context/NotificationContext';
import { AppText, Avatar, IconButton, PressableScale } from './ui';
import { RemoteImage, LOGO_SOURCES } from './RemoteImage';
import { NotificationsSheet } from './NotificationsSheet';
import { ResidentSheet } from './ResidentSheet';

const LOCAL_LOGO = require('../../assets/icon.png');

/** Cabeçalho único de todas as abas: logo, título, tema, sino (funciona em todas) e avatar do morador. */
export function AppHeader({ title = 'Tocah', subtitle = '' }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme, spacing, radius, shadow } = useTheme();
  const { resident } = useResident();
  const { notificationCount, markNotificationsAsSeen } = useNotifications();
  const [bellOpen, setBellOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);

  return (
    <>
      <LinearGradient
        colors={[colors.headerStart, colors.headerEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.wrap, shadow(2), { paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl }]}
      >
        <View style={[styles.orb, { backgroundColor: colors.onHeaderSurface }]} />
        <View style={styles.left}>
          <RemoteImage sources={LOGO_SOURCES} fallback={LOCAL_LOGO} style={[styles.logo, { borderColor: colors.onHeaderBorder }]} resizeMode="cover" accessibilityLabel="Logo da República Tocah do Coelho" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="heading" color="onHeader" numberOfLines={1}>{title}</AppText>
            {!!subtitle && <AppText variant="caption" color="onHeaderMuted" numberOfLines={1}>{subtitle}</AppText>}
          </View>
        </View>
        <View style={styles.right}>
          <IconButton icon={isDark ? 'white-balance-sunny' : 'moon-waning-crescent'} variant="header" onPress={toggleTheme} accessibilityLabel={isDark ? 'Usar tema claro' : 'Usar tema escuro'} iconSize={20} />
          <IconButton
            icon="bell-outline"
            variant="header"
            badge={notificationCount}
            accessibilityLabel={notificationCount ? `Notificações, ${notificationCount} novas` : 'Notificações'}
            onPress={() => {
              setBellOpen(true);
              markNotificationsAsSeen();
            }}
          />
          <PressableScale onPress={() => setMeOpen(true)} accessibilityLabel={`Você é ${resident}. Trocar morador`} scaleTo={0.92} style={styles.me}>
            <Avatar name={resident} size={40} ring="onHeader" />
          </PressableScale>
        </View>
      </LinearGradient>
      <NotificationsSheet visible={bellOpen} onClose={() => setBellOpen(false)} />
      <ResidentSheet visible={meOpen} onClose={() => setMeOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', gap: 8 },
  orb: { position: 'absolute', width: 160, height: 160, borderRadius: 80, top: -70, right: 40 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  logo: { width: 40, height: 40, borderRadius: 20, borderWidth: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  me: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
