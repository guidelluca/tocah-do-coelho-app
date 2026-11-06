import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { AppHeader } from './AppHeader';
import { OfflineBanner } from './ui';

/** Estrutura padrão das abas: cabeçalho fixo + conteúdo rolável com "puxar para atualizar". */
export function Screen({ title, subtitle, onRefresh, children, footer, contentStyle, scrollRef }) {
  const { colors, spacing } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;
  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <AppHeader title={title} subtitle={subtitle} />
      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={[{ padding: spacing.lg, paddingBottom: spacing.xxxl * 3 }, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={handleRefresh ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
      >
        <OfflineBanner onRetry={handleRefresh} />
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
