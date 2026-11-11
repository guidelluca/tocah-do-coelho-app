const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const zlib = require('zlib');
const crypto = require('crypto');
const { google } = require('googleapis');

const { getCell, norm, toNumberLike, normalizeMoney2, colLetter, brl } = require('./lib/text');
const { weekKey, spDateBr, spDateKey, spWeekDays, getSaoPauloYearMonth, tsToDate } = require('./lib/time');
const fin = require('./lib/finance');
const feedLib = require('./lib/feed');
const ciclo = require('./lib/ciclo');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const {
  PORT = 4000,
  SPREADSHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  DADOS_RANGE = 'DadosApp!A:C',
  CAIXINHA_RANGE = 'Caixinha!C2',
  TAREFA_RANGE = 'Painel da Semana!A:Z',
  /**
   * Aba das finanças: nome da aba (ex. JUN_2026) ou AUTO (mês civil em São Paulo).
   * Sem valor → AUTO (antes era MAI_2026 fixo, o que deixava o app preso em maio).
   */
  FINANCE_ACTIVE_SHEET,
  /** @deprecated — usa FINANCE_ACTIVE_SHEET */
  FORCE_FINANCE_SHEET,
  RATINGS_SHEET = 'AvaliacoesTarefas',
  TASK_FEED_SHEET = 'TarefasFeed',
  ADMIN_LOG_SHEET = 'AdminLogs',
  TASK_PHOTOS_SHEET = 'TarefasFotos',
  LIKES_SHEET = 'FeedLikes',
  PROFILES_SHEET = 'Perfis',
  CONFIG_SHEET = 'Config',
  SETTLED_SHEET = 'AcertosQuitados',
  /** Aba que o Apps Script de tarefas publica para o app (escala da semana atual). */
  ESCALA_APP_SHEET = 'EscalaApp',
  /** Avaliação semanal das tarefas. */
  CICLOS_ESCALA_SHEET = 'CiclosEscala',
  DESEMPENHO_SHEET = 'Desempenho',
  MULTAS_SHEET = 'MultasTarefas',
  AVISOS_SHEET = 'AvisosEmail',
  AJUSTES_SHEET = 'AjustesTarefas',
  /** PIN da administração (opcional: sem ele, o Guilherme cria o PIN pelo app). */
  ADMIN_PIN,
  APP_SECRET,
  PUBLIC_URL,
} = process.env;

const DEFAULT_FINANCE_MODE = 'AUTO';
const RESIDENTS = feedLib.RESIDENTS;
const MAX_SHEET_CELL_CHARS = 45000;
const READ_CACHE_TTL_MS = 120000;
const TITLES_CACHE_TTL_MS = 10 * 60 * 1000;
const STARTED_AT = new Date().toISOString();

const DEFAULT_CONFIG = [
  ['vencimentoAluguel', '12'],
  ['regrasDaCasa', 'Limpe o que usar, respeite os turnos e registre gastos no mesmo dia.'],
  ['descricaoTarefa', 'Varrer, tirar lixos e organizar.'],
  ['fraseHome', 'Gente, sabe aquele momento que você já gozou tudo que cê tinha pra gozar?'],
  ['avaliacaoInicio', '2026-W46'],
  ['avaliacaoToleranciaDias', '3'],
  ['avaliacaoMultaAuto', 'sim'],
  ['avaliacaoMultaValor', '60'],
  ['avaliacaoMediaMinima', '3'],
  ['avaliacaoMinAvaliacoes', '2'],
  ['banheiraoGrupo', 'ALLAN,GUSTAVO,RAMON'],
];

/* ======================================================================
 * Erros e utilidades HTTP
 * ==================================================================== */

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const httpError = (status, message, extra) => new HttpError(status, message, extra);

function a1RangeForSheet(sheetTitle, rangeTail) {
  const name = String(sheetTitle || '').trim();
  if (!name) throw new Error('Nome de aba vazio.');
  const tail = String(rangeTail || '').trim();
  const escaped = name.replace(/'/g, "''");
  const safeUnquoted = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  return `${safeUnquoted ? name : `'${escaped}'`}!${tail}`;
}

function sheetOfRange(range) {
  const raw = String(range || '');
  const bang = raw.lastIndexOf('!');
  const name = bang >= 0 ? raw.slice(0, bang) : raw;
  return name.replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'").trim();
}

/* ======================================================================
 * Google Sheets: client único, cache por aba, escrita serializada
 * ==================================================================== */

let sheetsClientPromise = null;

async function getSheetsApi() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID não configurado.');
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não configurado.');
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
      credentials.private_key = String(credentials.private_key || '').replace(/\\n/g, '\n');
      const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
      return google.sheets({ version: 'v4', auth: await auth.getClient() });
    })().catch((error) => {
      sheetsClientPromise = null;
      throw error;
    });
  }
  return sheetsClientPromise;
}

const readCache = new Map();
let titlesCache = { titles: null, expiresAt: 0 };

function isQuotaError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('quota exceeded') || msg.includes('rate limit') || msg.includes('too many requests');
}

function invalidateSheet(sheetName) {
  const target = String(sheetName || '').trim();
  for (const key of Array.from(readCache.keys())) {
    if (sheetOfRange(key) === target) readCache.delete(key);
  }
}

async function readRange(range, { fresh = false } = {}) {
  const cacheKey = String(range || '').trim();
  const cached = readCache.get(cacheKey);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.values;
  try {
    const sheets = await getSheetsApi();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    const values = res.data.values || [];
    readCache.set(cacheKey, { values, expiresAt: Date.now() + READ_CACHE_TTL_MS });
    return values;
  } catch (error) {
    if (isQuotaError(error) && cached?.values) return cached.values;
    throw error;
  }
}

async function readRangeOrEmpty(range, opts) {
  try {
    return await readRange(range, opts);
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unable to parse range')) return [];
    throw error;
  }
}

async function readRangeWithFallback(primaryRange, fallbackRanges = [], opts) {
  try {
    return await readRange(primaryRange, opts);
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('unable to parse range')) throw error;
    for (const range of fallbackRanges) {
      try {
        return await readRange(range, opts);
      } catch {
        // tenta o próximo
      }
    }
    throw error;
  }
}

async function getSpreadsheetTitles({ fresh = false } = {}) {
  if (!fresh && titlesCache.titles && titlesCache.expiresAt > Date.now()) return titlesCache.titles;
  try {
    const sheets = await getSheetsApi();
    const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties.title' });
    const titles = (res.data.sheets || []).map((s) => String(s.properties?.title || '').trim()).filter(Boolean);
    titlesCache = { titles, expiresAt: Date.now() + TITLES_CACHE_TTL_MS };
    return titles;
  } catch (error) {
    if (isQuotaError(error) && titlesCache.titles) return titlesCache.titles;
    throw error;
  }
}

async function updateRange(range, values) {
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
  invalidateSheet(sheetOfRange(range));
}

/**
 * Escreve células avulsas numa única chamada. Só toca nas células informadas:
 * fórmulas e valores das outras colunas da linha ficam intactos.
 * updates: [{ row: 12, col: 2, value: '10.00' }]  (row 1-based, col 0-based)
 */
async function writeCells(sheetTitle, updates = []) {
  if (!updates.length) return;
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates.map((u) => ({ range: a1RangeForSheet(sheetTitle, `${colLetter(u.col)}${u.row}`), values: [[u.value]] })),
    },
  });
  invalidateSheet(sheetTitle);
}

async function appendRows(range, rows) {
  if (!rows.length) return;
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
  invalidateSheet(sheetOfRange(range));
}

const appendRow = (range, values) => appendRows(range, [values]);

async function ensureSheetExists(sheetName, headerRow) {
  const titles = await getSpreadsheetTitles();
  if (titles.includes(sheetName)) return false;
  const fresh = await getSpreadsheetTitles({ fresh: true });
  if (fresh.includes(sheetName)) return false;
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  });
  titlesCache = { titles: [...fresh, sheetName], expiresAt: Date.now() + TITLES_CACHE_TTL_MS };
  if (headerRow) await appendRow(`${a1RangeForSheet(sheetName, 'A:Z')}`, headerRow);
  invalidateSheet(sheetName);
  return true;
}

/** Fila única de escrita: evita que dois aparelhos escrevam na mesma "primeira linha vazia". */
let writeChain = Promise.resolve();
function withWriteLock(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => {});
  return run;
}

/** Versões em memória por recurso: o app consulta isso (sem tocar no Sheets) para saber o que recarregar. */
const versions = { finance: 1, caixinha: 1, feed: 1, ratings: 1, likes: 1, profiles: 1, config: 1, avaliacao: 1 };
function bump(...keys) {
  keys.forEach((k) => {
    versions[k] = (versions[k] || 0) + 1;
  });
}

/* ======================================================================
 * Fotos
 * ==================================================================== */

