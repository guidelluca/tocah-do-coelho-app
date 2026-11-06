import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { AppText, Avatar, BottomSheet, Button, Card, Chip, Icon, TextField, useFeedback } from '../../components/ui';
import { useResident } from '../../context/ResidentContext';
import { useTheme } from '../../theme/ThemeContext';
import { addHouseExpense, addSettlements, isConflict, updateCollectiveExpense, updateFinanceEntry } from '../../services/api';
import { invalidateResources } from '../../data/store';
import { brl, formatMoneyInput, moneyInputFromValue, toNumber, toSheetMoney } from '../../utils/money';
import { autoObs, displayName, isLinkedToCollective, norm, sameName, userObs } from '../../utils/text';

/** Divide em centavos igual ao backend (o primeiro fica com o centavo que sobra). */
function previewShares(total, count) {
  if (!count || !total) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const rem = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}

function PeoplePicker({ label, value, onChange, multi, exclude = [], hint }) {
  const { residents } = useResident();
  const { spacing } = useTheme();
  const list = residents.filter((n) => !exclude.some((x) => sameName(x, n)));
  const selected = multi ? value : [value];
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.rowBetween}>
        <AppText variant="captionStrong" color="textMuted">{label}</AppText>
        {multi && (
          <Pressable onPress={() => onChange(selected.length === list.length ? [] : list)} hitSlop={8} accessibilityRole="button">
            <AppText variant="captionStrong" color="primary">{selected.length === list.length ? 'Limpar' : 'Todos'}</AppText>
          </Pressable>
        )}
      </View>
      <View style={[styles.wrap, { gap: spacing.sm, marginTop: spacing.xs }]}>
        {list.map((nome) => {
          const active = selected.some((s) => sameName(s, nome));
          return (
            <Chip
              key={nome}
              label={displayName(nome)}
              left={<Avatar name={nome} size={24} style={{ marginLeft: -6 }} />}
              selected={active}
              onPress={() => {
                if (!multi) return onChange(nome);
                return onChange(active ? selected.filter((s) => !sameName(s, nome)) : [...selected, nome]);
              }}
            />
          );
        })}
      </View>
      {!!hint && <AppText variant="caption" color="textSubtle" style={{ marginTop: spacing.xs }}>{hint}</AppText>}
    </View>
  );
}

const TITLES = {
  'coletivo:new': 'Gasto da casa',
  'divisao:new': 'Dividir com algumas pessoas',
  'coletivo:edit': 'Editar gasto coletivo',
  'acerto:new': 'Novo acerto',
  'acerto:edit': 'Editar acerto',
  'conta:edit': 'Editar conta fixa',
};

/**
 * Formulário único para lançar/editar.
 * kind: 'coletivo' | 'acerto' | 'conta'; item: linha da planilha quando for edição.
 */
