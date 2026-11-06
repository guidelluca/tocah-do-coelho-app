const TZ = 'America/Sao_Paulo';
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_CODES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

function strip(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/** "MAI_2026", "MAIO_2026", "05_2026", "Maio 2026" -> "Maio 2026" */
export function formatMonthReference(value) {
  const raw = strip(value).replace(/[\s-]+/g, '_');
  if (!raw) return 'Mês atual';
  let m = raw.match(/^([A-Z]+)_(\d{4})$/);
  if (m) {
    const idx = MONTH_CODES.indexOf(m[1].slice(0, 3));
    if (idx >= 0) return `${MONTHS[idx]} ${m[2]}`;
  }
  m = raw.match(/^(\d{1,2})_(\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${MONTHS[Number(m[1]) - 1]} ${m[2]}`;
  return String(value);
}

/** Partes da data no fuso de São Paulo. */
export function spParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekday: get('weekday') };
}

export function spDateKey(date = new Date()) {
  const { year, month, day } = spParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toDate(value) {
  const d = new Date(String(value || ''));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatRelativeTime(iso, now = Date.now()) {
  const d = toDate(iso);
  if (!d) return '';
  const diffMin = Math.floor((now - d.getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `há ${diffHour} h`;
  if (spDateKey(new Date(now - 86400000)) === spDateKey(d)) return 'ontem';
  return d.toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(iso) {
  const d = toDate(iso);
  return d ? d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '';
}

/** "qui 14:02" */
export function formatWeekdayTime(iso) {
  const d = toDate(iso);
  if (!d) return '';
  const wd = d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short' }).replace('.', '');
  return `${wd} ${formatTime(iso)}`;
}

export function formatDateTime(iso) {
  const d = toDate(iso);
  return d ? d.toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}

/** "Quinta, 6 de novembro" */
export function formatLongDay(dayKey) {
  const [y, m, d] = String(dayKey || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const txt = dt.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function shortWeekday(dayKey) {
  const [y, m, d] = String(dayKey || '').split('-').map(Number);
  if (!y) return '';
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const txt = dt.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '');
  return txt.charAt(0).toUpperCase() + txt.slice(1, 3);
}

export function dayOfMonth(dayKey) {
  return Number(String(dayKey || '').split('-')[2]) || '';
}

/** Semana ISO "2026-W45" -> "2 a 8 nov" */
export function weekRangeLabel(week) {
  const m = String(week || '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]);
  const wk = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (wk - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'short' }).replace('.', '').replace(' de ', ' ');
  return `${monday.getUTCDate()} a ${fmt(sunday)}`;
}

/**
 * Vencimento por dia do mês, no mês de referência.
 * Retorna { label, daysLeft, tone } — tone: 'ok' | 'soon' | 'today' | 'late'.
 */
export function dueInfo(dueDay, sheetTitle, now = new Date()) {
  const day = Number(String(dueDay ?? '').replace(/[^\d]/g, ''));
  if (!day || day < 1 || day > 31) return null;
  const today = spParts(now);
  let year = today.year;
  let month = today.month;
  const raw = strip(sheetTitle).replace(/[\s-]+/g, '_');
  const mm = raw.match(/^([A-Z]+|\d{1,2})_(\d{4})$/);
  if (mm) {
    const idx = /^\d+$/.test(mm[1]) ? Number(mm[1]) - 1 : MONTH_CODES.indexOf(mm[1].slice(0, 3));
    if (idx >= 0) {
      month = idx + 1;
      year = Number(mm[2]);
    }
  }
  const due = Date.UTC(year, month - 1, day);
  const cur = Date.UTC(today.year, today.month - 1, today.day);
  const daysLeft = Math.round((due - cur) / 86400000);
  let tone = 'ok';
  let label = `Vence dia ${day}`;
  if (daysLeft < 0) {
    tone = 'late';
    label = `Venceu dia ${day}`;
  } else if (daysLeft === 0) {
    tone = 'today';
    label = 'Vence hoje';
  } else if (daysLeft <= 3) {
    tone = 'soon';
    label = `Vence dia ${day} · ${daysLeft === 1 ? 'amanhã' : `faltam ${daysLeft} dias`}`;
  } else {
    label = `Vence dia ${day} · faltam ${daysLeft} dias`;
  }
  return { day, daysLeft, tone, label };
}