function createPhotoRefId() {
  return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function storePhotoDataUrl(photoDataUrl = '') {
  const dataUrl = String(photoDataUrl || '').trim();
  if (!dataUrl) return '';
  if (!/^data:image\//i.test(dataUrl)) throw httpError(400, 'Formato de foto inválido.');
  if (dataUrl.length <= MAX_SHEET_CELL_CHARS) return dataUrl;
  await ensureSheetExists(TASK_PHOTOS_SHEET);
  const id = createPhotoRefId();
  const totalChunks = Math.ceil(dataUrl.length / MAX_SHEET_CELL_CHARS);
  const ts = new Date().toISOString();
  const rows = [];
  for (let i = 0; i < totalChunks; i += 1) {
    rows.push([id, i + 1, totalChunks, dataUrl.slice(i * MAX_SHEET_CELL_CHARS, (i + 1) * MAX_SHEET_CELL_CHARS), ts]);
  }
  await appendRows(`${TASK_PHOTOS_SHEET}!A:E`, rows);
  return `PHOTO_REF:${id}`;
}

/**
 * Lê só as linhas das fotos pedidas. Antes lia a aba TarefasFotos inteira (todas as fotos da história)
 * a cada consulta — com o tempo isso fica pesado e pode estourar limite de resposta.
 * 1) lê só a coluna A (ids, leve); 2) lê só os blocos de linhas daquelas fotos.
 */
async function readPhotoRows(ids) {
  const idCol = await readRangeOrEmpty(`${TASK_PHOTOS_SHEET}!A:A`);
  const wanted = new Set(ids);
  const rowsNeeded = [];
  idCol.forEach((r, i) => {
    if (wanted.has(String(r[0] || '').trim())) rowsNeeded.push(i + 1);
  });
  if (!rowsNeeded.length) return [];
  const blocks = [];
  for (const row of rowsNeeded) {
    const last = blocks[blocks.length - 1];
    if (last && row <= last[1] + 1) last[1] = row;
    else blocks.push([row, row]);
  }
  const out = [];
  for (const [a, b] of blocks.slice(0, 40)) {
    const rows = await readRangeOrEmpty(`${TASK_PHOTOS_SHEET}!A${a}:E${b}`);
    out.push(...rows);
  }
  return out;
}

async function hydratePhotos(items = [], field = 'photoDataUrl') {
  const refs = Array.from(
    new Set(
      items
        .map((item) => String(item?.[field] || ''))
        .filter((raw) => raw.startsWith('PHOTO_REF:'))
        .map((raw) => raw.replace('PHOTO_REF:', '').trim())
        .filter(Boolean)
    )
  );
  if (!refs.length) return items;
  const photoRows = await readPhotoRows(refs);
  const chunksById = {};
  for (const row of photoRows) {
    const id = String(row[0] || '').trim();
    if (!id || !refs.includes(id)) continue;
    const idx = Number(row[1] || 0);
    const chunk = String(row[3] || '');
    if (!idx || !chunk) continue;
    (chunksById[id] = chunksById[id] || []).push({ idx, chunk });
  }
  const hydrated = {};
  for (const id of refs) hydrated[id] = (chunksById[id] || []).sort((a, b) => a.idx - b.idx).map((c) => c.chunk).join('');
  return items.map((item) => {
    const raw = String(item?.[field] || '');
    if (!raw.startsWith('PHOTO_REF:')) return item;
    return { ...item, [field]: hydrated[raw.replace('PHOTO_REF:', '').trim()] || '' };
  });
}

/* ======================================================================
 * Finanças
 * ==================================================================== */

function financeMode() {
  const fromEnv = String(FINANCE_ACTIVE_SHEET || '').trim() || String(FORCE_FINANCE_SHEET || '').trim();
  return fromEnv || DEFAULT_FINANCE_MODE;
}

function pickManualFinanceSheetTitle(titles) {
  const want = financeMode();
  if (/^AUTO$/i.test(want)) return null;
  return fin.findTitle(titles, want) || (titles.includes(want) ? want : null);
}

async function readActiveFinanceSheetRows({ fresh = false } = {}) {
  const titles = await getSpreadsheetTitles();
  const manual = pickManualFinanceSheetTitle(titles);
  if (manual) return { activeSheet: manual, rows: await readRange(a1RangeForSheet(manual, 'A:Z'), { fresh }), titles };

  const { preferred, ordered, currentName } = fin.autoFinanceCandidates(titles);
  if (preferred) {
    try {
      return { activeSheet: preferred, rows: await readRange(a1RangeForSheet(preferred, 'A:Z'), { fresh }), titles };
    } catch {
      // segue para os candidatos
    }
  }
  for (const sheet of ordered) {
    if (sheet === preferred) continue;
    try {
      const rows = await readRange(a1RangeForSheet(sheet, 'A:Z'), { fresh });
      if (fin.financeSnapshotHasResidents(rows)) return { activeSheet: sheet, rows, titles };
    } catch {
      // próxima
    }
  }
  for (const sheet of ordered) {
    try {
      return { activeSheet: sheet, rows: await readRange(a1RangeForSheet(sheet, 'A:Z'), { fresh }), titles };
    } catch {
      // próxima
    }
  }
  if (!ordered.length) {
    return { activeSheet: currentName, rows: await readRange(a1RangeForSheet(currentName, 'A:Z'), { fresh }), titles };
  }
  throw new Error('Nenhuma aba financeira de mês pôde ser lida (verifique os nomes das abas na planilha).');
}

/** Para escrever: lê a aba ativa sem cache e, se o app informou o mês que estava vendo, confere. */
async function readFinanceForWrite(expectedSheet) {
  const data = await readActiveFinanceSheetRows({ fresh: true });
  if (expectedSheet && norm(expectedSheet) !== norm(data.activeSheet)) {
    throw httpError(409, `O mês ativo mudou para ${fin.monthLabel(fin.parseMonthSheetTitle(data.activeSheet)) || data.activeSheet}. Atualize a tela e tente de novo.`, { code: 'SHEET_CHANGED', activeSheet: data.activeSheet });
  }
  return data;
}

function resolveFinanceRow(rows, entryType, rowIndex, expected) {
  const block = fin.FINANCE_BLOCKS[entryType];
  if (!block) throw httpError(400, 'entryType inválido.');
  const located = fin.locateRow(rows, block, rowIndex, expected);
  if (!located.row) {
    throw httpError(409, located.ambiguous
      ? 'Encontrei mais de uma linha igual na planilha. Atualize a tela e tente de novo.'
      : 'Essa linha mudou na planilha (alguém editou à mão). Atualize a tela e confira.', { code: 'ROW_CHANGED' });
  }
  return { block, row: located.row, moved: located.moved };
}

function blockFieldUpdates(block, row, fields) {
  return Object.entries(fields).map(([field, value]) => ({ row, col: block.fields[field], value }));
}

function findEmptyRows(rows, block, count, taken = new Set()) {
  const headerIdx = fin.findRowIndex(rows, block.isHeader);
  if (headerIdx < 0) throw httpError(400, 'Cabeçalho do bloco não encontrado na aba do mês.');
  const out = [];
  const start = headerIdx + 1;
  const limit = Math.max(rows.length + 200, start + 700);
  for (let i = 0; i < count; i += 1) {
    const idx = fin.findFirstEmptyByCol(rows, block.keyCol, start, limit, new Set([...taken, ...out]));
    if (idx < 0) throw httpError(400, 'Não encontrei linha vazia no bloco.');
    out.push(idx);
  }
  return out.map((i) => i + 1);
}

function linkedSettlements(rows, refId) {
  const block = fin.FINANCE_BLOCKS.acerto_individual;
  const headerIdx = fin.findRowIndex(rows, block.isHeader);
  const out = [];
  if (headerIdx < 0 || !refId) return out;
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const ref = fin.parseRefTag(getCell(r, block.fields.obs));
    if (ref && ref.id === refId && getCell(r, block.keyCol)) {
      out.push({ row: i + 1, quem: getCell(r, 19), deveQuanto: getCell(r, 20), paraQuem: getCell(r, 21), obs: getCell(r, 22) });
    }
  }
  return out;
}

async function readConfig() {
  const titles = await getSpreadsheetTitles();
  const map = Object.fromEntries(DEFAULT_CONFIG);
  if (!titles.includes(CONFIG_SHEET)) return map;
  const rows = await readRangeOrEmpty(`${CONFIG_SHEET}!A:B`);
  rows.forEach((r, i) => {
    if (i === 0 && norm(r[0]) === 'CHAVE') return;
    const key = getCell(r, 0);
    if (key) map[key] = getCell(r, 1);
  });
  return map;
}

/* ======================================================================
 * Feed
 * ==================================================================== */

async function readFeed({ fresh = false } = {}) {
  const rows = await readRangeOrEmpty(`${TASK_FEED_SHEET}!A:H`, { fresh });
  return feedLib.parseFeedRows(rows);
}

async function readLikes() {
  const titles = await getSpreadsheetTitles();
  if (!titles.includes(LIKES_SHEET)) return { rows: [], byTs: {} };
  const rows = await readRangeOrEmpty(`${LIKES_SHEET}!A:D`);
  const byTs = {};
  rows.forEach((r, i) => {
    if (i === 0 && norm(r[0]) === 'POSTTS') return;
    const ts = getCell(r, 0);
    const actor = feedLib.canonicalResident(getCell(r, 1)) || getCell(r, 1);
    if (!ts || !actor || norm(getCell(r, 3)) === 'FALSE') return;
    if (!byTs[ts]) byTs[ts] = [];
    if (!byTs[ts].includes(actor)) byTs[ts].push(actor);
  });
  return { rows, byTs };
}

function feedWeeks(items) {
  return Array.from(new Set(items.map((x) => feedLib.itemWeek(x)).filter(Boolean))).sort(feedLib.sortWeekKeysDesc);
}

/** Escala da semana: 1º a aba EscalaApp (Apps Script), depois o formato antigo (nome → tarefa). */
async function readEscala() {
  const titles = await getSpreadsheetTitles();
  if (titles.includes(ESCALA_APP_SHEET)) {
    const list = feedLib.parseEscalaApp(await readRangeOrEmpty(`${ESCALA_APP_SHEET}!A:I`));
    if (list.length) return { source: 'apps-script', list };
  }
  let rows = [];
  try {
    rows = await readRangeWithFallback(TAREFA_RANGE, ['Escala do Mês!A:Z', 'Tarefas!A:Z']);
  } catch {
    rows = [];
  }
  const legacy = feedLib.extractScale(rows);
  return { source: legacy.length ? 'planilha' : 'padrao', list: legacy.length ? legacy : feedLib.defaultScale() };
}

async function taskStatusMap() {
  const wk = weekKey();
  const items = await readFeed();
  return { wk, checks: feedLib.checksByResident(items, wk) };
}

function statusFields(check) {
  if (!check) return { concluida: false, concluidaEm: '', checkTs: '', checkHasPhoto: false };
  return { concluida: true, concluidaEm: check.ts, checkTs: check.ts, checkHasPhoto: !!check.photoDataUrl };
}

/* ======================================================================
 * Ações GET
 * ==================================================================== */


/* ======================================================================
 * Avaliação semanal das tarefas (entrega com foto → avaliação → desempenho)
 * ==================================================================== */

const AVISOS_HEADER = ['id', 'tipo', 'ciclo', 'criadoEm', 'enviadoEm', 'payload'];
const MULTAS_HEADER = ['ciclo', 'morador', 'valor', 'motivo', 'lancadoEm', 'status', 'obs'];
const ADMIN_MORADOR = 'GUILHERME';

/* ---------- segredo, tokens e PIN ---------- */

function appSecret() {
  if (APP_SECRET) return APP_SECRET;
  let key = '';
  try {
    key = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON || '{}').private_key || '';
  } catch {
    key = String(GOOGLE_SERVICE_ACCOUNT_JSON || '');
  }
  return crypto.createHash('sha256').update(`tocah:${key}:${SPREADSHEET_ID || ''}`).digest('hex');
}
const hmac = (msg) => crypto.createHmac('sha256', appSecret()).update(msg).digest('base64url');
const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64u = (s) => Buffer.from(String(s || ''), 'base64url').toString('utf8');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Link de avaliação por e-mail: vale para um morador num ciclo. */
function avaliacaoToken(actor, cicloKey) {
  const body = `${actor}.${cicloKey}`;
  return b64u(`${body}.${hmac(`aval|${body}`).slice(0, 22)}`);
}
function readAvaliacaoToken(token) {
  const [actor, key, sig] = unb64u(token).split('.');
  if (!actor || !ciclo.isCycleKey(key) || !sig) return null;
  if (!safeEqual(sig, hmac(`aval|${actor}.${key}`).slice(0, 22))) return null;
  const nome = feedLib.canonicalResident(actor);
  return nome ? { actor: nome, ciclo: key } : null;
}

let publicBase = String(PUBLIC_URL || '').replace(/\/$/, '') || 'https://tocah-do-coelho-app.onrender.com';
function rememberBase(req) {
  if (PUBLIC_URL || !req) return;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host || /localhost|127\.0\.0\.1/.test(host)) return;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  publicBase = `${proto}://${host}`;
}
const linkAvaliacao = (actor, key) => `${publicBase}/avaliar?t=${avaliacaoToken(actor, key)}`;

const pinHash = (pin) => crypto.createHash('sha256').update(`pin:${appSecret()}:${String(pin).trim()}`).digest('hex');

function adminToken() {
  const exp = Date.now() + 120 * 24 * 60 * 60 * 1000;
  const body = `${ADMIN_MORADOR}.${exp}`;
  return b64u(`${body}.${hmac(`admin|${body}`)}`);
}

async function requireAdmin(body) {
  const [who, exp, sig] = unb64u(body.adminToken).split('.');
  if (who !== ADMIN_MORADOR || !sig || Number(exp) < Date.now() || !safeEqual(sig, hmac(`admin|${who}.${exp}`))) {
    throw httpError(401, 'Entre de novo na Administração (PIN).', { code: 'ADMIN_AUTH' });
  }
  return ADMIN_MORADOR;
}

async function adminLog(acao, detalhe) {
  await ensureSheetExists(ADMIN_LOG_SHEET, ['quando', 'acao', 'quem', 'detalhe']);
  await appendRow(`${ADMIN_LOG_SHEET}!A:D`, [new Date().toISOString(), acao, ADMIN_MORADOR, detalhe]);
}

async function setConfigValues(pairs) {
  await ensureSheetExists(CONFIG_SHEET, ['chave', 'valor']);
  const rows = await readRangeOrEmpty(`${CONFIG_SHEET}!A:B`, { fresh: true });
  const updates = [];
  const appends = [];
  Object.entries(pairs).forEach(([k, v]) => {
    const idx = rows.findIndex((r) => getCell(r, 0) === k);
    if (idx >= 0) updates.push({ row: idx + 1, col: 1, value: String(v) });
    else appends.push([k, String(v)]);
  });
  if (updates.length) await writeCells(CONFIG_SHEET, updates);
  if (appends.length) await appendRows(`${CONFIG_SHEET}!A:B`, appends);
  bump('config', 'avaliacao');
}
const CICLOS_ESCALA_HEADER = ['ciclo', 'morador', 'tarefa', 'extra', 'atualizadoEm'];

function feedItemCycle(item) {
  return ciclo.isCycleKey(item.week) ? item.week : feedLib.itemWeekBySp(item);
}

async function avaliacaoContext({ fresh = false } = {}) {
  const config = await readConfig();
  const rules = ciclo.rulesFromConfig(config);
  const inicio = ciclo.isCycleKey(config.avaliacaoInicio) ? config.avaliacaoInicio : '2026-W46';
  const titles = await getSpreadsheetTitles();
  const read = async (sheet, range) => (titles.includes(sheet) ? readRangeOrEmpty(`${sheet}!${range}`, { fresh }) : []);
  const [feed, ratingRows, ciclosRows, desempenhoRows, avisosRows, ajustesRows] = await Promise.all([
    readFeed({ fresh }),
    read(RATINGS_SHEET, 'A:H'),
    read(CICLOS_ESCALA_SHEET, 'A:E'),
    read(DESEMPENHO_SHEET, 'A:L'),
    read(AVISOS_SHEET, 'A:F'),
    read(AJUSTES_SHEET, 'A:I'),
  ]);
  return {
    config,
    rules,
    inicio,
    feed,
    ratingRows: ratingRows.slice(1),
    ciclosEscala: ciclo.parseCiclosEscala(ciclosRows),
    desempenho: ciclo.parseDesempenhoRows(desempenhoRows),
    avisos: avisosRows.slice(1).map((r) => ({ id: getCell(r, 0), tipo: getCell(r, 1), ciclo: getCell(r, 2) })),
    ajustes: ciclo.parseAjustes(ajustesRows),
  };
}

/** Escala do ciclo: aba CiclosEscala (Apps Script) → EscalaApp (semana atual) → nome da tarefa da própria entrega. */
async function escalaDoCiclo(ctx, key, isCurrent) {
  const fromSheet = ctx.ciclosEscala[key];
  let base = [];
  if (fromSheet && fromSheet.length) base = fromSheet;
  else if (isCurrent) {
    try {
      const esc = await readEscala();
      base = esc.list.map((x) => ({ nome: String(x.nome || '').toUpperCase(), tarefa: x.tarefaBase || x.tarefa || '', extra: x.extra || '' }));
    } catch {
      base = [];
    }
  }
  const checks = ciclo.checksByCycle(ctx.feed, key, feedItemCycle);
  return RESIDENTS.map((nome) => {
    const found = base.find((x) => norm(x.nome) === norm(nome));
    const check = checks[nome];
    return { nome, tarefa: found?.tarefa || check?.tarefa || 'Tarefa da semana', extra: found?.extra || '' };
  });
}

async function cycleState(ctx, key, now = Date.now()) {
  const isCurrent = key === ciclo.currentCycleKey(new Date(now));
  const escala = await escalaDoCiclo(ctx, key, isCurrent);
  const checks = ciclo.checksByCycle(ctx.feed, key, feedItemCycle);
  const closedRecord = ctx.desempenho.some((r) => r.ciclo === key);
  const state = ciclo.buildCycleState({ key, now, escala, checks, ratingRows: ctx.ratingRows, rules: ctx.rules, closedRecord, ajustes: ctx.ajustes });
  // Fotos extras da entrega (linhas "check_photo" apontando para o check principal).
  state.residents.forEach((r) => {
    if (!r.checkTs) return;
    const extras = ctx.feed.filter((x) => x.type === 'check_photo' && x.target === r.checkTs && x.photoDataUrl).map((x) => x.ts);
    r.fotos = [...(r.hasPhoto ? [r.checkTs] : []), ...extras];
  });
  return state;
}

function publicCycle(state, { usuario = '', revelarNotas = false, results = null } = {}) {
  if (!state) return null;
  const me = norm(usuario);
  const { _rows, ...rest } = state;
  const out = { ...rest, residents: state.residents.map((r) => ({ ...r })) };
  if (me) out.ratedByMe = ciclo.ratedMap(_rows, usuario);
  if (revelarNotas && results) {
    out.resultados = results.map((r) => ({ ...r, comentarios: norm(r.nome) === me ? r.comentarios : undefined }));
  }
  return out;
}

let lastProcessAt = 0;
let processing = null;

