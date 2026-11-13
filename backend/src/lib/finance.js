const { getCell, norm, stripDiacritics, toNumberLike, normalizeMoney2, brl } = require('./text');
const { getSaoPauloYearMonth } = require('./time');

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MONTHS_PT_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_PT_LONG = {
  JANEIRO: 0, FEVEREIRO: 1, MARCO: 2, ABRIL: 3, MAIO: 4, JUNHO: 5,
  JULHO: 6, AGOSTO: 7, SETEMBRO: 8, OUTUBRO: 9, NOVEMBRO: 10, DEZEMBRO: 11,
};

/**
 * Blocos da aba mensal. As posições de coluna são as da planilha (0 = A).
 * NÃO mudar: a planilha é editada à mão.
 */
const FINANCE_BLOCKS = {
  conta_fixa: {
    isHeader: (r) => getCell(r, 1).toLowerCase() === 'conta' && getCell(r, 2).toLowerCase() === 'valor',
    keyCol: 1,
    fields: { conta: 1, valor: 2, divisao: 3, vencimento: 4, status: 5 },
    aliases: { descricao: 'conta' },
    money: ['valor'],
    firstCol: 1,
    lastCol: 5,
  },
  gasto_coletivo: {
    isHeader: (r) => getCell(r, 9).toUpperCase() === 'QUEM' && getCell(r, 10).toUpperCase() === 'QUANTO',
    keyCol: 9,
    fields: { quem: 9, quanto: 10, oQue: 11, obs: 12 },
    aliases: { valor: 'quanto', descricao: 'oQue' },
    money: ['quanto'],
    firstCol: 9,
    lastCol: 12,
  },
  acerto_individual: {
    isHeader: (r) => getCell(r, 19).toUpperCase() === 'QUEM' && getCell(r, 20).toUpperCase().includes('DEVE'),
    keyCol: 19,
    fields: { quem: 19, deveQuanto: 20, paraQuem: 21, obs: 22 },
    aliases: { valor: 'deveQuanto' },
    money: ['deveQuanto'],
    firstCol: 19,
    lastCol: 22,
  },
};

function findRowIndex(rows, predicate, from = 0) {
  for (let i = from; i < rows.length; i += 1) {
    if (predicate(rows[i] || [], i)) return i;
  }
  return -1;
}

function findFirstEmptyByCol(rows, colIdx, from, to, taken = new Set()) {
  for (let i = from; i <= to; i += 1) {
    if (taken.has(i)) continue;
    if (!getCell(rows[i] || [], colIdx)) return i;
  }
  return -1;
}

/**
 * Linhas vazias toleradas no meio dos blocos de gastos coletivos e acertos.
 * Excluir/quitar deixa um "buraco" na planilha; antes o app parava de ler no buraco e
 * os lançamentos de baixo sumiam da tela (continuavam na planilha).
 */
const MAX_BLOCK_GAP = 15;

