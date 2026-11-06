# 03 — Backend, API e estrutura da planilha

Arquivo único: `backend/src/server.js`. Estilo RPC: `GET /api?action=X` e `POST /api {action: X, ...}`.
Resposta de erro padrão: `{ ok: false, message }` (400 para validação, 500 para exceção).

## Estrutura da planilha Google

> **Regra de ouro:** a planilha é usada à mão pelos moradores. Não mudar colunas/cabeçalhos existentes. Abas novas são ok (o backend já cria abas com `ensureSheetExists`).

### Aba financeira do mês (`MAI_2026`, `JUN_2026`, ... lida em `A:Z`)

A aba tem **4 blocos** lado a lado/empilhados, localizados pelo texto do cabeçalho (não por linha fixa):

**1. Moradores / aluguel** — cabeçalho na linha onde col C = `Aluguel` e col O = `Total`; termina na linha com col B = `TOTAL`.

| Col | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| campo | nome | aluguel | agua | luz | net | iptu | sofa | dryWall | caixinha | subtotal | multas | contaQuePaga | dividas | **total** |

**2. Contas fixas** — cabeçalho col B = `Conta`, col C = `Valor`. Lê até a primeira linha vazia.
Colunas B..F: `conta`, `valor`, `divisao`, `vencimento`, `status` (`TRUE`/`FALSE` = checkbox paga).
Linhas especiais: `TOTAL` e `MORADORES` (valor = nº de moradores) — o front filtra essas.

**3. Gastos coletivos** — cabeçalho col J = `QUEM`, col K = `QUANTO`.
Colunas J..M: `quem` (quem pagou), `quanto`, `oQue`, `obs`.

**4. Acertos individuais** — cabeçalho col T = `QUEM`, col U contém `DEVE`.
Colunas T..W: `quem` (devedor), `deveQuanto`, `paraQuem` (credor), `obs`.

Cada item devolvido pela API inclui `rowIndex` (linha 1-based na planilha) — usado para editar/excluir.

### Outras abas

| Aba | Range | Conteúdo |
|---|---|---|
| `Caixinha` | `A:D` | `data`, `descricao`, `valor` (negativo = saída), `obs`. Saldo em `Caixinha!C2` |
| `DadosApp` | `A:C` | usada só no health check (fallback do saldo em `E2`) |
| `Painel da Semana` | `A:Z` | escala de tarefas. Parser procura células com nome de morador e pega a próxima célula não-vazia como tarefa (fallbacks: `Escala do Mês`, `Tarefas`) |
| `TarefasFeed` | `A:H` | feed: `week`, `ts`, `type`, `actor`, `target`, `tarefa`, `content`, `photoDataUrl` |
| `TarefasFotos` | `A:E` | fotos grandes em pedaços: `id`, `idx`, `total`, `chunk`, `ts` |
| `AvaliacoesTarefas` | `A:H` | `week`, `actor`, `target`, `nota`, `tarefa`, `comentario`, `ts`, `categoria` (`casa`\|`banheirao`) |
| `AdminLogs` | `A:D` | log de ações admin (tela não usada) |

**Tipos de item no feed (`type`)**: `check` (tarefa concluída), `rating` (avaliação), `comment` (post), `comment_reply` (resposta: `target` = ts do post pai, `tarefa` = autor do pai), `deleted` (soft delete: linha sobrescrita com `['', '', 'deleted', '', '', '', '[post removido]', '']`).

**Semana** = ISO week `YYYY-Www` calculada no servidor (UTC). O feed e as avaliações só mostram a semana atual (ou a mais recente com dados).

**Fotos**: data URL base64 JPEG (qualidade 0.25). Se > 45.000 chars, é quebrada em pedaços na aba `TarefasFotos` e o feed guarda `PHOTO_REF:<id>`. No `getTaskFeed` o backend remonta todas as fotos da semana e devolve base64 completo — **payload pesado**.

## Resolução da aba financeira ativa

`readActiveFinanceSheetRows()`:
1. Se `FINANCE_ACTIVE_SHEET` (ou legado `FORCE_FINANCE_SHEET`) estiver definida e não for `AUTO` → usa essa aba (com nome normalizado).
2. **Se não estiver definida → usa `MAI_2026` fixo** (`DEFAULT_FINANCE_ACTIVE_SHEET`).
3. Se `AUTO` → aba do mês civil em `America/Sao_Paulo`; senão a mais recente ≤ mês atual que tenha moradores; senão o mês seguinte; senão qualquer uma.

