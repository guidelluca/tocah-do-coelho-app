const { getCell, norm, toNumberLike } = require('./text');
const { weekKey, spDateKey, tsToDate } = require('./time');

const RESIDENTS = ['ALLAN', 'RAMON', 'VITOR', 'GUSTAVO', 'GUILHERME'];
const RESIDENTS_NORM = RESIDENTS.map((r) => norm(r));

function isResidentName(value) {
  return RESIDENTS_NORM.includes(norm(value));
}

function canonicalResident(value) {
  const idx = RESIDENTS_NORM.indexOf(norm(value));
  return idx >= 0 ? RESIDENTS[idx] : '';
}

/* ---------- Escala ---------- */

function extractScale(rows = []) {
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      const maybeName = String(row[i] || '').trim();
      if (!isResidentName(maybeName)) continue;
      const canonical = canonicalResident(maybeName);
      let task = '';
      for (let j = i + 1; j < row.length; j += 1) {
        const v = String(row[j] || '').trim();
        if (v && !isResidentName(v)) {
          task = v;
          break;
        }
      }
      if (!seen.has(canonical)) {
        seen.add(canonical);
        result.push({ nome: maybeName, tarefa: task || '-' });
      }
      break;
    }
  }
  return result;
}

function extractTaskForUser(rows = [], usuario = '') {
  const target = norm(usuario);
  if (!target) return '';
  const hit = extractScale(rows).find((item) => norm(item.nome) === target);
  return hit && hit.tarefa !== '-' ? hit.tarefa : '';
}

function defaultScale() {
  return [
    { nome: 'ALLAN', tarefa: 'Quintal + Coelha Nilde' },
    { nome: 'RAMON', tarefa: 'Lavanderia e Panos' },
    { nome: 'VITOR', tarefa: 'Lixo Diário' },
    { nome: 'GUSTAVO', tarefa: 'Cozinha' },
    { nome: 'GUILHERME', tarefa: 'Sala, Corredor e Garagem' },
  ];
}

const SMALL_WORDS = ['E', 'DA', 'DE', 'DO', 'DAS', 'DOS', 'A', 'O'];

