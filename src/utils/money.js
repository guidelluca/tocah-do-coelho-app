/** Converte texto da planilha ("R$ 1.234,56", "1234.56", "-38,90") em número. Vazio/inválido = 0. */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  let normalized = raw.replace(/[^\d,.-]/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 || lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = normalized.split(thousandSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Tem algum número de verdade? (para distinguir "" e textos de 0) */
export function hasNumber(value) {
  return /\d/.test(String(value ?? '')) && !/[A-Za-z]{2,}/.test(String(value ?? '').replace(/R\$/i, ''));
}

const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function brl(value) {
  return formatter.format(toNumber(value)).replace(/ /g, ' ');
}

export function signedBrl(n) {
  const v = toNumber(n);
  if (v > 0) return `+${brl(v)}`;
  if (v < 0) return `-${brl(Math.abs(v))}`;
  return brl(0);
}

export const MASKED = 'R$ ••••';

/** Máscara de digitação tipo caixa eletrônico: "1234" -> "12,34". */
export function formatMoneyInput(value) {
  let digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length > 9) digits = digits.slice(0, 9);
  const cents = digits.slice(-2).padStart(2, '0');
  const whole = (digits.length > 2 ? digits.slice(0, -2) : '0').replace(/^0+(?=\d)/, '');
  const withThousands = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withThousands},${cents}`;
}

/** Valor da planilha -> texto do input mascarado. */
export function moneyInputFromValue(value) {
  const n = toNumber(value);
  if (!n) return '';
  return formatMoneyInput(String(Math.round(Math.abs(n) * 100)));
}

/** Texto do input mascarado -> "1234.56" para enviar ao backend. */
export function toSheetMoney(value) {
  return toNumber(value).toFixed(2);
}
