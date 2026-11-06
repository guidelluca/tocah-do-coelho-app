# Prompt para colar no Claude

> Como usar: copie tudo dentro do bloco abaixo e mande para o Claude **junto com os arquivos** `01` a `06` desta pasta e o `CODIGO-FONTE-COMPLETO.md` (gerado por `scripts/claude-bundle.sh`).
> Se você usa o Claude Code dentro do repositório, não precisa anexar nada: o prompt já manda ele ler a pasta `docs/claude/`.

---

```text
Você vai atuar como engenheiro sênior de React Native/Expo e designer de produto no app "Tocah", da República Tocah do Coelho (uma casa compartilhada por 5 amigos). O app já funciona e está em uso. Quero deixar ele SUPERIOR em funcionalidade e design, DENTRO DO ESCOPO que já existe: sem inventar módulos novos e sem mudar a stack.

## Contexto (leia antes de qualquer coisa)
Anexei (ou estão em docs/claude/):
- 01-VISAO-GERAL.md: o que é o app, quem usa, as 5 abas e o tom.
- 02-ARQUITETURA.md: stack (Expo 54, RN 0.81, React 19, JS puro, react-navigation bottom tabs, AsyncStorage), estrutura de pastas, fluxo de dados, polling, deploy.
- 03-BACKEND-API-E-PLANILHA.md: backend Express que usa o Google Sheets como banco. Tem o layout exato das colunas da planilha e todos os endpoints.
- 04-TELAS-E-FUNCIONALIDADES.md: o comportamento atual de cada tela.
- 05-DESIGN-ATUAL.md: os tokens atuais e os problemas visuais.
- 06-PROBLEMAS-E-OPORTUNIDADES.md: bugs e melhorias já mapeados, priorizados (P0, P1, P2).
- CODIGO-FONTE-COMPLETO.md: todo o código-fonte atual.

## Restrições (não negociáveis)
1. Manter a stack: Expo SDK 54, React Native, JavaScript (sem migrar para TS agora), react-navigation, Express e googleapis. Não adicionar banco de dados, Firebase, Supabase nem autenticação. O Google Sheets continua sendo a fonte da verdade.
2. NÃO alterar o layout da planilha que já existe (abas mensais, posição das colunas B..O, B..F, J..M, T..W, cabeçalhos, Caixinha, TarefasFeed, AvaliacoesTarefas). A planilha também é editada à mão pelos moradores. Criar ABAS NOVAS pode, se necessário (o backend já tem ensureSheetExists).
3. Manter as 5 abas (Início, Finanças, Tarefas, Nilde, Feed) e as funcionalidades atuais. Pode reorganizar, simplificar e polir, mas não remover recursos que o pessoal usa.
4. O alvo principal é o WEB (GitHub Pages via react-native-web). Tudo precisa funcionar no navegador. Atenção: Alert.alert é no-op no react-native-web.
5. Manter o modelo sem login (o morador escolhe quem é). Dá para melhorar a UX dessa escolha.
6. Manter a identidade: roxo #6a1b9a como cor da marca, o coelho e o tom informal em pt-BR. Revise a acentuação dos textos.
7. Bibliotecas novas só se forem leves e compatíveis com Expo 54 e web. Justifique cada uma. Prefira o que já está instalado (reanimated, gesture-handler, linear-gradient, vector-icons).
8. Não mude regras de negócio financeiras (como a divisão de gasto coletivo) sem antes me perguntar. Se encontrar inconsistência, aponte e proponha.

## O que eu quero de você
### Fase 1: Diagnóstico e plano (NÃO escreva código ainda)
- Confirme o que entendeu do app em até 10 linhas.
- Revise a lista do 06-PROBLEMAS-E-OPORTUNIDADES.md: concorde, discorde ou complemente com o que você achar no código.
- Proponha um plano em etapas pequenas e independentes (cada uma vira um commit/PR revisável), nesta ordem:
  a) Correções P0 (bugs reais, principalmente o Alert no web e o dark mode).
  b) Fundação de design: tokens (cores, spacing, radius, tipografia, sombra), hook useTheme() e componentes base (Card, Button, IconButton, Chip, Avatar, BottomSheet, ConfirmDialog, Toast, MoneyText, EmptyState, Skeleton, OfflineBanner).
  c) Redesign tela por tela, usando os componentes base (Home → Finanças → Feed → Tarefas → Nilde).
  d) Funcionalidades P1 (status de tarefa persistente, checks da Nilde e curtidas compartilhados, permissão de exclusão, gasto coletivo em uma única action no backend, quitar acerto etc.).
  e) Performance e robustez P2 (polling e payload de fotos, cache, timezone, código duplicado e morto).
- Para o redesign, descreva a nova hierarquia de cada tela em texto/ASCII antes de codar (o que vai no topo, o que sai, o que muda).
- Liste as perguntas que você precisa que eu responda (ex.: a aba financeira ativa deve ser AUTO ou manual? a regra de divisão do gasto coletivo está certa?).

Pare aqui e espere eu aprovar o plano.

### Fase 2: Execução (depois da minha aprovação)
- Uma etapa por vez. Para cada etapa: arquivos alterados, código completo dos arquivos novos ou alterados (nada de "resto igual" em trechos que mudaram), e como testar (web e Expo Go).
- Mudanças no backend devem continuar compatíveis com a versão antiga do app enquanto o deploy não acontece (não quebre actions existentes; adicione novas).
- Siga o estilo do código atual: componentes funcionais, hooks, StyleSheet.create, nomes em inglês no código e textos de UI em pt-BR.
- No final de cada etapa, liste riscos e o que eu devo verificar manualmente na planilha.

## Critérios de "superior"
- Funciona 100% no web, sem ações silenciosamente quebradas.
- Dark mode impecável, sem nenhuma cor hardcoded fora dos tokens.
- A Home responde em 2 segundos: "quanto eu pago, quando vence, qual é minha tarefa e se já fiz".
- Dados que deveriam ser da casa (checks da Nilde, curtidas, status de tarefa, fotos de perfil) são vistos por todos.
- Menos chamadas ao Google Sheets do que hoje, sem perder a sensação de "ao vivo".
- Visual moderno, limpo e consistente, com hierarquia tipográfica clara, alvos de toque de 44px ou mais, micro-interações sutis e estados vazio/carregando/erro bem resolvidos.
```
