# 06 — Problemas conhecidos e oportunidades (dentro do escopo)

Lista levantada lendo o código. Ordenada por impacto. "Escopo" = melhorar o que já existe, sem inventar módulos novos.

## P0 — Bugs reais

1. **`Alert.alert` não faz nada no web** (`react-native-web` implementa como `static alert() {}`). O app é publicado principalmente no GitHub Pages, então no web:
   - **Excluir post/comentário no Feed nunca executa** (a exclusão está dentro do `onPress` do botão do Alert).
   - **Excluir lançamento em Finanças nunca executa** (mesmo padrão).
   - Mensagens de sucesso/erro/validação ("Preencha descrição e valor", "Comprovação obrigatória"...) não aparecem.
   - "Regras da Casa" na Home não abre nada; o menu de foto de perfil no Feed não abre.
   → Solução: criar um componente próprio de confirmação (bottom sheet/dialog) + um toast/snackbar e substituir **todos** os `Alert.alert` (são ~48).

2. **Aba financeira fixa em `MAI_2026`** quando `FINANCE_ACTIVE_SHEET` não está definida no Render (`DEFAULT_FINANCE_ACTIVE_SHEET` em `server.js`). Hoje (nov/2026) isso mostra maio se ninguém atualizou a env. Precisa decidir com o usuário: manter manual, usar `AUTO`, ou um seletor de mês no app (ver P2).

3. **Status "tarefa concluída" não persiste**: Home (`taskDone`) e Tarefas (`checked` por índice) guardam só em `useState`. Ao recarregar volta "Pendente", mesmo havendo o `check` gravado no feed. O backend já tem os dados (`TarefasFeed` com `type=check`, `actor`, `week`) → derivar o status de lá (ex.: `getEscalaSemana`/`getTarefaSemana` devolverem `concluida` real).

4. **Em Tarefas, qualquer morador pode "concluir" a tarefa de outro** — o check é gravado com `usuario = resident atual` e `tarefa = tarefa do outro`. Deve permitir concluir só a própria linha.

5. **Dark mode com texto ilegível** em vários componentes (ver `05-DESIGN-ATUAL.md`), principalmente o sheet do FAB de Finanças.

## P1 — Funcionalidades existentes que estão "pela metade"

6. **Checks da Nilde só no aparelho** (`AsyncStorage`). Outros moradores não veem que ela já comeu → risco real de alimentar 2x ou nenhuma. Persistir no backend (ex.: aba nova `NildeChecks` com `data, slot, morador, ts`) e ler de lá; desfazer = soft delete.
7. **Curtidas só locais** — ninguém vê as curtidas dos outros. Persistir (aba `FeedLikes` ou coluna extra) e mostrar contador + quem curtiu.
8. **Fotos de perfil só locais** (URI do aparelho). Os outros veem só a inicial. Subir como base64 pequeno (ex.: 128px) numa aba `Perfis` reaproveitando o esquema de fotos.
9. **Feed sem permissão de exclusão** — qualquer um apaga post de qualquer um. Restringir no front e no backend a `actor === autor` (manter o modelo sem login).
10. **Editar gasto coletivo não atualiza os acertos derivados** e usa regra de divisão diferente da criação. Unificar a regra (confirmar com o usuário qual é a correta: hoje, ao criar, quem pagou **não** entra na divisão).
11. **Acertos sem "quitar"**: só dá para excluir. Um botão "Quitado" (que registra e remove/arquiva) é o fluxo natural.
12. **Dividir gasto = N POSTs sequenciais** → lento, falha parcial deixa planilha inconsistente, corrida entre dois aparelhos. Mover a criação de coletivo + acertos para **uma única action** no backend (o backend já tem meio caminho com `payload.dividirCom`).
13. **Contas fixas**: o form só edita valor/status. `vencimento` e `divisao` existem na planilha mas não são editáveis. "Atrasada" compara só o dia do mês.
14. **Dados hardcoded na UI**: "Vence dia 12" (Home), descrição da tarefa "Varrer, tirar lixos e organizar.", "(x/4)" avaliadores, texto das Regras, card "Mascote Nilde" em Tarefas.
15. **Feed só da semana atual**, sem histórico nem "carregar mais". Notificações idem.
16. **Sino de notificações só funciona na Home** (nas outras telas o `AppHeader` não recebe `onBellPress`). Centralizar o modal de notificações (ex.: no próprio `AppHeader` ou no `NotificationContext`).
17. **Resumo Financeiro "total geral"** soma contas + coletivos + acertos (os acertos são derivados dos coletivos → conta dupla). Rever o que esse número quer dizer.

