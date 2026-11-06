/***********************
 * BOAS-VINDAS — Felipe (versão teste + produção)
 * Visual igual ao app Tocah (roxo #6A1B9A, cards arredondados, fontes pesadas).
 ***********************/

/** TESTE: envia sempre para guilhermedeluca75@gmail.com. */
function enviarBoasVindasFelipeTESTE() {
  enviarBoasVindas_('FELIPE', { teste: true, genero: 'o' });
}

/** PRODUÇÃO: envia de fato para o Felipe. */
function enviarBoasVindasFelipe() {
  enviarBoasVindas_('FELIPE', { teste: false, genero: 'o' });
}

/** Imagens do app (mesmos arquivos do Drive que o app usa). */
var BV_LOGO_URL = 'https://lh3.googleusercontent.com/d/1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS=w256';
var BV_FOTO_CASA_URL = 'https://lh3.googleusercontent.com/d/1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ=w1200';

/** Cores do app (mesmos tokens do tema claro). */
var BV_COR = {
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
  danger: '#C42B37',
  dangerSoft: '#FBE6E8',
  onDangerSoft: '#951E28',
  warningSoft: '#FCF0DA',
  onWarningSoft: '#7A4700',
  successSoft: '#E4F4EA',
  onSuccessSoft: '#14663A',
  infoSoft: '#E5EDFC',
  info: '#2459D6',
};

