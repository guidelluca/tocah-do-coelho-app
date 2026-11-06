import { Platform, Share } from 'react-native';

/** Compartilha texto. No navegador sem "compartilhar", copia para a área de transferência. Retorna 'shared' | 'copied' | 'cancelled'. */
export async function shareText(message, title = 'Tocah') {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title, text: message });
        return 'shared';
      } catch (e) {
        if (e?.name === 'AbortError') return 'cancelled';
      }
    }
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(message);
      return 'copied';
    }
    throw new Error('Seu navegador não permite compartilhar.');
  }
  const res = await Share.share({ message, title });
  return res?.action === Share.dismissedAction ? 'cancelled' : 'shared';
}
