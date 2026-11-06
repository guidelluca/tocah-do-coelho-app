/**
 * BOT TOCAH — RODÍZIO DE TAREFAS
 * E-mails e painéis no visual do app · escala publicada no app (aba EscalaApp)
 * Lembretes pulam quem já marcou a tarefa no app (aba TarefasFeed)
 *
 * Se este projeto estiver no mesmo Apps Script que BotTocah-gastos-aluguel.gs, unifique onOpen()
 * em um único menu (não deixe duas funções onOpen).
 */

const LOGO_URL = 'https://lh3.googleusercontent.com/d/1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS';

function onOpen() {
  try {
    atualizarAbaPainelMes();
  } catch (e) {}

  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu('🚀 Envio das Tarefas Semanais');

  menu
      .addItem('📋 Abrir Painel de Ferramentas (Sidebar)', 'mostrarSidebarTarefas')
      .addItem('📅 VISUALIZAR ESCALA DO MÊS', 'mostrarPainelPrevisao')
      .addItem('✅ Status da semana (quem já marcou no app)', 'mostrarStatusDaSemana')
      .addItem('🔔 Plano de notificações', 'mostrarPainelNotificacoes')
      .addItem('📱 Abrir o app da casa', 'abrirAppDaCasa')
      .addSeparator()
      .addItem('📢 Enviar para TODOS (Email Único)', 'rodizioTarefasTocah')
      .addSeparator();

  const moradores = getListaMoradores();
  moradores.forEach(function (m) {
    menu.addItem('Enviar apenas para: ' + m.nome, 'enviarIndividual_' + m.nome.replace(/\s/g, ''));
  });

  menu
      .addSeparator()
      .addItem('🔄 Pular Rodízio Manualmente (Geral)', 'alertaAvancarRodizio')
      .addItem('🚿 Pular Rodízio SÓ Banheirão', 'alertaAvancarBanheirao')
      .addSeparator()
      .addItem('🚨 Enviar Lembrete de Multa (Geral)', 'lembreteUltimoDiaTocah')
      .addSeparator()
      .addItem('⏰ Ligar envio automático SEMANAL (Seg 8h)', 'configurarEnvioAutomaticoSegunda')
      .addItem('🚫 Desligar automático SEMANAL', 'removerEnvioAutomatico')
      .addSeparator()
      .addItem('📅 Ligar lembretes DIÁRIOS (Todo dia 8h)', 'configurarEnvioDiario')
      .addItem('🚫 Desligar lembretes DIÁRIOS', 'removerEnvioDiario')
      .addSeparator()
      .addItem('⏰ Ligar lembrete de DOMINGO 18h (só quem falta)', 'configurarLembreteDomingo')
      .addItem('🚫 Desligar lembrete de domingo', 'removerLembreteDomingo')
      .addSeparator()
      .addItem('🚿 Enviar só Banheirão (separado)', 'rodizioBanheiraoTocah')
      .addItem('🚨 Lembrete Banheirão', 'lembreteBanheiraoTocah')
      .addSeparator()
      .addItem('📱 Atualizar escala no app agora', 'publicarEscalaParaAppComAviso')
      .addItem('📱 Ligar atualização automática do app', 'instalarGatilhoEscalaApp')
      .addToUi();

  mostrarSidebarTarefas();
}

function mostrarSidebarTarefas() {
  var html = HtmlService.createHtmlOutput(getHtmlSidebar())
      .setTitle('🛠️ Ferramentas - Tarefas Tocah')
      .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(html);
}

function getHtmlSidebar() {
  const moradores = getListaMoradores();
  const feitos = concluidasNoApp_();
  const atribuicoes = getAtribuicoesSemana();
  const feitosN = atribuicoes.filter(function (a) { return feitos[normNome_(a.morador.nome)]; }).length;
  var botoesIndividuais = moradores.map(function (m, i) {
    var cor = TOCAH_AVATAR[i % TOCAH_AVATAR.length];
    var ok = feitos[normNome_(m.nome)];
    return '<button onclick="run(this,\'enviarIndividualPorNome\',\'' + m.nome + '\',\'E-mail enviado para ' + m.nome + '\')">' +
        '<span style="display:inline-flex;align-items:center;gap:10px;width:100%">' +
        '<span class="av" style="width:28px;height:28px;font-size:13px;background:' + cor.bg + ';color:' + cor.fg + '">' + m.nome.charAt(0) + '</span>' +
        '<span class="grow">' + m.nome.charAt(0) + m.nome.slice(1).toLowerCase() + '</span>' +
        (ok ? '<span class="pill ok">✅</span>' : '<span class="pill wait">⏳</span>') + '</span></button>';
  }).join('');

  return htmlPainelDoc_(
      '<div class="hero"><div class="ov light">Tarefas da casa</div><div class="h1">Ferramentas Tocah</div>' +
      '<div class="sub">' + String(getPeriodoValidade()).replace('🗓️ ', '') + ' · ' + feitosN + '/' + atribuicoes.length + ' feitas no app</div></div>' +
      '<button class="primary" onclick="run(this,\'rodizioTarefasTocah\',null,\'Escala enviada pra todos!\')">📢 Enviar escala pra todos</button>' +
      '<button class="soft" onclick="google.script.run.mostrarStatusDaSemana()">✅ Status da semana</button>' +
      '<button class="soft" onclick="google.script.run.mostrarPainelPrevisao()">📅 Escala das próximas 4 semanas</button>' +
      '<button class="soft" onclick="window.open(\'' + APP_URL + '\',\'_blank\')">📱 Abrir o app da casa</button>' +
      '<div class="sec" style="margin-top:14px">Enviar só para</div>' + botoesIndividuais +
      '<div class="sec" style="margin-top:14px">Rodízio</div>' +
      '<button onclick="if(confirm(\'Avançar a escala geral em 1 semana?\'))run(this,\'avancarRodizioManualmente\',null,\'Rodízio avançado! O app já foi atualizado.\')">🔄 Pular rodízio geral</button>' +
      '<button class="danger" onclick="if(confirm(\'Avançar só o banheirão pra próxima pessoa?\'))run(this,\'avancarBanheiraoManualmente\',null,\'Banheirão avançado!\')">🚿 Pular só o banheirão</button>' +
      '<div class="sec" style="margin-top:14px">Lembretes</div>' +
      '<button onclick="run(this,\'lembreteUltimoDiaTocah\',null,\'Lembrete de multa enviado!\')">🚨 Lembrete de multa (geral)</button>' +
      '<button onclick="run(this,\'lembreteDomingoPendentes\',null,\'Lembrete enviado só pra quem falta!\')">⏰ Lembrar só quem falta marcar</button>' +
      '<div class="sec" style="margin-top:14px">Automações</div>' +
      '<button onclick="run(this,\'configurarEnvioAutomaticoSegunda\',null,\'Envio de segunda ligado!\')">⏰ Ligar envio de segunda (8h)</button>' +
      '<button onclick="run(this,\'configurarEnvioDiario\',null,\'Lembretes diários ligados!\')">📅 Ligar lembretes diários (8h)</button>' +
      '<button onclick="run(this,\'configurarLembreteDomingo\',null,\'Lembrete de domingo ligado!\')">🔔 Ligar lembrete de domingo (18h)</button>' +
      '<button onclick="run(this,\'instalarGatilhoEscalaApp\',null,\'Atualização automática do app ligada!\')">📱 Ligar atualização do app</button>' +
      '<button class="soft" onclick="google.script.run.mostrarPainelNotificacoes()">🔔 Ver plano de notificações</button>' +
      '<div id="status" role="status"></div>' +
      '<script>' +
      'function msg(t,err){var el=document.getElementById("status");el.textContent=t;el.className=err?"err":"";el.style.display="block";clearTimeout(window._t);window._t=setTimeout(function(){el.style.display="none"},5000);}' +
      'function run(btn,fn,arg,ok){btn.disabled=true;var r=google.script.run.withSuccessHandler(function(){btn.disabled=false;msg("✅ "+ok)}).withFailureHandler(function(e){btn.disabled=false;msg("❌ "+(e&&e.message||e),true)});' +
      'arg===null?r[fn]():r[fn](arg);}' +
      '</script>'
  );
}

function getOffsetRotacao() {
  var props = PropertiesService.getDocumentProperties();
  var offset = props.getProperty('OFFSET_ROTACAO');
  return offset ? parseInt(offset, 10) : 0;
}

function avancarRodizioManualmente() {
  var props = PropertiesService.getDocumentProperties();
  props.setProperty('OFFSET_ROTACAO', String(getOffsetRotacao() + 1));
  atualizarAbaPainelMes();
}

