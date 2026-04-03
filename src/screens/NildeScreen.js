import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { AppHeader } from '../components/AppHeader';
import { useResident } from '../context/ResidentContext';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { addTaskFeedComment } from '../services/api';

const STORAGE_KEY = '@tocah_nilde_feed_log_v2';
const NILDE_HERO_IMAGE_URLS = [
  'https://drive.google.com/uc?export=download&id=1O5j25VTPPB96BqSHmXULim99qmc2tfuH',
  'https://drive.google.com/uc?export=view&id=1O5j25VTPPB96BqSHmXULim99qmc2tfuH',
  'https://drive.google.com/thumbnail?id=1O5j25VTPPB96BqSHmXULim99qmc2tfuH&sz=w1600',
];
const SLOT_DEFS = [
  { id: 'manha_feno', label: 'Manha - Feno', icon: 'weather-sunset-up' },
  { id: 'tarde_feno', label: 'Tarde - Feno', icon: 'weather-sunny' },
  { id: 'noite_racao', label: 'Noite - Racao', icon: 'weather-night' },
];
const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoDateLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + delta);
  return d;
}

function getWeekMeta(now = new Date()) {
  const monday = getMonday(now);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekId = `${isoDateLocal(monday)}_to_${isoDateLocal(sunday)}`;
  return { weekId, monday, sunday };
}

function parseWeekId(weekId = '') {
  const [start] = String(weekId).split('_to_');
  if (!start) return null;
  const [y, m, d] = start.split('-').map(Number);
  if (!y || !m || !d) return null;
  const monday = new Date(y, m - 1, d);
  if (Number.isNaN(monday.getTime())) return null;
  return { monday };
}

function buildWeekDays(weekId) {
  const parsed = parseWeekId(weekId);
  if (!parsed) return [];
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const dt = new Date(parsed.monday);
    dt.setDate(parsed.monday.getDate() + i);
    days.push({ key: isoDateLocal(dt), label: WEEK_DAYS[i] });
  }
  return days;
}

