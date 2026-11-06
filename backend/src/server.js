const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const zlib = require('zlib');
const { google } = require('googleapis');

const { getCell, norm, toNumberLike, normalizeMoney2, colLetter, brl } = require('./lib/text');
const { weekKey, spDateBr, spDateKey, spWeekDays, getSaoPauloYearMonth, tsToDate } = require('./lib/time');
const fin = require('./lib/finance');
const feedLib = require('./lib/feed');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));

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
const versions = { finance: 1, caixinha: 1, feed: 1, ratings: 1, likes: 1, profiles: 1, config: 1 };
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
      .filter((x) => feedLib.itemWeek(x) === effectiveWeek && x.type !== 'deleted')
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

app.get('/api', async (req, res) => {
  const action = String(req.query?.action || '');
  try {
    if (!action) throw httpError(400, 'action obrigatória');
    const handler = getActions[action];
    if (!handler) throw httpError(400, `action GET não suportada: ${action}`);
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