function alertaAvancarRodizio() {
  var ui = SpreadsheetApp.getUi();
  if (
      ui.alert('🔄 Avançar Rodízio Geral', 'Tem certeza que deseja rotacionar TODOS os moradores?', ui.ButtonSet.YES_NO) ==
      ui.Button.YES
  ) {
    avancarRodizioManualmente();
    ui.alert('✅ Rodízio avançado com sucesso!');
  }
}

function getOffsetBanheirao() {
  var props = PropertiesService.getDocumentProperties();
  var offset = props.getProperty('OFFSET_BANHEIRAO');
  return offset ? parseInt(offset, 10) : 0;
}

function avancarBanheiraoManualmente() {
  var props = PropertiesService.getDocumentProperties();
  props.setProperty('OFFSET_BANHEIRAO', String(getOffsetBanheirao() + 1));
  atualizarAbaPainelMes();
}

function alertaAvancarBanheirao() {
  var ui = SpreadsheetApp.getUi();
  if (
      ui.alert(
          '🚿 Avançar SÓ Banheirão',
          'Tem certeza que deseja passar o banheirão para o próximo sem alterar as outras tarefas?',
          ui.ButtonSet.YES_NO
      ) == ui.Button.YES
  ) {
    avancarBanheiraoManualmente();
    ui.alert('✅ Banheirão avançado com sucesso!');
  }
}

function enviarIndividualPorNome(nome) {
  executarEnvioIndividual(false, nome);
}

function getListaMoradores() {
  return [
    { nome: 'ALLAN', email: 'allanmlima16@gmail.com', tel: '5519994945961' },
    { nome: 'RAMON', email: 'ramondominguess01@gmail.com', tel: '5531994335366' },
    { nome: 'GUSTAVO', email: 'gustavolucena2015@gmail.com', tel: '5582996959438' },
    { nome: 'GUILHERME', email: 'guilhermedeluca75@gmail.com', tel: '5512988931752' },
    { nome: 'VITOR', email: 'vitor.stolf2020@gmail.com', tel: '5519988501981' },
  ];
}

function getSemanaRotativa() {
  const dataReferencia = new Date(2024, 0, 1);
  const hoje = new Date();
  const msPorSemana = 7 * 24 * 60 * 60 * 1000;
  return Math.floor((hoje.getTime() - dataReferencia.getTime()) / msPorSemana) + getOffsetRotacao();
}

function getTarefasBase() {
  return [
    {
      area: 'COZINHA',
      prazo: 'DOMINGO',
      freq: 'Conforme demanda + diário',
      desc:
          'Limpar pia, fogão, trocar papel alumínio, limpar micro-ondas e filtro. Guardar louças sempre que o escorredor encher. O ralo da pia deve ser limpo todos os dias. Varrer e passar pano no chão até domingo.',
    },
    {
      area: 'SALA, CORREDOR E GARAGEM',
      prazo: 'DOMINGO',
      freq: 'Semanal',
      desc: 'Tirar lixos, destruir teias de aranha, varrer tudo, passar pano na TV/estante e organizar a bagunça.',
    },
    {
      area: 'QUINTAL + COELHA NILDE 🐰',
      prazo: 'DIÁRIO',
      freq: 'Quintal 2 em 2 dias / Nilde TODOS OS DIAS (2x)',
      desc:
          'Varrer toda a área externa e a lavanderia.<br><br>🥕 <b>ALIMENTAÇÃO DA NILDE:</b><br>• <b>Base (80%):</b> Feno de gramíneas à vontade (essencial para o desgaste dos dentes e digestão).<br>• <b>Manhã:</b> Feno novo + Folhas verdes escuras (rúcula, agrião, chicória).<br>• <b>Tarde/Noite:</b> Ração extrusada de qualidade (apenas 10-15% da dieta).<br>• <b>Água:</b> Trocar e manter fresca todo dia.<br>• <b>Atenção:</b> Petiscos como maçã (sem semente) e cenoura apenas 1 a 2 vezes por semana!',
    },
    {
      area: 'LAVANDERIA E PANOS',
      prazo: 'SEGUNDA-FEIRA',
      freq: 'Semanal',
      desc: 'Lavar todos os panos sujos. Limpar a lavanderia e varrer o chão.',
    },
  ];
}

function getTarefaVitor() {
  return {
    area: 'LIXO',
    prazo: 'DIÁRIO',
    freq: 'Diária',
    desc: 'Retirar lixos, levar orgânico na lixeira e organizar os recicláveis no portão lateral.',
  };
}

function getAtribuicoesSemana(offsetSemana) {
  if (offsetSemana === undefined) offsetSemana = 0;
  const moradores = getListaMoradores();
  const tarefas = getTarefasBase();
  const semanaAno = getSemanaRotativa() + offsetSemana;
  const atribuicoes = [];

  moradores.forEach(function (morador, i) {
    var tarefa;
    if (morador.nome === 'VITOR') {
      tarefa = getTarefaVitor();
    } else {
      const indice = (i + semanaAno) % tarefas.length;
      tarefa = Object.assign({}, tarefas[indice]);
    }
    atribuicoes.push({ morador: morador, tarefa: tarefa });
  });
  return atribuicoes;
}

function getBanheiraoSemana(offsetSemana) {
  if (offsetSemana === undefined) offsetSemana = 0;
  const moradores = getListaMoradores();
  const vitimasBanheirao = ['ALLAN', 'RAMON', 'GUSTAVO'];
  const semanaEfetivaBanheirao = getSemanaRotativa() + getOffsetBanheirao() + offsetSemana;
  const sorteadoNome = vitimasBanheirao[semanaEfetivaBanheirao % vitimasBanheirao.length];
  for (var i = 0; i < moradores.length; i++) {
    if (moradores[i].nome === sorteadoNome) return moradores[i];
  }
  return null;
}

function getTarefaBanheirao() {
  return {
    area: 'BANHEIRÃO',
    prazo: 'DOMINGO',
    freq: 'Semanal (rotativo)',
    desc: 'Lavar vaso, pia, box, limpar ralo, espelho e chão.',
  };
}

function getPeriodoValidade(offsetSemana) {
  if (offsetSemana === undefined) offsetSemana = 0;
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const distSegunda = diaSemana === 0 ? 6 : diaSemana - 1;

  const dataSegunda = new Date(hoje);
  dataSegunda.setDate(hoje.getDate() - distSegunda + offsetSemana * 7);

  const dataDomingo = new Date(dataSegunda);
  dataDomingo.setDate(dataSegunda.getDate() + 6);

  function formatarData(d) {
    return (
        String(d.getDate()).padStart(2, '0') +
        '/' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '/' +
        d.getFullYear()
    );
  }
  return '🗓️ ' + formatarData(dataSegunda) + ' até ' + formatarData(dataDomingo);
}

function rodizioTarefasTocah() {
  executarEnvioGeral(false);
}

function rodizioBanheiraoTocah() {
  executarEnvioSoloBanheirao(false);
}

function lembreteBanheiraoTocah() {
  executarEnvioSoloBanheirao(true);
}

function lembreteUltimoDiaTocah() {
  executarEnvioGeral(true);
}

