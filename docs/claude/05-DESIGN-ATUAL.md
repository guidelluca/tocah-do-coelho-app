# 05 — Design atual (estado e problemas)

## Tokens existentes (`src/constants/theme.js`)

| token | light | dark |
|---|---|---|
| background | `#f6f4fb` | `#14131d` |
| surface | `#ffffff` | `#1e1d2b` |
| text | `#1d1b2a` | `#f5f3ff` |
| muted | `#7a7394` | `#b2aacd` |
| primary | `#6a1b9a` | `#b57ad6` |
| positive | `#00c853` | `#00c853` |
| border | `#e9e5f7` | `#312f45` |
| secondary | `#ede7ff` | `#2e2340` |
| warning | `#f59e0b` | `#fbbf24` |
| danger | `#ef4444` | `#f87171` |

Uso: cada tela faz `const colors = isDark ? darkTheme : lightTheme` e aplica inline. **Não há tokens de espaçamento, raio, tipografia ou sombra.**

## Linguagem visual atual

- Cards brancos arredondados (raio 16–22), borda 1px clara, sombra roxa suave.
- Header em card com gradiente `#6a1b9a → #4a148c` e "orbs" brancos translúcidos.
- Tab bar flutuante arredondada (raio 20, altura 82) com fundo ativo lilás.
- Modais sempre como *bottom sheet* (overlay escuro + card com topo arredondado), `animationType="slide"`.
- Pills/chips arredondados para status e filtros.
- Fonte do sistema; quase todo texto em peso `700`–`900` e tamanhos 9–12px → hierarquia achatada, tudo "grita" igual e fica pequeno.

## Problemas de design identificados

**Consistência / sistema**
- Centenas de cores hex hardcoded nos `StyleSheet` (`#6a1b9a`, `#f3e5f5`, `#374151`, `#d1d5db`, `#fff`...) em vez dos tokens. Cada tela tem a sua variação de roxo-claro (`#f3e5f5`, `#f3e8ff`, `#efe7ff`, `#ede9fe`, `#faf5ff`...).
- Componentes repetidos copiados em cada tela: card, avatar (inicial ou foto), bottom sheet modal, botão primário, chip de morador, input, linha de extrato, aviso offline + "Tentar novamente".
- Raios, paddings e sombras variam arbitrariamente (13, 14, 15, 16 px...).

**Dark mode quebrado em vários pontos** (cores fixas claras):
- Inputs com `backgroundColor: '#fff'` / texto `#111827` (Home caixinha, Tarefas, Nilde, Finanças).
- Chips de morador na Home (`#fff` / `#374151`), `segmentBtn`, `categoryBtn`, `cancelBtn`.
- Card da Caixinha verde-claro, card "Mascote Nilde" amarelo-claro em Tarefas.
- `quickOptionTitle: '#111827'` no sheet do FAB de Finanças → **texto escuro em fundo escuro**.
- Item não lido nas notificações com fundo `#f5f3ff` no dark.
- `getBreakdownMeta` usa `#374151` para valores neutros (ilegível no dark).
- `rentChip` branco, `closeBtn` lilás claro, divisores `#e5e7eb`.

**Hierarquia e UX**
- Home é longa e com muita coisa no mesmo peso: chips de morador, caixinha, foto grande, ações, aluguel, tarefa, prévia. O dado mais importante (quanto eu pago / minha tarefa) não está no topo.
- Finanças repete a "Prévia dos Aluguéis" que já está na Home e mostra 3 blocos de KPIs que se sobrepõem (KPI strip + Resumo + totais por seção).
- FAB à esquerda e com opções de "excluir" misturadas com "criar".
- Botões de ação com 24–32px (abaixo do recomendado de 44px de alvo de toque).
- Textos sem acento em vários lugares ("Lancar Gasto", "Escala Mes", "Nao foi possivel", "Financas", "Inicio", "Racao", "Manha", "banheirao", "comentario", "lancamento"...).
- Feedback de sucesso/erro via `Alert.alert` (que **não aparece no web**).
- Sem estados vazios ilustrados, sem animações/transições (Reanimated está instalado e não é usado), sem haptics.
- Imagens da logo/hero/Nilde vêm do Google Drive (lentas, às vezes bloqueadas) — sem placeholder enquanto carregam.
- `app.json` tem `userInterfaceStyle: "light"` e splash branco (não acompanha o dark).
- Web em tela larga: o layout estica para a largura toda (sem `maxWidth` centralizado).