/** "SALA, CORREDOR E GARAGEM" -> "Sala, Corredor e Garagem" (mantém emoji). Textos já em caixa mista ficam como estão. */
function niceTaskName(value) {
  const raw = String(value || '').trim();
  if (!raw || raw !== raw.toUpperCase()) return raw;
  return raw
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => (/^\s+$/.test(w) || (i > 0 && SMALL_WORDS.includes(w.toUpperCase())) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

/**
 * Lê a aba EscalaApp publicada pelo Apps Script (BotTocah tarefas).
 * Colunas: periodo | morador | tarefa | prazo | frequencia | descricao | extra | extraDescricao | atualizadoEm
 */
function parseEscalaApp(rows = []) {
  const out = [];
  rows.forEach((r, i) => {
    if (i === 0 && norm(r[1]) === 'MORADOR') return;
    const nome = canonicalResident(getCell(r, 1));
    const area = getCell(r, 2);
    if (!nome || !area) return;
    const extra = getCell(r, 6);
    const tarefaBase = niceTaskName(area);
    out.push({
      nome,
      tarefa: extra ? `${tarefaBase} + ${niceTaskName(extra)}` : tarefaBase,
      tarefaBase,
      extra: niceTaskName(extra),
      periodo: getCell(r, 0),
      prazo: niceTaskName(getCell(r, 3)),
      frequencia: getCell(r, 4),
      descricao: getCell(r, 5),
      extraDescricao: getCell(r, 7),
      atualizadoEm: getCell(r, 8),
    });
  });
  return out;
}

function isBanheiraoTask(task = '') {
  return norm(task).includes('BANHEIR');
}

/* ---------- Feed ---------- */

function parseFeedRows(rows = []) {
  const first = rows[0] || [];
  const hasHeader = String(first[0] || '').toLowerCase() === 'week';
  const data = hasHeader ? rows.slice(1) : rows;
  const baseRowIndex = hasHeader ? 2 : 1;
  return data.map((r, idx) => ({
    rowIndex: baseRowIndex + idx,
    week: String(r[0] || ''),
    ts: String(r[1] || ''),
    type: String(r[2] || ''),
    actor: String(r[3] || ''),
    target: String(r[4] || ''),
    tarefa: String(r[5] || ''),
    content: String(r[6] || ''),
    photoDataUrl: String(r[7] || ''),
  }));
}

/** Semana do item: a gravada na linha; se vazia, calculada pelo ts. */
function itemWeek(item) {
  if (item.week) return item.week;
  const d = tsToDate(item.ts);
  return d ? weekKey(d) : '';
}

/** Semana do item pelo ts, no fuso de SP (para status de tarefa, independente do UTC antigo). */
function itemWeekBySp(item) {
  const d = tsToDate(item.ts);
  return d ? weekKey(d) : item.week;
}

function sortWeekKeysDesc(a = '', b = '') {
  const parse = (wk) => {
    const m = String(wk || '').match(/^(\d{4})-W(\d{2})$/);
    return m ? { year: Number(m[1]), week: Number(m[2]) } : { year: 0, week: 0 };
  };
  const aa = parse(a);
  const bb = parse(b);
  if (aa.year !== bb.year) return bb.year - aa.year;
  return bb.week - aa.week;
}

function anonymizeRating(item) {
  if (item.type !== 'rating') return item;
  return {
    ...item,
    actor: 'Avaliador anônimo',
    content: item.content ? `avaliou ${item.tarefa ? `(${item.tarefa}) ` : ''}de forma anônima` : 'avaliação anônima',
  };
}

/** Checks da semana por morador (o mais recente vence). */
function checksByResident(feedItems, wk) {
  const map = {};
  for (const item of feedItems) {
    if (item.type !== 'check') continue;
    // A coluna A guarda a semana (ciclo) da entrega — entregas atrasadas contam na semana certa.
    const itemWeek = /^\d{4}-W\d{2}$/.test(String(item.week || '').trim()) ? String(item.week).trim() : itemWeekBySp(item);
    if (itemWeek !== wk) continue;
    const who = canonicalResident(item.actor);
    if (!who) continue;
    if (!map[who] || String(item.ts) > String(map[who].ts)) map[who] = item;
  }
  return map;
}

/* ---------- Nilde ---------- */

const NILDE_SLOTS = [
  { id: 'manha_feno', label: 'Manhã - Feno', short: 'Manhã', food: 'Feno', icon: 'weather-sunset-up' },
  { id: 'tarde_feno', label: 'Tarde - Feno', short: 'Tarde', food: 'Feno', icon: 'weather-sunny' },
  { id: 'noite_racao', label: 'Noite - Ração', short: 'Noite', food: 'Ração', icon: 'weather-night' },
];

function nildeSlotFromLabel(label) {
  const n = norm(label);
  if (!n) return null;
  return NILDE_SLOTS.find((s) => norm(s.label) === n || norm(s.id) === n || n.startsWith(norm(s.short))) || null;
}

/** Monta o estado da Nilde (dia -> slot -> quem/quando) a partir dos posts do feed com target NILDE. */
function buildNildeWeek(feedItems, dayKeys) {
  const days = {};
  dayKeys.forEach((k) => {
    days[k] = {};
  });
  const sorted = feedItems
    .filter((item) => item.type === 'comment' && norm(item.target) === 'NILDE')
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  for (const item of sorted) {
    const d = tsToDate(item.ts);
    if (!d) continue;
    const key = spDateKey(d);
    if (!days[key]) continue;
    const slot = nildeSlotFromLabel(item.tarefa);
    if (!slot) continue;
    if (days[key][slot.id]) continue; // vale o primeiro check do slot
    days[key][slot.id] = {
      by: canonicalResident(item.actor) || item.actor,
      at: item.ts,
      ts: item.ts,
      rowIndex: item.rowIndex,
      content: item.content,
      hasPhoto: !!item.photoDataUrl,
    };
  }
  return days;
}

/* ---------- Avaliações ---------- */

function getRatingsSummaryForWeek(rows, wk) {
  const map = {};
  const expected = Math.max(1, RESIDENTS.length - 1);
  for (const r of rows) {
    const week = String(r[0] || '');
    const target = String(r[2] || '').trim();
    const nota = Number(String(r[3] || '').replace(',', '.'));
    const categoria = String(r[7] || 'casa').trim().toLowerCase() || 'casa';
    if (week !== wk || !target || !Number.isFinite(nota)) continue;
    const key = canonicalResident(target) || target;
    if (!map[key]) {
      map[key] = {
        casa: { total: 0, soma: 0, media: 0 },
        banheirao: { total: 0, soma: 0, media: 0 },
        geral: { total: 0, soma: 0, media: 0 },
        expectedEvaluators: expected,
      };
    }
    const bucket = categoria === 'banheirao' ? 'banheirao' : 'casa';
    map[key][bucket].total += 1;
    map[key][bucket].soma += nota;
    map[key][bucket].media = map[key][bucket].soma / map[key][bucket].total;
    map[key].geral.total += 1;
    map[key].geral.soma += nota;
    map[key].geral.media = map[key].geral.soma / map[key].geral.total;
  }
  return map;
}

/** Quem o morador já avaliou na semana (sem expor nota nem quem avaliou quem para os outros). */
function ratedByActor(rows, wk, actor) {
  const a = norm(actor);
  const out = {};
  for (const r of rows) {
    if (String(r[0] || '') !== wk || norm(r[1]) !== a) continue;
    const target = canonicalResident(r[2]) || String(r[2] || '').trim();
    const cat = String(r[7] || 'casa').trim().toLowerCase() === 'banheirao' ? 'banheirao' : 'casa';
    if (!out[target]) out[target] = {};
    out[target][cat] = true;
  }
  return out;
}

/* ---------- Caixinha ---------- */

function parseCaixinhaStatement(rows = []) {
  const items = [];
  rows.forEach((row, idx) => {
    const data = getCell(row, 0);
    const descricao = getCell(row, 1);
    const valor = getCell(row, 2);
    const obs = getCell(row, 3);
    const descLow = descricao.toLowerCase();
    const valueLow = valor.toLowerCase();
    if (!descricao || descLow === 'descrição' || descLow === 'descricao' || descLow === 'total') return;
    if (!valor || valueLow === 'valor da caixinha [$]') return;
    items.push({ rowIndex: idx + 1, data, descricao, valor, obs, tipo: toNumberLike(valor) < 0 ? 'saida' : 'entrada' });
  });
  return items.reverse();
}

module.exports = {
  RESIDENTS,
  isResidentName,
  canonicalResident,
  extractScale,
  extractTaskForUser,
  defaultScale,
  isBanheiraoTask,
  niceTaskName,
  parseEscalaApp,
  parseFeedRows,
  itemWeek,
  itemWeekBySp,
  sortWeekKeysDesc,
  anonymizeRating,
  checksByResident,
  NILDE_SLOTS,
  nildeSlotFromLabel,
  buildNildeWeek,
  getRatingsSummaryForWeek,
  ratedByActor,
  parseCaixinhaStatement,
};
