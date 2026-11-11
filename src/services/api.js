import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { makeRequestId } from '../utils/text';

/* ----------------------------------------------------------------------
 * Descoberta da API
 * - Produção (GitHub Pages): só EXPO_PUBLIC_API_URL (Render).
 * - Prévia local (127.0.0.1/localhost): /api da mesma origem (proxy do preview:web).
 * - Expo Go: IP do computador na porta 4000.
 * -------------------------------------------------------------------- */

const FALLBACK_REMOTE_API = 'https://tocah-do-coelho-app.onrender.com/api';

function normalizeApiBase(raw = '') {
  return String(raw || '').trim().replace(/\/+$/, '');
}

function hostOnly(raw) {
  return String(raw || '').replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim();
}

function isValidHost(raw = '') {
  const host = String(raw || '').trim();
  if (host === 'localhost') return true;
  if (!/^(\d{1,3})(\.\d{1,3}){3}$/.test(host)) return false;
  return host.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
}

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const isLoopbackWeb = isWeb && ['127.0.0.1', 'localhost'].includes(window.location?.hostname);
const loopbackSameOriginApi = isLoopbackWeb ? `${window.location.origin}/api` : '';
const envApi = normalizeApiBase(process.env.EXPO_PUBLIC_API_URL);
const devHosts = isWeb
  ? []
  : [
      hostOnly(Constants?.expoConfig?.hostUri || Constants?.manifest2?.extra?.expoGo?.debuggerHost),
      hostOnly(Constants?.manifest?.debuggerHost || Constants?.manifest?.hostUri),
      hostOnly(NativeModules?.SourceCode?.scriptURL),
    ].filter(isValidHost);

// Na prévia local, nunca cair para o Render: evita gravar na planilha de produção sem querer.
const API_BASE_CANDIDATES = isLoopbackWeb ? [loopbackSameOriginApi] : Array.from(
  new Set(
    [
      loopbackSameOriginApi,
      envApi,
      ...devHosts.map((h) => `http://${h}:4000/api`),
      FALLBACK_REMOTE_API,
      isWeb ? '' : 'http://localhost:4000/api',
    ].map(normalizeApiBase).filter(Boolean)
  )
);

let preferredApiBase = API_BASE_CANDIDATES[0];

/* ----------------------------------------------------------------------
 * Status de conexão (para o banner offline / "acordando o servidor")
 * -------------------------------------------------------------------- */

let connectionStatus = { online: true, source: 'network', waking: false, message: '', cachedAt: '', apiBase: preferredApiBase, updatedAt: '' };
const connectionListeners = new Set();

function updateConnectionStatus(next = {}) {
  const merged = { ...connectionStatus, ...next, updatedAt: new Date().toISOString() };
  const changed = ['online', 'source', 'waking', 'message', 'cachedAt'].some((k) => merged[k] !== connectionStatus[k]);
  connectionStatus = merged;
  if (!changed) return;
  connectionListeners.forEach((listener) => {
    try {
      listener(connectionStatus);
    } catch {
      // listener com erro não derruba a rede
    }
  });
}

export function getApiConnectionStatus() {
  return { ...connectionStatus };
}

export function subscribeApiConnectionStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  connectionListeners.add(listener);
  listener({ ...connectionStatus });
  return () => connectionListeners.delete(listener);
}

/* ----------------------------------------------------------------------
 * Cache offline (AsyncStorage, 24h)
 * -------------------------------------------------------------------- */

const CACHE_KEY_PREFIX = '@tocah_api_cache:';
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24;

function cacheKey(query) {
  return `${CACHE_KEY_PREFIX}${query}`;
}

