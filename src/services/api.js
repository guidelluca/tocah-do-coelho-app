import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const hostFromExpo =
  String(Constants?.expoConfig?.hostUri || Constants?.manifest2?.extra?.expoGo?.debuggerHost || '')
    .split(':')[0]
    .trim();
const hostFromManifest =
  String(Constants?.manifest?.debuggerHost || Constants?.manifest?.hostUri || '')
    .split(':')[0]
    .trim();
const hostFromScriptUrl = String(NativeModules?.SourceCode?.scriptURL || '')
  .replace('http://', '')
  .replace('https://', '')
  .split('/')[0]
  .split(':')[0]
  .trim();
const webOrigin =
  typeof window !== 'undefined' && window?.location?.origin
    ? String(window.location.origin).trim()
    : '';
const FALLBACK_REMOTE_API = 'https://tocah-do-coelho-app.onrender.com/api';

function normalizeApiBase(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

const API_URL =
  normalizeApiBase(process.env.EXPO_PUBLIC_API_URL) ||
  (webOrigin ? `${webOrigin}/api` : '') ||
  FALLBACK_REMOTE_API ||
  (hostFromExpo ? `http://${hostFromExpo}:4000/api` : '') ||
  'http://localhost:4000/api';

function isValidHost(raw = '') {
  const host = String(raw || '').trim();
  if (!host) return false;
  if (host === 'localhost') return true;
  const ipv4 = host.match(/^(\d{1,3})(\.\d{1,3}){3}$/);
  if (!ipv4) return false;
  return host.split('.').every((part) => {
    const n = Number(part);
    return Number.isFinite(n) && n >= 0 && n <= 255;
  });
}

const API_BASE_CANDIDATES = Array.from(
  new Set(
    [
      normalizeApiBase(process.env.EXPO_PUBLIC_API_URL),
      FALLBACK_REMOTE_API,
      webOrigin ? `${webOrigin}/api` : '',
      isValidHost(hostFromExpo) ? `http://${hostFromExpo}:4000/api` : '',
      isValidHost(hostFromManifest) ? `http://${hostFromManifest}:4000/api` : '',
      isValidHost(hostFromScriptUrl) ? `http://${hostFromScriptUrl}:4000/api` : '',
      'http://localhost:4000/api',
    ].map((base) => normalizeApiBase(base)).filter(Boolean)
  )
);

let preferredApiBase = API_URL;
const CACHE_KEY_PREFIX = '@tocah_api_cache:';
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24; // 24h
let connectionStatus = {
  online: true,
  source: 'network',
  message: '',
  cachedAt: '',
  apiBase: API_URL,
  updatedAt: '',
};
const connectionListeners = new Set();

function notifyConnectionStatus() {
  connectionListeners.forEach((listener) => {
    try {
      listener(connectionStatus);
    } catch {
      // Ignore listener errors to keep network flow stable.
    }
  });
}

function updateConnectionStatus(next = {}) {
  connectionStatus = {
    ...connectionStatus,
    ...next,
    updatedAt: new Date().toISOString(),
  };
  notifyConnectionStatus();
}

export function getApiConnectionStatus() {
  return { ...connectionStatus };
}

export function subscribeApiConnectionStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  connectionListeners.add(listener);
  listener({ ...connectionStatus });
  return () => {
    connectionListeners.delete(listener);
  };
}

function buildCacheKey(url) {
  try {
    const parsed = new URL(String(url || ''));
    return `${CACHE_KEY_PREFIX}${parsed.pathname}${parsed.search}`;
  } catch {
    return `${CACHE_KEY_PREFIX}${String(url || '').trim()}`;
  }
}