function executarEnvioSoloBanheirao(isLembrete) {
  const banheiraoResp = getBanheiraoSemana();
  const tarefaBanheirao = getTarefaBanheirao();
  if (!banheiraoResp) {
    try {
      SpreadsheetApp.getUi().alert('❌ Não foi possível definir responsável pelo banheirão.');
    } catch (e) {}
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaWhats = ss.getSheetByName('Envios WhatsApp');
  const dadosAba = abaWhats ? abaWhats.getDataRange().getValues() : [];
  const htmlBody = montarHtmlEmailApenasBanheirao(isLembrete, banheiraoResp, tarefaBanheirao);
  const todosEmails = getListaMoradores()
      .map(function (m) {
        return m.email;
      })
      .join(', ');
  const assunto = (isLembrete ? '🚨 ' : '🚿 ') + 'Banheirão Tocah — ' + (isLembrete ? 'Lembrete (multa)' : 'Esta semana');
  MailApp.sendEmail({ to: todosEmails, subject: assunto, htmlBody: htmlBody });
  if (abaWhats) atualizarLinkWhatsBanheirao(banheiraoResp, tarefaBanheirao, isLembrete, abaWhats, dadosAba);
  try {
    SpreadsheetApp.getUi().alert('✅ Email do banheirão enviado para todos!');
  } catch (e) {}
}

function executarEnvioGeral(isLembrete, silencioso) {
  if (silencioso === undefined) silencioso = false;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaWhats = ss.getSheetByName('Envios WhatsApp');
  const dadosAba = abaWhats ? abaWhats.getDataRange().getValues() : [];
  const atribuicoes = getAtribuicoesSemana();
  const banheiraoResp = getBanheiraoSemana();
  const tarefaBanheirao = getTarefaBanheirao();
  const emoji = isLembrete ? '🚨' : '📋';

  const status = isLembrete ? concluidasNoApp_() : null;
  const htmlBody = montarHtmlEmailUnico(atribuicoes, isLembrete, banheiraoResp, tarefaBanheirao, status);
  const assunto = emoji + (isLembrete ? ' Escala Tocah · fechamento da semana' : ' Escala Tocah · tarefas da semana');
  const todosEmails = atribuicoes
      .map(function (a) {
        return a.morador.email;
      })
      .join(', ');

  MailApp.sendEmail({ to: todosEmails, subject: assunto, htmlBody: htmlBody });
  registrarLog(isLembrete ? 'Lembrete de multa' : 'Escala da semana', 'Enviado para todos');

  atribuicoes.forEach(function (a) {
    atualizarLinkWhatsTarefa(a.morador, a.tarefa, isLembrete, abaWhats, dadosAba);
  });
  if (banheiraoResp && abaWhats) {
    atualizarLinkWhatsBanheirao(banheiraoResp, tarefaBanheirao, isLembrete, abaWhats, dadosAba);
  }

  if (!silencioso) {
    try {
      SpreadsheetApp.getUi().alert('✅ Email enviado para todos com a escala completa!');
    } catch (e) {}
  }
}

function atualizarLinkWhatsTarefa(morador, tarefa, isLembrete, aba, dadosAba) {
  if (!aba) return;
  const textoWhats =
      (isLembrete ? '🚨 *Fechamento da semana · Tocah*' : '📋 *Escala da semana · Tocah*') +
      '\n\nOi, ' + morador.nome.charAt(0) + morador.nome.slice(1).toLowerCase() + '! Sua tarefa:' +
      '\n📍 *' + nomeBonitoTarefa_(tarefa.area) + '*' +
      '\n⏰ ' + prazoBonito_(tarefa.prazo) + ' · ' + tarefa.freq +
      '\n\n📝 ' + limparHtmlEscala_(tarefa.desc) +
      '\n\n✅ Quando terminar, marque no app: ' + APP_URL;
  const linkWhats = 'https://api.whatsapp.com/send?phone=' + morador.tel + '&text=' + encodeURIComponent(textoWhats);
  for (var j = 1; j < dadosAba.length; j++) {
    if (dadosAba[j][0] && dadosAba[j][0].toString().toUpperCase().indexOf(morador.nome) !== -1) {
      aba.getRange(j + 1, 7).setFormula('=HYPERLINK("' + linkWhats + '"; "📱 Link Tarefa")');
      break;
    }
  }
}

function atualizarLinkWhatsBanheirao(morador, tarefa, isLembrete, aba, dadosAba) {
  if (!aba) return;
  const textoWhats =
      (isLembrete ? '🚨 *Banheirão · último aviso*' : '🚿 *Banheirão da semana · Tocah*') +
      '\n\n' + morador.nome.charAt(0) + morador.nome.slice(1).toLowerCase() + ', o banheirão é seu nesta semana!' +
      '\n⏰ ' + prazoBonito_(tarefa.prazo) +
      '\n📝 ' + limparHtmlEscala_(tarefa.desc) +
      '\n\nApp da casa: ' + APP_URL;
  const linkWhats = 'https://api.whatsapp.com/send?phone=' + morador.tel + '&text=' + encodeURIComponent(textoWhats);
  for (var k = 1; k < dadosAba.length; k++) {
    if (dadosAba[k][0] && dadosAba[k][0].toString().toUpperCase().indexOf(morador.nome) !== -1) {
      aba.getRange(k + 1, 8).setFormula('=HYPERLINK("' + linkWhats + '"; "🚿 Link Banheirão")');
      break;
    }
  }
}

function executarEnvioIndividual(isLembrete, nomeEspecifico) {
  const atribuicoes = getAtribuicoesSemana();
  const morador = getListaMoradores().find(function (m) {
    return m.nome === nomeEspecifico;
  });
  if (!morador) {
    try { SpreadsheetApp.getUi().alert('❌ Morador não encontrado!'); } catch (e) {}
    throw new Error('Morador não encontrado: ' + nomeEspecifico);
  }
  const status = isLembrete ? concluidasNoApp_() : null;
  const htmlBody = montarHtmlEmailUnico(atribuicoes, isLembrete, getBanheiraoSemana(), getTarefaBanheirao(), status);
  MailApp.sendEmail({ to: morador.email, subject: '📋 Escala Tocah · tarefas da semana', htmlBody: htmlBody });
  registrarLog('Escala individual', 'Enviado para ' + nomeEspecifico);
  try { SpreadsheetApp.getUi().alert('✅ E-mail enviado para ' + nomeEspecifico); } catch (e) {}
}

function enviarIndividual_ALLAN() {
  executarEnvioIndividual(false, 'ALLAN');
}
function enviarIndividual_RAMON() {
  executarEnvioIndividual(false, 'RAMON');
}
function enviarIndividual_GUSTAVO() {
  executarEnvioIndividual(false, 'GUSTAVO');
}
function enviarIndividual_GUILHERME() {
  executarEnvioIndividual(false, 'GUILHERME');
}
function enviarIndividual_VITOR() {
  executarEnvioIndividual(false, 'VITOR');
}

function configurarEnvioAutomaticoSegunda() {
  removerEnvioAutomatico(true);
  ScriptApp.newTrigger('enviarEscalaAutomaticaSegunda').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  try {
    SpreadsheetApp.getUi().alert('✅ Semanal ativado (Seg 8h)!');
  } catch (e) {}
}

function removerEnvioAutomatico(silencioso) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarEscalaAutomaticaSegunda') ScriptApp.deleteTrigger(t);
  });
  if (!silencioso) {
    try {
      SpreadsheetApp.getUi().alert('✅ Desativado.');
    } catch (e) {}
  }
}

function enviarEscalaAutomaticaSegunda() {
  try {
    publicarEscalaParaApp();
  } catch (e) {}
  executarEnvioGeral(false, true);
}

function configurarEnvioDiario() {
  removerEnvioDiario(true);
  ScriptApp.newTrigger('enviarNotificacoesDiarias').timeBased().everyDays(1).atHour(8).create();
  try {
    SpreadsheetApp.getUi().alert('✅ Lembretes diários ativados para as 8h da manhã todos os dias!');
  } catch (e) {}
}

function removerEnvioDiario(silencioso) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarNotificacoesDiarias') ScriptApp.deleteTrigger(t);
  });
  if (!silencioso) {
    try {
      SpreadsheetApp.getUi().alert('✅ Lembretes diários desativados.');
    } catch (e) {}
  }
}

function enviarNotificacoesDiarias() {
  const atribuicoes = getAtribuicoesSemana();
  const banheiraoResp = getBanheiraoSemana();
  const tarefaBanheirao = getTarefaBanheirao();
  const feitos = concluidasNoApp_();

  // Segunda já tem o e-mail da escala às 8h: não manda o diário junto.
  const ehSegunda = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'u') === '1';
  const temSemanal = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'enviarEscalaAutomaticaSegunda';
  });
  if (ehSegunda && temSemanal) {
    registrarLog('Lembretes diários', 'Pulado: segunda já tem o e-mail da escala.');
    return;
  }

  var enviados = [];
  var pulados = [];
  atribuicoes.forEach(function (a) {
    if (feitos[normNome_(a.morador.nome)] && !tarefaDiaria_(a.tarefa)) {
      pulados.push(a.morador.nome);
      return;
    }
    var descExtra = banheiraoResp && a.morador.nome === banheiraoResp.nome ? htmlEmailExtraBanheirao(tarefaBanheirao) : '';
    var htmlBody = montarHtmlLembreteDiario(a.morador.nome, a.tarefa.area, a.tarefa.freq, a.tarefa.desc, descExtra, a.tarefa.prazo);
    MailApp.sendEmail({ to: a.morador.email, subject: 'Lembrete do dia · Tocah 🐰', htmlBody: htmlBody });
    enviados.push(a.morador.nome);
  });
  registrarLog('Lembretes diários', 'Enviados: ' + (enviados.join(', ') || '—') + (pulados.length ? ' · Já feitos no app: ' + pulados.join(', ') : ''));
}

function mostrarPainelPrevisao() {
  var htmlContent = getHtmlPrevisaoMes();
  var html = HtmlService.createHtmlOutput(htmlContent)
      .setTitle('📅 Escala do Mês - República Tocah')
      .setWidth(850)
      .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, '📅 Visão Geral - Próximas 4 Semanas');
}