## P2 — Performance, robustez e qualidade

18. **Polling pesado**: o `NotificationContext` chama `getTaskFeed` a cada **12s**, e esse endpoint devolve **todas as fotos base64 da semana**. Somado às outras telas (20s), estoura a cota do Sheets e gasta dados móveis. Ideias: endpoint leve só com metadados (`getFeedMeta`/`since=ts`), fotos por ID/lazy, polling adaptativo (pausar quando a aba do navegador está oculta), intervalo maior.
19. **Cache do backend é limpo inteiro a cada escrita** (`readCache.clear()`) e o client de auth do Google é recriado a cada chamada.
20. **Semana em UTC** no backend vs. mês em São Paulo; Nilde usa semana local do aparelho. Unificar em `America/Sao_Paulo`.
21. **Código duplicado**: `toNumber`, `brl`, `getAvatarInitial`, `takeTaskProofPhoto`, `formatRelativeTime`, aviso offline, modais, etc. Extrair para `src/utils/` e `src/components/`.
22. **Telas gigantes** (Finanças ~1400 linhas). Quebrar em componentes por seção.
23. **Código morto**: `AdminScreen` (fora do navigator), `getDados`, `getApiDebugInfo`, `setPreferredApiBase`, `expo-blur`, estilos não usados (`rentItem`, `weekDot`...), arquivos vazios `expo` e `tocah-do-coelho-app@1.0.0` na raiz, `dist/` commitado.
24. **Cold start do Render** (~30–60s): sem feedback bom. Mostrar estado "acordando servidor" e dados do cache instantaneamente (stale-while-revalidate) em vez de spinner.
25. **Sem testes/lint**. Pelo menos testes unitários dos parsers puros do backend (`parseFinanceSnapshot`, `parseMonthSheetTitle`, `toNumberLike`) e das utils de dinheiro do front.

## Oportunidades de design (sem fugir do escopo)

- **Design system mínimo**: expandir `theme.js` com tokens de spacing, radius, typography (escala de 5–6 tamanhos, pesos 400/600/700), elevation; hook `useTheme()` que devolve `colors` (acabar com `isDark ? darkTheme : lightTheme` em cada tela).
- **Componentes base**: `Card`, `SectionHeader`, `Button` (primary/secondary/ghost/danger, min 44px), `IconButton`, `Chip`, `Avatar`, `BottomSheet`, `ConfirmDialog`, `Toast`, `MoneyText` (com máscara), `EmptyState`, `Skeleton`, `OfflineBanner`.
- **Home focada no morador**: hero com "Seu aluguel" + vencimento + status de pagamento e "Sua tarefa" no topo; caixinha e prévia da casa abaixo. Seleção de morador como avatar no header (toque abre seletor) em vez de chips soltos.
- **Finanças mais clara**: remover duplicações, abas/segment (Contas · Coletivos · Acertos), resumo "quanto eu devo / quanto me devem" para o morador atual (dado já existe nos acertos), FAB à direita só com "criar".
- **Feed** com cara de rede social de verdade: curtidas com contador, avatar real, imagem com proporção correta, input de resposta mais confortável.
- **Nilde**: hoje em destaque com 3 botões grandes, semana como faixa horizontal compacta (7 bolinhas) em vez de 7 cards grandes.
- **Micro-interações** com Reanimated (já instalado): press scale, check animado, transição de sheets, contador animado de valores.
- **Web**: `maxWidth` ~480–520px centralizado, `cursor: pointer`, PWA (`display: standalone` já está no `app.json`), splash/ícone acompanhando o tema.
- **Texto**: revisar todo o pt-BR com acentuação correta.
- **Imagens**: mover logo/hero/Nilde para `assets/` locais (hoje vêm do Google Drive com 3 URLs de fallback).
