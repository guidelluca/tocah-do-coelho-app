const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { google } = require('googleapis');

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
  FINANCE_SHEET = 'ABR_2026',
  RATINGS_SHEET = 'AvaliacoesTarefas',
  TASK_FEED_SHEET = 'TarefasFeed',
  ADMIN_LOG_SHEET = 'AdminLogs',
  TASK_PHOTOS_SHEET = 'TarefasFotos',
} = process.env;
const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const RESIDENTS = ['ALLAN', 'RAMON', 'VITOR', 'GUSTAVO', 'GUILHERME'];
const MAX_SHEET_CELL_CHARS = 45000;

function badRequest(res, message) {
  return res.status(400).json({ ok: false, message });
}

function getCell(row = [], idx) {
  return String(row[idx] ?? '').trim();
}

function findRowIndex(rows, predicate, from = 0) {
  for (let i = from; i < rows.length; i += 1) {
    if (predicate(rows[i] || [], i)) return i;
  }
  return -1;
}

function parseFinanceSnapshot(rows) {
  // Header expected around columns B..O
  const headerIdx = findRowIndex(rows, (r) => getCell(r, 2).toLowerCase() === 'aluguel' && getCell(r, 14).toLowerCase() === 'total');
  const totalRowIdx = findRowIndex(rows, (r, i) => i > headerIdx && getCell(r, 1).toUpperCase() === 'TOTAL');

  const residents = [];
  if (headerIdx >= 0 && totalRowIdx > headerIdx) {
    for (let i = headerIdx + 1; i < totalRowIdx; i += 1) {
      const r = rows[i] || [];
      const nome = getCell(r, 1);
      if (!nome) continue;
      residents.push({
        rowIndex: i + 1,
        nome,
        aluguel: getCell(r, 2),
        agua: getCell(r, 3),
        luz: getCell(r, 4),
        net: getCell(r, 5),
        iptu: getCell(r, 6),
        sofa: getCell(r, 7),
        dryWall: getCell(r, 8),
        caixinha: getCell(r, 9),
        subtotal: getCell(r, 10),
        multas: getCell(r, 11),
        contaQuePaga: getCell(r, 12),
        dividas: getCell(r, 13),
        total: getCell(r, 14), // coluna O
      });
    }
  }

  const contasHeaderIdx = findRowIndex(rows, (r) => getCell(r, 1).toLowerCase() === 'conta' && getCell(r, 2).toLowerCase() === 'valor');
  const contas = [];
  if (contasHeaderIdx >= 0) {
    for (let i = contasHeaderIdx + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const conta = getCell(r, 1);
      const valor = getCell(r, 2);
      if (!conta && !valor) break;
      if (!conta) continue;
      contas.push({
        rowIndex: i + 1,
        conta,
        valor,
        divisao: getCell(r, 3),
        vencimento: getCell(r, 4),
        status: getCell(r, 5),
      });
    }
  }

  const coletivosHeaderIdx = findRowIndex(rows, (r) => getCell(r, 9).toUpperCase() === 'QUEM' && getCell(r, 10).toUpperCase() === 'QUANTO');
  const gastosColetivos = [];
  if (coletivosHeaderIdx >= 0) {
    for (let i = coletivosHeaderIdx + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const quem = getCell(r, 9);
      const quanto = getCell(r, 10);
      if (!quem && !quanto) break;
      if (!quem || !quanto) continue;
      gastosColetivos.push({
        rowIndex: i + 1,
        quem,
        quanto,
        oQue: getCell(r, 11),
        obs: getCell(r, 12),
      });
    }
  }

  const acertosHeaderIdx = findRowIndex(rows, (r) => getCell(r, 19).toUpperCase() === 'QUEM' && getCell(r, 20).toUpperCase().includes('DEVE'));
  const acertosIndividuais = [];
  if (acertosHeaderIdx >= 0) {
    for (let i = acertosHeaderIdx + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const quem = getCell(r, 19);
      const deveQuanto = getCell(r, 20);
      if (!quem && !deveQuanto) break;
      if (!quem || !deveQuanto) continue;
      acertosIndividuais.push({
        rowIndex: i + 1,
        quem,
        deveQuanto,
        paraQuem: getCell(r, 21),
        obs: getCell(r, 22),
      });
    }
  }

  return { residents, contas, gastosColetivos, acertosIndividuais };
}

