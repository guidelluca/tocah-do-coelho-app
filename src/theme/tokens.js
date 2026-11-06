/**
 * Design tokens do Tocah. ÚNICO lugar do app com cores literais.
 * `npm run check:ui` falha se aparecer cor fora deste arquivo.
 */
import { Platform } from 'react-native';

export const palette = {
  light: {
    bg: '#F6F4FA',
    surface: '#FFFFFF',
    surfaceAlt: '#F3EFF8',
    surfaceSunken: '#ECE7F3',
    text: '#1C1A26',
    textMuted: '#625D75',
    textSubtle: '#8F8AA3',
    border: '#E7E2EF',
    borderStrong: '#D3CCE0',
    primary: '#6A1B9A',
    primaryPressed: '#55137E',
    onPrimary: '#FFFFFF',
    primarySoft: '#F2E7F9',
    onPrimarySoft: '#55137E',
    success: '#1B8A4B',
    successSoft: '#E4F4EA',
    onSuccessSoft: '#14663A',
    warning: '#A86200',
    warningSoft: '#FCF0DA',
    onWarningSoft: '#7A4700',
    danger: '#C42B37',
    onDanger: '#FFFFFF',
    onSuccess: '#FFFFFF',
    dangerSoft: '#FBE6E8',
    onDangerSoft: '#951E28',
    info: '#2459D6',
    infoSoft: '#E5EDFC',
    star: '#E8A10C',
    overlay: 'rgba(20, 14, 32, 0.48)',
    scrim: 'rgba(0, 0, 0, 0.88)',
    shadow: '#2E1F47',
    headerStart: '#6A1B9A',
    headerEnd: '#4A148C',
    onHeader: '#FFFFFF',
    onHeaderMuted: 'rgba(255, 255, 255, 0.78)',
    onHeaderSurface: 'rgba(255, 255, 255, 0.16)',
    onHeaderBorder: 'rgba(255, 255, 255, 0.28)',
    onImage: '#FFFFFF',
    imageScrim: 'rgba(16, 8, 28, 0.55)',
    skeleton: '#E9E4F1',
  },
  dark: {
    bg: '#110F17',
    surface: '#1B1924',
    surfaceAlt: '#23202E',
    surfaceSunken: '#16141E',
    text: '#F3F0FA',
    textMuted: '#B3ADC4',
    textSubtle: '#827C96',
    border: '#2D2939',
    borderStrong: '#3E394E',
    primary: '#C894EA',
    primaryPressed: '#B57AD9',
    onPrimary: '#1D0F29',
    primarySoft: '#2E2140',
    onPrimarySoft: '#E6CFF6',
    success: '#5CD18E',
    successSoft: '#17301F',
    onSuccessSoft: '#9BE6BA',
    warning: '#F2B55C',
    warningSoft: '#352813',
    onWarningSoft: '#F8D49C',
    danger: '#FF7B86',
    onDanger: '#2A0A0F',
    onSuccess: '#0B2414',
    dangerSoft: '#3A1A20',
    onDangerSoft: '#FFB3BA',
    info: '#86AEFF',
    infoSoft: '#1A2540',
    star: '#F5BE3A',
    overlay: 'rgba(0, 0, 0, 0.62)',
    scrim: 'rgba(0, 0, 0, 0.92)',
    shadow: '#000000',
    headerStart: '#3D1E58',
    headerEnd: '#22102F',
    onHeader: '#FFFFFF',
    onHeaderMuted: 'rgba(255, 255, 255, 0.72)',
    onHeaderSurface: 'rgba(255, 255, 255, 0.12)',
    onHeaderBorder: 'rgba(255, 255, 255, 0.22)',
    onImage: '#FFFFFF',
    imageScrim: 'rgba(0, 0, 0, 0.6)',
    skeleton: '#26222F',
  },
};

/** Cor de avatar por morador (fundo/texto), em claro e escuro. */
export const avatarColors = {
  light: [
    { bg: '#EDE4FA', fg: '#5B21B6' },
    { bg: '#E0F0FD', fg: '#0B4A75' },
    { bg: '#DDF6E6', fg: '#14613A' },
    { bg: '#FDE4E8', fg: '#9F1239' },
    { bg: '#FCF0D6', fg: '#8A4B00' },
  ],
  dark: [
    { bg: '#33264A', fg: '#D9C6FA' },
    { bg: '#16324A', fg: '#A9D6FA' },
    { bg: '#173524', fg: '#A3E7BE' },
    { bg: '#40202A', fg: '#FFB8C6' },
    { bg: '#3B2C12', fg: '#F7D293' },
  ],
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

/**
 * Escala tipográfica. Mesma fonte do sistema do app antigo (sem fonte customizada),
 * com pesos fortes (700–900) como antes, só que com tamanhos mais legíveis.
 */
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '900' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '800' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
};

export const touch = { min: 44 };

export const layout = { maxWidth: 560, tabBarHeight: 64 };

export function elevation(level, colors) {
  if (!level) return {};
  const map = { 1: [2, 6, 0.06], 2: [6, 16, 0.1], 3: [12, 28, 0.18] };
  const [y, r, o] = map[level] || map[1];
  if (Platform.OS === 'android') return { elevation: level * 2 };
  return { shadowColor: colors.shadow, shadowOpacity: o, shadowRadius: r, shadowOffset: { width: 0, height: y } };
}