async function readCachedPayload(url) {
  try {
    const raw = await AsyncStorage.getItem(buildCacheKey(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || typeof parsed?.payload === 'undefined') return null;
    const ageMs = Date.now() - new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_CACHE_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveCachedPayload(url, payload) {
  try {
    await AsyncStorage.setItem(
      buildCacheKey(url),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        payload,
      })
    );
  } catch {
    // Cache failure should not block app usage.
  }
}

export function getApiDebugInfo() {
  return {
    preferredApiBase,
    candidates: API_BASE_CANDIDATES,
    envApiUrl: process.env.EXPO_PUBLIC_API_URL || '',
    hostFromExpo,
    hostFromManifest,
    hostFromScriptUrl,
  };
}

export function setPreferredApiBase(nextBase) {
  if (nextBase) preferredApiBase = normalizeApiBase(nextBase);
}

function mapUrlToBase(url, base) {
  if (url.startsWith(API_URL)) return url.replace(API_URL, base);
  if (url.startsWith(preferredApiBase)) return url.replace(preferredApiBase, base);
  return url;
}

function toHealthUrl(base) {
  const trimmed = String(base || '').replace(/\/+$/, '');
  return `${trimmed.replace(/\/api$/, '')}/health`;
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const method = String(init?.method || 'GET').toUpperCase();
  const bodyLength = typeof init?.body === 'string' ? init.body.length : 0;
  const timeoutMs = method === 'POST'
    ? (bodyLength > 200000 ? 35000 : 18000)
    : 18000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...(init || {}), signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Tempo esgotado ao conectar com a API em ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Resposta invalida da API em ${url}`);
  }
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.message || `Falha ao buscar dados em ${url}`);
  }
  return data;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url) {
  const candidates = [preferredApiBase, ...API_BASE_CANDIDATES.filter((b) => b !== preferredApiBase)];
  let lastError = null;
  for (const base of candidates) {
    const candidateUrl = mapUrlToBase(url, base);
    try {
      const data = await fetchJson(candidateUrl);
      preferredApiBase = base;
      updateConnectionStatus({
        online: true,
        source: 'network',
        message: '',
        cachedAt: '',
        apiBase: base,
      });
      await saveCachedPayload(url, data);
      return data;
    } catch (error) {
      lastError = error;
      const transient = /Tempo esgotado|Network request failed|Failed to fetch/i.test(String(error?.message || ''));
      if (transient) {
        try {
          await sleep(1200);
          const retryData = await fetchJson(candidateUrl);
          preferredApiBase = base;
          updateConnectionStatus({
            online: true,
            source: 'network',
            message: '',
            cachedAt: '',
            apiBase: base,
          });
          await saveCachedPayload(url, retryData);
          return retryData;
        } catch (retryError) {
          lastError = retryError;
        }
      }
    }
  }
  const cached = await readCachedPayload(url);
  if (cached) {
    updateConnectionStatus({
      online: false,
      source: 'cache',
      message: 'API indisponivel. Exibindo ultima consulta salva.',
      cachedAt: cached.savedAt,
      apiBase: preferredApiBase,
    });
    return cached.payload;
  }
  updateConnectionStatus({
    online: false,
    source: 'offline',
    message: 'Sem conexao com API/planilha no momento.',
    cachedAt: '',
    apiBase: preferredApiBase,
  });
  if (String(lastError?.message || '').includes('Network request failed')) {
    throw new Error(`Sem conexao com a API (${preferredApiBase}). Verifique backend e IP local.`);
  }
  throw lastError || new Error('Falha ao buscar dados da API.');
}

async function postJson(body) {
  const candidates = [preferredApiBase, ...API_BASE_CANDIDATES.filter((b) => b !== preferredApiBase)];
  let lastError = null;
  for (const base of candidates) {
    try {
      const data = await fetchJson(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      preferredApiBase = base;
      updateConnectionStatus({
        online: true,
        source: 'network',
        message: '',
        cachedAt: '',
        apiBase: base,
      });
      return data;
    } catch (error) {
      lastError = error;
      const transient = /Tempo esgotado|Network request failed|Failed to fetch/i.test(String(error?.message || ''));
      if (transient) {
        try {
          await sleep(1200);
          const retryData = await fetchJson(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          preferredApiBase = base;
          updateConnectionStatus({
            online: true,
            source: 'network',
            message: '',
            cachedAt: '',
            apiBase: base,
          });
          return retryData;
        } catch (retryError) {
          lastError = retryError;
        }
      }
    }
  }
  updateConnectionStatus({
    online: false,
    source: 'offline',
    message: 'Sem conexao com API/planilha no momento.',
    cachedAt: '',
    apiBase: preferredApiBase,
  });
  if (String(lastError?.message || '').includes('Network request failed')) {
    throw new Error(`Sem conexao com a API (${preferredApiBase}). Verifique backend e IP local.`);
  }
  throw lastError || new Error('Falha na requisicao.');
}

function normalizeEntryType(entryType = '') {
  const raw = String(entryType || '').trim();
  const map = {
    contaFixa: 'conta_fixa',
    gastoColetivo: 'gasto_coletivo',
    acertoIndividual: 'acerto_individual',
    conta_fixa: 'conta_fixa',
    gasto_coletivo: 'gasto_coletivo',
    acerto_individual: 'acerto_individual',
  };
  return map[raw] || raw;
}

function toSheetBool(value) {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'TRUE' ? 'TRUE' : 'FALSE';
}

export async function getFinanceSnapshot() {
  return requestJson(`${API_URL}?action=getFinanceSnapshot`);
}

export async function getApiHealth() {
  const candidates = [preferredApiBase, ...API_BASE_CANDIDATES.filter((b) => b !== preferredApiBase)];
  let lastError = null;
  for (const base of candidates) {
    try {
      const data = await fetchJson(toHealthUrl(base));
      preferredApiBase = base;
      const sheetsOk = data?.sheets?.ok !== false;
      updateConnectionStatus({
        online: Boolean(data?.ok) && sheetsOk,
        source: sheetsOk ? 'network' : 'degraded',
        message: sheetsOk ? '' : (data?.sheets?.message || 'API online, mas sem conexao com a planilha.'),
        cachedAt: '',
        apiBase: base,
      });
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  updateConnectionStatus({
    online: false,
    source: 'offline',
    message: 'API indisponivel. Sem validacao de conexao com planilha.',
    cachedAt: '',
    apiBase: preferredApiBase,
  });
  throw lastError || new Error('Falha ao verificar saude da API.');
}

export async function addFinanceEntry({ entryType, usuario, payload }) {
  return postJson({ action: 'addFinanceEntry', entryType: normalizeEntryType(entryType), usuario, payload });
}

export async function updateFinanceEntry({ entryType, rowIndex, payload }) {
  return postJson({ action: 'updateFinanceEntry', entryType: normalizeEntryType(entryType), rowIndex, payload });
}

export async function deleteFinanceEntry({ entryType, rowIndex }) {
  return postJson({ action: 'deleteFinanceEntry', entryType: normalizeEntryType(entryType), rowIndex });
}

export async function toggleContaStatus({ rowIndex, status }) {
  return postJson({ action: 'toggleContaStatus', rowIndex, status: toSheetBool(status) });
}

export async function getDados(usuario = 'GUILHERME') {
  return requestJson(`${API_URL}?action=getDados&usuario=${encodeURIComponent(usuario)}`);
}

export async function getCaixinha() {
  return requestJson(`${API_URL}?action=getCaixinha`);
}

export async function getCaixinhaStatement() {
  return requestJson(`${API_URL}?action=getCaixinhaStatement`);
}

export async function getTarefaSemana(usuario = 'GUILHERME') {
  return requestJson(`${API_URL}?action=getTarefaSemana&usuario=${encodeURIComponent(usuario)}`);
}

export async function getEscalaSemana() {
  return requestJson(`${API_URL}?action=getEscalaSemana`);
}

export async function getTaskRatings() {
  return requestJson(`${API_URL}?action=getTaskRatings`);
}

export async function getTaskFeed() {
  return requestJson(`${API_URL}?action=getTaskFeed`);
}

export async function concluirTarefa(tarefaNome, usuario = 'GUILHERME', photoDataUrl = '') {
  return postJson({ action: 'concluirTarefa', tarefaNome, usuario, photoDataUrl });
}

export async function triggerAdminAction(action, usuario = 'ADMIN') {
  return postJson({ action, usuario });
}

export async function addCaixinhaEntry({ tipo, descricao, valor, obs = '' }) {
  return postJson({ action: 'addCaixinhaEntry', tipo, descricao, valor, obs });
}

export async function rateTask({ actor, target, tarefa, nota, comentario = '', categoria = 'casa' }) {
  return postJson({ action: 'rateTask', actor, target, tarefa, nota, comentario, categoria });
}

export async function addTaskFeedComment({ actor, content, target = '', tarefa = '', photoDataUrl = '', parentTs = '', parentActor = '' }) {
  return postJson({ action: 'addTaskFeedComment', actor, content, target, tarefa, photoDataUrl, parentTs, parentActor });
}

export async function deleteTaskFeedPost({ rowIndex, ts = '', actor }) {
  return postJson({ action: 'deleteTaskFeedPost', rowIndex, ts, actor });
}