function findFirstEmptyByCol(rows, colIdx, from, to) {
  for (let i = from; i <= to; i += 1) {
    if (!getCell(rows[i] || [], colIdx)) return i;
  }
  return -1;
}

async function updateRange(range, values) {
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

async function getSheetsApi() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID nao configurado.');
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON nao configurado.');
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function readRange(range) {
  const sheets = await getSheetsApi();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  return res.data.values || [];
}

async function appendRow(range, values) {
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

async function ensureSheetExists(sheetName) {
  const titles = await getSpreadsheetTitles();
  if (titles.includes(sheetName)) return;
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  });
}

async function readRangeWithFallback(primaryRange, fallbackRanges = []) {
  try {
    return await readRange(primaryRange);
  } catch (error) {
    const isInvalidRange = String(error?.message || '').toLowerCase().includes('unable to parse range');
    if (!isInvalidRange) throw error;
    for (const range of fallbackRanges) {
      try {
        return await readRange(range);
      } catch {
        // Try next fallback.
      }
    }
    throw error;
  }
}

async function readRangeOrEmpty(range) {
  try {
    return await readRange(range);
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    if (msg.includes('unable to parse range')) return [];
    throw error;
  }
}

function parseMonthSheetTitle(title) {
  const m = String(title || '').match(/^([A-Za-zÇç]{3})_(\d{4})$/);
  if (!m) return null;
  const mon = m[1].toUpperCase();
  const year = Number(m[2]);
  const monthIdx = MONTHS_PT.indexOf(mon);
  if (monthIdx < 0) return null;
  return { title, year, monthIdx };
}

async function getSpreadsheetTitles() {
  const sheets = await getSheetsApi();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties.title',
  });
  return (res.data.sheets || []).map((s) => String(s.properties?.title || '').trim()).filter(Boolean);
}

async function resolveActiveFinanceSheet() {
  const titles = await getSpreadsheetTitles();
  const now = new Date();
  const currentName = `${MONTHS_PT[now.getMonth()]}_${now.getFullYear()}`;
  if (titles.includes(currentName)) return currentName;
  if (titles.includes(FINANCE_SHEET)) return FINANCE_SHEET;
  const parsed = titles.map(parseMonthSheetTitle).filter(Boolean);
  if (!parsed.length) return FINANCE_SHEET;
  parsed.sort((a, b) => (a.year === b.year ? b.monthIdx - a.monthIdx : b.year - a.year));
  return parsed[0].title;
}

