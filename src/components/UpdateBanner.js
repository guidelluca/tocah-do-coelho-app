import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { AppText, Button, Icon } from './ui';

/** Versão deste build (o GitHub Actions grava o commit em EXPO_PUBLIC_APP_VERSION e em version.json). */
const BUILD = process.env.EXPO_PUBLIC_APP_VERSION || '';

function versionUrl() {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname.replace(/[^/]*$/, '');
  return `${window.location.origin}${path}version.json?t=${Date.now()}`;
}

/** Celular com o app antigo guardado na memória: avisa e recarrega com um toque. */
export function UpdateBanner() {
  const { colors, spacing, radius } = useTheme();
  const [nova, setNova] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || !BUILD) return undefined;
    let vivo = true;
    const checar = async () => {
      try {
        const res = await fetch(versionUrl(), { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (vivo && j?.v && j.v !== BUILD) setNova(true);
      } catch {
        /* offline: tenta depois */
      }
    };
    checar();
    const timer = setInterval(checar, 30 * 60 * 1000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && checar());
    return () => {
      vivo = false;
      clearInterval(timer);
      sub?.remove?.();
    };
  }, []);
  if (!nova) return null;
  return (
    <View style={[styles.wrap, { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, margin: spacing.md }]} accessibilityRole="alert">
      <Icon name="update" color="onPrimary" />
      <AppText variant="bodyStrong" color="onPrimary" style={{ flex: 1 }}>Saiu uma versão nova do app.</AppText>
      <Button label="Atualizar" size="sm" variant="secondary" onPress={() => window.location.reload()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', position: 'absolute', left: 0, right: 0, bottom: 84, zIndex: 50 },
});