/** Abre/fecha avaliações, grava desempenho, lança multas e cria avisos de e-mail. Idempotente. */
async function processarCiclos({ force = false } = {}) {
  if (!force && Date.now() - lastProcessAt < 60000) return { skipped: true };
  if (processing) return processing;
  processing = withWriteLock(async () => {
    lastProcessAt = Date.now();
    const ctx = await avaliacaoContext({ fresh: true });
    const now = Date.now();
    const atual = ciclo.currentCycleKey(new Date(now));
    const keys = [ciclo.shiftCycleKey(atual, -2), ciclo.shiftCycleKey(atual, -1), atual].filter((k) => k >= ctx.inicio);
    const events = [];
    const haveAviso = (tipo, key) => ctx.avisos.some((a) => a.tipo === tipo && a.ciclo === key);

    // Guarda a escala da semana atual (histórico), caso o Apps Script ainda não tenha publicado.
    if (!ctx.ciclosEscala[atual]) {
      const esc = await escalaDoCiclo(ctx, atual, true);
      if (esc.some((x) => x.tarefa && x.tarefa !== 'Tarefa da semana')) {
        await ensureSheetExists(CICLOS_ESCALA_SHEET, CICLOS_ESCALA_HEADER);
        await appendRows(`${CICLOS_ESCALA_SHEET}!A:E`, esc.map((x) => [atual, x.nome, x.tarefa, x.extra, new Date().toISOString()]));
        ctx.ciclosEscala[atual] = esc;
      }
    }

    for (const key of keys) {
      const state = await cycleState(ctx, key, now);
      if (state.phase === 'entregas') continue;
      const entregas = state.residents.map((r) => ({ nome: r.nome, tarefa: r.tarefa, extra: r.extra, status: r.status, atrasoDias: r.atrasoDias, checkTs: r.checkTs || '' }));
      if (!haveAviso('avaliacao_aberta', key) && state.residents.some((r) => r.status === 'entregue')) {
        const links = Object.fromEntries(RESIDENTS.map((n) => [n, linkAvaliacao(n, key)]));
        events.push({ tipo: 'avaliacao_aberta', ciclo: key, payload: { periodo: state.periodo, fechamento: state.fechamento, entregas, links } });
      }
      if (state.phase === 'avaliacao') {
        const lembrarEm = Date.parse(state.fechamento) - 30 * 60 * 60 * 1000;
        if (now >= lembrarEm && !haveAviso('lembrete_avaliacao', key)) {
          const pendentes = Object.entries(state.avaliacoes.porAvaliador).filter(([, v]) => v.total > v.feitas).map(([nome, v]) => ({ nome, faltam: v.total - v.feitas }));
          if (pendentes.length) events.push({ tipo: 'lembrete_avaliacao', ciclo: key, payload: { periodo: state.periodo, fechamento: state.fechamento, pendentes } });
        }
        continue;
      }
      // encerrada
      if (ctx.desempenho.some((r) => r.ciclo === key)) continue;
      const results = ciclo.cycleResults(state, ctx.rules);
      const fechadoEm = new Date().toISOString();
      await ensureSheetExists(DESEMPENHO_SHEET, ciclo.DESEMPENHO_HEADER);
      await appendRows(`${DESEMPENHO_SHEET}!A:L`, results.map((r) => ciclo.resultToRow(r, fechadoEm)));
      const multas = results.filter((r) => r.multa > 0);
      if (multas.length) {
        await ensureSheetExists(MULTAS_SHEET, MULTAS_HEADER);
        await appendRows(`${MULTAS_SHEET}!A:G`, multas.map((r) => [key, r.nome, r.multa, r.motivo, fechadoEm, 'LANÇADA', '']));
        await appendRows('Caixinha!A:D', multas.map((r) => [spDateBr(), `Multa tarefa · ${r.nome} · semana ${state.periodo}`, r.multa, `automática • ${r.motivo}`]));
        bump('caixinha');
      }
      await ensureSheetExists(TASK_FEED_SHEET);
      await appendRow(`${TASK_FEED_SHEET}!A:H`, [key, fechadoEm, 'comment', 'TOCAH', '', '', `🏁 Avaliação da semana ${state.periodo} encerrada. Veja o resultado em Tarefas → Desempenho.`, '']);
      ctx.desempenho.push(...results.map((r) => ({ ...r, fechadoEm })));
      events.push({
        tipo: 'avaliacao_encerrada',
        ciclo: key,
        payload: {
          periodo: state.periodo,
          resultados: results.map(({ comentarios, ...r }) => r),
        },
      });
      bump('feed');
    }

    if (events.length) {
      await ensureSheetExists(AVISOS_SHEET, AVISOS_HEADER);
      const criadoEm = new Date().toISOString();
      await appendRows(`${AVISOS_SHEET}!A:F`, events.map((e) => [`${e.tipo}:${e.ciclo}`, e.tipo, e.ciclo, criadoEm, '', JSON.stringify(e.payload)]));
      ctx.avisos.push(...events.map((e) => ({ id: `${e.tipo}:${e.ciclo}`, tipo: e.tipo, ciclo: e.ciclo })));
      bump('avaliacao');
    }
    return { ok: true, events: events.map((e) => `${e.tipo}:${e.ciclo}`) };
  }).finally(() => {
    processing = null;
  });
  return processing;
}

/** Grava uma nota (app ou página do e-mail). Mesma regra para os dois. */
async function registrarAvaliacao(body, { origem = 'app' } = {}) {
  const actor = feedLib.canonicalResident(body.actor);
  const target = feedLib.canonicalResident(body.target);
  const score = Number(body.nota);
  const categoria = String(body.categoria || 'casa').trim().toLowerCase() === 'banheirao' ? 'banheirao' : 'casa';
  const comentario = String(body.comentario || '').trim().slice(0, 400);
  if (!actor || !target || !Number.isInteger(score) || score < 1 || score > 5) throw httpError(400, 'Dados de avaliação inválidos.');
  if (actor === target) throw httpError(400, 'Não dá para avaliar a própria tarefa.');
  const ctx = await avaliacaoContext({ fresh: true });
  const key = ciclo.isCycleKey(body.ciclo) ? body.ciclo : '';
  if (!key) throw httpError(400, 'Semana inválida.');
  const state = await cycleState(ctx, key);
  if (state.phase !== 'avaliacao') throw httpError(400, state.phase === 'encerrada' ? 'A avaliação dessa semana já fechou.' : 'A avaliação ainda não abriu.', { code: 'NOT_OPEN' });
  const alvo = state.residents.find((r) => r.nome === target);
  if (!alvo || alvo.status !== 'entregue') throw httpError(400, 'Esse morador não entregou a tarefa.');
  if (categoria === 'banheirao' && !alvo.banheirao) throw httpError(400, 'Esse morador não estava no banheirão.');
  if (categoria === 'banheirao' && !ciclo.podeAvaliarBanheirao(actor, ctx.rules)) throw httpError(403, 'O banheirão só é avaliado por quem entra no rodízio dele.', { code: 'NOT_IN_GROUP' });
  const already = ciclo.ratedMap(state._rows, actor)[target]?.[categoria];
  if (already) throw httpError(409, 'Você já avaliou essa entrega.', { code: 'ALREADY_RATED' });
  const ts = new Date().toISOString();
  const tarefa = categoria === 'banheirao' ? 'Banheirão' : alvo.tarefa;
  await ensureSheetExists(RATINGS_SHEET, ['week', 'actor', 'target', 'nota', 'tarefa', 'comentario', 'ts', 'categoria']);
  await appendRow(`${RATINGS_SHEET}!A:H`, [key, actor, target, score, tarefa, comentario, ts, categoria]);
  bump('ratings', 'avaliacao');
  lastProcessAt = 0;
  setTimeout(() => processarCiclos().catch(() => {}), 50);
  return { ok: true, message: 'Avaliação registrada.', ciclo: key, origem };
}

async function avaliacaoSnapshot(usuario = '') {
  const ctx = await avaliacaoContext();
  const now = Date.now();
  const atualKey = ciclo.currentCycleKey(new Date(now));
  const anteriorKey = ciclo.shiftCycleKey(atualKey, -1);
  const atual = atualKey >= ctx.inicio ? await cycleState(ctx, atualKey, now) : null;
  const anterior = anteriorKey >= ctx.inicio ? await cycleState(ctx, anteriorKey, now) : null;

  // Ciclo que está em avaliação (ou o último encerrado, para mostrar o resultado).
  const emAvaliacao = [anterior, atual].find((x) => x && x.phase === 'avaliacao') || null;
  const ultimoFechadoKey = Array.from(new Set(ctx.desempenho.map((r) => r.ciclo))).sort().pop() || '';
  let ultimoResultado = null;
  if (ultimoFechadoKey) {
    const st = await cycleState(ctx, ultimoFechadoKey, now);
    ultimoResultado = publicCycle(st, { usuario, revelarNotas: true, results: ciclo.cycleResults(st, ctx.rules) });
    // multas e médias oficiais = as gravadas no fechamento
    const gravados = ctx.desempenho.filter((r) => r.ciclo === ultimoFechadoKey);
    ultimoResultado.resultados = ultimoResultado.resultados.map((r) => {
      const g = gravados.find((x) => x.nome === r.nome);
      return g ? { ...r, entregou: g.entregou, atrasoDias: g.atrasoDias, entregueEm: g.entregueEm || r.entregueEm, media: g.media, mediaBanheirao: g.mediaBanheirao, multa: g.multa, motivo: g.motivo, nAvaliacoes: g.nAvaliacoes } : r;
    });
  }

  // Qual ciclo a minha próxima entrega vai cobrir: a semana passada (se ainda dá) ou a atual.
  let minhaEntrega = null;
  if (usuario) {
    const me = norm(usuario);
    const pick = (st) => st && st.residents.find((r) => norm(r.nome) === me);
    const prev = pick(anterior);
    const cur = pick(atual);
    if (prev && prev.status === 'atrasada') minhaEntrega = { ciclo: anterior.key, periodo: anterior.periodo, tolerancia: anterior.tolerancia, ...prev };
    else if (cur) minhaEntrega = { ciclo: atual.key, periodo: atual.periodo, tolerancia: atual.tolerancia, ...cur };
    if (minhaEntrega && prev && prev.status === 'atrasada' && cur) minhaEntrega.depois = { ciclo: atual.key, ...cur };
  }

  return {
    ok: true,
    agora: new Date(now).toISOString(),
    inicio: ctx.inicio,
    regras: {
      multaAuto: ctx.rules.multaAuto,
      multaValor: ctx.rules.multaValor,
      mediaMinima: ctx.rules.mediaMinima,
      minAvaliacoes: ctx.rules.minAvaliacoes,
      toleranciaDias: ctx.rules.toleranciaDias - 6,
      banheiraoGrupo: ctx.rules.banheiraoGrupo,
    },
    atual: publicCycle(atual, { usuario }),
    anterior: publicCycle(anterior, { usuario }),
    emAvaliacao: emAvaliacao ? emAvaliacao.key : '',
    minhaEntrega,
    ultimoResultado,
  };
}

