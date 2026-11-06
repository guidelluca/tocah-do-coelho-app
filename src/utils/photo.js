import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images || ImagePicker.MediaTypeOptions?.Images || 'images';

/** No web o picker devolve a imagem original (MBs). Aqui ela é reduzida no próprio navegador (canvas), sem biblioteca nova. */
function resizeOnWeb(uri, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Não consegui ler essa imagem.'));
    img.src = uri;
  });
}

/**
 * Abre câmera ou galeria e devolve um data URL JPEG já reduzido.
 * Retorna '' se o morador cancelar. Lança Error com mensagem amigável em pt-BR.
 * size: 'proof' (até 900px) | 'avatar' (256px, recorte quadrado)
 */
export async function pickPhoto({ source = 'library', size = 'proof' } = {}) {
  // Tamanhos pensados para caber bem na planilha (cada foto vira 2–3 células de 45 mil caracteres).
  const maxSize = size === 'avatar' ? 256 : 900;
  const quality = size === 'avatar' ? 0.75 : 0.55;
  if (Platform.OS !== 'web') {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error(source === 'camera' ? 'Permita o uso da câmera nas configurações do aparelho.' : 'Permita o acesso às fotos nas configurações do aparelho.');
    }
  }
  const options = {
    mediaTypes: IMAGE_MEDIA_TYPES,
    allowsEditing: true,
    aspect: size === 'avatar' ? [1, 1] : undefined,
    quality: size === 'avatar' ? 0.5 : 0.3,
    base64: Platform.OS !== 'web',
  };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return '';
  const asset = result.assets?.[0];
  if (!asset) return '';
  if (asset.type && asset.type !== 'image') throw new Error('Escolha uma foto (vídeo não vale).');
  if (Platform.OS === 'web') return resizeOnWeb(asset.uri, maxSize, quality);
  if (!asset.base64) throw new Error('Não consegui ler a foto. Tenta de novo?');
  return `data:image/jpeg;base64,${asset.base64}`;
}

/**
 * Converte uma foto antiga salva no aparelho (app anterior) em data URL pequena para subir na planilha.
 * Retorna '' se a foto não existir mais (ex.: link temporário do navegador que expirou).
 */
export async function legacyUriToAvatar(uri) {
  const raw = String(uri || '').trim();
  if (!raw) return '';
  try {
    if (Platform.OS === 'web') return await resizeOnWeb(raw, 256, 0.8);
    if (raw.startsWith('data:image/')) return raw.length < 280000 ? raw : '';
    const blob = await (await fetch(raw)).blob();
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return data.startsWith('data:image/') && data.length < 280000 ? data : '';
  } catch {
    return '';
  }
}
