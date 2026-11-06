function getCell(row = [], idx) {
  return String(row?.[idx] ?? '').trim();
}

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Texto normalizado para comparação: sem acento, maiúsculo, espaços simples. */
function norm(value) {
  return stripDiacritics(value).trim().toUpperCase().replace(/\s+/g, ' ');
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
  if (!normalized || normalized === '-' || normalized === '.') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeMoney2(value) {
  const n = toNumberLike(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

/** 0 -> A, 1 -> B, 25 -> Z, 26 -> AA */
function colLetter(idx) {
  let n = Number(idx) + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function brl(n) {
  const v = Number(n) || 0;
  return `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

module.exports = { getCell, stripDiacritics, norm, toNumberLike, normalizeMoney2, colLetter, brl };