function parseFinanceSnapshot(rows) {
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
        total: getCell(r, 14),
      });
    }
  }

  const contas = [];
  const contasHeaderIdx = findRowIndex(rows, FINANCE_BLOCKS.conta_fixa.isHeader);
  if (contasHeaderIdx >= 0) {
    for (let i = contasHeaderIdx + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const conta = getCell(r, 1);
      const valor = getCell(r, 2);
      if (!conta && !valor) break;
      if (!conta) continue;
      contas.push({ rowIndex: i + 1, conta, valor, divisao: getCell(r, 3), vencimento: getCell(r, 4), status: getCell(r, 5) });
    }
  }

  const gastosColetivos = [];
  const coletivosHeaderIdx = findRowIndex(rows, FINANCE_BLOCKS.gasto_coletivo.isHeader);
  if (coletivosHeaderIdx >= 0) {
    let gap = 0;
    for (let i = coletivosHeaderIdx + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const quem = getCell(r, 9);
      const quanto = getCell(r, 10);
      if (!quem && !quanto) {
        gap += 1;
        if (gap > MAX_BLOCK_GAP) break;
        continue;
      }
      gap = 0;
      if (!quem || !quanto) continue;
      gastosColetivos.push({ rowIndex: i + 1, quem, quanto, oQue: getCell(r, 11), obs: getCell(r, 12) });
    }
  }

  const acertosIndividuais = [];
  const acertosHeaderIdx = findRowIndex(rows, FINANCE_BLOCKS.acerto_individual.isHeader);
  if (acertosHeaderIdx >= 0) {
    let gap = 0;
    for (let i = acertosHeaderIdx + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const quem = getCell(r, 19);
      const deveQuanto = getCell(r, 20);
      if (!quem && !deveQuanto) {
        gap += 1;
        if (gap > MAX_BLOCK_GAP) break;
        continue;
      }
      gap = 0;
      if (!quem || !deveQuanto) continue;
      acertosIndividuais.push({ rowIndex: i + 1, quem, deveQuanto, paraQuem: getCell(r, 21), obs: getCell(r, 22) });
    }
  }

  return { residents, contas, gastosColetivos, acertosIndividuais };
}

function financeSnapshotHasResidents(rows) {
  return parseFinanceSnapshot(rows).residents.length > 0;
}

/* ---------- Nomes das abas mensais ---------- */

function parseMonthSheetTitle(title) {
  const raw = String(title || '').trim();
  const m3 = raw.match(/^([A-Za-zÇç]{3})[_\s-]+(\d{4})$/);
  if (m3) {
    const monthIdx = MONTHS_PT.indexOf(stripDiacritics(m3[1]).toUpperCase());
    if (monthIdx >= 0) return { title: raw, year: Number(m3[2]), monthIdx };
  }
  const mNum = raw.match(/^(\d{1,2})[_\s/-]+(\d{4})$/);
  if (mNum) {
    const mo = Number(mNum[1]);
    const year = Number(mNum[2]);
    if (year >= 2000 && year <= 2100 && mo >= 1 && mo <= 12) return { title: raw, year, monthIdx: mo - 1 };
  }
  const mLong = raw.match(/^([A-Za-zÇçÁÉÍÓÚÂÊÔÃÕáéíóúâêôãõ\s]+?)[_\s-]+(\d{4})$/);
  if (mLong) {
    const mon = stripDiacritics(mLong[1]).toUpperCase().replace(/\s+/g, '');
    const year = Number(mLong[2]);
    const monthIdx = MONTHS_PT_LONG[mon];
    if (monthIdx !== undefined && year >= 2000 && year <= 2100) return { title: raw, year, monthIdx };
  }
  return null;
}

function monthLabel(parsed) {
  if (!parsed) return '';
  return `${MONTHS_PT_FULL[parsed.monthIdx]} ${parsed.year}`;
}

function monthSheetOrder(entry) {
  return entry.year * 12 + entry.monthIdx;
}

