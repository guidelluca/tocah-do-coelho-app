import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { useResident } from '../context/ResidentContext';
import { adminAcao, adminDefinirPin, adminEntrar, adminPainel, adminStatus } from '../services/api';
import { invalidateResources } from '../data/store';
import { displayName, sameName } from '../utils/text';
import { shareText } from '../utils/share';
import { prazoCurto, statusInfo } from './tasks';
import { AppText, Avatar, BottomSheet, Button, Card, Chip, Divider, EmptyState, Icon, SkeletonCard, StatusPill, TextField, useFeedback } from './ui';

const TOKEN_KEY = '@tocah_admin_token';
export const ADMIN = 'GUILHERME';
const RESIDENTES = ['ALLAN', 'RAMON', 'VITOR', 'GUSTAVO', 'GUILHERME'];
const DAY = 24 * 60 * 60 * 1000;
const TZ = 'America/Sao_Paulo';

const fmtDia = (ms) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short' }).replace('.', '')} ${d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' })}`;
};
const ymd = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
const isoDe = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

const TIPOS = {
  prazo: { label: 'Mudar prazo', icon: 'calendar-edit', data: true },
  tolerancia: { label: 'Mudar tolerância (limite com atraso)', icon: 'calendar-clock', data: true },
  abono: { label: 'Abonar atraso', icon: 'check-circle-outline' },
  dispensa: { label: 'Dispensar da semana', icon: 'airplane' },
  tarefa: { label: 'Trocar tarefa', icon: 'swap-horizontal' },
};

/* ---------------- PIN / sessão ---------------- */

function useAdminSession() {
  const [token, setToken] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY).then((t) => setToken(t || ''), () => setToken(''));
  }, []);
  const save = useCallback(async (t) => {
    setToken(t || '');
    try {
      if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
      else await AsyncStorage.removeItem(TOKEN_KEY);
    } catch {
      /* armazenamento indisponível: fica só nesta sessão */
    }
  }, []);
  return { token, save };
}

function PinGate({ onToken }) {
  const { spacing } = useTheme();
  const { toast, toastError } = useFeedback();
  const [status, setStatus] = useState(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    adminStatus().then(setStatus, (e) => toastError(e, 'Não deu para falar com o servidor.'));
  }, [toastError]);
  if (!status) return <SkeletonCard lines={2} />;
  const criando = !status.temPin;
  const enviar = async () => {
    if (criando && pin !== pin2) {
      toast('Os dois PINs não batem.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = criando ? await adminDefinirPin({ usuario: ADMIN, pin }) : await adminEntrar({ usuario: ADMIN, pin });
      onToken(res.adminToken);
      toast(criando ? 'PIN criado. Bem-vindo à administração.' : 'Administração liberada.', 'success');
    } catch (e) {
      toastError(e, 'PIN não aceito.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={[styles.row, { gap: spacing.md, marginBottom: spacing.md }]}>
        <Icon name="shield-lock-outline" size={32} color="primary" />
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{criando ? 'Crie o PIN da administração' : 'Administração'}</AppText>
          <AppText variant="caption" color="textMuted">
            {criando ? 'Só você (Guilherme) usa. O PIN protege prazos, multas e regras — mesmo que alguém escolha seu nome no app.' : 'Digite seu PIN para mexer em prazos, multas e regras.'}
          </AppText>
        </View>
      </View>
      <TextField label="PIN (4 a 8 números)" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" secureTextEntry autoFocus />
      {criando && <TextField label="Repita o PIN" value={pin2} onChangeText={(v) => setPin2(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" secureTextEntry />}
      <Button label={criando ? 'Criar PIN' : 'Entrar'} icon="lock-open-outline" onPress={enviar} loading={busy} disabled={pin.length < 4} full />
    </Card>
  );
}

/* ---------------- Ajuste (data, dispensa, troca...) ---------------- */

function AjusteSheet({ alvo, semana, onClose, onSalvo, token }) {
  const { spacing } = useTheme();
  const { toast, toastError } = useFeedback();
  const [tipo, setTipo] = useState('prazo');
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('23:59');
  const [motivo, setMotivo] = useState('');
  const [tarefa, setTarefa] = useState('');
  const [busy, setBusy] = useState(false);
  const geral = alvo?.nome === '*';
  const tipos = geral ? ['prazo', 'tolerancia', 'fechamento'] : Object.keys(TIPOS);
  const baseMs = semana?.inicio ? Date.parse(semana.inicio) + 12 * 60 * 60 * 1000 : Date.now();
  const dias = useMemo(() => Array.from({ length: 17 }, (_, i) => baseMs + i * DAY), [baseMs]);
  useEffect(() => {
    if (!alvo) return;
    setTipo(geral ? 'prazo' : 'prazo');
    const atual = geral ? semana?.prazo : alvo.prazo;
    setDia(atual ? ymd(Date.parse(atual)) : '');
    setHora('23:59');
    setMotivo('');
    setTarefa(alvo.tarefa || '');
  }, [alvo, geral, semana]);
  useEffect(() => {
    if (!alvo) return;
    const atual = tipo === 'tolerancia' ? (geral ? semana?.tolerancia : alvo.tolerancia) : tipo === 'fechamento' ? semana?.fechamento : geral ? semana?.prazo : alvo.prazo;
    if (atual) setDia(ymd(Date.parse(atual)));
  }, [tipo, alvo, geral, semana]);
  if (!alvo || !semana) return null;
  const precisaData = ['prazo', 'tolerancia', 'fechamento'].includes(tipo);
  const label = tipo === 'fechamento' ? 'Mudar fechamento da avaliação' : TIPOS[tipo]?.label;
  const salvar = async () => {
    setBusy(true);
    try {
      await adminAcao('adminAjuste', {
        adminToken: token,
        ciclo: semana.key,
        morador: alvo.nome,
        tipo,
        valor: precisaData ? isoDe(dia, hora) : tipo === 'tarefa' ? tarefa.trim() : '1',
        motivo: motivo.trim(),
      });
      toast('Ajuste salvo. Todo mundo já vê no app.', 'success');
      invalidateResources('avaliacao', 'feed', 'escala');
      onSalvo?.();
      onClose();
    } catch (e) {
      toastError(e, 'Não deu para salvar o ajuste.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet
      visible
      onClose={() => !busy && onClose()}
      title={geral ? `Prazos da casa · ${semana.periodo}` : `${displayName(alvo.nome)} · ${semana.periodo}`}
      footer={<Button label="Salvar ajuste" icon="content-save-outline" onPress={salvar} loading={busy} disabled={(precisaData && !dia) || (tipo === 'tarefa' && !tarefa.trim())} style={{ flex: 1 }} />}
    >
      <AppText variant="captionStrong" color="textMuted">O que fazer</AppText>
      <View style={[styles.wrap, { gap: spacing.sm, marginVertical: spacing.sm }]}>
        {tipos.map((t) => (
          <Chip key={t} label={t === 'fechamento' ? 'Fechamento da avaliação' : TIPOS[t].label} icon={t === 'fechamento' ? 'flag-checkered' : TIPOS[t].icon} selected={tipo === t} onPress={() => setTipo(t)} />
        ))}
      </View>
      <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>{label}</AppText>
      {precisaData && (
        <>
          <AppText variant="captionStrong" color="textMuted">Dia</AppText>
          <View style={[styles.wrap, { gap: spacing.xs, marginVertical: spacing.sm }]}>
            {dias.map((ms) => (
              <Chip key={ms} label={fmtDia(ms)} selected={dia === ymd(ms)} onPress={() => setDia(ymd(ms))} />
            ))}
          </View>
          <AppText variant="captionStrong" color="textMuted">Horário</AppText>
          <View style={[styles.wrap, { gap: spacing.xs, marginVertical: spacing.sm }]}>
            {['12:00', '18:00', '22:00', '23:59'].map((h) => (
              <Chip key={h} label={h.replace(':', 'h')} selected={hora === h} onPress={() => setHora(h)} />
            ))}
          </View>
          {!!dia && <AppText variant="caption" color="primary">Novo: {prazoCurto(isoDe(dia, hora))}</AppText>}
        </>
      )}
      {tipo === 'tarefa' && <TextField label="Tarefa desta semana" value={tarefa} onChangeText={setTarefa} placeholder="Ex.: Cozinha" />}
      {tipo === 'dispensa' && <AppText variant="caption" color="textMuted">Não precisa entregar, não é avaliado e não leva multa nesta semana.</AppText>}
      {tipo === 'abono' && <AppText variant="caption" color="textMuted">A entrega conta como no prazo, mesmo se chegar atrasada.</AppText>}
      <TextField label="Motivo (aparece no registro)" value={motivo} onChangeText={setMotivo} placeholder="Ex.: viagem, prova, combinado na reunião" style={{ marginTop: spacing.md }} />
    </BottomSheet>
  );
}

function MotivoSheet({ visible, titulo, texto, botao, onConfirm, onClose, busy }) {
  const [motivo, setMotivo] = useState('');
  useEffect(() => {
    if (visible) setMotivo('');
  }, [visible]);
  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} title={titulo} footer={<Button label={botao} onPress={() => onConfirm(motivo.trim())} loading={busy} style={{ flex: 1 }} />}>
      {!!texto && <AppText variant="body" color="textMuted" style={{ marginBottom: 12 }}>{texto}</AppText>}
      <TextField label="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Opcional" />
    </BottomSheet>
  );
}

/* ---------------- Seções ---------------- */

function SemanaAdmin({ painel, token, reload }) {
  const { spacing } = useTheme();
  const { toast, toastError } = useFeedback();
  const semanas = painel.semanas || [];
  const padrao = semanas.find((s) => s.phase === 'avaliacao') || semanas.find((s) => !s.futura && s.phase === 'entregas' && s.residents.some((r) => r.status === 'atrasada')) || semanas.find((s) => !s.futura && s.key === painel.semanas[1]?.key) || semanas[0];
  const [key, setKey] = useState(padrao?.key);
  const [ajuste, setAjuste] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const semana = semanas.find((s) => s.key === key) || padrao;
  if (!semana) return <EmptyState icon="calendar-blank-outline" title="Sem semanas" compact />;
  const ajustes = (painel.ajustes || []).filter((a) => a.ciclo === semana.key && a.ativo);
  const pendentes = semana.residents.filter((r) => r.status === 'no_prazo' || r.status === 'atrasada');

  const acao = async (action, data, ok) => {
    setBusy(true);
    try {
      const res = await adminAcao(action, { adminToken: token, ...data });
      toast(res?.message || ok, 'success');
      invalidateResources('avaliacao', 'feed', 'escala', 'caixinha');
      await reload();
      setConfirm(null);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const cobrarWhats = async () => {
    const linhas = semana.phase === 'avaliacao'
      ? Object.entries(semana.avaliacoes?.porAvaliador || {}).filter(([, v]) => v.total > v.feitas).map(([n, v]) => `• ${displayName(n)}: faltam ${v.total - v.feitas} notas`)
      : pendentes.map((r) => `• ${displayName(r.nome)} (${r.tarefa})${r.status === 'atrasada' ? ` — atrasada ${r.atrasoDias}d` : ''}`);
    if (!linhas.length) {
      toast('Ninguém pendente. 🎉', 'info');
      return;
    }
    const titulo = semana.phase === 'avaliacao' ? `⭐ Avaliação da semana ${semana.periodo} — falta:` : `📸 Tarefas da semana ${semana.periodo} — falta a foto de:`;
    const texto = `${titulo}\n${linhas.join('\n')}\n\nManda pelo app: https://guidelluca.github.io/tocah-do-coelho-app/`;
    try {
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(texto)}`);
    } catch {
      const r = await shareText(texto);
      if (r === 'copied') toast('Mensagem copiada. Cole no grupo.', 'success');
    }
  };

  return (
    <>
      <View style={[styles.wrap, { gap: spacing.sm, marginBottom: spacing.md }]}>
        {semanas.map((s, i) => (
          <Chip key={s.key} label={`${['Passada', 'Esta', 'Próxima'][i] || s.key} · ${s.periodo}`} selected={s.key === semana.key} onPress={() => setKey(s.key)} />
        ))}
      </View>

      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.rowBetween}>
          <AppText variant="heading">Semana {semana.periodo}</AppText>
          <StatusPill label={{ entregas: 'Entregas', avaliacao: 'Em avaliação', encerrada: 'Encerrada' }[semana.phase]} tone={semana.phase === 'avaliacao' ? 'primary' : semana.phase === 'encerrada' ? 'neutral' : 'warning'} />
        </View>
        <View style={{ marginTop: spacing.sm, gap: 2 }}>
          <AppText variant="caption" color="textMuted">Prazo: {prazoCurto(semana.prazo)} · Lavanderia {prazoCurto(semana.prazoLavanderia)}</AppText>
          <AppText variant="caption" color="textMuted">Tolerância até: {prazoCurto(semana.tolerancia)}</AppText>
          <AppText variant="caption" color="textMuted">Avaliação fecha: {prazoCurto(semana.fechamento)} · {semana.avaliacoes?.feitas || 0}/{semana.avaliacoes?.esperadas || 0} notas</AppText>
        </View>
        {semana.phase !== 'encerrada' && (
          <View style={[styles.wrap, { gap: spacing.sm, marginTop: spacing.md }]}>
            <Button label="Prazos da casa" icon="calendar-edit" size="sm" variant="secondary" onPress={() => setAjuste({ nome: '*' })} />
            {semana.phase === 'entregas' && <Button label="Abrir avaliação agora" icon="star-outline" size="sm" variant="secondary" onPress={() => setConfirm({ action: 'adminAjuste', data: { ciclo: semana.key, morador: '*', tipo: 'abrir_avaliacao' }, titulo: 'Abrir a avaliação agora?', texto: 'Quem ainda não entregou fica sem nota (pode entregar até a tolerância, mas a galera já começa a avaliar).', botao: 'Abrir avaliação' })} />}
            {semana.phase === 'avaliacao' && <Button label="Fechar avaliação agora" icon="flag-checkered" size="sm" variant="secondary" onPress={() => setConfirm({ action: 'adminAjuste', data: { ciclo: semana.key, morador: '*', tipo: 'fechar_avaliacao' }, titulo: 'Fechar a avaliação agora?', texto: 'O resultado é calculado com as notas que já existem e as multas da regra são lançadas.', botao: 'Fechar e calcular' })} />}
            <Button label="Cobrar por e-mail" icon="email-fast-outline" size="sm" variant="secondary" onPress={() => acao('adminCobrar', { ciclo: semana.key, tipo: semana.phase === 'avaliacao' ? 'avaliacao' : 'entrega' }, 'Cobrança agendada.')} disabled={busy} />
            <Button label="Cobrar no WhatsApp" icon="whatsapp" size="sm" variant="secondary" onPress={cobrarWhats} />
          </View>
        )}
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <AppText variant="heading" style={{ marginBottom: spacing.xs }}>Moradores</AppText>
        {semana.residents.map((r, i) => {
          const info = r.status === 'dispensado' ? { label: 'Dispensado', tone: 'neutral', icon: 'airplane' } : statusInfo(r);
          return (
            <View key={r.nome}>
              <View style={[styles.row, { gap: spacing.md, paddingVertical: spacing.sm }]}>
                <Avatar name={r.nome} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{displayName(r.nome)}{r.ajustado ? ' ✎' : ''}</AppText>
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>{r.tarefa}{r.extra ? ' + Banheirão' : ''} · prazo {prazoCurto(r.prazo)}</AppText>
                  <StatusPill {...info} style={{ alignSelf: 'flex-start', marginTop: 2 }} />
                </View>
                {semana.phase !== 'encerrada' && (
                  <View style={{ gap: spacing.xs }}>
                    <Button label="Ajustar" size="sm" variant="secondary" onPress={() => setAjuste(r)} />
                    {r.status === 'entregue' && (
                      <Button label="Apagar entrega" size="sm" variant="ghost" onPress={() => setConfirm({ action: 'adminApagarEntrega', data: { ciclo: semana.key, morador: r.nome }, titulo: `Apagar a entrega de ${displayName(r.nome)}?`, texto: 'As fotos saem da avaliação e a pessoa pode mandar de novo. Notas já dadas para essa entrega continuam salvas.', botao: 'Apagar entrega', motivo: true })} />
                    )}
                  </View>
                )}
              </View>
              {i < semana.residents.length - 1 && <Divider />}
            </View>
          );
        })}
      </Card>

      {semana.phase === 'avaliacao' && !!painel.links && (
        <Card style={{ marginBottom: spacing.md }}>
          <AppText variant="heading">Links de avaliação</AppText>
          <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>Cada um tem o seu (é o mesmo do e-mail). Dá pra mandar no privado.</AppText>
          {RESIDENTES.map((n) => (
            <View key={n} style={[styles.rowBetween, { paddingVertical: spacing.xs }]}>
              <AppText variant="body">{displayName(n)} · {semana.avaliacoes?.porAvaliador?.[n]?.feitas || 0}/{semana.avaliacoes?.porAvaliador?.[n]?.total || 0}</AppText>
              <Button label="Compartilhar" icon="share-variant" size="sm" variant="ghost" onPress={async () => {
                const r = await shareText(`${displayName(n)}, avalia as tarefas da semana aqui: ${painel.links[n]}`);
                if (r === 'copied') toast('Link copiado.', 'success');
              }} />
            </View>
          ))}
        </Card>
      )}

      <Card style={{ marginBottom: spacing.md }}>
        <AppText variant="heading">Ajustes desta semana</AppText>
        {!ajustes.length && <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>Nenhum ajuste. Tudo seguindo a regra.</AppText>}
        {ajustes.map((a) => (
          <View key={a.id} style={[styles.row, { gap: spacing.sm, paddingVertical: spacing.sm }]}>
            <Icon name={(TIPOS[a.tipo] || {}).icon || 'tune'} color="primary" />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{a.morador === '*' ? 'Casa toda' : displayName(a.morador)} · {(TIPOS[a.tipo] || {}).label || a.tipo.replace('_', ' ')}</AppText>
              <AppText variant="caption" color="textMuted">{/T/.test(a.valor) ? prazoCurto(a.valor) : a.tipo === 'tarefa' ? a.valor : ''}{a.motivo ? ` · ${a.motivo}` : ''}</AppText>
            </View>
            {semana.phase !== 'encerrada' && <Button label="Desfazer" size="sm" variant="ghost" onPress={() => acao('adminDesfazerAjuste', { id: a.id }, 'Desfeito.')} disabled={busy} />}
          </View>
        ))}
      </Card>

      {!!ajuste && <AjusteSheet alvo={ajuste} semana={semana} token={token} onClose={() => setAjuste(null)} onSalvo={reload} />}
      <MotivoSheet
        visible={!!confirm}
        titulo={confirm?.titulo}
        texto={confirm?.texto}
        botao={confirm?.botao || 'Confirmar'}
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={(motivo) => acao(confirm.action, { ...confirm.data, motivo }, 'Feito.')}
      />
    </>
  );
}

function MultasAdmin({ painel, token, reload }) {
  const { spacing } = useTheme();
  const { toast, toastError } = useFeedback();
  const [retirar, setRetirar] = useState(null);
  const [decidir, setDecidir] = useState(null);
  const [nova, setNova] = useState(false);
  const [morador, setMorador] = useState('');
  const [valor, setValor] = useState(String(painel.regras?.avaliacaoMultaValor ?? 60));
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const multas = painel.multas || [];
  const atual = painel.semanas?.[1]?.key;
  const run = async (action, data) => {
    setBusy(true);
    try {
      const res = await adminAcao(action, { adminToken: token, ...data });
      toast(res?.message || 'Feito.', 'success');
      invalidateResources('caixinha', 'avaliacao');
      await reload();
      setRetirar(null);
      setDecidir(null);
      setNova(false);
      setMotivo('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.rowBetween}>
          <AppText variant="heading">Multas</AppText>
          <Button label="Lançar multa" icon="plus" size="sm" variant="secondary" onPress={() => setNova(true)} />
        </View>
        {!multas.length && <EmptyState icon="emoticon-happy-outline" title="Nenhuma multa" message="Quando a avaliação fechar e a regra bater, aparece aqui." compact />}
        {multas.map((m, i) => (
          <View key={`${m.ciclo}-${m.nome}-${i}`}>
            <View style={[styles.row, { gap: spacing.md, paddingVertical: spacing.sm }]}>
              <Avatar name={m.nome} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="bodyStrong">{displayName(m.nome)} · R$ {m.valor}</AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={2}>{m.ciclo} · {m.motivo}{m.obs ? ` · ${m.obs}` : ''}</AppText>
              </View>
              {m.status === 'RETIRADA' || m.status === 'DESCARTADA' ? (
                <StatusPill label={m.status === 'RETIRADA' ? 'Retirada' : 'Descartada'} tone="neutral" />
              ) : m.status === 'PENDENTE' ? (
                <View style={{ gap: spacing.xs }}>
                  <StatusPill label="Pendente" tone="warning" />
                  <Button label="Decidir" size="sm" variant="secondary" onPress={() => setDecidir(m)} />
                </View>
              ) : (
                <Button label="Retirar" size="sm" variant="secondary" onPress={() => setRetirar(m)} />
              )}
            </View>
            {i < multas.length - 1 && <Divider />}
          </View>
        ))}
      </Card>
      <BottomSheet
        visible={!!decidir}
        onClose={() => !busy && setDecidir(null)}
        title={decidir ? `Multa pendente de ${displayName(decidir.nome)}` : ''}
        footer={
          <View style={[styles.row, { gap: spacing.sm, flex: 1 }]}>
            <Button label="Descartar" variant="secondary" onPress={() => run('adminDecidirMulta', { ciclo: decidir.ciclo, morador: decidir.nome, decisao: 'descartar' })} disabled={busy} style={{ flex: 1 }} />
            <Button label={`Lançar R$ ${decidir?.valor ?? ''}`} onPress={() => run('adminDecidirMulta', { ciclo: decidir.ciclo, morador: decidir.nome, decisao: 'confirmar' })} loading={busy} style={{ flex: 1 }} />
          </View>
        }
      >
        {!!decidir && (
          <AppText variant="body" color="textMuted">
            Semana {decidir.ciclo}: {decidir.motivo}. Multa por média baixa não sai sozinha, pra evitar nota combinada. Confira as fotos e as notas antes de decidir.
          </AppText>
        )}
      </BottomSheet>
      <MotivoSheet
        visible={!!retirar}
        titulo={retirar ? `Retirar multa de ${displayName(retirar.nome)}?` : ''}
        texto={retirar ? `Entra um estorno de R$ ${retirar.valor} na Caixinha e o desempenho da semana fica sem multa.` : ''}
        botao="Retirar multa"
        busy={busy}
        onClose={() => setRetirar(null)}
        onConfirm={(mot) => run('adminRetirarMulta', { ciclo: retirar.ciclo, morador: retirar.nome, motivo: mot })}
      />
      <BottomSheet visible={nova} onClose={() => !busy && setNova(false)} title="Lançar multa manual" footer={<Button label="Lançar na Caixinha" onPress={() => run('adminLancarMulta', { ciclo: atual, morador, valor, motivo })} loading={busy} disabled={!morador || !motivo.trim() || !Number(String(valor).replace(',', '.'))} style={{ flex: 1 }} />}>
        <AppText variant="captionStrong" color="textMuted">Quem</AppText>
        <View style={[styles.wrap, { gap: spacing.sm, marginVertical: spacing.sm }]}>
          {RESIDENTES.map((n) => <Chip key={n} label={displayName(n)} left={<Avatar name={n} size={22} />} selected={morador === n} onPress={() => setMorador(n)} />)}
        </View>
        <TextField label="Valor" prefix="R$" value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
        <TextField label="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Ex.: combinado na reunião" />
      </BottomSheet>
    </>
  );
}

function RegrasAdmin({ painel, token, reload }) {
  const { spacing } = useTheme();
  const { toast, toastError } = useFeedback();
  const r = painel.regras || {};
  const [auto, setAuto] = useState(!!r.avaliacaoMultaAuto);
  const [mediaAuto, setMediaAuto] = useState(!!r.avaliacaoMultaMediaAuto);
  const [valor, setValor] = useState(String(r.avaliacaoMultaValor ?? 60));
  const [media, setMedia] = useState(String(r.avaliacaoMediaMinima ?? 3).replace('.', ','));
  const [minAv, setMinAv] = useState(String(r.avaliacaoMinAvaliacoes ?? 3));
  const [tol, setTol] = useState(Number(r.avaliacaoToleranciaDias ?? 3));
  const [grupo, setGrupo] = useState(String(r.banheiraoGrupo || 'ALLAN,GUSTAVO,RAMON').split(','));
  const [busy, setBusy] = useState(false);
  const salvar = async () => {
    setBusy(true);
    try {
      await adminAcao('adminRegras', {
        adminToken: token,
        regras: { avaliacaoMultaAuto: auto, avaliacaoMultaMediaAuto: mediaAuto, avaliacaoMultaValor: valor.replace(',', '.'), avaliacaoMediaMinima: media.replace(',', '.'), avaliacaoMinAvaliacoes: minAv, avaliacaoToleranciaDias: tol, banheiraoGrupo: grupo.join(',') },
      });
      toast('Regras salvas.', 'success');
      invalidateResources('avaliacao', 'config');
      await reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <AppText variant="heading" style={{ marginBottom: spacing.sm }}>Regras da avaliação</AppText>
      <AppText variant="captionStrong" color="textMuted">Multa automática</AppText>
      <View style={[styles.wrap, { gap: spacing.sm, marginVertical: spacing.sm }]}>
        <Chip label="Ligada" icon="check" selected={auto} onPress={() => setAuto(true)} />
        <Chip label="Desligada" icon="close" selected={!auto} onPress={() => setAuto(false)} />
      </View>
      <AppText variant="captionStrong" color="textMuted">Multa por média baixa</AppText>
      <View style={[styles.wrap, { gap: spacing.sm, marginVertical: spacing.sm }]}>
        <Chip label="Eu confirmo antes (recomendado)" icon="account-check-outline" selected={!mediaAuto} onPress={() => setMediaAuto(false)} />
        <Chip label="Automática" icon="flash-outline" selected={mediaAuto} onPress={() => setMediaAuto(true)} />
      </View>
      <TextField label="Valor da multa" prefix="R$" value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
      <TextField label="Multa se a média ficar abaixo de" value={media} onChangeText={setMedia} keyboardType="decimal-pad" hint="De 0 a 5. Ex.: 3" />
      <TextField label="Mínimo de notas para valer a regra da média" value={minAv} onChangeText={setMinAv} keyboardType="number-pad" />
      <AppText variant="captionStrong" color="textMuted">Entrega atrasada aceita até</AppText>
      <View style={[styles.wrap, { gap: spacing.xs, marginVertical: spacing.sm }]}>
        {[0, 1, 2, 3, 4, 5, 6].map((n) => (
          <Chip key={n} label={n === 0 ? 'Sem tolerância' : `${dias[n]} (${n}d)`} selected={tol === n} onPress={() => setTol(n)} />
        ))}
      </View>
      <AppText variant="captionStrong" color="textMuted">Quem avalia o banheirão</AppText>
      <View style={[styles.wrap, { gap: spacing.sm, marginVertical: spacing.sm }]}>
        {RESIDENTES.map((n) => {
          const on = grupo.some((g) => sameName(g, n));
          return <Chip key={n} label={displayName(n)} selected={on} onPress={() => setGrupo((prev) => (on ? prev.filter((g) => !sameName(g, n)) : [...prev, n]))} />;
        })}
      </View>
      <Button label="Salvar regras" icon="content-save-outline" onPress={salvar} loading={busy} full style={{ marginTop: spacing.sm }} />
      <AppText variant="caption" color="textSubtle" style={{ marginTop: spacing.sm }}>Vale a partir da próxima conta do app. Semanas já encerradas não mudam.</AppText>
    </Card>
  );
}

function SegurancaAdmin({ painel, token, reload }) {
  const { spacing } = useTheme();
  const { toast, toastError } = useFeedback();
  const [busy, setBusy] = useState('');
  const resetar = async (n) => {
    setBusy(n);
    try {
      const res = await adminAcao('adminResetarPinMorador', { adminToken: token, morador: n });
      toast(res?.message || 'PIN apagado.', 'success');
      await reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <Card style={{ marginBottom: spacing.md }}>
        <AppText variant="heading" style={{ marginBottom: spacing.sm }}>Diagnóstico</AppText>
        {(painel.diagnostico || []).map((d) => (
          <View key={d.id} style={[styles.row, { gap: spacing.sm, alignItems: 'flex-start', paddingVertical: spacing.xs }]}>
            <Icon name={d.ok ? 'check-circle' : 'alert-circle'} color={d.ok ? 'success' : 'warning'} size={20} />
            <AppText variant="body" style={{ flex: 1 }}>{d.texto}</AppText>
          </View>
        ))}
      </Card>
      <Card style={{ marginBottom: spacing.md }}>
        <AppText variant="heading">PIN dos moradores</AppText>
        <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>Cada um cria o seu na primeira entrega ou avaliação. Se alguém esquecer, apague aqui e ele cria outro.</AppText>
        {RESIDENTES.map((n) => (
          <View key={n} style={[styles.rowBetween, { paddingVertical: spacing.xs }]}>
            <View style={[styles.row, { gap: spacing.sm }]}>
              <Avatar name={n} size={28} />
              <AppText variant="body">{displayName(n)}</AppText>
            </View>
            {painel.pins?.[n] ? (
              <Button label="Apagar PIN" size="sm" variant="ghost" onPress={() => resetar(n)} loading={busy === n} />
            ) : (
              <StatusPill label="Sem PIN" tone="warning" />
            )}
          </View>
        ))}
      </Card>
    </>
  );
}

function RegistroAdmin({ painel }) {
  const { spacing } = useTheme();
  const log = painel.log || [];
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <AppText variant="heading" style={{ marginBottom: spacing.sm }}>Registro da administração</AppText>
      {!log.length && <AppText variant="caption" color="textMuted">Nada por aqui ainda.</AppText>}
      {log.map((l, i) => (
        <View key={`${l.quando}-${i}`} style={{ paddingVertical: spacing.xs }}>
          <AppText variant="bodyStrong">{l.acao}</AppText>
          <AppText variant="caption" color="textMuted">{prazoCurto(l.quando)} · {l.detalhe}</AppText>
        </View>
      ))}
    </Card>
  );
}

/* ---------------- Aba principal ---------------- */

export function AdminTab() {
  const { resident } = useResident();
  const { spacing } = useTheme();
  const { toastError } = useFeedback();
  const { token, save } = useAdminSession();
  const [painel, setPainel] = useState(null);
  const [sec, setSec] = useState('semana');
  const [loading, setLoading] = useState(false);
  const carregar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setPainel(await adminPainel(token));
    } catch (e) {
      if (e?.code === 'ADMIN_AUTH' || e?.status === 401) save('');
      else toastError(e, 'Não deu para abrir a administração.');
    } finally {
      setLoading(false);
    }
  }, [token, save, toastError]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!sameName(resident, ADMIN)) {
    return <EmptyState icon="shield-lock-outline" title="Só o Guilherme" message="A administração das tarefas é exclusiva do Guilherme." />;
  }
  if (token === null) return <SkeletonCard lines={3} />;
  if (!token) return <PinGate onToken={save} />;
  if (!painel) return loading ? <SkeletonCard lines={5} /> : <Button label="Tentar de novo" onPress={carregar} />;

  return (
    <>
      <View style={[styles.wrap, { gap: spacing.sm, marginBottom: spacing.md }]}>
        <Chip label="Semana" icon="calendar-week" selected={sec === 'semana'} onPress={() => setSec('semana')} />
        <Chip label="Multas" icon="cash-remove" selected={sec === 'multas'} onPress={() => setSec('multas')} count={(painel.multas || []).filter((m) => m.status === 'PENDENTE').length || undefined} />
        <Chip label="Regras" icon="tune" selected={sec === 'regras'} onPress={() => setSec('regras')} />
        <Chip label="Segurança" icon="shield-check-outline" selected={sec === 'seguranca'} onPress={() => setSec('seguranca')} count={(painel.diagnostico || []).filter((d) => !d.ok).length || undefined} />
        <Chip label="Registro" icon="history" selected={sec === 'registro'} onPress={() => setSec('registro')} />
      </View>
      {sec === 'semana' && <SemanaAdmin painel={painel} token={token} reload={carregar} />}
      {sec === 'multas' && <MultasAdmin painel={painel} token={token} reload={carregar} />}
      {sec === 'regras' && <RegrasAdmin painel={painel} token={token} reload={carregar} />}
      {sec === 'seguranca' && <SegurancaAdmin painel={painel} token={token} reload={carregar} />}
      {sec === 'registro' && <RegistroAdmin painel={painel} />}
      <Button label="Sair da administração" icon="logout" variant="ghost" onPress={() => save('')} full />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
