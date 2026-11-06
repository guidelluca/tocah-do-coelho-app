import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Screen } from '../components/Screen';
import { RemoteImage, NILDE_SOURCES } from '../components/RemoteImage';
import { AppText, Avatar, BottomSheet, Button, Card, Icon, PressableScale, ProgressBar, SectionHeader, SkeletonCard, TextField, useFeedback } from '../components/ui';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { useNilde } from '../data/hooks';
import { invalidateResources, mutateResource } from '../data/store';
import { checkNilde, deleteTaskFeedPost } from '../services/api';
import { dayOfMonth, formatLongDay, formatTime, shortWeekday } from '../utils/date';
import { pickPhoto } from '../utils/photo';
import { displayName, sameName } from '../utils/text';

const LOCAL_FALLBACK = require('../../assets/icon.png');

const DEFAULT_SLOTS = [
  { id: 'manha_feno', label: 'Manhã - Feno', short: 'Manhã', food: 'Feno', icon: 'weather-sunset-up' },
  { id: 'tarde_feno', label: 'Tarde - Feno', short: 'Tarde', food: 'Feno', icon: 'weather-sunny' },
  { id: 'noite_racao', label: 'Noite - Ração', short: 'Noite', food: 'Ração', icon: 'weather-night' },
];

const GUIDE = [
  { icon: 'grass', title: 'Feno livre 24h', text: 'Base da dieta (80% a 90%).' },
  { icon: 'leaf', title: 'Verduras diárias', text: 'Rúcula, escarola, chicória e manjericão.' },
  { icon: 'scale-balance', title: 'Ração controlada', text: '20 g a 30 g por kg por dia (adulto).' },
  { icon: 'water-outline', title: 'Água sempre fresca', text: 'Trocar e higienizar o bebedouro com frequência.' },
];
const FORBIDDEN = ['Batata, mandioca, cará e inhame', 'Cebola e alho', 'Berinjela', 'Feijão, milho, ervilha e grão-de-bico', 'Pão, massas, doces e chocolate', 'Laticínios', 'Alface-americana e abacate'];

