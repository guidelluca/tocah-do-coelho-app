import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFeedPhoto } from '../services/api';
import { useTheme } from '../theme/ThemeContext';
import { IconButton, Skeleton } from './ui';

const memory = new Map();
const inflight = new Map();

/** Busca a foto de um post só quando ela aparece na tela (o feed vem sem fotos = bem mais leve). */
export function useFeedPhoto(ts, enabled = true) {
  const [uri, setUri] = useState(() => memory.get(ts) || '');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ts || !enabled || memory.has(ts)) {
      if (memory.has(ts)) setUri(memory.get(ts));
      return;
    }
    let cancelled = false;
    if (!inflight.has(ts)) inflight.set(ts, getFeedPhoto(ts).then((r) => r?.photoDataUrl || '').finally(() => inflight.delete(ts)));
    inflight.get(ts).then(
      (data) => {
        memory.set(ts, data);
        if (!cancelled) setUri(data);
      },
      () => !cancelled && setFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, [ts, enabled]);
  return { uri, failed };
}

export function FeedPhoto({ ts, aspectRatio = 4 / 3, style, rounded = true }) {
  const { radius, colors } = useTheme();
  const { uri, failed } = useFeedPhoto(ts);
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState(aspectRatio);
  useEffect(() => {
    if (!uri) return;
    Image.getSize(uri, (w, h) => w && h && setRatio(Math.max(0.6, Math.min(1.8, w / h))), () => {});
  }, [uri]);
  if (failed) return null;
  const br = rounded ? radius.md : 0;
  if (!uri) {
    return (
      <View style={[{ aspectRatio, width: '100%' }, style]}>
        <Skeleton height="100%" radius={br} />
      </View>
    );
  }
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="Abrir foto">
        <Image source={{ uri }} style={[{ width: '100%', aspectRatio: ratio, borderRadius: br, backgroundColor: colors.surfaceSunken }, style]} resizeMode="cover" />
      </Pressable>
      <PhotoViewer uri={open ? uri : ''} onClose={() => setOpen(false)} />
    </>
  );
}

export function PhotoViewer({ uri, onClose }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.viewer, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar foto" />
        {!!uri && <Image source={{ uri }} style={styles.full} resizeMode="contain" />}
        <IconButton icon="close" onPress={onClose} accessibilityLabel="Fechar" variant="header" style={[styles.close, { top: insets.top + 12 }]} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  close: { position: 'absolute', right: 16 },
});
