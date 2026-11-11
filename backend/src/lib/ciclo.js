/**
 * Ciclos semanais de tarefas: prazo, atraso, entrega com foto, avaliação e desempenho.
 * Tudo no horário de Brasília (UTC-3, sem horário de verão desde 2019).
 *
 * Linha do tempo de um ciclo (semana de segunda a domingo):
 *   segunda ........ domingo 23h59  → prazo das tarefas (Lavanderia e Panos: segunda 23h59)
 *   ...  quarta seguinte 23h59      → fim da tolerância (dá pra entregar atrasado até aqui)
 *   avaliação abre quando os 5 entregam OU quando a tolerância acaba
 *   ...  domingo seguinte 23h59     → avaliação fecha (ou antes, se todo mundo já avaliou)
 */
const { isoWeekFromYmd, spDateKey, pad2 } = require('./time');
const { norm } = require('./text');

const OFFSET = '-03:00';
const DAY = 24 * 60 * 60 * 1000;

const DEFAULT_RULES = {
  prazoDias: 6, // domingo (segunda + 6)
  prazoLavanderiaDias: 7, // segunda seguinte
  toleranciaDias: 9, // quarta seguinte
  fechamentoDias: 13, // domingo seguinte
  multaAuto: true,
  multaValor: 60,
  mediaMinima: 3,
  minAvaliacoes: 2,
  /** Só quem entra no rodízio do banheirão avalia o banheirão. */
  banheiraoGrupo: ['ALLAN', 'GUSTAVO', 'RAMON'],
};

function rulesFromConfig(config = {}) {
  const num = (v, d) => {
    if (v === undefined || v === null || String(v).trim() === '') return d;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : d;
  };
  const bool = (v, d) => {
    if (v === undefined || v === null || String(v).trim() === '') return d;
    const s = norm(v);
    if (!s) return d;
    return ['SIM', 'TRUE', '1', 'ON', 'LIGADO'].includes(s);
  };
  return {
    ...DEFAULT_RULES,
    toleranciaDias: 6 + Math.max(0, Math.min(6, num(config.avaliacaoToleranciaDias, 3))),
    multaAuto: bool(config.avaliacaoMultaAuto, DEFAULT_RULES.multaAuto),
    multaValor: Math.max(0, num(config.avaliacaoMultaValor, DEFAULT_RULES.multaValor)),
    mediaMinima: num(config.avaliacaoMediaMinima, DEFAULT_RULES.mediaMinima),
    minAvaliacoes: Math.max(1, Math.round(num(config.avaliacaoMinAvaliacoes, DEFAULT_RULES.minAvaliacoes))),
    banheiraoGrupo: String(config.banheiraoGrupo || '').trim()
      ? String(config.banheiraoGrupo).split(/[,;]/).map((x) => norm(x)).filter(Boolean)
      : DEFAULT_RULES.banheiraoGrupo,
  };
}

/* ---------- datas ---------- */

function ymdToUtcNoon(ymd) {
  return Date.parse(`${ymd}T12:00:00${OFFSET}`);
}

function addDays(ymd, n) {
  return spDateKey(new Date(ymdToUtcNoon(ymd) + n * DAY));
}

function endOfDay(ymd) {
  return Date.parse(`${ymd}T23:59:59.999${OFFSET}`);
}

function startOfDay(ymd) {
  return Date.parse(`${ymd}T00:00:00${OFFSET}`);
}

/** Segunda-feira (YYYY-MM-DD) da semana de `date` em São Paulo. */
function mondayOf(date = new Date()) {
  const ymd = spDateKey(date);
  const dow = new Date(ymdToUtcNoon(ymd)).getUTCDay() || 7; // 1..7 (seg..dom)
  return addDays(ymd, 1 - dow);
}

function cycleKeyFromMonday(monday) {
  const [y, m, d] = monday.split('-').map(Number);
  return isoWeekFromYmd(y, m, d);
}

