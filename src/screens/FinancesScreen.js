import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { addFinanceEntry, deleteFinanceEntry, getApiHealth, getFinanceSnapshot, toggleContaStatus, updateFinanceEntry } from '../services/api';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { AppHeader } from '../components/AppHeader';
import { formatMonthReference } from '../utils/dateLabel';
import { useResident } from '../context/ResidentContext';

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

function toSheetMoney(value) {
  const n = toNumber(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function forceDotDecimal(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '0.00';
  if (raw.includes('.') || raw.includes(',')) return toSheetMoney(raw);
  const digits = raw.replace(/[^\d-]/g, '');
  if (!digits || digits === '-') return '0.00';
  const negative = digits.startsWith('-');
  const onlyDigits = digits.replace('-', '');
  if (!onlyDigits) return '0.00';
  if (onlyDigits.length === 1) return `${negative ? '-' : ''}0.0${onlyDigits}`;
  if (onlyDigits.length === 2) return `${negative ? '-' : ''}0.${onlyDigits}`;
  const intPart = onlyDigits.slice(0, -2);
  const decPart = onlyDigits.slice(-2);
  return `${negative ? '-' : ''}${intPart}.${decPart}`;
}

function formatMoneyInput(value) {
  let digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length > 9) digits = digits.slice(0, 9);
  const cents = digits.slice(-2).padStart(2, '0');
  const whole = digits.length > 2 ? digits.slice(0, -2) : '0';
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  return `${normalizedWhole || '0'},${cents}`;
}

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNumber(v));
const getAvatarInitial = (value) => {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return '•';
  return cleaned.slice(0, 1).toUpperCase();
};
const formatBreakdownValue = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return brl(0);
  if (/[A-Za-z]/.test(raw)) return raw;
  return brl(value);
};
const getBreakdownMeta = (value, key) => {
  const raw = String(value ?? '').trim();
  if (!raw) return { text: brl(0), color: '#374151' };
  if (/[A-Za-z]/.test(raw)) return { text: raw, color: '#6b7280' };
  const numeric = toNumber(value);
  if (key === 'contaQuePaga') {
    if (numeric > 0) return { text: `-${brl(Math.abs(numeric))}`, color: '#c62828' };
    if (numeric < 0) return { text: `+${brl(Math.abs(numeric))}`, color: '#2e7d32' };
  }
  if (numeric > 0) return { text: `+${brl(Math.abs(numeric))}`, color: '#2e7d32' };
  if (numeric < 0) return { text: `-${brl(Math.abs(numeric))}`, color: '#c62828' };
  return { text: formatBreakdownValue(value), color: '#374151' };
};

function parseDueDay(conta) {
  const candidates = [
    conta?.diaVencimento,
    conta?.vencimentoDia,
    conta?.dia,
    conta?.vencimento,
    conta?.dueDay,
  ];
  for (const candidate of candidates) {
    const value = Number(String(candidate ?? '').replace(/[^\d]/g, ''));
    if (Number.isFinite(value) && value >= 1 && value <= 31) return value;
  }
  return null;
}

function getContaStatusMeta(conta, referenceDate = new Date()) {
  const paid = String(conta?.status || '').toUpperCase() === 'TRUE';
  const dueDay = parseDueDay(conta);
  if (paid) return { label: 'Paga', tone: 'paid', dueDay };
  if (!dueDay) return { label: 'Pendente', tone: 'pending', dueDay: null };
  const today = referenceDate.getDate();
  if (today > dueDay) return { label: 'Atrasada', tone: 'overdue', dueDay };
  return { label: 'Pendente', tone: 'pending', dueDay };
}

function getContaToneStyles(tone = 'pending', isDark = false) {
  if (!isDark) {
    return {
      row: tone === 'paid' ? styles.contaRowPaid : tone === 'overdue' ? styles.contaRowOverdue : styles.contaRowPending,
      textColor: '#1f2937',
    };
  }
  if (tone === 'paid') return { row: styles.contaRowPaidDark, textColor: '#ecfdf3' };
  if (tone === 'overdue') return { row: styles.contaRowOverdueDark, textColor: '#fff1f2' };
  return { row: styles.contaRowPendingDark, textColor: '#fffbeb' };
}

