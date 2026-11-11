import { useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useResident } from '../context/ResidentContext';
import { useAvaliacao, useMyTask } from '../data/hooks';
import { useAvaliarEntrega, useEntregarTarefa } from '../data/actions';
import { useMoradorPin } from '../context/MoradorPinContext';
import { invalidateResources } from '../data/store';
import { formatWeekdayTime } from '../utils/date';
import { displayName, norm, sameName } from '../utils/text';
import { FeedPhoto } from './FeedPhoto';
import { AppText, Avatar, BottomSheet, Button, Card, Divider, EmptyState, Icon, IconButton, PressableScale, ProgressBar, SkeletonCard, StatusPill, TextField } from './ui';

const TZ = 'America/Sao_Paulo';
const DAY = 24 * 60 * 60 * 1000;

/* ---------------- datas e rótulos ---------------- */

/** "dom 15/11, 23h59" */
export function prazoCurto(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const wd = d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short' }).replace('.', '');
  const dm = d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
  const hm = d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  return `${wd} ${dm}, ${hm}`;
}

/** "faltam 3 dias" · "vence hoje" · "vence em 5h" */
export function faltaLabel(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'prazo encerrado';
  if (ms < 12 * 60 * 60 * 1000) return `vence em ${Math.max(1, Math.round(ms / 3600000))}h`;
  const days = Math.ceil(ms / DAY);
  return days <= 1 ? 'vence amanhã' : `faltam ${days} dias`;
}

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

export function statusInfo(r) {
  if (!r) return { label: '—', tone: 'neutral', icon: 'help-circle-outline' };
  if (r.status === 'entregue') {
    return r.atrasoDias
      ? { label: `Entregue +${plural(r.atrasoDias, 'dia', 'dias')}`, tone: 'warning', icon: 'check' }
      : { label: 'Entregue no prazo', tone: 'success', icon: 'check-decagram' };
  }
  if (r.status === 'atrasada') return { label: `Atrasada ${plural(r.atrasoDias, 'dia', 'dias')}`, tone: 'danger', icon: 'clock-alert-outline' };
  if (r.status === 'nao_entregue') return { label: 'Não entregou', tone: 'danger', icon: 'close-circle-outline' };
  if (r.status === 'dispensado') return { label: 'Dispensado', tone: 'neutral', icon: 'airplane' };
  return { label: 'No prazo', tone: 'neutral', icon: 'clock-outline' };
}

const MAX_FOTOS = 6;

/** Fotos de uma entrega: a principal + extras. */
const fotosDe = (r) => (r?.fotos?.length ? r.fotos : r?.hasPhoto && r?.checkTs ? [r.checkTs] : []);