function getHtmlPrevisaoMes() {
  var blocos = '';
  for (var w = 0; w < 4; w++) {
    var periodo = String(getPeriodoValidade(w)).replace('🗓️ ', '');
    var atribuicoes = getAtribuicoesSemana(w);
    var banheirao = getBanheiraoSemana(w);
    var tiles = atribuicoes.map(function (a) {
      return '<div class="tile"><div class="ov">' + a.morador.nome + '</div><div class="tt">' + nomeBonitoTarefa_(a.tarefa.area) + '</div></div>';
    }).join('');
    if (banheirao) tiles += '<div class="tile b"><div class="ov">' + banheirao.nome + '</div><div class="tt">🚿 Banheirão</div></div>';
    blocos += '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<div class="tt" style="font-size:15px">' + periodo + '</div>' + (w === 0 ? '<span class="pill pp">Semana atual</span>' : '') +
        '</div><div class="grid">' + tiles + '</div></div>';
  }
  return htmlPainelDoc_(
      '<div class="hero"><div class="ov light">Planejamento</div><div class="h1">Próximas 4 semanas</div>' +
      '<div class="sub">A semana atual é a mesma que aparece no app.</div></div>' + blocos);
}

function atualizarAbaPainelMes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomeAba = '📅 Escala do Mês';
  var aba = ss.getSheetByName(nomeAba);

  if (!aba) {
    aba = ss.insertSheet(nomeAba, 0);
  }
  aba.clear();

  aba.setColumnWidth(1, 220);
  aba.setColumnWidth(2, 130);
  aba.setColumnWidth(3, 160);
  aba.setColumnWidth(4, 160);
  aba.setColumnWidth(5, 130);
  aba.setColumnWidth(6, 120);
  aba.setColumnWidth(7, 140);

  aba
      .getRange('A1:G1')
      .merge()
      .setValue('🐰 REPÚBLICA TOCAH - PREVISÃO DE 4 SEMANAS')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setBackground('#4A148C')
      .setFontColor('white')
      .setFontSize(16)
      .setFontWeight('bold');
  aba.setRowHeight(1, 50);

  const headers = [
    '🗓️ PERÍODO DA SEMANA',
    '🍳 COZINHA',
    '📺 SALA/GARAGEM',
    '🥕 QUINTAL + NILDE',
    '🧺 LAVANDERIA',
    '🗑️ LIXO',
    '🚿 BANHEIRÃO',
  ];
  aba
      .getRange('A2:G2')
      .setValues([headers])
      .setBackground('#6A1B9A')
      .setFontColor('white')
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  aba.setRowHeight(2, 40);

  var rowData = [];
  var bgColors = [];

  function moradorPorTrechoArea(atribs, trecho) {
    for (var i = 0; i < atribs.length; i++) {
      if (atribs[i].tarefa.area.indexOf(trecho) !== -1) return atribs[i].morador.nome;
    }
    return '-';
  }

  for (var w = 0; w < 4; w++) {
    var periodo = getPeriodoValidade(w);
    var atribuicoes = getAtribuicoesSemana(w);
    var banheirao = getBanheiraoSemana(w);

    if (w === 0) periodo = '⭐ ' + periodo.replace('🗓️ ', '') + ' (ATUAL)';

    var pCozinha = moradorPorTrechoArea(atribuicoes, 'COZINHA');
    var pSala = moradorPorTrechoArea(atribuicoes, 'SALA');
    var pQuintal = moradorPorTrechoArea(atribuicoes, 'QUINTAL');
    var pLavanderia = moradorPorTrechoArea(atribuicoes, 'LAVANDERIA');
    var pLixo = moradorPorTrechoArea(atribuicoes, 'LIXO');
    var pBanheirao = banheirao ? banheirao.nome : '-';

    rowData.push([periodo, pCozinha, pSala, pQuintal, pLavanderia, pLixo, pBanheirao]);

    var corLinha = w === 0 ? '#F2E7F9' : w % 2 === 0 ? '#F6F4FA' : '#FFFFFF';
    bgColors.push([corLinha, corLinha, corLinha, corLinha, corLinha, corLinha, '#FBE6E8']);
  }

  var dataRange = aba.getRange(3, 1, rowData.length, 7); // antes era 6 fixo e dava erro com 4 linhas
  dataRange.setValues(rowData);
  dataRange.setBackgrounds(bgColors);
  dataRange.setHorizontalAlignment('center').setVerticalAlignment('middle').setFontSize(11);

  for (var r = 3; r <= 6; r++) {
    aba.setRowHeight(r, 45);
  }

  aba.getRange('A1:G6').setBorder(true, true, true, true, true, true, '#E7E2EF', SpreadsheetApp.BorderStyle.SOLID);
  aba.getRange('A3:A6').setFontWeight('bold').setFontColor('#4A148C');
  aba.getRange('G3:G6').setFontColor('#951E28').setFontWeight('bold');

  aba.setHiddenGridlines(true);
  aba.setFrozenRows(2);

  // Mantém o app Tocah em dia sempre que o painel é atualizado (abrir planilha, pular rodízio etc.)
  try {
    publicarEscalaParaApp();
  } catch (e) {
    registrarLog('ERRO EscalaApp', String(e));
  }
}

function registrarLog(acao, detalhes) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomeAba = 'LOG_SISTEMA';
  var abaLog = ss.getSheetByName(nomeAba);

  if (!abaLog) {
    abaLog = ss.insertSheet(nomeAba);
    abaLog.appendRow(['DATA E HORA', 'AÇÃO', 'DETALHES']);
    abaLog
        .getRange('A1:C1')
        .setBackground('#4a148c')
        .setFontColor('white')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');
    abaLog.setColumnWidth(1, 160);
    abaLog.setColumnWidth(2, 220);
    abaLog.setColumnWidth(3, 500);
    abaLog.setFrozenRows(1);
  }

  const agora = new Date();
  const dataFormatada = Utilities.formatDate(agora, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

  abaLog.appendRow([dataFormatada, acao, detalhes]);
}

function mostrarPainelNotificacoes() {
  var html = HtmlService.createHtmlOutput(getHtmlPlanoNotificacoes())
      .setTitle('🔔 Plano de Notificações - Tocah')
      .setWidth(700)
      .setHeight(550);
  SpreadsheetApp.getUi().showModalDialog(html, '🔔 Acompanhamento de Notificações da Semana');
}

function getHtmlPlanoNotificacoes() {
  const triggers = ScriptApp.getProjectTriggers();
  function tem(fn) { return triggers.some(function (t) { return t.getHandlerFunction() === fn; }); }
  const temSemanal = tem('enviarEscalaAutomaticaSegunda');
  const temDiario = tem('enviarNotificacoesDiarias');
  const temDomingo = tem('lembreteDomingoPendentes');
  const temApp = tem('publicarEscalaParaApp');

  const tz = 'America/Sao_Paulo';
  const agora = new Date();
  const ini = inicioSemanaSP_();
  const hojeKey = Utilities.formatDate(agora, tz, 'yyyy-MM-dd');
  const horaAgora = Number(Utilities.formatDate(agora, tz, 'H'));
  const nomes = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

  function tag(ativo, passou, hora) {
    if (!ativo) return '<span class="pill off">Desligado</span>';
    return passou ? '<span class="pill ok">Enviado</span>' : '<span class="pill wait">' + hora + '</span>';
  }

  var linhas = '';
  for (var i = 0; i < 7; i++) {
    var dia = new Date(ini.getTime() + i * 86400000 + 12 * 3600000);
    var key = Utilities.formatDate(dia, tz, 'yyyy-MM-dd');
    var passouDia = key < hojeKey;
    var ehHoje = key === hojeKey;
    var semanal = i === 0 ? tag(temSemanal, passouDia || (ehHoje && horaAgora >= 8), '8h') : '<span class="muted">—</span>';
    var diario = i === 0 && temSemanal ? '<span class="muted">no e-mail de segunda</span>' : tag(temDiario, passouDia || (ehHoje && horaAgora >= 8), '8h');
    var domingo = i === 6 ? tag(temDomingo, passouDia || (ehHoje && horaAgora >= 18), '18h') : '<span class="muted">—</span>';
    linhas += '<tr' + (ehHoje ? ' class="today"' : '') + '><td><b style="font-weight:900">' + nomes[i] + '</b> ' +
        Utilities.formatDate(dia, tz, 'dd/MM') + (ehHoje ? ' <span class="pill pp">Hoje</span>' : '') + '</td>' +
        '<td>' + semanal + '</td><td>' + diario + '</td><td>' + domingo + '</td></tr>';
  }

  return htmlPainelDoc_(
      '<div class="hero"><div class="ov light">Automações</div><div class="h1">Plano de notificações</div>' +
      '<div class="sub">Atualização do app: ' + (temApp ? 'ligada (seg 1h + todo dia 7h)' : 'desligada — ligue pelo menu') + '</div></div>' +
      '<div class="card"><table><thead><tr><th>Dia</th><th>Escala</th><th>Diário</th><th>Só quem falta</th></tr></thead><tbody>' +
      linhas + '</tbody></table></div>' +
      '<div class="muted center">Lembretes diários e de domingo pulam quem já marcou a tarefa no app (tarefas diárias sempre recebem o diário).</div>'
  );
}

