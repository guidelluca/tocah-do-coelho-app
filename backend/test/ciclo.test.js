const test = require('node:test');
const assert = require('node:assert');
const c = require('../src/lib/ciclo');

const escala = [
  { nome: 'ALLAN', tarefa: 'Cozinha' },
  { nome: 'RAMON', tarefa: 'Sala, Corredor e Garagem', extra: 'BANHEIRÃO' },
  { nome: 'VITOR', tarefa: 'Lixo' },
  { nome: 'GUSTAVO', tarefa: 'Quintal + Coelha Nilde 🐰' },
  { nome: 'GUILHERME', tarefa: 'Lavanderia e Panos' },
];
const at = (s) => Date.parse(s);

test('ciclo: chaves, segunda e prazos', () => {
  assert.equal(c.mondayOf(new Date('2026-11-11T15:00:00-03:00')), '2026-11-09');
  assert.equal(c.mondayOf(new Date('2026-11-16T01:00:00-03:00')), '2026-11-16');
  assert.equal(c.mondayOf(new Date('2026-11-16T01:00:00Z')), '2026-11-09'); // ainda domingo em SP
  const key = c.currentCycleKey(new Date('2026-11-11T12:00:00-03:00'));
  assert.equal(key, '2026-W46');
  assert.equal(c.mondayFromCycleKey(key), '2026-11-09');
  assert.equal(c.shiftCycleKey(key, -1), '2026-W45');
  assert.equal(c.mondayFromCycleKey('2027-W01'), '2027-01-04');
  const info = c.cycleInfo(key);
  assert.equal(new Date(info.prazo).toISOString(), '2026-11-16T02:59:59.999Z'); // dom 15/11 23h59 SP
  assert.equal(c.deadlineFor('LAVANDERIA E PANOS', info), info.prazoLavanderia);
  assert.equal(new Date(info.tolerancia).toISOString(), '2026-11-19T02:59:59.999Z'); // qua 18/11
  assert.equal(info.periodo, '09/11 a 15/11');
});

test('ciclo: atraso em dias e status', () => {
  const key = '2026-W46';
  const info = c.cycleInfo(key);
  assert.equal(c.lateDays('2026-11-15T22:00:00-03:00', info.prazo), 0);
  assert.equal(c.lateDays('2026-11-16T09:00:00-03:00', info.prazo), 1);
  assert.equal(c.lateDays('2026-11-18T20:00:00-03:00', info.prazo), 3);
  assert.equal(c.lateDays('2026-11-16T20:00:00-03:00', info.prazoLavanderia), 0);
  const checks = {
    ALLAN: { ts: '2026-11-15T10:00:00-03:00', photoDataUrl: 'x' },
    GUILHERME: { ts: '2026-11-16T21:00:00-03:00', photoDataUrl: 'x' },
  };
  const s = c.buildCycleState({ key, now: at('2026-11-17T10:00:00-03:00'), escala, checks });
  const by = Object.fromEntries(s.residents.map((r) => [r.nome, r]));
  assert.equal(by.ALLAN.status, 'entregue');
  assert.equal(by.ALLAN.atrasoDias, 0);
  assert.equal(by.GUILHERME.atrasoDias, 0); // lavanderia vai até segunda
  assert.equal(by.RAMON.status, 'atrasada');
  assert.equal(by.RAMON.atrasoDias, 2);
  assert.equal(s.phase, 'entregas');
});

test('ciclo: avaliação abre com todos entregues e fecha quando todos avaliam', () => {
  const key = '2026-W46';
  const checks = Object.fromEntries(escala.map((e) => [e.nome, { ts: '2026-11-15T12:00:00-03:00', photoDataUrl: 'x' }]));
  const s = c.buildCycleState({ key, now: at('2026-11-15T13:00:00-03:00'), escala, checks });
  assert.equal(s.phase, 'avaliacao');
  assert.equal(s.avaliacoes.esperadas, 5 * 4 + 4); // + banheirão do Ramon avaliado por 4
  const rows = [];
  escala.forEach((a) => escala.forEach((t) => {
    if (a.nome === t.nome) return;
    rows.push([key, a.nome, t.nome, t.nome === 'VITOR' ? 2 : 5, t.tarefa, 'ok', '', 'casa']);
    if (t.extra) rows.push([key, a.nome, t.nome, 4, t.tarefa, '', '', 'banheirao']);
  }));
  const s2 = c.buildCycleState({ key, now: at('2026-11-16T13:00:00-03:00'), escala, checks, ratingRows: rows });
  assert.equal(s2.phase, 'encerrada');
  const res = c.cycleResults(s2, c.rulesFromConfig({}));
  const vitor = res.find((r) => r.nome === 'VITOR');
  assert.equal(vitor.media, 2);
  assert.equal(vitor.multa, 60);
  assert.match(vitor.motivo, /média 2,0/);
  assert.equal(res.find((r) => r.nome === 'RAMON').mediaBanheirao, 4);
  assert.equal(res.find((r) => r.nome === 'ALLAN').multa, 0);
});

