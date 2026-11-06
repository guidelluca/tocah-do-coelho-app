# 01 — Visão geral do produto

## O que é

**Tocah** é o app interno da **República Tocah do Coelho**, uma casa compartilhada por 5 moradores:
`ALLAN`, `RAMON`, `VITOR`, `GUSTAVO`, `GUILHERME`.

O app centraliza a vida da casa em 5 abas:

| Aba (rota) | Para quê |
|---|---|
| **Início** (`Inicio`) | Painel do morador: caixinha, aluguel do mês, tarefa da semana, prévia de aluguéis de todos, notificações |
| **Finanças** (`Financas`) | Contas fixas, gastos coletivos, acertos individuais (quem deve a quem) e extrato do aluguel por morador |
| **Tarefas** (`Tarefas`) | Escala semanal de limpeza, check com foto obrigatória e avaliação (1–5 estrelas) da tarefa dos outros |
| **Nilde** (`Nilde`) | Controle de alimentação da coelha mascote (3 checks por dia), guia de alimentação e lista de alimentos proibidos |
| **Feed** (`Feed`) | Rede social da casa: posts com texto/foto, respostas, curtidas, checks de tarefa e avaliações anônimas |

## Fonte da verdade = Google Sheets

Não existe banco de dados. **Tudo é lido/escrito numa planilha Google** que os moradores já usavam antes do app.
O backend (Express) é só um *proxy* autenticado por Service Account que traduz ações do app em leituras/escritas de células.

Consequências importantes:
- A planilha continua sendo editada manualmente pelos moradores. O app **não pode quebrar o layout da planilha** (posições de colunas, cabeçalhos, abas).
- Existe cota de leitura da API do Google Sheets — já houve problemas de *quota exceeded* (ver commits `f8b7359`, `5a8b792`).
- Cada mês financeiro é uma **aba própria** (ex.: `MAI_2026`, `JUN_2026`).

## Identidade / "login"

Não há autenticação. O morador escolhe quem ele é tocando num chip com o nome na tela Início; a escolha fica salva no `AsyncStorage` (`@tocah_selected_resident`). Qualquer pessoa pode se passar por qualquer morador. É um app de confiança entre amigos — **manter esse modelo** (não pedir para criar login), mas dá para melhorar a UX da escolha.

## Onde roda

- **Web (principal)**: build Expo Web publicado no **GitHub Pages** em `/tocah-do-coelho-app` via GitHub Actions a cada push na `main`.
- **Backend**: Node/Express no **Render** (`https://tocah-do-coelho-app.onrender.com`), plano free → *cold start* de ~30–60s.
- **Nativo**: roda em Expo Go (iOS/Android), mas não há build de loja.

> Como a versão web é a principal, **qualquer coisa que só funciona no nativo é bug** (ex.: `Alert.alert` com botões é no-op no react-native-web — ver `06-PROBLEMAS-E-OPORTUNIDADES.md`).

## Tom e personalidade

App informal, de amigos, em pt-BR. Tem piadas internas (o subtítulo da imagem da Home é uma citação meme). Roxo (`#6a1b9a`) é a cor da marca, coelho é o mascote. Manter esse tom: leve, divertido, mas útil.

## Mockups de referência

Em `portfolio-mockups/` (fora do git) há 3 imagens de mockup "portfolio" (Home, Finanças, Feed dark/light). Elas mostram uma direção visual mais limpa que o app atual: cards brancos com bastante respiro, tipografia com hierarquia clara, um anel de progresso para o aluguel ("75% — R$ 950 / R$ 1.200") e meta da caixinha. Podem servir de inspiração para o redesign.
