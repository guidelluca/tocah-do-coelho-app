import { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { AppText, IconButton } from './primitives';

/**
 * Sheet que sobe de baixo, com overlay e animação. Funciona no web (Esc fecha) e no nativo.
 * Use `footer` para os botões fixos (salvar/cancelar).
 */
export function BottomSheet({ visible, onClose, title, subtitle, children, footer, scroll = true, maxHeight = '88%', dismissable = true }) {
  const { colors, radius, spacing, layout, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: native }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: native }).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const Body = scroll ? ScrollView : View;

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismissable ? onClose : undefined} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: progress }]}>
          <Pressable style={styles.fill} onPress={dismissable ? onClose : undefined} accessibilityLabel="Fechar" />
        </Animated.View>
        <View style={styles.bottom} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                maxHeight,
                maxWidth: layout.maxWidth,
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                paddingBottom: Math.max(insets.bottom, spacing.lg),
                opacity: progress,
                transform: [{ translateY }],
              },
              shadow(3),
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
            {(!!title || dismissable) && (
              <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }]}>
                <View style={{ flex: 1 }}>
                  {!!title && <AppText variant="title">{title}</AppText>}
                  {!!subtitle && <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>{subtitle}</AppText>}
                </View>
                {dismissable && <IconButton icon="close" onPress={onClose} accessibilityLabel="Fechar" variant="soft" size={40} iconSize={20} />}
              </View>
            )}
            <Body
              style={scroll ? styles.scroll : null}
              contentContainerStyle={scroll ? { paddingHorizontal: spacing.lg, paddingBottom: spacing.md } : null}
              keyboardShouldPersistTaps="handled"
            >
              {scroll ? children : <View style={{ paddingHorizontal: spacing.lg }}>{children}</View>}
            </Body>
            {!!footer && <View style={[styles.footer, { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopColor: colors.border }]}>{footer}</View>}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', paddingTop: 8 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth * 2, flexDirection: 'row', gap: 10 },
});
