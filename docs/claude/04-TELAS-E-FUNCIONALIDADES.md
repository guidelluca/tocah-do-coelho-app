# 04 — Telas e funcionalidades (como está hoje)

Todas as telas usam `AppHeader` no topo (card com gradiente roxo, logo da república carregada do Google Drive com fallback para `assets/icon.png`, título "República Tocah do Coelho", subtítulo contextual, botão de tema e sino).
O sino só funciona na Home (nas outras telas `onBellPress` não é passado).

---

## Início — `src/screens/HomeScreen.js`

De cima para baixo:
1. **Header** com subtítulo `Morador: X • Maio 2026` e badge de notificações.
2. Botão **Ocultar/Mostrar valores** (mascara R$ como `R$ ••••`).
3. **Chips de morador** (scroll horizontal) → troca o morador "logado".
4. **Card Caixinha** (verde) com saldo → abre modal com formulário (entrada/saída, descrição, valor, obs) + extrato.
5. **Imagem hero** (foto da casa no Drive) com título e frase meme.
6. **Ações rápidas**: "Lancar Gasto" (vai p/ Finanças), "Escala Mes" (vai p/ Tarefas), "Regras" (Alert com texto fixo).
7. Avisos de erro/offline + botão "Tentar novamente".
8. **Seu Aluguel**: valor (col O do morador), mês, badge "AO VIVO", chip "Vence dia 12" (**hardcoded**). Toque → modal extrato do aluguel (aluguel base, água, luz, internet, IPTU, sofá, drywall, caixinha, subtotal, multas, conta que paga, dívidas).
9. **Tarefa da Semana**: avatar, nome da tarefa, descrição fixa "Varrer, tirar lixos e organizar.", status Pendente/Concluída, botão "Marcar como concluída" → abre câmera (foto obrigatória) → `concluirTarefa`. O estado `taskDone` é **só local** (volta a "Pendente" ao recarregar).
10. **Prévia dos Aluguéis**: lista dos 5 com total, toque abre extrato; linha "Total Casa".
11. Modal **Notificações**: últimos 30 itens do feed (sem respostas), destaque nos não lidos; abrir o sino marca tudo como visto.

## Finanças — `src/screens/FinancesScreen.js` (maior tela, ~1400 linhas)

1. Header com o mês de referência.
2. Card "Gestão Financeira" com pill de sincronização (online + hora / offline) e **outro botão de tema** (duplicado com o do header).
3. **KPI strip**: Contas fixas (total), Por morador, Pendências (nº contas não pagas).
4. **Prévia dos Aluguéis**: card por morador com total → modal extrato.
5. **Resumo Financeiro**: total geral (= contas + coletivos + acertos — soma conceitualmente estranha, pois acertos derivam de coletivos), média por conta, total/pagas/pendentes, pills.
6. **Contas Fixas**: cada linha colorida por status (paga verde / pendente laranja / atrasada vermelha — atrasada = dia de hoje > dia de vencimento). Ações: alternar pago, editar (só valor e status), excluir.
7. **Gastos Coletivos**: `quem - oQue`, obs, valor; editar/excluir. Rodapé "total por morador".
8. **Acertos Individuais**: Deve: X / Emprestou: Y, obs, valor; editar/excluir. **Não existe "marcar como quitado"**, só excluir.
9. **FAB "+"** (canto inferior esquerdo) → sheet com 5 opções: alterar valor de conta fixa, novo gasto coletivo, excluir gasto coletivo, novo acerto, excluir acerto.

**Regras de negócio no front (saveEntry):**
- *Gasto coletivo (novo)*: escolhe quem pagou + "dividir com" (obrigatório ≥1). Valor por pessoa = `valor / nº de devedores` (**quem pagou não entra na divisão** — ajuste intencional do commit `907ec57 correct collective debt split`). Grava 1 linha em coletivos (obs recebe texto "Divisao: ...") **e** 1 acerto por devedor (POSTs sequenciais).
- *Gasto coletivo (editar)*: recalcula o texto da obs incluindo o pagador na divisão (inconsistente com o "novo") e **não atualiza os acertos** gerados.
- *Acerto individual (novo)*: devedor principal + credor + "mais pessoas que devem" → divide o valor entre os devedores, 1 POST por devedor.
- Input de dinheiro com máscara tipo caixa eletrônico (`formatMoneyInput`: digita 1234 → `12,34`).
- Exclusão: tenta `deleteFinanceEntry`; se falhar, faz `updateFinanceEntry` com campos vazios.

## Tarefas — `src/screens/TasksScreen.js`

1. Card laranja "Mascote Nilde (Diário)" (texto fixo).
2. **Tarefas da Semana**: pill "N feitas"; para cada morador da escala: avatar, nome, tarefa, "Nota casa: 4.5 (3/4)" e, se a tarefa contém "banheir", "Nota banheirão".
   - Botão check → câmera obrigatória → `concluirTarefa`. Estado `checked` **só local por índice** (some ao recarregar, e qualquer morador pode marcar a tarefa de qualquer outro; o check é gravado com o morador atual como autor mas com a tarefa do outro).
   - Botão estrela → modal de avaliação (1–5 estrelas, categoria casa/banheirão, comentário). Não pode se autoavaliar. 1 avaliação por semana por alvo/categoria.

## Nilde — `src/screens/NildeScreen.js`

1. Foto da Nilde (Drive).
2. **Semana Atual**: % de progresso, `X/21 checks`, barra, mini-stats (hoje X/3, dias 100%, "de plantão" = morador atual), próximo slot pendente.
3. **Hoje**: 3 slots (Manhã-Feno, Tarde-Feno, Noite-Ração) → "Marcar" abre modal (comentário + confirmar com/sem foto). Publica no feed como `comment` com `target: 'NILDE'`. Quem marcou pode "Desfazer" (só local; o post no feed fica).
4. **Visão da Semana**: grid 2 colunas com 7 cards de dia (% e os 3 slots).
5. **Alimentação Ideal** (4 cards informativos) e **Não pode comer** (chips vermelhos).

⚠️ O estado dos checks fica **só no AsyncStorage do aparelho** — outros moradores não veem que a Nilde já comeu (só veem o post no feed). É a principal falha funcional dessa tela.

## Feed — `src/screens/FeedScreen.js`

1. **Composer**: avatar, botão editar foto de perfil (galeria, salvo só local), filtros (Tudo / Checks / Notas / Posts com contadores), input + galeria + câmera + enviar, preview da foto.
2. Skeletons no carregamento.
3. **Posts**: avatar (foto local ou inicial com paleta por nome), autor, pill de tipo, tempo relativo ("ha 5 min"), tarefa em destaque, conteúdo, foto (toque → visualizador fullscreen).
   - Ações no topo: responder, excluir (qualquer um pode excluir qualquer post).
   - Rodapé: Curtir (**só local**, ninguém mais vê), "N comentários", Compartilhar (`Share` nativo).
   - Respostas em timeline com bolinha + linha; cada resposta com excluir.
4. Só mostra a **semana atual**; sem paginação/histórico.

## Admin — `src/screens/AdminScreen.js`

Botões "Disparar Cobrança de Aluguel" e "Cobrar Atrasados" (só gravam log). **Não está registrada no navigator** → código morto.