/** Galeria das fotos da entrega: foto grande + miniaturas para trocar. */
export function GaleriaEntrega({ fotos = [], style }) {
  const { spacing, radius, colors } = useTheme();
  const [idx, setIdx] = useState(0);
  if (!fotos.length) {
    return (
      <View style={[styles.noPhoto, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt }, style]}>
        <AppText variant="caption" color="textMuted">Sem foto</AppText>
      </View>
    );
  }
  const atual = fotos[Math.min(idx, fotos.length - 1)];
  return (
    <View style={style}>
      <FeedPhoto key={atual} ts={atual} aspectRatio={4 / 3} />
      {fotos.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.sm }}>
          {fotos.map((ts, i) => (
            <PressableScale key={ts} onPress={() => setIdx(i)} accessibilityLabel={`Foto ${i + 1} de ${fotos.length}`} style={[styles.thumb, { borderWidth: 2, borderColor: i === idx ? colors.primary : 'transparent' }]}>
              <FeedPhoto ts={ts} aspectRatio={1} style={{ width: 44, height: 44 }} rounded={false} />
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const tarefaDe = (r) => (r ? `${r.tarefa}${r.extra ? ` + ${niceExtra(r.extra)}` : ''}` : '');
function niceExtra(extra) {
  const s = String(extra || '');
  return /BANHEIR/i.test(s) ? 'Banheirão' : s;
}

/* ---------------- Proteger com PIN ---------------- */

export function PinAviso({ data, style }) {
  const { resident } = useResident();
  const { spacing } = useTheme();
  const { criarPin } = useMoradorPin();
  if (!data || data.meuPin || !resident) return null;
  const criar = async () => {
    try {
      await criarPin(resident);
      invalidateResources('avaliacao');
    } catch {
      /* cancelou */
    }
  };
  return (
    <Card variant="warning" onPress={criar} style={[{ marginBottom: spacing.md }, style]} accessibilityLabel="Criar meu PIN">
      <View style={[styles.row, { gap: spacing.md }]}>
        <Icon name="shield-lock-outline" size={26} color="onWarningSoft" />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" color="onWarningSoft">Proteja suas entregas e notas</AppText>
          <AppText variant="caption" color="onWarningSoft">Crie um PIN: assim ninguém manda foto ou dá nota no seu nome.</AppText>
        </View>
        <Icon name="chevron-right" color="onWarningSoft" />
      </View>
    </Card>
  );
}

/* ---------------- Card "Sua tarefa" (Início e Tarefas) ---------------- */

export function DeliveryCard({ style, compact }) {
  const { resident } = useResident();
  const { spacing, radius, colors } = useTheme();
  const av = useAvaliacao(resident);
  const task = useMyTask(resident);
  const { escolherFoto, enviar, busy } = useEntregarTarefa(resident);
  const [fotos, setFotos] = useState([]);
  const [open, setOpen] = useState(false);

  if (av.loading && !av.data) return <SkeletonCard lines={3} />;
  const e = av.data?.minhaEntrega;
  const t = task.data || {};
  if (!e) {
    return (
      <Card style={[{ marginBottom: spacing.md }, style]}>
        <AppText variant="overline" color="textMuted">Sua tarefa da semana</AppText>
        <AppText variant="title" style={{ marginTop: spacing.xs }}>{t.tarefaNome || 'Sem tarefa na escala'}</AppText>
        <AppText variant="caption" color="textMuted">A entrega com foto começa na semana configurada na aba Config.</AppText>
      </Card>
    );
  }

  const atrasadaAnterior = e.status === 'atrasada' && e.ciclo !== av.data?.atual?.key;
  const dispensado = e.status === 'dispensado';
  const entregue = e.status === 'entregue';
  const info = statusInfo(e);
  const isLav = /LAVANDERIA/i.test(norm(e.tarefa));
  const pick = async (source) => {
    const photo = await escolherFoto(source);
    if (photo) setFotos((prev) => [...prev, photo].slice(0, MAX_FOTOS));
  };
  const confirmar = async () => {
    const ok = await enviar({ ciclo: e.ciclo, photos: fotos });
    if (ok) setFotos([]);
  };
  const descricao = !atrasadaAnterior ? t.descricao : '';

  return (
    <Card style={[{ marginBottom: spacing.md }, style]}>
      <View style={styles.rowBetween}>
        <AppText variant="overline" color={atrasadaAnterior ? 'danger' : 'textMuted'}>{atrasadaAnterior ? `Semana passada · ${e.periodo}` : `Sua tarefa · ${e.periodo}`}</AppText>
        <StatusPill label={info.label} tone={info.tone} icon={info.icon} />
      </View>
      <View style={[styles.row, { gap: spacing.md, marginTop: spacing.sm }]}>
        <Avatar name={resident} size={48} ring={entregue ? 'success' : atrasadaAnterior ? 'danger' : undefined} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="title">{e.tarefa || 'Tarefa da semana'}</AppText>
          {!entregue && !dispensado && (
            <AppText variant="captionStrong" color={atrasadaAnterior ? 'danger' : 'primary'}>
              {atrasadaAnterior ? `Envie até ${prazoCurto(e.tolerancia)} · ${faltaLabel(e.tolerancia)}` : `Prazo ${prazoCurto(e.prazo)} · ${faltaLabel(e.prazo)}`}
            </AppText>
          )}
          {!entregue && !atrasadaAnterior && isLav && <AppText variant="caption" color="textMuted">Lavanderia e Panos tem um dia a mais.</AppText>}
        </View>
      </View>

      {!compact && !!descricao && (
        <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }} numberOfLines={open ? undefined : 3} onPress={() => setOpen((v) => !v)}>{descricao}</AppText>
      )}
      {!!e.extra && (
        <View style={{ marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft }}>
          <AppText variant="captionStrong" color="onDangerSoft">Extra da semana: {niceExtra(e.extra)}</AppText>
          {!compact && !atrasadaAnterior && !!t.extraDescricao && <AppText variant="caption" color="onDangerSoft">{t.extraDescricao}</AppText>}
        </View>
      )}

      {atrasadaAnterior && (
        <View style={{ marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft }}>
          <AppText variant="captionStrong" color="onWarningSoft">
            Atraso conta no desempenho. Se não entregar até {prazoCurto(e.tolerancia)}, entra multa de R$ {av.data?.regras?.multaValor ?? 60} na Caixinha.
          </AppText>
          {!!e.depois && <AppText variant="caption" color="onWarningSoft">Depois dessa, vem a desta semana: {e.depois.tarefa}.</AppText>}
        </View>
      )}

      {dispensado ? (
        <View style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
          <AppText variant="bodyStrong">Você está dispensado nesta semana ✈️</AppText>
          <AppText variant="caption" color="textMuted">{e.motivoDispensa ? `Motivo: ${e.motivoDispensa}. ` : ''}Não precisa entregar e não leva multa.</AppText>
        </View>
      ) : entregue ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <View>
            <AppText variant="bodyStrong" color={e.atrasoDias ? 'warning' : 'success'}>
              Entregue {formatWeekdayTime(e.entregueEm)}{fotosDe(e).length > 1 ? ` · ${fotosDe(e).length} fotos` : ''}
            </AppText>
            <AppText variant="caption" color="textMuted">A avaliação abre quando os 5 entregarem (ou quarta 23h59).</AppText>
          </View>
          {fotosDe(e).length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {fotosDe(e).map((ts) => (
                <View key={ts} style={{ width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden' }}>
                  <FeedPhoto ts={ts} aspectRatio={1} style={{ width: 64, height: 64 }} />
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <View style={[styles.row, { marginTop: spacing.md, gap: spacing.sm }]}>
          <Button label="Tirar foto da tarefa" icon="camera" onPress={() => pick('camera')} loading={busy} style={{ flex: 1 }} />
          <IconButton icon="image-outline" variant="primary" onPress={() => pick('library')} disabled={busy} accessibilityLabel="Escolher foto da galeria" size={48} />
        </View>
      )}

      <BottomSheet
        visible={fotos.length > 0}
        onClose={() => !busy && setFotos([])}
        title={`Conferir e enviar · ${fotos.length} foto${fotos.length > 1 ? 's' : ''}`}
        footer={<Button label={`Enviar ${fotos.length > 1 ? `${fotos.length} fotos` : 'foto'}`} icon="send" onPress={confirmar} loading={busy} style={{ flex: 1 }} />}
      >
        <View style={styles.grid}>
          {fotos.map((uri, i) => (
            <View key={i} style={[styles.gridItem, { borderRadius: radius.md, backgroundColor: colors.surfaceSunken }]}>
              <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Foto ${i + 1}`} />
              <IconButton icon="close" variant="primary" size={32} iconSize={18} onPress={() => setFotos((prev) => prev.filter((_, k) => k !== i))} disabled={busy} accessibilityLabel={`Remover foto ${i + 1}`} style={styles.removeBtn} />
            </View>
          ))}
          {fotos.length < MAX_FOTOS && (
            <PressableScale onPress={() => pick('camera')} disabled={busy} accessibilityLabel="Tirar mais uma foto" style={[styles.gridItem, styles.addTile, { borderRadius: radius.md, borderColor: colors.borderStrong }]}>
              <Icon name="camera-plus-outline" size={28} color="primary" />
              <AppText variant="captionStrong" color="primary">Mais uma</AppText>
            </PressableScale>
          )}
        </View>
        {fotos.length < MAX_FOTOS && (
          <Button label="Adicionar da galeria" variant="ghost" icon="image-plus" onPress={() => pick('library')} disabled={busy} style={{ marginTop: spacing.sm }} />
        )}
        <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft }]}>
          <Icon name="information-outline" color="onPrimarySoft" />
          <AppText variant="caption" color="onPrimarySoft" style={{ flex: 1 }}>
            Mande quantas fotos quiser (até {MAX_FOTOS}) — antes e depois ajuda na avaliação. Só dá pra enviar uma vez por semana.
            {e.status === 'atrasada' ? ` Vai contar ${plural(e.atrasoDias || 1, 'dia', 'dias')} de atraso.` : ''}
          </AppText>
        </View>
      </BottomSheet>
    </Card>
  );
}

/* ---------------- Entregas da semana ---------------- */

export function EntregasCard({ ciclo, titulo, me, onPhoto, style }) {
  const { spacing, colors } = useTheme();
  if (!ciclo) return null;
  const total = ciclo.residents.length || 5;
  return (
    <Card style={[{ marginBottom: spacing.md }, style]}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{titulo}</AppText>
          <AppText variant="caption" color="textMuted">
            {ciclo.phase === 'entregas'
              ? `Prazo ${prazoCurto(ciclo.prazo)} · tolerância até ${prazoCurto(ciclo.tolerancia)}`
              : ciclo.phase === 'avaliacao'
                ? `Em avaliação até ${prazoCurto(ciclo.fechamento)}`
                : 'Semana encerrada'}
          </AppText>
        </View>
        <AppText variant="bodyStrong" color="primary" tabular>{ciclo.entregues}/{total}</AppText>
      </View>
      <ProgressBar value={ciclo.entregues / total} tone="success" style={{ marginVertical: spacing.sm }} />
      {ciclo.residents.map((r, i) => {
        const info = statusInfo(r);
        const mine = sameName(r.nome, me);
        return (
          <View key={r.nome}>
            <View style={[styles.row, { gap: spacing.md, paddingVertical: spacing.sm }]}>
              <Avatar name={r.nome} size={40} ring={r.status === 'entregue' ? 'success' : r.status === 'atrasada' || r.status === 'nao_entregue' ? 'danger' : undefined} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="bodyStrong" numberOfLines={1}>{displayName(r.nome)}{mine ? ' (você)' : ''}</AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>{tarefaDe(r)}</AppText>
                <StatusPill label={info.label} tone={info.tone} icon={info.icon} style={{ alignSelf: 'flex-start', marginTop: 2 }} />
              </View>
              {r.status === 'entregue' && fotosDe(r).length > 0 && (
                <PressableScale onPress={() => onPhoto?.(fotosDe(r))} accessibilityLabel={`Ver ${fotosDe(r).length > 1 ? `${fotosDe(r).length} fotos` : 'foto'} da tarefa de ${displayName(r.nome)}`} style={styles.thumb}>
                  <FeedPhoto ts={fotosDe(r)[0]} aspectRatio={1} style={{ width: 48, height: 48 }} />
                  {fotosDe(r).length > 1 && (
                    <View style={[styles.countBadge, { backgroundColor: colors.imageScrim }]}>
                      <AppText variant="captionStrong" color="onImage">+{fotosDe(r).length - 1}</AppText>
                    </View>
                  )}
                </PressableScale>
              )}
            </View>
            {i < ciclo.residents.length - 1 && <Divider />}
          </View>
        );
      })}
    </Card>
  );
}

/* ---------------- Avaliação ---------------- */

export function Stars({ value, onChange, size = 34, label }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.xs, justifyContent: 'center' }]} accessibilityRole="adjustable" accessibilityLabel={`${label ? `${label}: ` : ''}nota ${value || 0} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <PressableScale key={n} onPress={() => onChange(n)} accessibilityLabel={`${label ? `${label}, ` : ''}${n} estrela${n > 1 ? 's' : ''}`} scaleTo={0.85} style={styles.star}>
          <Icon name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? 'star' : 'textSubtle'} />
        </PressableScale>
      ))}
    </View>
  );
}

const NOTA_TXT = ['Toque nas estrelas', 'Ficou devendo', 'Dá pra melhorar', 'Ok', 'Bem feito', 'Impecável'];

const GRUPO_BANHEIRAO = ['ALLAN', 'GUSTAVO', 'RAMON'];

function AvaliarItem({ ciclo, alvo, rated, onDone, grupoBanheirao = GRUPO_BANHEIRAO }) {
  const { resident } = useResident();
  const { spacing, radius, colors } = useTheme();
  const { avaliar, busyTarget } = useAvaliarEntrega(resident);
  const [casa, setCasa] = useState(0);
  const [ban, setBan] = useState(0);
  const [comentario, setComentario] = useState('');
  const precisaBan = alvo.banheirao && grupoBanheirao.some((n) => sameName(n, resident));
  const feito = rated?.casa && (!precisaBan || rated?.banheirao);
  const pronto = (rated?.casa || casa > 0) && (!precisaBan || rated?.banheirao || ban > 0);

  const enviar = async () => {
    const notas = {};
    if (!rated?.casa) notas.casa = casa;
    if (precisaBan && !rated?.banheirao) notas.banheirao = ban;
    const ok = await avaliar({ ciclo, target: alvo.nome, notas, comentario: comentario.trim() });
    if (ok) onDone?.();
  };

  return (
    <Card style={{ marginBottom: spacing.md }} padding="md">
      <View style={[styles.row, { gap: spacing.md, marginBottom: spacing.sm }]}>
        <Avatar name={alvo.nome} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="heading" numberOfLines={1}>{displayName(alvo.nome)}</AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={2}>{tarefaDe(alvo)}</AppText>
        </View>
        <StatusPill {...statusInfo(alvo)} />
      </View>
      <GaleriaEntrega fotos={fotosDe(alvo)} />
      <AppText variant="caption" color="textSubtle" style={{ marginTop: spacing.xs }}>
        Entregue {formatWeekdayTime(alvo.entregueEm)}{fotosDe(alvo).length > 1 ? ` · ${fotosDe(alvo).length} fotos` : ''}
      </AppText>

      {feito ? (
        <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.md }]}>
          <Icon name="check-decagram" color="success" />
          <AppText variant="bodyStrong" color="success">Você já avaliou</AppText>
        </View>
      ) : (
        <View style={{ marginTop: spacing.md }}>
          {!rated?.casa && (
            <>
              <AppText variant="captionStrong" color="textMuted" center>{precisaBan ? 'Tarefa' : 'Sua nota'}</AppText>
              <Stars value={casa} onChange={setCasa} label={precisaBan ? 'Tarefa' : 'Nota'} />
              <AppText variant="caption" color="textMuted" center>{NOTA_TXT[casa]}</AppText>
            </>
          )}
          {precisaBan && !rated?.banheirao && (
            <View style={{ marginTop: spacing.sm }}>
              <AppText variant="captionStrong" color="textMuted" center>Banheirão</AppText>
              <Stars value={ban} onChange={setBan} label="Banheirão" />
              <AppText variant="caption" color="textMuted" center>{NOTA_TXT[ban]}</AppText>
            </View>
          )}
          {!rated?.casa && (
            <TextField placeholder="Comentário (opcional, anônimo)" value={comentario} onChangeText={setComentario} maxLength={400} multiline style={{ marginTop: spacing.sm }} />
          )}
          <Button label="Enviar avaliação" icon="send" onPress={enviar} disabled={!pronto} loading={busyTarget === alvo.nome} full style={{ marginTop: spacing.sm }} />
        </View>
      )}
    </Card>
  );
}

export function AvaliarTab({ data }) {
  const { resident } = useResident();
  const { spacing } = useTheme();
  const key = data?.emAvaliacao;
  const ciclo = key ? [data.anterior, data.atual].find((c) => c && c.key === key) : null;
  if (!ciclo) {
    const pend = data?.anterior && data.anterior.phase === 'entregas' ? data.anterior : data?.atual;
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <EmptyState
          icon="star-check-outline"
          title="Nenhuma avaliação aberta"
          message={pend ? `A avaliação da semana ${pend.periodo} abre quando os 5 entregarem (${pend.entregues}/5) ou em ${prazoCurto(pend.tolerancia)}.` : 'A avaliação abre quando todo mundo entrega a tarefa.'}
          compact
        />
      </Card>
    );
  }
  const me = ciclo.residents.find((r) => sameName(r.nome, resident));
  const alvos = ciclo.residents.filter((r) => r.status === 'entregue' && !sameName(r.nome, resident));
  const faltaram = ciclo.residents.filter((r) => r.status !== 'entregue');
  const prog = ciclo.avaliacoes?.porAvaliador?.[String(resident || '').toUpperCase()] || { total: 0, feitas: 0 };
  const ordenados = [...alvos].sort((a, b) => {
    const da = ciclo.ratedByMe?.[a.nome]?.casa ? 1 : 0;
    const db = ciclo.ratedByMe?.[b.nome]?.casa ? 1 : 0;
    return da - db;
  });
  return (
    <>
      <Card variant="primary" style={{ marginBottom: spacing.md }}>
        <AppText variant="overline" color="onPrimarySoft">Avaliação da semana {ciclo.periodo}</AppText>
        <AppText variant="title" color="onPrimarySoft">{prog.feitas >= prog.total ? 'Você avaliou todo mundo 🎉' : `Faltam ${prog.total - prog.feitas} de ${prog.total} notas`}</AppText>
        <ProgressBar value={prog.total ? prog.feitas / prog.total : 1} style={{ marginVertical: spacing.sm }} />
        <AppText variant="caption" color="onPrimarySoft">
          Fecha {prazoCurto(ciclo.fechamento)} (ou antes, se todos avaliarem). Notas anônimas; a média de cada um aparece ao vivo logo abaixo.
        </AppText>
        {me && me.status !== 'entregue' && <AppText variant="captionStrong" color="onPrimarySoft" style={{ marginTop: spacing.xs }}>Você não entregou nessa semana, mas ainda pode avaliar.</AppText>}
      </Card>
      <PinAviso data={data} />
      <NotasAoVivoCard ciclo={ciclo} />
      {ordenados.map((alvo) => (
        <AvaliarItem key={alvo.nome} ciclo={ciclo.key} alvo={alvo} rated={ciclo.ratedByMe?.[alvo.nome]} grupoBanheirao={data?.regras?.banheiraoGrupo || GRUPO_BANHEIRAO} />
      ))}
      {faltaram.filter((r) => !sameName(r.nome, resident)).length > 0 && (
        <Card style={{ marginBottom: spacing.md }}>
          <AppText variant="heading">Não entregaram</AppText>
          {faltaram.filter((r) => !sameName(r.nome, resident)).map((r) => (
            <View key={r.nome} style={[styles.row, { gap: spacing.md, paddingVertical: spacing.sm }]}>
              <Avatar name={r.nome} size={36} ring="danger" />
              <AppText variant="body" style={{ flex: 1 }}>{displayName(r.nome)} · {r.tarefa}</AppText>
              <StatusPill label="Sem avaliação" tone="danger" />
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

/* ---------------- Notas ao vivo ---------------- */

export function NotasAoVivoCard({ ciclo, style }) {
  const { resident } = useResident();
  const { spacing, radius, colors } = useTheme();
  const notas = ciclo?.notasAoVivo;
  if (!notas?.length) return null;
  const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(1).replace('.', ','));
  const encerrada = ciclo.phase === 'encerrada';
  return (
    <Card style={[{ marginBottom: spacing.md }, style]}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <AppText variant="overline" color="primary">{encerrada ? 'Notas finais' : 'Notas ao vivo'} · semana {ciclo.periodo}</AppText>
          <AppText variant="heading">Como está cada um</AppText>
        </View>
        {!encerrada && <StatusPill label="Ao vivo" tone="danger" icon="circle" />}
      </View>
      <AppText variant="caption" color="textMuted" style={{ marginTop: 2, marginBottom: spacing.sm }}>
        Média das notas recebidas até agora, sem mostrar quem deu. Muda na hora a cada nota (app ou e-mail).
      </AppText>
      {notas.map((n, i) => {
        const entregou = n.status === 'entregue';
        return (
          <View key={n.nome}>
            <View style={[styles.row, { gap: spacing.md, paddingVertical: spacing.sm }]}>
              <Avatar name={n.nome} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="bodyStrong" numberOfLines={1}>{displayName(n.nome)}{sameName(n.nome, resident) ? ' (você)' : ''}</AppText>
                {entregou ? (
                  <>
                    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden', marginTop: 4 }}>
                      <View style={{ width: `${n.media ? (n.media / 5) * 100 : 0}%`, height: '100%', backgroundColor: colors.star, borderRadius: radius.pill }} />
                    </View>
                    <AppText variant="caption" color="textMuted" style={{ marginTop: 3 }}>
                      {n.notas} de {n.esperadas} notas{n.aguardando ? ' · média aparece a partir de 2 notas' : ''}{n.esperadasBanheirao ? ` · banheirão ${n.mediaBanheirao === null || n.mediaBanheirao === undefined ? 'quando os 2 avaliarem' : fmt(n.mediaBanheirao)} (${n.notasBanheirao}/${n.esperadasBanheirao})` : ''}
                    </AppText>
                  </>
                ) : (
                  <AppText variant="caption" color="textMuted">{n.status === 'dispensado' ? 'Dispensado da semana' : 'Não entregou — sem nota'}</AppText>
                )}
              </View>
              {entregou && (
                <View style={[styles.row, { gap: 3 }]}>
                  <Icon name="star" size={18} color="star" />
                  <AppText variant="title" tabular>{fmt(n.media)}</AppText>
                </View>
              )}
            </View>
            {i < notas.length - 1 && <Divider />}
          </View>
        );
      })}
    </Card>
  );
}

/* ---------------- Desempenho ---------------- */

function fmtMedia(v) {
  return v === null || v === undefined ? '—' : Number(v).toFixed(1).replace('.', ',');
}
function pct(v) {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}

export function ResultadoSemanaCard({ resultado, me }) {
  const { spacing, radius, colors } = useTheme();
  if (!resultado?.resultados?.length) return null;
  const list = resultado.resultados;
  const meu = list.find((r) => sameName(r.nome, me));
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <AppText variant="overline" color="primary">Resultado · semana {resultado.periodo}</AppText>
      <AppText variant="heading" style={{ marginBottom: spacing.sm }}>Notas da galera</AppText>
      {list.map((r, i) => (
        <View key={r.nome}>
          <View style={[styles.row, { gap: spacing.md, paddingVertical: spacing.sm }]}>
            <Avatar name={r.nome} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>{displayName(r.nome)}</AppText>
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {r.entregou ? (r.atrasoDias ? `Entregou com ${plural(r.atrasoDias, 'dia', 'dias')} de atraso` : 'Entregou no prazo') : 'Não entregou'}
                {r.mediaBanheirao !== null && r.mediaBanheirao !== undefined ? ` · banheirão ${fmtMedia(r.mediaBanheirao)}` : ''}
              </AppText>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <View style={[styles.row, { gap: 2 }]}>
                <Icon name="star" size={16} color="star" />
                <AppText variant="bodyStrong" tabular>{fmtMedia(r.media)}</AppText>
              </View>
              {r.multa > 0 && <StatusPill label={`Multa R$ ${r.multa}`} tone="danger" />}
            </View>
          </View>
          {i < list.length - 1 && <Divider />}
        </View>
      ))}
      {!!meu?.comentarios?.length && (
        <View style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
          <AppText variant="captionStrong" color="textMuted">Comentários que você recebeu (anônimos)</AppText>
          {meu.comentarios.map((c, i) => (
            <AppText key={i} variant="body" style={{ marginTop: spacing.xs }}>“{c}”</AppText>
          ))}
        </View>
      )}
      {list.some((r) => r.multa > 0) && (
        <AppText variant="caption" color="textSubtle" style={{ marginTop: spacing.sm }}>Multas lançadas automaticamente na Caixinha.</AppText>
      )}
    </Card>
  );
}

function MiniBars({ historico = [] }) {
  const { spacing, radius, colors } = useTheme();
  const items = [...historico].reverse().slice(-8);
  if (!items.length) return null;
  return (
    <View style={[styles.row, { alignItems: 'flex-end', gap: 4, height: 56, marginTop: spacing.sm }]} accessibilityLabel="Notas das últimas semanas">
      {items.map((h) => {
        const v = h.media === null ? 0 : h.media / 5;
        const tone = !h.entregou ? colors.danger : h.atrasoDias ? colors.warning : colors.success;
        return (
          <View key={h.ciclo} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
            <View style={{ width: '100%', height: Math.max(4, v * 44), borderRadius: radius.sm, backgroundColor: h.media === null ? colors.surfaceSunken : colors.primary }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
          </View>
        );
      })}
    </View>
  );
}

export function DesempenhoTab({ data, desempenho }) {
  const { resident } = useResident();
  const { spacing, radius, colors } = useTheme();
  const d = desempenho || {};
  const stats = d.stats || [];
  const byName = Object.fromEntries(stats.map((s) => [s.nome, s]));
  const meu = byName[String(resident || '').toUpperCase()];
  const regras = data?.regras || {};
  return (
    <>
      <ResultadoSemanaCard resultado={data?.ultimoResultado} me={resident} />

      {[data?.anterior, data?.atual].filter((c) => c && c.phase === 'avaliacao').map((c) => <NotasAoVivoCard key={c.key} ciclo={c} />)}

      {meu && (
        <Card style={{ marginBottom: spacing.md }}>
          <AppText variant="overline" color="primary">Seu desempenho</AppText>
          <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' }]}>
            {[
              ['Nota média', fmtMedia(meu.media), 'star'],
              ['No prazo', pct(meu.pontualidade), 'clock-check-outline'],
              ['Entregas', `${meu.entregas}/${meu.ciclos}`, 'camera-outline'],
              ['Multas', meu.multas ? `R$ ${meu.multasTotal}` : '0', 'cash-remove'],
            ].map(([label, value, icon]) => (
              <View key={label} style={[styles.kpi, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt, padding: spacing.md }]}>
                <Icon name={icon} size={18} color="primary" />
                <AppText variant="title" tabular>{value}</AppText>
                <AppText variant="caption" color="textMuted">{label}</AppText>
              </View>
            ))}
          </View>
          <MiniBars historico={meu.historico} />
          <AppText variant="caption" color="textSubtle" style={{ marginTop: spacing.xs }}>Barras = nota de cada semana · ponto verde no prazo, amarelo atrasou, vermelho não entregou.</AppText>
        </Card>
      )}

      <Card variant="sunken" style={{ marginBottom: spacing.md }}>
        <AppText variant="heading">Como funciona</AppText>
        {[
          'Prazo: domingo 23h59. Lavanderia e Panos vai até segunda 23h59.',
          `Atrasou? Dá pra entregar até quarta 23h59 — o atraso em dias fica registrado.`,
          'A avaliação abre quando os 5 entregam (ou na quarta). Cada um avalia os outros, de forma anônima.',
          'O banheirão só é avaliado por Allan, Gustavo e Ramon (quem entra no rodízio dele).',
          regras.multaAuto === false
            ? 'Multa automática desligada (aba Config).'
            : `Multa de R$ ${regras.multaValor ?? 60} na Caixinha para quem não entregou até o fim da tolerância. Média abaixo de ${String(regras.mediaMinima ?? 3).replace('.', ',')} (com ${regras.minAvaliacoes ?? 3}+ notas) ${regras.multaMediaAuto ? 'também gera multa automática' : 'vira multa só se o Guilherme confirmar'}.`,
          'As notas de cada um aparecem ao vivo durante a avaliação (sem mostrar quem deu).',
        ].map((t) => (
          <View key={t} style={[styles.row, { gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.sm }]}>
            <Icon name="circle-small" color="primary" />
            <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>{t}</AppText>
          </View>
        ))}
      </Card>
    </>
  );
}

/* ---------------- Aviso na Home ---------------- */

export function AvaliacaoBanner({ onPress, style }) {
  const { resident } = useResident();
  const { spacing } = useTheme();
  const av = useAvaliacao(resident);
  const data = av.data;
  const key = data?.emAvaliacao;
  const ciclo = key ? [data.anterior, data.atual].find((c) => c && c.key === key) : null;
  if (!ciclo) return null;
  const prog = ciclo.avaliacoes?.porAvaliador?.[String(resident || '').toUpperCase()] || { total: 0, feitas: 0 };
  const faltam = prog.total - prog.feitas;
  if (faltam <= 0) return null;
  return (
    <Card variant="primary" onPress={onPress} style={[{ marginBottom: spacing.md }, style]} accessibilityLabel="Abrir avaliação da semana">
      <View style={[styles.row, { gap: spacing.md }]}>
        <Icon name="star-circle" size={32} color="onPrimarySoft" />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" color="onPrimarySoft">Avaliação da semana aberta</AppText>
          <AppText variant="caption" color="onPrimarySoft">Faltam {faltam} nota{faltam > 1 ? 's' : ''} suas · fecha {prazoCurto(ciclo.fechamento)}</AppText>
        </View>
        <Icon name="chevron-right" color="onPrimarySoft" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden' },
  noPhoto: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' },
  kpi: { flexBasis: '47%', flexGrow: 1, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { width: '31%', aspectRatio: 1, overflow: 'hidden' },
  addTile: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 2, borderStyle: 'dashed' },
  removeBtn: { position: 'absolute', top: 4, right: 4 },
  countBadge: { position: 'absolute', right: 0, bottom: 0, left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
});
