import Constants from 'expo-constants';
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

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
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
      process.env.EXPO_PUBLIC_API_URL,
      isValidHost(hostFromExpo) ? `http://${hostFromExpo}:4000/api` : '',
      isValidHost(hostFromManifest) ? `http://${hostFromManifest}:4000/api` : '',
      isValidHost(hostFromScriptUrl) ? `http://${hostFromScriptUrl}:4000/api` : '',
      'http://localhost:4000/api',
    ].filter(Boolean)
  )
);

let preferredApiBase = API_URL;

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
  if (nextBase) preferredApiBase = String(nextBase).trim();
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
  const timeoutMs = method === 'POST' && bodyLength > 200000 ? 30000 : 8000;
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

async function requestJson(url) {
  const candidates = [preferredApiBase, ...API_BASE_CANDIDATES.filter((b) => b !== preferredApiBase)];
  let lastError = null;
  for (const base of candidates) {
    const candidateUrl = mapUrlToBase(url, base);
    try {
      const data = await fetchJson(candidateUrl);
      preferredApiBase = base;
      return data;
    } catch (error) {
      lastError = error;
    }
  }
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
      return data;
    } catch (error) {
      lastError = error;
    }
  }
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
      return data;
    } catch (error) {
      lastError = error;
    }
  }
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

export async function deleteTaskFeedPost({ rowIndex, actor }) {
  return postJson({ action: 'deleteTaskFeedPost', rowIndex, actor });
}
