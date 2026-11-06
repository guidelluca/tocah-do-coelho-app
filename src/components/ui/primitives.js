import { forwardRef, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useResident } from '../../context/ResidentContext';
import { RESIDENTS } from '../../constants/residents';
import { initial, norm } from '../../utils/text';
import { Icon } from './Icon';

const webPointer = Platform.OS === 'web' ? { cursor: 'pointer' } : null;

/* ---------------- Texto ---------------- */

export function AppText({ variant = 'body', color = 'text', tabular, center, style, children, ...rest }) {
  const { colors, typography } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        typography[variant] || typography.body,
        { color: colors[color] || color },
        tabular && styles.tabular,
        center && styles.center,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ---------------- Pressable com micro-interação ---------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({ onPress, disabled, style, children, scaleTo = 0.97, accessibilityLabel, accessibilityRole = 'button', accessibilityState, hitSlop, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const animate = (to) => Animated.spring(scale, { toValue: to, useNativeDriver: Platform.OS !== 'web', speed: 40, bounciness: 0 }).start();
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  return (
    <AnimatedPressable
      {...rest}
      hitSlop={hitSlop}
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, ...(accessibilityState || {}) }}
      onPressIn={() => {
        setPressed(true);
        animate(scaleTo);
      }}
      onPressOut={() => {
        setPressed(false);
        animate(1);
      }}
      style={[resolved, !disabled && onPress ? webPointer : null, { transform: [{ scale }] }]}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  );
}

/* ---------------- Card ---------------- */

export function Card({ children, onPress, variant = 'default', padding = 'lg', style, accessibilityLabel }) {
  const { colors, radius, spacing, shadow } = useTheme();
  const base = {
    default: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth * 2, ...shadow(1) },
    flat: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth * 2 },
    sunken: { backgroundColor: colors.surfaceAlt },
    primary: { backgroundColor: colors.primarySoft },
    success: { backgroundColor: colors.successSoft },
    warning: { backgroundColor: colors.warningSoft },
    danger: { backgroundColor: colors.dangerSoft },
  }[variant];
  const cardStyle = [{ borderRadius: radius.lg, padding: spacing[padding] ?? padding }, base, style];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} accessibilityLabel={accessibilityLabel} style={({ pressed }) => [cardStyle, pressed && { opacity: 0.92 }]}>
      {children}
    </PressableScale>
  );
}

/* ---------------- Botões ---------------- */

export function Button({ label, onPress, variant = 'primary', size = 'md', icon, iconRight, loading, disabled, full, style, accessibilityLabel }) {
  const { colors, radius, spacing, typography } = useTheme();
  const v = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.primarySoft, fg: colors.onPrimarySoft, border: colors.primarySoft },
    outline: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.danger, fg: colors.onDanger, border: colors.danger },
    dangerSoft: { bg: colors.dangerSoft, fg: colors.onDangerSoft, border: colors.dangerSoft },
    success: { bg: colors.success, fg: colors.onSuccess, border: colors.success },
  }[variant] || {};
  const height = size === 'lg' ? 52 : size === 'sm' ? 44 : 48;
  const isDisabled = disabled || loading;
  return (
    <PressableScale
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel || label}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: height,
          borderRadius: radius.md,
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
          backgroundColor: v.bg,
          borderColor: v.border,
          opacity: isDisabled ? 0.55 : pressed ? 0.88 : 1,
        },
        full && styles.full,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : icon ? <Icon name={icon} size={18} color={v.fg} /> : null}
      {!!label && <Text style={[size === 'sm' ? typography.captionStrong : typography.bodyStrong, { color: v.fg }]} numberOfLines={1}>{label}</Text>}
      {!!iconRight && !loading && <Icon name={iconRight} size={18} color={v.fg} />}
    </PressableScale>
  );
}

export function IconButton({ icon, onPress, accessibilityLabel, variant = 'ghost', size = 44, iconSize = 22, color, badge, disabled, style }) {
  const { colors, radius } = useTheme();
  const v = {
    ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
    soft: { bg: colors.surfaceAlt, fg: colors.text, border: 'transparent' },
    primary: { bg: colors.primarySoft, fg: colors.primary, border: 'transparent' },
    header: { bg: colors.onHeaderSurface, fg: colors.onHeader, border: colors.onHeaderBorder },
    danger: { bg: 'transparent', fg: colors.danger, border: 'transparent' },
  }[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      scaleTo={0.9}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border === 'transparent' ? 0 : 1, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={color ? colors[color] || color : v.fg} />
      {!!badge && (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: variant === 'header' ? colors.headerEnd : colors.surface }]}>
          <Text style={[styles.badgeText, { color: colors.onHeader }]}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      )}
    </PressableScale>
  );
}

/* ---------------- Chips e pills ---------------- */

export function Chip({ label, selected, onPress, icon, left, count, style, accessibilityLabel }) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.chip,
        {
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          backgroundColor: selected ? colors.primary : colors.surfaceAlt,
          borderColor: selected ? colors.primary : colors.border,
        },
        style,
      ]}
    >
      {left}
      {!!icon && <Icon name={icon} size={16} color={selected ? colors.onPrimary : colors.textMuted} />}
      <Text style={[typography.captionStrong, { color: selected ? colors.onPrimary : colors.text }]}>{label}</Text>
      {count !== undefined && <Text style={[typography.caption, { color: selected ? colors.onPrimary : colors.textMuted }]}>{count}</Text>}
    </PressableScale>
  );
}