export function NildeScreen() {
  const { resident } = useResident();
  const { colors, spacing, radius } = useTheme();
  const { toast, toastError, confirm } = useFeedback();
  const nilde = useNilde();
  const [target, setTarget] = useState(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);

  const data = nilde.data || {};
  const slots = data.slots?.length ? data.slots : DEFAULT_SLOTS;
  const days = (data.days || []).map((d) => d.date);
  const log = data.log || {};
  const today = data.today;
  const todayLog = log[today] || {};
  const doneWeek = days.reduce((acc, d) => acc + Object.keys(log[d] || {}).length, 0);
  const fullDays = days.filter((d) => Object.keys(log[d] || {}).length >= 3).length;
  const todayDone = Object.keys(todayLog).length;

  const send = async (withPhoto) => {
    let photo = '';
    if (withPhoto) {
      try {
        photo = await pickPhoto({ source: withPhoto, size: 'proof' });
      } catch (e) {
        toastError(e);
        return;
      }
      if (!photo) return;
    }
    const slot = target;
    setSending(withPhoto ? 'photo' : 'plain');
    try {
      const res = await checkNilde({ actor: resident, slotId: slot.id, comment: comment.trim(), photoDataUrl: photo });
      mutateResource('nilde', (prev) => prev && { ...prev, log: { ...prev.log, [today]: { ...(prev.log?.[today] || {}), [slot.id]: { by: resident, at: res?.ts || new Date().toISOString(), ts: res?.ts } } } });
      toast(`${slot.short}: Nilde alimentada! 🐰`, 'success');
      setTarget(null);
      setComment('');
    } catch (e) {
      toastError(e, 'Não deu para registrar.');
      if (e?.code === 'ALREADY_CHECKED') setTarget(null);
    } finally {
      setSending('');
      invalidateResources('feed');
    }
  };

  const undo = async (slot, entry) => {
    const ok = await confirm({ title: `Desfazer ${slot.short.toLowerCase()}?`, message: 'O post da Nilde no feed também é apagado.', confirmLabel: 'Desfazer', destructive: true });
    if (!ok) return;
    mutateResource('nilde', (prev) => {
      if (!prev) return prev;
      const day = { ...(prev.log?.[today] || {}) };
      delete day[slot.id];
      return { ...prev, log: { ...prev.log, [today]: day } };
    });
    try {
      await deleteTaskFeedPost({ ts: entry.ts, requester: resident });
      toast('Check desfeito.', 'success');
    } catch (e) {
      toastError(e);
    } finally {
      invalidateResources('feed');
    }
  };

  return (
    <Screen title="Nilde" subtitle="Nilde" onRefresh={() => { invalidateResources('feed'); return nilde.refresh(); }}>
      <View style={[styles.hero, { borderRadius: radius.lg, marginBottom: spacing.md }]}>
        <RemoteImage sources={NILDE_SOURCES} fallback={LOCAL_FALLBACK} style={StyleSheet.absoluteFill} accessibilityLabel="Foto da Nilde" />
        <View style={[styles.heroOverlay, { backgroundColor: colors.imageScrim, padding: spacing.lg }]}>
          <AppText variant="overline" color="onImage">Hoje</AppText>
          <AppText variant="title" color="onImage">{today ? formatLongDay(today) : '…'}</AppText>
          <AppText variant="caption" color="onImage">{todayDone === 3 ? 'Tudo certo por hoje. Barriguinha cheia!' : `${todayDone} de 3 refeições registradas`}</AppText>
        </View>
      </View>

      {nilde.loading ? (
        <SkeletonCard lines={4} />
      ) : (
        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          {slots.map((slot) => {
            const entry = todayLog[slot.id];
            const mine = entry && sameName(entry.by, resident);
            return (
              <Card key={slot.id} variant={entry ? 'success' : 'default'} padding="md">
                <View style={[styles.row, { gap: spacing.md }]}>
                  {entry ? (
                    <View>
                      <Avatar name={entry.by} size={44} ring="success" />
                      <View style={[styles.checkBadge, { backgroundColor: colors.success, borderColor: colors.surface }]}>
                        <Icon name="check" size={12} color="onSuccess" />
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.slotIcon, { backgroundColor: colors.primarySoft }]}>
                      <Icon name={slot.icon} size={24} color="primary" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" color={entry ? 'onSuccessSoft' : 'text'}>{slot.short} · {slot.food}</AppText>
                    <AppText variant="caption" color={entry ? 'onSuccessSoft' : 'textMuted'}>
                      {entry ? `${mine ? 'Você' : displayName(entry.by)} deu às ${formatTime(entry.at)}` : 'Ninguém marcou ainda'}
                    </AppText>
                  </View>
                  {!entry && <Button label="Marcar" size="sm" onPress={() => setTarget(slot)} />}
                  {mine && <Button label="Desfazer" size="sm" variant="ghost" onPress={() => undo(slot, entry)} />}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <SectionHeader title="Semana" subtitle={`${doneWeek} de 21 refeições · ${fullDays} dia(s) completos`} />
      <Card padding="md">
        <ProgressBar value={doneWeek / 21} style={{ marginBottom: spacing.md }} />
        <View style={styles.week}>
          {days.map((d) => {
            const isToday = d === today;
            const isFuture = today && d > today;
            return (
              <View key={d} style={[styles.day, { borderRadius: radius.md, backgroundColor: isToday ? colors.primarySoft : 'transparent', paddingVertical: spacing.sm }]} accessibilityLabel={`${formatLongDay(d)}: ${Object.keys(log[d] || {}).length} de 3`}>
                <AppText variant="caption" color={isToday ? 'onPrimarySoft' : 'textMuted'}>{shortWeekday(d)}</AppText>
                <AppText variant="bodyStrong" color={isToday ? 'onPrimarySoft' : 'text'}>{dayOfMonth(d)}</AppText>
                <View style={{ gap: 3, marginTop: 4 }}>
                  {slots.map((s) => {
                    const ok = !!log[d]?.[s.id];
                    return <View key={s.id} style={[styles.dot, { backgroundColor: ok ? colors.success : isFuture ? colors.surfaceSunken : colors.borderStrong }]} />;
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <PressableScale onPress={() => setGuideOpen((v) => !v)} accessibilityLabel="Guia de alimentação" style={[styles.rowBetween, { marginTop: spacing.lg, minHeight: 48 }]}>
        <AppText variant="heading">Guia de alimentação</AppText>
        <Icon name={guideOpen ? 'chevron-up' : 'chevron-down'} color="textMuted" />
      </PressableScale>
      {guideOpen && (
        <View style={{ gap: spacing.sm }}>
          {GUIDE.map((g) => (
            <Card key={g.title} padding="md" variant="flat">
              <View style={[styles.row, { gap: spacing.md }]}>
                <Icon name={g.icon} size={22} color="success" />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{g.title}</AppText>
                  <AppText variant="caption" color="textMuted">{g.text}</AppText>
                </View>
              </View>
            </Card>
          ))}
          <AppText variant="caption" color="textMuted">Frutas e cenoura: só como petisco de vez em quando.</AppText>
          <Card variant="danger" padding="md" style={{ marginTop: spacing.sm }}>
            <AppText variant="bodyStrong" color="onDangerSoft" style={{ marginBottom: spacing.sm }}>Não pode comer</AppText>
            <View style={[styles.wrap, { gap: spacing.xs }]}>
              {FORBIDDEN.map((f) => (
                <View key={f} style={[styles.forbidden, { backgroundColor: colors.surface, borderRadius: radius.pill }]}>
                  <Icon name="close-circle-outline" size={14} color="danger" />
                  <AppText variant="caption" color="onDangerSoft">{f}</AppText>
                </View>
              ))}
            </View>
            <AppText variant="caption" color="onDangerSoft" style={{ marginTop: spacing.sm }}>Comeu sem querer? Procure orientação veterinária na hora.</AppText>
          </Card>
        </View>
      )}

      <BottomSheet
        visible={!!target}
        onClose={() => setTarget(null)}
        title={target ? `${target.short} · ${target.food}` : ''}
        subtitle="Registra no app e posta no feed para todo mundo ver"
        footer={
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Button label="Confirmar" icon="check" onPress={() => send(false)} loading={sending === 'plain'} disabled={!!sending} full />
            <View style={[styles.row, { gap: spacing.sm }]}>
              <Button label="Com foto" icon="camera-outline" variant="secondary" onPress={() => send('camera')} loading={sending === 'photo'} disabled={!!sending} style={{ flex: 1 }} />
              {Platform.OS === 'web' && <Button label="Da galeria" icon="image-outline" variant="secondary" onPress={() => send('library')} disabled={!!sending} style={{ flex: 1 }} />}
            </View>
          </View>
        }
      >
        <TextField label="Comentário (opcional)" value={comment} onChangeText={setComment} placeholder="Ex.: comeu tudo, deixei verdura também" />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 190, overflow: 'hidden', justifyContent: 'flex-end' },
  heroOverlay: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  slotIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  checkBadge: { position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { flex: 1, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  forbidden: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
});
