import { Platform, StyleSheet, View } from 'react-native';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { useMyTask } from '../data/hooks';
import { useCompleteTask } from '../data/actions';
import { formatWeekdayTime } from '../utils/date';
import { FeedPhoto } from './FeedPhoto';
import { AppText, Button, Card, IconButton, SkeletonCard, StatusPill } from './ui';

/** "Sua tarefa": usada na Home e em Tarefas. O status vem do check gravado no feed (vale para todo mundo, não some ao recarregar). */
export function MyTaskCard({ style }) {
  const { resident } = useResident();
  const { spacing, radius } = useTheme();
  const task = useMyTask(resident);
  const { complete, busy } = useCompleteTask(resident);
  if (task.loading) return <SkeletonCard lines={2} />;
  const t = task.data || {};
  return (
    <Card style={[{ marginBottom: spacing.md }, style]}>
      <View style={styles.rowBetween}>
        <AppText variant="overline" color="textMuted">Sua tarefa da semana</AppText>
        <StatusPill label={t.concluida ? 'Feita' : 'Pendente'} tone={t.concluida ? 'success' : 'warning'} icon={t.concluida ? 'check' : 'clock-outline'} />
      </View>
      <AppText variant="title" style={{ marginTop: spacing.xs }}>{t.tarefaNome || 'Sem tarefa na escala'}</AppText>
      {!!t.descricao && !!t.tarefaNome && <AppText variant="caption" color="textMuted">{t.descricao}</AppText>}
      {t.concluida ? (
        <View style={[styles.row, { marginTop: spacing.md, gap: spacing.md }]}>
          {t.checkHasPhoto && !!t.checkTs && (
            <View style={{ width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden' }}>
              <FeedPhoto ts={t.checkTs} aspectRatio={1} style={{ width: 64, height: 64 }} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" color="success">Concluída {formatWeekdayTime(t.concluidaEm)}</AppText>
            <AppText variant="caption" color="textMuted">A galera já pode avaliar na aba Tarefas.</AppText>
          </View>
        </View>
      ) : t.tarefaNome ? (
        <View style={[styles.row, { marginTop: spacing.md, gap: spacing.sm }]}>
          <Button label="Concluir com foto" icon="camera" onPress={() => complete('camera', t.tarefaNome)} loading={busy} style={{ flex: 1 }} />
          {Platform.OS === 'web' && <IconButton icon="image-outline" variant="primary" onPress={() => complete('library', t.tarefaNome)} disabled={busy} accessibilityLabel="Escolher foto da galeria" size={48} />}
        </View>
      ) : (
        <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>Seu nome não aparece na aba “Painel da Semana” da planilha.</AppText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
