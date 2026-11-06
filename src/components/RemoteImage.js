import { useState } from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * Igual ao app antigo: mostra a imagem do Drive direto e, se der erro, tenta o próximo link.
 * Só usa a imagem local quando todos os links do Drive falharem.
 */
export function RemoteImage({ sources = [], fallback, style, resizeMode = 'cover', accessibilityLabel }) {
  const { colors } = useTheme();
  const [idx, setIdx] = useState(0);
  const list = [...sources.map((uri) => ({ uri })), ...(fallback ? [fallback] : [])];
  const current = list[Math.min(idx, list.length - 1)];
  return (
    <View style={[style, { overflow: 'hidden', backgroundColor: colors.surfaceSunken }]}>
      {!!current && (
        <Image
          key={idx}
          source={current}
          style={{ width: '100%', height: '100%' }}
          resizeMode={resizeMode}
          accessibilityLabel={accessibilityLabel}
          onError={() => setIdx((prev) => (prev < list.length - 1 ? prev + 1 : prev))}
        />
      )}
    </View>
  );
}

// Mesmas imagens e mesma ordem de links que o app antigo usava.
const drive = (id, size) => [
  `https://drive.google.com/uc?export=download&id=${id}`,
  `https://drive.google.com/uc?export=view&id=${id}`,
  `https://drive.google.com/thumbnail?id=${id}&sz=${size}`,
];
export const LOGO_SOURCES = drive('1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS', 'w512');
export const HOUSE_SOURCES = drive('1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ', 'w1600');
export const NILDE_SOURCES = drive('1O5j25VTPPB96BqSHmXULim99qmc2tfuH', 'w1600');
