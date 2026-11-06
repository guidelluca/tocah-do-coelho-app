import { useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, TextInput, View } from 'react-native';
import { Screen } from '../components/Screen';
import { FeedPhoto } from '../components/FeedPhoto';
import { AppText, Avatar, Button, Card, Chip, EmptyState, Icon, IconButton, PressableScale, SkeletonCard, StatusPill, useFeedback } from '../components/ui';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { useFeed } from '../data/hooks';
import { invalidateResources, mutateResource } from '../data/store';
import { addTaskFeedComment, deleteTaskFeedPost, toggleFeedLike } from '../services/api';
import { formatRelativeTime, weekRangeLabel } from '../utils/date';
import { pickPhoto } from '../utils/photo';
import { shareText } from '../utils/share';
import { displayName, norm, sameName } from '../utils/text';

const looksLikeTs = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v || ''));
const isNilde = (p) => p.type === 'comment' && norm(p.target) === 'NILDE';
const isReply = (p) => p.type === 'comment_reply' || (p.type === 'comment' && looksLikeTs(p.target));

function postMeta(post) {
  if (post.type === 'check') return { label: 'Tarefa feita', tone: 'success', icon: 'check-circle-outline' };
  if (post.type === 'rating') return { label: 'Avaliação', tone: 'warning', icon: 'star-outline' };
  if (isNilde(post)) return { label: 'Nilde', tone: 'primary', icon: 'rabbit' };
  return null;
}

function Composer({ onPosted }) {
  const { resident } = useResident();
  const { colors, spacing, radius, typography } = useTheme();
  const { toast, toastError } = useFeedback();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState('');
  const [posting, setPosting] = useState(false);

  const attach = async (source) => {
    try {
      const data = await pickPhoto({ source, size: 'proof' });
      if (data) setPhoto(data);
    } catch (e) {
      toastError(e);
    }
  };

  const post = async () => {
    if (!text.trim() && !photo) return;
    setPosting(true);
    try {
      await addTaskFeedComment({ actor: resident, content: text.trim(), photoDataUrl: photo });
      setText('');
      setPhoto('');
      toast('Publicado!', 'success');
      onPosted?.();
    } catch (e) {
      toastError(e, 'Não deu para publicar.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card style={{ marginBottom: spacing.md }} padding="md">
      <View style={[styles.row, { gap: spacing.md, alignItems: 'flex-start' }]}>
        <Avatar name={resident} size={40} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Manda aí pra galera…"
          placeholderTextColor={colors.textSubtle}
          multiline
          style={[typography.body, styles.composerInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md }, Platform.OS === 'web' && { outlineStyle: 'none' }]}
          accessibilityLabel="Escrever publicação"
        />
      </View>
      {!!photo && (
        <View style={{ marginTop: spacing.md }}>
          <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md }} resizeMode="cover" />
          <IconButton icon="close" variant="header" onPress={() => setPhoto('')} accessibilityLabel="Remover foto" style={{ position: 'absolute', top: 8, right: 8, backgroundColor: colors.imageScrim }} />
        </View>
      )}
      <View style={[styles.row, { marginTop: spacing.sm, gap: spacing.xs }]}>
        <IconButton icon="image-outline" onPress={() => attach('library')} accessibilityLabel="Anexar foto da galeria" color="primary" />
        <IconButton icon="camera-outline" onPress={() => attach('camera')} accessibilityLabel="Tirar foto" color="primary" />
        <View style={{ flex: 1 }} />
        <Button label="Publicar" icon="send" size="sm" onPress={post} loading={posting} disabled={!text.trim() && !photo} />
      </View>
    </Card>
  );
}

