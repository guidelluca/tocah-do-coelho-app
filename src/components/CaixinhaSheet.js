import { useState } from 'react';
import { View } from 'react-native';
import { addCaixinhaEntry, getCaixinhaStatement, queryFor } from '../services/api';
import { invalidateResources, useResource } from '../data/store';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { formatMoneyInput, toNumber, toSheetMoney } from '../utils/money';
import { AppText, BottomSheet, Button, Divider, EmptyState, Icon, MoneyText, Segmented, SkeletonCard, TextField, useFeedback } from './ui';

export function CaixinhaSheet({ visible, onClose, saldo }) {
  const { spacing, colors, radius } = useTheme();
  const { resident } = useResident();
  const { toast, toastError } = useFeedback();
  const statement = useResource('caixinhaStatement', getCaixinhaStatement, { resources: ['caixinha'], cacheQuery: queryFor('getCaixinhaStatement'), enabled: visible });
  const [mode, setMode] = useState('extrato');
  const [tipo, setTipo] = useState('entrada');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async () => {
    const nextErrors = {};
    if (!descricao.trim()) nextErrors.descricao = 'Diga o que foi.';
    if (!toNumber(valor)) nextErrors.valor = 'Informe o valor.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      await addCaixinhaEntry({ tipo, descricao: descricao.trim(), valor: toSheetMoney(valor), obs: obs.trim(), autor: resident });
      toast(tipo === 'saida' ? 'Saída registrada na caixinha.' : 'Entrada registrada na caixinha.', 'success');
      setDescricao('');
      setValor('');
      setObs('');
      setMode('extrato');
      invalidateResources('caixinha');
    } catch (e) {
      toastError(e, 'Não deu para salvar na caixinha.');
    } finally {
      setSaving(false);
    }
  };

  const items = statement.data?.items || [];
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Caixinha"
      subtitle="Dinheiro comum da casa"
      footer={mode === 'novo' ? <Button label={tipo === 'saida' ? 'Registrar saída' : 'Registrar entrada'} onPress={submit} loading={saving} full style={{ flex: 1 }} /> : <Button label="Nova movimentação" icon="plus" onPress={() => setMode('novo')} full style={{ flex: 1 }} />}
    >
      <View style={{ backgroundColor: colors.successSoft, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md }}>
        <AppText variant="overline" color="onSuccessSoft">Saldo atual</AppText>
        <MoneyText value={saldo} variant="display" color="onSuccessSoft" />
      </View>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'extrato', label: 'Extrato' }, { value: 'novo', label: 'Nova movimentação' }]} style={{ marginBottom: spacing.md }} />
      {mode === 'novo' ? (
        <View>
          <Segmented value={tipo} onChange={setTipo} options={[{ value: 'entrada', label: 'Entrada' }, { value: 'saida', label: 'Saída' }]} style={{ marginBottom: spacing.md }} />
          <TextField label="Descrição" value={descricao} onChangeText={setDescricao} placeholder={tipo === 'saida' ? 'Ex.: papel higiênico' : 'Ex.: entrada mensal'} error={errors.descricao} />
          <TextField label="Valor" prefix="R$" value={valor} onChangeText={(t) => setValor(formatMoneyInput(t))} keyboardType="numeric" placeholder="0,00" error={errors.valor} />
          <TextField label="Observação (opcional)" value={obs} onChangeText={setObs} placeholder="Onde comprou, etc." hint={`Fica registrado como lançado por ${resident}.`} />
        </View>
      ) : statement.loading ? (
        <SkeletonCard lines={4} />
      ) : !items.length ? (
        <EmptyState icon="piggy-bank-outline" title="Nada no extrato ainda" compact />
      ) : (
        items.slice(0, 40).map((item, i) => {
          const out = item.tipo === 'saida';
          return (
            <View key={`${item.rowIndex}-${i}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 52 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: out ? colors.dangerSoft : colors.successSoft }}>
                  <Icon name={out ? 'arrow-up' : 'arrow-down'} size={18} color={out ? 'danger' : 'success'} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{item.descricao}</AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>{[item.data, item.obs].filter(Boolean).join(' • ')}</AppText>
                </View>
                <MoneyText value={item.valor} signed color={out ? 'danger' : 'success'} />
              </View>
              {i < items.length - 1 && <Divider />}
            </View>
          );
        })
      )}
    </BottomSheet>
  );
}
