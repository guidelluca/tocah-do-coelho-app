const test = require('node:test');
const assert = require('node:assert/strict');
const { toNumberLike, normalizeMoney2, colLetter } = require('../src/lib/text');
const fin = require('../src/lib/finance');
const { weekKey, spDateKey } = require('../src/lib/time');
const feed = require('../src/lib/feed');

test('toNumberLike entende formatos BR e US', () => {
  assert.equal(toNumberLike('R$ 1.234,56'), 1234.56);
  assert.equal(toNumberLike('1,234.56'), 1234.56);
  assert.equal(toNumberLike('-38,90'), -38.9);
  assert.equal(toNumberLike(''), null);
  assert.equal(normalizeMoney2('12,5'), '12.50');
});

test('colLetter', () => {
  assert.equal(colLetter(0), 'A');
  assert.equal(colLetter(19), 'T');
  assert.equal(colLetter(26), 'AA');
});

test('parseMonthSheetTitle aceita os formatos usados', () => {
  for (const t of ['MAI_2026', 'MAIO_2026', '05_2026', '05-2026', 'MAI 2026', 'Maio 2026', 'MARÇO_2026', 'Novembro 2026']) {
    assert.ok(fin.parseMonthSheetTitle(t), t);
  }
  assert.equal(fin.parseMonthSheetTitle('Caixinha'), null);
  assert.equal(fin.monthLabel(fin.parseMonthSheetTitle('MAR_2026')), 'Março 2026');
});

test('AUTO escolhe a aba do mês civil e depois a mais recente', () => {
  const r = fin.autoFinanceCandidates(['MAI_2026', 'OUT_2026', 'Caixinha'], { year: 2026, month: 11 });
  assert.equal(r.preferred, null);
  assert.equal(r.ordered[0], 'OUT_2026');
  const r2 = fin.autoFinanceCandidates(['MAI_2026', 'NOV_2026'], { year: 2026, month: 11 });
  assert.equal(r2.preferred, 'NOV_2026');
});

test('divisão do gasto coletivo: regra atual (pagador fora) e centavos exatos', () => {
  const s = fin.computeCollectiveShares(100, ['A', 'B', 'C']);
  assert.deepEqual(s.map((x) => x.valor), [33.34, 33.33, 33.33]);
  const withPayer = fin.computeCollectiveShares(90, ['A', 'B'], true);
  assert.deepEqual(withPayer.map((x) => x.valor), [30, 30]);
});

test('obs automática não duplica ao editar', () => {
  const obs = 'Assaí | Divisão: 2 devedor(es) (R$ 50,00/devedor) • A, B → C | #gabc12';
  assert.equal(fin.stripAutoObs(obs), 'Assaí');
  const legacy = 'Divisao: 2 devedor(es) • A -> B';
  assert.equal(fin.mergeLegacyObs(`nota | ${legacy}`, `${legacy} | ${legacy}`), `nota | ${legacy}`);
  assert.deepEqual(fin.parseRefTag(obs), { id: 'gabc12'.slice(1), incluirPagador: false, tag: '#gabc12' });
});

test('locateRow relocaliza linha que mudou de lugar e recusa quando não acha', () => {
  const block = fin.FINANCE_BLOCKS.conta_fixa;
  const rows = [[], ['', 'Conta', 'Valor'], ['', 'Água', '10'], ['', 'Luz', '20']];
  assert.deepEqual(fin.locateRow(rows, block, 4, { conta: 'Água' }), { row: 3, moved: true });
  assert.equal(fin.locateRow(rows, block, 4, { conta: 'Gás' }).row, 0);
  assert.deepEqual(fin.locateRow(rows, block, 4, { conta: 'luz', valor: '20,00' }), { row: 4, moved: false });
});

test('pickBlockFields só devolve campos enviados', () => {
  const out = fin.pickBlockFields(fin.FINANCE_BLOCKS.conta_fixa, { conta: 'Luz', valor: '1,5', status: true });
  assert.deepEqual(out, { conta: 'Luz', valor: '1.50', status: 'TRUE' });
});

test('semana e data no fuso de São Paulo', () => {
  // Domingo 21h30 em SP = segunda 00h30 UTC: ainda é a semana do domingo.
  const d = new Date('2026-11-09T00:30:00Z');
  assert.equal(spDateKey(d), '2026-11-08');
  assert.equal(weekKey(d), '2026-W45');
});

test('Nilde: estado montado a partir dos posts do feed (rótulos antigos sem acento)', () => {
  const items = [
    { type: 'comment', target: 'NILDE', tarefa: 'Manha - Feno', actor: 'ramon', ts: '2026-11-06T11:00:00Z', rowIndex: 5 },
    { type: 'comment', target: 'NILDE', tarefa: 'Noite - Ração', actor: 'VITOR', ts: '2026-11-06T23:00:00Z', rowIndex: 6 },
    { type: 'comment', target: 'NILDE', tarefa: 'Manhã - Feno', actor: 'ALLAN', ts: '2026-11-06T12:00:00Z', rowIndex: 7 },
  ];
  const log = feed.buildNildeWeek(items, ['2026-11-06']);
  assert.equal(log['2026-11-06'].manha_feno.by, 'RAMON');
  assert.equal(log['2026-11-06'].noite_racao.by, 'VITOR');
});

test('extractScale ignora duplicados e não inventa tarefa', () => {
  const rows = [['Morador', 'Tarefa'], ['RAMON', 'Banheirão'], ['ramon', 'Outra'], ['VITOR']];
  assert.deepEqual(feed.extractScale(rows), [{ nome: 'RAMON', tarefa: 'Banheirão' }, { nome: 'VITOR', tarefa: '-' }]);
  assert.equal(feed.extractTaskForUser(rows, 'gustavo'), '');
});

test('acertos depois de uma linha apagada continuam aparecendo', () => {
  const rows = [];
  rows[1] = []; rows[1][19] = 'QUEM'; rows[1][20] = 'DEVE QUANTO';
  rows[2] = []; rows[2][19] = 'VITOR'; rows[2][20] = '10';
  rows[3] = [];
  rows[4] = []; rows[4][19] = 'RAMON'; rows[4][20] = '20';
  const snap = fin.parseFinanceSnapshot(rows.map((r) => r || []));
  assert.deepEqual(snap.acertosIndividuais.map((a) => a.quem), ['VITOR', 'RAMON']);
});

test('escala publicada pelo Apps Script (aba EscalaApp)', () => {
  const rows = [
    ['periodo', 'morador', 'tarefa', 'prazo', 'frequencia', 'descricao', 'extra', 'extraDescricao', 'atualizadoEm'],
    ['02/11 até 08/11', 'ALLAN', 'QUINTAL + COELHA NILDE 🐰', 'DIÁRIO', 'Diária', 'Varrer', '', '', ''],
    ['02/11 até 08/11', 'RAMON', 'COZINHA', 'DOMINGO', 'Semanal', 'Pia', 'BANHEIRÃO', 'Vaso', ''],
  ];
  const list = feed.parseEscalaApp(rows);
  assert.equal(list.length, 2);
  assert.equal(list[1].tarefa, 'Cozinha + Banheirão');
  assert.ok(feed.isBanheiraoTask(list[1].tarefa));
  assert.equal(list[0].tarefa, 'Quintal + Coelha Nilde 🐰');
});