export function NildeScreen() {
  const { resident } = useResident();
  const { isDark } = useThemeMode();
  const colors = isDark ? darkTheme : lightTheme;
  const [refreshing, setRefreshing] = useState(false);
  const [store, setStore] = useState({});
  const [proofVisible, setProofVisible] = useState(false);
  const [proofTarget, setProofTarget] = useState(null);
  const [proofComment, setProofComment] = useState('');
  const [proofSending, setProofSending] = useState(false);
  const [nildeImageIdx, setNildeImageIdx] = useState(0);

  const { weekId } = useMemo(() => getWeekMeta(new Date()), []);
  const weekDays = useMemo(() => buildWeekDays(weekId), [weekId]);
  const today = isoDateLocal(new Date());
  const weekLog = store[weekId] || {};
  const todayLog = weekLog[today] || {};
  const totalWeekSlots = 21;

  const doneWeekCount = useMemo(() => {
    let count = 0;
    weekDays.forEach((d) => {
      const dayLog = weekLog[d.key] || {};
      SLOT_DEFS.forEach((slot) => {
        if (dayLog[slot.id]?.by) count += 1;
      });
    });
    return count;
  }, [weekDays, weekLog]);
  const progressPct = Math.round((doneWeekCount / totalWeekSlots) * 100);
  const todayDoneCount = SLOT_DEFS.filter((slot) => !!todayLog[slot.id]?.by).length;

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const safe = parsed && typeof parsed === 'object' ? parsed : {};
      const filtered = Object.fromEntries(Object.entries(safe).filter(([k]) => k === weekId));
      setStore(filtered);
    } catch {
      setStore({});
    }
  }, [weekId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async (next) => {
    setStore(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const openProofFlow = (dayKey, slotId) => {
    const already = weekLog?.[dayKey]?.[slotId];
    if (already?.by) {
      Alert.alert('Já registrado', `${SLOT_DEFS.find((x) => x.id === slotId)?.label || 'Slot'} já foi marcado por ${already.by}.`);
      return;
    }
    setProofTarget({ dayKey, slotId });
    setProofComment('');
    setProofVisible(true);
  };

  const onCheckSlot = async (dayKey, slotId, comment = '') => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita o uso da câmera para comprovar a alimentação da Nilde.');
      return;
    }
    const capture = await ImagePicker.launchCameraAsync({
      quality: 0.25,
      allowsEditing: true,
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (capture.canceled || !capture.assets?.[0]?.base64) {
      Alert.alert('Foto obrigatória', 'Para marcar o check, é obrigatório enviar a foto de comprovação.');
      return;
    }
    const photoDataUrl = `data:image/jpeg;base64,${capture.assets[0].base64}`;
    const slotLabel = SLOT_DEFS.find((s) => s.id === slotId)?.label || slotId;
    const content = comment?.trim()
      ? `Nilde • ${slotLabel} • ${comment.trim()}`
      : `Nilde • ${slotLabel} • alimentação registrada`;

    setProofSending(true);
    const next = {
      ...store,
      [weekId]: {
        ...weekLog,
        [dayKey]: {
          ...(weekLog[dayKey] || {}),
          [slotId]: { by: resident, at: new Date().toISOString() },
        },
      },
    };
    try {
      await addTaskFeedComment({
        actor: resident,
        content,
        target: 'NILDE',
        tarefa: slotLabel,
        photoDataUrl,
      });
      await save(next);
      setProofVisible(false);
      setProofTarget(null);
      setProofComment('');
      Alert.alert('Check registrado', 'Comprovação enviada para o Feed.');
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Não foi possível enviar comprovação.');
    } finally {
      setProofSending(false);
    }
  };

  const onUndoSlot = async (dayKey, slotId) => {
    const current = weekLog?.[dayKey]?.[slotId];
    if (!current?.by) return;
    if (String(current.by).toUpperCase() !== String(resident).toUpperCase()) {
      Alert.alert('Sem permissão', `Esse check foi feito por ${current.by}. Apenas quem marcou pode desfazer.`);
      return;
    }
    const dayNext = { ...(weekLog[dayKey] || {}) };
    delete dayNext[slotId];
    const next = {
      ...store,
      [weekId]: {
        ...weekLog,
        [dayKey]: dayNext,
      },
    };
    await save(next);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <AppHeader title="Nilde" subtitle="Controle Semanal de Alimentação" />

      <View style={[styles.nildePhotoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Image
          source={{ uri: NILDE_HERO_IMAGE_URLS[Math.min(nildeImageIdx, NILDE_HERO_IMAGE_URLS.length - 1)] }}
          style={styles.nildePhoto}
          resizeMode="cover"
          onError={() => {
            setNildeImageIdx((prev) => (prev < NILDE_HERO_IMAGE_URLS.length - 1 ? prev + 1 : prev));
          }}
        />
        <View style={styles.nildePhotoOverlay}>
          <Text style={styles.nildePhotoTitle}>Nilde</Text>
          <Text style={styles.nildePhotoSubtitle}>Mascote da república</Text>
        </View>
      </View>

      <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.heroHead}>
          <View style={styles.heroTitleWrap}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="rabbit" size={16} color="#7c3aed" />
            </View>
            <Text style={[styles.title, { color: colors.text, marginBottom: 2 }]}>Semana Atual</Text>
            <Text style={[styles.helper, { color: colors.muted }]}>3 checks por dia • reset semanal</Text>
          </View>
          <View style={[styles.progressBadge, { backgroundColor: isDark ? '#222438' : '#ede9fe' }]}>
            <Text style={styles.progressBadgeText}>{progressPct}%</Text>
          </View>
        </View>
        <Text style={[styles.kpi, { color: colors.primary }]}>{doneWeekCount}/{totalWeekSlots} checks concluídos</Text>
        <View style={[styles.progressTrack, { backgroundColor: isDark ? '#2b2f3f' : '#ede9fe' }]}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <MaterialCommunityIcons name="calendar-today" size={14} color="#6a1b9a" />
            <Text style={[styles.title, { color: colors.text, marginBottom: 0 }]}>Hoje ({today})</Text>
          </View>
          <View style={[styles.todayPill, { backgroundColor: isDark ? '#1f3a2f' : '#e8f5e9' }]}>
            <Text style={styles.todayPillText}>{todayDoneCount}/3</Text>
          </View>
        </View>
        {SLOT_DEFS.map((slot) => {
          const entry = todayLog[slot.id];
          const done = !!entry?.by;
          const doneByMe = String(entry?.by || '').toUpperCase() === String(resident).toUpperCase();
          return (
            <View key={slot.id} style={[styles.slotRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <View style={styles.slotBadgeRow}>
                  <View style={[styles.slotTypeChip, slot.id.includes('feno') ? styles.slotTypeFeno : styles.slotTypeRacao]}>
                    <Text style={styles.slotTypeChipText}>{slot.id.includes('feno') ? 'FENO' : 'RACAO'}</Text>
                  </View>
                </View>
                <Text style={[styles.slotTitle, { color: colors.text }]}>{slot.label}</Text>
                <Text style={[styles.slotMeta, { color: colors.muted }]}>{done ? `Feito por ${entry.by}` : 'Pendente'}</Text>
              </View>
              <Pressable
                style={[styles.slotBtn, done ? styles.slotBtnDone : styles.slotBtnPending]}
                onPress={() => (done && doneByMe ? onUndoSlot(today, slot.id) : openProofFlow(today, slot.id))}
              >
                <MaterialCommunityIcons name={done ? 'check' : slot.icon} size={16} color="#fff" />
                <Text style={styles.slotBtnText}>{done && doneByMe ? 'Desfazer' : done ? 'Feito' : 'Marcar'}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionTitleRow}>
          <MaterialCommunityIcons name="view-week-outline" size={16} color="#6a1b9a" />
          <Text style={[styles.title, { color: colors.text }]}>Visão da Semana</Text>
        </View>
        {weekDays.map((day) => {
          const dayLog = weekLog[day.key] || {};
          const done = SLOT_DEFS.filter((slot) => !!dayLog[slot.id]?.by).length;
          return (
            <View key={day.key} style={styles.weekRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.weekDay, { color: colors.text }]}>{day.label} ({day.key})</Text>
                <View style={styles.weekDotsRow}>
                  {SLOT_DEFS.map((slot) => {
                    const ok = !!dayLog[slot.id]?.by;
                    return <View key={`${day.key}-${slot.id}`} style={[styles.weekDot, ok ? styles.weekDotOn : styles.weekDotOff]} />;
                  })}
                </View>
              </View>
              <Text style={[styles.weekMeta, { color: colors.muted }]}>{done}/3</Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.card, styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionTitleRow}>
          <MaterialCommunityIcons name="heart-pulse" size={16} color="#6a1b9a" />
          <Text style={[styles.title, { color: colors.text }]}>Alimentação Ideal</Text>
        </View>
        <Text style={[styles.bullet, { color: colors.text }]}>- Feno: 80% a 90% da dieta, ilimitado 24h.</Text>
        <Text style={[styles.bullet, { color: colors.text }]}>- Verduras escuras diariamente (rucula, escarola, chicoria, manjericao; couve com moderacao).</Text>
        <Text style={[styles.bullet, { color: colors.text }]}>- Ração (pellets): porção controlada, referência de 20g a 30g por kg/dia para adulto.</Text>
        <Text style={[styles.bullet, { color: colors.text }]}>- Frutas e cenoura: apenas petisco ocasional.</Text>
        <Text style={[styles.bullet, { color: colors.text }]}>- Agua: sempre fresca e limpa.</Text>
      </View>

      <View style={[styles.card, styles.warnCard, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}>
        <View style={styles.sectionTitleRow}>
          <MaterialCommunityIcons name="alert-circle" size={16} color="#be123c" />
        <Text style={[styles.title, { color: '#be123c' }]}>Não pode comer (tóxico/proibido)</Text>
        </View>
        <Text style={styles.warnBullet}>- Batata, mandioca, cara, inhame</Text>
        <Text style={styles.warnBullet}>- Cebola e alho</Text>
        <Text style={styles.warnBullet}>- Berinjela</Text>
        <Text style={styles.warnBullet}>- Feijao, milho, ervilha, grao-de-bico</Text>
        <Text style={styles.warnBullet}>- Pao, biscoitos, massas, doces, chocolate</Text>
        <Text style={styles.warnBullet}>- Laticinios</Text>
        <Text style={styles.warnBullet}>- Alface-americana e abacate</Text>
      </View>

      <Modal visible={proofVisible} transparent animationType="slide" onRequestClose={() => setProofVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.title, { color: colors.text, marginBottom: 4 }]}>Comprovar alimentação</Text>
            <Text style={[styles.helper, { color: colors.muted }]}>
              {SLOT_DEFS.find((s) => s.id === proofTarget?.slotId)?.label || '-'} • foto obrigatória
            </Text>
            <TextInput
              value={proofComment}
              onChangeText={setProofComment}
              placeholder="Comentário opcional"
              placeholderTextColor="#94a3b8"
              style={styles.modalInput}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setProofVisible(false)} disabled={proofSending}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, proofSending && { opacity: 0.75 }]}
                onPress={() => onCheckSlot(proofTarget?.dayKey, proofTarget?.slotId, proofComment)}
                disabled={proofSending}
              >
                {proofSending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmBtnText}>Tirar foto e confirmar</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 26 },
  card: { borderRadius: 18, borderWidth: 1, padding: 13, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  nildePhotoCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  nildePhoto: { width: '100%', height: 180 },
  nildePhotoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  nildePhotoTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  nildePhotoSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 11, marginTop: 2, fontWeight: '600' },
  heroCard: { borderRadius: 20, borderWidth: 1.5, padding: 14, shadowColor: '#6a1b9a', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  heroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center' },
  progressBadge: { minWidth: 56, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  progressBadgeText: { color: '#5b21b6', fontSize: 12, fontWeight: '900' },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  helper: { fontSize: 12, fontWeight: '600' },
  kpi: { fontSize: 15, fontWeight: '900', marginTop: 6 },
  progressTrack: { height: 8, borderRadius: 999, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#7c3aed' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  todayPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  todayPillText: { color: '#166534', fontWeight: '900', fontSize: 11 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  slotBadgeRow: { marginBottom: 3 },
  slotTypeChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  slotTypeFeno: { backgroundColor: '#dcfce7' },
  slotTypeRacao: { backgroundColor: '#fee2e2' },
  slotTypeChipText: { fontSize: 9, fontWeight: '900', color: '#374151', letterSpacing: 0.4 },
  slotTitle: { fontSize: 13, fontWeight: '800' },
  slotMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  slotBtn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  slotBtnPending: { backgroundColor: '#6a1b9a' },
  slotBtnDone: { backgroundColor: '#16a34a' },
  slotBtnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  weekDay: { fontSize: 12, fontWeight: '800' },
  weekDotsRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  weekDot: { width: 8, height: 8, borderRadius: 4 },
  weekDotOn: { backgroundColor: '#16a34a' },
  weekDotOff: { backgroundColor: '#d1d5db' },
  weekMeta: { fontSize: 11, fontWeight: '700' },
  infoCard: { borderLeftWidth: 4, borderLeftColor: '#7c3aed' },
  warnCard: { borderLeftWidth: 4, borderLeftColor: '#e11d48' },
  bullet: { fontSize: 12, lineHeight: 18, fontWeight: '600', marginBottom: 3 },
  warnBullet: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: '#9f1239', marginBottom: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 26 },
  modalInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, marginBottom: 12, color: '#111827', fontWeight: '600', minHeight: 60, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', paddingVertical: 11, alignItems: 'center', backgroundColor: '#fff' },
  cancelBtnText: { color: '#6b7280', fontWeight: '700' },
  confirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6a1b9a' },
  confirmBtnText: { color: '#fff', fontWeight: '800' },
});