/* =====================================================================
 * CONEXÃO COM O APP TOCAH
 * Publica a escala da semana atual na aba "EscalaApp" (uma linha por morador).
 * O app lê essa aba. Não mexa no cabeçalho dela; o conteúdo é regravado sozinho.
 * ===================================================================== */

const ABA_ESCALA_APP = 'EscalaApp';

function limparHtmlEscala_(t) {
  return String(t || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
}

function publicarEscalaParaApp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(ABA_ESCALA_APP) || ss.insertSheet(ABA_ESCALA_APP);

  const atribuicoes = getAtribuicoesSemana(0);
  const banheirao = getBanheiraoSemana(0);
  const tarefaBanheirao = getTarefaBanheirao();
  const periodo = String(getPeriodoValidade(0)).replace('🗓️ ', '');
  const agora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');

  const linhas = [['periodo', 'morador', 'tarefa', 'prazo', 'frequencia', 'descricao', 'extra', 'extraDescricao', 'atualizadoEm']];
  atribuicoes.forEach(function (a) {
    const temBanheirao = banheirao && banheirao.nome === a.morador.nome;
    linhas.push([
      periodo,
      a.morador.nome,
      a.tarefa.area,
      a.tarefa.prazo || '',
      a.tarefa.freq || '',
      limparHtmlEscala_(a.tarefa.desc),
      temBanheirao ? tarefaBanheirao.area : '',
      temBanheirao ? limparHtmlEscala_(tarefaBanheirao.desc) : '',
      agora,
    ]);
  });

  aba.clearContents();
  aba.getRange(1, 1, linhas.length, linhas[0].length).setNumberFormat('@').setValues(linhas);
  aba.setFrozenRows(1);
}

function publicarEscalaParaAppComAviso() {
  publicarEscalaParaApp();
  try {
    SpreadsheetApp.getUi().alert('✅ Escala publicada! O app atualiza em até 2 minutos.');
  } catch (e) {}
}

function instalarGatilhoEscalaApp() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'publicarEscalaParaApp') ScriptApp.deleteTrigger(t);
  });
  // Segunda de madrugada (virada da semana) e todo dia antes dos lembretes das 8h.
  ScriptApp.newTrigger('publicarEscalaParaApp').timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(1).inTimezone('America/Sao_Paulo').create();
  ScriptApp.newTrigger('publicarEscalaParaApp').timeBased()
      .everyDays(1).atHour(7).inTimezone('America/Sao_Paulo').create();
  publicarEscalaParaApp();
  try {
    SpreadsheetApp.getUi().alert('✅ Atualização automática do app ligada (seg 1h + todo dia 7h).');
  } catch (e) {}
}


/* =====================================================================
 * E-MAILS · identidade visual do app Tocah
 * (mesmas cores, cantos arredondados, avatares e fontes pesadas do app)
 * ===================================================================== */

const APP_URL = 'https://guidelluca.github.io/tocah-do-coelho-app/';

const TOCAH_COR = {
  bg: '#F6F4FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EFF8',
  text: '#1C1A26',
  textMuted: '#625D75',
  textSubtle: '#8F8AA3',
  border: '#E7E2EF',
  primary: '#6A1B9A',
  primaryDark: '#4A148C',
  primarySoft: '#F2E7F9',
  onPrimarySoft: '#55137E',
  dangerSoft: '#FBE6E8',
  onDangerSoft: '#951E28',
  danger: '#C42B37',
  warningSoft: '#FCF0DA',
  onWarningSoft: '#7A4700',
  successSoft: '#E4F4EA',
  onSuccessSoft: '#14663A',
};

const TOCAH_AVATAR = [
  { bg: '#EDE4FA', fg: '#5B21B6' },
  { bg: '#E0F0FD', fg: '#0B4A75' },
  { bg: '#DDF6E6', fg: '#14613A' },
  { bg: '#FDE4E8', fg: '#9F1239' },
  { bg: '#FCF0D6', fg: '#8A4B00' },
];

function htmlEmailFontStack() {
  return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
}

/** "SALA, CORREDOR E GARAGEM" -> "Sala, Corredor e Garagem" (como no app). */
function nomeBonitoTarefa_(valor) {
  var pequenas = ['E', 'DA', 'DE', 'DO', 'DAS', 'DOS', 'A', 'O'];
  return String(valor || '')
      .split(' ')
      .map(function (p, i) {
        if (!p) return p;
        var up = p.toUpperCase();
        if (i > 0 && pequenas.indexOf(up) !== -1) return p.toLowerCase();
        if (p !== up) return p;
        return p.charAt(0) + p.slice(1).toLowerCase();
      })
      .join(' ');
}

function prazoBonito_(prazo) {
  var p = String(prazo || '').trim();
  if (!p) return '';
  if (/^DI[ÁA]RIO$/i.test(p)) return 'Todo dia';
  return 'Até ' + p.toLowerCase();
}

function corAvatar_(nome) {
  var lista = getListaMoradores();
  var idx = -1;
  for (var i = 0; i < lista.length; i++) if (lista[i].nome === nome) idx = i;
  if (idx < 0) {
    idx = 0;
    for (var j = 0; j < String(nome).length; j++) idx = (idx + String(nome).charCodeAt(j)) % TOCAH_AVATAR.length;
  }
  return TOCAH_AVATAR[idx % TOCAH_AVATAR.length];
}

function htmlEmailAvatar_(nome, tamanho) {
  var t = tamanho || 44;
  var c = corAvatar_(nome);
  var ini = String(nome || '?').trim().charAt(0).toUpperCase();
  return (
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>' +
      '<td width="' + t + '" height="' + t + '" align="center" valign="middle" style="width:' + t + 'px;height:' + t + 'px;border-radius:50%;' +
      'background-color:' + c.bg + ';color:' + c.fg + ';font-family:' + htmlEmailFontStack() + ';font-size:' + Math.round(t * 0.42) +
      'px;font-weight:900;line-height:' + t + 'px;text-align:center;">' + ini + '</td></tr></table>'
  );
}

function htmlEmailPill_(texto, bg, fg) {
  return (
      '<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;background-color:' + bg +
      ';color:' + fg + ';font-family:' + htmlEmailFontStack() + ';font-size:12px;font-weight:800;line-height:1.2;">' + texto + '</span>'
  );
}

function htmlLogoTarefas() {
  if (!LOGO_URL) return '';
  return (
      '<img src="' + LOGO_URL + '" alt="Tocah" width="56" height="56" ' +
      'style="display:block;width:56px;height:56px;border-radius:50%;border:3px solid rgba(255,255,255,0.35);" />'
  );
}

function htmlEmailDocOpen(preheaderTexto) {
  var pre = preheaderTexto ?
      '<div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;overflow:hidden;mso-hide:all;">' +
      preheaderTexto + '</div>' : '';
  return (
      '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<meta name="color-scheme" content="light">\n<meta name="supported-color-schemes" content="light">\n</head>\n' +
      '<body style="margin:0;padding:0;background-color:' + TOCAH_COR.bg + ';-webkit-text-size-adjust:100%;">\n' + pre +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:' + TOCAH_COR.bg + ';border-collapse:collapse;">\n' +
      '<tr><td align="center" style="padding:24px 12px 32px;">\n' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">\n'
  );
}

function htmlEmailDocClose() {
  return '</table>\n</td></tr>\n</table>\n</body>\n</html>';
}

/** Cabeçalho igual ao card roxo do topo do app. */
function htmlEmailHeroRoxo(tituloPrincipal, linhaSecundaria, tituloSemCaixaAlta, overline) {
  var ff = htmlEmailFontStack();
  return (
      '<tr><td style="padding:0 0 14px;">\n' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:26px;' +
      'background-color:' + TOCAH_COR.primary + ';background-image:linear-gradient(135deg,' + TOCAH_COR.primary + ' 0%,' + TOCAH_COR.primaryDark + ' 100%);">\n' +
      '<tr><td style="padding:22px 22px 22px;">\n' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>\n' +
      '<td valign="middle" style="padding-right:14px;">' + htmlLogoTarefas() + '</td>\n' +
      '<td valign="middle" style="font-family:' + ff + ';">\n' +
      '<div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.78);">' +
      (overline || 'Painel da casa') + '</div>\n' +
      '<div style="margin-top:2px;font-size:20px;font-weight:900;line-height:1.2;color:#FFFFFF;">' + tituloPrincipal + '</div>\n' +
      '</td></tr></table>\n' +
      (linhaSecundaria ?
          '<div style="margin-top:14px;padding:10px 14px;border-radius:14px;background-color:rgba(255,255,255,0.16);' +
          'border:1px solid rgba(255,255,255,0.28);font-family:' + ff + ';font-size:13px;font-weight:700;color:#FFFFFF;line-height:1.4;">' +
          linhaSecundaria + '</div>\n' : '') +
      '</td></tr></table>\n' +
      '</td></tr>\n'
  );
}