export function EntrySheet({ open, kind, item, activeSheet, onClose, moradores = 5 }) {
  const { resident } = useResident();
  const { spacing, colors } = useTheme();
  const { toast, toastError } = useFeedback();
  const editing = !!item;
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (kind === 'divisao') {
      setForm({ payer: resident, oQue: '', valor: '', obs: '', devedores: [], incluirPagador: true });
    } else if (kind === 'coletivo') {
      setForm(editing
        ? { payer: item.quem, oQue: item.oQue, valor: moneyInputFromValue(item.quanto), obs: userObs(item.obs) }
        : { payer: resident, oQue: '', valor: '', obs: '' });
    } else if (kind === 'acerto') {
      setForm(editing
        ? { quem: item.quem, paraQuem: item.paraQuem, valor: moneyInputFromValue(item.deveQuanto), obs: item.obs }
        : { credor: resident, devedores: [], valor: '', obs: '' });
    } else if (kind === 'conta') {
      setForm({ conta: item?.conta || '', valor: moneyInputFromValue(item?.valor), vencimento: String(item?.vencimento || '').replace(/[^\d]/g, ''), divisao: item?.divisao || '', status: String(item?.status).toUpperCase() === 'TRUE' });
    }
  }, [open, kind, item]);

  const total = toNumber(form.valor);
  const debtors = (form.devedores || []).filter((n) => !sameName(n, kind === 'acerto' ? form.credor : form.payer));
  const shares = useMemo(() => {
    if (kind === 'divisao') return previewShares(total, debtors.length + (form.incluirPagador ? 1 : 0)).slice(0, debtors.length);
    if (kind === 'acerto' && !editing) return previewShares(total, debtors.length);
    return [];
  }, [kind, editing, total, debtors.length, form.incluirPagador]);

  const validate = () => {
    const e = {};
    if (kind === 'coletivo' || kind === 'divisao') {
      if (!String(form.oQue || '').trim()) e.oQue = 'O que foi comprado?';
      if (!total) e.valor = 'Informe o valor.';
      if (kind === 'divisao' && !debtors.length) e.devedores = 'Escolha com quem dividir.';
    } else if (kind === 'acerto') {
      if (!total) e.valor = 'Informe o valor.';
      if (!editing && !debtors.length) e.devedores = 'Escolha quem deve.';
      if (editing && sameName(form.quem, form.paraQuem)) e.quem = 'Devedor e credor precisam ser diferentes.';
    } else if (kind === 'conta') {
      if (!String(form.conta || '').trim()) e.conta = 'Nome da conta.';
      if (form.vencimento && (Number(form.vencimento) < 1 || Number(form.vencimento) > 31)) e.vencimento = 'Dia entre 1 e 31.';
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let res;
      if (kind === 'coletivo' && !editing) {
        res = await addHouseExpense({ payer: form.payer, oQue: form.oQue.trim(), valor: toSheetMoney(form.valor), obs: form.obs.trim() });
        res = { ...res, message: 'Gasto da casa lançado em Gastos coletivos.' };
      } else if (kind === 'divisao') {
        // Só acertos: uma linha por pessoa que deve a quem pagou. Se quem pagou entra na divisão,
        // a parte dele fica com ele (o total enviado é só a soma das partes dos devedores).
        const partes = debtors.length + (form.incluirPagador ? 1 : 0);
        const somaDevedores = previewShares(total, partes).slice(0, debtors.length).reduce((a, b) => a + b, 0);
        const obsFinal = [form.oQue.trim(), form.obs.trim(), form.incluirPagador ? `dividido em ${partes} com ${displayName(form.payer)}` : ''].filter(Boolean).join(' · ');
        res = await addSettlements({ credor: form.payer, devedores: debtors, valorTotal: somaDevedores.toFixed(2), obs: obsFinal, expectedSheet: activeSheet });
        res = { ...res, message: `${debtors.length} acerto(s) lançado(s) para ${displayName(form.payer)}.` };
      } else if (kind === 'coletivo') {
        const payload = { quem: form.payer, oQue: form.oQue.trim(), quanto: toSheetMoney(form.valor) };
        if (norm(form.obs) !== norm(userObs(item.obs))) payload.obs = form.obs.trim();
        res = await updateCollectiveExpense({ rowIndex: item.rowIndex, expected: { quem: item.quem, quanto: item.quanto, oQue: item.oQue }, payload, expectedSheet: activeSheet });
      } else if (kind === 'acerto' && !editing) {
        res = await addSettlements({ credor: form.credor, devedores: debtors, valorTotal: toSheetMoney(form.valor), obs: form.obs.trim(), expectedSheet: activeSheet });
      } else if (kind === 'acerto') {
        res = await updateFinanceEntry({ entryType: 'acerto_individual', rowIndex: item.rowIndex, expected: { quem: item.quem, paraQuem: item.paraQuem, deveQuanto: item.deveQuanto }, payload: { quem: form.quem, paraQuem: form.paraQuem, deveQuanto: toSheetMoney(form.valor), obs: form.obs.trim() }, expectedSheet: activeSheet });
      } else if (kind === 'conta') {
        res = await updateFinanceEntry({
          entryType: 'conta_fixa',
          rowIndex: item.rowIndex,
          expected: { conta: item.conta, valor: item.valor },
          payload: { conta: form.conta.trim(), valor: toSheetMoney(form.valor), vencimento: form.vencimento, divisao: form.divisao, status: form.status ? 'TRUE' : 'FALSE' },
          expectedSheet: activeSheet,
        });
      }
      toast(res?.message || 'Salvo na planilha.', 'success');
      onClose?.();
    } catch (e) {
      toastError(e, 'Não deu para salvar.');
      if (isConflict(e)) onClose?.();
    } finally {
      setSaving(false);
      invalidateResources('finance');
    }
  };

  const key = `${kind}:${editing ? 'edit' : 'new'}`;
  const valorField = (label) => (
    <TextField label={label} prefix="R$" value={form.valor} onChangeText={(t) => set({ valor: formatMoneyInput(t) })} keyboardType="numeric" placeholder="0,00" error={errors.valor} />
  );

  return (
    <BottomSheet
      visible={open}
      onClose={onClose}
      title={TITLES[key]}
      subtitle={editing ? 'As mudanças vão direto para a planilha' : 'Grava tudo numa única operação na planilha'}
      footer={<Button label={editing ? 'Salvar alterações' : 'Lançar'} onPress={save} loading={saving} style={{ flex: 1 }} />}
    >
      {kind === 'coletivo' && (
        <>
          <PeoplePicker label="Quem pagou" value={form.payer} onChange={(payer) => set({ payer })} />
          <TextField label="O que foi" value={form.oQue} onChangeText={(oQue) => set({ oQue })} placeholder="Ex.: mercado, gás, produtos de limpeza" error={errors.oQue} />
          {valorField('Valor total')}
          <Card variant="primary" padding="md" style={{ marginBottom: spacing.md }}>
            <View style={styles.rowStart}>
              <Icon name="home-variant-outline" size={18} color="onPrimarySoft" />
              <AppText variant="caption" color="onPrimarySoft" style={{ flex: 1 }}>
                {editing
                  ? 'Gasto da casa: fica em Gastos coletivos e é dividido igualmente entre todos.'
                  : `Vai para Gastos coletivos e é dividido igualmente entre os ${moradores} moradores${total ? ` (${brl(total / Math.max(1, moradores))} cada)` : ''}. Não cria acertos individuais.`}
              </AppText>
            </View>
          </Card>
          {editing && isLinkedToCollective(item.obs) && (
            <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>Os acertos ligados a este gasto são recalculados sozinhos.</AppText>
          )}
          {editing && !!autoObs(item.obs) && <AppText variant="caption" color="textSubtle" style={{ marginBottom: spacing.md }}>{autoObs(item.obs)}</AppText>}
          <TextField label="Observação (opcional)" value={form.obs} onChangeText={(obs) => set({ obs })} placeholder="Onde, nota fiscal, etc." />
        </>
      )}

      {kind === 'divisao' && (
        <>
          <PeoplePicker label="Quem pagou" value={form.payer} onChange={(payer) => set({ payer, devedores: (form.devedores || []).filter((n) => !sameName(n, payer)) })} />
          <TextField label="O que foi" value={form.oQue} onChangeText={(oQue) => set({ oQue })} placeholder="Ex.: pizza, Uber, ingresso" error={errors.oQue} />
          {valorField('Valor total')}
          <PeoplePicker label="Dividir com" value={form.devedores || []} onChange={(devedores) => set({ devedores })} multi exclude={[form.payer]} hint={errors.devedores} />
          <Pressable onPress={() => set({ incluirPagador: !form.incluirPagador })} style={[styles.switchRow, { marginBottom: spacing.md }]} accessibilityRole="switch" accessibilityState={{ checked: !!form.incluirPagador }}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{displayName(form.payer)} também entra na divisão</AppText>
              <AppText variant="caption" color="textMuted">{form.incluirPagador ? 'Ligado: o valor é dividido entre quem pagou e as pessoas marcadas.' : 'Desligado: o valor é dividido só entre as pessoas marcadas.'}</AppText>
            </View>
            <View pointerEvents="none">
              <Switch value={!!form.incluirPagador} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} />
            </View>
          </Pressable>
          {!!shares.length && (
            <Card variant="primary" padding="md" style={{ marginBottom: spacing.md }}>
              <AppText variant="captionStrong" color="onPrimarySoft" style={{ marginBottom: spacing.xs }}>Vai para Acertos individuais assim</AppText>
              {debtors.map((n, i) => (
                <View key={n} style={styles.rowBetween}>
                  <AppText variant="body" color="onPrimarySoft">{displayName(n)} deve a {displayName(form.payer)}</AppText>
                  <AppText variant="bodyStrong" color="onPrimarySoft" tabular>{brl(shares[i])}</AppText>
                </View>
              ))}
              {form.incluirPagador && <AppText variant="caption" color="onPrimarySoft" style={{ marginTop: spacing.xs }}>A parte de {displayName(form.payer)} ({brl(previewShares(total, debtors.length + 1).slice(-1)[0])}) fica com ele.</AppText>}
            </Card>
          )}
          <TextField label="Observação (opcional)" value={form.obs} onChangeText={(obs) => set({ obs })} placeholder="Ex.: pizza de sexta" />
        </>
      )}

      {kind === 'acerto' && !editing && (
        <>
          <PeoplePicker label="Quem emprestou / pagou" value={form.credor} onChange={(credor) => set({ credor, devedores: (form.devedores || []).filter((n) => !sameName(n, credor)) })} />
          <PeoplePicker label="Quem deve" value={form.devedores || []} onChange={(devedores) => set({ devedores })} multi exclude={[form.credor]} hint={errors.devedores || 'Marcou mais de um? O valor é dividido igualmente entre eles.'} />
          {valorField(debtors.length > 1 ? 'Valor total (será dividido)' : 'Valor')}
          {debtors.length > 1 && !!total && (
            <Card variant="primary" padding="md" style={{ marginBottom: spacing.md }}>
              <AppText variant="body" color="onPrimarySoft">Cada um deve {brl(shares[0])} a {displayName(form.credor)}</AppText>
            </Card>
          )}
          <TextField label="Observação (opcional)" value={form.obs} onChangeText={(obs) => set({ obs })} placeholder="Ex.: Uber da festa" />
        </>
      )}

      {kind === 'acerto' && editing && (
        <>
          <PeoplePicker label="Quem deve" value={form.quem} onChange={(quem) => set({ quem })} />
          <PeoplePicker label="Para quem" value={form.paraQuem} onChange={(paraQuem) => set({ paraQuem })} exclude={[form.quem]} hint={errors.quem} />
          {valorField('Valor')}
          <TextField label="Observação" value={form.obs} onChangeText={(obs) => set({ obs })} />
        </>
      )}

      {kind === 'conta' && (
        <>
          <TextField label="Conta" value={form.conta} onChangeText={(conta) => set({ conta })} error={errors.conta} />
          {valorField('Valor')}
          <View style={[styles.row, { gap: spacing.md }]}>
            <TextField label="Vence dia" value={form.vencimento} onChangeText={(t) => set({ vencimento: t.replace(/[^\d]/g, '').slice(0, 2) })} keyboardType="numeric" placeholder="10" error={errors.vencimento} style={{ flex: 1 }} />
            <TextField label="Divisão" value={form.divisao} onChangeText={(divisao) => set({ divisao })} placeholder="Ex.: 5" style={{ flex: 1 }} />
          </View>
          <Pressable onPress={() => set({ status: !form.status })} style={[styles.switchRow, { marginBottom: spacing.md }]} accessibilityRole="switch" accessibilityState={{ checked: !!form.status }}>
            <AppText variant="bodyStrong" style={{ flex: 1 }}>{form.status ? 'Conta paga' : 'Conta pendente'}</AppText>
            <View pointerEvents="none">
              <Switch value={!!form.status} trackColor={{ true: colors.success, false: colors.borderStrong }} thumbColor={colors.surface} />
            </View>
          </Pressable>
          <AppText variant="caption" color="textSubtle">Só as células alteradas são gravadas; fórmulas das outras colunas ficam intactas.</AppText>
        </>
      )}
    </BottomSheet>
  );
}

/** Lista de pessoas como avatares compactos (usada nos itens). */
export function PeopleInline({ names = [] }) {
  return (
    <View style={styles.row}>
      {names.map((n, i) => (
        <Avatar key={n} name={n} size={22} style={{ marginLeft: i ? -6 : 0 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 },
  rowStart: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
});