function mondayFromCycleKey(key) {
  const m = String(key || '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return '';
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4, 12));
  const dow = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4.getTime() - (dow - 1) * DAY);
  const target = new Date(mondayW1.getTime() + (week - 1) * 7 * DAY);
  return `${target.getUTCFullYear()}-${pad2(target.getUTCMonth() + 1)}-${pad2(target.getUTCDate())}`;
}

function currentCycleKey(now = new Date()) {
  return cycleKeyFromMonday(mondayOf(now));
}

function shiftCycleKey(key, weeks) {
  const monday = mondayFromCycleKey(key);
  return monday ? cycleKeyFromMonday(addDays(monday, weeks * 7)) : '';
}

function isCycleKey(v) {
  return /^\d{4}-W\d{2}$/.test(String(v || '').trim());
}

function brShort(ymd) {
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
}

function cycleInfo(key, rules = DEFAULT_RULES) {
  const monday = mondayFromCycleKey(key);
  const sunday = addDays(monday, 6);
  return {
    key,
    monday,
    sunday,
    periodo: `${brShort(monday)} a ${brShort(sunday)}`,
    prazo: endOfDay(addDays(monday, rules.prazoDias)),
    prazoLavanderia: endOfDay(addDays(monday, rules.prazoLavanderiaDias)),
    tolerancia: endOfDay(addDays(monday, rules.toleranciaDias)),
    fechamento: endOfDay(addDays(monday, rules.fechamentoDias)),
    inicio: startOfDay(monday),
  };
}

function isLavanderia(tarefa) {
  return /LAVANDERIA/.test(norm(tarefa));
}

function hasBanheirao(entry) {
  return /BANHEIR/.test(norm(`${entry?.extra || ''} ${entry?.tarefa || ''}`));
}

function deadlineFor(tarefa, info) {
  return isLavanderia(tarefa) ? info.prazoLavanderia : info.prazo;
}

function podeAvaliarBanheirao(nome, rules = DEFAULT_RULES) {
  return (rules.banheiraoGrupo || DEFAULT_RULES.banheiraoGrupo).includes(norm(nome));
}

function lateDays(ts, deadline) {
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!Number.isFinite(t) || t <= deadline) return 0;
  return Math.ceil((t - deadline) / DAY);
}

/* ---------- estado do ciclo ---------- */

/**
 * @param {object} p
 * @param {string} p.key           ciclo (YYYY-Www)
 * @param {number} p.now           ms
 * @param {Array}  p.escala        [{nome, tarefa, extra}]
 * @param {object} p.checks        { NOME: {ts, photoDataUrl, tarefa} } entregas do ciclo
 * @param {Array}  p.ratingRows    linhas da aba AvaliacoesTarefas (sem cabeçalho)
 * @param {object} p.rules
 * @param {boolean} p.closedRecord já existe fechamento gravado na aba Desempenho
 */
/* ---------- ajustes manuais do admin (aba AjustesTarefas) ---------- */

const AJUSTES_HEADER = ['id', 'ciclo', 'morador', 'tipo', 'valor', 'motivo', 'por', 'em', 'ativo'];
const AJUSTE_TIPOS = ['prazo', 'tolerancia', 'fechamento', 'dispensa', 'abono', 'tarefa', 'abrir_avaliacao', 'fechar_avaliacao'];

function parseAjustes(rows = []) {
  return rows
    .filter((r, i) => !(i === 0 && norm(r[0]) === 'ID'))
    .map((r) => ({
      id: String(r[0] || '').trim(),
      ciclo: String(r[1] || '').trim(),
      morador: String(r[2] || '').trim().toUpperCase() || '*',
      tipo: String(r[3] || '').trim().toLowerCase(),
      valor: String(r[4] ?? '').trim(),
      motivo: String(r[5] || '').trim(),
      por: String(r[6] || '').trim(),
      em: String(r[7] || '').trim(),
      ativo: norm(r[8] || 'SIM') !== 'NAO',
    }))
    .filter((a) => a.id && isCycleKey(a.ciclo) && AJUSTE_TIPOS.includes(a.tipo));
}