Formatos de nome aceitos: `MAI_2026`, `MAIO_2026`, `05_2026`, `05-2026`, `MAI 2026`, `Maio 2026`, `MARÇO_2026`...

## Endpoints GET (`/api?action=`)

| action | params | retorno |
|---|---|---|
| `getDados` | `usuario` | `{ nome, aluguel (col O), mesReferencia }` |
| `getCaixinha` | – | `{ saldo, extratoHint }` |
| `getCaixinhaStatement` | – | `{ ok, items: [{data, descricao, valor, obs, tipo:'entrada'\|'saida'}] }` (mais recente primeiro) |
| `getTarefaSemana` | `usuario` | `{ tarefaNome, descricao (fixa), concluida:false (fixo) }` |
| `getEscalaSemana` | – | `[{ nome, tarefa }]` (fallback hardcoded se a planilha não tiver) |
| `getTaskRatings` | – | `{ ok, week, ratings: {NOME: {casa, banheirao, geral: {total, soma, media}, expectedEvaluators}}, history }` |
| `getTaskFeed` | – | `{ ok, week, feed: [...] }` — ratings vêm com `actor:'Avaliador anonimo'` |
| `getFinanceSnapshot` | `refYm` (só cache-busting) | `{ ok, mesReferencia, residents, contas, gastosColetivos, acertosIndividuais }` |
| `getFinancePreview` | – | diagnóstico da resolução de aba |

`GET /health` → `{ ok, service, sheets: { ok, message } }`.

## Endpoints POST (`/api`, body JSON, limite 30 MB)

| action | body | efeito |
|---|---|---|
| `concluirTarefa` | `tarefaNome, usuario, photoDataUrl` | append `check` no feed |
| `addCaixinhaEntry` | `tipo, descricao, valor, obs` | append em `Caixinha` (saída vira negativo) |
| `addFinanceEntry` | `entryType` (`conta_fixa`\|`gasto_coletivo`\|`acerto_individual`), `usuario`, `payload` | escreve na primeira linha vazia do bloco. Em `gasto_coletivo`, se `payload.dividirCom` vier, o backend também cria acertos (o front atual **não manda** `dividirCom` e cria os acertos ele mesmo) |
| `updateFinanceEntry` | `entryType, rowIndex, payload` | sobrescreve a linha do bloco |
| `deleteFinanceEntry` | `entryType, rowIndex, match` | limpa as células do bloco naquela linha (resolve por `rowIndex` ou por `match`) |
| `toggleContaStatus` | `rowIndex, status` | escreve `TRUE`/`FALSE` em `F{row}` |
| `rateTask` | `actor, target, tarefa, nota(1-5), comentario, categoria` | valida (não pode se autoavaliar, 1x por semana por categoria), append em ratings + item `rating` no feed |
| `addTaskFeedComment` | `actor, content, target, tarefa, photoDataUrl, parentTs, parentActor` | append `comment` ou `comment_reply` |
| `deleteTaskFeedPost` | `rowIndex, ts, actor, postActor, postContent, postType` | soft delete (resolve linha por ts → rowIndex → assinatura) — **não verifica se quem apaga é o autor** |
| `dispararCobrancaAluguel` / `cobrarAtrasados` | – | só loga em `AdminLogs` |

## Pontos de atenção no backend

- `getSheetsApi()` recria o client de auth a cada chamada (sem reutilizar).
- `readCache.clear()` em toda escrita → a próxima rodada de polling de todos os aparelhos bate no Google.
- `addFinanceEntry` relê a aba inteira a cada chamada; o front faz N POSTs em sequência para dividir um gasto → lento e sujeito a corrida (dois moradores salvando ao mesmo tempo podem escrever na mesma "primeira linha vazia").
- Semana calculada em UTC (`weekKey`) mas o mês em São Paulo — domingo à noite no Brasil já pode ser a semana seguinte.
- `extractTaskForUser` tem a lista de moradores duplicada em minúsculo.