function htmlEmailHeroRose(tituloPrincipal, linhaSecundaria) {
  return htmlEmailHeroRoxo(tituloPrincipal, linhaSecundaria, true, '🚿 Banheirão');
}

function htmlEmailCorpoAbre() {
  return '<tr><td style="font-family:' + htmlEmailFontStack() + ';">\n' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">\n';
}

function htmlEmailCorpoFecha() {
  return '</table>\n</td></tr>\n';
}

/** Card branco do app. */
function htmlEmailCard_(conteudo, estiloExtra) {
  return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border-collapse:separate;' +
      'border-radius:22px;background-color:' + TOCAH_COR.surface + ';border:1px solid ' + TOCAH_COR.border + ';' + (estiloExtra || '') + '">\n' +
      '<tr><td style="padding:18px 18px;font-family:' + htmlEmailFontStack() + ';">\n' + conteudo + '</td></tr></table>\n'
  );
}

function htmlEmailChipPeriodo(textoPeriodo) {
  var t = String(textoPeriodo || '').replace('🗓️ ', '');
  return '<div style="margin:0 0 12px;">' + htmlEmailPill_('🗓️ ' + t, TOCAH_COR.primarySoft, TOCAH_COR.onPrimarySoft) + '</div>\n';
}

function htmlEmailChipPeriodoRose(textoPeriodo) {
  var t = String(textoPeriodo || '').replace('🗓️ ', '');
  return '<div style="margin:0 0 12px;">' + htmlEmailPill_('🗓️ ' + t, TOCAH_COR.dangerSoft, TOCAH_COR.onDangerSoft) + '</div>\n';
}

function htmlEmailLead(texto, isAlerta) {
  var ff = htmlEmailFontStack();
  if (isAlerta) {
    return (
        '<div style="margin:0 0 12px;padding:14px 16px;border-radius:18px;background-color:' + TOCAH_COR.dangerSoft + ';font-family:' + ff +
        ';font-size:15px;font-weight:700;line-height:1.5;color:' + TOCAH_COR.onDangerSoft + ';">⏰ ' + texto + '</div>\n'
    );
  }
  return '<p style="margin:0 0 14px;padding:0 4px;font-family:' + ff + ';font-size:15px;font-weight:600;line-height:1.55;color:' +
      TOCAH_COR.textMuted + ';">' + texto + '</p>\n';
}

/** Mantida por compatibilidade (linha rótulo/valor). */
function htmlEmailCampoCard(label, valor, corAccent, icone) {
  return (
      '<tr><td style="padding:8px 0;border-bottom:1px solid ' + TOCAH_COR.border + ';font-family:' + htmlEmailFontStack() + ';">' +
      '<span style="font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:' + TOCAH_COR.textSubtle + ';">' +
      (icone ? icone + ' ' : '') + label + '</span><br>' +
      '<span style="font-size:15px;font-weight:700;color:' + TOCAH_COR.text + ';">' + valor + '</span></td></tr>\n'
  );
}

function htmlEmailLinhaGradiente() {
  return '';
}

function htmlEmailDescricao_(desc, cor) {
  return '<div style="margin-top:12px;font-size:14px;font-weight:600;line-height:1.6;color:' + (cor || TOCAH_COR.textMuted) + ';">' + desc + '</div>\n';
}

/** Quadro "Extra da semana" igual ao do card de tarefa do app. */
function htmlEmailExtraBanheirao(tarefaBanheirao) {
  return (
      '<div style="margin-top:14px;padding:14px 14px;border-radius:16px;background-color:' + TOCAH_COR.dangerSoft + ';">' +
      '<div style="font-size:13px;font-weight:800;color:' + TOCAH_COR.onDangerSoft + ';">🚿 Extra da semana: ' +
      nomeBonitoTarefa_(tarefaBanheirao.area) + ' · ' + prazoBonito_(tarefaBanheirao.prazo).toLowerCase() + '</div>' +
      '<div style="margin-top:6px;font-size:13px;font-weight:600;line-height:1.55;color:' + TOCAH_COR.onDangerSoft + ';">' +
      tarefaBanheirao.desc + '</div></div>\n'
  );
}

/** Card do morador: avatar + nome + tarefa + pílulas de prazo/frequência + descrição. */
function htmlEmailCartaoMorador_(nome, tarefa, extraHtml, destaque, feitoEm) {
  var ff = htmlEmailFontStack();
  var topo =
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>\n' +
      '<td width="56" valign="top" style="width:56px;">' + htmlEmailAvatar_(nome, 44) + '</td>\n' +
      '<td valign="top" style="font-family:' + ff + ';">\n' +
      '<div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:' + TOCAH_COR.textSubtle + ';">' + nome + '</div>\n' +
      '<div style="margin-top:2px;font-size:18px;font-weight:900;line-height:1.25;color:' + TOCAH_COR.text + ';">' + nomeBonitoTarefa_(tarefa.area) + '</div>\n' +
      '</td></tr></table>\n';
  var statusPill = '';
  if (feitoEm === false) statusPill = htmlEmailPill_('⏳ Falta marcar no app', TOCAH_COR.warningSoft, TOCAH_COR.onWarningSoft);
  else if (feitoEm) statusPill = htmlEmailPill_('✅ Feita no app', TOCAH_COR.successSoft, TOCAH_COR.onSuccessSoft);
  var pills = '<div style="margin-top:12px;">' + statusPill +
      (tarefa.prazo ? htmlEmailPill_(prazoBonito_(tarefa.prazo), TOCAH_COR.primarySoft, TOCAH_COR.onPrimarySoft) : '') +
      (tarefa.freq ? htmlEmailPill_(tarefa.freq, TOCAH_COR.surfaceAlt, TOCAH_COR.textMuted) : '') +
      '</div>\n';
  return htmlEmailCard_(topo + pills + htmlEmailDescricao_(tarefa.desc) + (extraHtml || ''),
      destaque ? 'border:2px solid ' + TOCAH_COR.primary + ';' : '');
}

function htmlEmailCartaoTarefaRoxo(nome, tarefa) {
  return htmlEmailCartaoMorador_(nome, tarefa, '');
}

function htmlEmailCartaoBanheirao(nome, tarefa) {
  var ff = htmlEmailFontStack();
  var topo =
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>\n' +
      '<td width="56" valign="top" style="width:56px;">' + htmlEmailAvatar_(nome, 44) + '</td>\n' +
      '<td valign="top" style="font-family:' + ff + ';">\n' +
      '<div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:' + TOCAH_COR.onDangerSoft + ';">Banheirão · ' + nome + '</div>\n' +
      '<div style="margin-top:2px;font-size:18px;font-weight:900;line-height:1.25;color:' + TOCAH_COR.text + ';">' + nomeBonitoTarefa_(tarefa.area) + '</div>\n' +
      '</td></tr></table>\n';
  var pills = '<div style="margin-top:12px;">' +
      htmlEmailPill_(prazoBonito_(tarefa.prazo), TOCAH_COR.dangerSoft, TOCAH_COR.onDangerSoft) +
      htmlEmailPill_(tarefa.freq, TOCAH_COR.surfaceAlt, TOCAH_COR.textMuted) + '</div>\n';
  return htmlEmailCard_(topo + pills + htmlEmailDescricao_(tarefa.desc));
}

function htmlEmailSeparadorBanheirao() {
  return '';
}

function htmlEmailCaixaMulta() {
  return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border-collapse:separate;' +
      'border-radius:18px;background-color:' + TOCAH_COR.warningSoft + ';">\n' +
      '<tr><td style="padding:14px 16px;font-family:' + htmlEmailFontStack() + ';font-size:13px;font-weight:600;line-height:1.55;color:' + TOCAH_COR.onWarningSoft + ';">' +
      '⚠️ <b style="font-weight:800;">Regras da casa:</b> multa de <b style="font-weight:800;">R$&nbsp;60,00</b> para a caixinha ' +
      'em caso de descumprimento ou atraso recorrente nas tarefas combinadas.</td></tr></table>\n'
  );
}

function htmlEmailBotaoApp_() {
  if (!APP_URL) return '';
  return (
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px;border-collapse:separate;"><tr>' +
      '<td align="center" style="border-radius:16px;background-color:' + TOCAH_COR.primary + ';">' +
      '<a href="' + APP_URL + '" style="display:block;padding:15px 18px;font-family:' + htmlEmailFontStack() +
      ';font-size:15px;font-weight:900;color:#FFFFFF;text-decoration:none;border-radius:16px;">Abrir o app da casa 🐰</a></td></tr></table>\n'
  );
}

