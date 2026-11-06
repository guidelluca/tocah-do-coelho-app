/**
 * Datas sempre no fuso da república (America/Sao_Paulo), não no UTC do servidor.
 */
const TZ = 'America/Sao_Paulo';

function spParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
  return { year, month, day, hour: get('hour'), minute: get('minute') };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD no fuso de São Paulo. */
function spDateKey(date = new Date()) {
  const { year, month, day } = spParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** dd/mm/aaaa no fuso de São Paulo (formato usado na aba Caixinha). */
function spDateBr(date = new Date()) {
  const { year, month, day } = spParts(date);
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

/** Semana ISO (YYYY-Www) calculada sobre o dia civil de São Paulo. */
function weekKey(date = new Date()) {
  const { year, month, day } = spParts(date);
  return isoWeekFromYmd(year, month, day);
}

function isoWeekFromYmd(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}

/** Segunda a domingo (YYYY-MM-DD) da semana de São Paulo que contém `date`. */
function spWeekDays(date = new Date()) {
  const { year, month, day } = spParts(date);
  const base = new Date(Date.UTC(year, month - 1, day));
  const dow = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() - (dow - 1));
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    days.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
  }
  return days;
}

function tsToDate(ts) {
  const d = new Date(String(ts || ''));
  return Number.isNaN(d.getTime()) ? null : d;
}

function getSaoPauloYearMonth() {
  const { year, month } = spParts(new Date());
  return { year, month };
}

module.exports = { TZ, spParts, spDateKey, spDateBr, weekKey, isoWeekFromYmd, spWeekDays, tsToDate, getSaoPauloYearMonth, pad2 };