/** Ajuste vigente: o mais recente ativo para o morador (ou "*" = todos). */
function makeAjusteGetter(ajustes = [], key) {
  const doCiclo = ajustes.filter((a) => a.ciclo === key && a.ativo).sort((a, b) => (a.em < b.em ? -1 : 1));
  return (morador, tipo) => {
    const nome = String(morador || '*').toUpperCase();
    let found = null;
    for (const a of doCiclo) if (a.tipo === tipo && (a.morador === nome || a.morador === '*')) {
      if (!found || a.morador === nome || found.morador === '*') found = a;
    }
    // individual vence o geral
    const indiv = doCiclo.filter((a) => a.tipo === tipo && a.morador === nome).pop();
    return indiv || found;
  };
}

function buildCycleState({ key, now = Date.now(), escala = [], checks = {}, ratingRows = [], rules = DEFAULT_RULES, closedRecord = false, ajustes = [] }) {
  const info = cycleInfo(key, rules);
  const aj = makeAjusteGetter(ajustes, key);
  const isoMs = (a) => (a && Number.isFinite(Date.parse(a.valor)) ? Date.parse(a.valor) : null);
  const geralFechamento = isoMs(aj('*', 'fechamento'));
  const residents = escala.map((e) => {
    const nome = String(e.nome || '').toUpperCase();
    const check = checks[nome];
    const tarefaAj = aj(nome, 'tarefa');
    const tarefa = tarefaAj ? tarefaAj.valor : e.tarefa || '';
    const deadline = isoMs(aj(nome, 'prazo')) ?? deadlineFor(tarefa, info);
    const tolerancia = Math.max(deadline, isoMs(aj(nome, 'tolerancia')) ?? info.tolerancia);
    const abono = aj(nome, 'abono');
    const dispensa = aj(nome, 'dispensa');
    const base = {
      nome,
      tarefa,
      extra: e.extra || '',
      banheirao: hasBanheirao({ ...e, tarefa }),
      prazo: new Date(deadline).toISOString(),
      tolerancia: new Date(tolerancia).toISOString(),
      ajustado: !!(tarefaAj || aj(nome, 'prazo') || aj(nome, 'tolerancia') || abono || dispensa),
      abonado: !!abono,
    };
    const atraso = (t) => (abono ? 0 : lateDays(t, deadline));
    if (check) return { ...base, status: 'entregue', entregueEm: check.ts, atrasoDias: atraso(check.ts), checkTs: check.ts, hasPhoto: !!check.photoDataUrl };
    if (dispensa) return { ...base, status: 'dispensado', motivoDispensa: dispensa.motivo, atrasoDias: 0 };
    if (now > tolerancia) return { ...base, status: 'nao_entregue', atrasoDias: atraso(tolerancia) };
    if (now > deadline) return { ...base, status: 'atrasada', atrasoDias: atraso(now) };
    return { ...base, status: 'no_prazo', atrasoDias: 0 };
  });

  const ativos = residents.filter((r) => r.status !== 'dispensado');
  const delivered = residents.filter((r) => r.status === 'entregue');
  const allDelivered = ativos.length > 0 && ativos.every((r) => r.status === 'entregue');
  const lastDelivery = delivered.reduce((max, r) => Math.max(max, Date.parse(r.entregueEm) || 0), 0);
  const fimTolerancia = ativos.reduce((max, r) => Math.max(max, Date.parse(r.tolerancia)), info.tolerancia);
  const abrirManual = aj('*', 'abrir_avaliacao');
  const opened = allDelivered || now > fimTolerancia || !!abrirManual;
  const abertaEm = opened
    ? new Date(abrirManual && !allDelivered && now <= fimTolerancia ? Date.parse(abrirManual.em) || now : allDelivered ? Math.min(lastDelivery, fimTolerancia) : fimTolerancia).toISOString()
    : '';
  const fechamento = Math.max(geralFechamento ?? info.fechamento, opened ? Date.parse(abertaEm) : 0);
  const fecharManual = aj('*', 'fechar_avaliacao');

  // Avaliações esperadas: cada morador avalia todos os outros que entregaram (casa + banheirão quando tem).
  const rows = ratingRows.filter((r) => String(r[0] || '').trim() === key);
  const given = new Set(rows.map((r) => `${norm(r[1])}|${norm(r[2])}|${String(r[7] || 'casa').trim().toLowerCase() || 'casa'}`));
  const expected = [];
  residents.forEach((rater) => {
    delivered.forEach((t) => {
      if (t.nome === rater.nome) return;
      expected.push({ actor: rater.nome, target: t.nome, categoria: 'casa' });
      if (t.banheirao && podeAvaliarBanheirao(rater.nome, rules)) expected.push({ actor: rater.nome, target: t.nome, categoria: 'banheirao' });
    });
  });
  const done = expected.filter((x) => given.has(`${norm(x.actor)}|${norm(x.target)}|${x.categoria}`));
  const allRated = opened && expected.length > 0 && done.length === expected.length;

  let phase = 'entregas';
  if (opened) phase = 'avaliacao';
  if (closedRecord || (opened && (now > fechamento || allRated || !!fecharManual || (delivered.length === 0 && now > fimTolerancia)))) phase = 'encerrada';

  const porAvaliador = {};
  residents.forEach((r) => {
    const mine = expected.filter((x) => x.actor === r.nome);
    porAvaliador[r.nome] = {
      total: mine.length,
      feitas: mine.filter((x) => given.has(`${norm(x.actor)}|${norm(x.target)}|${x.categoria}`)).length,
    };
  });

  return {
    key,
    periodo: info.periodo,
    inicio: new Date(info.inicio).toISOString(),
    prazo: new Date(info.prazo).toISOString(),
    prazoLavanderia: new Date(info.prazoLavanderia).toISOString(),
    tolerancia: new Date(fimTolerancia).toISOString(),
    fechamento: new Date(fechamento).toISOString(),
    phase,
    abertaEm,
    allDelivered,
    entregues: delivered.length,
    residents,
    avaliacoes: { esperadas: expected.length, feitas: done.length, porAvaliador },
    _rows: rows,
  };
}

