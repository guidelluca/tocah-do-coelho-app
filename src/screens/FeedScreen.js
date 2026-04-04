import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
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

function getPostMeta(post) {
  if (post.type === 'check') return { icon: 'checkbox-marked-circle-outline', label: 'Concluiu tarefa', color: '#16a34a' };
  if (post.type === 'rating') return { icon: 'star-circle-outline', label: 'Avaliação', color: '#f59e0b' };
  return { icon: 'message-reply-text-outline', label: 'Publicação', color: '#7c3aed' };
}

function getAvatarPalette(name = '') {
  const palettes = [
    { bg: '#ede9fe', fg: '#5b21b6' },
    { bg: '#e0f2fe', fg: '#0c4a6e' },
    { bg: '#dcfce7', fg: '#166534' },
    { bg: '#ffe4e6', fg: '#9f1239' },
    { bg: '#fef3c7', fg: '#92400e' },
  ];
  const str = String(name || '').trim().toUpperCase();
  const seed = str.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palettes[seed % palettes.length];
}

function getInitial(name = '') {
  const raw = String(name || '').trim();
  return raw ? raw.slice(0, 1).toUpperCase() : '?';
}

const FEED_LIKES_KEY = '@tocah_feed_likes_v1';
const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images || 'images';

export function FeedScreen() {
  const { isDark } = useThemeMode();
  const { resident, getResidentPhoto, setResidentPhoto, removeResidentPhoto } = useResident();
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
  const [likedByPostTs, setLikedByPostTs] = useState({});

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

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FEED_LIKES_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        setLikedByPostTs(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        setLikedByPostTs({});
      }
    })();
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
      mediaTypes: IMAGE_MEDIA_TYPES,
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
      mediaTypes: IMAGE_MEDIA_TYPES,
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
      return item.type === 'check' || item.type === 'rating' || item.type === 'comment';
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
    const base = (feed || []).filter((item) => item.type === 'check' || item.type === 'rating' || item.type === 'comment');
    return {
      all: base.length,
      check: base.filter((x) => x.type === 'check').length,
      rating: base.filter((x) => x.type === 'rating').length,
      comment: base.filter((x) => x.type === 'comment').length,
    };
  }, [feed]);

  const pickProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita acesso à galeria para escolher sua foto de perfil.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: IMAGE_MEDIA_TYPES,
      quality: 0.35,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    await setResidentPhoto(resident, result.assets[0].uri);
    Alert.alert('Perfil atualizado', 'Sua foto de perfil foi atualizada.');
  };

  const handleProfilePhotoOptions = () => {
    Alert.alert('Foto de perfil', `Perfil atual: ${resident}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Escolher da galeria', onPress: pickProfilePhoto },
      {
        text: 'Remover foto',
        style: 'destructive',
        onPress: async () => {
          await removeResidentPhoto(resident);
        },
      },
    ]);
  };

  const toggleLike = async (postTs) => {
    const key = String(postTs || '').trim();
    if (!key) return;
    const next = { ...likedByPostTs };
    if (next[key]) delete next[key];
    else next[key] = true;
    setLikedByPostTs(next);
    try {
      await AsyncStorage.setItem(FEED_LIKES_KEY, JSON.stringify(next));
    } catch {
      // Ignore persistence failures to keep UI responsive.
    }
  };

  const openReplyComposer = (postTs) => {
    const key = String(postTs || '').trim();
    if (!key) return;
    setReplyingToTs((prev) => (prev === key ? '' : key));
  };

  const sharePost = async (post) => {
    try {
      const body = `${post?.actor || 'Morador'} • ${formatRelativeTime(post?.ts || '')}\n${post?.content || ''}`;
      await Share.share({
        message: `República Tocah\n\n${body}`.trim(),
        title: 'Compartilhar publicação',
      });
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Não foi possível compartilhar a publicação.');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
    >
      <AppHeader title="Feed da Casa" subtitle={`Atualizações semanais • ${resident}`} />

      <View style={[styles.composerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.composerHead}>
          {getResidentPhoto(resident) ? (
            <Image source={{ uri: getResidentPhoto(resident) }} style={styles.composerAvatarPhoto} />
          ) : (
            <View style={[styles.composerAvatar, { backgroundColor: getAvatarPalette(resident).bg }]}>
              <Text style={[styles.composerAvatarText, { color: getAvatarPalette(resident).fg }]}>{getInitial(resident)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.composerTitle, { color: colors.text }]}>Publicar no feed</Text>
            <Text style={styles.composerSubtitle}>Compartilhe progresso, foto ou aviso da casa.</Text>
          </View>
          <Pressable style={styles.profileEditBtn} onPress={handleProfilePhotoOptions}>
            <MaterialCommunityIcons name="account-edit-outline" size={16} color="#6a1b9a" />
          </Pressable>
        </View>
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

      {loading ? (
        <>
          {[0, 1, 2].map((item) => (
            <View key={`skeleton-${item}`} style={[styles.feedSkeleton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.feedSkeletonHead}>
                <View style={styles.skeletonAvatar} />
                <View style={{ flex: 1 }}>
                  <View style={styles.skeletonLineLg} />
                  <View style={styles.skeletonLineSm} />
                </View>
              </View>
              <View style={styles.skeletonLineFull} />
              <View style={styles.skeletonImage} />
            </View>
          ))}
        </>
      ) : null}

      {topLevelFeed.map((post, idx) => (
        <View key={`${post.ts}-${idx}`} style={[styles.feedItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.feedHeadRow}>
            <View style={styles.feedAuthorRow}>
              {getResidentPhoto(post.actor) ? (
                <Image source={{ uri: getResidentPhoto(post.actor) }} style={styles.feedAvatarPhoto} />
              ) : (
                <View style={[styles.feedAvatar, { backgroundColor: getAvatarPalette(post.actor).bg }]}>
                  <Text style={[styles.feedAvatarText, { color: getAvatarPalette(post.actor).fg }]}>{getInitial(post.actor)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.feedHead, { color: colors.text }]}>{post.actor}</Text>
                <View style={styles.feedMetaRow}>
                  <View style={[styles.postTypePill, { backgroundColor: `${getPostMeta(post).color}1A` }]}>
                    <MaterialCommunityIcons name={getPostMeta(post).icon} size={12} color={getPostMeta(post).color} />
                    <Text style={[styles.postTypeText, { color: getPostMeta(post).color }]}>{getPostMeta(post).label}</Text>
                  </View>
                  <Text style={styles.feedTime}>• {formatRelativeTime(post.ts)}</Text>
                </View>
              </View>
            </View>
            <View style={styles.feedActions}>
              <Pressable style={styles.feedReplyBtn} onPress={() => openReplyComposer(post.ts)}>
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

          {!!post.tarefa && (
            <Text style={[styles.feedHighlight, { color: colors.text }]}>
              {post.tarefa}
            </Text>
          )}
          <Text style={[styles.feedBody, { color: colors.muted }]}>{post.content || post.target || ''}</Text>

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

          <View style={styles.feedFooterBar}>
            <Pressable
              style={[styles.feedFooterAction, likedByPostTs[post.ts] && styles.feedFooterActionActive]}
              onPress={() => toggleLike(post.ts)}
            >
              <MaterialCommunityIcons name={likedByPostTs[post.ts] ? 'heart' : 'heart-outline'} size={16} color={likedByPostTs[post.ts] ? '#e11d48' : '#9ca3af'} />
              <Text style={[styles.feedFooterText, likedByPostTs[post.ts] && styles.feedFooterTextActive]}>
                {likedByPostTs[post.ts] ? 'Curtido' : 'Curtir'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.feedFooterAction, replyingToTs === post.ts && styles.feedFooterActionActive]}
              onPress={() => openReplyComposer(post.ts)}
            >
              <MaterialCommunityIcons name="comment-outline" size={16} color={replyingToTs === post.ts ? '#6a1b9a' : '#9ca3af'} />
              <Text style={[styles.feedFooterText, replyingToTs === post.ts && styles.feedFooterTextActive]}>
                {(repliesByPostTs[post.ts] || []).length} comentários
              </Text>
            </Pressable>
            <Pressable style={styles.feedFooterAction} onPress={() => sharePost(post)}>
              <MaterialCommunityIcons name="share-outline" size={16} color="#9ca3af" />
              <Text style={styles.feedFooterText}>Compartilhar</Text>
            </Pressable>
          </View>

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
  composerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  composerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  composerAvatarPhoto: { width: 36, height: 36, borderRadius: 18 },
  composerAvatarText: { fontSize: 12, fontWeight: '900' },
  profileEditBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5' },
  composerTitle: { fontSize: 13, fontWeight: '900' },
  composerSubtitle: { marginTop: 1, color: '#94a3b8', fontSize: 10, fontWeight: '600' },
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
  feedItem: { borderWidth: 1, borderRadius: 18, padding: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  feedSkeleton: { borderWidth: 1, borderRadius: 18, padding: 12 },
  feedSkeletonHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  skeletonAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ececf1' },
  skeletonLineLg: { width: '62%', height: 10, borderRadius: 5, backgroundColor: '#ececf1', marginBottom: 6 },
  skeletonLineSm: { width: '32%', height: 8, borderRadius: 4, backgroundColor: '#ececf1' },
  skeletonLineFull: { width: '92%', height: 9, borderRadius: 5, backgroundColor: '#ececf1', marginBottom: 8 },
  skeletonImage: { width: '100%', height: 150, borderRadius: 10, backgroundColor: '#ececf1' },
  feedHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  feedAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  feedAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  feedAvatarPhoto: { width: 38, height: 38, borderRadius: 19 },
  feedAvatarText: { fontSize: 13, fontWeight: '900' },
  feedActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  feedHead: { fontSize: 13, fontWeight: '900' },
  feedMetaRow: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  postTypePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  postTypeText: { fontSize: 10, fontWeight: '800' },
  feedTime: { marginTop: 2, fontSize: 10, color: '#9ca3af', fontWeight: '700' },
  feedReplyBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5' },
  feedDeleteBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  feedHighlight: { marginTop: 8, fontSize: 12, fontWeight: '800' },
  feedBody: { fontSize: 12, marginTop: 4, fontWeight: '600', lineHeight: 18 },
  feedPhoto: { width: '100%', height: 190, borderRadius: 10, marginTop: 8, backgroundColor: '#e5e7eb' },
  feedFooterBar: { marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ede9fe', flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedFooterAction: { flex: 1, minHeight: 34, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb' },
  feedFooterActionActive: { backgroundColor: '#f3e8ff', borderColor: '#d8b4fe' },
  feedFooterText: { color: '#94a3b8', fontSize: 10, fontWeight: '700' },
  feedFooterTextActive: { color: '#6a1b9a' },
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