function normalizeTabKey(t) {
  return String(t || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function findTitle(titles, want) {
  const wu = normalizeTabKey(want);
  if (!wu) return undefined;
  return titles.find((t) => normalizeTabKey(t) === wu);
}

function findTitleByCivilMonth(titles, year, month) {
  const wantOrder = year * 12 + (month - 1);
  for (const t of titles) {
    const p = parseMonthSheetTitle(t);
    if (p && monthSheetOrder(p) === wantOrder) return String(t).trim();
  }
  return null;
}

/** Abas mensais existentes, mais recente primeiro. */
function listMonthSheets(titles) {
  return (titles || [])
    .map((t) => parseMonthSheetTitle(t))
    .filter(Boolean)
    .sort((a, b) => monthSheetOrder(b) - monthSheetOrder(a))
    .map((p) => ({ title: p.title, label: monthLabel(p), year: p.year, month: p.monthIdx + 1 }));
}

/**
 * Ordem de candidatos para o modo AUTO.
 * O mês atual do app é a aba mensal MAIS RECENTE da planilha: assim que alguém cria
 * a aba do mês seguinte (ex. DEZ_2026 no fim de novembro, quando cai o salário), o app
 * já passa a tratá-la como atual — sem esperar o mês civil virar.
 * Depois vêm as outras abas mensais, da mais nova para a mais antiga (fallback de leitura).
 * `currentName` (mês civil em SP) só é usado quando a planilha não tem nenhuma aba mensal.
 */
function autoFinanceCandidates(titlesRaw, now = getSaoPauloYearMonth()) {
  const titles = (titlesRaw || []).map((t) => String(t || '').trim()).filter(Boolean);
  const { year, month } = now;
  const currentName = `${MONTHS_PT[month - 1]}_${year}`;
  const ordered = [];
  for (const p of titles.map(parseMonthSheetTitle).filter(Boolean).sort((a, b) => monthSheetOrder(b) - monthSheetOrder(a))) {
    if (!ordered.includes(p.title)) ordered.push(p.title);
  }
  const preferred = ordered[0] || null;
  return { preferred, ordered, currentName };
}

/* ---------- Divisão de valores ---------- */

/**
 * Divide `total` em `parts` partes em centavos, sem perder nem sobrar centavo.
 * Retorna array de números com 2 casas. Os primeiros recebem o centavo extra.
 */
function splitCents(total, parts) {
  const n = Math.max(1, Math.floor(parts));
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}

/**
 * Regra ATUAL do app (commit 907ec57): o valor é dividido só entre os devedores;
 * quem pagou não entra na conta. `incluirPagador=true` é opcional e explícito.
 */
function computeCollectiveShares(total, devedores, incluirPagador = false) {
  const list = Array.from(new Set((devedores || []).map((n) => String(n || '').trim()).filter(Boolean)));
  if (!list.length || !Number.isFinite(Number(total)) || Number(total) <= 0) return [];
  const parts = list.length + (incluirPagador ? 1 : 0);
  const shares = splitCents(total, parts);
  // Quando o pagador participa, ele fica com a última parte (a menor, se houver centavo sobrando).
  return list.map((nome, i) => ({ nome, valor: shares[i] }));
}

const REF_TAG_RE = /#g([a-z0-9]{4,8})(\+?)/i;

function createRefId() {
  return Date.now().toString(36).slice(-6);
}

function buildRefTag(id, incluirPagador) {
  return `#g${id}${incluirPagador ? '+' : ''}`;
}

function parseRefTag(text) {
  const m = String(text || '').match(REF_TAG_RE);
  if (!m) return null;
  return { id: m[1].toLowerCase(), incluirPagador: m[2] === '+', tag: m[0] };
}

/** Remove os textos automáticos ("Divisao: ...", "Divisão: ...", tag #g...) da obs para não duplicar ao editar. */
function stripAutoObs(obs) {
  return String(obs || '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && !/^divisao\s*:/i.test(stripDiacritics(part)) && !/^emprestimo dividido\s*:/i.test(stripDiacritics(part)))
    .map((part) => part.replace(REF_TAG_RE, '').trim())
    .filter(Boolean)
    .join(' | ');
}

/** Partes automáticas da obs (Divisão/Empréstimo dividido), sem duplicar. */
function autoObsParts(obs) {
  const seen = new Set();
  return String(obs || '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => /^divisao\s*:/i.test(stripDiacritics(part)) || /^emprestimo dividido\s*:/i.test(stripDiacritics(part)))
    .filter((part) => {
      const k = norm(part);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Para linhas antigas (sem marca #g): mantém o texto do usuário + as partes automáticas que já existiam, uma vez só. */
function mergeLegacyObs(newUserObs, currentObs) {
  return [stripAutoObs(newUserObs), ...autoObsParts(currentObs)].filter(Boolean).join(' | ');
}

function collectiveObs(userObs, devedores, payer, shares, incluirPagador, refId) {
  const per = shares.length ? shares[0].valor : 0;
  const quem = incluirPagador ? `${devedores.join(', ')} + ${payer}` : `${devedores.join(', ')} → ${payer}`;
  const meta = `Divisão: ${shares.length} devedor(es) (${brl(per)}/devedor) • ${quem}`;
  return [stripAutoObs(userObs), meta, buildRefTag(refId, incluirPagador)].filter(Boolean).join(' | ');
}

function settlementObs(userObs, oQue, refId, incluirPagador) {
  return [stripAutoObs(userObs), `↳ ${oQue}`.trim(), buildRefTag(refId, incluirPagador)].filter(Boolean).join(' | ');
}

/* ---------- Conferência de linha (planilha editada à mão) ---------- */

function normalizeForCompare(field, value, block) {
  if (block.money.includes(field)) {
    const n = toNumberLike(value);
    return Number.isFinite(n) ? n.toFixed(2) : '';
  }
  if (field === 'status') return norm(value) === 'TRUE' ? 'TRUE' : 'FALSE';
  return norm(value);
}

function rowMatchesExpected(row, block, expected = {}) {
  const keys = Object.keys(expected || {}).filter((k) => block.fields[k] !== undefined);
  if (!keys.length) return true;
  return keys.every((k) => normalizeForCompare(k, getCell(row, block.fields[k]), block) === normalizeForCompare(k, expected[k], block));
}

/** Procura a linha certa: confere a linha indicada; se mudou, procura uma única linha igual dentro do bloco. */
function locateRow(rows, block, rowIndex, expected) {
  const hasExpected = expected && Object.keys(expected).some((k) => block.fields[k] !== undefined);
  const row = Number(rowIndex);
  if (Number.isFinite(row) && row >= 1) {
    if (!hasExpected || rowMatchesExpected(rows[row - 1] || [], block, expected)) return { row, moved: false };
  }
  if (!hasExpected) return { row: 0, moved: false };
  const headerIdx = findRowIndex(rows, block.isHeader);
  const hits = [];
  for (let i = Math.max(0, headerIdx + 1); i < rows.length; i += 1) {
    const r = rows[i] || [];
    if (!getCell(r, block.keyCol)) continue;
    if (rowMatchesExpected(r, block, expected)) hits.push(i + 1);
  }
  if (hits.length === 1) return { row: hits[0], moved: true };
  return { row: 0, moved: false, ambiguous: hits.length > 1 };
}

/** Normaliza payload com aliases e dinheiro. Devolve só os campos enviados. */
function pickBlockFields(block, payload = {}) {
  const out = {};
  for (const [alias, field] of Object.entries(block.aliases || {})) {
    if (Object.prototype.hasOwnProperty.call(payload, alias) && !Object.prototype.hasOwnProperty.call(payload, field)) {
      out[field] = payload[alias];
    }
  }
  for (const field of Object.keys(block.fields)) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) out[field] = payload[field];
  }
  for (const field of Object.keys(out)) {
    const v = out[field];
    if (block.money.includes(field)) out[field] = v === '' || v === null || v === undefined ? '' : normalizeMoney2(v);
    else if (field === 'status') out[field] = v === '' ? '' : (v === true || norm(v) === 'TRUE' ? 'TRUE' : 'FALSE');
    else out[field] = String(v ?? '').trim();
  }
  return out;
}

module.exports = {
  MONTHS_PT,
  MONTHS_PT_FULL,
  FINANCE_BLOCKS,
  findRowIndex,
  findFirstEmptyByCol,
  parseFinanceSnapshot,
  financeSnapshotHasResidents,
  parseMonthSheetTitle,
  monthLabel,
  listMonthSheets,
  findTitle,
  findTitleByCivilMonth,
  autoFinanceCandidates,
  splitCents,
  computeCollectiveShares,
  createRefId,
  buildRefTag,
  parseRefTag,
  stripAutoObs,
  autoObsParts,
  mergeLegacyObs,
  collectiveObs,
  settlementObs,
  rowMatchesExpected,
  locateRow,
  pickBlockFields,
};
