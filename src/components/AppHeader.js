import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useResident } from '../context/ResidentContext';
import { useNotifications } from '../context/NotificationContext';
import { displayName } from '../utils/text';
import { AppText, Avatar, Icon, IconButton, PressableScale } from './ui';
import { RemoteImage, LOGO_SOURCES } from './RemoteImage';
import { NotificationsSheet } from './NotificationsSheet';
import { ResidentSheet } from './ResidentSheet';

const LOCAL_LOGO = require('../../assets/icon.png');

/**
 * Cabeçalho no estilo do app original: cartão roxo com a logo grande,
 * "PAINEL DA CASA", o nome inteiro da república e uma linha de contexto.
 * A linha "Morador" é tocável e abre a troca de morador/foto.
 */
export function AppHeader({ subtitle = '' }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggleTheme, spacing, shadow } = useTheme();
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
        style={[styles.wrap, shadow(2), { marginTop: insets.top + spacing.sm }]}
      >
        <View style={[styles.orbTop, { backgroundColor: colors.onHeaderSurface }]} />
        <View style={[styles.orbBottom, { backgroundColor: colors.onHeaderSurface }]} />
        <View style={styles.left}>
          <View style={[styles.logoRing, { backgroundColor: colors.onHeaderBorder }]}>
            <RemoteImage sources={LOGO_SOURCES} fallback={LOCAL_LOGO} style={styles.logo} resizeMode="cover" accessibilityLabel="Logo da República Tocah do Coelho" />
          </View>
          <View style={styles.texts}>
            <AppText variant="overline" color="onHeaderMuted">Painel da casa</AppText>
            <AppText style={styles.title} color="onHeader" numberOfLines={2}>República Tocah do Coelho</AppText>
            <PressableScale onPress={() => setMeOpen(true)} accessibilityLabel={`Morador: ${displayName(resident)}. Toque para trocar`} scaleTo={0.97} style={styles.meRow}>
              <Avatar name={resident} size={20} />
              <AppText variant="captionStrong" color="onHeader" numberOfLines={1} style={styles.meText}>
                {displayName(resident)}{subtitle ? ` · ${subtitle}` : ''}
              </AppText>
              <Icon name="chevron-down" size={16} color="onHeaderMuted" />
            </PressableScale>
          </View>
        </View>
        <View style={styles.right}>
          <IconButton icon={isDark ? 'white-balance-sunny' : 'moon-waning-crescent'} variant="header" onPress={toggleTheme} accessibilityLabel={isDark ? 'Usar tema claro' : 'Usar tema escuro'} iconSize={19} size={40} />
          <IconButton
            icon="bell-outline"
            variant="header"
            size={40}
            iconSize={21}
            badge={notificationCount}
            accessibilityLabel={notificationCount ? `Notificações, ${notificationCount} novas` : 'Notificações'}
            onPress={() => {
              setBellOpen(true);
              markNotificationsAsSeen();
            }}
          />
        </View>
      </LinearGradient>
      <NotificationsSheet visible={bellOpen} onClose={() => setBellOpen(false)} />
      <ResidentSheet visible={meOpen} onClose={() => setMeOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginBottom: 6, borderRadius: 26, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', gap: 8 },
  orbTop: { position: 'absolute', top: -34, right: -16, width: 120, height: 120, borderRadius: 60 },
  orbBottom: { position: 'absolute', bottom: -50, left: -34, width: 140, height: 140, borderRadius: 70, opacity: 0.6 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  logoRing: { width: 56, height: 56, borderRadius: 28, padding: 2 },
  logo: { width: '100%', height: '100%', borderRadius: 26 },
  texts: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, lineHeight: 21, fontWeight: '900' },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, minHeight: 28, alignSelf: 'flex-start', maxWidth: '100%' },
  meText: { flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
