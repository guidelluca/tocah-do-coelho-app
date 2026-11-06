# 02 — Arquitetura e stack

## Stack

**Frontend** (raiz do repo)
- Expo SDK **54**, React Native **0.81.5**, React **19.1**, `newArchEnabled: true`
- `react-native-web` 0.21 (alvo principal = web)
- `@react-navigation/bottom-tabs` 7 (só tabs, sem stack)
- `@react-native-async-storage/async-storage` (persistência local)
- `expo-image-picker` (câmera/galeria → base64)
- `expo-linear-gradient`, `expo-blur` (blur instalado mas não usado), `react-native-reanimated` 4 (instalado, plugin no babel, **não usado**), `react-native-gesture-handler`
- Ícones: `@expo/vector-icons` → `MaterialCommunityIcons`
- JavaScript puro (sem TypeScript), sem lint, sem testes, sem lib de UI, sem lib de estado (só Context)

**Backend** (`backend/`)
- Node + Express 4, `cors`, `dotenv`, `googleapis` (Sheets v4)
- Um arquivo só: `backend/src/server.js` (~1300 linhas)
- Cache em memória de leituras (TTL 120s), limpo a cada escrita

## Estrutura de pastas

```
App.js                      # Providers + NavigationContainer + tema do navigation
index.js                    # registerRootComponent
app.json / app.config.js    # config Expo; baseUrl do GH Pages só na CI
src/
  navigation/AppNavigator.js   # Bottom tabs (5 telas) + badge de notificação no Feed
  components/AppHeader.js      # Header com gradiente roxo, logo, toggle tema, sino
  context/
    ThemeContext.js            # isDark + toggleTheme (persistido)
    ResidentContext.js         # morador selecionado + fotos de perfil (locais)
    NotificationContext.js     # polling do feed a cada 12s, contagem de não lidos
  constants/
    theme.js                   # lightTheme / darkTheme (10 tokens cada)
    residents.js               # lista fixa dos 5 moradores
  services/api.js              # cliente HTTP: fallback de bases, retry, cache offline
  utils/dateLabel.js           # "MAI_2026" -> "Maio 2026"
  screens/
    HomeScreen.js        (~680 linhas)
    FinancesScreen.js    (~1400 linhas)
    TasksScreen.js       (~300 linhas)
    NildeScreen.js       (~640 linhas)
    FeedScreen.js        (~690 linhas)
    AdminScreen.js       (~50 linhas — NÃO está no navigator, código morto)
backend/
  src/server.js               # API inteira
  scripts/preview-finance.js  # debug: qual aba financeira está ativa
scripts/web-preview.cjs       # serve dist/ localmente + proxy /api -> backend
.github/workflows/deploy-web.yml  # build web + deploy GH Pages
```

## Árvore de providers

```
SafeAreaProvider
 └ ThemeProvider
    └ ResidentProvider
       └ NotificationProvider   (depende de resident)
          └ Root → NavigationContainer(theme) → AppNavigator (tabs)
```

## Fluxo de dados

```
Tela ──> services/api.js ──HTTP──> backend Express ──googleapis──> Google Sheets
             │                         │
             │ AsyncStorage cache 24h  │ cache em memória 120s
             └ (fallback offline)      └ (fallback em quota exceeded)
```

- **GET** `/api?action=...` e **POST** `/api` com `{ action, ... }` (estilo RPC, um endpoint só).
- `api.js` tenta uma lista de bases candidatas (localhost na prévia, `EXPO_PUBLIC_API_URL`, Render, IP do Expo...) com timeout de 18s (35s para POST grande) e 1 retry em erro transiente.
- Se tudo falhar num GET, devolve o último payload salvo no `AsyncStorage` (até 24h) e publica `connectionStatus = { online:false, source:'cache' }`. As telas assinam isso via `subscribeApiConnectionStatus` para mostrar aviso offline.

## Atualização dos dados (polling)

Não há websocket/push. Cada tela faz polling enquanto está focada:

| Onde | Intervalo | Requisições |
|---|---|---|
| `NotificationContext` (sempre ativo) | 12s | `getTaskFeed` (inclui fotos base64!) |
| Home | 20s + ao voltar para o app | `getFinanceSnapshot`, `getCaixinha`, `getTarefaSemana` |
| Finanças | 20s + ao voltar para o app | `getFinanceSnapshot` |
| Tarefas | 20s | `getEscalaSemana`, `getTaskRatings` |
| Feed | 20s | `getTaskFeed` |

## Persistência local (AsyncStorage)

| Chave | Conteúdo |
|---|---|
| `@tocah_selected_resident` | nome do morador atual |
| `@tocah_resident_photos` | `{ NOME: uri }` fotos de perfil (**só no aparelho**) |
| `@tocah_theme_mode` | `'dark' \| 'light'` |
| `@tocah_last_seen_feed_ts:<NOME>` | último ts visto (notificações) |
| `@tocah_feed_likes_v1` | `{ ts: true }` curtidas (**só no aparelho**) |
| `@tocah_nilde_feed_log_v2` | checks da Nilde da semana (**só no aparelho**) |
| `@tocah_api_cache:<path?query>` | cache offline de GETs |

## Variáveis de ambiente

**Frontend** (`.env` na raiz; na CI é definido no workflow)
- `EXPO_PUBLIC_API_URL` — ex.: `https://tocah-do-coelho-app.onrender.com/api`
- `EXPO_WEB_BASE_PATH` — opcional; na CI o baseUrl `/tocah-do-coelho-app` é aplicado automaticamente
- `PREVIEW_API_TARGET` — alvo do proxy do `preview:web` (padrão `http://127.0.0.1:4000`)

**Backend** (`backend/.env` / Render)
- `SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (obrigatórios)
- `PORT` (4000)
- `FINANCE_ACTIVE_SHEET` — nome da aba do mês (ex. `JUN_2026`) ou `AUTO` (mês civil em São Paulo). **Sem valor → `MAI_2026` fixo no código.**
- `DADOS_RANGE`, `CAIXINHA_RANGE`, `TAREFA_RANGE`, `RATINGS_SHEET`, `TASK_FEED_SHEET`, `ADMIN_LOG_SHEET`, `TASK_PHOTOS_SHEET` (têm defaults)

## Scripts

```bash
npm start              # expo start
npm run web            # expo web dev
npm run build:web      # expo export --platform web -> dist/
npm run preview:web    # build + serve dist com proxy /api
npm run backend        # sobe backend/ (precisa backend/.env)
npm --prefix backend run preview:finance   # debug da aba financeira ativa
```

## Deploy

- `push main` → GitHub Actions (`deploy-web.yml`): `npm ci` → `npm run build:web` com `EXPO_PUBLIC_API_URL` do Render → GitHub Pages.
- Backend: Render (deploy separado, fora deste workflow).
- A pasta `dist/` está commitada no repo (resquício de deploy manual antigo).