const getActions = {
  async getSyncState() {
    return { ok: true, versions, serverTime: new Date().toISOString(), startedAt: STARTED_AT, week: weekKey(), today: spDateKey() };
  },

  async getDados({ usuario }) {
    const { activeSheet, rows } = await readActiveFinanceSheetRows();
    const target = norm(usuario);
    let aluguel = '--';
    let nome = usuario || 'Morador';
    for (const r of rows) {
      const resident = getCell(r, 1);
      if (resident && norm(resident) === target) {
        nome = resident;
        aluguel = getCell(r, 14) || '--';
        break;
      }
    }
    return { nome, aluguel, mesReferencia: activeSheet };
  },

  async getCaixinha() {
    const rows = await readRangeWithFallback(CAIXINHA_RANGE, ['Caixinha!C2', 'DadosApp!E2']);
    return { saldo: String(rows?.[0]?.[0] ?? '0,00'), extratoHint: 'Toque para ver o extrato' };
  },

  async getCaixinhaStatement() {
    const rows = await readRangeWithFallback('Caixinha!A:D', ['Caixinha!A:Z']);
    return { ok: true, items: feedLib.parseCaixinhaStatement(rows) };
  },

  async getTarefaSemana({ usuario }) {
    const [escala, config, status] = await Promise.all([
      readEscala(),
      readConfig().catch(() => Object.fromEntries(DEFAULT_CONFIG)),
      taskStatusMap().catch(() => ({ checks: {} })),
    ]);
    const mine = escala.list.find((x) => norm(x.nome) === norm(usuario));
    const check = status.checks[feedLib.canonicalResident(usuario)];
    const descricao = mine?.descricao || config.descricaoTarefa || '';
    return {
      tarefaNome: mine && mine.tarefa !== '-' ? mine.tarefa : '',
      descricao,
      prazo: mine?.prazo || '',
      frequencia: mine?.frequencia || '',
      extra: mine?.extra || '',
      extraDescricao: mine?.extraDescricao || '',
      periodo: mine?.periodo || '',
      fonte: escala.source,
      week: weekKey(),
      ...statusFields(check),
    };
  },

  async getEscalaSemana() {
    const escala = await readEscala();
    let checks = {};
    try {
      checks = (await taskStatusMap()).checks;
    } catch {
      checks = {};
    }
    // Continua sendo um array (compatível com o app antigo); campos novos são extras.
    return escala.list.map((item) => ({ ...item, fonte: escala.source, ...statusFields(checks[feedLib.canonicalResident(item.nome)]) }));
  },

  async getAvaliacaoSemana({ usuario = '' }) {
    processarCiclos().catch((e) => console.warn('[avaliacao] processar falhou:', e?.message || e));
    return avaliacaoSnapshot(usuario);
  },

  /** A administração já tem PIN? (sem expor nada) */
  async adminStatus() {
    const config = await readConfig();
    return { ok: true, admin: ADMIN_MORADOR, temPin: !!(ADMIN_PIN || config.adminPinHash), pinPorAmbiente: !!ADMIN_PIN };
  },

  /** Painel do admin: semanas com ajustes, multas, regras e registro. */
  async adminPainel(query) {
    await requireAdmin(query);
    const ctx = await avaliacaoContext({ fresh: true });
    const now = Date.now();
    const atualKey = ciclo.currentCycleKey(new Date(now));
    const keys = [ciclo.shiftCycleKey(atualKey, -1), atualKey, ciclo.shiftCycleKey(atualKey, 1)];
    const semanas = [];
    for (const key of keys) {
      if (key < ctx.inicio && key !== atualKey) continue;
      const st = await cycleState(ctx, key, now);
      const { _rows, ...rest } = st;
      semanas.push({ ...rest, futura: key > atualKey });
    }
    const titles = await getSpreadsheetTitles();
    const multasRows = titles.includes(MULTAS_SHEET) ? (await readRangeOrEmpty(`${MULTAS_SHEET}!A:G`, { fresh: true })).slice(1) : [];
    const logRows = titles.includes(ADMIN_LOG_SHEET) ? (await readRangeOrEmpty(`${ADMIN_LOG_SHEET}!A:D`, { fresh: true })).slice(1) : [];
    return {
      ok: true,
      agora: new Date(now).toISOString(),
      semanas,
      ajustes: ctx.ajustes.filter((a) => keys.includes(a.ciclo)).sort((a, b) => (a.em < b.em ? 1 : -1)),
      multas: multasRows
        .map((r, i) => ({ row: i + 2, ciclo: getCell(r, 0), nome: getCell(r, 1), valor: toNumberLike(getCell(r, 2)) || 0, motivo: getCell(r, 3), lancadoEm: getCell(r, 4), status: getCell(r, 5) || 'LANÇADA', obs: getCell(r, 6) }))
        .filter((m) => m.ciclo && m.nome)
        .reverse(),
      regras: {
        avaliacaoInicio: ctx.inicio,
        avaliacaoMultaAuto: ctx.rules.multaAuto,
        avaliacaoMultaValor: ctx.rules.multaValor,
        avaliacaoMediaMinima: ctx.rules.mediaMinima,
        avaliacaoMinAvaliacoes: ctx.rules.minAvaliacoes,
        avaliacaoToleranciaDias: ctx.rules.toleranciaDias - 6,
        banheiraoGrupo: ctx.rules.banheiraoGrupo.join(','),
      },
      log: logRows.slice(-40).reverse().map((r) => ({ quando: getCell(r, 0), acao: getCell(r, 1), detalhe: getCell(r, 3) })),
      links: Object.fromEntries(RESIDENTS.map((n) => [n, linkAvaliacao(n, keys.find((k) => semanas.some((x) => x.key === k && x.phase === 'avaliacao')) || atualKey)])),
    };
  },

  async getDesempenho() {
    const ctx = await avaliacaoContext();
    const d = ciclo.computeDesempenho(ctx.desempenho, RESIDENTS, 8);
    return { ok: true, ...d, totalCiclos: new Set(ctx.desempenho.map((r) => r.ciclo)).size, regras: { multaValor: ctx.rules.multaValor, mediaMinima: ctx.rules.mediaMinima } };
  },

  /** Chamado pelo Apps Script de hora em hora (acorda o servidor e processa prazos). */
  async tickAvaliacao() {
    const res = await processarCiclos({ force: true });
    return { ok: true, ...res };
  },

  async getTaskRatings({ strict, actor, history }) {
    const wk = weekKey();
    const rows = await readRangeOrEmpty(`${RATINGS_SHEET}!A:H`);
    const data = rows.slice(1);
    const weeks = Array.from(new Set(data.map((r) => String(r[0] || '').trim()).filter(Boolean))).sort(feedLib.sortWeekKeysDesc);
    const hasCurrent = data.some((r) => String(r[0] || '') === wk);
    const effectiveWeek = strict === '1' || hasCurrent ? wk : weeks[0] || wk;
    const out = { ok: true, week: effectiveWeek, currentWeek: wk, ratings: feedLib.getRatingsSummaryForWeek(data, effectiveWeek) };
    if (actor) out.ratedByMe = feedLib.ratedByActor(data, wk, actor);
    if (history !== '0') {
      const hist = {};
      for (const w of weeks) hist[w] = feedLib.getRatingsSummaryForWeek(data, w);
      out.history = hist;
    }
    return out;
  },

  async getTaskFeed({ week, strict, photos, likes }) {
    const items = await readFeed();
    const wk = weekKey();
    const weeks = feedWeeks(items);
    let effectiveWeek;
    if (week) effectiveWeek = String(week);
    else if (strict === '1') effectiveWeek = wk;
    else effectiveWeek = items.some((r) => r.week === wk) ? wk : weeks[0] || wk;
    let feed = items
      .filter((x) => feedLib.itemWeek(x) === effectiveWeek && x.type !== 'deleted' && x.type !== 'check_photo')
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
      .map(feedLib.anonymizeRating);
    if (photos === '0') {
      feed = feed.map(({ photoDataUrl, ...rest }) => ({ ...rest, hasPhoto: !!photoDataUrl }));
    } else {
      feed = await hydratePhotos(feed);
    }
    if (likes === '1') {
      const { byTs } = await readLikes();
      feed = feed.map((item) => ({ ...item, likes: byTs[item.ts] || [] }));
    }
    const idx = weeks.indexOf(effectiveWeek);
    return {
      ok: true,
      week: effectiveWeek,
      currentWeek: wk,
      weeks,
      previousWeek: idx >= 0 ? weeks[idx + 1] || '' : weeks.find((w) => feedLib.sortWeekKeysDesc(effectiveWeek, w) < 0) || '',
      feed,
    };
  },

  async getFeedPhoto({ ts }) {
    const key = String(ts || '').trim();
    if (!key) throw httpError(400, 'ts obrigatório.');
    const items = await readFeed();
    const item = items.find((x) => x.ts === key);
    if (!item || !item.photoDataUrl) return { ok: true, ts: key, photoDataUrl: '' };
    const [hydrated] = await hydratePhotos([item]);
    return { ok: true, ts: key, photoDataUrl: hydrated.photoDataUrl || '' };
  },

  async getNildeWeek() {
    const days = spWeekDays();
    const items = await readFeed();
    return {
      ok: true,
      today: spDateKey(),
      days: days.map((key) => ({ date: key })),
      slots: feedLib.NILDE_SLOTS,
      log: feedLib.buildNildeWeek(items, days),
    };
  },

  async getProfiles() {
    const titles = await getSpreadsheetTitles();
    if (!titles.includes(PROFILES_SHEET)) return { ok: true, profiles: {} };
    const rows = await readRangeOrEmpty(`${PROFILES_SHEET}!A:C`);
    let list = rows
      .filter((r, i) => !(i === 0 && norm(r[0]) === 'NOME'))
      .map((r) => ({ nome: feedLib.canonicalResident(getCell(r, 0)), photoDataUrl: String(r[1] || ''), updatedAt: getCell(r, 2) }))
      .filter((p) => p.nome);
    list = await hydratePhotos(list);
    const profiles = {};
    list.forEach((p) => {
      if (p.photoDataUrl) profiles[p.nome] = { photoDataUrl: p.photoDataUrl, updatedAt: p.updatedAt };
    });
    return { ok: true, profiles };
  },

  async getConfig() {
    const titles = await getSpreadsheetTitles();
    return { ok: true, exists: titles.includes(CONFIG_SHEET), config: await readConfig() };
  },

  async getSettledHistory() {
    const titles = await getSpreadsheetTitles();
    if (!titles.includes(SETTLED_SHEET)) return { ok: true, items: [] };
    const rows = await readRangeOrEmpty(`${SETTLED_SHEET}!A:H`);
    const items = rows
      .slice(1)
      .map((r) => ({ quitadoEm: getCell(r, 0), quitadoPor: getCell(r, 1), mes: getCell(r, 2), quem: getCell(r, 3), deveQuanto: getCell(r, 4), paraQuem: getCell(r, 5), obs: getCell(r, 6) }))
      .filter((x) => x.quem)
      .reverse()
      .slice(0, 50);
    return { ok: true, items };
  },

  async getFinancePreview() {
    const titles = await getSpreadsheetTitles({ fresh: true });
    const civil = getSaoPauloYearMonth();
    const auto = fin.autoFinanceCandidates(titles);
    const { activeSheet, rows } = await readActiveFinanceSheetRows();
    const snapshot = fin.parseFinanceSnapshot(rows);
    return {
      ok: true,
      serverUtc: new Date().toISOString(),
      saoPauloCivil: civil,
      automaticTabIfCivilMode: auto.currentName,
      financeActiveSheetEnv: String(FINANCE_ACTIVE_SHEET || '').trim() || null,
      financeActiveSheetLegacyEnv: String(FORCE_FINANCE_SHEET || '').trim() || null,
      modeCivilAuto: /^AUTO$/i.test(financeMode()),
      configuredSheetTarget: financeMode(),
      manualSheetResolved: pickManualFinanceSheetTitle(titles),
      preferredTabInSpreadsheet: auto.preferred || null,
      activeSheetUsed: activeSheet,
      canonicalMonthTabsNewestFirst: auto.ordered,
      snapshotSummary: {
        residents: snapshot.residents.length,
        contas: snapshot.contas.length,
        gastosColetivos: snapshot.gastosColetivos.length,
        acertosIndividuais: snapshot.acertosIndividuais.length,
      },
      spreadsheetTabCount: titles.length,
      spreadsheetTabs: titles,
    };
  },

  async getFinanceSnapshot({ sheet }) {
    const active = await readActiveFinanceSheetRows();
    let viewing = active;
    if (sheet && norm(sheet) !== norm(active.activeSheet)) {
      const title = fin.findTitle(active.titles, sheet) || (active.titles.includes(sheet) ? sheet : null);
      if (!title || !fin.parseMonthSheetTitle(title)) throw httpError(404, 'Mês não encontrado na planilha.');
      viewing = { activeSheet: title, rows: await readRange(a1RangeForSheet(title, 'A:Z')) };
    }
    const parsed = fin.parseFinanceSnapshot(viewing.rows);
    return {
      ok: true,
      mesReferencia: viewing.activeSheet,
      mesLabel: fin.monthLabel(fin.parseMonthSheetTitle(viewing.activeSheet)) || viewing.activeSheet,
      activeSheet: active.activeSheet,
      isActive: viewing.activeSheet === active.activeSheet,
      availableMonths: fin.listMonthSheets(active.titles),
      ...parsed,
    };
  },
};

/* ======================================================================
 * Ações POST
 * ==================================================================== */

