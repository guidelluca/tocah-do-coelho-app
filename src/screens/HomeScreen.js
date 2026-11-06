import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { RentDetailSheet } from '../components/RentDetailSheet';
import { CaixinhaSheet } from '../components/CaixinhaSheet';
import { MyTaskCard } from '../components/MyTaskCard';
import { RemoteImage, HOUSE_SOURCES } from '../components/RemoteImage';
import { AppText, Avatar, BottomSheet, Card, Divider, Icon, IconButton, ListRow, MoneyText, PressableScale, SectionHeader, SkeletonCard, StatusPill } from '../components/ui';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { useCaixinha, useConfig, useFinance, useNilde } from '../data/hooks';
import { invalidateResources } from '../data/store';
import { dueInfo, formatMonthReference } from '../utils/date';
import { toNumber } from '../utils/money';
import { displayName, sameName } from '../utils/text';

const LOCAL_HOUSE = require('../../assets/splash-icon.png');

/** Soma o que eu devo / o que me devem a partir dos acertos individuais. */
function useBalances(acertos, resident) {
  return useMemo(() => {
    const owe = {};
    const owed = {};
    (acertos || []).forEach((a) => {
      const v = toNumber(a.deveQuanto);
      if (!v) return;
      if (sameName(a.quem, resident)) owe[a.paraQuem] = (owe[a.paraQuem] || 0) + v;
      else if (sameName(a.paraQuem, resident)) owed[a.quem] = (owed[a.quem] || 0) + v;
    });
    const toList = (m) => Object.entries(m).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
    return { owe: toList(owe), owed: toList(owed), oweTotal: Object.values(owe).reduce((a, b) => a + b, 0), owedTotal: Object.values(owed).reduce((a, b) => a + b, 0) };
  }, [acertos, resident]);
}

