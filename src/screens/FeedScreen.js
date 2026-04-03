import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { addTaskFeedComment, deleteTaskFeedPost, getTaskFeed } from '../services/api';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { AppHeader } from '../components/AppHeader';
import { useResident } from '../context/ResidentContext';

function formatRelativeTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `ha ${diffMin} min`;
  if (diffHour < 24) return `ha ${diffHour} h`;
  if (diffDay === 1) return 'ontem';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function looksLikePostTs(value = '') {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw);
}

export function FeedScreen() {
  const { isDark } = useThemeMode();
  const { resident } = useResident();
  const colors = isDark ? darkTheme : lightTheme;
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [commentText, setCommentText] = useState('');
  const [postPhoto, setPostPhoto] = useState('');
  const [postingMain, setPostingMain] = useState(false);
  const [replyingToTs, setReplyingToTs] = useState('');
  const [replyText, setReplyText] = useState('');
  const [postingReply, setPostingReply] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [selectedFeedPhoto, setSelectedFeedPhoto] = useState('');

  const load = useCallback(async (mode = 'normal') => {
    if (mode === 'pull') setRefreshing(true);
    if (mode === 'normal') setLoading(true);
    try {
      const data = await getTaskFeed();
      setFeed(data?.feed || []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Nao foi possivel carregar o feed.');
    } finally {
      if (mode === 'pull') setRefreshing(false);
      if (mode === 'normal') setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load('silent');
      const timer = setInterval(() => load('silent'), 7000);
      return () => clearInterval(timer);
    }, [load])
  );

  const pickPostPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria para anexar foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.25,
      allowsEditing: true,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) {
      Alert.alert('Falha na foto', 'Selecione uma imagem (não vídeo) para postar.');
      return;
    }
    setPostPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const takePostPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita o uso da câmera para tirar foto no post.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.25,
      allowsEditing: true,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) {
      Alert.alert('Falha na foto', 'Não foi possível capturar a imagem.');
      return;
    }
    setPostPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const topLevelFeed = useMemo(() => {
    const base = (feed || []).filter((item) => {
      if (item.type === 'deleted') return false;
      if (item.type === 'comment_reply') return false;
      if (item.type === 'comment' && looksLikePostTs(item.target)) return false;
      return true;
    });
    if (filter === 'all') return base;
    return base.filter((item) => item.type === filter);
  }, [feed, filter]);

  const repliesByPostTs = useMemo(() => {
    const map = {};
    (feed || []).forEach((post) => {
      const isReply = post.type === 'comment_reply' || (post.type === 'comment' && looksLikePostTs(post.target));
      if (!isReply) return;
      const parentTs = String(post.target || post.tarefa || '').trim();
      if (!parentTs) return;
      if (!map[parentTs]) map[parentTs] = [];
      map[parentTs].push(post);
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => String(a.ts).localeCompare(String(b.ts))));
    return map;
  }, [feed]);

  const counters = useMemo(() => {
    const base = (feed || []).filter((item) => item.type !== 'comment_reply' && item.type !== 'deleted');
    return {
      all: base.length,
      check: base.filter((x) => x.type === 'check').length,
      rating: base.filter((x) => x.type === 'rating').length,
      comment: base.filter((x) => x.type === 'comment').length,
    };
  }, [feed]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
    >
      <AppHeader title="Feed da Casa" subtitle={`Atualizações semanais • ${resident}`} />

      <View style={[styles.composerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.filterRow}>
          {[
            ['all', `Tudo (${counters.all})`],
            ['check', `Checks (${counters.check})`],
            ['rating', `Notas (${counters.rating})`],
            ['comment', `Posts (${counters.comment})`],
          ].map(([id, label]) => (
            <Pressable key={id} style={[styles.filterChip, filter === id && styles.filterChipActive]} onPress={() => setFilter(id)}>
              <Text style={[styles.filterChipText, filter === id && styles.filterChipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.commentRow}>
          <TextInput
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Compartilhe algo da semana..."
            placeholderTextColor="#94a3b8"
            style={styles.commentInput}
          />
          <Pressable style={styles.attachBtn} onPress={pickPostPhoto}>
            <MaterialCommunityIcons name="image-plus" size={16} color="#6a1b9a" />
          </Pressable>
          <Pressable style={styles.attachBtn} onPress={takePostPhoto}>
            <MaterialCommunityIcons name="camera-outline" size={16} color="#6a1b9a" />
          </Pressable>
          <Pressable
            style={[styles.sendBtn, postingMain && { opacity: 0.75 }]}
            onPress={async () => {
              if (postingMain) return;
              if (!commentText.trim() && !postPhoto) return;
              try {
                setPostingMain(true);
                await addTaskFeedComment({ actor: resident, content: commentText.trim() || 'publicou uma foto', photoDataUrl: postPhoto });
                setCommentText('');
                setPostPhoto('');
                await load('pull');
              } catch (e) {
                    Alert.alert('Erro', e?.message || 'Não foi possível postar.');
              } finally {
                setPostingMain(false);
              }
            }}
            disabled={postingMain}
          >
            <MaterialCommunityIcons name={postingMain ? 'progress-clock' : 'send'} size={16} color="#fff" />
          </Pressable>
        </View>
        {!!postPhoto && (
          <View style={styles.previewWrap}>
            <Image source={{ uri: postPhoto }} style={styles.previewImg} resizeMode="contain" />
            <Pressable style={styles.previewRemove} onPress={() => setPostPhoto('')}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#ef4444" />
            </Pressable>
          </View>
        )}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!error && (
        <Pressable style={styles.retryBtn} onPress={() => load('pull')}>
          <MaterialCommunityIcons name="refresh" size={14} color="#fff" />
          <Text style={styles.retryBtnText}>Tentar novamente</Text>
        </Pressable>
      )}

      {loading ? <Text style={[styles.subtitle, { color: colors.muted }]}>Carregando feed...</Text> : null}

      {topLevelFeed.map((post, idx) => (
        <View key={`${post.ts}-${idx}`} style={[styles.feedItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.feedHeadRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.feedHead, { color: colors.text }]}>
                {post.actor} {post.type === 'check' ? '✔ concluiu tarefa' : post.type === 'rating' ? '⭐ avaliou tarefa' : '💬 comentou'}
              </Text>
              <Text style={styles.feedTime}>{formatRelativeTime(post.ts)}</Text>
            </View>
            <View style={styles.feedActions}>
              <Pressable style={styles.feedReplyBtn} onPress={() => setReplyingToTs((prev) => (prev === post.ts ? '' : post.ts))}>
                <MaterialCommunityIcons name="comment-text-outline" size={15} color="#6a1b9a" />
              </Pressable>
              <Pressable
                style={styles.feedDeleteBtn}
                onPress={() =>
                  Alert.alert('Excluir post', 'Deseja realmente excluir este post?', [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Excluir',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteTaskFeedPost({ rowIndex: post.rowIndex, actor: resident });
                          await load('pull');
                        } catch (e) {
                          Alert.alert('Erro', e?.message || 'Não foi possível excluir o post.');
                        }
                      },
                    },
                  ])
                }
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#ef4444" />
              </Pressable>
            </View>
          </View>

          <Text style={[styles.feedBody, { color: colors.muted }]}>
            {[post.target, post.tarefa, post.content].filter(Boolean).join(' • ')}
          </Text>

          {!!post.photoDataUrl && (
            <Pressable
              onPress={() => {
                setSelectedFeedPhoto(post.photoDataUrl);
                setPhotoViewerVisible(true);
              }}
            >
              <Image source={{ uri: post.photoDataUrl }} style={styles.feedPhoto} resizeMode="contain" />
            </Pressable>
          )}

          {!!(repliesByPostTs[post.ts] || []).length && (
            <View style={styles.replyTimeline}>
              <View style={styles.replyTimelineLine} />
              {(repliesByPostTs[post.ts] || []).map((reply, ridx) => (
                <View key={`${post.ts}-r-${reply.ts}-${ridx}`} style={styles.replyTimelineItem}>
                  <View style={styles.replyDot} />
                  <View style={styles.replyBubble}>
                    <View style={styles.replyTopRow}>
                      <Text style={[styles.replyHead, { color: colors.text }]}>{reply.actor} respondeu</Text>
                      <View style={styles.replyTopActions}>
                        <Text style={styles.replyTime}>{formatRelativeTime(reply.ts)}</Text>
                        <Pressable
                          style={styles.replyDeleteBtn}
                          onPress={() =>
                            Alert.alert('Excluir comentario', 'Deseja realmente excluir este comentario?', [
                              { text: 'Cancelar', style: 'cancel' },
                              {
                                text: 'Excluir',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await deleteTaskFeedPost({ rowIndex: reply.rowIndex, actor: resident });
                                    await load('pull');
                                  } catch (e) {
                                    Alert.alert('Erro', e?.message || 'Não foi possível excluir o comentário.');
                                  }
                                },
                              },
                            ])
                          }
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={14} color="#ef4444" />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={[styles.replyBody, { color: colors.muted }]}>{reply.content}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {replyingToTs === post.ts && (
            <View style={styles.replyComposer}>
              <TextInput
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Escreva sua resposta..."
                placeholderTextColor="#94a3b8"
                style={styles.replyInput}
              />
              <Pressable
                style={[styles.replySendBtn, postingReply && { opacity: 0.75 }]}
                onPress={async () => {
                  if (postingReply) return;
                  if (!replyText.trim()) return;
                  try {
                    setPostingReply(true);
                    await addTaskFeedComment({
                      actor: resident,
                      content: replyText.trim(),
                      target: post.ts,
                      tarefa: post.actor,
                      parentTs: post.ts,
                      parentActor: post.actor,
                    });
                    setReplyText('');
                    setReplyingToTs('');
                    await load('pull');
                  } catch (e) {
                    Alert.alert('Erro', e?.message || 'Não foi possível responder o post.');
                  } finally {
                    setPostingReply(false);
                  }
                }}
                disabled={postingReply}
              >
                <MaterialCommunityIcons name={postingReply ? 'progress-clock' : 'send'} size={15} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {!loading && !topLevelFeed.length && <Text style={[styles.subtitle, { color: colors.muted }]}>Sem publicações nesta semana.</Text>}

      <Modal visible={photoViewerVisible} transparent animationType="fade" onRequestClose={() => setPhotoViewerVisible(false)}>
        <View style={styles.photoViewerOverlay}>
          <Pressable style={styles.photoViewerClose} onPress={() => setPhotoViewerVisible(false)}>
            <MaterialCommunityIcons name="close" size={24} color="#fff" />
          </Pressable>
          {!!selectedFeedPhoto && <Image source={{ uri: selectedFeedPhoto }} style={styles.photoViewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 6, gap: 10, paddingBottom: 26 },
  composerCard: { borderWidth: 1, borderRadius: 18, padding: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  filterChipActive: { borderColor: '#6a1b9a', backgroundColor: '#f3e5f5' },
  filterChipText: { color: '#6b7280', fontSize: 10, fontWeight: '800' },
  filterChipTextActive: { color: '#4a148c' },
  commentRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: '#111827', fontWeight: '600' },
  attachBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  sendBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  previewWrap: { marginBottom: 4, position: 'relative' },
  previewImg: { width: '100%', height: 140, borderRadius: 10, backgroundColor: '#e5e7eb' },
  previewRemove: { position: 'absolute', right: 8, top: 8, backgroundColor: '#fff', borderRadius: 999 },
  feedItem: { borderWidth: 1, borderRadius: 16, padding: 12 },
  feedHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  feedActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  feedHead: { fontSize: 12, fontWeight: '800' },
  feedTime: { marginTop: 2, fontSize: 10, color: '#9ca3af', fontWeight: '700' },
  feedReplyBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5' },
  feedDeleteBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  feedBody: { fontSize: 11, marginTop: 4, fontWeight: '600' },
  feedPhoto: { width: '100%', height: 190, borderRadius: 10, marginTop: 8, backgroundColor: '#e5e7eb' },
  replyTimeline: { marginTop: 8, marginLeft: 6, paddingLeft: 14, position: 'relative' },
  replyTimelineLine: { position: 'absolute', left: 4, top: 2, bottom: 2, width: 2, backgroundColor: '#ddd6fe' },
  replyTimelineItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  replyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7e57c2', marginTop: 6, marginLeft: -15 },
  replyBubble: { flex: 1, borderWidth: 1, borderColor: '#ede9fe', backgroundColor: '#faf5ff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  replyTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  replyTopActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyHead: { fontSize: 11, fontWeight: '800' },
  replyTime: { fontSize: 10, color: '#9ca3af', fontWeight: '700' },
  replyDeleteBtn: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  replyBody: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  replyComposer: { marginTop: 8, flexDirection: 'row', gap: 6, alignItems: 'center' },
  replyInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: '#111827', fontWeight: '600' },
  replySendBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  photoViewerClose: { position: 'absolute', top: 52, right: 16, zIndex: 3, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  photoViewerImage: { width: '100%', height: '78%', borderRadius: 12 },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  error: { color: '#ef4444', fontWeight: '700', marginBottom: 2 },
  retryBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6a1b9a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6 },
  retryBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  progressText: { fontSize: 11, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 7 },
});