function toNumberLike(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let normalized = text.replace(/[^\d,.-]/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 || lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = normalized.split(thousandSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeMoney2(value) {
  const n = toNumberLike(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

function extractTaskForUser(rows = [], usuario = '') {
  const target = String(usuario || '').trim().toLowerCase();
  if (!target) return 'Sala, Corredor e Garagem';
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      if (String(row[i] || '').trim().toLowerCase() === target) {
        for (let j = i + 1; j < row.length; j += 1) {
          const v = String(row[j] || '').trim();
          if (v && !['allan', 'ramon', 'vitor', 'gustavo', 'guilherme'].includes(v.toLowerCase())) return v;
        }
      }
    }
  }
  return 'Sala, Corredor e Garagem';
}

function extractScale(rows = []) {
  const result = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      const maybeName = String(row[i] || '').trim();
      const isResident = RESIDENTS.map((x) => x.toLowerCase()).includes(maybeName.toLowerCase());
      if (isResident) {
        let task = '-';
        for (let j = i + 1; j < row.length; j += 1) {
          const v = String(row[j] || '').trim();
          if (v && !RESIDENTS.map((x) => x.toLowerCase()).includes(v.toLowerCase())) {
            task = v;
            break;
          }
        }
        result.push({ nome: maybeName, tarefa: task });
        break;
      }
    }
  }
  return result;
}

function defaultScale() {
  return [
    { nome: 'ALLAN', tarefa: 'Quintal + Coelha Nilde' },
    { nome: 'RAMON', tarefa: 'Lavanderia e Panos' },
    { nome: 'VITOR', tarefa: 'Lixo Diario' },
    { nome: 'GUSTAVO', tarefa: 'Cozinha' },
    { nome: 'GUILHERME', tarefa: 'Sala, Corredor e Garagem' },
  ];
}

function isBanheiraoTask(task = '') {
  return String(task || '').toLowerCase().includes('banheir');
}

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getRatingsSummaryForWeek(rows, wk) {
  const map = {};
  const expected = Math.max(1, RESIDENTS.length - 1);
  for (const r of rows) {
    const week = String(r[0] || '');
    const target = String(r[2] || '').trim();
    const nota = Number(r[3]);
    const categoria = String(r[7] || 'casa').trim().toLowerCase() || 'casa';
    if (week !== wk || !target || !Number.isFinite(nota)) continue;
    if (!map[target]) {
      map[target] = {
        casa: { total: 0, soma: 0, media: 0 },
        banheirao: { total: 0, soma: 0, media: 0 },
        geral: { total: 0, soma: 0, media: 0 },
        expectedEvaluators: expected,
      };
    }
    const bucket = categoria === 'banheirao' ? 'banheirao' : 'casa';
    map[target][bucket].total += 1;
    map[target][bucket].soma += nota;
    map[target][bucket].media = map[target][bucket].soma / map[target][bucket].total;
    map[target].geral.total += 1;
    map[target].geral.soma += nota;
    map[target].geral.media = map[target].geral.soma / map[target].geral.total;
  }
  return map;
}

function parseCaixinhaStatement(rows = []) {
  const items = [];
  for (const row of rows) {
    const data = getCell(row, 0);
    const descricao = getCell(row, 1);
    const valor = getCell(row, 2);
    const obs = getCell(row, 3);
    const descLow = descricao.toLowerCase();
    const valueLow = valor.toLowerCase();
    if (!descricao || descLow === 'descrição' || descLow === 'descricao' || descLow === 'total') continue;
    if (!valor || valueLow === 'valor da caixinha [$]') continue;
    items.push({ data, descricao, valor, obs, tipo: toNumberLike(valor) < 0 ? 'saida' : 'entrada' });
  }
  return items.reverse();
}

function createPhotoRefId() {
  return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function storeTaskPhotoDataUrl(photoDataUrl = '') {
  const dataUrl = String(photoDataUrl || '').trim();
  if (!dataUrl) return '';
  if (dataUrl.length <= MAX_SHEET_CELL_CHARS) return dataUrl;
  await ensureSheetExists(TASK_PHOTOS_SHEET);
  const id = createPhotoRefId();
  const totalChunks = Math.ceil(dataUrl.length / MAX_SHEET_CELL_CHARS);
  const ts = new Date().toISOString();
  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * MAX_SHEET_CELL_CHARS;
    const end = start + MAX_SHEET_CELL_CHARS;
    const chunk = dataUrl.slice(start, end);
    await appendRow(`${TASK_PHOTOS_SHEET}!A:E`, [id, i + 1, totalChunks, chunk, ts]);
  }
  return `PHOTO_REF:${id}`;
}

async function hydrateTaskFeedPhotos(feed = []) {
  const refs = Array.from(
    new Set(
      feed
        .map((item) => String(item?.photoDataUrl || ''))
        .filter((raw) => raw.startsWith('PHOTO_REF:'))
        .map((raw) => raw.replace('PHOTO_REF:', '').trim())
        .filter(Boolean)
    )
  );
  if (!refs.length) return feed;
  const photoRows = await readRangeOrEmpty(`${TASK_PHOTOS_SHEET}!A:E`);
  const chunksById = {};
  for (const row of photoRows) {
    const id = String(row[0] || '').trim();
    if (!id || !refs.includes(id)) continue;
    const idx = Number(row[1] || 0);
    const chunk = String(row[3] || '');
    if (!idx || !chunk) continue;
    if (!chunksById[id]) chunksById[id] = [];
    chunksById[id].push({ idx, chunk });
  }

  const hydratedMap = {};
  for (const id of refs) {
    const chunks = (chunksById[id] || []).sort((a, b) => a.idx - b.idx);
    hydratedMap[id] = chunks.map((c) => c.chunk).join('');
  }

  return feed.map((item) => {
    const raw = String(item?.photoDataUrl || '');
    if (!raw.startsWith('PHOTO_REF:')) return item;
    const id = raw.replace('PHOTO_REF:', '').trim();
    return { ...item, photoDataUrl: hydratedMap[id] || '' };
  });
}

app.get('/health', (_, res) => {
  res.json({ ok: true, service: 'tocah-sheets-proxy' });
});

app.get('/api', async (req, res) => {
  const { action, usuario } = req.query;
  try {
    if (!action) return badRequest(res, 'action obrigatoria');

    if (action === 'getDados') {
      const activeFinanceSheet = await resolveActiveFinanceSheet();
      const rows = await readRangeWithFallback(`${activeFinanceSheet}!A:Z`, ['ABR_2026!A:Z', 'MAR_2026!A:Z']);
      const target = String(usuario || '').trim().toLowerCase();
      let aluguel = '--';
      let nome = usuario || 'Morador';
      for (const r of rows) {
        const resident = getCell(r, 1);
        if (resident && resident.toLowerCase() === target) {
          nome = resident;
          aluguel = getCell(r, 14) || '--'; // coluna O
          break;
        }
      }
      return res.json({ nome, aluguel, mesReferencia: activeFinanceSheet });
    }

    if (action === 'getCaixinha') {
      const rows = await readRangeWithFallback(CAIXINHA_RANGE, ['Caixinha!C2', 'DadosApp!E2']);
      const saldo = String(rows?.[0]?.[0] ?? '0,00');
      return res.json({ saldo, extratoHint: 'Clique para ver o extrato' });
    }

    if (action === 'getCaixinhaStatement') {
      const rows = await readRangeWithFallback('Caixinha!A:D', ['Caixinha!A:Z']);
      return res.json({ ok: true, items: parseCaixinhaStatement(rows) });
    }

    if (action === 'getTarefaSemana') {
      let rows = [];
      try {
        rows = await readRangeWithFallback(TAREFA_RANGE, ['Escala do Mês!A:Z', 'Tarefas!A:Z']);
      } catch {
        rows = [];
      }
      return res.json({
        tarefaNome: extractTaskForUser(rows, usuario),
        descricao: 'Varrer, tirar lixos e organizar.',
        concluida: false,
      });
    }

    if (action === 'getEscalaSemana') {
      let rows = [];
      try {
        rows = await readRangeWithFallback(TAREFA_RANGE, ['Escala do Mês!A:Z', 'Tarefas!A:Z']);
      } catch {
        rows = [];
      }
      const escala = extractScale(rows);
      return res.json(escala.length ? escala : defaultScale());
    }

    if (action === 'getTaskRatings') {
      const wk = weekKey();
      const rows = await readRangeOrEmpty(`${RATINGS_SHEET}!A:H`);
      const data = rows.slice(1);
      const ratings = getRatingsSummaryForWeek(data, wk);
      const history = {};
      for (const r of data) {
        const week = String(r[0] || '');
        if (!week) continue;
        if (!history[week]) history[week] = getRatingsSummaryForWeek(data, week);
      }
      return res.json({ ok: true, week: wk, ratings, history });
    }

    if (action === 'getTaskFeed') {
      const rows = await readRangeOrEmpty(`${TASK_FEED_SHEET}!A:H`);
      const first = rows[0] || [];
      const hasHeader = String(first[0] || '').toLowerCase() === 'week';
      const data = hasHeader ? rows.slice(1) : rows;
      const baseRowIndex = hasHeader ? 2 : 1;
      const wk = weekKey();
      let feed = data
        .map((r, idx) => ({
          rowIndex: baseRowIndex + idx,
          week: String(r[0] || ''),
          ts: String(r[1] || ''),
          type: String(r[2] || ''),
          actor: String(r[3] || ''),
          target: String(r[4] || ''),
          tarefa: String(r[5] || ''),
          content: String(r[6] || ''),
          photoDataUrl: String(r[7] || ''),
        }))
        .filter((x) => x.week === wk)
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      feed = feed.map((item) => {
        if (item.type !== 'rating') return item;
        return {
          ...item,
          actor: 'Avaliador anonimo',
          content: item.content ? `avaliou ${item.tarefa ? `(${item.tarefa}) ` : ''}de forma anonima` : 'avaliacao anonima',
        };
      });
      feed = await hydrateTaskFeedPhotos(feed);
      return res.json({ ok: true, week: wk, feed });
    }

    if (action === 'getFinanceSnapshot') {
      const activeFinanceSheet = await resolveActiveFinanceSheet();
      const rows = await readRangeWithFallback(`${activeFinanceSheet}!A:Z`, ['ABR_2026!A:Z', 'MAR_2026!A:Z']);
      const parsed = parseFinanceSnapshot(rows);
      return res.json({ ok: true, mesReferencia: activeFinanceSheet, ...parsed });
    }

    return badRequest(res, `action GET nao suportada: ${action}`);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api', async (req, res) => {
  const { action } = req.body || {};
  try {
    if (!action) return badRequest(res, 'action obrigatoria');
    if (action === 'concluirTarefa') {
      const { tarefaNome = '', usuario = 'Morador', photoDataUrl = '' } = req.body || {};
      await ensureSheetExists(TASK_FEED_SHEET);
      const wk = weekKey();
      const ts = new Date().toISOString();
      const savedPhoto = await storeTaskPhotoDataUrl(photoDataUrl);
      await appendRow(`${TASK_FEED_SHEET}!A:H`, [wk, ts, 'check', usuario, usuario, tarefaNome, 'concluiu a tarefa da semana', savedPhoto]);
      return res.json({ ok: true, message: 'Tarefa concluida registrada.' });
    }
    if (action === 'dispararCobrancaAluguel' || action === 'cobrarAtrasados') {
      await ensureSheetExists(ADMIN_LOG_SHEET);
      const ts = new Date().toISOString();
      await appendRow(`${ADMIN_LOG_SHEET}!A:D`, [ts, action, 'ADMIN', 'executado pelo app']);
      return res.json({ ok: true, message: `Acao ${action} registrada na planilha.` });
    }
    if (action === 'addCaixinhaEntry') {
      const { tipo = 'entrada', descricao = '', valor = '', obs = '' } = req.body || {};
      if (!descricao || valor === '') return badRequest(res, 'descricao e valor obrigatorios');
      const numeric = toNumberLike(valor);
      if (!Number.isFinite(numeric)) return badRequest(res, 'valor invalido');
      const signed = tipo === 'saida' ? -Math.abs(numeric) : Math.abs(numeric);
      const date = new Date().toLocaleDateString('pt-BR');
      await appendRow('Caixinha!A:D', [date, descricao, signed, obs]);
      return res.json({ ok: true, message: 'Movimentacao adicionada na caixinha.' });
    }
    if (action === 'addFinanceEntry') {
      const { entryType, usuario = '', payload = {} } = req.body || {};
      const activeFinanceSheet = await resolveActiveFinanceSheet();
      const rows = await readRangeWithFallback(`${activeFinanceSheet}!A:Z`, ['ABR_2026!A:Z', 'MAR_2026!A:Z']);

      if (entryType === 'conta_fixa') {
        const headerIdx = findRowIndex(rows, (r) => getCell(r, 1).toLowerCase() === 'conta' && getCell(r, 2).toLowerCase() === 'valor');
        const start = headerIdx >= 0 ? headerIdx + 1 : 1;
        const rowIdx = findFirstEmptyByCol(rows, 1, start, Math.min(rows.length + 80, start + 400));
        if (rowIdx < 0) return badRequest(res, 'Nao foi possivel encontrar linha vazia para conta.');
        await updateRange(`${activeFinanceSheet}!B${rowIdx + 1}:F${rowIdx + 1}`, [
          payload.conta || payload.descricao || 'Conta',
          normalizeMoney2(payload.valor),
          payload.divisao || '',
          payload.vencimento || '',
          payload.status || 'FALSE',
        ]);
        return res.json({ ok: true, message: 'Conta fixa adicionada.' });
      }

      if (entryType === 'gasto_coletivo') {
        const headerIdx = findRowIndex(rows, (r) => getCell(r, 9).toUpperCase() === 'QUEM' && getCell(r, 10).toUpperCase() === 'QUANTO');
        const start = headerIdx >= 0 ? headerIdx + 1 : 1;
        const rowIdx = findFirstEmptyByCol(rows, 9, start, Math.min(rows.length + 120, start + 500));
        if (rowIdx < 0) return badRequest(res, 'Nao foi possivel encontrar linha vazia para gasto coletivo.');
        const payer = String(usuario || payload.quem || '').trim();
        const selected = Array.isArray(payload.dividirCom) ? payload.dividirCom : [];
        const participants = Array.from(
          new Set(
            [payer, ...selected]
              .map((name) => String(name || '').trim())
              .filter(Boolean)
          )
        );
        const totalValue = toNumberLike(payload.valor || payload.quanto || '');
        const shouldCreateIndividualSettlements = participants.length > 1 && Number.isFinite(totalValue);

        await updateRange(`${activeFinanceSheet}!J${rowIdx + 1}:M${rowIdx + 1}`, [
          payer,
          normalizeMoney2(payload.valor || payload.quanto),
          payload.oQue || payload.descricao || '',
          payload.obs || '',
        ]);

        if (shouldCreateIndividualSettlements) {
          const acertosHeaderIdx = findRowIndex(rows, (r) => getCell(r, 19).toUpperCase() === 'QUEM' && getCell(r, 20).toUpperCase().includes('DEVE'));
          const acertosStart = acertosHeaderIdx >= 0 ? acertosHeaderIdx + 1 : 1;
          const eachValue = totalValue / participants.length;
          const debtors = participants.filter((name) => name.toUpperCase() !== payer.toUpperCase());

          for (const debtor of debtors) {
            const acertoRowIdx = findFirstEmptyByCol(rows, 19, acertosStart, Math.min(rows.length + 220, acertosStart + 700));
            if (acertoRowIdx < 0) break;
            await updateRange(`${activeFinanceSheet}!T${acertoRowIdx + 1}:W${acertoRowIdx + 1}`, [
              debtor,
              normalizeMoney2(eachValue),
              payer,
              payload.obs || '',
            ]);
            rows[acertoRowIdx] = rows[acertoRowIdx] || [];
            rows[acertoRowIdx][19] = debtor;
            rows[acertoRowIdx][20] = normalizeMoney2(eachValue);
            rows[acertoRowIdx][21] = payer;
            rows[acertoRowIdx][22] = payload.obs || '';
          }
        }
        return res.json({ ok: true, message: 'Gasto coletivo adicionado.' });
      }

      if (entryType === 'acerto_individual') {
        const headerIdx = findRowIndex(rows, (r) => getCell(r, 19).toUpperCase() === 'QUEM' && getCell(r, 20).toUpperCase().includes('DEVE'));
        const start = headerIdx >= 0 ? headerIdx + 1 : 1;
        const rowIdx = findFirstEmptyByCol(rows, 19, start, Math.min(rows.length + 120, start + 500));
        if (rowIdx < 0) return badRequest(res, 'Nao foi possivel encontrar linha vazia para acerto individual.');
        await updateRange(`${activeFinanceSheet}!T${rowIdx + 1}:W${rowIdx + 1}`, [
          payload.quem || usuario || '',
          normalizeMoney2(payload.deveQuanto || payload.valor),
          payload.paraQuem || '',
          payload.obs || payload.descricao || '',
        ]);
        return res.json({ ok: true, message: 'Acerto individual adicionado.' });
      }
      return badRequest(res, 'entryType invalido.');
    }

    if (action === 'updateFinanceEntry') {
      const { entryType, rowIndex, payload = {} } = req.body || {};
      const row = Number(rowIndex);
      if (!Number.isFinite(row) || row < 1) return badRequest(res, 'rowIndex invalido.');
      const activeFinanceSheet = await resolveActiveFinanceSheet();

      if (entryType === 'conta_fixa') {
        await updateRange(`${activeFinanceSheet}!B${row}:F${row}`, [
          payload.conta || '',
          normalizeMoney2(payload.valor),
          payload.divisao || '',
          payload.vencimento || '',
          payload.status || 'FALSE',
        ]);
        return res.json({ ok: true, message: 'Conta fixa atualizada.' });
      }
      if (entryType === 'gasto_coletivo') {
        await updateRange(`${activeFinanceSheet}!J${row}:M${row}`, [
          payload.quem || '',
          normalizeMoney2(payload.quanto || payload.valor),
          payload.oQue || '',
          payload.obs || '',
        ]);
        return res.json({ ok: true, message: 'Gasto coletivo atualizado.' });
      }
      if (entryType === 'acerto_individual') {
        await updateRange(`${activeFinanceSheet}!T${row}:W${row}`, [
          payload.quem || '',
          normalizeMoney2(payload.deveQuanto || payload.valor),
          payload.paraQuem || '',
          payload.obs || '',
        ]);
        return res.json({ ok: true, message: 'Acerto individual atualizado.' });
      }
      return badRequest(res, 'entryType invalido.');
    }

    if (action === 'deleteFinanceEntry') {
      const { entryType, rowIndex } = req.body || {};
      const row = Number(rowIndex);
      if (!Number.isFinite(row) || row < 1) return badRequest(res, 'rowIndex invalido.');
      const activeFinanceSheet = await resolveActiveFinanceSheet();

      if (entryType === 'conta_fixa') {
        await updateRange(`${activeFinanceSheet}!B${row}:F${row}`, ['', '', '', '', '']);
        return res.json({ ok: true, message: 'Conta fixa removida.' });
      }
      if (entryType === 'gasto_coletivo') {
        await updateRange(`${activeFinanceSheet}!J${row}:M${row}`, ['', '', '', '']);
        return res.json({ ok: true, message: 'Gasto coletivo removido.' });
      }
      if (entryType === 'acerto_individual') {
        await updateRange(`${activeFinanceSheet}!T${row}:W${row}`, ['', '', '', '']);
        return res.json({ ok: true, message: 'Acerto individual removido.' });
      }
      return badRequest(res, 'entryType invalido.');
    }

    if (action === 'toggleContaStatus') {
      const { rowIndex, status } = req.body || {};
      const row = Number(rowIndex);
      if (!Number.isFinite(row) || row < 1) return badRequest(res, 'rowIndex invalido.');
      const activeFinanceSheet = await resolveActiveFinanceSheet();
      const normalizedStatus = typeof status === 'boolean' ? (status ? 'TRUE' : 'FALSE') : String(status || '').toUpperCase();
      const next = normalizedStatus === 'TRUE' ? 'TRUE' : 'FALSE';
      await updateRange(`${activeFinanceSheet}!F${row}:F${row}`, [next]);
      return res.json({ ok: true, message: `Conta marcada como ${next === 'TRUE' ? 'paga' : 'pendente'}.` });
    }
    if (action === 'rateTask') {
      const { actor = '', target = '', tarefa = '', nota, comentario = '', categoria = 'casa' } = req.body || {};
      const score = Number(nota);
      const category = String(categoria || 'casa').trim().toLowerCase() === 'banheirao' ? 'banheirao' : 'casa';
      if (!actor || !target || !tarefa || !Number.isFinite(score) || score < 1 || score > 5) {
        return badRequest(res, 'Dados de avaliacao invalidos.');
      }
      if (category === 'banheirao' && !isBanheiraoTask(tarefa)) {
        return badRequest(res, 'Avaliacao de banheirao so pode ser enviada para tarefa de banheirao.');
      }
      if (String(actor).trim().toUpperCase() === String(target).trim().toUpperCase()) {
        return badRequest(res, 'Nao pode avaliar a propria tarefa.');
      }
      await ensureSheetExists(RATINGS_SHEET);
      const wk = weekKey();
      const rows = await readRangeWithFallback(`${RATINGS_SHEET}!A:H`, []);
      const data = rows.slice(1);
      const already = data.some((r) =>
        String(r[0] || '') === wk &&
        String(r[1] || '').trim().toUpperCase() === String(actor).trim().toUpperCase() &&
        String(r[2] || '').trim().toUpperCase() === String(target).trim().toUpperCase() &&
        String(r[7] || 'casa').trim().toLowerCase() === category
      );
      if (already) return badRequest(res, `Voce ja avaliou este morador nesta semana (${category}).`);
      const ts = new Date().toISOString();
      await appendRow(`${RATINGS_SHEET}!A:H`, [wk, actor, target, score, tarefa, comentario, ts, category]);

      await ensureSheetExists(TASK_FEED_SHEET);
      await appendRow(`${TASK_FEED_SHEET}!A:H`, [wk, ts, 'rating', actor, target, tarefa, `avaliou ${category} com ${score} estrelas`, '']);
      const summary = getRatingsSummaryForWeek((await readRangeWithFallback(`${RATINGS_SHEET}!A:H`, [])).slice(1), wk);
      return res.json({ ok: true, message: 'Avaliacao registrada.', week: wk, summary });
    }
    if (action === 'addTaskFeedComment') {
      const { actor = '', content = '', target = '', tarefa = '', photoDataUrl = '', parentTs = '', parentActor = '' } = req.body || {};
      if (!actor || !content) return badRequest(res, 'actor e content obrigatorios.');
      await ensureSheetExists(TASK_FEED_SHEET);
      const wk = weekKey();
      const ts = new Date().toISOString();
      const savedPhoto = await storeTaskPhotoDataUrl(photoDataUrl);
      const isReply = !!String(parentTs || '').trim();
      await appendRow(`${TASK_FEED_SHEET}!A:H`, [
        wk,
        ts,
        isReply ? 'comment_reply' : 'comment',
        actor,
        isReply ? String(parentTs).trim() : target,
        isReply ? String(parentActor || '').trim() : tarefa,
        content,
        savedPhoto,
      ]);
      return res.json({ ok: true, message: 'Comentario publicado.' });
    }
    if (action === 'deleteTaskFeedPost') {
      const { rowIndex, actor = '' } = req.body || {};
      const row = Number(rowIndex);
      if (!Number.isFinite(row) || row < 1) return badRequest(res, 'rowIndex invalido.');
      await ensureSheetExists(TASK_FEED_SHEET);
      const rows = await readRangeOrEmpty(`${TASK_FEED_SHEET}!A:H`);
      const first = rows[0] || [];
      const hasHeader = String(first[0] || '').toLowerCase() === 'week';
      const zeroIdx = row - 1;
      const current = rows[zeroIdx] || [];
      if (!current.length) return badRequest(res, 'Post nao encontrado.');
      if (!hasHeader && row === 1) return badRequest(res, 'Linha invalida para exclusao.');
      await updateRange(`${TASK_FEED_SHEET}!A${row}:H${row}`, ['', '', 'deleted', '', '', '', '[post removido]', '']);
      return res.json({ ok: true, message: 'Post excluido com sucesso.' });
    }
    return badRequest(res, `action POST nao suportada: ${action}`);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Tocah proxy ativo na porta ${PORT}`);
});