test('ciclo: tolerância acaba → abre sem quem não entregou e gera multa', () => {
  const key = '2026-W46';
  const checks = { ALLAN: { ts: '2026-11-15T10:00:00-03:00' }, RAMON: { ts: '2026-11-18T23:00:00-03:00' } };
  const s = c.buildCycleState({ key, now: at('2026-11-19T00:30:00-03:00'), escala, checks });
  assert.equal(s.phase, 'avaliacao');
  assert.equal(s.residents.find((r) => r.nome === 'VITOR').status, 'nao_entregue');
  assert.equal(s.residents.find((r) => r.nome === 'RAMON').atrasoDias, 3);
  const res = c.cycleResults(s, c.rulesFromConfig({ avaliacaoMultaAuto: 'sim' }));
  assert.equal(res.find((r) => r.nome === 'VITOR').multa, 60);
  assert.equal(c.cycleResults(s, c.rulesFromConfig({ avaliacaoMultaAuto: 'não' })).find((r) => r.nome === 'VITOR').multa, 0);
  const late = c.buildCycleState({ key, now: at('2026-11-23T01:00:00-03:00'), escala, checks });
  assert.equal(late.phase, 'encerrada');
});

test('desempenho: linhas, ranking e sequência no prazo', () => {
  const rows = [c.DESEMPENHO_HEADER,
    ['2026-W45', 'ALLAN', 'Cozinha', 'SIM', '', '0', '4,5', '4', '', '0', '', ''],
    ['2026-W44', 'ALLAN', 'Sala', 'SIM', '', '0', '5', '4', '', '0', '', ''],
    ['2026-W45', 'VITOR', 'Lixo', 'NÃO', '', '3', '', '0', '', '60', 'não entregou', ''],
    ['2026-W44', 'VITOR', 'Cozinha', 'SIM', '', '2', '3,5', '4', '', '0', '', '']];
  const recs = c.parseDesempenhoRows(rows);
  assert.equal(recs.length, 4);
  const d = c.computeDesempenho(recs, ['ALLAN', 'VITOR', 'RAMON']);
  const allan = d.stats.find((s) => s.nome === 'ALLAN');
  assert.equal(allan.media, 4.75);
  assert.equal(allan.sequenciaNoPrazo, 2);
  assert.equal(d.ranking[0].nome, 'ALLAN');
  assert.equal(d.stats.find((s) => s.nome === 'VITOR').multasTotal, 60);
  assert.equal(d.destaqueUltimaSemana.nome, 'ALLAN');
  assert.equal(c.resultToRow({ ciclo: 'x', nome: 'A', tarefa: 't', entregou: true, entregueEm: '', atrasoDias: 0, media: 4.5, nAvaliacoes: 4, mediaBanheirao: null, multa: 0, motivo: '' }, 'f')[6], '4,5');
});

test('escala por ciclo e entregas por ciclo', () => {
  const map = c.parseCiclosEscala([['ciclo', 'morador'], ['2026-W45', 'allan', 'Cozinha', ''], ['2026-W45', 'ALLAN', 'Sala', '']]);
  assert.deepEqual(map['2026-W45'], [{ nome: 'ALLAN', tarefa: 'Sala', extra: '' }]);
  const feed = [
    { type: 'check', week: '2026-W45', ts: '2026-11-10T10:00:00Z', actor: 'RAMON' },
    { type: 'check', week: '2026-W46', ts: '2026-11-11T10:00:00Z', actor: 'RAMON' },
    { type: 'check', week: '', ts: '2026-11-03T10:00:00Z', actor: 'ALLAN' },
  ];
  const fb = () => '2026-W45';
  assert.deepEqual(Object.keys(c.checksByCycle(feed, '2026-W45', fb)).sort(), ['ALLAN', 'RAMON']);
});
