import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Screen';
import { RentDetailSheet } from '../components/RentDetailSheet';
import { AppText, Avatar, BottomSheet, Button, Card, Chip, Divider, EmptyState, Icon, ListRow, MoneyText, PressableScale, ProgressBar, SkeletonCard, StatusPill, useFeedback } from '../components/ui';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { useFinance } from '../data/hooks';
import { invalidateResources, mutateResource } from '../data/store';
import { deleteFinanceEntry, getSettledHistory, isConflict, queryFor, settleAcerto, toggleContaStatus } from '../services/api';
import { useResource } from '../data/store';
import { dueInfo } from '../utils/date';
import { brl, toNumber } from '../utils/money';
import { autoObs, displayName, isLinkedToCollective, norm, sameName, userObs } from '../utils/text';
import { EntrySheet } from './finances/EntrySheet';

const SPECIAL_CONTAS = ['TOTAL', 'MORADORES'];

function contaStatus(conta, sheet) {
  const paid = String(conta?.status || '').toUpperCase() === 'TRUE';
  const due = dueInfo(conta?.vencimento, sheet);
  if (paid) return { paid, label: 'Paga', tone: 'success', due };
  if (due?.tone === 'late') return { paid, label: 'Atrasada', tone: 'danger', due };
  if (due?.tone === 'today' || due?.tone === 'soon') return { paid, label: 'Vence logo', tone: 'warning', due };
  return { paid, label: 'Pendente', tone: 'neutral', due };
}