const postActions = {
  /** Entrega da tarefa da semana: foto obrigatória, uma vez por ciclo (vale a semana passada até quarta). */
  async entregarTarefa(body) {
    const usuario = feedLib.canonicalResident(body.usuario);
    const fotos = (Array.isArray(body.photos) ? body.photos : [body.photoDataUrl])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 6);
    const photoDataUrl = fotos[0] || '';
    if (!usuario) throw httpError(400, 'Morador inválido.');
    if (!photoDataUrl) throw httpError(400, 'A foto da tarefa é obrigatória.');
    if (fotos.some((f) => !/^data:image\//i.test(f))) throw httpError(400, 'Formato de foto inválido.');
    const ctx = await avaliacaoContext({ fresh: true });
    const now = Date.now();
    const atualKey = ciclo.currentCycleKey(new Date(now));
    const key = ciclo.isCycleKey(body.ciclo) ? body.ciclo : atualKey;
    if (key > atualKey) throw httpError(400, 'Essa semana ainda não começou.');
    if (key < ctx.inicio) throw httpError(400, 'A avaliação com foto começou depois dessa semana.');
    const state = await cycleState(ctx, key, now);
    const mine = state.residents.find((r) => r.nome === usuario);
    if (!mine) throw httpError(400, 'Morador fora da escala.');
    if (mine.status === 'entregue') throw httpError(409, 'Você já entregou a tarefa dessa semana.', { code: 'ALREADY_DONE', checkTs: mine.checkTs });
    if (mine.status === 'nao_entregue' || state.phase === 'encerrada') throw httpError(400, 'O prazo de tolerância dessa semana já acabou.', { code: 'DEADLINE_PASSED' });
    const ts = new Date().toISOString();
    const atraso = ciclo.lateDays(Date.parse(ts), Date.parse(mine.prazo));
    const tarefa = mine.tarefa + (mine.extra ? ` + ${mine.extra}` : '');
    const savedPhoto = await storePhotoDataUrl(photoDataUrl);
    const texto = atraso ? `entregou a tarefa com ${atraso} dia${atraso > 1 ? 's' : ''} de atraso` : 'entregou a tarefa no prazo';
    await appendRow(`${TASK_FEED_SHEET}!A:H`, [key, ts, 'check', usuario, usuario, tarefa, texto, savedPhoto]);
    const extras = [];
    for (let i = 1; i < fotos.length; i += 1) {
      const saved = await storePhotoDataUrl(fotos[i]);
      extras.push([key, new Date(Date.parse(ts) + i).toISOString(), 'check_photo', usuario, ts, tarefa, `foto ${i + 1} da entrega`, saved]);
    }
    if (extras.length) await appendRows(`${TASK_FEED_SHEET}!A:H`, extras);
    bump('feed', 'avaliacao');
    lastProcessAt = 0;
    setTimeout(() => processarCiclos().catch(() => {}), 50);
    return { ok: true, message: 'Tarefa entregue.', ts, ciclo: key, atrasoDias: atraso, fotos: fotos.length };
  },

  /** Avaliação anônima (1 a 5 + comentário) da entrega de outro morador. */
  async avaliarEntrega(body) {
    return registrarAvaliacao(body);
  },

  /** Cria (primeira vez) ou troca o PIN da administração. */
  async adminDefinirPin(body) {
    if (feedLib.canonicalResident(body.usuario) !== ADMIN_MORADOR) throw httpError(403, 'Só o Guilherme administra.');
    if (ADMIN_PIN) throw httpError(400, 'O PIN está definido no servidor (Render).');
    const novo = String(body.pin || '').trim();
    if (!/^\d{4,8}$/.test(novo)) throw httpError(400, 'Use um PIN de 4 a 8 números.');
    const config = await readConfig();
    if (config.adminPinHash && !safeEqual(pinHash(body.pinAtual || ''), config.adminPinHash)) throw httpError(403, 'PIN atual errado.', { code: 'BAD_PIN' });
    await setConfigValues({ adminPinHash: pinHash(novo) });
    await adminLog('definir PIN', config.adminPinHash ? 'PIN trocado' : 'PIN criado');
    return { ok: true, adminToken: adminToken() };
  },

  async adminEntrar(body) {
    if (feedLib.canonicalResident(body.usuario) !== ADMIN_MORADOR) throw httpError(403, 'Só o Guilherme administra.');
    const pin = String(body.pin || '').trim();
    const config = await readConfig();
    const ok = ADMIN_PIN ? safeEqual(pin, ADMIN_PIN) : config.adminPinHash && safeEqual(pinHash(pin), config.adminPinHash);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 800));
      throw httpError(403, 'PIN errado.', { code: 'BAD_PIN' });
    }
    return { ok: true, adminToken: adminToken() };
  },

  /** Ajuste manual: prazo, tolerância, fechamento, dispensa, abono, tarefa, abrir/fechar avaliação. */
  async adminAjuste(body) {
    await requireAdmin(body);
    const key = String(body.ciclo || '');
    const tipo = String(body.tipo || '').toLowerCase();
    const morador = body.morador === '*' ? '*' : feedLib.canonicalResident(body.morador);
    if (!ciclo.isCycleKey(key)) throw httpError(400, 'Semana inválida.');
    if (!ciclo.AJUSTE_TIPOS.includes(tipo)) throw httpError(400, 'Tipo de ajuste inválido.');
    if (!morador) throw httpError(400, 'Morador inválido.');
    let valor = String(body.valor ?? '').trim();
    if (['prazo', 'tolerancia', 'fechamento'].includes(tipo)) {
      const t = Date.parse(valor);
      if (!Number.isFinite(t)) throw httpError(400, 'Data inválida.');
      valor = new Date(t).toISOString();
    }
    if (tipo === 'tarefa' && !valor) throw httpError(400, 'Escreva a tarefa.');
    if (['dispensa', 'abono', 'abrir_avaliacao', 'fechar_avaliacao'].includes(tipo)) valor = '1';
    if (['fechamento', 'abrir_avaliacao', 'fechar_avaliacao'].includes(tipo) && morador !== '*') throw httpError(400, 'Esse ajuste vale para a casa toda.');
    const ctx = await avaliacaoContext({ fresh: true });
    if (ctx.desempenho.some((r) => r.ciclo === key)) throw httpError(400, 'Essa semana já foi encerrada. Para corrigir multa use "Retirar multa".', { code: 'CLOSED' });
    const em = new Date().toISOString();
    const id = `aj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const motivo = String(body.motivo || '').trim().slice(0, 200);
    await ensureSheetExists(AJUSTES_SHEET, ciclo.AJUSTES_HEADER);
    await appendRow(`${AJUSTES_SHEET}!A:I`, [id, key, morador, tipo, valor, motivo, ADMIN_MORADOR, em, 'SIM']);
    const nomeTipo = { prazo: 'mudar prazo', tolerancia: 'mudar tolerância', fechamento: 'mudar fechamento', dispensa: 'dispensar', abono: 'abonar atraso', tarefa: 'trocar tarefa', abrir_avaliacao: 'abrir avaliação', fechar_avaliacao: 'fechar avaliação' }[tipo];
    const valorTxt = ['prazo', 'tolerancia', 'fechamento'].includes(tipo) ? quandoBR(valor) : tipo === 'tarefa' ? valor : '';
    await adminLog(nomeTipo, `semana ${ciclo.cycleInfo(key).periodo} · ${morador === '*' ? 'casa toda' : morador}${valorTxt ? ` · ${valorTxt}` : ''}${motivo ? ` · ${motivo}` : ''}`);
    bump('avaliacao', 'feed');
    lastProcessAt = 0;
    setTimeout(() => processarCiclos().catch(() => {}), 50);
    return { ok: true, id, message: 'Ajuste salvo.' };
  },

  async adminDesfazerAjuste(body) {
    await requireAdmin(body);
    const id = String(body.id || '').trim();
    const rows = await readRangeOrEmpty(`${AJUSTES_SHEET}!A:I`, { fresh: true });
    const idx = rows.findIndex((r) => getCell(r, 0) === id);
    if (idx < 0) throw httpError(404, 'Ajuste não encontrado.');
    await writeCells(AJUSTES_SHEET, [{ row: idx + 1, col: 8, value: 'NÃO' }]);
    await adminLog('desfazer ajuste', `${id} (${getCell(rows[idx], 3)} · ${getCell(rows[idx], 2)})`);
    bump('avaliacao');
    return { ok: true, message: 'Ajuste desfeito.' };
  },

  /** Apaga uma entrega (foto errada etc.) para a pessoa poder mandar de novo. */
  async adminApagarEntrega(body) {
    await requireAdmin(body);
    const key = String(body.ciclo || '');
    const nome = feedLib.canonicalResident(body.morador);
    if (!ciclo.isCycleKey(key) || !nome) throw httpError(400, 'Dados inválidos.');
    const ctx = await avaliacaoContext({ fresh: true });
    if (ctx.desempenho.some((r) => r.ciclo === key)) throw httpError(400, 'Essa semana já foi encerrada.', { code: 'CLOSED' });
    const check = ciclo.checksByCycle(ctx.feed, key, feedItemCycle)[nome];
    if (!check) throw httpError(404, 'Não tem entrega dessa pessoa nessa semana.');
    const alvos = ctx.feed.filter((x) => x.ts === check.ts || (x.type === 'check_photo' && x.target === check.ts));
    await writeCells(TASK_FEED_SHEET, alvos.map((x) => ({ row: x.rowIndex, col: 2, value: 'deleted' })));
    await adminLog('apagar entrega', `${key} · ${nome} · ${String(body.motivo || '').trim()}`);
    bump('feed', 'avaliacao', 'escala');
    return { ok: true, message: 'Entrega apagada. A pessoa já pode mandar de novo.' };
  },

  /** Retira uma multa lançada errada: estorno na Caixinha + desempenho corrigido. */
  async adminRetirarMulta(body) {
    await requireAdmin(body);
    const key = String(body.ciclo || '');
    const nome = feedLib.canonicalResident(body.morador);
    const motivo = String(body.motivo || '').trim().slice(0, 200) || 'retirada pelo admin';
    const rows = await readRangeOrEmpty(`${MULTAS_SHEET}!A:G`, { fresh: true });
    const idx = rows.findIndex((r, i) => i > 0 && getCell(r, 0) === key && norm(getCell(r, 1)) === norm(nome) && norm(getCell(r, 5) || 'LANCADA') !== 'RETIRADA');
    if (idx < 0) throw httpError(404, 'Multa não encontrada (ou já retirada).');
    const valor = toNumberLike(getCell(rows[idx], 2)) || 0;
    await writeCells(MULTAS_SHEET, [
      { row: idx + 1, col: 5, value: 'RETIRADA' },
      { row: idx + 1, col: 6, value: `${motivo} • ${spDateBr()}` },
    ]);
    const info = ciclo.cycleInfo(key);
    await appendRow('Caixinha!A:D', [spDateBr(), `Estorno multa tarefa · ${nome} · semana ${info.periodo}`, -Math.abs(valor), `retirada por ${ADMIN_MORADOR} • ${motivo}`]);
    const des = await readRangeOrEmpty(`${DESEMPENHO_SHEET}!A:L`, { fresh: true });
    const dIdx = des.findIndex((r) => getCell(r, 0) === key && norm(getCell(r, 1)) === norm(nome));
    if (dIdx >= 0) {
      await writeCells(DESEMPENHO_SHEET, [
        { row: dIdx + 1, col: 9, value: '0' },
        { row: dIdx + 1, col: 10, value: `multa retirada: ${motivo}` },
      ]);
    }
    await adminLog('retirar multa', `${key} · ${nome} · R$ ${valor} · ${motivo}`);
    bump('caixinha', 'avaliacao');
    return { ok: true, message: `Multa retirada e R$ ${valor} estornado na Caixinha.` };
  },

  /** Multa manual (ex.: combinado em reunião). */
  async adminLancarMulta(body) {
    await requireAdmin(body);
    const key = ciclo.isCycleKey(body.ciclo) ? body.ciclo : ciclo.currentCycleKey();
    const nome = feedLib.canonicalResident(body.morador);
    const valor = Math.abs(toNumberLike(body.valor));
    const motivo = String(body.motivo || '').trim().slice(0, 200);
    if (!nome || !valor || !motivo) throw httpError(400, 'Morador, valor e motivo são obrigatórios.');
    await ensureSheetExists(MULTAS_SHEET, MULTAS_HEADER);
    await appendRow(`${MULTAS_SHEET}!A:G`, [key, nome, valor, motivo, new Date().toISOString(), 'LANÇADA', 'manual']);
    await appendRow('Caixinha!A:D', [spDateBr(), `Multa tarefa · ${nome} · semana ${ciclo.cycleInfo(key).periodo}`, valor, `manual • ${motivo}`]);
    await adminLog('lançar multa', `${key} · ${nome} · R$ ${valor} · ${motivo}`);
    bump('caixinha', 'avaliacao');
    return { ok: true, message: 'Multa lançada na Caixinha.' };
  },

  async adminRegras(body) {
    await requireAdmin(body);
    const r = body.regras || {};
    const out = {};
    if (r.avaliacaoMultaAuto !== undefined) out.avaliacaoMultaAuto = r.avaliacaoMultaAuto ? 'sim' : 'não';
    if (r.avaliacaoMultaValor !== undefined) {
      const v = toNumberLike(r.avaliacaoMultaValor);
      if (!Number.isFinite(v) || v < 0) throw httpError(400, 'Valor da multa inválido.');
      out.avaliacaoMultaValor = String(v);
    }
    if (r.avaliacaoMediaMinima !== undefined) {
      const v = toNumberLike(r.avaliacaoMediaMinima);
      if (!Number.isFinite(v) || v < 0 || v > 5) throw httpError(400, 'Média mínima de 0 a 5.');
      out.avaliacaoMediaMinima = String(v);
    }
    if (r.avaliacaoMinAvaliacoes !== undefined) out.avaliacaoMinAvaliacoes = String(Math.max(1, Math.round(toNumberLike(r.avaliacaoMinAvaliacoes) || 1)));
    if (r.avaliacaoToleranciaDias !== undefined) out.avaliacaoToleranciaDias = String(Math.max(0, Math.min(6, Math.round(toNumberLike(r.avaliacaoToleranciaDias) || 0))));
    if (r.banheiraoGrupo !== undefined) {
      const lista = String(r.banheiraoGrupo).split(/[,;]/).map((x) => feedLib.canonicalResident(x)).filter(Boolean);
      if (!lista.length) throw httpError(400, 'Escolha pelo menos uma pessoa para o banheirão.');
      out.banheiraoGrupo = lista.join(',');
    }
    if (r.avaliacaoInicio !== undefined) {
      if (!ciclo.isCycleKey(r.avaliacaoInicio)) throw httpError(400, 'Semana de início inválida.');
      out.avaliacaoInicio = r.avaliacaoInicio;
    }
    if (!Object.keys(out).length) throw httpError(400, 'Nada para salvar.');
    await setConfigValues(out);
    await adminLog('regras', Object.entries(out).map(([k, v]) => `${k}=${v}`).join(' · '));
    lastProcessAt = 0;
    return { ok: true, message: 'Regras salvas.' };
  },

  /** Cobrança manual por e-mail (sai no próximo ciclo do Apps Script, em até 1 hora). */
  async adminCobrar(body) {
    await requireAdmin(body);
    const ctx = await avaliacaoContext({ fresh: true });
    const key = ciclo.isCycleKey(body.ciclo) ? body.ciclo : ciclo.currentCycleKey();
    const st = await cycleState(ctx, key);
    const tipo = body.tipo === 'avaliacao' ? 'avaliacao' : 'entrega';
    const pendentes = tipo === 'avaliacao'
      ? Object.entries(st.avaliacoes.porAvaliador).filter(([, v]) => v.total > v.feitas).map(([nome, v]) => ({ nome, faltam: v.total - v.feitas, link: linkAvaliacao(nome, key) }))
      : st.residents.filter((r) => r.status === 'no_prazo' || r.status === 'atrasada').map((r) => ({ nome: r.nome, tarefa: r.tarefa, status: r.status, atrasoDias: r.atrasoDias, prazo: r.prazo, tolerancia: r.tolerancia }));
    if (!pendentes.length) return { ok: true, enviados: 0, message: 'Ninguém pendente.' };
    await ensureSheetExists(AVISOS_SHEET, AVISOS_HEADER);
    const id = `cobranca_manual:${key}:${Date.now()}`;
    await appendRow(`${AVISOS_SHEET}!A:F`, [id, 'cobranca_manual', key, new Date().toISOString(), '', JSON.stringify({ tipo, periodo: st.periodo, fechamento: st.fechamento, pendentes })]);
    await adminLog('cobrar', `${tipo} · ${key} · ${pendentes.map((p) => p.nome).join(', ')}`);
    return { ok: true, enviados: pendentes.length, pendentes: pendentes.map((p) => p.nome), message: `Cobrança agendada para ${pendentes.length} pessoa(s) — sai em até 1 hora.` };
  },

  /** O Apps Script marca os avisos que já mandou por e-mail. */
  async marcarAvisoEnviado(body) {
    const id = String(body.id || '').trim();
    if (!id) throw httpError(400, 'id obrigatório.');
    const rows = await readRangeOrEmpty(`${AVISOS_SHEET}!A:E`, { fresh: true });
    const idx = rows.findIndex((r) => getCell(r, 0) === id);
    if (idx < 0) throw httpError(404, 'Aviso não encontrado.');
    await writeCells(AVISOS_SHEET, [{ row: idx + 1, col: 4, value: new Date().toISOString() }]);
    return { ok: true };
  },

  async concluirTarefa(body) {
    const { usuario = 'Morador', photoDataUrl = '', once = false } = body;
    let { tarefaNome = '' } = body;
    if (once && !String(photoDataUrl || '').trim()) throw httpError(400, 'A foto de comprovação é obrigatória.');
    await ensureSheetExists(TASK_FEED_SHEET);
    const wk = weekKey();
    if (once) {
      const items = await readFeed({ fresh: true });
      const done = feedLib.checksByResident(items, wk)[feedLib.canonicalResident(usuario)];
      if (done) throw httpError(409, 'Você já concluiu sua tarefa desta semana.', { code: 'ALREADY_DONE', checkTs: done.ts });
    }
    if (!String(tarefaNome || '').trim()) {
      try {
        const escala = await readEscala();
        tarefaNome = escala.list.find((x) => norm(x.nome) === norm(usuario))?.tarefa || '';
      } catch {
        tarefaNome = '';
      }
    }
    const ts = new Date().toISOString();
    const savedPhoto = await storePhotoDataUrl(photoDataUrl);
    await appendRow(`${TASK_FEED_SHEET}!A:H`, [wk, ts, 'check', usuario, usuario, tarefaNome, 'concluiu a tarefa da semana', savedPhoto]);
    bump('feed');
    return { ok: true, message: 'Tarefa concluída registrada.', ts, week: wk };
  },

  async dispararCobrancaAluguel(body) {
    return postActions.cobrarAtrasados({ ...body, action: 'dispararCobrancaAluguel' });
  },

  async cobrarAtrasados(body) {
    await ensureSheetExists(ADMIN_LOG_SHEET);
    await appendRow(`${ADMIN_LOG_SHEET}!A:D`, [new Date().toISOString(), body.action || 'cobrarAtrasados', 'ADMIN', 'executado pelo app']);
    return { ok: true, message: 'Ação registrada na planilha.' };
  },

  async addCaixinhaEntry(body) {
    const { tipo = 'entrada', descricao = '', valor = '', obs = '', autor = '' } = body;
    if (!String(descricao).trim() || valor === '') throw httpError(400, 'Descrição e valor são obrigatórios.');
    const numeric = toNumberLike(valor);
    if (!Number.isFinite(numeric) || numeric === 0) throw httpError(400, 'Valor inválido.');
    const signed = tipo === 'saida' ? -Math.abs(numeric) : Math.abs(numeric);
    const finalObs = [String(obs || '').trim(), autor ? `por ${String(autor).trim()}` : ''].filter(Boolean).join(' • ');
    await appendRow('Caixinha!A:D', [spDateBr(), String(descricao).trim(), signed, finalObs]);
    bump('caixinha');
    return { ok: true, message: 'Movimentação adicionada na caixinha.' };
  },

  /** Ação antiga (mantida para o app antigo). */
  async addFinanceEntry(body) {
    const { entryType, usuario = '', payload = {} } = body;
    const { activeSheet, rows } = await readFinanceForWrite();
    if (entryType === 'conta_fixa') {
      const block = fin.FINANCE_BLOCKS.conta_fixa;
      const [row] = findEmptyRows(rows, block, 1);
      await writeCells(activeSheet, blockFieldUpdates(block, row, {
        conta: payload.conta || payload.descricao || 'Conta',
        valor: normalizeMoney2(payload.valor),
        divisao: payload.divisao || '',
        vencimento: payload.vencimento || '',
        status: payload.status || 'FALSE',
      }));
      bump('finance');
      return { ok: true, message: 'Conta fixa adicionada.' };
    }
    if (entryType === 'gasto_coletivo') {
      const block = fin.FINANCE_BLOCKS.gasto_coletivo;
      const [row] = findEmptyRows(rows, block, 1);
      const payer = String(usuario || payload.quem || '').trim();
      const updates = blockFieldUpdates(block, row, {
        quem: payload.quem || payer,
        quanto: normalizeMoney2(payload.valor || payload.quanto),
        oQue: payload.oQue || payload.descricao || '',
        obs: payload.obs || '',
      });
      const selected = Array.isArray(payload.dividirCom) ? payload.dividirCom : [];
      const participants = Array.from(new Set([payer, ...selected].map((n) => String(n || '').trim()).filter(Boolean)));
      const totalValue = toNumberLike(payload.valor || payload.quanto || '');
      if (participants.length > 1 && Number.isFinite(totalValue)) {
        // Comportamento legado do backend (pagador incluso). O app novo usa addCollectiveExpense.
        const debtors = participants.filter((n) => norm(n) !== norm(payer));
        const each = totalValue / participants.length;
        const acBlock = fin.FINANCE_BLOCKS.acerto_individual;
        const acRows = findEmptyRows(rows, acBlock, debtors.length);
        debtors.forEach((debtor, i) => {
          updates.push(...blockFieldUpdates(acBlock, acRows[i], { quem: debtor, deveQuanto: normalizeMoney2(each), paraQuem: payer, obs: payload.obs || '' }));
        });
      }
      await writeCells(activeSheet, updates);
      bump('finance');
      return { ok: true, message: 'Gasto coletivo adicionado.' };
    }
    if (entryType === 'acerto_individual') {
      const block = fin.FINANCE_BLOCKS.acerto_individual;
      const [row] = findEmptyRows(rows, block, 1);
      await writeCells(activeSheet, blockFieldUpdates(block, row, {
        quem: payload.quem || usuario || '',
        deveQuanto: normalizeMoney2(payload.deveQuanto || payload.valor),
        paraQuem: payload.paraQuem || '',
        obs: payload.obs || payload.descricao || '',
      }));
      bump('finance');
      return { ok: true, message: 'Acerto individual adicionado.' };
    }
    throw httpError(400, 'entryType inválido.');
  },

  /**
   * Atualiza SÓ os campos enviados (antes apagava Divisão e Vencimento das contas fixas).
   * `expected` (opcional) confere se a linha ainda é a mesma antes de escrever.
   */
  async updateFinanceEntry(body) {
    const { entryType, rowIndex, payload = {}, expected, expectedSheet } = body;
    const { activeSheet, rows } = await readFinanceForWrite(expectedSheet);
    const { block, row } = resolveFinanceRow(rows, entryType, rowIndex, expected);
    const fields = fin.pickBlockFields(block, payload);
    if (!Object.keys(fields).length) throw httpError(400, 'Nada para atualizar.');
    await writeCells(activeSheet, blockFieldUpdates(block, row, fields));
    bump('finance');
    const labels = { conta_fixa: 'Conta fixa atualizada.', gasto_coletivo: 'Gasto coletivo atualizado.', acerto_individual: 'Acerto atualizado.' };
    return { ok: true, message: labels[entryType], rowIndex: row };
  },

  async deleteFinanceEntry(body) {
    const { entryType, rowIndex, match = {}, expected, expectedSheet, cascade = false } = body;
    const { activeSheet, rows } = await readFinanceForWrite(expectedSheet);
    const block = fin.FINANCE_BLOCKS[entryType];
    if (!block) throw httpError(400, 'entryType inválido.');
    let row = 0;
    if (expected) {
      row = resolveFinanceRow(rows, entryType, rowIndex, expected).row;
    } else {
      const numeric = Number(rowIndex);
      if (Number.isFinite(numeric) && numeric >= 1) row = numeric;
      else {
        const located = fin.locateRow(rows, block, 0, match);
        row = located.row;
      }
    }
    if (!row) throw httpError(400, 'Não foi possível localizar a linha para exclusão.');
    const clear = Object.fromEntries(Object.keys(block.fields).map((f) => [f, '']));
    const updates = blockFieldUpdates(block, row, clear);
    let removedLinked = 0;
    if (entryType === 'gasto_coletivo' && cascade) {
      const ref = fin.parseRefTag(getCell(rows[row - 1] || [], block.fields.obs));
      if (ref) {
        const acBlock = fin.FINANCE_BLOCKS.acerto_individual;
        const acClear = Object.fromEntries(Object.keys(acBlock.fields).map((f) => [f, '']));
        linkedSettlements(rows, ref.id).forEach((l) => {
          updates.push(...blockFieldUpdates(acBlock, l.row, acClear));
          removedLinked += 1;
        });
      }
    }
    await writeCells(activeSheet, updates);
    bump('finance');
    const labels = { conta_fixa: 'Conta fixa removida.', gasto_coletivo: 'Gasto coletivo removido.', acerto_individual: 'Acerto removido.' };
    return { ok: true, message: labels[entryType], removedLinked };
  },

  async toggleContaStatus(body) {
    const { rowIndex, status, expected, expectedSheet } = body;
    const { activeSheet, rows } = await readFinanceForWrite(expectedSheet);
    const { block, row } = expected
      ? resolveFinanceRow(rows, 'conta_fixa', rowIndex, expected)
      : { block: fin.FINANCE_BLOCKS.conta_fixa, row: Number(rowIndex) };
    if (!Number.isFinite(row) || row < 1) throw httpError(400, 'rowIndex inválido.');
    const normalizedStatus = typeof status === 'boolean' ? (status ? 'TRUE' : 'FALSE') : String(status || '').toUpperCase();
    const next = normalizedStatus === 'TRUE' ? 'TRUE' : 'FALSE';
    await writeCells(activeSheet, [{ row, col: block.fields.status, value: next }]);
    bump('finance');
    return { ok: true, message: `Conta marcada como ${next === 'TRUE' ? 'paga' : 'pendente'}.`, status: next };
  },

  /** Novo: gasto coletivo + acertos de cada devedor numa única escrita. */
  async addCollectiveExpense(body) {
    const { payer = '', oQue = '', valor = '', obs = '', devedores = [], incluirPagador = false, expectedSheet } = body;
    const quem = String(payer || '').trim();
    const total = toNumberLike(valor);
    const list = Array.from(new Set((devedores || []).map((n) => String(n || '').trim()).filter((n) => n && norm(n) !== norm(quem))));
    if (!quem || !String(oQue).trim() || !Number.isFinite(total) || total <= 0) throw httpError(400, 'Preencha quem pagou, descrição e valor.');
    if (!list.length) throw httpError(400, 'Selecione ao menos um morador para dividir.');
    const { activeSheet, rows } = await readFinanceForWrite(expectedSheet);
    const shares = fin.computeCollectiveShares(total, list, !!incluirPagador);
    const refId = fin.createRefId();
    const gBlock = fin.FINANCE_BLOCKS.gasto_coletivo;
    const aBlock = fin.FINANCE_BLOCKS.acerto_individual;
    const [gRow] = findEmptyRows(rows, gBlock, 1);
    const aRows = findEmptyRows(rows, aBlock, shares.length);
    const updates = blockFieldUpdates(gBlock, gRow, {
      quem,
      quanto: normalizeMoney2(total),
      oQue: String(oQue).trim(),
      obs: fin.collectiveObs(obs, list, quem, shares, !!incluirPagador, refId),
    });
    shares.forEach((s, i) => {
      updates.push(...blockFieldUpdates(aBlock, aRows[i], {
        quem: s.nome,
        deveQuanto: normalizeMoney2(s.valor),
        paraQuem: quem,
        obs: fin.settlementObs(obs, String(oQue).trim(), refId, !!incluirPagador),
      }));
    });
    await writeCells(activeSheet, updates);
    bump('finance');
    return { ok: true, message: `Gasto lançado e dividido entre ${shares.length} morador(es).`, shares, refId };
  },

  /**
   * Novo: edita um gasto coletivo e, se ele foi criado pelo app novo (tem a marca #g...),
   * recalcula os acertos ligados com a mesma regra usada na criação.
   */
  async updateCollectiveExpense(body) {
    const { rowIndex, expected, payload = {}, expectedSheet } = body;
    const { activeSheet, rows } = await readFinanceForWrite(expectedSheet);
    const { block, row } = resolveFinanceRow(rows, 'gasto_coletivo', rowIndex, expected);
    const current = rows[row - 1] || [];
    const ref = fin.parseRefTag(getCell(current, block.fields.obs));
    const fields = fin.pickBlockFields(block, payload);
    const updates = [];
    let linkedUpdated = 0;
    if (ref) {
      const linked = linkedSettlements(rows, ref.id);
      const newPayer = fields.quem !== undefined ? fields.quem : getCell(current, block.fields.quem);
      const newTotal = fields.quanto !== undefined ? toNumberLike(fields.quanto) : toNumberLike(getCell(current, block.fields.quanto));
      const devedores = linked.map((l) => l.quem).filter((n) => norm(n) !== norm(newPayer));
      const shares = fin.computeCollectiveShares(newTotal, devedores, ref.incluirPagador);
      if (fields.obs !== undefined || fields.quanto !== undefined || fields.quem !== undefined) {
        const userObs = fields.obs !== undefined ? fields.obs : getCell(current, block.fields.obs);
        fields.obs = fin.collectiveObs(userObs, devedores, newPayer, shares, ref.incluirPagador, ref.id);
      }
      const aBlock = fin.FINANCE_BLOCKS.acerto_individual;
      linked.forEach((l) => {
        const share = shares.find((s) => norm(s.nome) === norm(l.quem));
        if (share) {
          updates.push(...blockFieldUpdates(aBlock, l.row, { deveQuanto: normalizeMoney2(share.valor), paraQuem: newPayer }));
          linkedUpdated += 1;
        }
      });
    } else if (fields.obs !== undefined) {
      fields.obs = fin.mergeLegacyObs(fields.obs, getCell(current, block.fields.obs));
    }
    updates.unshift(...blockFieldUpdates(block, row, fields));
    await writeCells(activeSheet, updates);
    bump('finance');
    return {
      ok: true,
      message: ref ? `Gasto atualizado (${linkedUpdated} acerto(s) recalculado(s)).` : 'Gasto atualizado. Acertos lançados antes da atualização do app não são recalculados automaticamente.',
      linkedUpdated,
      linked: !!ref,
    };
  },

  /** Novo: um ou mais devedores para o mesmo credor, numa única escrita (regra atual: divide o total entre os devedores). */
  async addSettlements(body) {
    const { credor = '', devedores = [], valorTotal = '', obs = '', expectedSheet } = body;
    const paraQuem = String(credor || '').trim();
    const list = Array.from(new Set((devedores || []).map((n) => String(n || '').trim()).filter((n) => n && norm(n) !== norm(paraQuem))));
    const total = toNumberLike(valorTotal);
    if (!paraQuem || !list.length || !Number.isFinite(total) || total <= 0) throw httpError(400, 'Preencha quem deve, quem emprestou e o valor.');
    const { activeSheet, rows } = await readFinanceForWrite(expectedSheet);
    const shares = fin.splitCents(total, list.length);
    const block = fin.FINANCE_BLOCKS.acerto_individual;
    const aRows = findEmptyRows(rows, block, list.length);
    const meta = list.length > 1 ? `Empréstimo dividido: ${list.length} devedor(es) (${brl(shares[0])}/pessoa) • ${list.join(', ')} → ${paraQuem}` : '';
    const finalObs = [String(obs || '').trim(), meta].filter(Boolean).join(' | ');
    const updates = [];
    list.forEach((nome, i) => {
      updates.push(...blockFieldUpdates(block, aRows[i], { quem: nome, deveQuanto: normalizeMoney2(shares[i]), paraQuem, obs: finalObs }));
    });
    await writeCells(activeSheet, updates);
    bump('finance');
    return { ok: true, message: list.length > 1 ? `${list.length} acertos lançados.` : 'Acerto lançado.' };
  },

  /** Novo: quitar acerto = guarda o histórico na aba AcertosQuitados e limpa a linha (mesmo efeito de excluir na aba do mês). */
  async settleAcerto(body) {
    const { rowIndex, expected, usuario = '', expectedSheet } = body;
    const { activeSheet, rows } = await readFinanceForWrite(expectedSheet);
    const { block, row } = resolveFinanceRow(rows, 'acerto_individual', rowIndex, expected);
    const r = rows[row - 1] || [];
    await ensureSheetExists(SETTLED_SHEET, ['quitadoEm', 'quitadoPor', 'mes', 'quem', 'deveQuanto', 'paraQuem', 'obs', 'linhaOriginal']);
    await appendRow(`${SETTLED_SHEET}!A:H`, [
      `${spDateBr()} ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`,
      String(usuario || '').trim(),
      activeSheet,
      getCell(r, block.fields.quem),
      normalizeMoney2(getCell(r, block.fields.deveQuanto)),
      getCell(r, block.fields.paraQuem),
      getCell(r, block.fields.obs),
      row,
    ]);
    const clear = Object.fromEntries(Object.keys(block.fields).map((f) => [f, '']));
    await writeCells(activeSheet, blockFieldUpdates(block, row, clear));
    bump('finance');
    return { ok: true, message: 'Acerto quitado e guardado no histórico.' };
  },

  async rateTask(body) {
    const { actor = '', target = '', tarefa = '', nota, comentario = '', categoria = 'casa' } = body;
    const score = Number(nota);
    const category = String(categoria || 'casa').trim().toLowerCase() === 'banheirao' ? 'banheirao' : 'casa';
    if (!actor || !target || !tarefa || !Number.isFinite(score) || score < 1 || score > 5) throw httpError(400, 'Dados de avaliação inválidos.');
    if (category === 'banheirao' && !feedLib.isBanheiraoTask(tarefa)) throw httpError(400, 'A nota de banheirão só vale para a tarefa de banheiro.');
    if (norm(actor) === norm(target)) throw httpError(400, 'Não dá para avaliar a própria tarefa.');
    await ensureSheetExists(RATINGS_SHEET);
    const wk = weekKey();
    const data = (await readRangeWithFallback(`${RATINGS_SHEET}!A:H`, [], { fresh: true })).slice(1);
    const already = data.some((r) => String(r[0] || '') === wk && norm(r[1]) === norm(actor) && norm(r[2]) === norm(target) && (String(r[7] || 'casa').trim().toLowerCase() || 'casa') === category);
    if (already) throw httpError(400, `Você já avaliou este morador nesta semana (${category === 'banheirao' ? 'banheirão' : 'casa'}).`, { code: 'ALREADY_RATED' });
    const ts = new Date().toISOString();
    await appendRow(`${RATINGS_SHEET}!A:H`, [wk, actor, target, score, tarefa, comentario, ts, category]);
    await ensureSheetExists(TASK_FEED_SHEET);
    await appendRow(`${TASK_FEED_SHEET}!A:H`, [wk, ts, 'rating', actor, target, tarefa, `avaliou ${category} com ${score} estrelas`, '']);
    bump('ratings', 'feed');
    const summary = feedLib.getRatingsSummaryForWeek([...data, [wk, actor, target, score, tarefa, comentario, ts, category]], wk);
    return { ok: true, message: 'Avaliação registrada.', week: wk, summary };
  },

  async addTaskFeedComment(body) {
    const { actor = '', content = '', target = '', tarefa = '', photoDataUrl = '', parentTs = '', parentActor = '' } = body;
    const normalizedActor = String(actor || '').trim();
    const normalizedContent = String(content || '').trim();
    const hasPhoto = String(photoDataUrl || '').trim().length > 0;
    if (!normalizedActor) throw httpError(400, 'actor obrigatório.');
    if (!normalizedContent && !hasPhoto) throw httpError(400, 'Envie um texto ou uma foto para publicar.');
    await ensureSheetExists(TASK_FEED_SHEET);
    const wk = weekKey();
    const ts = new Date().toISOString();
    const savedPhoto = await storePhotoDataUrl(photoDataUrl);
    const isReply = !!String(parentTs || '').trim();
    await appendRow(`${TASK_FEED_SHEET}!A:H`, [
      wk,
      ts,
      isReply ? 'comment_reply' : 'comment',
      normalizedActor,
      isReply ? String(parentTs).trim() : target,
      isReply ? String(parentActor || '').trim() : tarefa,
      normalizedContent || 'publicou uma foto',
      savedPhoto,
    ]);
    bump('feed');
    return { ok: true, message: 'Comentário publicado.', ts };
  },

  /** Novo: check da Nilde compartilhado. Recusa se o horário de hoje já foi marcado por alguém. */
  async checkNilde(body) {
    const { actor = '', slotId = '', comment = '', photoDataUrl = '' } = body;
    const who = feedLib.canonicalResident(actor);
    const slot = feedLib.NILDE_SLOTS.find((s) => s.id === slotId);
    if (!who) throw httpError(400, 'Morador inválido.');
    if (!slot) throw httpError(400, 'Horário inválido.');
    await ensureSheetExists(TASK_FEED_SHEET);
    const today = spDateKey();
    const items = await readFeed({ fresh: true });
    const log = feedLib.buildNildeWeek(items, [today]);
    const existing = log[today]?.[slot.id];
    if (existing) throw httpError(409, `${slot.label} já foi marcado por ${existing.by}.`, { code: 'ALREADY_CHECKED', by: existing.by });
    const ts = new Date().toISOString();
    const savedPhoto = await storePhotoDataUrl(photoDataUrl);
    const text = String(comment || '').trim();
    const content = text ? `Nilde • ${slot.label} • ${text}` : `Nilde • ${slot.label} • alimentação registrada${savedPhoto ? ' com foto' : ''}`;
    await appendRow(`${TASK_FEED_SHEET}!A:H`, [weekKey(), ts, 'comment', who, 'NILDE', slot.label, content, savedPhoto]);
    bump('feed');
    return { ok: true, message: 'Check da Nilde registrado.', ts, slotId: slot.id, by: who };
  },

  async toggleFeedLike(body) {
    const { ts = '', actor = '' } = body;
    const postTs = String(ts || '').trim();
    const who = feedLib.canonicalResident(actor);
    if (!postTs || !who) throw httpError(400, 'Post ou morador inválido.');
    await ensureSheetExists(LIKES_SHEET, ['postTs', 'actor', 'at', 'ativo']);
    const rows = await readRangeOrEmpty(`${LIKES_SHEET}!A:D`, { fresh: true });
    let foundRow = 0;
    let wasActive = false;
    rows.forEach((r, i) => {
      if (getCell(r, 0) === postTs && norm(getCell(r, 1)) === norm(who)) {
        foundRow = i + 1;
        wasActive = norm(getCell(r, 3)) !== 'FALSE';
      }
    });
    const liked = !wasActive;
    if (foundRow) {
      await writeCells(LIKES_SHEET, [{ row: foundRow, col: 2, value: new Date().toISOString() }, { row: foundRow, col: 3, value: liked ? 'TRUE' : 'FALSE' }]);
    } else {
      await appendRow(`${LIKES_SHEET}!A:D`, [postTs, who, new Date().toISOString(), 'TRUE']);
    }
    bump('likes');
    const { byTs } = await readLikes();
    return { ok: true, liked, likes: byTs[postTs] || [] };
  },

  async setProfilePhoto(body) {
    const { nome = '', photoDataUrl = '' } = body;
    const who = feedLib.canonicalResident(nome);
    if (!who) throw httpError(400, 'Morador inválido.');
    const data = String(photoDataUrl || '').trim();
    if (data && data.length > 300000) throw httpError(400, 'Foto de perfil grande demais.');
    await ensureSheetExists(PROFILES_SHEET, ['nome', 'foto', 'atualizadoEm']);
    const saved = await storePhotoDataUrl(data);
    const rows = await readRangeOrEmpty(`${PROFILES_SHEET}!A:C`, { fresh: true });
    const idx = rows.findIndex((r) => norm(getCell(r, 0)) === norm(who));
    const now = new Date().toISOString();
    if (idx >= 0) await writeCells(PROFILES_SHEET, [{ row: idx + 1, col: 1, value: saved }, { row: idx + 1, col: 2, value: now }]);
    else await appendRow(`${PROFILES_SHEET}!A:C`, [who, saved, now]);
    bump('profiles');
    return { ok: true, message: data ? 'Foto de perfil atualizada.' : 'Foto de perfil removida.' };
  },

  async ensureConfig() {
    const created = await ensureSheetExists(CONFIG_SHEET, ['chave', 'valor']);
    if (created) {
      await appendRows(`${CONFIG_SHEET}!A:B`, DEFAULT_CONFIG);
      bump('config');
    } else {
      const rows = await readRangeOrEmpty(`${CONFIG_SHEET}!A:B`, { fresh: true });
      const have = new Set(rows.map((r) => getCell(r, 0)));
      const missing = DEFAULT_CONFIG.filter(([k]) => !have.has(k));
      if (missing.length) {
        await appendRows(`${CONFIG_SHEET}!A:B`, missing);
        bump('config');
      }
    }
    return { ok: true, created, config: await readConfig() };
  },

  /**
   * Exclusão de post: se `requester` vier (app novo), só o autor apaga e avaliações não podem ser apagadas.
   * Sem `requester` mantém o comportamento antigo.
   */
  async deleteTaskFeedPost(body) {
    const { rowIndex, ts = '', actor = '', postActor = '', postContent = '', postType = '', requester = '' } = body;
    await ensureSheetExists(TASK_FEED_SHEET);
    const rows = await readRangeOrEmpty(`${TASK_FEED_SHEET}!A:H`, { fresh: true });
    const hasHeader = String((rows[0] || [])[0] || '').toLowerCase() === 'week';
    const dataStart = hasHeader ? 1 : 0;
    const normalizedTs = String(ts || '').trim();
    let resolvedRow = 0;
    if (normalizedTs) {
      for (let i = dataStart; i < rows.length; i += 1) {
        if (String((rows[i] || [])[1] || '').trim() === normalizedTs) {
          resolvedRow = i + 1;
          break;
        }
      }
    }
    const row = Number(rowIndex);
    if (!resolvedRow && !normalizedTs && Number.isFinite(row) && row >= 1) resolvedRow = row;
    if (!resolvedRow && !normalizedTs && String(actor || '').trim()) {
      for (let i = rows.length - 1; i >= dataStart; i -= 1) {
        if (norm((rows[i] || [])[3]) === norm(actor)) {
          resolvedRow = i + 1;
          break;
        }
      }
    }
    if (!resolvedRow && !normalizedTs && (String(postActor || '').trim() || String(postContent || '').trim())) {
      for (let i = rows.length - 1; i >= dataStart; i -= 1) {
        const r = rows[i] || [];
        const typeOk = !postType || String(r[2] || '').trim().toLowerCase() === String(postType).trim().toLowerCase();
        const actorOk = !postActor || norm(r[3]) === norm(postActor);
        const contentOk = !postContent || String(r[6] || '').trim() === String(postContent).trim();
        if (typeOk && actorOk && contentOk) {
          resolvedRow = i + 1;
          break;
        }
      }
    }
    if (!resolvedRow) throw httpError(404, normalizedTs ? 'Post não encontrado (talvez já tenha sido apagado).' : 'Post não encontrado.');
    const current = rows[resolvedRow - 1] || [];
    if (!current.length || String(current[2] || '') === 'deleted') throw httpError(404, 'Post já foi apagado.');
    if (String(requester || '').trim()) {
      if (String(current[2] || '') === 'rating') throw httpError(403, 'Avaliações anônimas não podem ser apagadas.');
      if (norm(current[3]) !== norm(requester)) throw httpError(403, `Só ${current[3] || 'o autor'} pode apagar esse post.`);
    }
    await updateRange(`${TASK_FEED_SHEET}!A${resolvedRow}:H${resolvedRow}`, ['', '', 'deleted', '', '', '', '[post removido]', '']);
    bump('feed');
    return { ok: true, message: 'Post apagado.' };
  },
};

/* ======================================================================
 * Idempotência: o mesmo requestId nunca grava duas vezes (retry, clique duplo, timeout do cold start)
 * ==================================================================== */

const recentRequests = new Map();
const REQUEST_TTL_MS = 15 * 60 * 1000;

function cleanupRequests() {
  const now = Date.now();
  for (const [key, entry] of recentRequests) if (entry.at + REQUEST_TTL_MS < now) recentRequests.delete(key);
}

async function runPost(body) {
  const action = String(body?.action || '');
  const handler = postActions[action];
  if (!action) throw httpError(400, 'action obrigatória');
  if (!handler) throw httpError(400, `action POST não suportada: ${action}`);
  return withWriteLock(() => handler(body || {}));
}

/* ======================================================================
 * Rotas
 * ==================================================================== */

// gzip das respostas JSON grandes (sem dependência nova: zlib é nativo do Node).
app.use((req, res, next) => {
  if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return next();
  const original = res.json.bind(res);
  res.json = (obj) => {
    const str = JSON.stringify(obj);
    if (str.length < 4096) return original(obj);
    const buf = zlib.gzipSync(str);
    res.set('Content-Encoding', 'gzip');
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Vary', 'Accept-Encoding');
    return res.send(buf);
  };
  return next();
});

function sendError(res, error) {
  const status = error instanceof HttpError ? error.status : 500;
  return res.status(status).json({ ok: false, message: error?.message || 'Erro inesperado.', ...(error?.extra || {}) });
}

app.get('/health', async (_, res) => {
  try {
    await readRange(String(DADOS_RANGE || 'DadosApp!A:C').trim());
    res.json({ ok: true, service: 'tocah-sheets-proxy', sheets: { ok: true, message: 'Planilha conectada.' } });
  } catch (error) {
    res.json({ ok: false, service: 'tocah-sheets-proxy', sheets: { ok: false, message: `Sem conexão com a planilha: ${error?.message || 'erro desconhecido'}` } });
  }
});

/* ======================================================================
 * Página de avaliação aberta pelo e-mail (sem app, sem login: link assinado)
 * ==================================================================== */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nomeCurto = (n) => String(n || '').charAt(0) + String(n || '').slice(1).toLowerCase();
function quandoBR(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const wd = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).replace('.', '');
  const dm = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const hm = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  return `${wd} ${dm}, ${hm}`;
}

function estrelasHtml(nome, sel) {
  let out = '<div class="stars" role="radiogroup">';
  for (let n = 5; n >= 1; n -= 1) {
    const id = `${nome}-${n}`;
    out += `<input type="radio" id="${esc(id)}" name="${esc(nome)}" value="${n}"${Number(sel) === n ? ' checked' : ''} required><label for="${esc(id)}" title="${n} estrela${n > 1 ? 's' : ''}">★</label>`;
  }
  return `${out}</div>`;
}

function paginaAvaliacao({ token, actor, state, rules, msg = '', erro = '', alvoSel = '', notaSel = 0 }) {
  const rated = ciclo.ratedMap(state._rows, actor);
  const prog = state.avaliacoes.porAvaliador[actor] || { total: 0, feitas: 0 };
  const alvos = state.residents.filter((r) => r.status === 'entregue' && r.nome !== actor);
  const podeBan = ciclo.podeAvaliarBanheirao(actor, rules);
  const fotos = (r) => (r.fotos && r.fotos.length ? r.fotos : r.hasPhoto ? [r.checkTs] : []);
  const aberto = state.phase === 'avaliacao';
  const cards = alvos.map((r) => {
    const feito = rated[r.nome] || {};
    const precisaBan = r.banheirao && podeBan;
    const completo = feito.casa && (!precisaBan || feito.banheirao);
    const imgs = fotos(r).map((ts, i) => `<img src="/avaliar/foto?t=${esc(token)}&amp;ts=${encodeURIComponent(ts)}" alt="Foto ${i + 1} da tarefa de ${esc(nomeCurto(r.nome))}" loading="lazy">`).join('');
    const atraso = r.atrasoDias ? `<span class="pill warn">Entregue +${r.atrasoDias} dia${r.atrasoDias > 1 ? 's' : ''}</span>` : '<span class="pill ok">No prazo</span>';
    const destaque = alvoSel === r.nome && !completo ? ' destaque' : '';
    let corpo;
    if (completo) corpo = '<div class="done">✅ Você já avaliou (vale pelo app e pelo e-mail)</div>';
    else if (!aberto) corpo = '<div class="muted">A avaliação não está aberta.</div>';
    else {
      corpo = `<form method="post" action="/avaliar#${esc(r.nome)}">
        <input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="alvo" value="${esc(r.nome)}">
        ${!feito.casa ? `<div class="lbl">${precisaBan ? 'Tarefa' : 'Sua nota'}</div>${estrelasHtml('nota_casa', alvoSel === r.nome ? notaSel : 0)}` : '<div class="muted">Nota da tarefa já dada ✅</div>'}
        ${precisaBan && !feito.banheirao ? `<div class="lbl">Banheirão</div>${estrelasHtml('nota_banheirao', 0)}` : ''}
        ${!feito.casa ? '<textarea name="comentario" maxlength="400" placeholder="Comentário (opcional, anônimo)"></textarea>' : ''}
        <button type="submit">Enviar avaliação</button>
      </form>`;
    }
    return `<section class="card${destaque}" id="${esc(r.nome)}">
      <div class="row"><div class="av">${esc(r.nome.charAt(0))}</div><div class="grow"><div class="ov">${esc(r.nome)}</div><div class="tt">${esc(r.tarefa)}${r.extra ? ' + Banheirão' : ''}</div></div>${atraso}</div>
      <div class="fotos">${imgs || '<div class="muted">Sem foto</div>'}</div>
      <div class="muted small">Entregue ${esc(quandoBR(r.entregueEm))}${fotos(r).length > 1 ? ` · ${fotos(r).length} fotos` : ''}</div>
      ${corpo}
    </section>`;
  }).join('');
  const faltaram = state.residents.filter((r) => r.status !== 'entregue' && r.nome !== actor);
  const titulo = state.phase === 'encerrada' ? 'Avaliação encerrada' : state.phase === 'entregas' ? 'Avaliação ainda não abriu' : prog.feitas >= prog.total ? 'Você avaliou todo mundo 🎉' : `Faltam ${prog.total - prog.feitas} de ${prog.total} notas`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Avaliação da semana · Tocah</title><style>
:root{--bg:#F6F4FA;--sf:#fff;--alt:#F3EFF8;--tx:#1C1A26;--mu:#625D75;--su:#8F8AA3;--bd:#E7E2EF;--p:#6A1B9A;--ps:#F2E7F9;--ops:#55137E;--ok:#E4F4EA;--oko:#14663A;--wa:#FCF0DA;--wao:#7A4700;--da:#FBE6E8;--dao:#951E28;--star:#F5A524}
@media (prefers-color-scheme:dark){:root{--bg:#110F17;--sf:#1B1924;--alt:#23202E;--tx:#F3F0FA;--mu:#B3ADC4;--su:#827C96;--bd:#2D2939;--p:#C894EA;--ps:#2E2140;--ops:#E6CFF6;--ok:#17301F;--oko:#9BE6BA;--wa:#352813;--wao:#F8D49C;--da:#3A1A20;--dao:#FFB3BA}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:600}
.wrap{max-width:560px;margin:0 auto;padding:16px 14px 40px}
.hero{border-radius:26px;padding:20px;color:#fff;background:linear-gradient(135deg,#6A1B9A,#4A148C)}
.ov{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--su)}.hero .ov{color:rgba(255,255,255,.78)}
h1{margin:4px 0 6px;font-size:22px;font-weight:900}.hero p{margin:0;font-size:14px;line-height:1.5;opacity:.92}
.bar{height:8px;border-radius:99px;background:rgba(255,255,255,.25);margin-top:12px;overflow:hidden}.bar div{height:100%;background:#fff}
.msg{margin:12px 0 0;padding:12px 14px;border-radius:16px;font-size:14px}.msg.ok{background:var(--ok);color:var(--oko)}.msg.err{background:var(--da);color:var(--dao)}
.card{background:var(--sf);border:1px solid var(--bd);border-radius:22px;padding:16px;margin-top:12px}.card.destaque{border:2px solid var(--p)}
.row{display:flex;align-items:center;gap:12px}.grow{flex:1;min-width:0}.tt{font-size:17px;font-weight:900}
.av{width:44px;height:44px;border-radius:50%;background:var(--ps);color:var(--ops);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;flex:none}
.pill{padding:5px 10px;border-radius:99px;font-size:11px;font-weight:800;white-space:nowrap}.pill.ok{background:var(--ok);color:var(--oko)}.pill.warn{background:var(--wa);color:var(--wao)}
.fotos{display:flex;gap:8px;overflow-x:auto;margin-top:12px;scroll-snap-type:x mandatory}.fotos img{width:100%;max-width:100%;flex:none;border-radius:16px;aspect-ratio:4/3;object-fit:cover;background:var(--alt);scroll-snap-align:start}
.fotos img+img{width:85%}
.muted{color:var(--mu);font-size:14px}.small{font-size:12px;margin-top:6px}
.lbl{margin-top:14px;text-align:center;font-size:12px;font-weight:800;color:var(--mu)}
.stars{display:flex;flex-direction:row-reverse;justify-content:center;gap:4px}.stars input{position:absolute;opacity:0;width:1px;height:1px}
.stars label{font-size:40px;line-height:1;color:var(--bd);cursor:pointer;padding:2px 4px;min-width:44px;text-align:center}
.stars input:checked~label,.stars label:hover,.stars label:hover~label{color:var(--star)}.stars input:focus-visible+label{outline:2px solid var(--p);border-radius:8px}
textarea{width:100%;margin-top:10px;min-height:70px;border-radius:14px;border:1px solid var(--bd);background:var(--alt);color:var(--tx);padding:10px 12px;font:inherit;font-size:16px}
button{width:100%;margin-top:10px;min-height:48px;border:0;border-radius:16px;background:var(--p);color:#fff;font:inherit;font-weight:900;font-size:15px;cursor:pointer}
@media (prefers-color-scheme:dark){button{color:#1D0F29}}
.done{margin-top:12px;padding:12px;border-radius:14px;background:var(--ok);color:var(--oko);font-weight:800;text-align:center}
.foot{margin-top:18px;text-align:center;font-size:12px;color:var(--su)}a{color:var(--p);font-weight:800}
</style></head><body><div class="wrap">
<div class="hero"><div class="ov">Avaliação da semana ${esc(state.periodo)}</div><h1>${esc(titulo)}</h1>
<p>Oi, ${esc(nomeCurto(actor))}! Notas de 1 a 5, anônimas. ${state.phase === 'avaliacao' ? `Fecha ${esc(quandoBR(state.fechamento))} (ou antes, se todos avaliarem).` : ''} Tudo que você der aqui aparece no app na hora.</p>
<div class="bar"><div style="width:${prog.total ? Math.round((prog.feitas / prog.total) * 100) : 100}%"></div></div></div>
${msg ? `<div class="msg ok" role="status">${esc(msg)}</div>` : ''}${erro ? `<div class="msg err" role="alert">${esc(erro)}</div>` : ''}
${cards || '<section class="card"><div class="muted">Ninguém para avaliar ainda.</div></section>'}
${faltaram.length ? `<section class="card"><div class="ov">Sem avaliação</div><div class="muted" style="margin-top:6px">${faltaram.map((r) => `${esc(nomeCurto(r.nome))} (${r.status === 'dispensado' ? 'dispensado' : 'não entregou'})`).join(', ')}</div></section>` : ''}
<div class="foot">🐰 República Tocah do Coelho · <a href="https://guidelluca.github.io/tocah-do-coelho-app/">abrir o app</a><br>A página se atualiza sozinha se você avaliar pelo app.</div>
</div>
<script>
(function(){var t=${JSON.stringify(token)},last=null;
function tick(){if(document.activeElement&&/TEXTAREA|INPUT/.test(document.activeElement.tagName))return;
fetch('/avaliar/estado?t='+encodeURIComponent(t)).then(function(r){return r.json()}).then(function(j){var k=j.phase+'|'+j.feitas+'|'+j.total;if(last&&k!==last)location.replace(location.pathname+'?t='+encodeURIComponent(t));last=k;}).catch(function(){});}
tick();setInterval(tick,15000);
var a=document.querySelector('.card.destaque');if(a)a.scrollIntoView({block:'center'});})();
</script></body></html>`;
}

