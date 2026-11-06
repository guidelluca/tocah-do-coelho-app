import { useState } from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/** Tenta uma lista de URLs (Drive) e cai para a imagem local. Enquanto carrega, mostra um fundo neutro. */
export function RemoteImage({ sources = [], fallback, style, resizeMode = 'cover', accessibilityLabel }) {
  const { colors } = useTheme();
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const list = [...sources.map((uri) => ({ uri })), ...(fallback ? [fallback] : [])];
  const current = list[Math.min(idx, list.length - 1)];
  return (
    <View style={[style, { overflow: 'hidden', backgroundColor: colors.surfaceSunken }]}>
      {!!current && (
        <Image
          source={current}
          style={{ width: '100%', height: '100%', opacity: loaded ? 1 : 0 }}
          resizeMode={resizeMode}
          accessibilityLabel={accessibilityLabel}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setIdx((prev) => (prev < list.length - 1 ? prev + 1 : prev));
          }}
        />
      )}
    </View>
  );
}

export const LOGO_SOURCES = [
  'https://drive.google.com/thumbnail?id=1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS&sz=w256',
  'https://drive.google.com/uc?export=view&id=1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS',
];
export const HOUSE_SOURCES = [
  'https://drive.google.com/thumbnail?id=1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ&sz=w1200',
  'https://drive.google.com/uc?export=view&id=1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ',
];
export const NILDE_SOURCES = [
  'https://drive.google.com/thumbnail?id=1O5j25VTPPB96BqSHmXULim99qmc2tfuH&sz=w1200',
  'https://drive.google.com/uc?export=view&id=1O5j25VTPPB96BqSHmXULim99qmc2tfuH',
];
