import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { Icon } from './Icon';
import { AppText, Button } from './primitives';

/**
 * Substitui o Alert do React Native (que não faz nada no web):
 *   const { toast, confirm } = useFeedback();
 *   toast('Salvo!', 'success');
 *   if (await confirm({ title: 'Excluir?', message: '...', confirmLabel: 'Excluir', destructive: true })) { ... }
 */
const FeedbackContext = createContext(null);

const TOAST_META = {
  success: { icon: 'check-circle', bg: 'successSoft', fg: 'onSuccessSoft' },
  error: { icon: 'alert-circle', bg: 'dangerSoft', fg: 'onDangerSoft' },
  info: { icon: 'information', bg: 'surfaceAlt', fg: 'text' },
  warning: { icon: 'alert', bg: 'warningSoft', fg: 'onWarningSoft' },
};

export function FeedbackProvider({ children }) {
  const { colors, radius, spacing, shadow, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const [toastState, setToastState] = useState(null);
  const [dialog, setDialog] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  const resolver = useRef(null);
  const native = Platform.OS !== 'web';

  const toast = useCallback((message, type = 'info', duration = 3200) => {
    if (!message) return;
    clearTimeout(timer.current);
    setToastState({ message: String(message), type, key: Date.now() });
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: native }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: native }).start(() => setToastState(null));
    }, duration);
  }, [anim, native]);

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    resolver.current = resolve;
    setDialog({ title: 'Tem certeza?', confirmLabel: 'Confirmar', cancelLabel: 'Cancelar', ...opts });
  }), []);

  const close = (result) => {
    setDialog(null);
    resolver.current?.(result);
    resolver.current = null;
  };

  /** Atalho: toast de erro com a mensagem do servidor. */
  const toastError = useCallback((error, fallback = 'Algo deu errado. Tente de novo.') => toast(error?.message || fallback, 'error', 4500), [toast]);

  const value = useMemo(() => ({ toast, toastError, confirm }), [toast, toastError, confirm]);
  const meta = TOAST_META[toastState?.type] || TOAST_META.info;

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {!!toastState && (
        <View pointerEvents="box-none" style={[styles.toastWrap, { top: insets.top + spacing.sm }]}>
          <Animated.View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={[
              styles.toast,
              shadow(2),
              {
                maxWidth: layout.maxWidth - 32,
                backgroundColor: colors[meta.bg],
                borderRadius: radius.md,
                padding: spacing.md,
                opacity: anim,
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
              },
            ]}
          >
            <Icon name={meta.icon} size={20} color={meta.fg} />
            <AppText variant="bodyStrong" color={meta.fg} style={{ flex: 1 }}>{toastState.message}</AppText>
          </Animated.View>
        </View>
      )}
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => close(false)}>
        <Pressable style={[styles.dialogBackdrop, { backgroundColor: colors.overlay }]} onPress={() => close(false)}>
          <Pressable style={[styles.dialog, shadow(3), { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl }]} onPress={() => {}}>
            {!!dialog?.icon && (
              <View style={[styles.dialogIcon, { backgroundColor: dialog.destructive ? colors.dangerSoft : colors.primarySoft }]}>
                <Icon name={dialog.icon} size={24} color={dialog.destructive ? 'danger' : 'primary'} />
              </View>
            )}
            <AppText variant="title" style={{ marginBottom: spacing.xs }}>{dialog?.title}</AppText>
            {!!dialog?.message && <AppText variant="body" color="textMuted">{dialog.message}</AppText>}
            <View style={[styles.dialogActions, { marginTop: spacing.xl }]}>
              {dialog?.cancelLabel !== null && <Button label={dialog?.cancelLabel} variant="outline" onPress={() => close(false)} style={{ flex: 1 }} />}
              <Button label={dialog?.confirmLabel} variant={dialog?.destructive ? 'danger' : 'primary'} onPress={() => close(true)} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback precisa do FeedbackProvider');
  return ctx;
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16, zIndex: 1000 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' },
  dialogBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 400 },
  dialogIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  dialogActions: { flexDirection: 'row', gap: 10 },
});
