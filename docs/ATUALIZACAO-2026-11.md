# Atualização do Tocah — novembro/2026

Tudo continua **gratuito**: GitHub Pages (front), Render free (backend), Google Sheets API (cota grátis). Nenhuma biblioteca nova, nenhum serviço novo.

## Ordem de deploy (importante)

1. **Backend primeiro** (Render). Ele continua aceitando o app antigo, então pode subir antes sem quebrar nada.
2. Depois o **front** (push na `main` → GitHub Actions → Pages).
   O app novo usa ações que só existem no backend novo. Se o front subir antes, Finanças/Nilde/Feed vão dar erro até o Render atualizar.

## Antes do push

```bash
npx expo install --fix        # corrige expo-image-picker (estava na versão da SDK 55)
npm run check:ui              # sem cor fora dos tokens e sem Alert.alert
npm run test:backend          # testes dos parsers da planilha
git rm -r --cached dist       # dist/ é gerado pela CI; agora fica no .gitignore
```

## Prévia local antes de produção

Com uma **cópia** da planilha (Arquivo → Fazer uma cópia, compartilhada com a service account):

```bash
# terminal 1 — backend apontando para a CÓPIA
cd backend && SPREADSHEET_ID=<id-da-copia> FINANCE_ACTIVE_SHEET=AUTO npm start
# terminal 2 — build web + servidor local com proxy /api -> localhost:4000
npm run preview:web
```

Na prévia local o app **nunca** cai para o Render (não grava na planilha real por engano).
No celular: `npx expo start` e abrir no Expo Go (precisa do backend local na mesma rede).

## Variáveis no Render

- `FINANCE_ACTIVE_SHEET`: apague ou ponha `AUTO` para o app seguir o mês civil (São Paulo). Se estiver `MAI_2026`, ele continua preso em maio.
- Opcional e grátis: um ping a cada 10 min em `https://tocah-do-coelho-app.onrender.com/health` (ex.: cron-job.org) evita o "acordando o servidor" de 30–60 s. O plano free tem 750 h/mês, dá para um serviço ficar ligado o mês inteiro.

## Abas novas que o backend cria sozinho (o layout das abas existentes não muda)

| Aba | Para quê |
|---|---|
| `Config` | `vencimentoAluguel`, `regrasDaCasa`, `descricaoTarefa`, `fraseHome` — editem à mão |
| `FeedLikes` | curtidas compartilhadas |
| `Perfis` | fotos de perfil (256 px) que todos veem |
| `AcertosQuitados` | histórico do botão "Quitar" |

Nilde e status de tarefa **não** precisam de aba nova: saem dos posts que já existem em `TarefasFeed`.

## O que conferir na planilha depois do deploy

- Editar o valor de uma conta fixa **não apaga mais** Divisão (D) e Vencimento (E). Só as células alteradas são gravadas, então fórmulas das outras colunas ficam intactas.
- Novo gasto coletivo: 1 linha em J..M + 1 linha por devedor em T..W, gravadas numa única chamada. A obs ganha uma marca curta `#gxxxxx`, que liga o gasto aos acertos. Não apaguem essa marca: é ela que permite recalcular os acertos ao editar o gasto.
- "Quitar" limpa a linha do acerto (igual a excluir) e copia os dados para `AcertosQuitados`. Se a coluna N (Dívidas) for fórmula sobre T..W, o total do morador cai na hora, como já acontecia ao excluir.
- Caixinha: a data agora sai no fuso de São Paulo, e a obs registra "por NOME".
- Semana do feed/avaliações em São Paulo (antes UTC: domingo depois das 21 h já contava como a semana seguinte).

## Regras de negócio mantidas (não mudei sem perguntar)

- **Gasto coletivo**: o valor continua dividido só entre os devedores marcados (quem pagou não entra), como no commit `907ec57`. Agora existe um interruptor opcional, *desligado por padrão*: "quem pagou também entra na divisão".
- Acerto com vários devedores: o total é dividido igualmente. Os centavos agora fecham exatos (ex.: R$ 100 / 3 = 33,34 + 33,33 + 33,33).

## Bugs corrigidos que existiam em produção

- Excluir no Feed e em Finanças não funcionava no web (`Alert.alert` não faz nada no navegador). Agora há diálogo e toast próprios.
- Editar conta fixa apagava Divisão e Vencimento.
- O backend gravava como "quem pagou" o **morador logado**, e não o escolhido no formulário (ação antiga `addFinanceEntry`).
- Depois de excluir um acerto ou gasto, os lançamentos abaixo do buraco sumiam do app.
- O retry por timeout (Render dormindo) duplicava gastos, posts e checks. Agora cada envio tem um `requestId` e o servidor nunca grava duas vezes.
- Um erro de validação (ex.: "você já avaliou") virava "Resposta inválida da API".
- Pendências e média contavam as linhas TOTAL e MORADORES.
- Status "tarefa feita", checks da Nilde, curtidas e fotos de perfil ficavam só no aparelho.
- Qualquer um apagava post de qualquer um, e qualquer um concluía a tarefa do outro.
- `getSpreadsheetTitles` sem cache: cada leitura de finanças gastava uma chamada extra no Sheets.

## Menos chamadas ao Sheets

- O app pergunta "o que mudou?" a cada 15 s (`getSyncState`, que fica em memória no servidor e faz **zero** leituras no Sheets). Só recarrega o que mudou, mais uma atualização geral a cada 2 min (para pegar edições feitas à mão).
- O polling para quando a aba do navegador fica em segundo plano.
- O feed vem sem fotos (≈ 4 KB em vez de ≈ 170 KB por consulta no teste). Cada foto é baixada uma vez, só quando aparece na tela.
- No web as fotos são reduzidas no navegador antes do envio (até 1080 px; perfil 256 px).
- Respostas grandes vão com gzip (zlib nativo do Node).