function Post({ post, replies, onChanged, feedKey }) {
  const { resident } = useResident();
  const { colors, spacing, radius, typography } = useTheme();
  const { toast, toastError, confirm } = useFeedback();
  const [replyOpen, setReplyOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const meta = postMeta(post);
  const likes = post.likes || [];
  const liked = likes.some((n) => sameName(n, resident));
  const mine = sameName(post.actor, resident);
  const anonymous = post.type === 'rating';
  const shownReplies = showAll ? replies : replies.slice(-2);

  const like = async () => {
    const next = liked ? likes.filter((n) => !sameName(n, resident)) : [...likes, resident];
    mutateResource(feedKey, (prev) => prev && { ...prev, feed: prev.feed.map((p) => (p.ts === post.ts ? { ...p, likes: next } : p)) });
    try {
      await toggleFeedLike({ ts: post.ts, actor: resident });
    } catch (e) {
      toastError(e, 'Não deu para curtir agora.');
      invalidateResources('likes');
    }
  };

  const remove = async (item, isReplyItem) => {
    const ok = await confirm({ title: isReplyItem ? 'Apagar resposta?' : 'Apagar publicação?', message: 'Some para todo mundo.', confirmLabel: 'Apagar', destructive: true, icon: 'trash-can-outline' });
    if (!ok) return;
    mutateResource(feedKey, (prev) => prev && { ...prev, feed: prev.feed.filter((p) => p.ts !== item.ts) });
    try {
      await deleteTaskFeedPost({ ts: item.ts, requester: resident });
      toast('Apagado.', 'success');
    } catch (e) {
      toastError(e);
    } finally {
      onChanged?.();
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await addTaskFeedComment({ actor: resident, content: reply.trim(), parentTs: post.ts, parentActor: post.actor });
      setReply('');
      setShowAll(true);
      onChanged?.();
    } catch (e) {
      toastError(e, 'Não deu para responder.');
    } finally {
      setSending(false);
    }
  };

  const share = async () => {
    try {
      const res = await shareText(`República Tocah\n\n${anonymous ? 'Avaliação anônima' : displayName(post.actor)} • ${formatRelativeTime(post.ts)}\n${post.content || ''}`);
      if (res === 'copied') toast('Texto copiado para colar onde quiser.', 'success');
    } catch (e) {
      toastError(e);
    }
  };

  const content = isNilde(post) ? String(post.content || '').replace(/^Nilde\s*•\s*/i, '') : post.content;

  return (
    <Card style={{ marginBottom: spacing.md }} padding="md">
      <View style={[styles.row, { gap: spacing.md }]}>
        {anonymous ? (
          <View style={[styles.anon, { backgroundColor: colors.warningSoft }]}><Icon name="incognito" color="onWarningSoft" size={20} /></View>
        ) : (
          <Avatar name={post.actor} size={40} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>{anonymous ? 'Avaliador anônimo' : displayName(post.actor)}</AppText>
          <AppText variant="caption" color="textMuted">{formatRelativeTime(post.ts)}</AppText>
        </View>
        {!!meta && <StatusPill label={meta.label} tone={meta.tone} icon={meta.icon} />}
        {mine && !anonymous && <IconButton icon="trash-can-outline" onPress={() => remove(post, false)} accessibilityLabel="Apagar publicação" size={40} iconSize={20} />}
      </View>

      {post.type === 'check' && !!post.tarefa && <AppText variant="heading" style={{ marginTop: spacing.sm }}>{post.tarefa}</AppText>}
      {post.type === 'rating' && <AppText variant="body" style={{ marginTop: spacing.sm }}>Avaliou a tarefa de <AppText variant="bodyStrong">{displayName(post.target)}</AppText>{post.tarefa ? ` (${post.tarefa})` : ''}.</AppText>}
      {post.type !== 'rating' && !!content && <AppText variant="body" style={{ marginTop: spacing.sm }}>{content}</AppText>}
      {post.hasPhoto && <FeedPhoto ts={post.ts} style={{ marginTop: spacing.md }} />}

      <View style={[styles.row, { marginTop: spacing.sm, marginHorizontal: -spacing.xs }]}>
        <PressableScale onPress={like} accessibilityLabel={liked ? 'Descurtir' : 'Curtir'} style={styles.action}>
          <Icon name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? 'danger' : 'textMuted'} />
          <AppText variant="captionStrong" color={liked ? 'danger' : 'textMuted'}>{likes.length || 'Curtir'}</AppText>
        </PressableScale>
        <PressableScale onPress={() => setReplyOpen((v) => !v)} accessibilityLabel="Responder" style={styles.action}>
          <Icon name="comment-outline" size={20} color="textMuted" />
          <AppText variant="captionStrong" color="textMuted">{replies.length || 'Responder'}</AppText>
        </PressableScale>
        <PressableScale onPress={share} accessibilityLabel="Compartilhar" style={styles.action}>
          <Icon name="share-variant-outline" size={20} color="textMuted" />
        </PressableScale>
      </View>
      {likes.length > 0 && <AppText variant="caption" color="textMuted">Curtido por {likes.map(displayName).join(', ')}</AppText>}

      {replies.length > 0 && (
        <View style={{ marginTop: spacing.sm, gap: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: spacing.md }}>
          {replies.length > 2 && !showAll && (
            <PressableScale onPress={() => setShowAll(true)} accessibilityLabel="Ver todas as respostas" style={{ minHeight: 32, justifyContent: 'center' }}>
              <AppText variant="captionStrong" color="primary">Ver as {replies.length} respostas</AppText>
            </PressableScale>
          )}
          {shownReplies.map((r) => (
            <View key={r.ts} style={[styles.row, { gap: spacing.sm, alignItems: 'flex-start' }]}>
              <Avatar name={r.actor} size={28} />
              <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm }}>
                <AppText variant="captionStrong">{displayName(r.actor)} <AppText variant="caption" color="textSubtle">· {formatRelativeTime(r.ts)}</AppText></AppText>
                <AppText variant="body">{r.content}</AppText>
                {r.hasPhoto && <FeedPhoto ts={r.ts} style={{ marginTop: spacing.xs }} />}
              </View>
              {sameName(r.actor, resident) && <IconButton icon="trash-can-outline" onPress={() => remove(r, true)} accessibilityLabel="Apagar resposta" size={36} iconSize={18} />}
            </View>
          ))}
        </View>
      )}

      {replyOpen && (
        <View style={[styles.row, { marginTop: spacing.sm, gap: spacing.sm }]}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder={`Responder ${anonymous ? '' : displayName(post.actor)}…`}
            placeholderTextColor={colors.textSubtle}
            autoFocus
            onSubmitEditing={sendReply}
            returnKeyType="send"
            style={[typography.body, styles.replyInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: spacing.md }, Platform.OS === 'web' && { outlineStyle: 'none' }]}
            accessibilityLabel="Escrever resposta"
          />
          <IconButton icon="send" variant="primary" onPress={sendReply} disabled={sending || !reply.trim()} accessibilityLabel="Enviar resposta" />
        </View>
      )}
    </Card>
  );
}