function htmlEmailRodape() {
  return (
      '<tr><td align="center" style="padding:10px 16px 0;font-family:' + htmlEmailFontStack() + ';">\n' +
      htmlEmailBotaoApp_() +
      '<div style="margin-top:8px;font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:' + TOCAH_COR.textSubtle + ';">' +
      '🐰 República Tocah do Coelho</div>\n' +
      '<div style="margin-top:6px;font-size:12px;font-weight:600;line-height:1.5;color:' + TOCAH_COR.textSubtle + ';">' +
      'Mensagem automática das tarefas. Marque como feita no app ou alinhe no grupo da casa.</div>\n' +
      '</td></tr>\n'
  );
}

function htmlEmailSpacer(px) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td style="font-size:0;line-height:0;height:' + px + 'px;">&nbsp;</td></tr></table>';
}

/* ---------- Montagem dos 3 e-mails ---------- */

function montarHtmlEmailUnico(atribuicoes, isLembrete, banheiraoResp, tarefaBanheirao, statusApp) {
  const periodo = getPeriodoValidade();
  const preheader = isLembrete ?
      'Prazo no fim da semana — confira o que falta na Tocah.' :
      'Escala da semana: quem cuida de cada área, prazos e o que fazer.';
  var intro = isLembrete ?
      'O prazo da semana está acabando. Confiram o que falta pra ninguém pagar multa:' :
      'Quem cuida de cada área nesta semana, até quando e o que fazer. Quando terminar, marque como feita no app.';
  if (isLembrete && statusApp) {
    var faltam = atribuicoes.filter(function (a) { return !statusApp[normNome_(a.morador.nome)]; })
        .map(function (a) { return a.morador.nome.charAt(0) + a.morador.nome.slice(1).toLowerCase(); });
    intro = faltam.length ?
        'O prazo da semana está acabando. Ainda falta marcar no app: <b>' + faltam.join(', ') + '</b>.' :
        'Todo mundo já marcou a tarefa no app nesta semana. Valeu, galera! 🎉';
  }

  var cards = '';
  atribuicoes.forEach(function (a) {
    var temB = banheiraoResp && banheiraoResp.nome === a.morador.nome && tarefaBanheirao;
    var feitoEm = statusApp ? (statusApp[normNome_(a.morador.nome)] || false) : undefined;
    cards += '<tr><td>' + htmlEmailCartaoMorador_(a.morador.nome, a.tarefa, temB ? htmlEmailExtraBanheirao(tarefaBanheirao) : '', false, feitoEm) + '</td></tr>\n';
  });

  return (
      htmlEmailDocOpen(preheader) +
      htmlEmailHeroRoxo('República Tocah do Coelho', isLembrete ? '🚨 Lembrete de fechamento da semana' : '📋 Tarefas da semana', false,
          isLembrete ? 'Lembrete' : 'Escala da semana') +
      htmlEmailCorpoAbre() +
      '<tr><td>' + htmlEmailChipPeriodo(periodo) + htmlEmailLead(intro, isLembrete) + '</td></tr>\n' +
      cards +
      '<tr><td>' + htmlEmailCaixaMulta() + '</td></tr>\n' +
      htmlEmailCorpoFecha() +
      htmlEmailRodape() +
      htmlEmailDocClose()
  );
}

function montarHtmlLembreteDiario(nomeMorador, areaResumo, freq, descHtml, extraBanheiraoHtml, prazo, ultimoDia) {
  const periodo = getPeriodoValidade();
  const preheader = ultimoDia ?
      'Último dia da semana — falta marcar sua tarefa no app.' :
      'Oi, ' + nomeMorador + ' — sua tarefa de hoje na Tocah.';
  var tarefa = { area: areaResumo, prazo: prazo || '', freq: freq, desc: descHtml };
  return (
      htmlEmailDocOpen(preheader) +
      htmlEmailHeroRoxo('Oi, ' + nomeMorador.charAt(0) + nomeMorador.slice(1).toLowerCase() + '!',
          ultimoDia ? '⏰ Hoje é o último dia da semana' : 'Valeu por cuidar da casa 💜', true, ultimoDia ? 'Último dia' : 'Lembrete do dia') +
      htmlEmailCorpoAbre() +
      '<tr><td>' + htmlEmailChipPeriodo(periodo) +
      htmlEmailLead(ultimoDia ?
          'Sua tarefa ainda não está marcada como feita no app. Se já fez, é só marcar; se não, ainda dá tempo:' :
          'Um toque rápido pra manter a rotina em dia. Essa é a sua tarefa da semana:', !!ultimoDia) + '</td></tr>\n' +
      '<tr><td>' + htmlEmailCartaoMorador_(nomeMorador, tarefa, extraBanheiraoHtml || '', true, ultimoDia ? false : undefined) + '</td></tr>\n' +
      '<tr><td>' + htmlEmailCaixaMulta() + '</td></tr>\n' +
      htmlEmailCorpoFecha() +
      htmlEmailRodape() +
      htmlEmailDocClose()
  );
}

function montarHtmlEmailApenasBanheirao(isLembrete, banheiraoResp, tarefaBanheirao) {
  const periodo = getPeriodoValidade();
  const preheader = isLembrete ? 'Último aviso: banheirão até domingo.' : 'Quem está no banheirão nesta semana.';
  const intro = isLembrete ?
      'Última chamada: o banheirão precisa estar em ordem até domingo. Multa de R$ 60,00, como combinado.' :
      'Escala do banheirão desta semana: prazo e o que fazer.';
  return (
      htmlEmailDocOpen(preheader) +
      htmlEmailHeroRose('República Tocah do Coelho', isLembrete ? '🚨 Lembrete de fechamento' : 'Rotina semanal da casa') +
      htmlEmailCorpoAbre() +
      '<tr><td>' + htmlEmailChipPeriodoRose(periodo) + htmlEmailLead(intro, isLembrete) +
      htmlEmailCartaoBanheirao(banheiraoResp.nome, tarefaBanheirao) + '</td></tr>\n' +
      '<tr><td>' + htmlEmailCaixaMulta() + '</td></tr>\n' +
      htmlEmailCorpoFecha() +
      htmlEmailRodape() +
      htmlEmailDocClose()
  );
}


/* =====================================================================
 * STATUS DO APP · quem já marcou a tarefa como feita nesta semana
 * O app grava cada "concluí" na aba TarefasFeed (tipo "check").
 * ===================================================================== */

function normNome_(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

/** Segunda-feira 00:00 (horário de Brasília) da semana atual. */
function inicioSemanaSP_() {
  var agora = new Date();
  var diaSemana = Number(Utilities.formatDate(agora, 'America/Sao_Paulo', 'u')); // 1 = segunda ... 7 = domingo
  var hojeStr = Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd');
  var hoje0 = new Date(hojeStr + 'T00:00:00-03:00');
  return new Date(hoje0.getTime() - (diaSemana - 1) * 24 * 60 * 60 * 1000);
}

/** { NOME: Date } de quem já concluiu a tarefa da semana pelo app. */
function concluidasNoApp_() {
  var feitos = {};
  try {
    var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('TarefasFeed');
    if (!aba || aba.getLastRow() < 1) return feitos;
    var ini = inicioSemanaSP_().getTime();
    var fim = ini + 7 * 24 * 60 * 60 * 1000;
    var linhas = aba.getRange(1, 1, aba.getLastRow(), 4).getValues(); // semana | ts | tipo | quem
    linhas.forEach(function (l) {
      if (String(l[2]).toLowerCase() !== 'check') return;
      var ts = l[1] instanceof Date ? l[1] : new Date(String(l[1]));
      if (isNaN(ts.getTime()) || ts.getTime() < ini || ts.getTime() >= fim) return;
      var quem = normNome_(l[3]);
      if (quem) feitos[quem] = ts;
    });
  } catch (e) {
    registrarLog('ERRO status do app', String(e));
  }
  return feitos;
}

function tarefaDiaria_(tarefa) {
  return /^DI[ÁA]RIO$/i.test(String((tarefa && tarefa.prazo) || '').trim());
}

/* =====================================================================
 * LEMBRETE AUTOMÁTICO DE DOMINGO · só para quem ainda não marcou no app
 * ===================================================================== */

function lembreteDomingoPendentes() {
  var atribuicoes = getAtribuicoesSemana();
  var feitos = concluidasNoApp_();
  var banheiraoResp = getBanheiraoSemana();
  var tarefaBanheirao = getTarefaBanheirao();
  var pendentes = atribuicoes.filter(function (a) { return !feitos[normNome_(a.morador.nome)]; });
  if (!pendentes.length) {
    registrarLog('Lembrete de domingo', 'Ninguém pendente — todo mundo marcou no app 🎉');
    return;
  }
  pendentes.forEach(function (a) {
    var extra = banheiraoResp && banheiraoResp.nome === a.morador.nome ? htmlEmailExtraBanheirao(tarefaBanheirao) : '';
    var html = montarHtmlLembreteDiario(a.morador.nome, a.tarefa.area, a.tarefa.freq, a.tarefa.desc, extra, a.tarefa.prazo, true);
    MailApp.sendEmail({ to: a.morador.email, subject: '⏰ Último dia · marque sua tarefa no app Tocah', htmlBody: html });
  });
  registrarLog('Lembrete de domingo', 'Enviado para: ' + pendentes.map(function (a) { return a.morador.nome; }).join(', '));
}

function configurarLembreteDomingo() {
  removerLembreteDomingo(true);
  ScriptApp.newTrigger('lembreteDomingoPendentes').timeBased()
      .onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(18).inTimezone('America/Sao_Paulo').create();
  try {
    SpreadsheetApp.getUi().alert('✅ Lembrete de domingo ligado (18h), só para quem ainda não marcou a tarefa no app.');
  } catch (e) {}
}

function removerLembreteDomingo(silencioso) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'lembreteDomingoPendentes') ScriptApp.deleteTrigger(t);
  });
  if (!silencioso) {
    try {
      SpreadsheetApp.getUi().alert('✅ Lembrete de domingo desligado.');
    } catch (e) {}
  }
}