export async function readCachedQuery(query) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(query));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const age = Date.now() - new Date(parsed?.savedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > MAX_CACHE_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveCachedQuery(query, payload) {
  try {
    await AsyncStorage.setItem(cacheKey(query), JSON.stringify({ savedAt: new Date().toISOString(), payload }));
  } catch {
    // cache cheio (fotos) não pode travar o app
  }
}

/* ----------------------------------------------------------------------
 * HTTP
 * -------------------------------------------------------------------- */

class ApiError extends Error {
  constructor(message, { status = 0, code = '', network = false, data = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.network = network;
    this.data = data;
  }
}

const WAKING_HINT_MS = 4000;

async function fetchJson(url, init = {}, timeoutMs = 20000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  const wakingTimer = setTimeout(() => updateConnectionStatus({ waking: true }), WAKING_HINT_MS);
  let res;
  try {
    res = await fetch(url, { ...init, signal: controller?.signal });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    throw new ApiError(aborted ? 'O servidor demorou para responder.' : 'Sem conexão com o servidor.', { network: true });
  } finally {
    clearTimeout(timer);
    clearTimeout(wakingTimer);
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError('Resposta inválida do servidor.', { status: res.status, network: res.status >= 500 || res.status === 404 });
  }
  if (!res.ok || data?.ok === false) {
    throw new ApiError(data?.message || `Erro ${res.status} no servidor.`, { status: res.status, code: data?.code || '', data });
  }
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tenta as bases candidatas SÓ quando a falha é de rede. Erro HTTP (400/409...) volta direto com a mensagem do servidor. */
async function requestWithFallback(pathAndQuery, init, { timeoutMs, retries }) {
  const candidates = [preferredApiBase, ...API_BASE_CANDIDATES.filter((b) => b !== preferredApiBase)];
  let lastError = null;
  for (const base of candidates) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const data = await fetchJson(`${base}${pathAndQuery}`, init, timeoutMs + attempt * 15000);
        preferredApiBase = base;
        updateConnectionStatus({ online: true, source: 'network', waking: false, message: '', cachedAt: '', apiBase: base });
        return data;
      } catch (error) {
        lastError = error;
        if (!error.network) {
          updateConnectionStatus({ online: true, waking: false });
          throw error;
        }
        if (attempt < retries) await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw lastError || new ApiError('Sem conexão com o servidor.', { network: true });
}

// Sem URLSearchParams: no React Native ele é incompleto (.set não existe em algumas versões).
function buildQuery(action, params = {}) {
  const parts = [`action=${encodeURIComponent(action)}`];
  Object.keys(params).forEach((k) => {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  });
  return parts.join('&');
}

/** GET com cache offline: se a rede falhar, devolve a última resposta salva e marca o app como offline. */
async function getAction(action, params, { cache = true, timeoutMs = 20000 } = {}) {
  const query = buildQuery(action, params);
  try {
    const data = await requestWithFallback(`?${query}`, { method: 'GET' }, { timeoutMs, retries: 1 });
    if (cache) saveCachedQuery(query, data);
    return data;
  } catch (error) {
    if (!error.network) throw error;
    if (!cache) {
      // Chamada leve (sync/fotos): não muda o banner para "sem dados"; as telas continuam com o que já têm.
      updateConnectionStatus({ online: false, source: 'cache', waking: false, message: 'Sem conexão. Mostrando os últimos dados salvos.' });
      throw error;
    }
    const cached = await readCachedQuery(query);
    if (cached) {
      updateConnectionStatus({ online: false, source: 'cache', waking: false, message: 'Sem conexão. Mostrando os últimos dados salvos.', cachedAt: cached.savedAt });
      return cached.payload;
    }
    updateConnectionStatus({ online: false, source: 'offline', waking: false, message: 'Sem conexão com o servidor no momento.', cachedAt: '' });
    throw error;
  }
}

/**
 * POST com requestId: o backend nunca grava duas vezes o mesmo pedido,
 * então é seguro tentar de novo quando o Render está "acordando" (plano grátis).
 */
async function postAction(action, body = {}, { timeoutMs = 30000 } = {}) {
  const payload = JSON.stringify({ action, requestId: makeRequestId(), ...body });
  try {
    return await requestWithFallback('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }, { timeoutMs, retries: 2 });
  } catch (error) {
    if (error.network) {
      updateConnectionStatus({ online: false, source: 'offline', waking: false, message: 'Sem conexão com o servidor no momento.' });
      throw new ApiError('Não deu para salvar: sem conexão com o servidor. Tente de novo em instantes.', { network: true });
    }
    throw error;
  }
}

export function isConflict(error) {
  return error?.status === 409;
}

/* ----------------------------------------------------------------------
 * Endpoints
 * -------------------------------------------------------------------- */

/** Mesma query usada no cache offline: permite mostrar o último dado salvo na hora. */
export const queryFor = buildQuery;

export const getSyncState = () => getAction('getSyncState', {}, { cache: false, timeoutMs: 15000 });
export const getApiHealth = () => fetchJson(`${preferredApiBase.replace(/\/api$/, '')}/health`);
export const getConfig = () => getAction('getConfig');
export const ensureConfig = () => postAction('ensureConfig');

// Finanças
export const getFinanceSnapshot = (sheet = '') => getAction('getFinanceSnapshot', { sheet });
export const getSettledHistory = () => getAction('getSettledHistory');
export const updateFinanceEntry = ({ entryType, rowIndex, payload, expected, expectedSheet }) =>
  postAction('updateFinanceEntry', { entryType, rowIndex, payload, expected, expectedSheet });
export const deleteFinanceEntry = ({ entryType, rowIndex, expected, expectedSheet, cascade = false }) =>
  postAction('deleteFinanceEntry', { entryType, rowIndex, expected, expectedSheet, cascade });
export const toggleContaStatus = ({ rowIndex, status, expected, expectedSheet }) =>
  postAction('toggleContaStatus', { rowIndex, status: status ? 'TRUE' : 'FALSE', expected, expectedSheet });
export const addCollectiveExpense = (data) => postAction('addCollectiveExpense', data);
/** Gasto da casa (dividido igualmente entre todos): só uma linha em Gastos coletivos (J..M), sem acertos. */
export const addHouseExpense = ({ payer, oQue, valor, obs = '' }) =>
  postAction('addFinanceEntry', { entryType: 'gasto_coletivo', usuario: payer, payload: { quem: payer, oQue, quanto: valor, obs } });
export const updateCollectiveExpense = (data) => postAction('updateCollectiveExpense', data);
export const addSettlements = (data) => postAction('addSettlements', data);
export const settleAcerto = (data) => postAction('settleAcerto', data);

// Caixinha
export const getCaixinha = () => getAction('getCaixinha');
export const getCaixinhaStatement = () => getAction('getCaixinhaStatement');
export const addCaixinhaEntry = ({ tipo, descricao, valor, obs = '', autor = '' }) => postAction('addCaixinhaEntry', { tipo, descricao, valor, obs, autor });

// Tarefas
export const getTarefaSemana = (usuario) => getAction('getTarefaSemana', { usuario });
export const getEscalaSemana = () => getAction('getEscalaSemana');
export const getTaskRatings = (actor) => getAction('getTaskRatings', { strict: 1, actor, history: 0 });
export const concluirTarefa = ({ usuario, tarefaNome = '', photoDataUrl }) =>
  postAction('concluirTarefa', { usuario, tarefaNome, photoDataUrl, once: true }, { timeoutMs: 45000 });
export const rateTask = ({ actor, target, tarefa, nota, comentario = '', categoria = 'casa' }) =>
  postAction('rateTask', { actor, target, tarefa, nota, comentario, categoria });

// Feed
export const getTaskFeed = (week = '') => getAction('getTaskFeed', { strict: 1, photos: 0, likes: 1, week });
export const getFeedPhoto = (ts) => getAction('getFeedPhoto', { ts }, { cache: false });

// Avaliação semanal das tarefas
export const getAvaliacaoSemana = (usuario) => getAction('getAvaliacaoSemana', { usuario });
export const getDesempenho = () => getAction('getDesempenho');
export const entregarTarefa = ({ usuario, ciclo = '', photos = [], moradorToken = '' }) =>
  postAction('entregarTarefa', { usuario, ciclo, photos, photoDataUrl: photos[0] || '', moradorToken }, { timeoutMs: 60000 });
export const avaliarEntrega = ({ actor, target, ciclo, nota, comentario = '', categoria = 'casa', moradorToken = '' }) =>
  postAction('avaliarEntrega', { actor, target, ciclo, nota, comentario, categoria, moradorToken });
export const postMoradorPin = (action, data) => postAction(action, data);

// Administração (só Guilherme, com PIN)
export const adminStatus = () => getAction('adminStatus', {}, { cache: false });
export const adminPainel = (adminToken) => getAction('adminPainel', { adminToken }, { cache: false, timeoutMs: 45000 });
export const adminDefinirPin = ({ usuario, pin, pinAtual = '' }) => postAction('adminDefinirPin', { usuario, pin, pinAtual });
export const adminEntrar = ({ usuario, pin }) => postAction('adminEntrar', { usuario, pin });
export const adminAcao = (action, data) => postAction(action, data);
export const addTaskFeedComment = ({ actor, content, target = '', tarefa = '', photoDataUrl = '', parentTs = '', parentActor = '' }) =>
  postAction('addTaskFeedComment', { actor, content, target, tarefa, photoDataUrl, parentTs, parentActor }, { timeoutMs: 45000 });
export const deleteTaskFeedPost = ({ ts, requester }) => postAction('deleteTaskFeedPost', { ts, requester });
export const toggleFeedLike = ({ ts, actor }) => postAction('toggleFeedLike', { ts, actor });

// Nilde
export const getNildeWeek = () => getAction('getNildeWeek');
export const checkNilde = ({ actor, slotId, comment = '', photoDataUrl = '' }) =>
  postAction('checkNilde', { actor, slotId, comment, photoDataUrl }, { timeoutMs: 45000 });

// Perfis
export const getProfiles = () => getAction('getProfiles');
export const setProfilePhoto = ({ nome, photoDataUrl }) => postAction('setProfilePhoto', { nome, photoDataUrl }, { timeoutMs: 45000 });