/** O que já avaliei: { TARGET: { casa: true, banheirao: true } } */
function ratedMap(rows, actor) {
  const out = {};
  rows.forEach((r) => {
    if (norm(r[1]) !== norm(actor)) return;
    const t = String(r[2] || '').toUpperCase();
    const cat = String(r[7] || 'casa').trim().toLowerCase() || 'casa';
    out[t] = { ...(out[t] || {}), [cat]: true };
  });
  return out;
}

function avg(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
}

/** Resultado final de cada morador no ciclo (+ multa pela regra). */
function cycleResults(state, rules = DEFAULT_RULES) {
  return state.residents.map((r) => {
    const mine = state._rows.filter((x) => norm(x[2]) === norm(r.nome));
    const casa = mine.filter((x) => (String(x[7] || 'casa').trim().toLowerCase() || 'casa') === 'casa').map((x) => Number(x[3])).filter(Number.isFinite);
    const ban = mine
      .filter((x) => String(x[7] || '').trim().toLowerCase() === 'banheirao' && podeAvaliarBanheirao(x[1], rules))
      .map((x) => Number(x[3]))
      .filter(Number.isFinite);
    const comentarios = mine.map((x) => String(x[5] || '').trim()).filter(Boolean);
    const entregou = r.status === 'entregue';
    const dispensado = r.status === 'dispensado';
    const media = casa.length ? Math.round(avg(casa) * 100) / 100 : null;
    const motivos = [];
    if (rules.multaAuto && rules.multaValor > 0 && !dispensado) {
      if (!entregou) motivos.push('não entregou a tarefa até o fim da tolerância');
      else if (media !== null && casa.length >= rules.minAvaliacoes && media < rules.mediaMinima) {
        motivos.push(`média ${media.toFixed(1).replace('.', ',')} abaixo de ${String(rules.mediaMinima).replace('.', ',')}`);
      }
    }
    return {
      ciclo: state.key,
      nome: r.nome,
      tarefa: r.tarefa + (r.extra ? ` + ${r.extra}` : ''),
      entregou,
      dispensado,
      entregueEm: r.entregueEm || '',
      atrasoDias: r.atrasoDias || 0,
      media,
      nAvaliacoes: casa.length,
      mediaBanheirao: ban.length ? Math.round(avg(ban) * 100) / 100 : null,
      comentarios,
      multa: motivos.length ? rules.multaValor : 0,
      motivo: motivos.join('; '),
    };
  });
}