const FILTERS = [
  { value: 'all', label: 'Tudo' },
  { value: 'comment', label: 'Posts' },
  { value: 'check', label: 'Tarefas' },
  { value: 'rating', label: 'Notas' },
  { value: 'nilde', label: 'Nilde' },
];

export function FeedScreen() {
  const { spacing } = useTheme();
  const [filter, setFilter] = useState('all');
  const [week, setWeek] = useState('');
  const feed = useFeed(week);
  const data = feed.data || {};
  const items = data.feed || [];

  const { topLevel, repliesByTs, counts } = useMemo(() => {
    const repliesMap = {};
    const top = [];
    items.forEach((p) => {
      if (p.type === 'deleted') return;
      if (isReply(p)) {
        const parent = String(p.target || '').trim();
        (repliesMap[parent] = repliesMap[parent] || []).push(p);
      } else if (['check', 'rating', 'comment'].includes(p.type)) top.push(p);
    });
    Object.values(repliesMap).forEach((list) => list.sort((a, b) => String(a.ts).localeCompare(String(b.ts))));
    const kind = (p) => (isNilde(p) ? 'nilde' : p.type);
    const c = { all: top.length };
    top.forEach((p) => {
      c[kind(p)] = (c[kind(p)] || 0) + 1;
    });
    return { topLevel: top.filter((p) => filter === 'all' || kind(p) === filter), repliesByTs: repliesMap, counts: c };
  }, [items, filter]);

  const refresh = () => {
    invalidateResources('feed');
    return feed.refresh();
  };

  const viewingOld = !!week && week !== data.currentWeek;

  return (
    <Screen title="Feed" subtitle={data.week ? `Feed · ${weekRangeLabel(data.week)}` : 'Feed'} onRefresh={refresh}>
      {!viewingOld && <Composer onPosted={refresh} />}
      {viewingOld && (
        <Card variant="sunken" padding="md" style={{ marginBottom: spacing.md }}>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <Icon name="history" color="textMuted" />
            <AppText variant="captionStrong" color="textMuted" style={{ flex: 1 }}>Semana de {weekRangeLabel(week)}</AppText>
            <Button label="Voltar para esta semana" size="sm" variant="ghost" onPress={() => setWeek('')} />
          </View>
        </Card>
      )}
      <View style={[styles.filters, { gap: spacing.sm, marginBottom: spacing.md }]}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} count={counts[f.value] || 0} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </View>
      {feed.loading ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </>
      ) : feed.error && !feed.data ? (
        <EmptyState icon="alert-circle-outline" title="Não deu para carregar o feed" message={feed.error.message} actionLabel="Tentar de novo" onAction={refresh} />
      ) : !topLevel.length ? (
        <EmptyState icon="message-text-outline" title={filter === 'all' ? 'Semana quietinha' : 'Nada por aqui'} message={filter === 'all' ? 'Seja o primeiro a postar algo.' : 'Nenhum item desse tipo nesta semana.'} />
      ) : (
        topLevel.map((p) => <Post key={`${p.ts}-${p.rowIndex}`} post={p} replies={repliesByTs[p.ts] || []} onChanged={refresh} feedKey={`feed:${week}`} />)
      )}
      {!!data.previousWeek && (
        <Button label={`Ver semana de ${weekRangeLabel(data.previousWeek)}`} variant="outline" icon="chevron-down" onPress={() => setWeek(data.previousWeek)} full style={{ marginTop: spacing.sm }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap' },
  composerInput: { flex: 1, minHeight: 44, maxHeight: 140, paddingVertical: 10 },
  replyInput: { flex: 1, minHeight: 44, paddingVertical: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center' },
  anon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
