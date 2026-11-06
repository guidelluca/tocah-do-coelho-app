import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { getApiConnectionStatus, subscribeApiConnectionStatus } from '../../services/api';
import { formatDateTime } from '../../utils/date';
import { Icon } from './Icon';
import { AppText, Button } from './primitives';

export function EmptyState({ icon = 'rabbit', title, message, actionLabel, onAction, compact }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.empty, { paddingVertical: compact ? spacing.lg : spacing.xxxl, gap: spacing.sm }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
        <Icon name={icon} size={28} color="primary" />
      </View>
      {!!title && <AppText variant="heading" center>{title}</AppText>}
      {!!message && <AppText variant="caption" color="textMuted" center style={{ maxWidth: 280 }}>{message}</AppText>}
      {!!actionLabel && <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" style={{ marginTop: spacing.sm }} />}
    </View>
  );
}

export function Skeleton({ width = '100%', height = 14, radius: r = 8, style }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.skeleton, opacity: pulse }, style]} />;
}

export function SkeletonCard({ lines = 3 }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
      <Skeleton width="40%" height={12} />
      <Skeleton width="70%" height={24} />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => <Skeleton key={i} width={`${90 - i * 15}%`} />)}
    </View>
  );
}

export function useConnectionStatus() {
  const [status, setStatus] = useState(() => getApiConnectionStatus());
  useEffect(() => subscribeApiConnectionStatus(setStatus), []);
  return status;
}

/** Faixa de status: "acordando o servidor" (Render grátis), offline com cache, ou sem conexão. */
export function OfflineBanner({ onRetry, style }) {
  const status = useConnectionStatus();
  const { colors, radius, spacing } = useTheme();
  if (status.online && !status.waking) return null;
  const waking = status.online && status.waking;
  const tone = waking ? { bg: colors.infoSoft, fg: 'info', icon: 'coffee-outline' } : { bg: colors.warningSoft, fg: 'onWarningSoft', icon: 'cloud-off-outline' };
  const title = waking ? 'Acordando o servidor…' : status.source === 'cache' ? 'Sem conexão' : 'Sem conexão com o servidor';
  const message = waking
    ? 'No plano grátis ele dorme quando ninguém usa. Leva até 1 minuto.'
    : status.cachedAt
      ? `Mostrando dados salvos às ${formatDateTime(status.cachedAt)}.`
      : status.source === 'cache'
        ? 'Mostrando os últimos dados salvos.'
        : 'Confira sua internet e tente de novo.';
  return (
    <View style={[styles.banner, { backgroundColor: tone.bg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md }, style]} accessibilityRole="alert">
      <Icon name={tone.icon} size={20} color={tone.fg} />
      <View style={{ flex: 1 }}>
        <AppText variant="captionStrong" color={tone.fg}>{title}</AppText>
        <AppText variant="caption" color={tone.fg}>{message}</AppText>
      </View>
      {!waking && !!onRetry && <Button label="Tentar" size="sm" variant="outline" onPress={onRetry} />}
    </View>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <EmptyState
      icon="alert-circle-outline"
      title="Não deu para carregar"
      message={error?.message || 'Tente de novo em instantes.'}
      actionLabel={onRetry ? 'Tentar de novo' : undefined}
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