/* ---------- desempenho acumulado (aba Desempenho) ---------- */

const DESEMPENHO_HEADER = ['ciclo', 'morador', 'tarefa', 'entregou', 'entregueEm', 'atrasoDias', 'media', 'nAvaliacoes', 'mediaBanheirao', 'multa', 'motivo', 'fechadoEm'];

function resultToRow(r, fechadoEm) {
  const n = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  return [r.ciclo, r.nome, r.tarefa, r.dispensado ? 'DISPENSADO' : r.entregou ? 'SIM' : 'NÃO', r.entregueEm, r.atrasoDias, n(r.media), r.nAvaliacoes, n(r.mediaBanheirao), r.multa ? String(r.multa) : '0', r.motivo, fechadoEm];
}

function parseDesempenhoRows(rows = []) {
  const num = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  return rows
    .filter((r, i) => !(i === 0 && norm(r[0]) === 'CICLO'))
    .filter((r) => isCycleKey(r[0]) && String(r[1] || '').trim())
    .map((r) => ({
      ciclo: String(r[0]).trim(),
      nome: String(r[1]).trim().toUpperCase(),
      tarefa: String(r[2] || ''),
      entregou: norm(r[3]) === 'SIM',
      dispensado: norm(r[3]) === 'DISPENSADO',
      entregueEm: String(r[4] || ''),
      atrasoDias: num(r[5]) || 0,
      media: num(r[6]),
      nAvaliacoes: num(r[7]) || 0,
      mediaBanheirao: num(r[8]),
      multa: num(r[9]) || 0,
      motivo: String(r[10] || ''),
      fechadoEm: String(r[11] || ''),
    }));
}

function sortCyclesDesc(a, b) {
  return a < b ? 1 : a > b ? -1 : 0;
}

