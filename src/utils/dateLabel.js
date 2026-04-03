const MONTH_MAP = {
  JAN: 'Janeiro',
  FEV: 'Fevereiro',
  MAR: 'Marco',
  ABR: 'Abril',
  MAI: 'Maio',
  JUN: 'Junho',
  JUL: 'Julho',
  AGO: 'Agosto',
  SET: 'Setembro',
  OUT: 'Outubro',
  NOV: 'Novembro',
  DEZ: 'Dezembro',
};

export function formatMonthReference(value) {
  const raw = String(value || '').trim().toUpperCase();
  const match = raw.match(/^([A-Z]{3})_(\d{4})$/);
  if (!match) return value || 'Mes atual';
  const month = MONTH_MAP[match[1]] || match[1];
  return `${month} ${match[2]}`;
}
