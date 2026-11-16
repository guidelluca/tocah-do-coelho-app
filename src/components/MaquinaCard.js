import { StyleSheet, View } from 'react-native';
import { AppText, Avatar, Card, Icon } from './ui';
import { useTheme } from '../theme/ThemeContext';
import { useResident } from '../context/ResidentContext';
import { useConfig } from '../data/hooks';
import { displayName, norm, sameName } from '../utils/text';
import { RESIDENTS } from '../constants/residents';

/** Escala da máquina de lavar, de segunda a domingo. Vazio = dia livre. */
export const ESCALA_MAQUINA_PADRAO = ['PANOS', 'GUILHERME', '', 'FELIPE', 'GUSTAVO', 'RAMON', 'ALLAN'];
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/**
 * A escala pode ser trocada pela planilha, sem mexer no app: aba Config, chave "escalaMaquina",
 * valor com os 7 dias de segunda a domingo separados por vírgula (ex.: PANOS,GUILHERME,,FELIPE,GUSTAVO,RAMON,ALLAN).
 */
export function escalaMaquina(config) {
  const raw = config && typeof config.escalaMaquina === 'string' ? config.escalaMaquina : '';
  if (!raw.trim()) return ESCALA_MAQUINA_PADRAO;
  const partes = raw.split(/[,;]/).map((s) => s.trim().toUpperCase());
  return DIAS.map((_, i) => partes[i] || '');
}

/** 0 = segunda … 6 = domingo, no horário de São Paulo. */
export function diaDaSemanaSP(date = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd);
}

const ehMorador = (nome) => RESIDENTS.some((r) => norm(r) === norm(nome));
const rotulo = (nome) => (!nome ? 'Livre' : ehMorador(nome) ? displayName(nome) : nome.charAt(0) + nome.slice(1).toLowerCase());

function Marca({ nome, size }) {
  const { colors } = useTheme();
  if (nome && ehMorador(nome)) return <Avatar name={nome} size={size} />;
  return (
    <View style={[styles.marca, { width: size, height: size, borderRadius: size / 2, backgroundColor: nome ? colors.primarySoft : colors.surfaceAlt }]}>
      <Icon name={nome ? 'washing-machine' : 'calendar-blank-outline'} size={Math.round(size * 0.55)} color={nome ? 'onPrimarySoft' : 'textMuted'} />
    </View>
  );
}

/** Cartão da máquina: hoje em destaque + a semana inteira. `compact` mostra só hoje e amanhã (Início). */
export function MaquinaCard({ compact, onPress, style }) {
  const { colors, spacing, radius } = useTheme();
  const { resident } = useResident();
  const config = useConfig();
  const escala = escalaMaquina(config.data?.config);
  const hoje = diaDaSemanaSP();
  const amanha = (hoje + 1) % 7;
  const deHoje = escala[hoje];
  const minha = resident && sameName(deHoje, resident);
  const meuDia = resident ? escala.findIndex((n) => sameName(n, resident)) : -1;

  const titulo = !deHoje ? 'Máquina livre hoje' : minha ? 'Hoje a máquina é sua' : `Hoje a máquina é ${ehMorador(deHoje) ? 'do ' + displayName(deHoje) : 'dos ' + rotulo(deHoje)}`;

  if (compact) {
    return (
      <Card onPress={onPress} variant={minha ? 'primary' : 'default'} style={[{ marginBottom: spacing.md }, style]} accessibilityLabel="Ver escala da máquina">
        <View style={[styles.row, { gap: spacing.md }]}>
          <Marca nome={deHoje} size={40} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={minha ? 'onPrimarySoft' : 'textMuted'}>Máquina de lavar</AppText>
            <AppText variant="bodyStrong" color={minha ? 'onPrimarySoft' : 'text'}>{titulo}</AppText>
            <AppText variant="caption" color={minha ? 'onPrimarySoft' : 'textMuted'}>Amanhã: {rotulo(escala[amanha])}</AppText>
          </View>
          {!!onPress && <Icon name="chevron-right" color={minha ? 'onPrimarySoft' : 'textMuted'} />}
        </View>
      </Card>
    );
  }

  return (
    <Card style={[{ marginBottom: spacing.md }, style]}>
      <View style={[styles.row, { gap: spacing.md, marginBottom: spacing.md }]}>
        <Icon name="washing-machine" size={28} color="primary" />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">Máquina de lavar</AppText>
          <AppText variant="caption" color="textMuted">
            {titulo}
            {meuDia >= 0 && !minha ? ` · seu dia é ${DIAS[meuDia].toLowerCase()}` : ''}
          </AppText>
        </View>
      </View>
      {escala.map((nome, i) => {
        const ehHoje = i === hoje;
        const eu = resident && sameName(nome, resident);
        return (
          <View
            key={DIAS[i]}
            style={[
              styles.row,
              { gap: spacing.md, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm, borderRadius: radius.md },
              ehHoje && { backgroundColor: colors.primarySoft },
            ]}
            accessibilityLabel={`${DIAS[i]}: ${rotulo(nome)}${ehHoje ? ', hoje' : ''}`}
          >
            <AppText variant="bodyStrong" color={ehHoje ? 'onPrimarySoft' : 'textMuted'} style={{ width: 40 }}>{DIAS_CURTOS[i]}</AppText>
            <Marca nome={nome} size={28} />
            <AppText variant={eu || ehHoje ? 'bodyStrong' : 'body'} color={ehHoje ? 'onPrimarySoft' : nome ? 'text' : 'textMuted'} style={{ flex: 1 }}>
              {rotulo(nome)}{eu ? ' (você)' : ''}
            </AppText>
            {ehHoje && <AppText variant="caption" color="onPrimarySoft">hoje</AppText>}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  marca: { alignItems: 'center', justifyContent: 'center' },
});
