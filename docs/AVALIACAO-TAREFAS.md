# Avaliação semanal das tarefas

## Como funciona
- **Entrega:** foto(s) pelo app (até 6), uma vez por semana. Prazo domingo 23h59 (Lavanderia e Panos: segunda 23h59). Atraso conta em dias; dá pra entregar até quarta 23h59 (tolerância, ajustável).
- **Avaliação:** abre quando todos entregam ou quando acaba a tolerância. Nota 1–5 + comentário, sem mostrar quem deu. Banheirão só é avaliado por Allan, Gustavo e Ramon (`banheiraoGrupo`).
- **Notas ao vivo:** média de cada um durante a avaliação (aparece a partir de 2 notas; banheirão quando o grupo todo avaliou).
- **Fechamento:** domingo seguinte 23h59 (ou antes, se todos avaliarem). Resultado vai para a aba `Desempenho`.
- **Multa:** não entregou até o fim da tolerância → R$ 60 automático na Caixinha. Média abaixo de 3 (com 3+ notas) → fica **pendente** até o Guilherme confirmar na Administração.
- **Avisos por e-mail (Apps Script):** régua de cobrança, avaliação aberta com estrelas clicáveis, lembrete de notas, resultado, multa.

## Segurança
- **PIN do morador:** na primeira entrega/avaliação cada um cria um PIN. Com ele, ninguém entrega ou avalia no nome do outro (no app e no link do e-mail). Esqueceu? Admin → Segurança → Apagar PIN.
- **PIN do admin:** recomendado definir `ADMIN_PIN` no Render (Environment). Sem ele, o PIN fica na aba Config.
- **Quem avaliou:** gravado cifrado na aba `AvaliacoesTarefas` (`#xxxx`).
- Quem tem acesso de **edição à planilha** ainda consegue mexer nas abas. Deixe a planilha compartilhada só com quem precisa editar.

## Abas novas (criadas sozinhas)
`CiclosEscala`, `Desempenho`, `MultasTarefas`, `AvisosEmail`, `AjustesTarefas`, `PinsMoradores`.

## Config (aba `Config`)
| chave | padrão | o que faz |
|---|---|---|
| avaliacaoInicio | 2026-W46 | primeira semana com avaliação |
| avaliacaoToleranciaDias | 3 | dias depois do domingo para entregar com atraso |
| avaliacaoMultaAuto | sim | multa por não entregar |
| avaliacaoMultaMediaAuto | não | multa por média baixa automática (não = admin confirma) |
| avaliacaoMultaValor | 60 | valor da multa |
| avaliacaoMediaMinima | 3 | média mínima |
| avaliacaoMinAvaliacoes | 3 | mínimo de notas para valer a regra da média |
| banheiraoGrupo | ALLAN,GUSTAVO,RAMON | quem avalia o banheirão |

## Publicar
1. Merge do branch `avaliacao-semanal` na `main` (o GitHub Pages publica sozinho).
2. Render → Environment → adicionar `ADMIN_PIN` (4 a 8 números) → **Manual Deploy → Deploy latest commit**.
3. Apps Script das tarefas: colar `apps-script/BotTocah-tarefas.gs`, salvar, recarregar a planilha e clicar em **⭐ Ligar avisos da avaliação**.
4. Admin → Segurança: conferir o Diagnóstico.

## Limites conhecidos (modelo gratuito)
- Render grátis dorme; o Apps Script acorda a cada 10 min das 7h à meia-noite.
- Cota do Gmail pelo Apps Script: ~100 destinatários/dia (o script avisa no Diagnóstico).
- Fotos ficam na planilha (aba `TarefasFotos`) e numa pasta do Drive ao fechar a semana.