function enviarBoasVindas_(nomeBusca, opcoes) {
  opcoes = opcoes || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var morador = getMoradorPorNome_(nomeBusca);
  if (!morador) {
    ss.toast(
      nomeBusca + ' não encontrado(a) em MORADORES_CONFIG.',
      CONFIG.branding.menuUsuario, 6
    );
    return;
  }

  var ehTeste = opcoes.teste === true;
  var g = opcoes.genero === 'a' ? 'a' : 'o'; // 'o' = bem-vindo, 'a' = bem-vinda
  var destinatario = ehTeste ? 'guilhermedeluca75@gmail.com' : morador.email;
  var titulo =
    (ehTeste ? '[TESTE] ' : '') +
    'Boas-vindas à ' +
    CONFIG.branding.nomeCurto;

  var appUrl = 'https://guidelluca.github.io/tocah-do-coelho-app/';
  var appUrlLabel = 'guidelluca.github.io/tocah-do-coelho-app';

  var imgs = montarInlineImagensCobranca_();
  var fs = emailFontStack_();
  var C = BV_COR;
  var primeiroNome = String(morador.nome || '').charAt(0) + String(morador.nome || '').slice(1).toLowerCase();

  // ===== Peças do visual do app =====
  function pill_(texto, bg, fg) {
    return '<span style="display:inline-block;padding:6px 12px;border-radius:999px;background-color:' + bg + ';color:' + fg +
      ';font-family:' + fs + ';font-size:11px;font-weight:800;letter-spacing:0.04em;line-height:1.2;white-space:nowrap;">' + texto + '</span>';
  }

  /** Card branco do app com título de seção (overline + título). */
  function secao_(overline, tituloSecao, conteudo) {
    return (
      '<tr><td style="padding:0 0 12px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-radius:22px;' +
      'background-color:' + C.surface + ';border:1px solid ' + C.border + ';">' +
      '<tr><td style="padding:20px 18px;font-family:' + fs + ';">' +
      '<div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:' + C.primary + ';">' + overline + '</div>' +
      '<div style="margin:2px 0 14px;font-size:19px;font-weight:900;line-height:1.25;color:' + C.text + ';">' + tituloSecao + '</div>' +
      conteudo +
      '</td></tr></table></td></tr>'
    );
  }

  /** Linha de lista (título forte + texto). */
  function item_(tituloItem, texto, ultimo) {
    return (
      '<tr><td style="padding:12px 0;' + (ultimo ? '' : 'border-bottom:1px solid ' + C.border + ';') + 'font-family:' + fs + ';">' +
      '<div style="font-size:15px;font-weight:800;color:' + C.text + ';">' + tituloItem + '</div>' +
      '<div style="margin-top:3px;font-size:14px;font-weight:600;line-height:1.55;color:' + C.textMuted + ';">' + texto + '</div>' +
      '</td></tr>'
    );
  }

  function lista_(itens) {
    var h = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">';
    for (var k = 0; k < itens.length; k++) h += item_(itens[k][0], itens[k][1], k === itens.length - 1);
    return h + '</table>';
  }

  // ===== Banner amarelo (somente em modo teste) =====
  var bannerTeste = ehTeste
    ? '<tr><td style="padding:0 0 12px;"><div style="padding:12px 16px;border-radius:16px;background-color:' + C.warningSoft +
      ';color:' + C.onWarningSoft + ';font-family:' + fs + ';font-size:13px;font-weight:700;line-height:1.45;text-align:center;">' +
      '🧪 MODO TESTE — em produção este e-mail iria para <b style="font-weight:900;">' + morador.email + '</b></div></td></tr>'
    : '';

  // ===== Pílulas por gravidade (cores de status do app) =====
  function pillConseq_(c) {
    var map = {
      'Expulsão':            { bg: C.danger, fg: '#FFFFFF' },
      'De multa à expulsão': { bg: C.dangerSoft, fg: C.onDangerSoft },
      'Multa':               { bg: C.warningSoft, fg: C.onWarningSoft },
      'A definir':           { bg: C.surfaceAlt, fg: C.textMuted },
    };
    var cor = map[c] || map['A definir'];
    return pill_(c, cor.bg, cor.fg);
  }

  // ===== Lista oficial dos Mandamentos =====
  var mandamentos = [
    ['Atrasar o aluguel', 'Expulsão'],
    ['Desrespeitar itens individuais ou coletivos (itens coletivos não devem ser usados para fins individuais)', 'A definir'],
    ['Invadir o quarto alheio', 'Expulsão'],
    ['Não idolatrar o Nilde acima de todas as coisas', 'Expulsão'],
    ['Não cumprir as tarefas da casa sob sua responsabilidade', 'Multa'],
    ['Não respeitar a individualidade dos banheiros', 'A definir'],
    ['Não verificar a descarga após o uso', 'De multa à expulsão'],
    ['Faltar à reunião geral sem justificativa cabível', 'Multa'],
    ['Não manter o próprio quarto limpo', 'A definir'],
    ['Não descartar o lixo no local correto', 'A definir'],
    ['Não respeitar os móveis da casa', 'A definir'],
    ['Em caso de mudança, deixar móveis pessoais para trás', 'A definir'],
  ];

  var mandamentosRows = '';
  for (var i = 0; i < mandamentos.length; i++) {
    var borda = (i === mandamentos.length - 1) ? '' : 'border-bottom:1px solid ' + C.border + ';';
    mandamentosRows +=
      '<tr>' +
      '<td width="34" valign="top" style="width:34px;padding:12px 0;' + borda + '">' +
      '<div style="width:26px;height:26px;line-height:26px;border-radius:50%;text-align:center;background-color:' + C.primarySoft +
      ';color:' + C.onPrimarySoft + ';font-family:' + fs + ';font-size:12px;font-weight:900;">' + (i + 1) + '</div></td>' +
      '<td valign="top" style="padding:12px 0;' + borda + 'font-family:' + fs + ';">' +
      '<div style="font-size:14px;font-weight:700;line-height:1.45;color:' + C.text + ';">' + mandamentos[i][0] + '</div>' +
      '<div style="margin-top:6px;">' + pillConseq_(mandamentos[i][1]) + '</div>' +
      '</td></tr>';
  }

  // ===== Blocos =====
  var hero =
    '<tr><td style="padding:0 0 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-radius:26px;' +
    'background-color:' + C.primary + ';background-image:linear-gradient(135deg,' + C.primary + ' 0%,' + C.primaryDark + ' 100%);">' +
    '<tr><td style="padding:26px 22px 24px;text-align:center;font-family:' + fs + ';">' +
    '<img src="' + BV_LOGO_URL + '" alt="Logo da República Tocah do Coelho" width="76" height="76" ' +
    'style="display:block;margin:0 auto;width:76px;height:76px;border-radius:50%;border:3px solid rgba(255,255,255,0.35);" />' +
    '<div style="margin-top:8px;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.78);">Boas-vindas</div>' +
    '<div style="margin-top:4px;font-size:24px;font-weight:900;line-height:1.2;color:#FFFFFF;">Bem-vind' + g + ' à ' + CONFIG.branding.nomeCurto + ', ' + primeiroNome + '!</div>' +
    '<div style="margin:14px auto 0;max-width:460px;padding:12px 14px;border-radius:16px;background-color:rgba(255,255,255,0.16);' +
    'border:1px solid rgba(255,255,255,0.28);font-size:14px;font-weight:600;line-height:1.55;color:#FFFFFF;">' +
    'É um enorme prazer ter você com a gente. Aqui está o essencial: datas, o app da casa, convivência, o estatuto e o PIX.</div>' +
    '</td></tr></table></td></tr>' +
    // Foto da casa (a mesma do Início do app)
    '<tr><td style="padding:0 0 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-radius:26px;' +
    'background-color:' + C.surface + ';border:1px solid ' + C.border + ';overflow:hidden;">' +
    '<tr><td style="padding:0;line-height:0;font-size:0;">' +
    '<img src="' + BV_FOTO_CASA_URL + '" alt="Foto da Tocah" width="600" ' +
    'style="display:block;width:100%;max-width:600px;height:auto;border-radius:26px 26px 0 0;" /></td></tr>' +
    '<tr><td style="padding:12px 18px 14px;font-family:' + fs + ';">' +
    '<div style="font-size:15px;font-weight:900;color:' + C.text + ';">Sua nova casa 🏡</div>' +
    '<div style="margin-top:2px;font-size:13px;font-weight:600;color:' + C.textMuted + ';">República Tocah do Coelho</div>' +
    '</td></tr></table></td></tr>';

  var datas = secao_('Calendário', 'Datas para guardar',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' +
    '<tr><td width="64" valign="top" style="width:64px;padding:0 0 12px;">' +
    '<div style="width:52px;padding:8px 0;border-radius:16px;text-align:center;background-color:' + C.primarySoft + ';font-family:' + fs + ';">' +
    '<div style="font-size:20px;font-weight:900;color:' + C.onPrimarySoft + ';line-height:1;">10</div>' +
    '<div style="margin-top:2px;font-size:10px;font-weight:800;letter-spacing:0.08em;color:' + C.onPrimarySoft + ';">DIA</div></div></td>' +
    '<td valign="top" style="padding:0 0 12px;font-family:' + fs + ';">' +
    '<div style="font-size:15px;font-weight:800;color:' + C.text + ';">Fechamento da planilha</div>' +
    '<div style="margin-top:3px;font-size:14px;font-weight:600;line-height:1.55;color:' + C.textMuted + ';">Lance comprovantes e despesas comuns até essa data; depois disso a planilha é consolidada.</div></td></tr>' +
    '<tr><td width="64" valign="top" style="width:64px;">' +
    '<div style="width:52px;padding:8px 0;border-radius:16px;text-align:center;background-color:' + C.dangerSoft + ';font-family:' + fs + ';">' +
    '<div style="font-size:20px;font-weight:900;color:' + C.onDangerSoft + ';line-height:1;">12</div>' +
    '<div style="margin-top:2px;font-size:10px;font-weight:800;letter-spacing:0.08em;color:' + C.onDangerSoft + ';">DIA</div></div></td>' +
    '<td valign="top" style="font-family:' + fs + ';">' +
    '<div style="font-size:15px;font-weight:800;color:' + C.text + ';">Vencimento do aluguel</div>' +
    '<div style="margin-top:3px;font-size:14px;font-weight:600;line-height:1.55;color:' + C.textMuted + ';">Entre os dias 10 e 12 você recebe automaticamente o demonstrativo neste mesmo e-mail.</div></td></tr>' +
    '</table>');

  var diaADia = secao_('Rotina', 'Como funciona o dia a dia', lista_([
    ['💸 Despesas comuns', 'Mercado, gás, manutenção etc. são lançados por qualquer morador — pelo app ou na planilha.'],
    ['🗓️ Fechamento no dia 10', 'Você recebe lembretes automáticos nos dias que antecedem o fechamento.'],
    ['📄 Demonstrativo individual', 'Cada morador recebe o total a pagar do mês, com tudo detalhado.'],
    ['✅ PIX até o dia 12', 'Dados lá embaixo. Depois da confirmação, chega outro e-mail com o recibo.'],
  ]));

  function passos_(selo, seloBg, seloFg, tituloPassos, lista) {
    var li = '';
    for (var p = 0; p < lista.length; p++) {
      li += '<tr><td width="28" valign="top" style="width:28px;padding:4px 0;font-family:' + fs + ';font-size:13px;font-weight:900;color:' + C.primary + ';">' + (p + 1) + '.</td>' +
        '<td valign="top" style="padding:4px 0;font-family:' + fs + ';font-size:14px;font-weight:600;line-height:1.5;color:' + C.textMuted + ';">' + lista[p] + '</td></tr>';
    }
    return (
      '<div style="margin-top:10px;padding:14px 16px;border-radius:18px;background-color:' + C.surfaceAlt + ';">' +
      '<div style="margin-bottom:8px;">' + pill_(selo, seloBg, seloFg) +
      '<span style="margin-left:8px;font-family:' + fs + ';font-size:14px;font-weight:800;color:' + C.text + ';">' + tituloPassos + '</span></div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + li + '</table></div>'
    );
  }

  var b = function (t) { return '<b style="font-weight:800;color:' + C.text + ';">' + t + '</b>'; };

  var app = secao_('App da casa', 'Tudo da Tocah no celular',
    '<div style="font-family:' + fs + ';font-size:14px;font-weight:600;line-height:1.55;color:' + C.textMuted + ';margin-bottom:14px;">' +
    'Aluguel do mês, gastos, acertos, escala de tarefas e a Nilde em um só lugar. Funciona como um app — sem baixar da loja.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr>' +
    '<td align="center" style="border-radius:16px;background-color:' + C.primary + ';">' +
    '<a href="' + appUrl + '" target="_blank" style="display:block;padding:15px 18px;font-family:' + fs + ';font-size:15px;font-weight:900;color:#FFFFFF;text-decoration:none;border-radius:16px;">Abrir o app da casa 🐰</a>' +
    '</td></tr></table>' +
    '<div style="margin:8px 0 14px;text-align:center;font-family:' + fs + ';font-size:12px;font-weight:600;color:' + C.textSubtle + ';word-break:break-all;">' + appUrlLabel + '</div>' +
    '<div style="font-family:' + fs + ';font-size:14px;font-weight:800;color:' + C.text + ';">Como colocar na tela inicial</div>' +
    passos_('iPhone', '#1C1A26', '#FFFFFF', 'pelo Safari', [
      'Abra o link ' + b('no Safari') + ' (no iPhone, o Chrome não instala).',
      'Toque em ' + b('Compartilhar') + ' — o quadrado com a seta pra cima.',
      'Role e toque em ' + b('"Adicionar à Tela de Início"') + '.',
      'Confirme em ' + b('"Adicionar"') + ', no canto superior direito.',
    ]) +
    passos_('Android', C.successSoft, C.onSuccessSoft, 'pelo Chrome', [
      'Abra o link ' + b('no Chrome') + '.',
      'Toque nos ' + b('três pontinhos') + ', no canto superior direito.',
      'Toque em ' + b('"Adicionar à tela inicial"') + ' ou ' + b('"Instalar app"') + '.',
      'Confirme — o ícone aparece junto com seus outros apps.',
    ]) +
    '<div style="margin-top:12px;text-align:center;font-family:' + fs + ';font-size:12px;font-weight:600;line-height:1.5;color:' + C.textSubtle + ';">' +
    'Depois é só abrir pelo ícone: funciona em tela cheia, igual a um app nativo.</div>');

  var convivencia = secao_('Convivência', 'Convivência e limpeza', lista_([
    ['🛋️ Não comer no sofá', 'Alimentos só na mesa de jantar ou na cozinha — preserva os estofados e evita insetos.'],
    ['🛏️ Seu quarto em ordem', 'A limpeza do quarto é responsabilidade de cada morador.'],
    ['🧹 Tarefas coletivas', 'As áreas comuns são divididas entre todos. Sua escala aparece no app e chega por e-mail assim que a divisão for atualizada.'],
    ['♻️ Lixo no lugar certo', 'Separe seco e orgânico, e leve pra fora nos dias de coleta.'],
    ['🚽 Banheiros e descarga', 'Respeite a individualidade de cada banheiro e confira sempre a descarga.'],
    ['🪑 Móveis e itens coletivos', 'Itens de uso comum não são pra atividades individuais — são da casa.'],
    ['🗣️ Reuniões da casa', 'Decidem os ajustes do dia a dia e do estatuto. Falta sem justificativa cabível dá multa.'],
  ]));

  var estatuto = secao_('Estatuto oficial', 'Mandamentos da Tocah',
    '<div style="margin:-6px 0 6px;padding:10px 12px;border-radius:14px;background-color:' + C.surfaceAlt + ';font-family:' + fs +
    ';font-size:12.5px;font-weight:600;line-height:1.5;color:' + C.textMuted + ';">Só podem ser alterados em assembleia geral, com aprovação de 2/3 dos moradores.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + mandamentosRows + '</table>' +
    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid ' + C.border + ';line-height:2.4;">' +
    pillConseq_('Expulsão') + ' ' + pillConseq_('De multa à expulsão') + ' ' + pillConseq_('Multa') + ' ' + pillConseq_('A definir') + '</div>');

  var pix = secao_('Pagamento', 'Dados para PIX',
    '<div style="text-align:center;font-family:' + fs + ';">' +
    '<div style="font-size:13px;font-weight:600;color:' + C.textSubtle + ';margin-bottom:8px;">QR Code ou chave copia e cola</div>' +
    imgs.imgQrHTML +
    '<div style="margin-top:10px;padding:12px 14px;border-radius:14px;background-color:' + C.surfaceAlt + ';font-family:ui-monospace,Menlo,monospace;' +
    'font-size:11px;color:' + C.textMuted + ';word-break:break-all;text-align:left;line-height:1.45;">' + pixCopiaEColaEfetiva_() + '</div>' +
    '<div style="margin-top:14px;font-size:20px;font-weight:900;color:' + C.text + ';">' + CONFIG.pix.telefone + '</div>' +
    '<div style="margin-top:2px;">' + pill_('Chave PIX (telefone)', C.primarySoft, C.onPrimarySoft) + '</div>' +
    '</div>');

  var fechamento =
    '<tr><td style="padding:4px 0 0;font-family:' + fs + ';text-align:center;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr>' +
    '<td align="center" style="border-radius:16px;background-color:' + C.surface + ';border:2px solid ' + C.primary + ';">' +
    '<a href="' + CONFIG.planilhaUrl + '" target="_blank" style="display:block;padding:13px 18px;font-family:' + fs + ';font-size:15px;font-weight:900;color:' + C.primary + ';text-decoration:none;border-radius:16px;">Acessar a planilha</a>' +
    '</td></tr></table>' +
    '<div style="margin-top:16px;font-size:14px;font-weight:700;line-height:1.55;color:' + C.textMuted + ';">Qualquer dúvida, é só chamar no grupo ou no WhatsApp. Seja muito bem-vind' + g + '! 💜</div>' +
    '<div style="margin-top:16px;font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:' + C.textSubtle + ';">🐰 República Tocah do Coelho</div>' +
    '<div style="margin-top:6px;font-size:12px;font-weight:600;line-height:1.55;color:' + C.textSubtle + ';">' + emailRodapeProfissional_() + '</div>' +
    '</td></tr>';

  // ===== HTML final =====
  var htmlBody =
    '<!DOCTYPE html><html lang="pt-BR"><head>' +
    emailHeadPremium_() +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '</head><body style="margin:0;padding:0;background-color:' + C.bg + ';font-family:' + fs + ';-webkit-text-size-adjust:100%;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:' + C.bg + ';border-collapse:collapse;">' +
    '<tr><td align="center" style="padding:24px 12px 32px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;">' +
    bannerTeste + hero + datas + diaADia + app + convivencia + estatuto + pix + fechamento +
    '</table></td></tr></table></body></html>';

  try {
    enviarEmailHtml_(destinatario, titulo, htmlBody, imgs.inlineImages);
    registrarLog(
      ehTeste ? 'Boas-vindas TESTE' : 'Boas-vindas',
      morador.nome,
      (ehTeste ? '[TESTE] ' : '') + 'Enviado para ' + destinatario
    );
    ss.toast(
      (ehTeste ? '[TESTE] ' : '') + 'Boas-vindas enviada para ' + destinatario,
      CONFIG.branding.menuUsuario, 5
    );
  } catch (e) {
    registrarLog(
      ehTeste ? 'Erro Boas-vindas TESTE' : 'Erro Boas-vindas',
      morador.nome,
      String(e.message || e)
    );
    throw e;
  }
}