/* =====================================================================
 * STATUS DA SEMANA NA PLANILHA (quem marcou no app)
 * ===================================================================== */

function mostrarStatusDaSemana() {
  var html = HtmlService.createHtmlOutput(getHtmlStatusSemana()).setWidth(460).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Status da semana · Tocah');
}

function getHtmlStatusSemana() {
  var atribuicoes = getAtribuicoesSemana();
  var feitos = concluidasNoApp_();
  var banheiro = getBanheiraoSemana();
  var feitosN = 0;
  var linhas = atribuicoes.map(function (a, i) {
    var quando = feitos[normNome_(a.morador.nome)];
    if (quando) feitosN++;
    var cor = TOCAH_AVATAR[i % TOCAH_AVATAR.length];
    return '<div class="row">' +
        '<div class="av" style="background:' + cor.bg + ';color:' + cor.fg + '">' + a.morador.nome.charAt(0) + '</div>' +
        '<div class="grow"><div class="ov">' + a.morador.nome + (banheiro && banheiro.nome === a.morador.nome ? ' · 🚿 banheirão' : '') + '</div>' +
        '<div class="tt">' + nomeBonitoTarefa_(a.tarefa.area) + '</div></div>' +
        (quando ?
          '<span class="pill ok">✅ ' + Utilities.formatDate(quando, 'America/Sao_Paulo', "EEE HH'h'mm") + '</span>' :
          '<span class="pill wait">⏳ Pendente</span>') +
        '</div>';
  }).join('');
  var pct = Math.round((feitosN / Math.max(1, atribuicoes.length)) * 100);
  return htmlPainelDoc_(
      '<div class="hero"><div class="ov light">' + String(getPeriodoValidade()).replace('🗓️ ', '') + '</div>' +
      '<div class="h1">Status da semana</div>' +
      '<div class="sub">' + feitosN + ' de ' + atribuicoes.length + ' já marcaram no app</div>' +
      '<div class="bar"><div style="width:' + pct + '%"></div></div></div>' +
      '<div class="card">' + linhas + '</div>' +
      '<div class="muted center">Lido da aba TarefasFeed (o que o app grava quando alguém conclui).</div>'
  );
}

/* =====================================================================
 * VISUAL DOS PAINÉIS DA PLANILHA (sidebar e janelas) · igual ao app
 * ===================================================================== */

function htmlPainelCss_() {
  return (
      '<style>' +
      ':root{--bg:#F6F4FA;--sf:#FFFFFF;--alt:#F3EFF8;--tx:#1C1A26;--mu:#625D75;--su:#8F8AA3;--bd:#E7E2EF;' +
      '--p:#6A1B9A;--pd:#4A148C;--ps:#F2E7F9;--ops:#55137E;--ds:#FBE6E8;--ods:#951E28;--ws:#FCF0DA;--ows:#7A4700;--ss:#E4F4EA;--oss:#14663A}' +
      '@media (prefers-color-scheme:dark){:root{--bg:#110F17;--sf:#1B1924;--alt:#23202E;--tx:#F3F0FA;--mu:#B3ADC4;--su:#827C96;--bd:#2D2939;' +
      '--p:#C894EA;--pd:#4A148C;--ps:#2E2140;--ops:#E6CFF6;--ds:#3A1A20;--ods:#FFB3BA;--ws:#352813;--ows:#F8D49C;--ss:#17301F;--oss:#9BE6BA}}' +
      '*{box-sizing:border-box}body{margin:0;padding:14px;background:var(--bg);color:var(--tx);' +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:600}" +
      '.hero{border-radius:22px;padding:16px;margin-bottom:12px;color:#fff;background:linear-gradient(135deg,#6A1B9A,#4A148C)}' +
      '.ov{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--su)}.ov.light{color:rgba(255,255,255,.78)}' +
      '.h1{font-size:19px;font-weight:900;margin-top:2px}.sub{font-size:13px;margin-top:4px;color:rgba(255,255,255,.85)}' +
      '.bar{height:8px;border-radius:99px;background:rgba(255,255,255,.25);margin-top:10px;overflow:hidden}.bar div{height:100%;background:#fff;border-radius:99px}' +
      '.card{background:var(--sf);border:1px solid var(--bd);border-radius:20px;padding:12px 14px;margin-bottom:12px}' +
      '.sec{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--p);margin:4px 2px 8px}' +
      '.row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bd)}.row:last-child{border-bottom:0}' +
      '.av{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;flex:none}' +
      '.grow{flex:1;min-width:0}.tt{font-size:14px;font-weight:900}' +
      '.pill{display:inline-block;padding:5px 10px;border-radius:99px;font-size:11px;font-weight:800;white-space:nowrap}' +
      '.ok{background:var(--ss);color:var(--oss)}.wait{background:var(--ws);color:var(--ows)}.off{background:var(--ds);color:var(--ods)}.pp{background:var(--ps);color:var(--ops)}' +
      'button{width:100%;min-height:44px;border:0;border-radius:14px;padding:11px 14px;margin-bottom:8px;font:inherit;font-weight:800;font-size:13px;' +
      'cursor:pointer;text-align:left;background:var(--sf);color:var(--tx);border:1px solid var(--bd)}' +
      'button:hover{border-color:var(--p)}button.primary{background:var(--p);color:#fff;border-color:var(--p);text-align:center;font-weight:900}' +
      '@media (prefers-color-scheme:dark){button.primary{color:#1D0F29}}' +
      'button.soft{background:var(--ps);color:var(--ops);border-color:transparent}button.danger{background:var(--ds);color:var(--ods);border-color:transparent}' +
      'button:disabled{opacity:.6;cursor:wait}' +
      '.muted{font-size:12px;color:var(--su);line-height:1.45}.center{text-align:center}' +
      '#status{position:sticky;bottom:0;display:none;margin-top:8px;padding:12px 14px;border-radius:14px;font-size:13px;font-weight:800;background:var(--ss);color:var(--oss)}' +
      '#status.err{background:var(--ds);color:var(--ods)}' +
      '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}' +
      '.tile{background:var(--alt);border-radius:16px;padding:10px 12px}.tile.b{background:var(--ds)}.tile.b .tt,.tile.b .ov{color:var(--ods)}' +
      'table{width:100%;border-collapse:collapse}td,th{padding:10px 6px;border-bottom:1px solid var(--bd);font-size:13px;text-align:left}th{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--su)}' +
      'tr.today td{background:var(--ps)}' +
      '</style>'
  );
}

function htmlPainelDoc_(corpo) {
  return '<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">' + htmlPainelCss_() + '</head><body>' + corpo + '</body></html>';
}

function abrirAppDaCasa() {
  var html = HtmlService.createHtmlOutput(htmlPainelDoc_(
      '<div class="hero"><div class="ov light">App da casa</div><div class="h1">Abrindo o app Tocah…</div></div>' +
      '<button class="primary" onclick="window.open(\'' + APP_URL + '\',\'_blank\');google.script.host.close()">Abrir o app 🐰</button>' +
      '<script>window.open(\'' + APP_URL + '\',\'_blank\');</script>')).setWidth(320).setHeight(190);
  SpreadsheetApp.getUi().showModalDialog(html, 'Tocah');
}
