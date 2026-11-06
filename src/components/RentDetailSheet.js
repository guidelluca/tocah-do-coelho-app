import { View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useResident } from '../context/ResidentContext';
import { brl, hasNumber, MASKED, signedBrl, toNumber } from '../utils/money';
import { displayName } from '../utils/text';
import { formatMonthReference } from '../utils/date';
import { AppText, Avatar, BottomSheet, Divider, MoneyText } from './ui';

const LINES = [
  ['Aluguel base', 'aluguel'],
  ['Água', 'agua'],
  ['Luz', 'luz'],
  ['Internet', 'net'],
  ['IPTU', 'iptu'],
  ['Sofá', 'sofa'],
  ['Drywall', 'dryWall'],
  ['Caixinha', 'caixinha'],
];
const EXTRA = [
  ['Multas', 'multas'],
  ['Conta que paga', 'contaQuePaga'],
  ['Dívidas', 'dividas'],
];

/** Extrato do aluguel de um morador (colunas B..O da aba do mês). */
export function RentDetailSheet({ residentRow, sheetTitle, onClose }) {
  const { spacing } = useTheme();
  const { valuesHidden } = useResident();
  const show = (v) => (valuesHidden ? MASKED : brl(v));
  const raw = (v) => String(v ?? '').trim();
  const Line = ({ label, value, tone = 'text', strong }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, minHeight: 40 }}>
      <AppText variant={strong ? 'bodyStrong' : 'body'} color={strong ? 'text' : 'textMuted'} style={{ flex: 1 }}>{label}</AppText>
      <AppText variant={strong ? 'bodyStrong' : 'body'} color={tone} tabular>{value}</AppText>
    </View>
  );
  const r = residentRow || {};
  return (
    <BottomSheet visible={!!residentRow} onClose={onClose} title={`Extrato de ${displayName(r.nome)}`} subtitle={formatMonthReference(sheetTitle)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
        <Avatar name={r.nome} size={48} />
        <View>
          <AppText variant="caption" color="textMuted">Total do mês</AppText>
          <MoneyText value={r.total} variant="title" />
        </View>
      </View>
      {LINES.map(([label, key]) => (
        <Line key={key} label={label} value={hasNumber(r[key]) || !raw(r[key]) ? show(r[key]) : raw(r[key])} />
      ))}
      <Divider />
      <Line label="Subtotal" value={show(r.subtotal)} strong />
      {EXTRA.map(([label, key]) => {
        if (!raw(r[key]) || (!toNumber(r[key]) && hasNumber(r[key]))) return null;
        const value = !hasNumber(r[key]) ? raw(r[key]) : valuesHidden ? MASKED : signedBrl(r[key]);
        return <Line key={key} label={label} value={value} />;
      })}
      <Divider />
      <Line label="Total" value={show(r.total)} strong />
      <AppText variant="caption" color="textSubtle" style={{ marginTop: spacing.sm }}>Valores lidos direto da planilha (aba {sheetTitle}).</AppText>
    </BottomSheet>
  );
}
