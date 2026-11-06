/**
 * BOT TOCAH — RODÍZIO DE TAREFAS
 * Email conjunto + Sidebar + Modo escuro no painel + Nilde + Banheirão independente
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
  var botoesIndividuais = moradores.map(function (m) {
    return '<button class="btn-individual" onclick="enviarPara(\'' + m.nome + '\')">📤 Enviar para ' + m.nome + '</button>';
  }).join('');

  return (
      '<!DOCTYPE html>\n' +
      '<html>\n' +
      '<head>\n' +
      '  <base target="_top">\n' +
      '  <style>\n' +
      "    body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 16px; margin: 0; background: #fafafa; }\n" +
      '    h2 { color: #6f42c1; font-size: 16px; margin: 0 0 12px 0; border-bottom: 2px solid #e0e6ff; padding-bottom: 8px; }\n' +
      '    .btn-geral {\n' +
      '      width: 100%; padding: 14px; margin-bottom: 12px; font-size: 14px; font-weight: bold;\n' +
      '      background: linear-gradient(135deg, #b041a3, #6f42c1); color: white; border: none;\n' +
      '      border-radius: 12px; cursor: pointer; box-shadow: 0 4px 12px rgba(111,66,193,0.3);\n' +
      '    }\n' +
      '    .btn-geral:hover { opacity: 0.9; transform: translateY(-1px); }\n' +
      '    .btn-individual {\n' +
      '      width: 100%; padding: 10px 12px; margin-bottom: 8px; font-size: 13px;\n' +
      '      background: #fff; color: #6f42c1; border: 2px solid #e0e6ff;\n' +
      '      border-radius: 10px; cursor: pointer; text-align: left;\n' +
      '    }\n' +
      '    .btn-individual:hover { background: #f5f0ff; border-color: #6f42c1; }\n' +
      '    .btn-rosa { color: #c2185b; border-color: #f8bbd9; }\n' +
      '    .btn-rosa:hover { background: #fff0f5; border-color: #e91e63; }\n' +
      '    .separador { margin: 16px 0 8px 0; font-size: 11px; color: #888; text-transform: uppercase; font-weight: bold;}\n' +
      '    .status { font-size: 12px; color: #666; margin-top: 12px; padding: 8px; background: #f0f0f0; border-radius: 8px; }\n' +
      '  </style>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <h2>📢 Visão Geral</h2>\n' +
      '  <button class="btn-geral" style="background: linear-gradient(135deg, #2196F3, #3F51B5);" onclick="abrirPrevisao()">📅 Ver Escala do Mês</button>\n' +
      '  <button class="btn-geral" onclick="enviarParaTodos()">📢 Enviar Email Único p/ TODOS</button>\n' +
      '  <div class="separador">Avançar Manualmente</div>\n' +
      '  <button class="btn-individual" onclick="rotacionarGeral()">🔄 Pular Rodízio Geral</button>\n' +
      '  <button class="btn-individual btn-rosa" onclick="rotacionarBanheirao()">🚿 Pular SÓ Banheirão</button>\n' +
      '  <div class="separador">Envio Unitário</div>\n' +
      botoesIndividuais +
      '  <div class="separador">Automações & Extras</div>\n' +
      '  <button class="btn-individual" onclick="ativarAutomatico()">⏰ Ligar Automático (Seg 8h)</button>\n' +
      '  <button class="btn-individual" onclick="ativarDiario()">📅 Ligar Lembrete Diário (Todo dia)</button>\n' +
      '  <button class="btn-individual" onclick="lembreteMulta()">🚨 Lembrete Multa (Geral)</button>\n' +
      '  <div id="status" class="status" style="display:none;"></div>\n' +
      '  <script>\n' +
      "    function mostrarStatus(msg) {\n" +
      "      var el = document.getElementById('status');\n" +
      '      el.textContent = msg;\n' +
      "      el.style.display = 'block';\n" +
      '      setTimeout(function() { el.style.display = \'none\'; }, 5000);\n' +
      '    }\n' +
      '    function abrirPrevisao() { google.script.run.mostrarPainelPrevisao(); }\n' +
      "    function enviarParaTodos() { google.script.run.withSuccessHandler(function(){ mostrarStatus('✅ Enviado!'); }).withFailureHandler(function(e){ mostrarStatus('❌ ' + e.message); }).rodizioTarefasTocah(); }\n" +
      "    function enviarPara(nome) { google.script.run.withSuccessHandler(function(){ mostrarStatus('✅ Enviado!'); }).withFailureHandler(function(e){ mostrarStatus('❌ ' + e.message); }).enviarIndividualPorNome(nome); }\n" +
      "    function lembreteMulta() { google.script.run.withSuccessHandler(function(){ mostrarStatus('✅ Lembrete enviado!'); }).withFailureHandler(function(e){ mostrarStatus('❌ ' + e.message); }).lembreteUltimoDiaTocah(); }\n" +
      '    function rotacionarGeral() {\n' +
      "      if(confirm('Avançar a escala geral em 1 semana?')) {\n" +
      "        google.script.run.withSuccessHandler(function(){ mostrarStatus('✅ Rodízio geral avançado!'); }).withFailureHandler(function(e){ mostrarStatus('❌ ' + e.message); }).avancarRodizioManualmente();\n" +
      '      }\n' +
      '    }\n' +
      '    function rotacionarBanheirao() {\n' +
      "      if(confirm('Avançar APENAS o banheirão para a próxima pessoa?')) {\n" +
      "        google.script.run.withSuccessHandler(function(){ mostrarStatus('✅ Banheirão avançado!'); }).withFailureHandler(function(e){ mostrarStatus('❌ ' + e.message); }).avancarBanheiraoManualmente();\n" +
      '      }\n' +
      '    }\n' +
      "    function ativarAutomatico() { google.script.run.withSuccessHandler(function(){ mostrarStatus('✅ Semanal Ativado!'); }).withFailureHandler(function(e){ mostrarStatus('❌ ' + e.message); }).configurarEnvioAutomaticoSegunda(); }\n" +
      "    function ativarDiario() { google.script.run.withSuccessHandler(function(){ mostrarStatus('✅ Diários Ativados!'); }).withFailureHandler(function(e){ mostrarStatus('❌ ' + e.message); }).configurarEnvioDiario(); }\n" +
      '  </script>\n' +
      '</body>\n' +
      '</html>'
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

  const htmlBody = montarHtmlEmailUnico(atribuicoes, isLembrete, banheiraoResp, tarefaBanheirao);
  const assunto = emoji + ' Escala Tocah - Tarefas da Semana';
  const todosEmails = atribuicoes
      .map(function (a) {
        return a.morador.email;
      })
      .join(', ');

  MailApp.sendEmail({ to: todosEmails, subject: assunto, htmlBody: htmlBody });

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
      (isLembrete ? '🚨' : '📋') +
      ' *ESCALA TOCAH* \n\n' +
      morador.nome +
      ', sua tarefa:\n📍 ' +
      tarefa.area +
      '\n⏰ ' +
      tarefa.prazo +
      '\n📝 ' +
      tarefa.desc.replace(/<[^>]+>/g, '');
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
      (isLembrete ? '🚨' : '🚿') +
      ' *BANHEIRÃO TOCAH*\n\n' +
      morador.nome +
      ', você está no banheirão!\n📍 ' +
      tarefa.area +
      '\n⏰ ' +
      tarefa.prazo;
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
    SpreadsheetApp.getUi().alert('❌ Morador não encontrado!');
    return;
  }
  const htmlBody = montarHtmlEmailUnico(atribuicoes, isLembrete, getBanheiraoSemana(), getTarefaBanheirao());
  MailApp.sendEmail({ to: morador.email, subject: '📋 Escala Tocah - Tarefas', htmlBody: htmlBody });
  SpreadsheetApp.getUi().alert('✅ E-mail enviado para ' + nomeEspecifico);
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

  atribuicoes.forEach(function (a) {
    var descExtra = '';

    if (banheiraoResp && a.morador.nome === banheiraoResp.nome) {
      descExtra = htmlEmailExtraBanheirao(tarefaBanheirao);
    }

    var htmlBody = montarHtmlLembreteDiario(a.morador.nome, a.tarefa.area, a.tarefa.freq, a.tarefa.desc, descExtra, a.tarefa.prazo);

    MailApp.sendEmail({
      to: a.morador.email,
      subject: 'Lembrete do dia · Tocah 🐰',
      htmlBody: htmlBody,
    });
  });
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
  var blocosSemanas = '';

  for (var w = 0; w < 4; w++) {
    var periodo = getPeriodoValidade(w);
    var atribuicoes = getAtribuicoesSemana(w);
    var banheirao = getBanheiraoSemana(w);
    var isAtual = w === 0 ? '<span class="badge-atual">SEMANA ATUAL</span>' : '';

    var cardsTarefas = '';
    atribuicoes.forEach(function (a) {
      var areaResumida = a.tarefa.area.split(' ')[0];
      if (a.tarefa.area.indexOf('NILDE') !== -1) areaResumida = 'QUINTAL + NILDE 🐰';
      if (a.tarefa.area.indexOf('SALA') !== -1) areaResumida = 'SALA E GARAGEM';

      cardsTarefas +=
          '<div class="task-card">' +
          '<div class="task-name">' +
          a.morador.nome +
          '</div>' +
          '<div class="task-area">' +
          areaResumida +
          '</div>' +
          '</div>';
    });

    if (banheirao) {
      cardsTarefas +=
          '<div class="task-card banheirao-card">' +
          '<div class="task-name">' +
          banheirao.nome +
          '</div>' +
          '<div class="task-area">BANHEIRÃO 🚿</div>' +
          '</div>';
    }

    blocosSemanas +=
        '<div class="week-container">' +
        '<div class="week-header">' +
        '<div>' +
        periodo +
        ' ' +
        isAtual +
        '</div>' +
        '</div>' +
        '<div class="grid-tasks">' +
        cardsTarefas +
        '</div>' +
        '</div>';
  }

  return (
      '<!DOCTYPE html>\n' +
      '<html>\n' +
      '<head>\n' +
      '  <style>\n' +
      "      body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f4f2f7; margin: 0; padding: 20px; color: #333; }\n" +
      '      .header-title { text-align: center; color: #4a148c; margin-bottom: 24px; font-size: 22px; font-weight: bold; }\n' +
      '      .week-container { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 24px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e8e4f0; }\n' +
      '      .week-header { font-size: 16px; font-weight: bold; color: #6f42c1; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #f4f2f7; padding-bottom: 10px; }\n' +
      '      .badge-atual { background: #4caf50; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; letter-spacing: 1px; }\n' +
      '      .grid-tasks { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }\n' +
      '      .task-card { background: #fafafa; border-left: 4px solid #6f42c1; padding: 12px; border-radius: 8px; border-top: 1px solid #eee; border-right: 1px solid #eee; border-bottom: 1px solid #eee; }\n' +
      '      .banheirao-card { border-left: 4px solid #e91e63; background: #fff0f5; }\n' +
      '      .task-name { font-weight: bold; font-size: 15px; margin-bottom: 4px; color: #2d2d2d; }\n' +
      '      .task-area { font-size: 12px; color: #666; font-weight: 600; text-transform: uppercase; }\n' +
      '      .banheirao-card .task-area { color: #c2185b; }\n' +
      '      @media (prefers-color-scheme: dark) {\n' +
      '        body { background: #121212; color: #eee; }\n' +
      '        .header-title { color: #bb86fc; }\n' +
      '        .week-container { background: #1e1e1e; border-color: #333; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }\n' +
      '        .week-header { color: #bb86fc; border-color: #333; }\n' +
      '        .task-card { background: #252525; border-color: #333; border-left-color: #bb86fc; }\n' +
      '        .banheirao-card { background: #2c1a1f; border-left-color: #ff80ab; }\n' +
      '        .task-name { color: #fff; }\n' +
      '        .task-area { color: #aaa; }\n' +
      '        .banheirao-card .task-area { color: #ff80ab; }\n' +
      '      }\n' +
      '    </style>\n' +
      '</head>\n' +
      '<body>\n' +
      '    <div class="header-title">📋 Plano de Organização (Próximas 4 Semanas)</div>\n' +
      blocosSemanas +
      '</body>\n' +
      '</html>'
  );
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
      .setBackground('#4a148c')
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
      .setBackground('#6f42c1')
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

    var corLinha = w === 0 ? '#f3e5f5' : w % 2 === 0 ? '#fafafa' : '#ffffff';
    bgColors.push([corLinha, corLinha, corLinha, corLinha, corLinha, corLinha, '#fff0f5']);
  }

  var dataRange = aba.getRange(3, 1, rowData.length, 7); // antes era 6 fixo e dava erro com 4 linhas
  dataRange.setValues(rowData);
  dataRange.setBackgrounds(bgColors);
  dataRange.setHorizontalAlignment('center').setVerticalAlignment('middle').setFontSize(11);

  for (var r = 3; r <= 6; r++) {
    aba.setRowHeight(r, 45);
  }

  aba.getRange('A1:G6').setBorder(true, true, true, true, true, true, '#d1c4e9', SpreadsheetApp.BorderStyle.SOLID);
  aba.getRange('A3:A6').setFontWeight('bold').setFontColor('#4a148c');
  aba.getRange('G2:G6').setFontColor('#c2185b').setFontWeight('bold');

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
  const temSemanal = triggers.some(function (t) {
    return t.getHandlerFunction() === 'enviarEscalaAutomaticaSegunda';
  });
  const temDiario = triggers.some(function (t) {
    return t.getHandlerFunction() === 'enviarNotificacoesDiarias';
  });

  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const distSegunda = diaSemana === 0 ? 6 : diaSemana - 1;

  var htmlLinhas = '';
  const nomesDias = [
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
    'Domingo',
  ];

  for (var i = 0; i < 7; i++) {
    var dataDia = new Date(hoje);
    dataDia.setDate(hoje.getDate() - distSegunda + i);

    var formatada = Utilities.formatDate(dataDia, Session.getScriptTimeZone(), 'dd/MM');
    var statusSemanal = '<span style="color:#aaa;">-</span>';
    var statusDiario = '<span style="color:#aaa;">-</span>';

    var isPassado = false;
    var diaAmeiaNoite = new Date(dataDia).setHours(0, 0, 0, 0);
    var hojeAmeiaNoite = new Date(hoje).setHours(0, 0, 0, 0);

    if (diaAmeiaNoite < hojeAmeiaNoite) {
      isPassado = true;
    } else if (diaAmeiaNoite === hojeAmeiaNoite && hoje.getHours() >= 8) {
      isPassado = true;
    }

    const tagEnviado =
        '<span style="background:#e8f5e9; color:#2e7d32; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:bold;">✅ ENVIADO</span>';
    const tagAgendado =
        '<span style="background:#fff3e0; color:#e65100; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:bold;">⏳ AGENDADO (8h)</span>';
    const tagInativo =
        '<span style="background:#ffebee; color:#c62828; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:bold;">🚫 DESATIVADO</span>';

    if (i === 0) {
      statusSemanal = temSemanal ? (isPassado ? tagEnviado : tagAgendado) : tagInativo;
    }

    statusDiario = temDiario ? (isPassado ? tagEnviado : tagAgendado) : tagInativo;

    var corFundo = diaAmeiaNoite === hojeAmeiaNoite ? '#f3e5f5' : '#ffffff';
    var destaqueHoje = diaAmeiaNoite === hojeAmeiaNoite ? '<br><small style="color:#6f42c1; font-weight:bold;">(HOJE)</small>' : '';

    htmlLinhas +=
        '<tr style="background-color: ' +
        corFundo +
        ';">' +
        '<td style="padding: 14px; border-bottom: 1px solid #eee; font-weight: bold; color: #444;">' +
        nomesDias[i] +
        ' - ' +
        formatada +
        ' ' +
        destaqueHoje +
        '</td>' +
        '<td style="padding: 14px; border-bottom: 1px solid #eee; text-align: center;">' +
        statusSemanal +
        '</td>' +
        '<td style="padding: 14px; border-bottom: 1px solid #eee; text-align: center;">' +
        statusDiario +
        '</td>' +
        '</tr>';
  }

  return (
      '<!DOCTYPE html>\n' +
      '<html>\n' +
      '<head>\n' +
      '    <style>\n' +
      "      body { font-family: 'Segoe UI', sans-serif; background: #f4f2f7; padding: 20px; color: #333; margin: 0; }\n" +
      '      .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden; }\n' +
      '      .header { background: #4a148c; color: white; padding: 20px; text-align: center; }\n' +
      '      table { width: 100%; border-collapse: collapse; }\n' +
      '      th { background: #fafafa; padding: 15px; text-align: center; font-size: 13px; color: #6f42c1; text-transform: uppercase; border-bottom: 2px solid #eee; }\n' +
      '      td { font-size: 14px; }\n' +
      '    </style>\n' +
      '</head>\n' +
      '<body>\n' +
      '    <div class="card">\n' +
      '      <div class="header">\n' +
      '        <h2 style="margin:0; font-size: 20px;">🔔 Acompanhamento da Semana</h2>\n' +
      '        <p style="margin:5px 0 0 0; font-size: 13px; color:#d1c4e9;">Abaixo estão os disparos programados pelo Bot</p>\n' +
      '      </div>\n' +
      '      <table>\n' +
      '        <thead>\n' +
      '          <tr>\n' +
      '            <th style="text-align: left;">DIA DA SEMANA</th>\n' +
      '            <th>EMAIL GERAL DA ESCALA</th>\n' +
      '            <th>LEMBRETES DIÁRIOS</th>\n' +
      '          </tr>\n' +
      '        </thead>\n' +
      '        <tbody>\n' +
      htmlLinhas +
      '        </tbody>\n' +
      '      </table>\n' +
      '    </div>\n' +
      '</body>\n' +
      '</html>'
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
function htmlEmailCartaoMorador_(nome, tarefa, extraHtml, destaque) {
  var ff = htmlEmailFontStack();
  var topo =
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>\n' +
      '<td width="56" valign="top" style="width:56px;">' + htmlEmailAvatar_(nome, 44) + '</td>\n' +
      '<td valign="top" style="font-family:' + ff + ';">\n' +
      '<div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:' + TOCAH_COR.textSubtle + ';">' + nome + '</div>\n' +
      '<div style="margin-top:2px;font-size:18px;font-weight:900;line-height:1.25;color:' + TOCAH_COR.text + ';">' + nomeBonitoTarefa_(tarefa.area) + '</div>\n' +
      '</td></tr></table>\n';
  var pills = '<div style="margin-top:12px;">' +
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

function montarHtmlEmailUnico(atribuicoes, isLembrete, banheiraoResp, tarefaBanheirao) {
  const periodo = getPeriodoValidade();
  const preheader = isLembrete ?
      'Prazo no fim da semana — confira o que falta na Tocah.' :
      'Escala da semana: quem cuida de cada área, prazos e o que fazer.';
  const intro = isLembrete ?
      'O prazo da semana está acabando. Confiram o que falta pra ninguém pagar multa:' :
      'Quem cuida de cada área nesta semana, até quando e o que fazer.';

  var cards = '';
  atribuicoes.forEach(function (a) {
    var temB = banheiraoResp && banheiraoResp.nome === a.morador.nome && tarefaBanheirao;
    cards += '<tr><td>' + htmlEmailCartaoMorador_(a.morador.nome, a.tarefa, temB ? htmlEmailExtraBanheirao(tarefaBanheirao) : '') + '</td></tr>\n';
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

function montarHtmlLembreteDiario(nomeMorador, areaResumo, freq, descHtml, extraBanheiraoHtml, prazo) {
  const periodo = getPeriodoValidade();
  const preheader = 'Oi, ' + nomeMorador + ' — sua tarefa de hoje na Tocah.';
  var tarefa = { area: areaResumo, prazo: prazo || '', freq: freq, desc: descHtml };
  return (
      htmlEmailDocOpen(preheader) +
      htmlEmailHeroRoxo('Oi, ' + nomeMorador.charAt(0) + nomeMorador.slice(1).toLowerCase() + '!', 'Valeu por cuidar da casa 💜', true, 'Lembrete do dia') +
      htmlEmailCorpoAbre() +
      '<tr><td>' + htmlEmailChipPeriodo(periodo) +
      htmlEmailLead('Um toque rápido pra manter a rotina em dia. Essa é a sua tarefa da semana:') + '</td></tr>\n' +
      '<tr><td>' + htmlEmailCartaoMorador_(nomeMorador, tarefa, extraBanheiraoHtml || '', true) + '</td></tr>\n' +
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