async function carregarParaPagina(token) {
  const tk = readAvaliacaoToken(token);
  if (!tk) throw httpError(403, 'Link inválido ou incompleto. Abra pelo e-mail mais recente ou pelo app.');
  const ctx = await avaliacaoContext({ fresh: true });
  const state = await cycleState(ctx, tk.ciclo);
  return { ...tk, state, rules: ctx.rules };
}

function paginaErro(res, status, texto) {
  res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tocah</title></head>
<body style="margin:0;background:#F6F4FA;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-weight:600;color:#1C1A26"><div style="max-width:520px;margin:40px auto;padding:0 16px">
<div style="border-radius:26px;padding:22px;color:#fff;background:linear-gradient(135deg,#6A1B9A,#4A148C)"><div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Tocah</div>
<div style="font-size:20px;font-weight:900;margin-top:4px">${esc(texto)}</div></div>
<p style="text-align:center"><a style="color:#6A1B9A;font-weight:800" href="https://guidelluca.github.io/tocah-do-coelho-app/">Abrir o app</a></p></div></body></html>`);
}

app.get('/avaliar', async (req, res) => {
  rememberBase(req);
  try {
    const d = await carregarParaPagina(String(req.query.t || ''));
    const alvoSel = feedLib.canonicalResident(req.query.alvo) || '';
    const notaSel = Math.max(0, Math.min(5, Number(req.query.nota) || 0));
    res.set('Cache-Control', 'no-store').set('Content-Type', 'text/html; charset=utf-8');
    res.send(paginaAvaliacao({ token: String(req.query.t), actor: d.actor, state: d.state, rules: d.rules, msg: req.query.ok ? `Nota de ${nomeCurto(req.query.ok)} enviada ✅` : '', erro: String(req.query.erro || ''), alvoSel, notaSel }));
  } catch (error) {
    paginaErro(res, error.status || 500, error.message || 'Não deu para abrir a avaliação.');
  }
});

app.post('/avaliar', async (req, res) => {
  const token = String(req.body?.t || '');
  const tk = readAvaliacaoToken(token);
  if (!tk) return paginaErro(res, 403, 'Link inválido.');
  const alvo = feedLib.canonicalResident(req.body?.alvo);
  const back = (q) => res.redirect(303, `/avaliar?t=${encodeURIComponent(token)}&${q}#${alvo || ''}`);
  try {
    const notas = [['casa', req.body?.nota_casa], ['banheirao', req.body?.nota_banheirao]].filter(([, v]) => v !== undefined && v !== '');
    if (!notas.length) return back(`erro=${encodeURIComponent('Escolha as estrelas antes de enviar.')}`);
    for (const [categoria, nota] of notas) {
      try {
        await withWriteLock(() => registrarAvaliacao({ actor: tk.actor, target: alvo, ciclo: tk.ciclo, nota: Number(nota), categoria, comentario: categoria === 'casa' ? req.body?.comentario : '' }, { origem: 'email' }));
      } catch (e) {
        if (e?.extra?.code !== 'ALREADY_RATED') throw e;
      }
    }
    return back(`ok=${encodeURIComponent(alvo)}`);
  } catch (error) {
    return back(`erro=${encodeURIComponent(error.message || 'Não deu para salvar.')}`);
  }
});

