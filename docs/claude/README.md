# Pacote de contexto para o Claude

| Arquivo | Conteúdo |
|---|---|
| `00-PROMPT-PARA-O-CLAUDE.md` | O prompt pronto para colar |
| `01-VISAO-GERAL.md` | Produto, moradores, abas, tom |
| `02-ARQUITETURA.md` | Stack, pastas, fluxo de dados, polling, env, deploy |
| `03-BACKEND-API-E-PLANILHA.md` | Layout da planilha + todos os endpoints |
| `04-TELAS-E-FUNCIONALIDADES.md` | Comportamento atual de cada tela |
| `05-DESIGN-ATUAL.md` | Tokens e problemas visuais |
| `06-PROBLEMAS-E-OPORTUNIDADES.md` | Bugs e melhorias priorizados (P0/P1/P2) |
| `CODIGO-FONTE-COMPLETO.md` | Todo o código (gerado) |

Para regenerar o código-fonte depois de mudanças:

```bash
bash scripts/claude-bundle.sh
```

**Claude.ai (web):** anexe todos os `.md` desta pasta e cole o bloco de texto do `00-PROMPT-PARA-O-CLAUDE.md`.
Opcional: anexe também as imagens de `portfolio-mockups/` como referência visual.

**Claude Code (no repositório):** só cole o prompt; ele lê `docs/claude/` sozinho.
