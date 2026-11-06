import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { MyTaskCard } from '../components/MyTaskCard';
import { FeedPhoto } from '../components/FeedPhoto';
import { AppText, Avatar, BottomSheet, Button, Card, Divider, EmptyState, Icon, ListRow, PressableScale, ProgressBar, Segmented, SkeletonCard, StatusPill, TextField, useFeedback } from '../components/ui';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { useEscala, useNilde, useRatings } from '../data/hooks';
import { invalidateResources } from '../data/store';
import { rateTask } from '../services/api';
import { useSyncInfo } from '../data/store';
import { formatWeekdayTime, weekRangeLabel } from '../utils/date';
import { displayName, norm, sameName } from '../utils/text';

const isBanheirao = (task) => norm(task).includes('BANHEIR');
const EXPECTED = 4;

function Stars({ value, onChange, size = 36 }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.xs, justifyContent: 'center' }]} accessibilityRole="adjustable" accessibilityLabel={`Nota ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <PressableScale key={n} onPress={() => onChange(n)} accessibilityLabel={`${n} estrela${n > 1 ? 's' : ''}`} scaleTo={0.85} style={styles.star}>
          <Icon name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? 'star' : 'textSubtle'} />
        </PressableScale>
      ))}
    </View>
  );
}

function RatingSheet({ target, onClose }) {
  const { resident } = useResident();
  const { spacing } = useTheme();
  const { toast, toastError } = useFeedback();
  const [nota, setNota] = useState(5);
  const [categoria, setCategoria] = useState('casa');
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const banheirao = target && isBanheirao(target.tarefa);
  const already = target?.rated || {};

  const submit = async () => {
    setSaving(true);
    try {
      await rateTask({ actor: resident, target: target.nome, tarefa: target.tarefa, nota, comentario: comentario.trim(), categoria });
      toast(`Nota enviada para ${displayName(target.nome)}. Ninguém fica sabendo que foi você.`, 'success');
      setComentario('');
      setNota(5);
      onClose();
    } catch (e) {
      toastError(e, 'Não deu para enviar a nota.');
    } finally {
      setSaving(false);
      invalidateResources('ratings', 'feed');
    }
  };

  return (
    <BottomSheet
      visible={!!target}
      onClose={onClose}
      title={target ? `Avaliar ${displayName(target.nome)}` : ''}
      subtitle={target?.tarefa}
      footer={<Button label="Enviar nota" icon="send" onPress={submit} loading={saving} disabled={!!already[categoria]} style={{ flex: 1 }} />}
    >
      {banheirao && (
        <Segmented
          value={categoria}
          onChange={setCategoria}
          options={[{ value: 'casa', label: already.casa ? 'Casa ✓' : 'Casa' }, { value: 'banheirao', label: already.banheirao ? 'Banheirão ✓' : 'Banheirão' }]}
          style={{ marginBottom: spacing.lg }}
        />
      )}
      {already[categoria] ? (
        <EmptyState icon="check-decagram" title="Você já avaliou esta semana" message="Uma nota por categoria por semana." compact />
      ) : (
        <>
          <Stars value={nota} onChange={setNota} />
          <AppText variant="caption" color="textMuted" center style={{ marginVertical: spacing.sm }}>{['', 'Ficou devendo', 'Dá pra melhorar', 'Ok', 'Bem feito', 'Impecável'][nota]}</AppText>
          <TextField label="Comentário (opcional)" value={comentario} onChangeText={setComentario} multiline placeholder="Só o morador avaliado entende o recado 😉" />
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Icon name="incognito" size={18} color="textMuted" />
            <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>A avaliação é anônima no app: aparece como “Avaliador anônimo”.</AppText>
          </View>
        </>
      )}
    </BottomSheet>
  );
}

export function TasksScreen() {
  const navigation = useNavigation();
  const { colors, spacing, radius } = useTheme();
  const { resident } = useResident();
  const escala = useEscala();
  const ratings = useRatings(resident);
  const nilde = useNilde();
  const { serverWeek } = useSyncInfo();
  const [rateTarget, setRateTarget] = useState(null);
  const [photoTs, setPhotoTs] = useState('');

  const list = Array.isArray(escala.data) ? escala.data : [];
  const done = list.filter((x) => x.concluida).length;
  const week = ratings.data?.currentWeek || serverWeek;
  const summary = ratings.data?.ratings || {};
  const ratedByMe = ratings.data?.ratedByMe || {};
  const nildeToday = nilde.data ? Object.keys(nilde.data.log?.[nilde.data.today] || {}).length : null;

  const refresh = () => {
    invalidateResources('feed', 'ratings', 'escala');
    return escala.refresh();
  };

  return (
    <Screen title="Tarefas" subtitle={week ? `Semana de ${weekRangeLabel(week)}` : 'Escala da semana'} onRefresh={refresh}>
      <MyTaskCard />

      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.rowBetween}>
          <AppText variant="heading">A casa nesta semana</AppText>
          <AppText variant="bodyStrong" color="primary" tabular>{done}/{list.length || 5}</AppText>
        </View>
        <ProgressBar value={list.length ? done / list.length : 0} tone="success" style={{ marginTop: spacing.sm, marginBottom: spacing.sm }} />
        {escala.loading && <SkeletonCard lines={3} />}
        {!escala.loading && !list.length && <EmptyState icon="calendar-blank-outline" title="Escala vazia" message="Preencha a aba “Painel da Semana” da planilha." compact />}
        {list.map((item, i) => {
          const me = sameName(item.nome, resident);
          const stat = summary[item.nome] || summary[norm(item.nome)] || {};
          const casa = stat.casa || { total: 0, media: 0 };
          const ban = stat.banheirao || { total: 0, media: 0 };
          const rated = ratedByMe[item.nome] || {};
          const needs = isBanheirao(item.tarefa) ? !(rated.casa && rated.banheirao) : !rated.casa;
          return (
            <View key={`${item.nome}-${i}`}>
              <ListRow
                left={<Avatar name={item.nome} size={44} ring={item.concluida ? 'success' : undefined} />}
                title={me ? `${displayName(item.nome)} (você)` : displayName(item.nome)}
                subtitle={
                  <View style={{ gap: 2 }}>
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>{item.tarefa}</AppText>
                    <View style={[styles.row, { gap: spacing.xs, flexWrap: 'wrap' }]}>
                      <StatusPill label={item.concluida ? `Feita ${formatWeekdayTime(item.concluidaEm)}` : 'Pendente'} tone={item.concluida ? 'success' : 'neutral'} />
                      {casa.total > 0 && <StatusPill icon="star" label={`${casa.media.toFixed(1)} · ${casa.total} de ${EXPECTED}`} tone="warning" />}
                      {isBanheirao(item.tarefa) && ban.total > 0 && <StatusPill icon="shower" label={`${ban.media.toFixed(1)} · ${ban.total} de ${EXPECTED}`} tone="info" />}
                    </View>
                  </View>
                }
                right={
                  <View style={[styles.row, { gap: spacing.xs }]}>
                    {item.concluida && item.checkHasPhoto && (
                      <PressableScale onPress={() => setPhotoTs(item.checkTs)} accessibilityLabel={`Ver foto da tarefa de ${displayName(item.nome)}`} style={[styles.thumbBtn, { borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }]}>
                        <Icon name="image-outline" size={20} color="primary" />
                      </PressableScale>
                    )}
                    {!me && (
                      <Button label={needs ? 'Avaliar' : 'Avaliado'} icon={needs ? 'star-outline' : 'check'} size="sm" variant={needs ? 'secondary' : 'ghost'} onPress={() => setRateTarget({ ...item, rated })} />
                    )}
                  </View>
                }
              />
              {i < list.length - 1 && <Divider />}
            </View>
          );
        })}
      </Card>

      <Card onPress={() => navigation.navigate('Nilde')} variant="primary" accessibilityLabel="Abrir Nilde">
        <View style={[styles.row, { gap: spacing.md }]}>
          <Icon name="rabbit" size={28} color="onPrimarySoft" />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" color="onPrimarySoft">Nilde (todo dia)</AppText>
            <AppText variant="caption" color="onPrimarySoft">{nildeToday === null ? 'Feno à vontade, água fresca e 3 checks por dia.' : `Hoje: ${nildeToday} de 3 refeições registradas`}</AppText>
          </View>
          <Icon name="chevron-right" color="onPrimarySoft" />
        </View>
      </Card>

      <RatingSheet target={rateTarget} onClose={() => setRateTarget(null)} />
      <BottomSheet visible={!!photoTs} onClose={() => setPhotoTs('')} title="Comprovação">
        {!!photoTs && <FeedPhoto ts={photoTs} />}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  star: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  thumbBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