export function HomeScreen() {
  const navigation = useNavigation();
  const { colors, spacing, radius } = useTheme();
  const { resident, valuesHidden, toggleValuesHidden } = useResident();
  const finance = useFinance();
  const caixinha = useCaixinha();
  const config = useConfig();
  const nilde = useNilde();
  const [rentRow, setRentRow] = useState(null);
  const [caixinhaOpen, setCaixinhaOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const fin = finance.data || {};
  const sheet = fin.mesReferencia || '';
  const monthLabel = fin.mesLabel || formatMonthReference(sheet);
  const myRow = (fin.residents || []).find((r) => sameName(r.nome, resident));
  const cfg = config.data?.config || {};
  const due = dueInfo(cfg.vencimentoAluguel, sheet);
  const balances = useBalances(fin.acertosIndividuais, resident);
  const totalCasa = (fin.residents || []).reduce((acc, r) => acc + toNumber(r.total), 0);
  const nildeToday = nilde.data ? Object.keys(nilde.data.log?.[nilde.data.today] || {}).length : null;
  const dueTone = { ok: 'neutral', soon: 'warning', today: 'warning', late: 'danger' }[due?.tone] || 'neutral';

  const refreshAll = () => {
    invalidateResources('finance', 'caixinha', 'feed', 'config', 'escala');
    return finance.refresh();
  };

  return (
    <Screen title="Início" subtitle={monthLabel} onRefresh={refreshAll}>
      {/* FOTO DA CASA (logo abaixo do cabeçalho, como no app original) */}
      <View style={[styles.hero, { borderRadius: radius.xl, marginBottom: spacing.md }]}>
        <RemoteImage sources={HOUSE_SOURCES} fallback={LOCAL_HOUSE} style={StyleSheet.absoluteFill} accessibilityLabel="Foto da casa" />
        <View style={[styles.heroOverlay, { backgroundColor: colors.imageScrim, padding: spacing.lg }]}>
          <AppText variant="heading" color="onImage">República Tocah do Coelho</AppText>
          {!!cfg.fraseHome && <AppText variant="caption" color="onImage">{cfg.fraseHome}</AppText>}
        </View>
      </View>

      {/* SEU ALUGUEL */}
      {finance.loading ? (
        <SkeletonCard lines={3} />
      ) : (
        <Card onPress={myRow ? () => setRentRow(myRow) : undefined} accessibilityLabel="Ver composição do seu aluguel" style={{ marginBottom: spacing.md }}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading" color="primary">Seu aluguel</AppText>
              <AppText variant="bodyStrong" color="textMuted">{monthLabel}</AppText>
            </View>
            <IconButton icon={valuesHidden ? 'eye-off-outline' : 'eye-outline'} onPress={toggleValuesHidden} accessibilityLabel={valuesHidden ? 'Mostrar valores' : 'Ocultar valores'} variant="primary" size={44} iconSize={20} />
          </View>
          {myRow ? (
            <MoneyText value={myRow.total} variant="display" color="primary" style={{ marginTop: spacing.sm }} />
          ) : (
            <AppText variant="body" color="textMuted" style={{ marginTop: spacing.sm }}>Seu nome não está na aba {sheet || 'do mês'} da planilha.</AppText>
          )}
          <View style={[styles.wrapRow, { gap: spacing.sm, marginTop: spacing.md }]}>
            {!!due && <StatusPill icon="calendar-clock" label={due.label} tone={dueTone === 'neutral' ? 'danger' : dueTone} />}
            {fin.isActive === false && !!fin.mesReferencia && <StatusPill label="Mês antigo" tone="warning" />}
          </View>
          {!!myRow && (
            <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
              <AppText variant="captionStrong" color="primary">Ver composição do aluguel</AppText>
              <Icon name="chevron-right" color="primary" size={18} />
            </View>
          )}
        </Card>
      )}

      {/* SUA TAREFA */}
      <MyTaskCard />

      {/* CAIXINHA (faixa verde, como antes) */}
      <Card variant="success" onPress={() => setCaixinhaOpen(true)} accessibilityLabel="Abrir caixinha" style={{ marginBottom: spacing.md }}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <AppText variant="heading" color="onSuccessSoft">CAIXINHA</AppText>
            <AppText variant="caption" color="onSuccessSoft">Toque para ver o extrato ou lançar</AppText>
          </View>
          {caixinha.loading ? <AppText variant="title" color="onSuccessSoft">…</AppText> : <MoneyText value={caixinha.data?.saldo} variant="title" color="onSuccessSoft" />}
        </View>
      </Card>

      {/* ATALHOS */}
      <View style={[styles.actions, { gap: spacing.sm, marginBottom: spacing.md }]}>
        {[
          { icon: 'cash-plus', label: 'Lançar gasto', onPress: () => navigation.navigate('Financas', { action: 'newExpense', at: Date.now() }) },
          { icon: 'calendar-month-outline', label: 'Escala', onPress: () => navigation.navigate('Tarefas') },
          { icon: 'rabbit-variant', label: nildeToday === null ? 'Nilde' : `Nilde ${nildeToday}/3`, onPress: () => navigation.navigate('Nilde') },
          { icon: 'book-open-variant', label: 'Regras', onPress: () => setRulesOpen(true) },
        ].map((a) => (
          <PressableScale key={a.label} onPress={a.onPress} accessibilityLabel={a.label} style={[styles.shortcut, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.sm }]}>
            <Icon name={a.icon} color="primary" size={26} />
            <AppText variant="captionStrong" color="primary" center numberOfLines={1}>{a.label.toUpperCase()}</AppText>
          </PressableScale>
        ))}
      </View>

      {/* ENTRE MORADORES */}
      {!!fin.acertosIndividuais && (balances.owe.length > 0 || balances.owed.length > 0) && (
        <Card onPress={() => navigation.navigate('Financas', { tab: 'acertos', at: Date.now() })} style={{ marginBottom: spacing.md }} accessibilityLabel="Ver acertos">
          <AppText variant="overline" color="textMuted" style={{ marginBottom: spacing.xs }}>Entre moradores</AppText>
          {balances.owe.map((b) => (
            <View key={`owe-${b.nome}`} style={[styles.rowBetween, { minHeight: 32 }]}>
              <AppText variant="body">Você deve a <AppText variant="bodyStrong">{displayName(b.nome)}</AppText></AppText>
              <MoneyText value={b.valor} color="danger" />
            </View>
          ))}
          {balances.owed.map((b) => (
            <View key={`owed-${b.nome}`} style={[styles.rowBetween, { minHeight: 32 }]}>
              <AppText variant="body"><AppText variant="bodyStrong">{displayName(b.nome)}</AppText> te deve</AppText>
              <MoneyText value={b.valor} color="success" />
            </View>
          ))}
        </Card>
      )}

      {/* PRÉVIA DOS ALUGUÉIS */}
      <SectionHeader title="Prévia dos aluguéis" subtitle="Toque para ver o extrato de cada um" />
      <Card padding="md">
        {finance.loading && <AppText color="textMuted">Carregando…</AppText>}
        {(fin.residents || []).map((r, i) => (
          <View key={r.nome}>
            <ListRow
              onPress={() => setRentRow(r)}
              accessibilityLabel={`Extrato de ${displayName(r.nome)}`}
              left={<Avatar name={r.nome} size={36} />}
              title={sameName(r.nome, resident) ? `${displayName(r.nome)} (você)` : displayName(r.nome)}
              right={<MoneyText value={r.total} />}
              chevron
              style={{ paddingVertical: spacing.sm }}
            />
            {i < fin.residents.length - 1 && <Divider />}
          </View>
        ))}
        {!!fin.residents?.length && (
          <View style={[styles.rowBetween, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.xs }]}>
            <AppText variant="bodyStrong" color="textMuted">Total da casa</AppText>
            <MoneyText value={totalCasa} variant="heading" color="primary" />
          </View>
        )}
      </Card>

      <RentDetailSheet residentRow={rentRow} sheetTitle={sheet} onClose={() => setRentRow(null)} />
      <CaixinhaSheet visible={caixinhaOpen} onClose={() => setCaixinhaOpen(false)} saldo={caixinha.data?.saldo} />
      <BottomSheet visible={rulesOpen} onClose={() => setRulesOpen(false)} title="Regras da casa">
        <AppText variant="body" style={{ marginBottom: spacing.md }}>{cfg.regrasDaCasa || 'Sem regras cadastradas.'}</AppText>
        <AppText variant="caption" color="textSubtle">Para mudar este texto, edite a linha “regrasDaCasa” na aba Config da planilha.</AppText>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'stretch' },
  shortcut: { flex: 1, alignItems: 'center', gap: 6, borderWidth: 1, minHeight: 84, justifyContent: 'center' },
  hero: { height: 230, overflow: 'hidden', justifyContent: 'flex-end' },
  heroOverlay: { gap: 2 },
});
