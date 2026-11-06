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
    <Screen title="República Tocah" subtitle={`Olá, ${displayName(resident)} · ${monthLabel}`} onRefresh={refreshAll}>
      {/* SEU MÊS */}
      {finance.loading ? (
        <SkeletonCard lines={3} />
      ) : (
        <Card onPress={myRow ? () => setRentRow(myRow) : undefined} accessibilityLabel="Ver composição do seu aluguel" style={{ marginBottom: spacing.md }}>
          <View style={styles.rowBetween}>
            <AppText variant="overline" color="textMuted">Você paga em {monthLabel}</AppText>
            <IconButton icon={valuesHidden ? 'eye-off-outline' : 'eye-outline'} onPress={toggleValuesHidden} accessibilityLabel={valuesHidden ? 'Mostrar valores' : 'Ocultar valores'} size={40} iconSize={20} />
          </View>
          {myRow ? (
            <MoneyText value={myRow.total} variant="display" style={{ marginTop: -spacing.xs }} />
          ) : (
            <AppText variant="body" color="textMuted">Seu nome não está na aba {sheet || 'do mês'} da planilha.</AppText>
          )}
          <View style={[styles.wrapRow, { gap: spacing.sm, marginTop: spacing.md }]}>
            {!!due && <StatusPill icon="calendar-clock" label={due.label} tone={dueTone} />}
            {fin.isActive === false && !!fin.mesReferencia && <StatusPill label="Mês antigo" tone="warning" />}
          </View>
          {!!myRow && (
            <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
              <AppText variant="captionStrong" color="primary">Ver composição</AppText>
              <Icon name="chevron-right" color="primary" size={18} />
            </View>
          )}
        </Card>
      )}

      {/* SUA TAREFA */}
      <MyTaskCard />

      {/* CAIXINHA + NILDE */}
      <View style={[styles.actions, { gap: spacing.md, marginBottom: spacing.md }]}>
        <Card variant="success" onPress={() => setCaixinhaOpen(true)} style={{ flex: 1 }} accessibilityLabel="Abrir caixinha">
          <Icon name="piggy-bank-outline" color="onSuccessSoft" size={22} />
          <AppText variant="captionStrong" color="onSuccessSoft" style={{ marginTop: spacing.sm }}>Caixinha</AppText>
          {caixinha.loading ? <AppText variant="heading" color="onSuccessSoft">…</AppText> : <MoneyText value={caixinha.data?.saldo} variant="heading" color="onSuccessSoft" />}
        </Card>
        <Card variant="primary" onPress={() => navigation.navigate('Nilde')} style={{ flex: 1 }} accessibilityLabel="Abrir Nilde">
          <Icon name="rabbit" color="onPrimarySoft" size={22} />
          <AppText variant="captionStrong" color="onPrimarySoft" style={{ marginTop: spacing.sm }}>Nilde hoje</AppText>
          <AppText variant="heading" color="onPrimarySoft">{nildeToday === null ? '…' : `${nildeToday}/3 refeições`}</AppText>
        </Card>
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

      {/* ATALHOS */}
      <View style={[styles.actions, { gap: spacing.sm, marginBottom: spacing.sm }]}>
        {[
          { icon: 'cash-plus', label: 'Lançar gasto', onPress: () => navigation.navigate('Financas', { action: 'newExpense', at: Date.now() }) },
          { icon: 'calendar-month-outline', label: 'Escala', onPress: () => navigation.navigate('Tarefas') },
          { icon: 'book-open-variant', label: 'Regras', onPress: () => setRulesOpen(true) },
        ].map((a) => (
          <PressableScale key={a.label} onPress={a.onPress} accessibilityLabel={a.label} style={[styles.shortcut, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }]}>
            <Icon name={a.icon} color="primary" size={24} />
            <AppText variant="captionStrong" center>{a.label}</AppText>
          </PressableScale>
        ))}
      </View>

      {/* A CASA */}
      <SectionHeader title="A casa este mês" subtitle="Toque para ver o extrato de cada um" />
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

      {/* FOTO DA CASA */}
      <View style={[styles.hero, { borderRadius: radius.lg, marginTop: spacing.xl }]}>
        <RemoteImage sources={HOUSE_SOURCES} fallback={LOCAL_HOUSE} style={StyleSheet.absoluteFill} accessibilityLabel="Foto da casa" />
        <View style={[styles.heroOverlay, { backgroundColor: colors.imageScrim, padding: spacing.lg }]}>
          <AppText variant="heading" color="onImage">República Tocah do Coelho</AppText>
          {!!cfg.fraseHome && <AppText variant="caption" color="onImage" style={{ opacity: 0.9 }}>“{cfg.fraseHome}”</AppText>}
        </View>
      </View>

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
  shortcut: { flex: 1, alignItems: 'center', gap: 6, borderWidth: 1, minHeight: 76, justifyContent: 'center' },
  hero: { height: 180, overflow: 'hidden', justifyContent: 'flex-end' },
  heroOverlay: { gap: 2 },
});