export function FinancesScreen() {
  const { isDark, toggleTheme } = useThemeMode();
  const { resident, getResidentPhoto } = useResident();
  const colors = isDark ? darkTheme : lightTheme;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState({ mesReferencia: '', residents: [], contas: [], gastosColetivos: [], acertosIndividuais: [] });
  const [modalVisible, setModalVisible] = useState(false);
  const [quickCreateVisible, setQuickCreateVisible] = useState(false);
  const [pickContaVisible, setPickContaVisible] = useState(false);
  const [pickAcertoDeleteVisible, setPickAcertoDeleteVisible] = useState(false);
  const [pickGastoDeleteVisible, setPickGastoDeleteVisible] = useState(false);
  const [entryType, setEntryType] = useState('gastoColetivo');
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rentDetailVisible, setRentDetailVisible] = useState(false);
  const [rentDetailResident, setRentDetailResident] = useState(null);
  const [apiOnline, setApiOnline] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [form, setForm] = useState({
    quem: '',
    oQue: '',
    quanto: '',
    paraQuem: '',
    quemMulti: [],
    deveQuanto: '',
    obs: '',
    dividirCom: [],
    conta: '',
    valor: '',
    status: false,
  });

  const load = useCallback(async (mode = 'normal') => {
    if (mode === 'pull') setRefreshing(true);
    else if (mode === 'normal') setLoading(true);
    try {
      const data = await getFinanceSnapshot();
      setSnapshot({
        mesReferencia: data?.mesReferencia || '',
        residents: data?.residents || [],
        contas: data?.contas || [],
        gastosColetivos: data?.gastosColetivos || [],
        acertosIndividuais: data?.acertosIndividuais || [],
      });
      setApiOnline(true);
      setLastSyncAt(new Date().toISOString());
      setError('');
    } catch (e) {
      setApiOnline(false);
      setError(e.message || 'Erro ao carregar financas');
    } finally {
      if (mode === 'normal') setLoading(false);
      if (mode === 'pull') setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await getApiHealth();
        setApiOnline(true);
      } catch {
        setApiOnline(false);
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load('silent');
      const timer = setInterval(() => {
        load('silent');
      }, 20000);
      return () => clearInterval(timer);
    }, [load])
  );

  const contasOperacionais = useMemo(
    () =>
      (snapshot.contas || []).filter((item) => {
        const conta = String(item?.conta || '').trim().toUpperCase();
        return conta !== 'TOTAL' && conta !== 'MORADORES';
      }),
    [snapshot.contas]
  );
  const totalContas = useMemo(() => contasOperacionais.reduce((acc, item) => acc + toNumber(item?.valor), 0), [contasOperacionais]);
  const moradoresCount = useMemo(() => {
    const row = (snapshot.contas || []).find((item) => String(item?.conta || '').trim().toUpperCase() === 'MORADORES');
    const fromRow = Number(String(row?.valor ?? '').replace(/[^\d]/g, ''));
    if (Number.isFinite(fromRow) && fromRow > 0) return fromRow;
    return (snapshot.residents || []).length || 1;
  }, [snapshot.contas, snapshot.residents]);
  const totalContasPorMorador = useMemo(() => totalContas / Math.max(1, moradoresCount), [totalContas, moradoresCount]);
  const totalColetivos = useMemo(
    () => snapshot.gastosColetivos.reduce((acc, item) => acc + toNumber(item?.quanto || item?.valor), 0),
    [snapshot.gastosColetivos]
  );
  const totalAcertos = useMemo(
    () => snapshot.acertosIndividuais.reduce((acc, item) => acc + toNumber(item?.deveQuanto || item?.valor), 0),
    [snapshot.acertosIndividuais]
  );
  const totalGeral = useMemo(() => totalContas + totalColetivos + totalAcertos, [totalContas, totalColetivos, totalAcertos]);
  const totalColetivosPorMorador = useMemo(() => totalColetivos / Math.max(1, moradoresCount), [totalColetivos, moradoresCount]);
  const contasStats = useMemo(() => {
    const contas = snapshot.contas || [];
    const count = contas.length;
    const paid = contas.filter((c) => String(c?.status || '').toUpperCase() === 'TRUE').length;
    const pending = Math.max(0, count - paid);
    const avg = count ? totalContas / count : 0;
    return { count, paid, pending, avg };
  }, [snapshot.contas, totalContas]);
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

  const inferRowIndex = (item, idx) => {
    const raw = item?.rowIndex ?? item?.row ?? item?.linha;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    return idx + 2;
  };

  const openCreateModal = (type) => {
    const defaultConta = (snapshot.contas || []).find((item) => String(item?.conta || '').trim().toUpperCase() !== 'TOTAL' && String(item?.conta || '').trim().toUpperCase() !== 'MORADORES');
    setEntryType(type);
    setEditingItem(null);
    setForm({
      quem: resident || '',
      oQue: '',
      quanto: '',
      paraQuem: '',
      quemMulti: [],
      deveQuanto: '',
      obs: '',
      dividirCom: [],
      conta: type === 'contaFixa' ? (defaultConta?.conta || '') : '',
      valor: type === 'contaFixa' ? String(defaultConta?.valor ?? '') : '',
      status: type === 'contaFixa' ? String(defaultConta?.status || '').toUpperCase() === 'TRUE' : false,
    });
    setModalVisible(true);
  };

  const openCreateFromFab = (type) => {
    setQuickCreateVisible(false);
    openCreateModal(type);
  };

  const openContaPickerFromFab = () => {
    setQuickCreateVisible(false);
    setPickContaVisible(true);
  };

  const openAcertoDeletePickerFromFab = () => {
    setQuickCreateVisible(false);
    setPickAcertoDeleteVisible(true);
  };

  const openGastoDeletePickerFromFab = () => {
    setQuickCreateVisible(false);
    setPickGastoDeleteVisible(true);
  };

  const openEditModal = (type, item, idx) => {
    setEntryType(type);
    setEditingItem({ ...item, _idx: idx, _rowIndex: inferRowIndex(item, idx) });
    setForm({
      quem: item?.quem || '',
      oQue: item?.oQue || item?.descricao || '',
      quanto: String(item?.quanto ?? item?.valor ?? ''),
      paraQuem: item?.paraQuem || '',
      quemMulti: [],
      deveQuanto: String(item?.deveQuanto ?? item?.valor ?? ''),
      obs: item?.obs || item?.observacao || '',
      dividirCom: [],
      conta: item?.conta || '',
      valor: String(item?.valor ?? ''),
      status: String(item?.status || '').toUpperCase() === 'TRUE',
    });
    setModalVisible(true);
  };

  const applyContaTemplate = (contaName) => {
    const found = (contasOperacionais || []).find(
      (item) => String(item?.conta || '').trim().toUpperCase() === String(contaName || '').trim().toUpperCase()
    );
    if (!found) {
      setForm((prev) => ({ ...prev, conta: contaName }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      conta: found.conta || prev.conta,
      valor: String(found.valor ?? prev.valor ?? ''),
      status: String(found.status || '').toUpperCase() === 'TRUE',
    }));
  };

  const toggleDividirCom = (nome) => {
    setForm((prev) => {
      const current = Array.isArray(prev.dividirCom) ? prev.dividirCom : [];
      const exists = current.some((n) => String(n).toUpperCase() === String(nome).toUpperCase());
      return {
        ...prev,
        dividirCom: exists
          ? current.filter((n) => String(n).toUpperCase() !== String(nome).toUpperCase())
          : [...current, nome],
      };
    });
  };

  const toggleQuemMulti = (nome) => {
    setForm((prev) => {
      const current = Array.isArray(prev.quemMulti) ? prev.quemMulti : [];
      const exists = current.some((n) => String(n).toUpperCase() === String(nome).toUpperCase());
      return {
        ...prev,
        quemMulti: exists
          ? current.filter((n) => String(n).toUpperCase() !== String(nome).toUpperCase())
          : [...current, nome],
      };
    });
  };

  const saveEntry = async () => {
    try {
      setSaving(true);
      if (!editingItem) {
        if (entryType === 'contaFixa') {
          if (!form.conta.trim() || !form.valor.trim()) {
            Alert.alert('Campos obrigatorios', 'Preencha conta e valor.');
            return;
          }
          await addFinanceEntry({
            entryType: 'contaFixa',
            usuario: resident,
            payload: { conta: form.conta.trim(), valor: toSheetMoney(form.valor), status: form.status ? 'TRUE' : 'FALSE' },
          });
        } else if (entryType === 'gastoColetivo') {
          if (!form.quem.trim() || !form.oQue.trim() || !form.quanto.trim()) {
            Alert.alert('Campos obrigatorios', 'Preencha quem, descricao e valor.');
            return;
          }
          const payer = form.quem.trim();
          const participantes = Array.from(
            new Set([payer, ...(form.dividirCom || []).map((n) => String(n).trim()).filter(Boolean)])
          );
          const qtdPessoas = Math.max(1, participantes.length);
          const valorPorPessoa = toNumber(form.quanto) / qtdPessoas;
          const splitMeta = `Divisao: ${qtdPessoas} pessoas (${brl(valorPorPessoa)}/pessoa) • ${participantes.join(', ')}`;
          const obsPayload = [form.obs.trim(), splitMeta].filter(Boolean).join(' | ');
          await addFinanceEntry({
            entryType: 'gastoColetivo',
            usuario: resident,
            payload: {
              quem: form.quem.trim(),
              oQue: form.oQue.trim(),
              quanto: forceDotDecimal(form.quanto),
              obs: obsPayload,
            },
          });
          const devedores = participantes.filter((nome) => String(nome).toUpperCase() !== String(payer).toUpperCase());
          if (devedores.length) {
            const valorAcerto = (toNumber(form.quanto) / qtdPessoas).toFixed(2);
            for (const devedor of devedores) {
              await addFinanceEntry({
                entryType: 'acertoIndividual',
                usuario: resident,
                payload: {
                  quem: devedor,
                  paraQuem: payer,
                  deveQuanto: forceDotDecimal(valorAcerto),
                  obs: form.obs.trim(),
                },
              });
            }
          }
        } else if (entryType === 'acertoIndividual') {
          if (!form.quem.trim() || !form.paraQuem.trim() || !form.deveQuanto.trim()) {
            Alert.alert('Campos obrigatorios', 'Preencha quem deve, quem emprestou e valor.');
            return;
          }
          const credor = form.paraQuem.trim();
          const devedores = Array.from(
            new Set([form.quem.trim(), ...(form.quemMulti || []).map((n) => String(n).trim()).filter(Boolean)])
          ).filter((nome) => String(nome).toUpperCase() !== String(credor).toUpperCase());
          const qtdDevedores = Math.max(1, devedores.length);
          const valorTotal = toNumber(form.deveQuanto);
          const valorPorPessoa = valorTotal / qtdDevedores;
          const splitMeta = `Emprestimo dividido: ${qtdDevedores} devedor(es) (${brl(valorPorPessoa)}/pessoa) • ${devedores.join(', ')} -> ${credor}`;
          const obsPayload = [form.obs.trim(), devedores.length > 1 ? splitMeta : ''].filter(Boolean).join(' | ');
          const listaFinal = devedores.length ? devedores : [form.quem.trim()];
          for (const devedor of listaFinal) {
            await addFinanceEntry({
              entryType: 'acertoIndividual',
              usuario: resident,
              payload: { quem: devedor, paraQuem: credor, deveQuanto: forceDotDecimal(valorPorPessoa), obs: obsPayload },
            });
          }
        }
      } else {
        if (entryType === 'contaFixa') {
          if (!form.conta.trim() || !form.valor.trim()) {
            Alert.alert('Campos obrigatorios', 'Preencha conta e valor.');
            return;
          }
          await updateFinanceEntry({
            entryType: 'contaFixa',
            rowIndex: editingItem._rowIndex,
            payload: { conta: form.conta.trim(), valor: toSheetMoney(form.valor), status: form.status ? 'TRUE' : 'FALSE' },
          });
        } else if (entryType === 'gastoColetivo') {
          const participantes = Array.from(
            new Set([form.quem.trim(), ...(form.dividirCom || []).map((n) => String(n).trim()).filter(Boolean)])
          );
          const qtdPessoas = Math.max(1, participantes.length);
          const valorPorPessoa = toNumber(form.quanto) / qtdPessoas;
          const splitMeta = `Divisao: ${qtdPessoas} pessoas (${brl(valorPorPessoa)}/pessoa) • ${participantes.join(', ')}`;
          const obsPayload = [form.obs.trim(), splitMeta].filter(Boolean).join(' | ');
          await updateFinanceEntry({
            entryType: 'gastoColetivo',
            rowIndex: editingItem._rowIndex,
            payload: { quem: form.quem.trim(), oQue: form.oQue.trim(), quanto: forceDotDecimal(form.quanto), obs: obsPayload },
          });
        } else if (entryType === 'acertoIndividual') {
          await updateFinanceEntry({
            entryType: 'acertoIndividual',
            rowIndex: editingItem._rowIndex,
            payload: { quem: form.quem.trim(), paraQuem: form.paraQuem.trim(), deveQuanto: forceDotDecimal(form.deveQuanto), obs: form.obs.trim() },
          });
        }
      }

      setModalVisible(false);
      await load('pull');
      Alert.alert('Sucesso', 'Planilha e app sincronizados.');
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Nao foi possivel salvar.');
    } finally {
      setSaving(false);
    }
  };

  const onToggleConta = async (item, idx) => {
    try {
      const current = String(item?.status || '').toUpperCase() === 'TRUE';
      await toggleContaStatus({ rowIndex: inferRowIndex(item, idx), status: !current });
      await load('silent');
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Nao foi possivel atualizar status da conta.');
    }
  };

  const onDeleteEntry = async (type, item, idx) => {
    Alert.alert('Excluir lancamento', 'Tem certeza que deseja excluir este item?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            const rowIndex = inferRowIndex(item, idx);
            try {
              await deleteFinanceEntry({ entryType: type, rowIndex });
            } catch {
              if (type === 'contaFixa') {
                await updateFinanceEntry({
                  entryType: 'contaFixa',
                  rowIndex,
                  payload: { conta: '', valor: '', divisao: '', vencimento: '', status: '' },
                });
              } else if (type === 'gastoColetivo') {
                await updateFinanceEntry({
                  entryType: 'gastoColetivo',
                  rowIndex,
                  payload: { quem: '', quanto: '', oQue: '', obs: '' },
                });
              } else if (type === 'acertoIndividual') {
                await updateFinanceEntry({
                  entryType: 'acertoIndividual',
                  rowIndex,
                  payload: { quem: '', deveQuanto: '', paraQuem: '', obs: '' },
                });
              } else {
                throw new Error('Tipo de lancamento invalido para exclusao.');
              }
            }
            await load('pull');
            Alert.alert('Sucesso', 'Item removido com sucesso.');
          } catch (e) {
            Alert.alert('Erro', e?.message || 'Nao foi possivel excluir.');
          }
        },
      },
    ]);
  };

  const openRentDetail = (residentItem) => {
    setRentDetailResident(residentItem || null);
    setRentDetailVisible(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Finanças" subtitle={formatMonthReference(snapshot.mesReferencia)} />
      <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 0 }]}>
        <View>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Gestão Financeira</Text>
          <Text style={[styles.helper, { color: colors.muted }]}>Atualiza automaticamente com a planilha</Text>
          <View style={[styles.syncPill, { backgroundColor: apiOnline ? (isDark ? '#1f3a2f' : '#e8f5e9') : (isDark ? '#3a1f25' : '#ffebee') }]}>
            <MaterialCommunityIcons name={apiOnline ? 'cloud-check-outline' : 'cloud-alert-outline'} size={12} color={apiOnline ? '#2e7d32' : '#c62828'} />
            <Text style={[styles.syncPillText, { color: apiOnline ? '#2e7d32' : '#c62828' }]}>
              {apiOnline ? `Sincronização ativa${lastSyncAt ? ` • ${new Date(lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Sem conexão com API'}
            </Text>
          </View>
        </View>
        <Pressable style={[styles.themeBtn, { backgroundColor: colors.background }]} onPress={toggleTheme}>
          <MaterialCommunityIcons name={isDark ? 'white-balance-sunny' : 'moon-waning-crescent'} size={18} color={colors.text} />
          <Text style={[styles.themeBtnText, { color: colors.text }]}>{isDark ? 'Claro' : 'Noturno'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
        >
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!error && (
            <Pressable style={styles.retryBtn} onPress={() => load('pull')}>
              <MaterialCommunityIcons name="refresh" size={14} color="#fff" />
              <Text style={styles.retryBtnText}>Tentar novamente</Text>
            </Pressable>
          )}

          <View style={styles.kpiStrip}>
            <View style={[styles.kpiPill, { backgroundColor: isDark ? '#221c2e' : '#f3e5f5' }]}>
              <Text style={[styles.kpiPillLabel, { color: colors.muted }]}>Contas fixas</Text>
              <Text style={[styles.kpiPillValue, { color: colors.primary }]}>{brl(totalContas)}</Text>
            </View>
            <View style={[styles.kpiPill, { backgroundColor: isDark ? '#1a2a24' : '#e8f5e9' }]}>
              <Text style={[styles.kpiPillLabel, { color: colors.muted }]}>Por morador</Text>
              <Text style={[styles.kpiPillValue, { color: '#2e7d32' }]}>{brl(totalContasPorMorador)}</Text>
            </View>
            <View style={[styles.kpiPill, { backgroundColor: isDark ? '#2d2126' : '#ffebee' }]}>
              <Text style={[styles.kpiPillLabel, { color: colors.muted }]}>Pendências</Text>
              <Text style={[styles.kpiPillValue, { color: '#c62828' }]}>{contasStats.pending}</Text>
            </View>
          </View>

          <View style={[styles.highlightCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <View style={styles.titleRow}>
                <View style={styles.titleIconPill}>
                  <MaterialCommunityIcons name="home-city-outline" size={15} color="#6a1b9a" />
                </View>
                <View>
                  <Text style={[styles.highlightTitle, { color: colors.text }]}>Prévia dos Aluguéis</Text>
                  <Text style={[styles.previewSubTitle, { color: colors.muted }]}>Aluguel + contas por morador</Text>
                </View>
              </View>
              <View style={styles.livePill}>
                <MaterialCommunityIcons name="pulse" size={11} color="#6a1b9a" />
                <Text style={[styles.liveBadge, { color: colors.primary }]}>Ao vivo</Text>
              </View>
            </View>
            {(snapshot.residents || []).map((r, idx) => (
              <Pressable key={`r-${idx}`} style={[styles.previewResidentCard, { borderColor: colors.border }]} onPress={() => openRentDetail(r)}>
                {getResidentPhoto(r?.nome) ? (
                  <Image source={{ uri: getResidentPhoto(r?.nome) }} style={[styles.rentAvatarPhoto, styles.rentAvatarStrong, styles.previewAvatar]} />
                ) : (
                  <View style={[styles.rentAvatar, styles.rentAvatarStrong, styles.previewAvatar]}>
                    <Text style={styles.rentAvatarText}>{getAvatarInitial(r?.nome)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.labelStrong, { color: colors.text }]}>{r?.nome || '-'}</Text>
                  <View style={styles.previewMetaRow}>
                    <MaterialCommunityIcons name="lightning-bolt-outline" size={12} color="#7e57c2" />
                    <Text style={[styles.previewHint, { color: colors.muted }]}>Composição mensal individual</Text>
                  </View>
                </View>
                <View style={styles.previewAmountWrap}>
                  <Text style={[styles.previewAmountLabel, { color: colors.muted }]}>Total</Text>
                  <Text style={[styles.previewAmountValue, { color: colors.text }]}>{brl(r?.total)}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={16} color="#94a3b8" />
              </Pressable>
            ))}
            {!snapshot.residents?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum morador encontrado.</Text>}
            {!!snapshot.residents?.length && (
              <View style={[styles.previewFooter, { borderTopColor: colors.border }]}>
                <Text style={[styles.previewFooterLabel, { color: colors.muted }]}>Valor médio por morador</Text>
                <Text style={[styles.previewFooterValue, { color: colors.primary }]}>{brl(totalContasPorMorador)}</Text>
              </View>
            )}
          </View>

          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.titleRow}>
              <View style={styles.titleIconPill}>
                <MaterialCommunityIcons name="chart-donut" size={15} color="#6a1b9a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroLabel, { color: colors.muted }]}>Resumo Financeiro</Text>
                <Text style={[styles.heroSubLabel, { color: colors.muted }]}>Visão consolidada das despesas da república</Text>
              </View>
            </View>
            <Text style={[styles.heroValue, { color: colors.text }]}>{brl(totalGeral)}</Text>
            <View style={styles.metricGrid}>
              <View style={[styles.metricBox, { borderColor: colors.border }]}>
                <Text style={[styles.metricBoxLabel, { color: colors.muted }]}>Média por Conta</Text>
                <Text style={[styles.metricBoxValue, { color: colors.text }]}>{brl(contasStats.avg)}</Text>
              </View>
              <View style={[styles.metricBox, { borderColor: colors.border }]}>
                <Text style={[styles.metricBoxLabel, { color: colors.muted }]}>Total de Contas</Text>
                <Text style={[styles.metricBoxValue, { color: colors.text }]}>{contasStats.count}</Text>
              </View>
            </View>
            <View style={styles.metricGrid}>
              <View style={[styles.metricBox, { borderColor: colors.border }]}>
                <Text style={[styles.metricBoxLabel, { color: colors.muted }]}>Contas Pagas</Text>
                <Text style={[styles.metricBoxValue, { color: '#2e7d32' }]}>{contasStats.paid}</Text>
              </View>
              <View style={[styles.metricBox, { borderColor: colors.border }]}>
                <Text style={[styles.metricBoxLabel, { color: colors.muted }]}>Contas Pendentes</Text>
                <Text style={[styles.metricBoxValue, { color: '#c62828' }]}>{contasStats.pending}</Text>
              </View>
            </View>
            <View style={styles.heroRow}>
              <View style={[styles.metricPill, { backgroundColor: isDark ? '#2a2232' : '#f3e5f5' }]}>
                <Text style={[styles.metricText, { color: colors.primary }]}>Contas {brl(totalContas)}</Text>
              </View>
              <View style={[styles.metricPill, { backgroundColor: isDark ? '#1f2e29' : '#e8f5e9' }]}>
                <Text style={[styles.metricText, { color: '#2e7d32' }]}>Coletivo {brl(totalColetivos)}</Text>
              </View>
              <View style={[styles.metricPill, { backgroundColor: isDark ? '#302429' : '#ffebee' }]}>
                <Text style={[styles.metricText, { color: '#c62828' }]}>Acertos {brl(totalAcertos)}</Text>
              </View>
            </View>
            <Text style={[styles.heroFootnote, { color: colors.muted }]}>
              Lançamentos: {snapshot.contas.length} contas • {snapshot.gastosColetivos.length} coletivos • {snapshot.acertosIndividuais.length} acertos
            </Text>
          </View>

          <View style={[styles.card, styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <View style={styles.titleRow}>
                <View style={styles.titleIconPill}>
                  <MaterialCommunityIcons name="file-document-outline" size={15} color="#6a1b9a" />
                </View>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Contas Fixas</Text>
                  <Text style={[styles.sectionHint, { color: colors.muted }]}>Despesas recorrentes do mês</Text>
                </View>
              </View>
              <View style={styles.sectionHeadRight}>
                <Text style={[styles.total, { color: colors.primary }]}>Total: {brl(totalContas)}</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{contasOperacionais.length} itens</Text>
                </View>
              </View>
            </View>
            {contasOperacionais.map((c, idx) => {
              const statusMeta = getContaStatusMeta(c);
              const tone = getContaToneStyles(statusMeta.tone, isDark);
              const hintToneStyle = statusMeta.tone === 'paid'
                ? (isDark ? styles.contaHintPaidDark : styles.contaHintPaid)
                : statusMeta.tone === 'overdue'
                  ? (isDark ? styles.contaHintOverdueDark : styles.contaHintOverdue)
                  : (isDark ? styles.contaHintPendingDark : styles.contaHintPending);
              return (
              <View
                key={`c-${idx}`}
                style={[
                  styles.row,
                  styles.entryRow,
                  styles.contaRow,
                  {
                    borderBottomColor: colors.border,
                  },
                  tone.row,
                ]}
              >
                <View style={styles.entryMain}>
                  <Text style={[styles.label, { color: tone.textColor }]}>{c?.conta || '-'}</Text>
                  <Text
                    style={[
                      styles.rentHint,
                      hintToneStyle,
                    ]}
                  >
                    Status: {statusMeta.label}
                    {statusMeta.dueDay ? ` • Vence dia ${statusMeta.dueDay}` : ' • Vencimento nao informado'}
                  </Text>
                </View>
                <View style={styles.entryAside}>
                  <Text style={[styles.value, styles.entryValue, styles.valueEmphasis, { color: tone.textColor }]}>{brl(c?.valor)}</Text>
                  <View style={styles.entryActionsRow}>
                    <Pressable style={[styles.iconBtn, String(c?.status || '').toUpperCase() === 'TRUE' && styles.iconBtnOk]} onPress={() => onToggleConta(c, idx)}>
                      <MaterialCommunityIcons name={String(c?.status || '').toUpperCase() === 'TRUE' ? 'check-circle' : 'clock-outline'} size={16} color={String(c?.status || '').toUpperCase() === 'TRUE' ? '#fff' : '#6a1b9a'} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => openEditModal('contaFixa', c, idx)}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#6a1b9a" />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => onDeleteEntry('contaFixa', c, idx)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
                    </Pressable>
                  </View>
                </View>
              </View>
              );
            })}
            {!contasOperacionais.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhuma conta fixa encontrada.</Text>}
            {!!contasOperacionais.length && (
              <View style={[styles.row, styles.fixedSplitRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.label, styles.fixedSplitLabel]}>Total por morador ({moradoresCount})</Text>
                <Text style={[styles.value, styles.fixedSplitValue]}>{brl(totalContasPorMorador)}</Text>
              </View>
            )}
          </View>

          <View style={[styles.card, styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <View style={styles.titleRow}>
                <View style={styles.titleIconPill}>
                  <MaterialCommunityIcons name="cart-outline" size={15} color="#6a1b9a" />
                </View>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Gastos Coletivos</Text>
                  <Text style={[styles.sectionHint, { color: colors.muted }]}>Compras e despesas compartilhadas</Text>
                </View>
              </View>
              <View style={styles.sectionHeadRight}>
                <Text style={[styles.total, { color: colors.primary }]}>Total: {brl(totalColetivos)}</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{snapshot.gastosColetivos.length} itens</Text>
                </View>
              </View>
            </View>
            {(snapshot.gastosColetivos || []).map((g, idx) => (
              <View key={`g-${idx}`} style={[styles.row, styles.entryRow, { borderBottomColor: colors.border }]}>
                <View style={styles.entryMain}>
                  <Text style={[styles.label, { color: colors.text }]}>{g?.quem} - {g?.oQue || g?.descricao || '-'}</Text>
                  {!!String(g?.obs || g?.observacao || '').trim() && (
                    <View style={[styles.obsChip, { backgroundColor: isDark ? '#2d3342' : '#f1f5f9' }]}>
                      <MaterialCommunityIcons name="note-text-outline" size={12} color="#64748b" />
                      <Text style={[styles.obsChipText, { color: colors.text }]}>Obs: {g?.obs || g?.observacao}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.entryAside}>
                  <Text style={[styles.value, styles.entryValue, styles.valueEmphasis, { color: colors.text }]}>{brl(g?.quanto || g?.valor)}</Text>
                  <View style={styles.entryActionsRow}>
                    <Pressable style={styles.iconBtn} onPress={() => openEditModal('gastoColetivo', g, idx)}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#6a1b9a" />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => onDeleteEntry('gastoColetivo', g, idx)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
            {!snapshot.gastosColetivos?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum gasto coletivo encontrado.</Text>}
            {!!snapshot.gastosColetivos?.length && (
              <View style={[styles.row, styles.fixedSplitRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.label, styles.fixedSplitLabel]}>Total por morador ({moradoresCount})</Text>
                <Text style={[styles.value, styles.fixedSplitValue]}>{brl(totalColetivosPorMorador)}</Text>
              </View>
            )}
          </View>

          <View style={[styles.card, styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <View style={styles.titleRow}>
                <View style={styles.titleIconPill}>
                  <MaterialCommunityIcons name="handshake-outline" size={15} color="#6a1b9a" />
                </View>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Acertos Individuais</Text>
                  <Text style={[styles.sectionHint, { color: colors.muted }]}>Quem deve e quem recebe</Text>
                </View>
              </View>
              <View style={styles.sectionHeadRight}>
                <Text style={[styles.total, { color: colors.primary }]}>Total: {brl(totalAcertos)}</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{snapshot.acertosIndividuais.length} itens</Text>
                </View>
              </View>
            </View>
            {(snapshot.acertosIndividuais || []).map((a, idx) => (
              <View key={`a-${idx}`} style={[styles.row, styles.entryRow, { borderBottomColor: colors.border }]}>
                <View style={styles.entryMain}>
                  <Text style={[styles.label, { color: colors.text }]}>Deve: {a?.quem || '-'}</Text>
                  <Text style={[styles.rentHint, { color: colors.muted }]}>Emprestou: {a?.paraQuem || '-'}</Text>
                  {!!String(a?.obs || a?.observacao || '').trim() && (
                    <View style={[styles.obsChip, { backgroundColor: isDark ? '#2d3342' : '#f1f5f9' }]}>
                      <MaterialCommunityIcons name="note-text-outline" size={12} color="#64748b" />
                      <Text style={[styles.obsChipText, { color: colors.text }]}>Obs: {a?.obs || a?.observacao}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.entryAside}>
                  <Text style={[styles.value, styles.entryValue, styles.valueEmphasis, { color: colors.text }]}>{brl(a?.deveQuanto || a?.valor)}</Text>
                  <View style={styles.entryActionsRow}>
                    <Pressable style={styles.iconBtn} onPress={() => openEditModal('acertoIndividual', a, idx)}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#6a1b9a" />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => onDeleteEntry('acertoIndividual', a, idx)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
            {!snapshot.acertosIndividuais?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum acerto individual encontrado.</Text>}
          </View>

          <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                <View style={styles.modalHead}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {editingItem ? 'Editar lancamento' : 'Novo lancamento'}
                  </Text>
                  <Pressable style={styles.iconBtn} onPress={() => setModalVisible(false)}>
                    <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
                  </Pressable>
                </View>
                <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>
                  {entryType === 'contaFixa' ? 'Conta fixa' : entryType === 'gastoColetivo' ? 'Gasto coletivo' : 'Acerto individual'}
                </Text>

                {entryType === 'contaFixa' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Conta fixa (selecione da lista)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {contasOperacionais.map((c, idx) => {
                        const contaName = c?.conta || '';
                        const active = String(form.conta).toUpperCase() === String(contaName).toUpperCase();
                        return (
                          <Pressable key={`conta-chip-${idx}`} style={[styles.nameChip, active && styles.nameChipActive]} onPress={() => applyContaTemplate(contaName)}>
                            <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{contaName}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    {!contasOperacionais.length && (
                      <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>Nenhuma conta fixa cadastrada para selecionar.</Text>
                    )}
                    <TextInput value={form.valor} onChangeText={(v) => setForm((p) => ({ ...p, valor: formatMoneyInput(v) }))} style={styles.input} placeholder="Valor" keyboardType="decimal-pad" placeholderTextColor="#94a3b8" />
                    <Pressable style={styles.statusToggle} onPress={() => setForm((p) => ({ ...p, status: !p.status }))}>
                      <MaterialCommunityIcons name={form.status ? 'check-circle' : 'clock-outline'} size={17} color={form.status ? '#16a34a' : '#6a1b9a'} />
                      <Text style={[styles.label, { color: colors.text }]}>{form.status ? 'Conta paga' : 'Conta pendente'}</Text>
                    </Pressable>
                  </>
                ) : null}

                {entryType === 'gastoColetivo' ? (
                  <>
                    <TextInput value={form.quem} onChangeText={(v) => setForm((p) => ({ ...p, quem: v }))} style={styles.input} placeholder="Quem pagou" placeholderTextColor="#94a3b8" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || []).map((r, idx) => {
                        const nome = r?.nome || '';
                        const active = String(form.quem).toUpperCase() === String(nome).toUpperCase();
                        return (
                          <Pressable
                            key={`gc-nome-${idx}`}
                            style={[styles.nameChip, active && styles.nameChipActive]}
                            onPress={() =>
                              setForm((p) => ({
                                ...p,
                                quem: nome,
                                dividirCom: (p.dividirCom || []).filter((n) => String(n).toUpperCase() !== String(nome).toUpperCase()),
                              }))
                            }
                          >
                            <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Dividir com (alem de quem pagou)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || [])
                        .filter((r) => String(r?.nome || '').toUpperCase() !== String(form.quem || '').toUpperCase())
                        .map((r, idx) => {
                          const nome = r?.nome || '';
                          const active = (form.dividirCom || []).some((n) => String(n).toUpperCase() === String(nome).toUpperCase());
                          return (
                            <Pressable key={`gc-div-${idx}`} style={[styles.nameChip, active && styles.nameChipActive]} onPress={() => toggleDividirCom(nome)}>
                              <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                            </Pressable>
                          );
                        })}
                    </ScrollView>
                    <TextInput value={form.oQue} onChangeText={(v) => setForm((p) => ({ ...p, oQue: v }))} style={styles.input} placeholder="Descrição" placeholderTextColor="#94a3b8" />
                    <TextInput value={form.quanto} onChangeText={(v) => setForm((p) => ({ ...p, quanto: formatMoneyInput(v) }))} style={styles.input} placeholder="Valor" keyboardType="decimal-pad" placeholderTextColor="#94a3b8" />
                    <Text style={[styles.helper, { color: colors.muted, marginBottom: 6 }]}>
                      Divisao atual: {Math.max(1, 1 + (form.dividirCom || []).length)} pessoas •{' '}
                      {brl(toNumber(form.quanto) / Math.max(1, 1 + (form.dividirCom || []).length))} por pessoa
                    </Text>
                    <TextInput value={form.obs} onChangeText={(v) => setForm((p) => ({ ...p, obs: v }))} style={styles.input} placeholder="Observacao (opcional)" placeholderTextColor="#94a3b8" />
                  </>
                ) : null}

                {entryType === 'acertoIndividual' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Quem deve (devedor principal)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || []).map((r, idx) => {
                        const nome = r?.nome || '';
                        const active = String(form.quem).toUpperCase() === String(nome).toUpperCase();
                        return (
                          <Pressable key={`acerto-deve-${idx}`} style={[styles.nameChip, active && styles.nameChipActive]} onPress={() => setForm((p) => ({ ...p, quem: nome }))}>
                            <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Quem emprestou (credor)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || []).map((r, idx) => {
                        const nome = r?.nome || '';
                        const active = String(form.paraQuem).toUpperCase() === String(nome).toUpperCase();
                        return (
                          <Pressable
                            key={`acerto-para-${idx}`}
                            style={[styles.nameChip, active && styles.nameChipActive]}
                            onPress={() => setForm((p) => ({
                              ...p,
                              paraQuem: nome,
                              quemMulti: (p.quemMulti || []).filter((n) => String(n).toUpperCase() !== String(nome).toUpperCase()),
                            }))}
                          >
                            <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Mais pessoas que devem para o mesmo credor</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || [])
                        .filter((r) => {
                          const nome = String(r?.nome || '').toUpperCase();
                          return nome !== String(form.quem || '').toUpperCase() && nome !== String(form.paraQuem || '').toUpperCase();
                        })
                        .map((r, idx) => {
                          const nome = r?.nome || '';
                          const active = (form.quemMulti || []).some((n) => String(n).toUpperCase() === String(nome).toUpperCase());
                          return (
                            <Pressable key={`acerto-para-multi-${idx}`} style={[styles.nameChip, active && styles.nameChipActive]} onPress={() => toggleQuemMulti(nome)}>
                              <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                            </Pressable>
                          );
                        })}
                    </ScrollView>
                    <TextInput value={form.deveQuanto} onChangeText={(v) => setForm((p) => ({ ...p, deveQuanto: formatMoneyInput(v) }))} style={styles.input} placeholder="Valor" keyboardType="decimal-pad" placeholderTextColor="#94a3b8" />
                    <Text style={[styles.helper, { color: colors.muted, marginBottom: 6 }]}>
                      Divisao do emprestimo: {Math.max(1, 1 + (form.quemMulti || []).length)} devedor(es) •{' '}
                      {brl(toNumber(form.deveQuanto) / Math.max(1, 1 + (form.quemMulti || []).length))} por devedor
                    </Text>
                    <TextInput value={form.obs} onChangeText={(v) => setForm((p) => ({ ...p, obs: v }))} style={styles.input} placeholder="Observacao (opcional)" placeholderTextColor="#94a3b8" />
                  </>
                ) : null}

                <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving} onPress={saveEntry}>
                  <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : editingItem ? 'Salvar alteracoes' : 'Adicionar lancamento'}</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </ScrollView>
      )}

      <Pressable style={styles.fabLeft} onPress={() => setQuickCreateVisible(true)}>
        <MaterialCommunityIcons name="plus" size={24} color="#fff" />
      </Pressable>

          <Modal visible={quickCreateVisible} transparent animationType="fade" onRequestClose={() => setQuickCreateVisible(false)}>
        <View style={styles.quickOverlay}>
              <View style={[styles.quickSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.quickHead}>
                  <Text style={[styles.quickTitle, { color: colors.text }]}>Novo lancamento</Text>
              <Pressable style={styles.quickCloseBtn} onPress={() => setQuickCreateVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
                <Text style={[styles.quickSubtitle, { color: colors.muted }]}>Escolha o tipo para enviar na planilha</Text>
            <Pressable style={styles.quickOption} onPress={openContaPickerFromFab}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="playlist-edit" size={16} color="#6a1b9a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Alterar valor conta fixa</Text>
                <Text style={styles.quickOptionText}>Escolha uma conta da lista para editar</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
            <Pressable style={styles.quickOption} onPress={() => openCreateFromFab('gastoColetivo')}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="cart-plus" size={16} color="#6a1b9a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Gasto coletivo</Text>
                <Text style={styles.quickOptionText}>Registrar compra ou despesa compartilhada</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
            <Pressable style={styles.quickOption} onPress={openGastoDeletePickerFromFab}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Excluir gasto coletivo</Text>
                <Text style={styles.quickOptionText}>Selecione um gasto para remover</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
            <Pressable style={styles.quickOption} onPress={() => openCreateFromFab('acertoIndividual')}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="handshake-outline" size={16} color="#6a1b9a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Acerto individual</Text>
                <Text style={styles.quickOptionText}>Registrar quem deve e para quem</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
            <Pressable style={styles.quickOption} onPress={openAcertoDeletePickerFromFab}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Excluir acerto individual</Text>
                <Text style={styles.quickOptionText}>Selecione um acerto para remover</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={pickContaVisible} transparent animationType="slide" onRequestClose={() => setPickContaVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Selecionar conta fixa</Text>
              <Pressable style={styles.iconBtn} onPress={() => setPickContaVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>
              Toque em uma conta para editar valor e status.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {contasOperacionais.map((conta, idx) => (
                <Pressable
                  key={`pick-conta-${conta?.rowIndex || idx}`}
                  style={styles.statementRow}
                  onPress={() => {
                    setPickContaVisible(false);
                    openEditModal('contaFixa', conta, idx);
                  }}
                >
                  <Text style={[styles.label, { color: colors.text }]}>{conta?.conta || 'Conta'}</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{brl(conta?.valor || 0)}</Text>
                </Pressable>
              ))}
              {!contasOperacionais.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhuma conta fixa disponivel.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={pickGastoDeleteVisible} transparent animationType="slide" onRequestClose={() => setPickGastoDeleteVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Excluir gasto coletivo</Text>
              <Pressable style={styles.iconBtn} onPress={() => setPickGastoDeleteVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>
              Toque no gasto que deseja excluir.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {(snapshot.gastosColetivos || []).map((gasto, idx) => (
                <Pressable
                  key={`pick-gasto-delete-${gasto?.rowIndex || idx}`}
                  style={styles.statementRow}
                  onPress={() => {
                    setPickGastoDeleteVisible(false);
                    onDeleteEntry('gastoColetivo', gasto, idx);
                  }}
                >
                  <Text style={[styles.label, { color: colors.text }]}>
                    {gasto?.quem || '-'} - {gasto?.oQue || gasto?.descricao || 'Sem descricao'}
                  </Text>
                  <Text style={[styles.value, { color: colors.text }]}>{brl(gasto?.quanto || gasto?.valor || 0)}</Text>
                </Pressable>
              ))}
              {!snapshot.gastosColetivos?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum gasto coletivo disponivel.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={pickAcertoDeleteVisible} transparent animationType="slide" onRequestClose={() => setPickAcertoDeleteVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Excluir acerto individual</Text>
              <Pressable style={styles.iconBtn} onPress={() => setPickAcertoDeleteVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>
              Toque no acerto que deseja excluir.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {(snapshot.acertosIndividuais || []).map((acerto, idx) => (
                <Pressable
                  key={`pick-acerto-delete-${acerto?.rowIndex || idx}`}
                  style={styles.statementRow}
                  onPress={() => {
                    setPickAcertoDeleteVisible(false);
                    onDeleteEntry('acertoIndividual', acerto, idx);
                  }}
                >
                  <Text style={[styles.label, { color: colors.text }]}>
                    {acerto?.quem || '-'} para {acerto?.paraQuem || '-'}
                  </Text>
                  <Text style={[styles.value, { color: colors.text }]}>{brl(acerto?.deveQuanto || acerto?.valor || 0)}</Text>
                </Pressable>
              ))}
              {!snapshot.acertosIndividuais?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum acerto individual disponivel.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={rentDetailVisible} transparent animationType="slide" onRequestClose={() => setRentDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Extrato do Aluguel</Text>
              <Pressable style={styles.iconBtn} onPress={() => setRentDetailVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.helper, { color: colors.muted, marginBottom: 6 }]}>
              {rentDetailResident?.nome || '-'} • {formatMonthReference(snapshot.mesReferencia)}
            </Text>
            <Text style={[styles.heroValue, { color: colors.text, fontSize: 24, marginTop: 0, marginBottom: 8 }]}>{brl(rentDetailResident?.total || 0)}</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {detailItems.map(([label, key]) => {
                const raw = rentDetailResident?.[key];
                const meta = getBreakdownMeta(raw, key);
                return (
                  <View key={key} style={styles.statementRow}>
                    <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
                    <Text style={[styles.value, { color: meta.color }]}>{meta.text}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 36 },
  kpiStrip: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  kpiPill: { flexGrow: 1, minWidth: '31%', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(106,27,154,0.12)' },
  kpiPillLabel: { fontSize: 10, fontWeight: '700' },
  kpiPillValue: { fontSize: 12, fontWeight: '900', marginTop: 2 },
  heroCard: { borderRadius: 20, borderWidth: 1, padding: 15, shadowColor: '#0f172a', shadowOpacity: 0.07, shadowRadius: 11, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  highlightCard: { borderRadius: 20, borderWidth: 1.5, padding: 14, shadowColor: '#6a1b9a', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
  highlightTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
  previewSubTitle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  previewResidentCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, backgroundColor: 'rgba(106,27,154,0.03)' },
  previewAvatar: { backgroundColor: '#7e57c2' },
  previewMetaRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewHint: { fontSize: 10, fontWeight: '600' },
  previewAmountWrap: { alignItems: 'flex-end' },
  previewAmountLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  previewAmountValue: { marginTop: 1, fontSize: 14, fontWeight: '900' },
  previewFooter: { marginTop: 2, paddingTop: 10, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewFooterLabel: { fontSize: 11, fontWeight: '700' },
  previewFooterValue: { fontSize: 13, fontWeight: '900' },
  livePill: { borderRadius: 999, backgroundColor: '#f3e8ff', paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveBadge: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 },
  titleIconPill: { width: 24, height: 24, borderRadius: 999, backgroundColor: '#f3e5f5', alignItems: 'center', justifyContent: 'center' },
  heroLabel: { fontSize: 12, fontWeight: '700' },
  heroSubLabel: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  heroValue: { fontSize: 30, fontWeight: '900', marginTop: 4, marginBottom: 12, letterSpacing: -0.6 },
  heroRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metricPill: { flexGrow: 1, minWidth: '31%', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 8 },
  metricText: { fontSize: 10, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  metricBox: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 9 },
  metricBoxLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  metricBoxValue: { fontSize: 12, fontWeight: '800' },
  heroFootnote: { fontSize: 10, fontWeight: '600', marginTop: 8 },
  header: {
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  helper: { marginTop: 2, fontSize: 11, fontWeight: '500' },
  syncPill: { marginTop: 7, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncPillText: { color: '#2e7d32', fontSize: 10, fontWeight: '800' },
  themeBtn: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', gap: 6, alignItems: 'center' },
  themeBtnText: { fontSize: 12, fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: 1, padding: 13 },
  sectionCard: { shadowColor: '#0f172a', shadowOpacity: 0.055, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 9, flexWrap: 'wrap' },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  sectionHint: { marginTop: 2, fontSize: 10, fontWeight: '600' },
  sectionHeadRight: { alignItems: 'flex-end', gap: 4, marginLeft: 'auto' },
  countPill: { borderRadius: 999, backgroundColor: '#f3e8ff', paddingHorizontal: 8, paddingVertical: 3 },
  countPillText: { color: '#6a1b9a', fontSize: 10, fontWeight: '800' },
  total: { fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  entryRow: { alignItems: 'flex-start', gap: 10 },
  entryMain: { flex: 1, minWidth: 0 },
  entryAside: { minWidth: 96, maxWidth: 126, alignItems: 'flex-end', gap: 6 },
  entryActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  entryValue: { fontSize: 13, fontWeight: '900' },
  valueEmphasis: { fontSize: 15, letterSpacing: -0.2 },
  contaRow: { borderRadius: 12, paddingHorizontal: 10, marginBottom: 6, borderWidth: 1, borderBottomWidth: 1 },
  contaRowPaid: { backgroundColor: '#ecfdf3', borderColor: '#86efac' },
  contaRowPending: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  contaRowOverdue: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  contaRowPaidDark: { backgroundColor: '#14532d', borderColor: '#22c55e' },
  contaRowPendingDark: { backgroundColor: '#78350f', borderColor: '#f59e0b' },
  contaRowOverdueDark: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },
  label: { flex: 1, paddingRight: 8, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  value: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  fixedSplitRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 11 },
  fixedSplitLabel: { color: '#6a1b9a', fontWeight: '800' },
  fixedSplitValue: { color: '#4a148c', fontSize: 13, fontWeight: '900' },
  iconBtn: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5', marginLeft: 0, flexShrink: 0, borderWidth: 1, borderColor: 'rgba(106,27,154,0.12)' },
  iconBtnOk: { backgroundColor: '#16a34a' },
  error: { color: '#ef4444', fontWeight: '700', marginBottom: 4 },
  retryBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6a1b9a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 8 },
  retryBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rentItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  rentItemStrong: { paddingVertical: 11 },
  rentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  rentAvatarPhoto: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff' },
  rentAvatarStrong: { width: 34, height: 34, borderRadius: 17 },
  rentAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  labelStrong: { flex: 1, paddingRight: 8, fontSize: 13, fontWeight: '800' },
  valueStrong: { fontSize: 14, fontWeight: '900' },
  rentHint: { fontSize: 11, fontWeight: '600' },
  obsChip: { marginTop: 5, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  obsChipText: { fontSize: 11, fontWeight: '700', lineHeight: 15, flex: 1 },
  contaHintPaid: { color: '#166534' },
  contaHintPending: { color: '#b45309' },
  contaHintOverdue: { color: '#b91c1c' },
  contaHintPaidDark: { color: '#bbf7d0' },
  contaHintPendingDark: { color: '#fde68a' },
  contaHintOverdueDark: { color: '#fecdd3' },
  empty: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, color: '#111827', fontWeight: '600', backgroundColor: '#fff' },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 2 },
  nameChipRow: { gap: 8, paddingBottom: 8, marginBottom: 2 },
  nameChip: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  nameChipActive: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
  nameChipText: { color: '#374151', fontSize: 11, fontWeight: '800' },
  nameChipTextActive: { color: '#fff' },
  statusToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 },
  saveBtn: { backgroundColor: '#6a1b9a', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6, shadowColor: '#6a1b9a', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  saveBtnText: { color: '#fff', fontWeight: '800' },
  statementRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  fabLeft: {
    position: 'absolute',
    left: 16,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#6a1b9a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6a1b9a',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  quickOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  quickSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24, gap: 10, borderTopWidth: 1, borderColor: 'rgba(106,27,154,0.14)' },
  quickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quickTitle: { fontSize: 16, fontWeight: '800' },
  quickSubtitle: { fontSize: 12, fontWeight: '600', marginTop: -4 },
  quickCloseBtn: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5' },
  quickOption: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(106,27,154,0.03)' },
  quickOptionIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center' },
  quickOptionTitle: { color: '#111827', fontSize: 13, fontWeight: '800' },
  quickOptionText: { color: '#6b7280', fontSize: 11, fontWeight: '600', marginTop: 2 },
});