/** Estatísticas por morador e ranking (últimos `janela` ciclos fechados). */
function computeDesempenho(records = [], residents = [], janela = 8) {
  const ciclos = Array.from(new Set(records.map((r) => r.ciclo))).sort(sortCyclesDesc);
  const recentes = new Set(ciclos.slice(0, janela));
  const pessoas = residents.length ? residents.map((n) => String(n).toUpperCase()) : Array.from(new Set(records.map((r) => r.nome)));

  const stats = pessoas.map((nome) => {
    const all = records.filter((r) => r.nome === nome && !r.dispensado).sort((a, b) => sortCyclesDesc(a.ciclo, b.ciclo));
    const rec = all.filter((r) => recentes.has(r.ciclo));
    const entregas = rec.filter((r) => r.entregou);
    const noPrazo = entregas.filter((r) => !r.atrasoDias);
    const medias = rec.map((r) => r.media).filter((v) => v !== null);
    let sequencia = 0;
    for (const r of all) {
      if (r.entregou && !r.atrasoDias) sequencia++;
      else break;
    }
    const multas = all.filter((r) => r.multa > 0);
    return {
      nome,
      ciclos: rec.length,
      entregas: entregas.length,
      taxaEntrega: rec.length ? entregas.length / rec.length : null,
      pontualidade: entregas.length ? noPrazo.length / entregas.length : null,
      atrasoMedio: entregas.length ? avg(entregas.map((r) => r.atrasoDias)) : 0,
      media: medias.length ? Math.round(avg(medias) * 100) / 100 : null,
      sequenciaNoPrazo: sequencia,
      multas: multas.length,
      multasTotal: multas.reduce((s, r) => s + r.multa, 0),
      historico: all.slice(0, 12).map((r) => ({ ciclo: r.ciclo, media: r.media, entregou: r.entregou, atrasoDias: r.atrasoDias, multa: r.multa })),
    };
  });

  // Pontuação do ranking: 60% nota média, 25% pontualidade, 15% entregas.
  const score = (s) => {
    if (!s.ciclos) return -1;
    const nota = s.media === null ? 0 : s.media / 5;
    return Math.round((nota * 0.6 + (s.pontualidade || 0) * 0.25 + (s.taxaEntrega || 0) * 0.15) * 1000) / 10;
  };
  const ranking = stats
    .map((s) => ({ nome: s.nome, pontos: score(s) }))
    .filter((r) => r.pontos >= 0)
    .sort((a, b) => b.pontos - a.pontos);

  const ultimo = ciclos[0] || '';
  const doUltimo = records.filter((r) => r.ciclo === ultimo && r.media !== null).sort((a, b) => b.media - a.media);
  return {
    ciclos: ciclos.slice(0, janela),
    stats,
    ranking,
    destaqueUltimaSemana: doUltimo[0] ? { ciclo: ultimo, nome: doUltimo[0].nome, media: doUltimo[0].media } : null,
  };
}

/* ---------- escala por ciclo (aba CiclosEscala) ---------- */

function parseCiclosEscala(rows = []) {
  const out = {};
  rows.forEach((r, i) => {
    if (i === 0 && norm(r[0]) === 'CICLO') return;
    const ciclo = String(r[0] || '').trim();
    const nome = String(r[1] || '').trim().toUpperCase();
    if (!isCycleKey(ciclo) || !nome) return;
    if (!out[ciclo]) out[ciclo] = [];
    out[ciclo] = out[ciclo].filter((x) => x.nome !== nome);
    out[ciclo].push({ nome, tarefa: String(r[2] || '').trim(), extra: String(r[3] || '').trim() });
  });
  return out;
}

/** Entregas (checks) por ciclo — usa a coluna A (ciclo) quando preenchida. */
function checksByCycle(feedItems = [], key, fallbackWeekOf) {
  const map = {};
  for (const item of feedItems) {
    if (item.type !== 'check') continue;
    const ciclo = isCycleKey(item.week) ? item.week : fallbackWeekOf(item);
    if (ciclo !== key) continue;
    const who = String(item.actor || '').trim().toUpperCase();
    if (!who) continue;
    if (!map[who] || String(item.ts) < String(map[who].ts)) map[who] = item; // a primeira entrega vale
  }
  return map;
}

module.exports = {
  DEFAULT_RULES,
  DESEMPENHO_HEADER,
  AJUSTES_HEADER,
  AJUSTE_TIPOS,
  parseAjustes,
  makeAjusteGetter,
  rulesFromConfig,
  addDays,
  endOfDay,
  mondayOf,
  cycleKeyFromMonday,
  mondayFromCycleKey,
  currentCycleKey,
  shiftCycleKey,
  isCycleKey,
  cycleInfo,
  deadlineFor,
  lateDays,
  podeAvaliarBanheirao,
  isLavanderia,
  hasBanheirao,
  buildCycleState,
  ratedMap,
  cycleResults,
  resultToRow,
  parseDesempenhoRows,
  computeDesempenho,
  parseCiclosEscala,
  checksByCycle,
};