export function FinancesScreen() {
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius, shadow } = useTheme();
  const { resident } = useResident();
  const { toast, toastError, confirm } = useFeedback();
  const [sheetView, setSheetView] = useState('');
  const finance = useFinance(sheetView);
  const [tab, setTab] = useState('geral');
  const [acertoFilter, setAcertoFilter] = useState('todos');
  const [entry, setEntry] = useState(null); // { kind, item }
  const [actionsFor, setActionsFor] = useState(null); // { kind, item }
  const [fabOpen, setFabOpen] = useState(false);
  const [rentRow, setRentRow] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const history = useResource('settledHistory', getSettledHistory, { resources: ['finance'], cacheQuery: queryFor('getSettledHistory'), enabled: historyOpen });

  const fin = finance.data || {};
  const sheet = fin.mesReferencia || '';
  const readOnly = !!fin.mesReferencia && fin.isActive === false;
  const expectedSheet = fin.activeSheet;

  // Atalhos vindos da Home ("Lançar gasto", "Entre moradores").
  useEffect(() => {
    const p = route.params || {};
    if (p.action === 'newExpense') {
      setSheetView('');
      setFabOpen(true);
    }
    if (p.tab) setTab(p.tab);
  }, [route.params?.at]);

  const contas = useMemo(() => (fin.contas || []).filter((c) => !SPECIAL_CONTAS.includes(norm(c.conta))), [fin.contas]);
  const moradores = useMemo(() => {
    const row = (fin.contas || []).find((c) => norm(c.conta) === 'MORADORES');
    const n = Number(String(row?.valor ?? '').replace(/[^\d]/g, ''));
    return n > 0 ? n : (fin.residents || []).length || 1;
  }, [fin.contas, fin.residents]);
  const totals = useMemo(() => {
    const totalContas = contas.reduce((a, c) => a + toNumber(c.valor), 0);
    const paid = contas.filter((c) => String(c.status).toUpperCase() === 'TRUE');
    const paidValue = paid.reduce((a, c) => a + toNumber(c.valor), 0);
    const late = contas.filter((c) => contaStatus(c, sheet).label === 'Atrasada').length;
    const coletivos = (fin.gastosColetivos || []).reduce((a, g) => a + toNumber(g.quanto), 0);
    const acertos = fin.acertosIndividuais || [];
    const iOwe = acertos.filter((a) => sameName(a.quem, resident)).reduce((s, a) => s + toNumber(a.deveQuanto), 0);
    const owedToMe = acertos.filter((a) => sameName(a.paraQuem, resident)).reduce((s, a) => s + toNumber(a.deveQuanto), 0);
    return { totalContas, paidCount: paid.length, paidValue, late, coletivos, iOwe, owedToMe };
  }, [contas, fin.gastosColetivos, fin.acertosIndividuais, resident, sheet]);
  const myRow = (fin.residents || []).find((r) => sameName(r.nome, resident));
  const acertos = (fin.acertosIndividuais || []).filter((a) => tab === 'geral' || acertoFilter === 'todos' || sameName(a.quem, resident) || sameName(a.paraQuem, resident));

  /* ---------- ações ---------- */

  const run = async (key, fn, success) => {
    setBusyKey(key);
    try {
      const res = await fn();
      toast(success || res?.message || 'Feito.', 'success');
      return true;
    } catch (e) {
      toastError(e);
      if (isConflict(e)) invalidateResources('finance');
      return false;
    } finally {
      setBusyKey('');
      invalidateResources('finance');
    }
  };

  const toggleConta = async (c) => {
    const next = String(c.status).toUpperCase() !== 'TRUE';
    mutateResource(`finance:${sheetView}`, (prev) => prev && { ...prev, contas: prev.contas.map((x) => (x.rowIndex === c.rowIndex ? { ...x, status: next ? 'TRUE' : 'FALSE' } : x)) });
    await run(`conta-${c.rowIndex}`, () => toggleContaStatus({ rowIndex: c.rowIndex, status: next, expected: { conta: c.conta }, expectedSheet }), next ? `${c.conta}: paga ✓` : `${c.conta}: pendente`);
  };

  const removeItem = async (kind, item) => {
    const linked = kind === 'coletivo' && isLinkedToCollective(item.obs);
    const labels = {
      conta: { title: `Excluir “${item.conta}”?`, message: 'A linha some da aba do mês na planilha.' },
      coletivo: { title: `Excluir “${item.oQue}”?`, message: linked ? 'Os acertos gerados por este gasto também serão apagados.' : 'A linha sai de Gastos coletivos na aba do mês.' },
      acerto: { title: 'Excluir acerto?', message: `${displayName(item.quem)} deve ${brl(item.deveQuanto)} a ${displayName(item.paraQuem)}. Se já foi pago, prefira “Quitar” (guarda histórico).` },
    }[kind];
    if (!(await confirm({ ...labels, confirmLabel: 'Excluir', destructive: true, icon: 'trash-can-outline' }))) return;
    const entryType = { conta: 'conta_fixa', coletivo: 'gasto_coletivo', acerto: 'acerto_individual' }[kind];
    const expected = kind === 'conta' ? { conta: item.conta, valor: item.valor } : kind === 'coletivo' ? { quem: item.quem, quanto: item.quanto, oQue: item.oQue } : { quem: item.quem, paraQuem: item.paraQuem, deveQuanto: item.deveQuanto };
    await run(`del-${item.rowIndex}`, () => deleteFinanceEntry({ entryType, rowIndex: item.rowIndex, expected, expectedSheet, cascade: linked }));
  };

  const settle = async (item) => {
    const ok = await confirm({
      title: 'Marcar como quitado?',
      message: `${displayName(item.quem)} pagou ${brl(item.deveQuanto)} a ${displayName(item.paraQuem)}. A linha sai da aba do mês e fica guardada na aba AcertosQuitados.`,
      confirmLabel: 'Quitado',
      icon: 'handshake-outline',
    });
    if (!ok) return;
    await run(`settle-${item.rowIndex}`, () => settleAcerto({ rowIndex: item.rowIndex, expected: { quem: item.quem, paraQuem: item.paraQuem, deveQuanto: item.deveQuanto }, usuario: resident, expectedSheet }), 'Acerto quitado! 🤝');
  };

  /* ---------- render ---------- */

  const geral = tab === 'geral';
  const show = (key) => geral || tab === key;
  const totalAcertosAbertos = (fin.acertosIndividuais || []).reduce((a, x) => a + toNumber(x.deveQuanto), 0);
  const totalAlugueis = (fin.residents || []).reduce((a, r) => a + toNumber(r.total), 0);
  const SectionHead = ({ title, icon, right, target }) => (
    <PressableScale onPress={() => setTab(target)} accessibilityLabel={`Ver só ${title}`} style={[styles.sectionHead, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
      <Icon name={icon} size={20} color="primary" />
      <AppText variant="heading" style={{ flex: 1 }}>{title}</AppText>
      <AppText variant="bodyStrong" color="primary" tabular>{right}</AppText>
      <Icon name="chevron-right" size={18} color="textSubtle" />
    </PressableScale>
  );

  const tabs = [
    { value: 'geral', label: 'Geral' },
    { value: 'contas', label: 'Contas', count: contas.length },
    { value: 'coletivos', label: 'Coletivos', count: (fin.gastosColetivos || []).length },
    { value: 'acertos', label: 'Acertos', count: (fin.acertosIndividuais || []).length },
    { value: 'moradores', label: 'Aluguéis' },
  ];

  const fab = !readOnly && (
    <PressableScale
      onPress={() => setFabOpen(true)}
      accessibilityLabel="Novo lançamento"
      style={[styles.fab, shadow(3), { backgroundColor: colors.primary, bottom: spacing.lg + Math.max(insets.bottom * 0, 0), right: spacing.lg, borderRadius: radius.pill }]}
    >
      <Icon name="plus" size={22} color="onPrimary" />
      <AppText variant="bodyStrong" color="onPrimary">Lançar</AppText>
    </PressableScale>
  );

  return (
    <Screen title="Finanças" subtitle={fin.mesLabel ? `Finanças · ${fin.mesLabel}` : 'Finanças'} onRefresh={finance.refresh} footer={fab}>
      {/* Mês */}
      {(fin.availableMonths || []).length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
          {fin.availableMonths.slice(0, 12).map((m) => {
            const isActiveMonth = m.title === fin.activeSheet;
            return (
              <Chip
                key={m.title}
                label={isActiveMonth ? `${m.label} · atual` : m.label}
                selected={m.title === sheet}
                onPress={() => setSheetView(isActiveMonth ? '' : m.title)}
              />
            );
          })}
        </ScrollView>
      )}
      {readOnly && (
        <Card variant="warning" padding="md" style={{ marginBottom: spacing.md }}>
          <View style={styles.row}>
            <Icon name="lock-outline" color="onWarningSoft" size={18} />
            <AppText variant="captionStrong" color="onWarningSoft" style={{ flex: 1 }}>Vendo {fin.mesLabel} só para consulta. Lançamentos vão sempre para o mês atual.</AppText>
          </View>
        </Card>
      )}

      {finance.loading ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </>
      ) : finance.error && !finance.data ? (
        <EmptyState icon="alert-circle-outline" title="Não deu para carregar" message={finance.error.message} actionLabel="Tentar de novo" onAction={finance.refresh} />
      ) : (
        <>
          {/* Resumo do morador */}
          <Card style={{ marginBottom: spacing.md }}>
            <AppText variant="overline" color="textMuted">Seu resumo · {displayName(resident)}</AppText>
            <PressableScale onPress={myRow ? () => setRentRow(myRow) : undefined} accessibilityLabel="Ver seu extrato" style={[styles.rowBetween, { marginTop: spacing.xs }]}>
              <View>
                <AppText variant="caption" color="textMuted">Seu total do mês</AppText>
                <MoneyText value={myRow?.total} variant="title" />
              </View>
              {!!myRow && <Icon name="chevron-right" color="textSubtle" />}
            </PressableScale>
            <View style={[styles.summary, { marginTop: spacing.md, gap: spacing.md }]}>
              <View style={[styles.summaryBox, { backgroundColor: totals.iOwe ? colors.dangerSoft : colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md }]}>
                <AppText variant="caption" color={totals.iOwe ? 'onDangerSoft' : 'textMuted'}>Você deve</AppText>
                <MoneyText value={totals.iOwe} variant="heading" color={totals.iOwe ? 'onDangerSoft' : 'textMuted'} />
              </View>
              <View style={[styles.summaryBox, { backgroundColor: totals.owedToMe ? colors.successSoft : colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md }]}>
                <AppText variant="caption" color={totals.owedToMe ? 'onSuccessSoft' : 'textMuted'}>Te devem</AppText>
                <MoneyText value={totals.owedToMe} variant="heading" color={totals.owedToMe ? 'onSuccessSoft' : 'textMuted'} />
              </View>
            </View>
            <Divider style={{ marginVertical: spacing.md }} />
            <View style={styles.rowBetween}>
              <AppText variant="captionStrong">Contas pagas: {totals.paidCount} de {contas.length}</AppText>
              <AppText variant="caption" color="textMuted" tabular>{brl(totals.paidValue)} de {brl(totals.totalContas)}</AppText>
            </View>
            <ProgressBar value={totals.totalContas ? totals.paidValue / totals.totalContas : 0} tone="success" style={{ marginTop: spacing.sm }} />
            {totals.late > 0 && <StatusPill label={`${totals.late} atrasada(s)`} tone="danger" icon="alert" style={{ marginTop: spacing.sm }} />}
          </Card>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
            {tabs.map((t) => (
              <Chip key={t.value} label={t.label} count={t.count} selected={tab === t.value} onPress={() => setTab(t.value)} />
            ))}
          </ScrollView>

          {geral && (
            <Card variant="sunken" padding="md">
              <AppText variant="overline" color="textMuted" style={{ marginBottom: spacing.sm }}>Consolidado de {fin.mesLabel || 'mês'}</AppText>
              {[
                { label: 'Contas fixas', value: brl(totals.totalContas), hint: `${totals.paidCount} de ${contas.length} pagas · ${brl(totals.totalContas / moradores)} por morador`, target: 'contas', icon: 'file-document-outline' },
                { label: 'Gastos coletivos', value: brl(totals.coletivos), hint: `${(fin.gastosColetivos || []).length} lançamento(s) · ${brl(totals.coletivos / moradores)} por morador`, target: 'coletivos', icon: 'cart-outline' },
                { label: 'Acertos em aberto', value: brl(totalAcertosAbertos), hint: `${(fin.acertosIndividuais || []).length} acerto(s) entre moradores`, target: 'acertos', icon: 'handshake-outline' },
                { label: 'Aluguéis da casa', value: brl(totalAlugueis), hint: `Soma do total dos ${(fin.residents || []).length} moradores`, target: 'moradores', icon: 'home-city-outline' },
              ].map((row, i) => (
                <View key={row.target}>
                  <ListRow onPress={() => setTab(row.target)} left={<Icon name={row.icon} color="primary" size={22} />} title={row.label} subtitle={row.hint} right={<AppText variant="bodyStrong" tabular>{row.value}</AppText>} chevron style={{ paddingVertical: spacing.sm }} />
                  {i < 3 && <Divider />}
                </View>
              ))}
            </Card>
          )}

          {show('contas') && (
            <>
            {geral && <SectionHead title="Contas fixas" icon="file-document-outline" right={brl(totals.totalContas)} target="contas" />}
            <Card padding="md">
              {!contas.length && <EmptyState icon="file-document-outline" title="Nenhuma conta fixa" message="As contas vêm do bloco “Conta / Valor” da aba do mês." compact />}
              {contas.map((c, i) => {
                const st = contaStatus(c, sheet);
                return (
                  <View key={c.rowIndex}>
                    <View style={[styles.row, { minHeight: 60, gap: spacing.md }]}>
                      <PressableScale
                        onPress={readOnly ? undefined : () => toggleConta(c)}
                        disabled={readOnly || busyKey === `conta-${c.rowIndex}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: st.paid }}
                        accessibilityLabel={`${c.conta}: ${st.paid ? 'paga, toque para marcar pendente' : 'pendente, toque para marcar paga'}`}
                        style={[styles.check, { borderColor: st.paid ? colors.success : colors.borderStrong, backgroundColor: st.paid ? colors.success : 'transparent' }]}
                      >
                        {st.paid && <Icon name="check" size={18} color="onSuccess" />}
                      </PressableScale>
                      <PressableScale onPress={readOnly ? undefined : () => setActionsFor({ kind: 'conta', item: c })} style={[styles.row, { flex: 1, gap: spacing.sm }]} accessibilityLabel={`Opções de ${c.conta}`}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <AppText variant="bodyStrong" numberOfLines={1} style={st.paid ? { textDecorationLine: 'line-through', opacity: 0.7 } : null}>{c.conta}</AppText>
                          <View style={[styles.row, { gap: spacing.xs, marginTop: 2, flexWrap: 'wrap' }]}>
                            <StatusPill label={st.label} tone={st.tone} />
                            {!!st.due && !st.paid && <AppText variant="caption" color="textMuted">dia {st.due.day}</AppText>}
                          </View>
                        </View>
                        <MoneyText value={c.valor} />
                      </PressableScale>
                    </View>
                    {i < contas.length - 1 && <Divider />}
                  </View>
                );
              })}
              {!!contas.length && (
                <View style={[styles.footerRow, { borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md }]}>
                  <AppText variant="caption" color="textMuted">Total {brl(totals.totalContas)}</AppText>
                  <AppText variant="captionStrong" color="primary">Por morador ({moradores}): {brl(totals.totalContas / moradores)}</AppText>
                </View>
              )}
            </Card>
            </>
          )}

          {show('coletivos') && (
            <>
            {geral && <SectionHead title="Gastos coletivos" icon="cart-outline" right={brl(totals.coletivos)} target="coletivos" />}
            <Card padding="md">
              {!(fin.gastosColetivos || []).length && <EmptyState icon="cart-outline" title="Nenhum gasto coletivo" message="Comprou algo pra casa? Toque em Lançar." compact />}
              {(fin.gastosColetivos || []).map((g, i, arr) => (
                <View key={g.rowIndex}>
                  <ListRow
                    onPress={readOnly ? undefined : () => setActionsFor({ kind: 'coletivo', item: g })}
                    left={<Avatar name={g.quem} size={40} />}
                    title={g.oQue || 'Gasto'}
                    subtitle={[`Pago por ${displayName(g.quem)}`, userObs(g.obs), autoObs(g.obs)].filter(Boolean).join(' · ')}
                    right={<MoneyText value={g.quanto} />}
                  />
                  {i < arr.length - 1 && <Divider />}
                </View>
              ))}
              {!!(fin.gastosColetivos || []).length && (
                <View style={[styles.footerRow, { borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md }]}>
                  <AppText variant="caption" color="textMuted">Total {brl(totals.coletivos)}</AppText>
                  <AppText variant="captionStrong" color="primary">Média por morador: {brl(totals.coletivos / moradores)}</AppText>
                </View>
              )}
            </Card>
            </>
          )}

          {show('acertos') && (
            <>
              {geral && <SectionHead title="Acertos individuais" icon="handshake-outline" right={brl(totalAcertosAbertos)} target="acertos" />}
              {!geral && <View style={[styles.row, { gap: spacing.sm, marginBottom: spacing.md }]}>
                <Chip label="Todos" selected={acertoFilter === 'todos'} onPress={() => setAcertoFilter('todos')} />
                <Chip label="Só os meus" selected={acertoFilter === 'meus'} onPress={() => setAcertoFilter('meus')} />
                <View style={{ flex: 1 }} />
                <Button label="Histórico" variant="ghost" size="sm" icon="history" onPress={() => setHistoryOpen(true)} />
              </View>}
              <Card padding="md">
                {!acertos.length && <EmptyState icon="handshake-outline" title="Ninguém deve nada" message="Tudo em dia por aqui." compact />}
                {acertos.map((a, i) => {
                  const mine = sameName(a.quem, resident);
                  const toMe = sameName(a.paraQuem, resident);
                  return (
                    <View key={a.rowIndex}>
                      <ListRow
                        onPress={readOnly ? undefined : () => setActionsFor({ kind: 'acerto', item: a })}
                        left={<Avatar name={a.quem} size={40} />}
                        title={<AppText variant="bodyStrong" numberOfLines={1}>{displayName(a.quem)} <AppText variant="body" color="textMuted">deve a</AppText> {displayName(a.paraQuem)}</AppText>}
                        subtitle={[userObs(a.obs), autoObs(a.obs)].filter(Boolean).join(' · ')}
                        right={<MoneyText value={a.deveQuanto} color={mine ? 'danger' : toMe ? 'success' : 'text'} />}
                      />
                      {i < acertos.length - 1 && <Divider />}
                    </View>
                  );
                })}
              </Card>
            </>
          )}

          {show('moradores') && (
            <>
            {geral && <SectionHead title="Aluguel por morador" icon="home-city-outline" right={brl(totalAlugueis)} target="moradores" />}
            <Card padding="md">
              {(fin.residents || []).map((r, i) => (
                <View key={r.nome}>
                  <ListRow onPress={() => setRentRow(r)} left={<Avatar name={r.nome} size={40} />} title={displayName(r.nome)} subtitle="Aluguel + contas do mês" right={<MoneyText value={r.total} />} chevron />
                  {i < fin.residents.length - 1 && <Divider />}
                </View>
              ))}
            </Card>
            </>
          )}
        </>
      )}

      {/* Ações do item */}
      <BottomSheet
        visible={!!actionsFor}
        onClose={() => setActionsFor(null)}
        title={actionsFor?.kind === 'conta' ? actionsFor.item.conta : actionsFor?.kind === 'coletivo' ? actionsFor.item.oQue : actionsFor ? `${displayName(actionsFor.item.quem)} → ${displayName(actionsFor.item.paraQuem)}` : ''}
        subtitle={actionsFor ? brl(actionsFor.item.valor ?? actionsFor.item.quanto ?? actionsFor.item.deveQuanto) : ''}
      >
        {actionsFor?.kind === 'acerto' && (
          <ListRow left={<Icon name="handshake-outline" color="success" />} title="Quitar (já foi pago)" subtitle="Tira da aba do mês e guarda no histórico" onPress={() => { const it = actionsFor.item; setActionsFor(null); settle(it); }} />
        )}
        {actionsFor?.kind === 'conta' && (
          <ListRow
            left={<Icon name={String(actionsFor.item.status).toUpperCase() === 'TRUE' ? 'checkbox-blank-circle-outline' : 'check-circle-outline'} color="success" />}
            title={String(actionsFor.item.status).toUpperCase() === 'TRUE' ? 'Marcar como pendente' : 'Marcar como paga'}
            onPress={() => { const it = actionsFor.item; setActionsFor(null); toggleConta(it); }}
          />
        )}
        <ListRow left={<Icon name="pencil-outline" color="primary" />} title="Editar" onPress={() => { const a = actionsFor; setActionsFor(null); setEntry(a); }} />
        <ListRow left={<Icon name="trash-can-outline" color="danger" />} title="Excluir" titleColor="danger" onPress={() => { const a = actionsFor; setActionsFor(null); removeItem(a.kind, a.item); }} />
      </BottomSheet>

      {/* Novo lançamento */}
      <BottomSheet visible={fabOpen} onClose={() => setFabOpen(false)} title="Lançar" subtitle={`Vai para a aba ${fin.activeSheet || 'do mês'}`}>
        <ListRow left={<Icon name="cart-plus" color="primary" size={24} />} title="Gasto da casa" subtitle={`Comprei algo para a casa: divide igual entre os ${moradores} (Gastos coletivos)`} onPress={() => { setFabOpen(false); setEntry({ kind: 'coletivo' }); }} chevron />
        <ListRow left={<Icon name="account-multiple-outline" color="primary" size={24} />} title="Dividir com algumas pessoas" subtitle="Ex.: paguei e divido com 2 pessoas (vai para Acertos)" onPress={() => { setFabOpen(false); setEntry({ kind: 'divisao' }); }} chevron />
        <ListRow left={<Icon name="account-cash-outline" color="primary" size={24} />} title="Empréstimo / acerto" subtitle="Emprestei um valor (sem compra para dividir)" onPress={() => { setFabOpen(false); setEntry({ kind: 'acerto' }); }} chevron />
        <ListRow left={<Icon name="file-document-edit-outline" color="primary" size={24} />} title="Alterar conta fixa" subtitle="Valor, vencimento ou se está paga" onPress={() => { setFabOpen(false); setTab('contas'); toast('Toque na conta que quer alterar.', 'info'); }} chevron />
      </BottomSheet>

      <BottomSheet visible={historyOpen} onClose={() => setHistoryOpen(false)} title="Acertos quitados" subtitle="Últimos 50, da aba AcertosQuitados">
        {history.loading && <SkeletonCard lines={3} />}
        {!history.loading && !(history.data?.items || []).length && <EmptyState icon="history" title="Nada quitado ainda" compact />}
        {(history.data?.items || []).map((h, i) => (
          <ListRow key={i} left={<Avatar name={h.quem} size={36} />} title={`${displayName(h.quem)} pagou ${displayName(h.paraQuem)}`} subtitle={`${h.quitadoEm}${h.quitadoPor ? ` · por ${displayName(h.quitadoPor)}` : ''}${h.obs ? ` · ${userObs(h.obs)}` : ''}`} right={<AppText variant="bodyStrong" tabular>{brl(h.deveQuanto)}</AppText>} />
        ))}
      </BottomSheet>

      <EntrySheet open={!!entry} kind={entry?.kind} item={entry?.item} activeSheet={expectedSheet} moradores={moradores} onClose={() => setEntry(null)} />
      <RentDetailSheet residentRow={rentRow} sheetTitle={sheet} onClose={() => setRentRow(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  summary: { flexDirection: 'row' },
  summaryBox: { flex: 1 },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center', margin: 7 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderTopWidth: 1 },
  fab: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, height: 52 },
});