const TONES = {
  neutral: ['surfaceAlt', 'textMuted'],
  primary: ['primarySoft', 'onPrimarySoft'],
  success: ['successSoft', 'onSuccessSoft'],
  warning: ['warningSoft', 'onWarningSoft'],
  danger: ['dangerSoft', 'onDangerSoft'],
  info: ['infoSoft', 'info'],
};

export function StatusPill({ label, tone = 'neutral', icon, style }) {
  const { colors, radius, typography } = useTheme();
  const [bg, fg] = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: colors[bg], borderRadius: radius.pill }, style]}>
      {!!icon && <Icon name={icon} size={14} color={colors[fg]} />}
      <Text style={[typography.captionStrong, { color: colors[fg] }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ---------------- Avatar ---------------- */

export function Avatar({ name, size = 40, photo, ring, style }) {
  const { colors, avatars, typography } = useTheme();
  const { getResidentPhoto } = useResident();
  const uri = photo !== undefined ? photo : getResidentPhoto(name);
  const idx = Math.max(0, RESIDENTS.findIndex((r) => norm(r) === norm(name)));
  const pal = avatars[idx % avatars.length];
  const box = { width: size, height: size, borderRadius: size / 2 };
  const ringStyle = ring ? { borderWidth: 2, borderColor: colors[ring] || ring } : null;
  if (uri) return <Image source={{ uri }} style={[box, ringStyle, { backgroundColor: pal.bg }, style]} accessibilityLabel={`Foto de ${name}`} />;
  return (
    <View style={[box, styles.center, { backgroundColor: pal.bg }, ringStyle, style]} accessibilityLabel={`Avatar de ${name}`}>
      <Text style={[typography.bodyStrong, { color: pal.fg, fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.5) }]}>{initial(name)}</Text>
    </View>
  );
}

/* ---------------- Estrutura ---------------- */

export function SectionHeader({ title, subtitle, action, onAction, style }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.sectionHeader, { marginBottom: spacing.sm, marginTop: spacing.lg }, style]}>
      <View style={{ flex: 1 }}>
        <AppText variant="heading">{title}</AppText>
        {!!subtitle && <AppText variant="caption" color="textMuted">{subtitle}</AppText>}
      </View>
      {!!action && <Button label={action} variant="ghost" size="sm" onPress={onAction} iconRight="chevron-right" />}
    </View>
  );
}

export function Divider({ style }) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.border }, style]} />;
}

export function Segmented({ options, value, onChange, style }) {
  const { colors, radius, typography, spacing } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.xs }, style]} accessibilityRole="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, webPointer, { borderRadius: radius.sm, backgroundColor: active ? colors.surface : 'transparent' }, active && styles.segmentActive]}
          >
            <Text style={[typography.captionStrong, { color: active ? colors.text : colors.textMuted }]} numberOfLines={1}>{opt.label}</Text>
            {opt.count !== undefined && <Text style={[typography.caption, { color: active ? colors.primary : colors.textSubtle }]}>{opt.count}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value = 0, tone = 'primary', height = 8, style }) {
  const { colors, radius } = useTheme();
  const pct = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <View style={[{ height, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }, style]} accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(pct * 100), min: 0, max: 100 }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: radius.pill, backgroundColor: colors[tone] || colors.primary }} />
    </View>
  );
}

export const TextField = forwardRef(function TextField({ label, hint, error, style, inputStyle, multiline, prefix, ...rest }, ref) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      {!!label && <AppText variant="captionStrong" color="textMuted" style={{ marginBottom: spacing.xs }}>{label}</AppText>}
      <View style={[styles.inputWrap, { borderRadius: radius.md, borderColor: error ? colors.danger : colors.borderStrong, backgroundColor: colors.surface, minHeight: multiline ? 88 : 48 }]}>
        {!!prefix && <AppText variant="bodyStrong" color="textMuted" style={{ marginLeft: spacing.md }}>{prefix}</AppText>}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textSubtle}
          multiline={multiline}
          {...rest}
          style={[typography.body, styles.input, { color: colors.text, paddingHorizontal: spacing.md, textAlignVertical: multiline ? 'top' : 'center' }, Platform.OS === 'web' && styles.webInput, inputStyle]}
        />
      </View>
      {!!(error || hint) && <AppText variant="caption" color={error ? 'danger' : 'textSubtle'} style={{ marginTop: spacing.xs }}>{error || hint}</AppText>}
    </View>
  );
});

export function ListRow({ left, title, subtitle, right, onPress, chevron, style, titleColor, accessibilityLabel }) {
  const { spacing, colors } = useTheme();
  const content = (
    <View style={[styles.row, { paddingVertical: spacing.md, gap: spacing.md, minHeight: 56 }, style]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <AppText variant="bodyStrong" color={titleColor || 'text'} numberOfLines={1}>{title}</AppText> : title}
        {typeof subtitle === 'string' && !!subtitle ? <AppText variant="caption" color="textMuted" numberOfLines={2}>{subtitle}</AppText> : subtitle || null}
      </View>
      {right}
      {chevron && <Icon name="chevron-right" size={20} color={colors.textSubtle} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [webPointer, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center', alignItems: 'center', justifyContent: 'center' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1 },
  full: { alignSelf: 'stretch' },
  iconBtn: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  badgeText: { fontSize: 10, lineHeight: 12, fontWeight: '700' },
  chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center' },
  segmented: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 6 },
  segmentActive: { shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  inputWrap: { borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minHeight: 46, paddingVertical: 10 },
  webInput: { outlineStyle: 'none' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
