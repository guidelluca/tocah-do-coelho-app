import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { concluirTarefa, getEscalaSemana, getTaskRatings, rateTask } from '../services/api';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { AppHeader } from '../components/AppHeader';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useResident } from '../context/ResidentContext';
const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images || 'images';
const getAvatarInitial = (value) => {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return '•';
  return cleaned.slice(0, 1).toUpperCase();
};

export function TasksScreen() {
  const { isDark } = useThemeMode();
  const { resident, getResidentPhoto } = useResident();
  const colors = isDark ? darkTheme : lightTheme;
  const [escala, setEscala] = useState([]);
  const [checked, setChecked] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState({});
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [nota, setNota] = useState(5);
  const [comentario, setComentario] = useState('');
  const [categoriaNota, setCategoriaNota] = useState('casa');
  const [ratingSaving, setRatingSaving] = useState(false);
  const completedCount = Object.values(checked).filter(Boolean).length;
  const hasBanheirao = (taskName) => String(taskName || '').toLowerCase().includes('banheir');
  const takeTaskProofPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita o uso da câmera para comprovar a tarefa.');
      return '';
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.25,
      allowsEditing: true,
      base64: true,
      mediaTypes: IMAGE_MEDIA_TYPES,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return '';
    return `data:image/jpeg;base64,${result.assets[0].base64}`;
  };

  const load = useCallback(async (mode = 'normal') => {
    if (mode === 'pull') setRefreshing(true);
    else if (mode === 'normal') setLoading(true);
    try {
      const [escalaRes, ratingsRes] = await Promise.allSettled([
        getEscalaSemana(),
        getTaskRatings(),
      ]);

      if (escalaRes.status === 'fulfilled') {
        setEscala(Array.isArray(escalaRes.value) ? escalaRes.value : []);
      } else {
        setEscala([]);
      }

      setRatings(ratingsRes.status === 'fulfilled' ? (ratingsRes.value?.ratings || {}) : {});

      const hardFail = escalaRes.status === 'rejected';
      const partialFail = ratingsRes.status === 'rejected';
      setError(hardFail ? 'Nao foi possivel carregar tarefas.' : partialFail ? 'Parte social indisponivel no momento.' : '');
    } catch (e) {
      setError(e?.message || 'Nao foi possivel carregar tarefas.');
    } finally {
      if (mode === 'normal') setLoading(false);
      if (mode === 'pull') setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load('silent');
      const timer = setInterval(() => {
        load('silent');
      }, 7000);
      return () => clearInterval(timer);
    }, [load])
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
    >
      <AppHeader title="Tarefas" subtitle={`Feed semanal • ${resident}`} />
      <View style={[styles.card, { backgroundColor: '#fff8e1', borderColor: '#ffe0b2', borderLeftWidth: 5, borderLeftColor: '#ff9800' }]}>
        <Text style={[styles.title, { color: '#e65100' }]}>Mascote Nilde (Diário)</Text>
        <Text style={[styles.text, { color: '#5f4339' }]}>Feno à vontade, água fresca e check diário de alimentação.</Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.title, { color: colors.text }]}>Tarefas da Semana</Text>
          <View style={[styles.progressPill, { backgroundColor: isDark ? '#1b4332' : '#e8f5e9' }]}>
            <Text style={[styles.progressText, { color: '#2e7d32' }]}>{completedCount} feitas</Text>
          </View>
        </View>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
        {!!error && !loading && <Text style={[styles.error, { color: '#ef4444' }]}>{error}</Text>}
        {!loading && escala.map((item, idx) => {
          const done = !!checked[idx];
          const stat = ratings[item.nome] || {};
          const casaStat = stat?.casa || { media: 0, total: 0 };
          const banheiraoStat = stat?.banheirao || { media: 0, total: 0 };
          return (
            <View key={`${item.nome}-${idx}`} style={[styles.item, { backgroundColor: isDark ? '#1f2430' : '#fafafa' }, done && styles.itemDone]}>
              {getResidentPhoto(item.nome) ? (
                <Image source={{ uri: getResidentPhoto(item.nome) }} style={[styles.avatarPhoto, done && styles.avatarDone]} />
              ) : (
                <View style={[styles.avatar, done && styles.avatarDone]}>
                  <Text style={styles.avatarText}>{getAvatarInitial(item.nome)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.text }]}>{item.nome}</Text>
                <Text style={[styles.itemTask, { color: colors.muted }]}>{item.tarefa}</Text>
                <Text style={[styles.ratingText, { color: colors.muted }]}>
                  Nota casa: {casaStat.total ? `${casaStat.media.toFixed(1)} (${casaStat.total}/4)` : 'sem avaliacoes'}
                </Text>
                {hasBanheirao(item.tarefa) && (
                  <Text style={[styles.ratingText, { color: '#7e57c2' }]}>
                    Nota banheirao: {banheiraoStat.total ? `${banheiraoStat.media.toFixed(1)} (${banheiraoStat.total}/4)` : 'sem avaliacoes'}
                  </Text>
                )}
              </View>
              <Pressable
                style={[styles.check, done && { backgroundColor: '#00c853', borderColor: '#00c853' }]}
                onPress={async () => {
                  if (done) {
                    setChecked((prev) => ({ ...prev, [idx]: false }));
                    return;
                  }
                  const photoDataUrl = await takeTaskProofPhoto();
                  if (!photoDataUrl) {
                    Alert.alert('Comprovacao obrigatoria', 'Para concluir a tarefa, envie uma foto da tarefa feita.');
                    return;
                  }
                  try {
                    await concluirTarefa(item.tarefa, resident, photoDataUrl);
                    setChecked((prev) => ({ ...prev, [idx]: true }));
                    await load('pull');
                  } catch (e) {
                    Alert.alert('Erro', e?.message || 'Nao foi possivel concluir a tarefa.');
                  }
                }}
              >
                <MaterialCommunityIcons name={done ? 'check' : 'checkbox-blank-outline'} size={17} color={done ? '#fff' : '#6b7280'} />
              </Pressable>
              <Pressable
                style={styles.rateBtn}
                onPress={() => {
                  if (String(item.nome).toUpperCase() === String(resident).toUpperCase()) {
                    Alert.alert('Aviso', 'Voce nao pode avaliar sua propria tarefa.');
                    return;
                  }
                  setSelectedTask(item);
                  setNota(5);
                  setComentario('');
                  setCategoriaNota('casa');
                  setRateModalVisible(true);
                }}
              >
                <MaterialCommunityIcons name="star-outline" size={16} color="#6a1b9a" />
              </Pressable>
            </View>
          );
        })}
        {!loading && !escala.length && <Text style={[styles.text, { color: colors.muted }]}>Sem dados de escala no momento.</Text>}
      </View>

      <Modal visible={rateModalVisible} transparent animationType="slide" onRequestClose={() => setRateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.title, { color: colors.text, marginBottom: 4 }]}>Avaliar tarefa</Text>
            <Text style={[styles.text, { color: colors.muted, marginBottom: 10 }]}>
              {selectedTask?.nome} • {selectedTask?.tarefa}
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setNota(n)}>
                  <MaterialCommunityIcons name={nota >= n ? 'star' : 'star-outline'} size={28} color={nota >= n ? '#ffb300' : '#b0b7c3'} />
                </Pressable>
              ))}
            </View>
            {hasBanheirao(selectedTask?.tarefa) && (
              <View style={styles.categoryRow}>
                <Pressable style={[styles.categoryBtn, categoriaNota === 'casa' && styles.categoryBtnActive]} onPress={() => setCategoriaNota('casa')}>
                  <Text style={[styles.categoryBtnText, categoriaNota === 'casa' && styles.categoryBtnTextActive]}>Tarefa da casa</Text>
                </Pressable>
                <Pressable style={[styles.categoryBtn, categoriaNota === 'banheirao' && styles.categoryBtnActive]} onPress={() => setCategoriaNota('banheirao')}>
                  <Text style={[styles.categoryBtnText, categoriaNota === 'banheirao' && styles.categoryBtnTextActive]}>Banheirao</Text>
                </Pressable>
              </View>
            )}
            <TextInput
              value={comentario}
              onChangeText={setComentario}
              placeholder="Comentário opcional"
              placeholderTextColor="#94a3b8"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setRateModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, ratingSaving && { opacity: 0.75 }]}
                onPress={async () => {
                  if (ratingSaving) return;
                  try {
                    setRatingSaving(true);
                    await rateTask({
                      actor: resident,
                      target: selectedTask?.nome,
                      tarefa: selectedTask?.tarefa,
                      nota,
                      comentario,
                      categoria: categoriaNota,
                    });
                    setRateModalVisible(false);
                    await load('pull');
                    Alert.alert('Sucesso', 'Avaliacao registrada para a semana.');
                  } catch (e) {
                    Alert.alert('Erro', e?.message || 'Nao foi possivel avaliar.');
                  } finally {
                    setRatingSaving(false);
                  }
                }}
                disabled={ratingSaving}
              >
                <Text style={styles.confirmBtnText}>{ratingSaving ? 'Enviando...' : 'Enviar'}</Text>
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
  content: { padding: 16, paddingTop: 6, gap: 10, paddingBottom: 26 },
  card: { borderWidth: 1, borderRadius: 16, padding: 13 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 7 },
  text: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  item: { borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftWidth: 4, borderLeftColor: '#6a1b9a' },
  itemDone: { borderLeftColor: '#00c853', backgroundColor: '#f1f8e9' },
  check: { width: 30, height: 30, borderRadius: 9, borderWidth: 2, borderColor: '#b0b7c3', alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 14, fontWeight: '800' },
  itemTask: { fontSize: 12, marginTop: 3, fontWeight: '600' },
  ratingText: { fontSize: 11, marginTop: 3, fontWeight: '600' },
  loadingWrap: { paddingVertical: 12, alignItems: 'center' },
  error: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  progressPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  progressText: { fontSize: 11, fontWeight: '800' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6a1b9a' },
  avatarPhoto: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff' },
  avatarDone: { backgroundColor: '#00c853' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  rateBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 26 },
  starsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 10 },
  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  categoryBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: '#fff' },
  categoryBtnActive: { borderColor: '#6a1b9a', backgroundColor: '#f3e5f5' },
  categoryBtnText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  categoryBtnTextActive: { color: '#4a148c' },
  modalInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, color: '#111827', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', paddingVertical: 11, alignItems: 'center', backgroundColor: '#fff' },
  cancelBtnText: { color: '#6b7280', fontWeight: '700' },
  confirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: '#6a1b9a' },
  confirmBtnText: { color: '#fff', fontWeight: '800' },
});