app.get('/avaliar/estado', async (req, res) => {
  try {
    const d = await carregarParaPagina(String(req.query.t || ''));
    const prog = d.state.avaliacoes.porAvaliador[d.actor] || { total: 0, feitas: 0 };
    res.set('Cache-Control', 'no-store').json({ ok: true, phase: d.state.phase, ...prog, casa: d.state.avaliacoes });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/avaliar/foto', async (req, res) => {
  try {
    const tk = readAvaliacaoToken(String(req.query.t || ''));
    if (!tk) throw httpError(403, 'Link inválido.');
    const ts = String(req.query.ts || '');
    const items = await readFeed();
    const item = items.find((x) => x.ts === ts && (x.type === 'check' || x.type === 'check_photo'));
    if (!item || !item.photoDataUrl || feedItemCycle(item) !== tk.ciclo) throw httpError(404, 'Foto não encontrada.');
    const [h] = await hydratePhotos([item]);
    const m = String(h.photoDataUrl || '').match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    if (!m) throw httpError(404, 'Foto não encontrada.');
    res.set('Content-Type', m[1]).set('Cache-Control', 'private, max-age=86400').send(Buffer.from(m[2], 'base64'));
  } catch (error) {
    res.status(error.status || 500).end();
  }
});

app.get('/api', async (req, res) => {
  const action = String(req.query?.action || '');
  try {
    if (!action) throw httpError(400, 'action obrigatória');
    const handler = getActions[action];
    if (!handler) throw httpError(400, `action GET não suportada: ${action}`);
    rememberBase(req);
    const body = await handler(req.query || {});
    if (action === 'getFeedPhoto' && body?.photoDataUrl) res.set('Cache-Control', 'public, max-age=86400');
    else res.set('Cache-Control', 'no-store');
    return res.json(body);
  } catch (error) {
    return sendError(res, error);
  }
});

app.post('/api', async (req, res) => {
  const body = req.body || {};
  const requestId = String(body.requestId || '').trim();
  try {
    if (requestId) {
      cleanupRequests();
      const seen = recentRequests.get(requestId);
      if (seen) {
        const result = await seen.promise;
        return res.json({ ...result, deduplicated: true });
      }
      const promise = runPost(body);
      recentRequests.set(requestId, { at: Date.now(), promise });
      try {
        return res.json(await promise);
      } catch (error) {
        recentRequests.delete(requestId); // erro não fica "travado": pode tentar de novo
        throw error;
      }
    }
    return res.json(await runPost(body));
  } catch (error) {
    return sendError(res, error);
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Tocah proxy ativo na porta ${PORT}`);
  });
}

module.exports = { app, getActions, postActions };
