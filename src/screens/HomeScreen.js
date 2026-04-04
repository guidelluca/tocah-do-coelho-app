import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { addCaixinhaEntry, concluirTarefa, getCaixinha, getCaixinhaStatement, getDados, getFinanceSnapshot, getTarefaSemana } from '../services/api';
import { AppHeader } from '../components/AppHeader';
import { useResident } from '../context/ResidentContext';
import { useNotifications } from '../context/NotificationContext';
import { formatMonthReference } from '../utils/dateLabel';
const HOME_HERO_IMAGE_URLS = [
  'https://drive.google.com/uc?export=download&id=1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ',
  'https://drive.google.com/uc?export=view&id=1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ',
  'https://drive.google.com/thumbnail?id=1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ&sz=w1600',
];
const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images || 'images';

function toNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  let normalized = raw.replace(/[^\d,.-]/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 || lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = normalized.split(thousandSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNumber(v));
const getAvatarInitial = (value) => {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return '•';
  return cleaned.slice(0, 1).toUpperCase();
};

function formatNotificationTime(iso) {
  const dt = new Date(String(iso || ''));
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getNotificationMeta(item) {
  const type = String(item?.type || '').toLowerCase();
  if (type === 'check') return { icon: 'checkbox-marked-circle-outline', color: '#16a34a', title: 'Tarefa concluída' };
  if (type === 'rating') return { icon: 'star-circle-outline', color: '#f59e0b', title: 'Nova avaliação' };
  return { icon: 'message-reply-text-outline', color: '#0ea5e9', title: 'Nova publicação' };
}

export function HomeScreen() {
  const navigation = useNavigation();
  const { isDark } = useThemeMode();
  const { resident, selectResident, residents, getResidentPhoto } = useResident();
  const { notificationCount, notificationItems, markNotificationsAsSeen, refreshNotifications } = useNotifications();
  const colors = isDark ? darkTheme : lightTheme;
  const [snapshot, setSnapshot] = useState({ mesReferencia: '', residents: [] });
  const [caixinha, setCaixinha] = useState({ saldo: '0,00' });
  const [meuResumo, setMeuResumo] = useState({ aluguel: '--', mesReferencia: '' });
  const [tarefa, setTarefa] = useState({ tarefaNome: 'Sala, Corredor e Garagem' });
  const [taskDone, setTaskDone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [caixinhaModalVisible, setCaixinhaModalVisible] = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);
  const [caixinhaItems, setCaixinhaItems] = useState([]);
  const [txTipo, setTxTipo] = useState('entrada');
  const [txDescricao, setTxDescricao] = useState('');
  const [txValor, setTxValor] = useState('');
  const [txObs, setTxObs] = useState('');
  const [txSaving, setTxSaving] = useState(false);
  const [valuesVisible, setValuesVisible] = useState(true);
  const [rentDetailVisible, setRentDetailVisible] = useState(false);
  const [rentDetailResident, setRentDetailResident] = useState(null);
  const [taskPosting, setTaskPosting] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);

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
  const [homeHeroImageIdx, setHomeHeroImageIdx] = useState(0);

  const load = useCallback(async (mode = 'normal') => {
    if (mode === 'normal' || mode === 'pull') setRefreshing(true);
    try {
      const [finRes, cxRes, dadosRes, tfRes] = await Promise.allSettled([
        getFinanceSnapshot(),
        getCaixinha(),
        getDados(resident),
        getTarefaSemana(resident),
      ]);

      if (finRes.status === 'fulfilled') {
        const fin = finRes.value || {};
        setSnapshot({ mesReferencia: fin.mesReferencia || '', residents: fin.residents || [] });
      }
      if (cxRes.status === 'fulfilled') {
        const cx = cxRes.value || {};
        setCaixinha({ saldo: cx.saldo || '0,00' });
      }
      if (dadosRes.status === 'fulfilled') {
        const dados = dadosRes.value || {};
        setMeuResumo({ aluguel: dados.aluguel || '--', mesReferencia: dados.mesReferencia || '' });
      }
      if (tfRes.status === 'fulfilled') {
        const tf = tfRes.value || {};
        setTarefa({ tarefaNome: tf.tarefaNome || 'Sala, Corredor e Garagem' });
      }

      const hasError =
        finRes.status === 'rejected' ||
        cxRes.status === 'rejected' ||
        dadosRes.status === 'rejected' ||
        tfRes.status === 'rejected';
      setError(
        hasError
          ? 'Alguns dados nao carregaram, mas o restante foi atualizado.'
          : ''
      );
    } catch (e) {
      setError(e?.message || 'Erro ao sincronizar dados');
    } finally {
      if (mode === 'normal' || mode === 'pull') setRefreshing(false);
    }
  }, [resident]);

  const openCaixinhaModal = async () => {
    setCaixinhaModalVisible(true);
    setStatementLoading(true);
    try {
      const data = await getCaixinhaStatement();
      setCaixinhaItems(data?.items || []);
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Nao foi possivel carregar extrato da caixinha.');
      setCaixinhaItems([]);
    } finally {
      setStatementLoading(false);
    }
  };

  const submitCaixinha = async () => {
    if (!txDescricao || !txValor) {
      Alert.alert('Campos obrigatorios', 'Preencha descricao e valor.');
      return;
    }
    setTxSaving(true);
    try {
      await addCaixinhaEntry({
        tipo: txTipo,
        descricao: txDescricao,
        valor: txValor,
        obs: txObs,
      });
      setTxDescricao('');
      setTxValor('');
      setTxObs('');
      await Promise.all([load(), openCaixinhaModal()]);
      Alert.alert('Sucesso', 'Transacao adicionada na aba Caixinha.');
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Nao foi possivel salvar a transacao.');
    } finally {
      setTxSaving(false);
    }
  };

  useEffect(() => {
    load();
  }, [resident]);

  useEffect(() => {
    refreshNotifications();
  }, [resident]);

  useFocusEffect(
    useCallback(() => {
      load('silent');
      const timer = setInterval(() => {
        load('silent');
      }, 7000);
      return () => clearInterval(timer);
    }, [load])
  );

  const totalCasa = useMemo(
    () => (snapshot.residents || []).reduce((acc, r) => acc + toNumber(r?.total), 0),
    [snapshot.residents]
  );

  const maskValue = (value) => (valuesVisible ? brl(value) : 'R$ ••••');
  const formatBreakdownValue = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return valuesVisible ? brl(0) : 'R$ ••••';
    const hasLetters = /[A-Za-z]/.test(raw);
    if (hasLetters) return raw;
    return maskValue(value);
  };
  const getBreakdownMeta = (value, key) => {
    const raw = String(value ?? '').trim();
    if (!raw) return { text: valuesVisible ? brl(0) : 'R$ ••••', color: '#374151' };
    if (/[A-Za-z]/.test(raw)) return { text: raw, color: '#6b7280' };
    const numeric = toNumber(value);
    if (key === 'contaQuePaga') {
      if (numeric > 0) return { text: valuesVisible ? `-${brl(Math.abs(numeric))}` : 'R$ ••••', color: '#c62828' };
      if (numeric < 0) return { text: valuesVisible ? `+${brl(Math.abs(numeric))}` : 'R$ ••••', color: '#2e7d32' };
    }
    if (numeric > 0) return { text: valuesVisible ? `+${brl(Math.abs(numeric))}` : 'R$ ••••', color: '#2e7d32' };
    if (numeric < 0) return { text: valuesVisible ? `-${brl(Math.abs(numeric))}` : 'R$ ••••', color: '#c62828' };
    return { text: formatBreakdownValue(value), color: '#374151' };
  };
  const detailItems = [
    ['Aluguel base', 'aluguel'],
    ['Agua', 'agua'],
    ['Luz', 'luz'],
    ['Internet', 'net'],
    ['IPTU', 'iptu'],
    ['Sofa', 'sofa'],
    ['Drywall', 'dryWall'],
    ['Caixinha', 'caixinha'],
    ['Subtotal', 'subtotal'],
    ['Multas', 'multas'],
    ['Conta que paga', 'contaQuePaga'],
    ['Dividas', 'dividas'],
  ];

  const openRentDetail = (residentName) => {
    const found = (snapshot.residents || []).find(
      (r) => String(r?.nome || '').toUpperCase() === String(residentName || '').toUpperCase()
    );
    setRentDetailResident(
      found || {
        nome: residentName,
        total: meuResumo.aluguel,
      }
    );
    setRentDetailVisible(true);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
    >
      <AppHeader
        title="República Tocah"
        subtitle={`Morador: ${resident} • ${formatMonthReference(snapshot.mesReferencia)}`}
        notificationCount={notificationCount}
        onBellPress={async () => {
          setNotificationModalVisible(true);
          await markNotificationsAsSeen();
        }}
      />
      <View style={styles.visibilityRow}>
        <Pressable style={styles.visibilityBtn} onPress={() => setValuesVisible((prev) => !prev)}>
          <MaterialCommunityIcons name={valuesVisible ? 'eye-off-outline' : 'eye-outline'} size={16} color="#6a1b9a" />
          <Text style={styles.visibilityText}>{valuesVisible ? 'Ocultar valores' : 'Mostrar valores'}</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.residentRow}>
        {residents.map((name) => {
          const selected = name === resident;
          return (
            <Pressable key={name} onPress={() => selectResident(name)} style={[styles.residentChip, selected && styles.residentChipActive]}>
              <Text style={[styles.residentChipText, selected && styles.residentChipTextActive]}>{name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable style={[styles.caixinhaCard, { borderColor: '#c8e6c9' }]} onPress={openCaixinhaModal}>
        <View>
          <Text style={styles.caixinhaTitle}>Caixinha</Text>
          <Text style={styles.caixinhaHint}>Clique para ver o extrato</Text>
        </View>
        <Text style={styles.caixinhaValue}>{maskValue(caixinha.saldo)}</Text>
      </Pressable>

      <View style={[styles.heroImageCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Image
          source={{ uri: HOME_HERO_IMAGE_URLS[Math.min(homeHeroImageIdx, HOME_HERO_IMAGE_URLS.length - 1)] }}
          style={styles.heroImage}
          resizeMode="cover"
          onError={() => {
            setHomeHeroImageIdx((prev) => (prev < HOME_HERO_IMAGE_URLS.length - 1 ? prev + 1 : prev));
          }}
        />
        <View style={styles.heroImageOverlay}>
          <Text style={styles.heroImageTitle}>República Tocah do Coelho</Text>
          <Text style={styles.heroImageSubtitle}>Gente, sabe aquele momento que você já gozou tudo que cê tinha pra gozar?</Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <Pressable style={[styles.actionBox, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate('Financas')}>
          <MaterialCommunityIcons name="cash-plus" size={24} color="#6a1b9a" />
          <Text style={[styles.actionText, { color: '#6a1b9a' }]}>Lancar Gasto</Text>
        </Pressable>
        <Pressable style={[styles.actionBox, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate('Tarefas')}>
          <MaterialCommunityIcons name="calendar-month-outline" size={24} color="#6a1b9a" />
          <Text style={[styles.actionText, { color: '#6a1b9a' }]}>Escala Mes</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => Alert.alert('Regras da Casa', 'Limpe o que usar, respeite os turnos e registre gastos no mesmo dia.')}
        >
          <MaterialCommunityIcons name="book-open-page-variant-outline" size={24} color="#6a1b9a" />
          <Text style={[styles.actionText, { color: '#6a1b9a' }]}>Regras</Text>
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!error && (
        <Pressable style={styles.retryBtn} onPress={() => load('pull')}>
          <MaterialCommunityIcons name="refresh" size={14} color="#fff" />
          <Text style={styles.retryBtnText}>Tentar novamente</Text>
        </Pressable>
      )}

      <Pressable onPress={() => openRentDetail(resident)} style={[styles.card, styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.rentTopRow}>
          <View>
            <Text style={[styles.metricLabel, { color: '#6a1b9a' }]}>Seu Aluguel</Text>
            <Text style={[styles.rentMonth, { color: '#7e57c2' }]}>{formatMonthReference(meuResumo.mesReferencia || snapshot.mesReferencia)}</Text>
          </View>
          <View style={styles.rentBadge}>
            <Text style={styles.rentBadgeText}>AO VIVO</Text>
          </View>
        </View>
        <Text style={[styles.metricValue, { color: '#4a148c' }]}>{maskValue(meuResumo.aluguel)}</Text>
        <View style={styles.rentBottomRow}>
          <View style={styles.rentChip}>
            <MaterialCommunityIcons name="account-circle-outline" size={14} color="#6a1b9a" />
            <Text style={styles.rentChipText}>{resident}</Text>
          </View>
          <View style={styles.rentChip}>
            <MaterialCommunityIcons name="calendar-clock-outline" size={14} color="#d32f2f" />
            <Text style={[styles.rentChipText, { color: '#d32f2f' }]}>Vence dia 12</Text>
          </View>
        </View>
      </Pressable>

      <View style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.taskHeaderRow}>
          <View style={styles.taskTitleWrap}>
            <MaterialCommunityIcons name="calendar-check-outline" size={18} color="#6a1b9a" />
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Tarefa da Semana</Text>
          </View>
          <View style={[styles.taskStatusPill, taskDone ? styles.taskStatusDone : styles.taskStatusPending]}>
            <Text style={[styles.taskStatusText, taskDone && styles.taskStatusTextDone]}>{taskDone ? 'Concluida' : 'Pendente'}</Text>
          </View>
        </View>

        <View style={styles.taskBodyRow}>
          {getResidentPhoto(resident) ? (
            <Image source={{ uri: getResidentPhoto(resident) }} style={styles.taskAvatarPhoto} />
          ) : (
            <View style={styles.taskAvatar}>
              <Text style={styles.taskAvatarText}>{getAvatarInitial(resident)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>{tarefa.tarefaNome}</Text>
            <Text style={[styles.subtitle, { color: colors.muted, marginTop: 2 }]}>Responsavel: {resident}</Text>
            <Text style={[styles.subtitle, { color: colors.muted, marginTop: 2 }]}>Varrer, tirar lixos e organizar.</Text>
          </View>
        </View>

        <Pressable
          style={[styles.taskActionBtn, taskDone && styles.taskActionBtnDone, taskPosting && { opacity: 0.75 }]}
          onPress={async () => {
            if (taskDone || taskPosting) return;
            const photoDataUrl = await takeTaskProofPhoto();
            if (!photoDataUrl) {
              Alert.alert('Comprovação obrigatória', 'Para concluir a tarefa, envie uma foto da tarefa feita.');
              return;
            }
            try {
              setTaskPosting(true);
              await concluirTarefa(tarefa.tarefaNome, resident, photoDataUrl);
              setTaskDone(true);
            } catch {
              Alert.alert('Erro', 'Não foi possível concluir a tarefa.');
            } finally {
              setTaskPosting(false);
            }
          }}
          disabled={taskPosting}
        >
          <MaterialCommunityIcons name={taskDone ? 'check-circle-outline' : 'checkbox-marked-circle-outline'} size={18} color={taskDone ? '#166534' : '#fff'} />
          <Text style={[styles.taskActionText, taskDone && styles.taskActionTextDone]}>
            {taskPosting ? 'Enviando...' : taskDone ? 'Tarefa concluída' : 'Marcar como concluída'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Prévia dos Aluguéis</Text>
        {(snapshot.residents || []).map((r) => (
          <Pressable key={r.nome} style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => openRentDetail(r.nome)}>
            <View style={styles.rowUser}>
              {getResidentPhoto(r.nome) ? (
                <Image source={{ uri: getResidentPhoto(r.nome) }} style={styles.rowAvatarPhoto} />
              ) : (
                <View style={styles.rowAvatar}>
                  <Text style={styles.rowAvatarText}>{getAvatarInitial(r.nome)}</Text>
                </View>
              )}
              <Text style={[styles.rowLabel, { color: colors.text }]}>{r.nome}</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.text }]}>{maskValue(r.total)}</Text>
          </Pressable>
        ))}
        {!snapshot.residents?.length && <Text style={[styles.subtitle, { color: colors.muted }]}>Nenhum aluguel encontrado nesta referência.</Text>}
        <View style={[styles.row, { marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }]}>
          <Text style={[styles.rowLabel, { color: colors.muted }]}>Total Casa</Text>
          <Text style={[styles.rowValue, { color: colors.primary }]}>{maskValue(totalCasa)}</Text>
        </View>
      </View>

      <Modal visible={caixinhaModalVisible} animationType="slide" transparent onRequestClose={() => setCaixinhaModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Extrato da Caixinha</Text>
              <Pressable onPress={() => setCaixinhaModalVisible(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>

            <View style={styles.segmentRow}>
              <Pressable style={[styles.segmentBtn, txTipo === 'entrada' && styles.segmentBtnActive]} onPress={() => setTxTipo('entrada')}>
                <Text style={[styles.segmentText, txTipo === 'entrada' && styles.segmentTextActive]}>Entrada</Text>
              </Pressable>
              <Pressable style={[styles.segmentBtn, txTipo === 'saida' && styles.segmentBtnActive]} onPress={() => setTxTipo('saida')}>
                <Text style={[styles.segmentText, txTipo === 'saida' && styles.segmentTextActive]}>Saida</Text>
              </Pressable>
            </View>
            <TextInput placeholder="Descrição" value={txDescricao} onChangeText={setTxDescricao} style={styles.input} placeholderTextColor="#94a3b8" />
            <TextInput placeholder="Valor (ex: 45.90)" value={txValor} onChangeText={setTxValor} style={styles.input} keyboardType="decimal-pad" placeholderTextColor="#94a3b8" />
            <TextInput placeholder="Observação (opcional)" value={txObs} onChangeText={setTxObs} style={styles.input} placeholderTextColor="#94a3b8" />
            <Pressable style={[styles.saveBtn, txSaving && { opacity: 0.7 }]} onPress={submitCaixinha} disabled={txSaving}>
              <Text style={styles.saveBtnText}>{txSaving ? 'Salvando...' : 'Adicionar transacao'}</Text>
            </Pressable>

            <Text style={[styles.metricLabel, { color: colors.muted, marginTop: 12 }]}>Últimas movimentações</Text>
            {statementLoading ? (
              <Text style={[styles.subtitle, { color: colors.muted }]}>Carregando extrato...</Text>
            ) : (
              <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ paddingBottom: 10 }}>
                {caixinhaItems.map((item, idx) => (
                  <View key={`${item.data}-${idx}`} style={styles.statementRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: colors.text }]}>{item.descricao}</Text>
                      <Text style={[styles.subtitle, { color: colors.muted }]}>{item.data} {item.obs ? `• ${item.obs}` : ''}</Text>
                    </View>
                    <Text style={[styles.rowValue, { color: item.tipo === 'saida' ? '#c62828' : '#2e7d32' }]}>{brl(item.valor)}</Text>
                  </View>
                ))}
                {!caixinhaItems.length && <Text style={[styles.subtitle, { color: colors.muted }]}>Sem transações no extrato.</Text>}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={rentDetailVisible} animationType="slide" transparent onRequestClose={() => setRentDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Extrato do Aluguel</Text>
              <Pressable onPress={() => setRentDetailVisible(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.subtitle, { color: colors.muted, marginTop: 0 }]}>
              {rentDetailResident?.nome || resident} • {formatMonthReference(snapshot.mesReferencia)}
            </Text>
            <Text style={[styles.metricValue, { color: '#4a148c', fontSize: 24 }]}>{maskValue(rentDetailResident?.total || 0)}</Text>
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {detailItems.map(([label, key]) => {
                const value = rentDetailResident?.[key];
                const meta = getBreakdownMeta(value, key);
                return (
                  <View key={key} style={styles.statementRow}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
                    <Text style={[styles.rowValue, { color: meta.color }]}>{meta.text}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={notificationModalVisible} animationType="slide" transparent onRequestClose={() => setNotificationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Notificações</Text>
              <Pressable onPress={() => setNotificationModalVisible(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.subtitle, { color: colors.muted, marginTop: 0 }]}>
              {notificationItems.filter((item) => item.isUnread).length > 0
                ? `${notificationItems.filter((item) => item.isUnread).length} nova(s) atualização(ões)`
                : 'Sem novidades não lidas agora'}
            </Text>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 8, marginTop: 8 }}>
              {notificationItems.map((item, idx) => {
                const meta = getNotificationMeta(item);
                return (
                  <View
                    key={`${item.ts}-${idx}`}
                    style={[
                      styles.statementRow,
                      item.isUnread && { backgroundColor: '#f5f3ff', borderRadius: 10, paddingHorizontal: 8 },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <MaterialCommunityIcons name={meta.icon} size={16} color={meta.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowLabel, { color: colors.text }]}>{meta.title}</Text>
                        <Text style={[styles.subtitle, { color: colors.muted, marginTop: 0 }]}>
                          {item.actor || 'Morador'} • {item.content || item.tarefa || 'Atualização da casa'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.subtitle, { color: colors.muted, marginTop: 0 }]}>{formatNotificationTime(item.ts)}</Text>
                  </View>
                );
              })}
              {!notificationItems.length && <Text style={[styles.subtitle, { color: colors.muted }]}>Nenhuma notificação disponível.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 28 },
  visibilityRow: { alignItems: 'flex-end', marginTop: -2, marginBottom: 2 },
  visibilityBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f3e5f5', borderRadius: 999, borderWidth: 1, borderColor: '#e1bee7', paddingHorizontal: 10, paddingVertical: 6 },
  visibilityText: { color: '#6a1b9a', fontSize: 11, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  metricLabel: { fontSize: 12, fontWeight: '700' },
  metricValue: { fontSize: 26, fontWeight: '900', marginTop: 4 },
  balanceCard: { backgroundColor: '#f3e5f5', borderWidth: 1.2, borderColor: '#e1bee7' },
  rentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rentMonth: { marginTop: 2, fontSize: 12, fontWeight: '600' },
  rentBadge: { backgroundColor: '#efe7ff', borderWidth: 1, borderColor: '#d1c4e9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  rentBadgeText: { color: '#6a1b9a', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  rentBottomRow: { marginTop: 8, flexDirection: 'row', gap: 8 },
  rentChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: '#ede7f6' },
  rentChipText: { color: '#6a1b9a', fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  rowUser: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  rowAvatarPhoto: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  rowAvatarText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  rowLabel: { fontSize: 13, fontWeight: '600' },
  rowValue: { fontSize: 13, fontWeight: '800' },
  caixinhaCard: { backgroundColor: '#e8f5e9', borderLeftWidth: 5, borderLeftColor: '#00c853', borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 10, marginHorizontal: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#00c853', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  caixinhaTitle: { color: '#1b5e20', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  caixinhaHint: { color: '#4caf50', fontSize: 11, fontWeight: '600', marginTop: 3 },
  caixinhaValue: { color: '#1b5e20', fontSize: 22, fontWeight: '900' },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  heroImageCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroImage: { width: '100%', height: 180 },
  heroImageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroImageTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  heroImageSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 11, marginTop: 2, fontWeight: '600' },
  actionBox: { flex: 1, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  actionText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', textAlign: 'center', letterSpacing: 0.2 },
  taskRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  checkBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: '#adb5bd', alignItems: 'center', justifyContent: 'center' },
  taskCard: { borderWidth: 1, borderRadius: 18, padding: 14, shadowColor: '#6a1b9a', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  taskHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  taskTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  taskStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  taskStatusPending: { backgroundColor: '#fff7ed', borderColor: '#fdba74' },
  taskStatusDone: { backgroundColor: '#ecfdf3', borderColor: '#86efac' },
  taskStatusText: { color: '#b45309', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  taskStatusTextDone: { color: '#166534' },
  taskBodyRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  taskAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  taskAvatarPhoto: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff' },
  taskAvatarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  taskActionBtn: { marginTop: 12, backgroundColor: '#6a1b9a', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  taskActionBtnDone: { backgroundColor: '#dcfce7' },
  taskActionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  taskActionTextDone: { color: '#166534' },
  error: { color: '#ef4444', fontWeight: '700', marginBottom: 2 },
  retryBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6a1b9a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6 },
  retryBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  residentRow: { gap: 8, paddingBottom: 4, marginBottom: 2 },
  residentChip: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  residentChipActive: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
  residentChipText: { color: '#374151', fontSize: 11, fontWeight: '800' },
  residentChipTextActive: { color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5' },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  segmentBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: '#fff' },
  segmentBtnActive: { borderColor: '#6a1b9a', backgroundColor: '#f3e5f5' },
  segmentText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  segmentTextActive: { color: '#4a148c' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, color: '#111827', fontWeight: '600' },
  saveBtn: { backgroundColor: '#6a1b9a', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800' },
  statementRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
});
