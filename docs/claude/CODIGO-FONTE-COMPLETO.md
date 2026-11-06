# Código-fonte completo — Tocah

Gerado em 2026-11-05 12:30 a partir do commit `fdc08e8`.

## `.env.example`

```text
# Raiz do repo — Expo carrega no `npm run build:web` / `expo start`.
# GitHub Actions define EXPO_PUBLIC_API_URL para o Render na build de deploy.

# Desenvolvimento / build local (opcional). Em prévia em 127.0.0.1 ou localhost o app
# prioriza automaticamente http://ESTE_HOST/api (proxy do `npm run preview:web`).
# EXPO_PUBLIC_API_URL=https://tocah-do-coelho-app.onrender.com/api

# Encaminhamento no servidor de prévia (opcional; padrão http://127.0.0.1:4000):
# PREVIEW_API_TARGET=http://127.0.0.1:4000

```

## `.github/workflows/deploy-web.yml`

```yaml
name: Deploy Web App

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Export Expo web build
        env:
          EXPO_PUBLIC_API_URL: https://tocah-do-coelho-app.onrender.com/api
        run: npm run build:web

      - name: Setup Pages
        uses: actions/configure-pages@v6

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v5
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5

```

## `.gitignore`

```text
node_modules/
backend/node_modules/
.npm-cache/
backend/.npm-cache/
backups/
.expo/
.env
backend/.env
.env.*
!.env.example
*.log
.DS_Store
.web-preview/
backend/data/
portfolio-mockups/

```

## `App.js`

```javascript
import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useThemeMode } from './src/context/ThemeContext';
import { ResidentProvider } from './src/context/ResidentContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { darkTheme, lightTheme } from './src/constants/theme';

function Root() {
  const { isDark } = useThemeMode();
  const colors = isDark ? darkTheme : lightTheme;
  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };
  return (
    <NavigationContainer theme={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} translucent={false} />
        <AppNavigator />
      </View>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ResidentProvider>
          <NotificationProvider>
            <Root />
          </NotificationProvider>
        </ResidentProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}


```

## `app.config.js`

```javascript
const appJson = require('./app.json');

/** Caminho publicado no GitHub Pages (nome do repositório). Só aplicado no build da CI ou com EXPO_WEB_BASE_PATH. */
const GH_PAGES_BASE = '/tocah-do-coelho-app';

function webExperiments() {
  const explicit = process.env.EXPO_WEB_BASE_PATH;
  let base = null;
  if (explicit && !['0', 'false', '/'].includes(String(explicit).trim())) {
    base = explicit.startsWith('/') ? explicit : `/${explicit}`;
  } else if (process.env.GITHUB_ACTIONS === 'true') {
    base = GH_PAGES_BASE;
  }
  if (!base) return {};
  return { baseUrl: base.replace(/\/$/, '') || GH_PAGES_BASE };
}

module.exports = () => ({
  expo: {
    ...appJson.expo,
    experiments: {
      ...(appJson.expo.experiments || {}),
      ...webExperiments(),
    },
  },
});

```

## `app.json`

```json
{
  "expo": {
    "name": "tocah-do-coelho-app",
    "slug": "tocah-do-coelho-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "edgeToEdgeEnabled": true
    },
    "web": {
      "output": "single",
      "favicon": "./assets/favicon.png",
      "name": "Tocah",
      "shortName": "Tocah",
      "display": "standalone",
      "themeColor": "#6a1b9a",
      "backgroundColor": "#ffffff",
      "lang": "pt-BR",
      "description": "App da República Tocah para tarefas, finanças e feed."
    }
  }
}

```

## `babel.config.js`

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};

```

## `backend/package.json`

```json
{
  "name": "tocah-sheets-proxy",
  "version": "1.0.0",
  "private": true,
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "preview:finance": "node scripts/preview-finance.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.6.1",
    "express": "^4.21.2",
    "googleapis": "^150.0.1"
  }
}

```

## `backend/scripts/preview-finance.js`

```javascript
#!/usr/bin/env node
/**
 * Pré-visualização da resolução da aba financeira (mês civil SP vs aba lida).
 * Uso:
 *   1) npm start (outro terminal, com .env)
 *   2) npm run preview:finance
 * Remoto (ex. staging):
 *   API_URL=https://sua-api.onrender.com npm run preview:finance
 */

const http = require('http');
const https = require('https');

const base = (process.env.API_URL || `http://127.0.0.1:${process.env.PORT || 4000}`).replace(/\/$/, '');
const url = `${base}/api?action=getFinancePreview`;

function getJson(targetUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const lib = u.protocol === 'https:' ? https : http;
    lib
      .get(targetUrl, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (e) {
            reject(new Error(`Resposta nao-JSON (${res.statusCode}): ${body.slice(0, 500)}`));
          }
        });
      })
      .on('error', reject);
  });
}

getJson(url)
  .then(({ status, json }) => {
    process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    if (status >= 400 || json.ok === false) process.exit(1);
  })
  .catch((err) => {
    const msg = String(err.message || err);
    process.stderr.write(`${msg}\n`);
    process.stderr.write(`URL: ${url}\n`);
    if (/ECONNREFUSED/i.test(msg)) {
      process.stderr.write(
        '\nDica: suba o backend noutro terminal (cd backend && npm start) ou use API_URL=https://sua-api.onrender.com\n'
      );
    }
    process.exit(1);
  });

```

## `backend/src/server.js`

```javascript
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { google } = require('googleapis');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));

const {
  PORT = 4000,
  SPREADSHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  DADOS_RANGE = 'DadosApp!A:C',
  CAIXINHA_RANGE = 'Caixinha!C2',
  TAREFA_RANGE = 'Painel da Semana!A:Z',
  /**
   * Aba das finanças: nome exacto ou normalizado (MAI_2026, MAI-2026).
   * Se não definires no Render/.env, usa MAIO por defeito (MAI_2026).
   * Para mudar: FINANCE_ACTIVE_SHEET=JUN_2026 (e redeploy). Mês civil automático: FINANCE_ACTIVE_SHEET=AUTO
   */
  FINANCE_ACTIVE_SHEET,
  /** @deprecated — usa FINANCE_ACTIVE_SHEET */
  FORCE_FINANCE_SHEET,
  RATINGS_SHEET = 'AvaliacoesTarefas',
  TASK_FEED_SHEET = 'TarefasFeed',
  ADMIN_LOG_SHEET = 'AdminLogs',
  TASK_PHOTOS_SHEET = 'TarefasFotos',
} = process.env;
/** Quando FINANCE_ACTIVE_SHEET não está definida e não é AUTO — alinhado à aba MAI_2026. */
const DEFAULT_FINANCE_ACTIVE_SHEET = 'MAI_2026';
const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
/** Nomes completos (sem acento) → índice 0..11, para abas tipo ABRIL_2026 */
const MONTHS_PT_LONG = {
  JANEIRO: 0,
  FEVEREIRO: 1,
  MARCO: 2,
  ABRIL: 3,
  MAIO: 4,
  JUNHO: 5,
  JULHO: 6,
  AGOSTO: 7,
  SETEMBRO: 8,
  OUTUBRO: 9,
  NOVEMBRO: 10,
  DEZEMBRO: 11,
};

function stripMonthNameDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Çç]/g, (c) => (c === 'Ç' ? 'C' : 'c'))
    .toUpperCase();
}
const RESIDENTS = ['ALLAN', 'RAMON', 'VITOR', 'GUSTAVO', 'GUILHERME'];
const MAX_SHEET_CELL_CHARS = 45000;
const READ_CACHE_TTL_MS = 120000;
const readCache = new Map();

function badRequest(res, message) {
  return res.status(400).json({ ok: false, message });
}

function getCell(row = [], idx) {
  return String(row[idx] ?? '').trim();
}

/** Intervalo A1: nomes com espaco, hifen, comecando com digito, etc. precisam de aspas simples na API Sheets. */
function a1RangeForSheet(sheetTitle, rangeTail) {
  const name = String(sheetTitle || '').trim();
  if (!name) throw new Error('Nome de aba vazio.');
  const tail = String(rangeTail || '').trim();
  const escaped = name.replace(/'/g, "''");
  const safeUnquoted = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  const prefix = safeUnquoted ? name : `'${escaped}'`;
  return `${prefix}!${tail}`;
}

function findRowIndex(rows, predicate, from = 0) {
  for (let i = from; i < rows.length; i += 1) {
    if (predicate(rows[i] || [], i)) return i;
  }
  return -1;
}

function parseFinanceSnapshot(rows) {
  // Header expected around columns B..O
  const headerIdx = findRowIndex(rows, (r) => getCell(r, 2).toLowerCase() === 'aluguel' && getCell(r, 14).toLowerCase() === 'total');
  const totalRowIdx = findRowIndex(rows, (r, i) => i > headerIdx && getCell(r, 1).toUpperCase() === 'TOTAL');

  const residents = [];
  if (headerIdx >= 0 && totalRowIdx > headerIdx) {
    for (let i = headerIdx + 1; i < totalRowIdx; i += 1) {
      const r = rows[i] || [];
      const nome = getCell(r, 1);
      if (!nome) continue;
      residents.push({
        rowIndex: i + 1,
        nome,
        aluguel: getCell(r, 2),
        agua: getCell(r, 3),
        luz: getCell(r, 4),
        net: getCell(r, 5),
        iptu: getCell(r, 6),
        sofa: getCell(r, 7),
        dryWall: getCell(r, 8),
        caixinha: getCell(r, 9),
        subtotal: getCell(r, 10),
        multas: getCell(r, 11),
        contaQuePaga: getCell(r, 12),
        dividas: getCell(r, 13),
        total: getCell(r, 14), // coluna O
      });
    }
  }

  const contasHeaderIdx = findRowIndex(rows, (r) => getCell(r, 1).toLowerCase() === 'conta' && getCell(r, 2).toLowerCase() === 'valor');
  const contas = [];
  if (contasHeaderIdx >= 0) {
    for (let i = contasHeaderIdx + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const conta = getCell(r, 1);
      const valor = getCell(r, 2);
      if (!conta && !valor) break;
      if (!conta) continue;
      contas.push({
        rowIndex: i + 1,
        conta,
        valor,
        divisao: getCell(r, 3),
        vencimento: getCell(r, 4),
        status: getCell(r, 5),
      });
    }
  }

  const coletivosHeaderIdx = findRowIndex(rows, (r) => getCell(r, 9).toUpperCase() === 'QUEM' && getCell(r, 10).toUpperCase() === 'QUANTO');
  const gastosColetivos = [];
  if (coletivosHeaderIdx >= 0) {
    for (let i = coletivosHeaderIdx + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const quem = getCell(r, 9);
      const quanto = getCell(r, 10);
      if (!quem && !quanto) break;
      if (!quem || !quanto) continue;
      gastosColetivos.push({
        rowIndex: i + 1,
        quem,
        quanto,
        oQue: getCell(r, 11),
        obs: getCell(r, 12),
      });
    }
  }

  const acertosHeaderIdx = findRowIndex(rows, (r) => getCell(r, 19).toUpperCase() === 'QUEM' && getCell(r, 20).toUpperCase().includes('DEVE'));
  const acertosIndividuais = [];
  if (acertosHeaderIdx >= 0) {
    for (let i = acertosHeaderIdx + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const quem = getCell(r, 19);
      const deveQuanto = getCell(r, 20);
      if (!quem && !deveQuanto) break;
      if (!quem || !deveQuanto) continue;
      acertosIndividuais.push({
        rowIndex: i + 1,
        quem,
        deveQuanto,
        paraQuem: getCell(r, 21),
        obs: getCell(r, 22),
      });
    }
  }

  return { residents, contas, gastosColetivos, acertosIndividuais };
}

function financeSnapshotHasResidents(rows) {
  const { residents } = parseFinanceSnapshot(rows);
  return Array.isArray(residents) && residents.length > 0;
}

function findFirstEmptyByCol(rows, colIdx, from, to) {
  for (let i = from; i <= to; i += 1) {
    if (!getCell(rows[i] || [], colIdx)) return i;
  }
  return -1;
}

async function updateRange(range, values) {
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
  readCache.clear();
}

async function getSheetsApi() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID nao configurado.');
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON nao configurado.');
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

async function readRange(range) {
  const cacheKey = String(range || '').trim();
  const cached = readCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.values;
  }
  try {
    const sheets = await getSheetsApi();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    const values = res.data.values || [];
    readCache.set(cacheKey, { values, expiresAt: Date.now() + READ_CACHE_TTL_MS, updatedAt: Date.now() });
    return values;
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    const isQuotaError = msg.includes('quota exceeded') || msg.includes('rate limit') || msg.includes('too many requests');
    if (isQuotaError && cached?.values) {
      // Serve last successful snapshot to keep app stable during quota throttling.
      return cached.values;
    }
    throw error;
  }
}

async function appendRow(range, values) {
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
  readCache.clear();
}

async function ensureSheetExists(sheetName) {
  const titles = await getSpreadsheetTitles();
  if (titles.includes(sheetName)) return;
  const sheets = await getSheetsApi();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  });
  readCache.clear();
}

async function readRangeWithFallback(primaryRange, fallbackRanges = []) {
  try {
    return await readRange(primaryRange);
  } catch (error) {
    const isInvalidRange = String(error?.message || '').toLowerCase().includes('unable to parse range');
    if (!isInvalidRange) throw error;
    for (const range of fallbackRanges) {
      try {
        return await readRange(range);
      } catch {
        // Try next fallback.
      }
    }
    throw error;
  }
}

async function readRangeOrEmpty(range) {
  try {
    return await readRange(range);
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    if (msg.includes('unable to parse range')) return [];
    throw error;
  }
}

async function getSheetsHealth() {
  try {
    const range = String(DADOS_RANGE || 'DadosApp!A:C').trim();
    await readRange(range);
    return { ok: true, message: 'Planilha conectada.' };
  } catch (error) {
    return {
      ok: false,
      message: `Sem conexao com a planilha: ${error?.message || 'erro desconhecido'}`,
    };
  }
}

function parseMonthSheetTitle(title) {
  const raw = String(title || '').trim();
  const m3 = raw.match(/^([A-Za-zÇç]{3})_(\d{4})$/);
  if (m3) {
    const mon = m3[1].toUpperCase();
    const year = Number(m3[2]);
    const monthIdx = MONTHS_PT.indexOf(mon);
    if (monthIdx >= 0) return { title: raw, year, monthIdx };
  }
  const m4 = raw.match(/^([A-Za-zÇç]{4})_(\d{4})$/);
  if (m4) {
    const mon = m4[1].toUpperCase();
    const year = Number(m4[2]);
    if (mon === 'MAIO') return { title: raw, year, monthIdx: 4 };
  }
  const mNum = raw.match(/^(\d{1,2})_(\d{4})$/);
  if (mNum) {
    const mo = Number(mNum[1]);
    const year = Number(mNum[2]);
    if (year >= 2000 && year <= 2100 && mo >= 1 && mo <= 12) {
      return { title: raw, year, monthIdx: mo - 1 };
    }
  }
  const mNumSp = raw.match(/^(\d{1,2})[\s/-]+(\d{4})$/);
  if (mNumSp) {
    const mo = Number(mNumSp[1]);
    const year = Number(mNumSp[2]);
    if (year >= 2000 && year <= 2100 && mo >= 1 && mo <= 12) {
      return { title: raw, year, monthIdx: mo - 1 };
    }
  }
  const m3sp = raw.match(/^([A-Za-zÇç]{3})[\s-]+(\d{4})$/);
  if (m3sp) {
    const mon = m3sp[1].toUpperCase();
    const year = Number(m3sp[2]);
    const monthIdx = MONTHS_PT.indexOf(mon);
    if (monthIdx >= 0) return { title: raw, year, monthIdx };
  }
  const mLongSp = raw.match(/^([A-Za-zÇçÁÉÍÓÚÃÕáéíóúãõ]+)[\s-]+(\d{4})$/);
  if (mLongSp) {
    const mon = stripMonthNameDiacritics(mLongSp[1]).replace(/\s+/g, '');
    const year = Number(mLongSp[2]);
    const monthIdx = MONTHS_PT_LONG[mon];
    if (monthIdx !== undefined && year >= 2000 && year <= 2100) {
      return { title: raw, year, monthIdx };
    }
  }
  const mLong = raw.match(/^([A-Za-zÇçÁÉÍÓÚÃÕáéíóúãõ\s]+)_(\d{4})$/);
  if (mLong) {
    const mon = stripMonthNameDiacritics(mLong[1]).replace(/\s+/g, '');
    const year = Number(mLong[2]);
    const monthIdx = MONTHS_PT_LONG[mon];
    if (monthIdx !== undefined && year >= 2000 && year <= 2100) {
      return { title: raw, year, monthIdx };
    }
  }
  return null;
}

/** Mês civil da república (Brasil), não o UTC do servidor — evita ficar no mês errado perto da virada. */
function getSaoPauloYearMonth() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
    return { year, month };
  }
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

async function getSpreadsheetTitles() {
  const sheets = await getSheetsApi();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties.title',
  });
  return (res.data.sheets || []).map((s) => String(s.properties?.title || '').trim()).filter(Boolean);
}

function monthSheetOrder(entry) {
  return entry.year * 12 + entry.monthIdx;
}

function trimSheetTitles(titles) {
  return (titles || []).map((t) => String(t || '').trim()).filter(Boolean);
}

/** Qualquer aba cujo título parseie para o mesmo mês civil (ex. nome longo ou MON_YYYY). */
function findTitleByCivilMonth(titles, year, month) {
  const wantOrder = year * 12 + (month - 1);
  for (const t of titles) {
    const p = parseMonthSheetTitle(t);
    if (p && monthSheetOrder(p) === wantOrder) return String(t).trim();
  }
  return null;
}

/**
 * Candidatos a aba quando em modo AUTO: até ao mês civil (SP); se não houver, tenta só mês seguinte; senão todas.
 * Nomes aceites: JAN_2026, 04_2026, ABRIL_2026, etc.
 */
function getMonthSheetResolution(titlesRaw) {
  const titles = trimSheetTitles(titlesRaw);
  const { year, month } = getSaoPauloYearMonth();
  const currentName = `${MONTHS_PT[month - 1]}_${year}`;

  const normalizeTabKey = (t) =>
    String(t || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');
  const findTitle = (want) => {
    const wu = normalizeTabKey(want);
    if (!wu) return undefined;
    return titles.find((t) => normalizeTabKey(t) === wu);
  };

  const parsed = titles.map(parseMonthSheetTitle).filter(Boolean);
  const currentOrder = year * 12 + (month - 1);

  let eligible = parsed.filter((p) => monthSheetOrder(p) <= currentOrder);
  if (!eligible.length && parsed.length) {
    const onlyNext = parsed.filter((p) => monthSheetOrder(p) === currentOrder + 1);
    if (onlyNext.length) eligible = onlyNext;
  }
  if (!eligible.length && parsed.length) {
    eligible = parsed.slice();
  }

  eligible.sort((a, b) => monthSheetOrder(b) - monthSheetOrder(a));
  const canonicalSheets = eligible.map((e) => findTitle(e.title) || e.title);

  return { titles, currentName, findTitle, canonicalSheets, year, month };
}

/**
 * Aba definida por ti (FINANCE_ACTIVE_SHEET). AUTO → null (usa mês civil). Sem env → DEFAULT (MAI_2026).
 */
function pickManualFinanceSheetTitle(titlesRaw) {
  const fromEnv = String(FINANCE_ACTIVE_SHEET || '').trim();
  const legacy = String(FORCE_FINANCE_SHEET || '').trim();
  let want = fromEnv || legacy;
  if (/^AUTO$/i.test(want)) return null;
  if (!want) want = DEFAULT_FINANCE_ACTIVE_SHEET;
  const { findTitle, titles } = getMonthSheetResolution(titlesRaw);
  const hit = findTitle(want);
  if (hit) return hit;
  if (titles.includes(want)) return want;
  return null;
}

/**
 * Aba de finanças: FINANCE_ACTIVE_SHEET (ou defeito MAIO); se AUTO, mês civil em SP e candidatos.
 */
function resolveActiveFinanceSheetFromTitles(titlesRaw) {
  const manual = pickManualFinanceSheetTitle(titlesRaw);
  if (manual) return manual;
  const { titles, currentName, findTitle, canonicalSheets, year, month } = getMonthSheetResolution(titlesRaw);
  const preferred = findTitle(currentName) || findTitleByCivilMonth(titles, year, month);
  if (preferred) return preferred;
  if (canonicalSheets.length) return canonicalSheets[0];
  return currentName;
}

async function resolveActiveFinanceSheet() {
  const titles = await getSpreadsheetTitles();
  return resolveActiveFinanceSheetFromTitles(titles);
}

/**
 * Lê a aba: manual (FINANCE_ACTIVE_SHEET / defeito MAIO) ou modo AUTO como acima.
 */
async function readActiveFinanceSheetRows() {
  const titles = await getSpreadsheetTitles();
  const manualTitle = pickManualFinanceSheetTitle(titles);
  if (manualTitle) {
    const rows = await readRange(a1RangeForSheet(manualTitle, 'A:Z'));
    return { activeSheet: manualTitle, rows };
  }
  const { canonicalSheets, titles: titleList, currentName, findTitle, year, month } = getMonthSheetResolution(titles);
  const preferred = findTitle(currentName) || findTitleByCivilMonth(titles, year, month);

  const orderedCandidates = [];
  const seen = new Set();
  if (preferred) {
    orderedCandidates.push(preferred);
    seen.add(preferred);
  }
  for (const sheet of canonicalSheets) {
    if (!seen.has(sheet)) {
      orderedCandidates.push(sheet);
      seen.add(sheet);
    }
  }

  if (orderedCandidates.length) {
    if (preferred) {
      try {
        const rows = await readRange(a1RangeForSheet(preferred, 'A:Z'));
        return { activeSheet: preferred, rows };
      } catch {
        // Aba do mês civil ausente ou ilegível — tenta fallbacks abaixo.
      }
    }
    for (const sheet of orderedCandidates) {
      if (sheet === preferred) continue;
      try {
        const rows = await readRange(a1RangeForSheet(sheet, 'A:Z'));
        if (financeSnapshotHasResidents(rows)) {
          return { activeSheet: sheet, rows };
        }
      } catch {
        // tenta próxima aba
      }
    }
    for (const sheet of orderedCandidates) {
      if (sheet === preferred) continue;
      try {
        const rows = await readRange(a1RangeForSheet(sheet, 'A:Z'));
        return { activeSheet: sheet, rows };
      } catch {
        // tenta próxima aba
      }
    }
    for (const sheet of orderedCandidates) {
      try {
        const rows = await readRange(a1RangeForSheet(sheet, 'A:Z'));
        return { activeSheet: sheet, rows };
      } catch {
        // tenta próxima aba
      }
    }
    throw new Error('Nenhuma aba financeira de mês pôde ser lida (verifique nomes na planilha).');
  }

  const primary = resolveActiveFinanceSheetFromTitles(titleList);
  const rows = await readRange(a1RangeForSheet(primary, 'A:Z'));
  return { activeSheet: primary, rows };
}

function toNumberLike(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let normalized = text.replace(/[^\d,.-]/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 || lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = normalized.split(thousandSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeMoney2(value) {
  const n = toNumberLike(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

function extractTaskForUser(rows = [], usuario = '') {
  const target = String(usuario || '').trim().toLowerCase();
  if (!target) return 'Sala, Corredor e Garagem';
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      if (String(row[i] || '').trim().toLowerCase() === target) {
        for (let j = i + 1; j < row.length; j += 1) {
          const v = String(row[j] || '').trim();
          if (v && !['allan', 'ramon', 'vitor', 'gustavo', 'guilherme'].includes(v.toLowerCase())) return v;
        }
      }
    }
  }
  return 'Sala, Corredor e Garagem';
}

function extractScale(rows = []) {
  const result = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      const maybeName = String(row[i] || '').trim();
      const isResident = RESIDENTS.map((x) => x.toLowerCase()).includes(maybeName.toLowerCase());
      if (isResident) {
        let task = '-';
        for (let j = i + 1; j < row.length; j += 1) {
          const v = String(row[j] || '').trim();
          if (v && !RESIDENTS.map((x) => x.toLowerCase()).includes(v.toLowerCase())) {
            task = v;
            break;
          }
        }
        result.push({ nome: maybeName, tarefa: task });
        break;
      }
    }
  }
  return result;
}

function defaultScale() {
  return [
    { nome: 'ALLAN', tarefa: 'Quintal + Coelha Nilde' },
    { nome: 'RAMON', tarefa: 'Lavanderia e Panos' },
    { nome: 'VITOR', tarefa: 'Lixo Diario' },
    { nome: 'GUSTAVO', tarefa: 'Cozinha' },
    { nome: 'GUILHERME', tarefa: 'Sala, Corredor e Garagem' },
  ];
}

function isBanheiraoTask(task = '') {
  return String(task || '').toLowerCase().includes('banheir');
}

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function sortWeekKeysDesc(a = '', b = '') {
  const parse = (wk) => {
    const m = String(wk || '').match(/^(\d{4})-W(\d{2})$/);
    if (!m) return { year: 0, week: 0 };
    return { year: Number(m[1]), week: Number(m[2]) };
  };
  const aa = parse(a);
  const bb = parse(b);
  if (aa.year !== bb.year) return bb.year - aa.year;
  return bb.week - aa.week;
}

function getRatingsSummaryForWeek(rows, wk) {
  const map = {};
  const expected = Math.max(1, RESIDENTS.length - 1);
  for (const r of rows) {
    const week = String(r[0] || '');
    const target = String(r[2] || '').trim();
    const nota = Number(r[3]);
    const categoria = String(r[7] || 'casa').trim().toLowerCase() || 'casa';
    if (week !== wk || !target || !Number.isFinite(nota)) continue;
    if (!map[target]) {
      map[target] = {
        casa: { total: 0, soma: 0, media: 0 },
        banheirao: { total: 0, soma: 0, media: 0 },
        geral: { total: 0, soma: 0, media: 0 },
        expectedEvaluators: expected,
      };
    }
    const bucket = categoria === 'banheirao' ? 'banheirao' : 'casa';
    map[target][bucket].total += 1;
    map[target][bucket].soma += nota;
    map[target][bucket].media = map[target][bucket].soma / map[target][bucket].total;
    map[target].geral.total += 1;
    map[target].geral.soma += nota;
    map[target].geral.media = map[target].geral.soma / map[target].geral.total;
  }
  return map;
}

function parseCaixinhaStatement(rows = []) {
  const items = [];
  for (const row of rows) {
    const data = getCell(row, 0);
    const descricao = getCell(row, 1);
    const valor = getCell(row, 2);
    const obs = getCell(row, 3);
    const descLow = descricao.toLowerCase();
    const valueLow = valor.toLowerCase();
    if (!descricao || descLow === 'descrição' || descLow === 'descricao' || descLow === 'total') continue;
    if (!valor || valueLow === 'valor da caixinha [$]') continue;
    items.push({ data, descricao, valor, obs, tipo: toNumberLike(valor) < 0 ? 'saida' : 'entrada' });
  }
  return items.reverse();
}

function createPhotoRefId() {
  return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function storeTaskPhotoDataUrl(photoDataUrl = '') {
  const dataUrl = String(photoDataUrl || '').trim();
  if (!dataUrl) return '';
  if (dataUrl.length <= MAX_SHEET_CELL_CHARS) return dataUrl;
  await ensureSheetExists(TASK_PHOTOS_SHEET);
  const id = createPhotoRefId();
  const totalChunks = Math.ceil(dataUrl.length / MAX_SHEET_CELL_CHARS);
  const ts = new Date().toISOString();
  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * MAX_SHEET_CELL_CHARS;
    const end = start + MAX_SHEET_CELL_CHARS;
    const chunk = dataUrl.slice(start, end);
    await appendRow(`${TASK_PHOTOS_SHEET}!A:E`, [id, i + 1, totalChunks, chunk, ts]);
  }
  return `PHOTO_REF:${id}`;
}

async function hydrateTaskFeedPhotos(feed = []) {
  const refs = Array.from(
    new Set(
      feed
        .map((item) => String(item?.photoDataUrl || ''))
        .filter((raw) => raw.startsWith('PHOTO_REF:'))
        .map((raw) => raw.replace('PHOTO_REF:', '').trim())
        .filter(Boolean)
    )
  );
  if (!refs.length) return feed;
  const photoRows = await readRangeOrEmpty(`${TASK_PHOTOS_SHEET}!A:E`);
  const chunksById = {};
  for (const row of photoRows) {
    const id = String(row[0] || '').trim();
    if (!id || !refs.includes(id)) continue;
    const idx = Number(row[1] || 0);
    const chunk = String(row[3] || '');
    if (!idx || !chunk) continue;
    if (!chunksById[id]) chunksById[id] = [];
    chunksById[id].push({ idx, chunk });
  }

  const hydratedMap = {};
  for (const id of refs) {
    const chunks = (chunksById[id] || []).sort((a, b) => a.idx - b.idx);
    hydratedMap[id] = chunks.map((c) => c.chunk).join('');
  }

  return feed.map((item) => {
    const raw = String(item?.photoDataUrl || '');
    if (!raw.startsWith('PHOTO_REF:')) return item;
    const id = raw.replace('PHOTO_REF:', '').trim();
    return { ...item, photoDataUrl: hydratedMap[id] || '' };
  });
}

app.get('/health', async (_, res) => {
  const sheets = await getSheetsHealth();
  res.json({
    ok: sheets.ok,
    service: 'tocah-sheets-proxy',
    sheets,
  });
});

app.get('/api', async (req, res) => {
  const { action, usuario } = req.query;
  try {
    if (!action) return badRequest(res, 'action obrigatoria');

    if (action === 'getDados') {
      const { activeSheet: activeFinanceSheet, rows } = await readActiveFinanceSheetRows();
      const target = String(usuario || '').trim().toLowerCase();
      let aluguel = '--';
      let nome = usuario || 'Morador';
      for (const r of rows) {
        const resident = getCell(r, 1);
        if (resident && resident.toLowerCase() === target) {
          nome = resident;
          aluguel = getCell(r, 14) || '--'; // coluna O
          break;
        }
      }
      return res.json({ nome, aluguel, mesReferencia: activeFinanceSheet });
    }

    if (action === 'getCaixinha') {
      const rows = await readRangeWithFallback(CAIXINHA_RANGE, ['Caixinha!C2', 'DadosApp!E2']);
      const saldo = String(rows?.[0]?.[0] ?? '0,00');
      return res.json({ saldo, extratoHint: 'Clique para ver o extrato' });
    }

    if (action === 'getCaixinhaStatement') {
      const rows = await readRangeWithFallback('Caixinha!A:D', ['Caixinha!A:Z']);
      return res.json({ ok: true, items: parseCaixinhaStatement(rows) });
    }

    if (action === 'getTarefaSemana') {
      let rows = [];
      try {
        rows = await readRangeWithFallback(TAREFA_RANGE, ['Escala do Mês!A:Z', 'Tarefas!A:Z']);
      } catch {
        rows = [];
      }
      return res.json({
        tarefaNome: extractTaskForUser(rows, usuario),
        descricao: 'Varrer, tirar lixos e organizar.',
        concluida: false,
      });
    }

    if (action === 'getEscalaSemana') {
      let rows = [];
      try {
        rows = await readRangeWithFallback(TAREFA_RANGE, ['Escala do Mês!A:Z', 'Tarefas!A:Z']);
      } catch {
        rows = [];
      }
      const escala = extractScale(rows);
      return res.json(escala.length ? escala : defaultScale());
    }

    if (action === 'getTaskRatings') {
      const wk = weekKey();
      const rows = await readRangeOrEmpty(`${RATINGS_SHEET}!A:H`);
      const data = rows.slice(1);
      const weeks = Array.from(new Set(data.map((r) => String(r[0] || '').trim()).filter(Boolean))).sort(sortWeekKeysDesc);
      const effectiveWeek = data.some((r) => String(r[0] || '') === wk) ? wk : (weeks[0] || wk);
      const ratings = getRatingsSummaryForWeek(data, effectiveWeek);
      const history = {};
      for (const r of data) {
        const week = String(r[0] || '');
        if (!week) continue;
        if (!history[week]) history[week] = getRatingsSummaryForWeek(data, week);
      }
      return res.json({ ok: true, week: effectiveWeek, ratings, history });
    }

    if (action === 'getTaskFeed') {
      const rows = await readRangeOrEmpty(`${TASK_FEED_SHEET}!A:H`);
      const first = rows[0] || [];
      const hasHeader = String(first[0] || '').toLowerCase() === 'week';
      const data = hasHeader ? rows.slice(1) : rows;
      const baseRowIndex = hasHeader ? 2 : 1;
      const wk = weekKey();
      const weeks = Array.from(
        new Set(data.map((r) => String(r[0] || '').trim()).filter(Boolean))
      ).sort(sortWeekKeysDesc);
      const effectiveWeek = data.some((r) => String(r[0] || '') === wk) ? wk : (weeks[0] || wk);
      let feed = data
        .map((r, idx) => ({
          rowIndex: baseRowIndex + idx,
          week: String(r[0] || ''),
          ts: String(r[1] || ''),
          type: String(r[2] || ''),
          actor: String(r[3] || ''),
          target: String(r[4] || ''),
          tarefa: String(r[5] || ''),
          content: String(r[6] || ''),
          photoDataUrl: String(r[7] || ''),
        }))
        .filter((x) => x.week === effectiveWeek)
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      feed = feed.map((item) => {
        if (item.type !== 'rating') return item;
        return {
          ...item,
          actor: 'Avaliador anonimo',
          content: item.content ? `avaliou ${item.tarefa ? `(${item.tarefa}) ` : ''}de forma anonima` : 'avaliacao anonima',
        };
      });
      feed = await hydrateTaskFeedPhotos(feed);
      return res.json({ ok: true, week: effectiveWeek, feed });
    }

    if (action === 'getFinancePreview') {
      const titles = await getSpreadsheetTitles();
      const civil = getSaoPauloYearMonth();
      const meta = getMonthSheetResolution(titles);
      const preferred =
        meta.findTitle(meta.currentName) || findTitleByCivilMonth(meta.titles, meta.year, meta.month);
      const resolvedName = resolveActiveFinanceSheetFromTitles(titles);
      const { activeSheet, rows } = await readActiveFinanceSheetRows();
      const snapshot = parseFinanceSnapshot(rows);
      const envActive = String(FINANCE_ACTIVE_SHEET || '').trim();
      const envLegacy = String(FORCE_FINANCE_SHEET || '').trim();
      const modeCivilAuto = /^AUTO$/i.test(envActive || envLegacy);
      const manualResolved = pickManualFinanceSheetTitle(titles);
      const configuredTarget = modeCivilAuto
        ? 'AUTO'
        : envActive || envLegacy || `default:${DEFAULT_FINANCE_ACTIVE_SHEET}`;
      return res.json({
        ok: true,
        serverUtc: new Date().toISOString(),
        saoPauloCivil: civil,
        automaticTabIfCivilMode: `${MONTHS_PT[civil.month - 1]}_${civil.year}`,
        financeActiveSheetEnv: envActive || null,
        financeActiveSheetLegacyEnv: envLegacy || null,
        modeCivilAuto,
        defaultActiveSheetWhenUnset: DEFAULT_FINANCE_ACTIVE_SHEET,
        configuredSheetTarget,
        manualSheetResolved: manualResolved,
        preferredTabInSpreadsheet: preferred || null,
        resolvedWithoutReadingRows: resolvedName,
        activeSheetUsed: activeSheet,
        canonicalMonthTabsNewestFirst: meta.canonicalSheets,
        snapshotSummary: {
          residents: snapshot.residents?.length ?? 0,
          contas: snapshot.contas?.length ?? 0,
          gastosColetivos: snapshot.gastosColetivos?.length ?? 0,
          acertosIndividuais: snapshot.acertosIndividuais?.length ?? 0,
        },
        spreadsheetTabCount: titles.length,
        spreadsheetTabs: titles,
      });
    }

    if (action === 'getFinanceSnapshot') {
      const { activeSheet: activeFinanceSheet, rows } = await readActiveFinanceSheetRows();
      const parsed = parseFinanceSnapshot(rows);
      return res.json({ ok: true, mesReferencia: activeFinanceSheet, ...parsed });
    }

    return badRequest(res, `action GET nao suportada: ${action}`);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api', async (req, res) => {
  const { action } = req.body || {};
  try {
    if (!action) return badRequest(res, 'action obrigatoria');
    if (action === 'concluirTarefa') {
      const { tarefaNome = '', usuario = 'Morador', photoDataUrl = '' } = req.body || {};
      await ensureSheetExists(TASK_FEED_SHEET);
      const wk = weekKey();
      const ts = new Date().toISOString();
      const savedPhoto = await storeTaskPhotoDataUrl(photoDataUrl);
      await appendRow(`${TASK_FEED_SHEET}!A:H`, [wk, ts, 'check', usuario, usuario, tarefaNome, 'concluiu a tarefa da semana', savedPhoto]);
      return res.json({ ok: true, message: 'Tarefa concluida registrada.' });
    }
    if (action === 'dispararCobrancaAluguel' || action === 'cobrarAtrasados') {
      await ensureSheetExists(ADMIN_LOG_SHEET);
      const ts = new Date().toISOString();
      await appendRow(`${ADMIN_LOG_SHEET}!A:D`, [ts, action, 'ADMIN', 'executado pelo app']);
      return res.json({ ok: true, message: `Acao ${action} registrada na planilha.` });
    }
    if (action === 'addCaixinhaEntry') {
      const { tipo = 'entrada', descricao = '', valor = '', obs = '' } = req.body || {};
      if (!descricao || valor === '') return badRequest(res, 'descricao e valor obrigatorios');
      const numeric = toNumberLike(valor);
      if (!Number.isFinite(numeric)) return badRequest(res, 'valor invalido');
      const signed = tipo === 'saida' ? -Math.abs(numeric) : Math.abs(numeric);
      const date = new Date().toLocaleDateString('pt-BR');
      await appendRow('Caixinha!A:D', [date, descricao, signed, obs]);
      return res.json({ ok: true, message: 'Movimentacao adicionada na caixinha.' });
    }
    if (action === 'addFinanceEntry') {
      const { entryType, usuario = '', payload = {} } = req.body || {};
      const { activeSheet: activeFinanceSheet, rows } = await readActiveFinanceSheetRows();

      if (entryType === 'conta_fixa') {
        const headerIdx = findRowIndex(rows, (r) => getCell(r, 1).toLowerCase() === 'conta' && getCell(r, 2).toLowerCase() === 'valor');
        const start = headerIdx >= 0 ? headerIdx + 1 : 1;
        const rowIdx = findFirstEmptyByCol(rows, 1, start, Math.min(rows.length + 80, start + 400));
        if (rowIdx < 0) return badRequest(res, 'Nao foi possivel encontrar linha vazia para conta.');
        await updateRange(a1RangeForSheet(activeFinanceSheet, `B${rowIdx + 1}:F${rowIdx + 1}`), [
          payload.conta || payload.descricao || 'Conta',
          normalizeMoney2(payload.valor),
          payload.divisao || '',
          payload.vencimento || '',
          payload.status || 'FALSE',
        ]);
        return res.json({ ok: true, message: 'Conta fixa adicionada.' });
      }

      if (entryType === 'gasto_coletivo') {
        const headerIdx = findRowIndex(rows, (r) => getCell(r, 9).toUpperCase() === 'QUEM' && getCell(r, 10).toUpperCase() === 'QUANTO');
        const start = headerIdx >= 0 ? headerIdx + 1 : 1;
        const rowIdx = findFirstEmptyByCol(rows, 9, start, Math.min(rows.length + 120, start + 500));
        if (rowIdx < 0) return badRequest(res, 'Nao foi possivel encontrar linha vazia para gasto coletivo.');
        const payer = String(usuario || payload.quem || '').trim();
        const selected = Array.isArray(payload.dividirCom) ? payload.dividirCom : [];
        const participants = Array.from(
          new Set(
            [payer, ...selected]
              .map((name) => String(name || '').trim())
              .filter(Boolean)
          )
        );
        const totalValue = toNumberLike(payload.valor || payload.quanto || '');
        const shouldCreateIndividualSettlements = participants.length > 1 && Number.isFinite(totalValue);

        await updateRange(a1RangeForSheet(activeFinanceSheet, `J${rowIdx + 1}:M${rowIdx + 1}`), [
          payer,
          normalizeMoney2(payload.valor || payload.quanto),
          payload.oQue || payload.descricao || '',
          payload.obs || '',
        ]);

        if (shouldCreateIndividualSettlements) {
          const acertosHeaderIdx = findRowIndex(rows, (r) => getCell(r, 19).toUpperCase() === 'QUEM' && getCell(r, 20).toUpperCase().includes('DEVE'));
          const acertosStart = acertosHeaderIdx >= 0 ? acertosHeaderIdx + 1 : 1;
          const eachValue = totalValue / participants.length;
          const debtors = participants.filter((name) => name.toUpperCase() !== payer.toUpperCase());

          for (const debtor of debtors) {
            const acertoRowIdx = findFirstEmptyByCol(rows, 19, acertosStart, Math.min(rows.length + 220, acertosStart + 700));
            if (acertoRowIdx < 0) break;
            await updateRange(a1RangeForSheet(activeFinanceSheet, `T${acertoRowIdx + 1}:W${acertoRowIdx + 1}`), [
              debtor,
              normalizeMoney2(eachValue),
              payer,
              payload.obs || '',
            ]);
            rows[acertoRowIdx] = rows[acertoRowIdx] || [];
            rows[acertoRowIdx][19] = debtor;
            rows[acertoRowIdx][20] = normalizeMoney2(eachValue);
            rows[acertoRowIdx][21] = payer;
            rows[acertoRowIdx][22] = payload.obs || '';
          }
        }
        return res.json({ ok: true, message: 'Gasto coletivo adicionado.' });
      }

      if (entryType === 'acerto_individual') {
        const headerIdx = findRowIndex(rows, (r) => getCell(r, 19).toUpperCase() === 'QUEM' && getCell(r, 20).toUpperCase().includes('DEVE'));
        const start = headerIdx >= 0 ? headerIdx + 1 : 1;
        const rowIdx = findFirstEmptyByCol(rows, 19, start, Math.min(rows.length + 120, start + 500));
        if (rowIdx < 0) return badRequest(res, 'Nao foi possivel encontrar linha vazia para acerto individual.');
        await updateRange(a1RangeForSheet(activeFinanceSheet, `T${rowIdx + 1}:W${rowIdx + 1}`), [
          payload.quem || usuario || '',
          normalizeMoney2(payload.deveQuanto || payload.valor),
          payload.paraQuem || '',
          payload.obs || payload.descricao || '',
        ]);
        return res.json({ ok: true, message: 'Acerto individual adicionado.' });
      }
      return badRequest(res, 'entryType invalido.');
    }

    if (action === 'updateFinanceEntry') {
      const { entryType, rowIndex, payload = {} } = req.body || {};
      const row = Number(rowIndex);
      if (!Number.isFinite(row) || row < 1) return badRequest(res, 'rowIndex invalido.');
      const activeFinanceSheet = await resolveActiveFinanceSheet();

      if (entryType === 'conta_fixa') {
        await updateRange(a1RangeForSheet(activeFinanceSheet, `B${row}:F${row}`), [
          payload.conta || '',
          normalizeMoney2(payload.valor),
          payload.divisao || '',
          payload.vencimento || '',
          payload.status || 'FALSE',
        ]);
        return res.json({ ok: true, message: 'Conta fixa atualizada.' });
      }
      if (entryType === 'gasto_coletivo') {
        await updateRange(a1RangeForSheet(activeFinanceSheet, `J${row}:M${row}`), [
          payload.quem || '',
          normalizeMoney2(payload.quanto || payload.valor),
          payload.oQue || '',
          payload.obs || '',
        ]);
        return res.json({ ok: true, message: 'Gasto coletivo atualizado.' });
      }
      if (entryType === 'acerto_individual') {
        await updateRange(a1RangeForSheet(activeFinanceSheet, `T${row}:W${row}`), [
          payload.quem || '',
          normalizeMoney2(payload.deveQuanto || payload.valor),
          payload.paraQuem || '',
          payload.obs || '',
        ]);
        return res.json({ ok: true, message: 'Acerto individual atualizado.' });
      }
      return badRequest(res, 'entryType invalido.');
    }

    if (action === 'deleteFinanceEntry') {
      const { entryType, rowIndex, match = {} } = req.body || {};
      const row = Number(rowIndex);
      const { activeSheet: activeFinanceSheet, rows } = await readActiveFinanceSheetRows();

      const normalizeText = (value) => String(value || '').trim().toUpperCase();
      const normalizeMoneyLike = (value) => {
        const n = toNumberLike(value);
        return Number.isFinite(n) ? Number(n).toFixed(2) : '';
      };
      const pickResolvedRow = () => {
        if (Number.isFinite(row) && row >= 1) return row;
        if (entryType === 'conta_fixa') {
          const conta = normalizeText(match?.conta);
          const valor = normalizeMoneyLike(match?.valor);
          if (!conta) return 0;
          for (let i = 0; i < rows.length; i += 1) {
            const r = rows[i] || [];
            const rowConta = normalizeText(r[1]);
            const rowValor = normalizeMoneyLike(r[2]);
            if (rowConta === conta && (!valor || rowValor === valor)) return i + 1;
          }
        }
        if (entryType === 'gasto_coletivo') {
          const quem = normalizeText(match?.quem);
          const oQue = normalizeText(match?.oQue);
          const quanto = normalizeMoneyLike(match?.quanto);
          if (!quem && !oQue) return 0;
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            const r = rows[i] || [];
            const rowQuem = normalizeText(r[9]);
            const rowQuanto = normalizeMoneyLike(r[10]);
            const rowOQue = normalizeText(r[11]);
            const quemOk = !quem || rowQuem === quem;
            const oQueOk = !oQue || rowOQue === oQue;
            const quantoOk = !quanto || rowQuanto === quanto;
            if (quemOk && oQueOk && quantoOk) return i + 1;
          }
        }
        if (entryType === 'acerto_individual') {
          const quem = normalizeText(match?.quem);
          const paraQuem = normalizeText(match?.paraQuem);
          const deveQuanto = normalizeMoneyLike(match?.deveQuanto);
          if (!quem && !paraQuem) return 0;
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            const r = rows[i] || [];
            const rowQuem = normalizeText(r[19]);
            const rowDeveQuanto = normalizeMoneyLike(r[20]);
            const rowParaQuem = normalizeText(r[21]);
            const quemOk = !quem || rowQuem === quem;
            const paraQuemOk = !paraQuem || rowParaQuem === paraQuem;
            const valorOk = !deveQuanto || rowDeveQuanto === deveQuanto;
            if (quemOk && paraQuemOk && valorOk) return i + 1;
          }
        }
        return 0;
      };
      const resolvedRow = pickResolvedRow();
      if (!resolvedRow || resolvedRow < 1) return badRequest(res, 'Nao foi possivel localizar a linha para exclusao.');

      if (entryType === 'conta_fixa') {
        await updateRange(a1RangeForSheet(activeFinanceSheet, `B${resolvedRow}:F${resolvedRow}`), ['', '', '', '', '']);
        return res.json({ ok: true, message: 'Conta fixa removida.' });
      }
      if (entryType === 'gasto_coletivo') {
        await updateRange(a1RangeForSheet(activeFinanceSheet, `J${resolvedRow}:M${resolvedRow}`), ['', '', '', '']);
        return res.json({ ok: true, message: 'Gasto coletivo removido.' });
      }
      if (entryType === 'acerto_individual') {
        await updateRange(a1RangeForSheet(activeFinanceSheet, `T${resolvedRow}:W${resolvedRow}`), ['', '', '', '']);
        return res.json({ ok: true, message: 'Acerto individual removido.' });
      }
      return badRequest(res, 'entryType invalido.');
    }

    if (action === 'toggleContaStatus') {
      const { rowIndex, status } = req.body || {};
      const row = Number(rowIndex);
      if (!Number.isFinite(row) || row < 1) return badRequest(res, 'rowIndex invalido.');
      const activeFinanceSheet = await resolveActiveFinanceSheet();
      const normalizedStatus = typeof status === 'boolean' ? (status ? 'TRUE' : 'FALSE') : String(status || '').toUpperCase();
      const next = normalizedStatus === 'TRUE' ? 'TRUE' : 'FALSE';
      await updateRange(a1RangeForSheet(activeFinanceSheet, `F${row}:F${row}`), [next]);
      return res.json({ ok: true, message: `Conta marcada como ${next === 'TRUE' ? 'paga' : 'pendente'}.` });
    }
    if (action === 'rateTask') {
      const { actor = '', target = '', tarefa = '', nota, comentario = '', categoria = 'casa' } = req.body || {};
      const score = Number(nota);
      const category = String(categoria || 'casa').trim().toLowerCase() === 'banheirao' ? 'banheirao' : 'casa';
      if (!actor || !target || !tarefa || !Number.isFinite(score) || score < 1 || score > 5) {
        return badRequest(res, 'Dados de avaliacao invalidos.');
      }
      if (category === 'banheirao' && !isBanheiraoTask(tarefa)) {
        return badRequest(res, 'Avaliacao de banheirao so pode ser enviada para tarefa de banheirao.');
      }
      if (String(actor).trim().toUpperCase() === String(target).trim().toUpperCase()) {
        return badRequest(res, 'Nao pode avaliar a propria tarefa.');
      }
      await ensureSheetExists(RATINGS_SHEET);
      const wk = weekKey();
      const rows = await readRangeWithFallback(`${RATINGS_SHEET}!A:H`, []);
      const data = rows.slice(1);
      const already = data.some((r) =>
        String(r[0] || '') === wk &&
        String(r[1] || '').trim().toUpperCase() === String(actor).trim().toUpperCase() &&
        String(r[2] || '').trim().toUpperCase() === String(target).trim().toUpperCase() &&
        String(r[7] || 'casa').trim().toLowerCase() === category
      );
      if (already) return badRequest(res, `Voce ja avaliou este morador nesta semana (${category}).`);
      const ts = new Date().toISOString();
      await appendRow(`${RATINGS_SHEET}!A:H`, [wk, actor, target, score, tarefa, comentario, ts, category]);

      await ensureSheetExists(TASK_FEED_SHEET);
      await appendRow(`${TASK_FEED_SHEET}!A:H`, [wk, ts, 'rating', actor, target, tarefa, `avaliou ${category} com ${score} estrelas`, '']);
      const summary = getRatingsSummaryForWeek((await readRangeWithFallback(`${RATINGS_SHEET}!A:H`, [])).slice(1), wk);
      return res.json({ ok: true, message: 'Avaliacao registrada.', week: wk, summary });
    }
    if (action === 'addTaskFeedComment') {
      const { actor = '', content = '', target = '', tarefa = '', photoDataUrl = '', parentTs = '', parentActor = '' } = req.body || {};
      const normalizedActor = String(actor || '').trim();
      const normalizedContent = String(content || '').trim();
      const hasPhoto = String(photoDataUrl || '').trim().length > 0;
      if (!normalizedActor) return badRequest(res, 'actor obrigatorio.');
      if (!normalizedContent && !hasPhoto) return badRequest(res, 'Envie um texto ou uma foto para publicar.');
      await ensureSheetExists(TASK_FEED_SHEET);
      const wk = weekKey();
      const ts = new Date().toISOString();
      const savedPhoto = await storeTaskPhotoDataUrl(photoDataUrl);
      const isReply = !!String(parentTs || '').trim();
      const finalContent = normalizedContent || 'publicou uma foto';
      await appendRow(`${TASK_FEED_SHEET}!A:H`, [
        wk,
        ts,
        isReply ? 'comment_reply' : 'comment',
        normalizedActor,
        isReply ? String(parentTs).trim() : target,
        isReply ? String(parentActor || '').trim() : tarefa,
        finalContent,
        savedPhoto,
      ]);
      return res.json({ ok: true, message: 'Comentario publicado.' });
    }
    if (action === 'deleteTaskFeedPost') {
      const { rowIndex, ts = '', actor = '', postActor = '', postContent = '', postType = '' } = req.body || {};
      const row = Number(rowIndex);
      await ensureSheetExists(TASK_FEED_SHEET);
      const rows = await readRangeOrEmpty(`${TASK_FEED_SHEET}!A:H`);
      const first = rows[0] || [];
      const hasHeader = String(first[0] || '').toLowerCase() === 'week';
      const normalizedTs = String(ts || '').trim();
      let resolvedRow = 0;

      // Prefer timestamp resolution first; rowIndex can become stale after list sorting/filtering.
      if (normalizedTs) {
        const dataStart = hasHeader ? 1 : 0;
        for (let i = dataStart; i < rows.length; i += 1) {
          const r = rows[i] || [];
          if (String(r[1] || '').trim() === normalizedTs) {
            resolvedRow = i + 1;
            break;
          }
        }
      }

      // Fallback to incoming rowIndex when ts lookup is unavailable.
      if ((!resolvedRow || resolvedRow < 1) && Number.isFinite(row) && row >= 1) {
        resolvedRow = row;
      }

      // Last fallback: match by actor if ts is missing and rowIndex did not resolve.
      if ((!resolvedRow || resolvedRow < 1) && !normalizedTs && String(actor || '').trim()) {
        const dataStart = hasHeader ? 1 : 0;
        const normalizedActor = String(actor || '').trim().toUpperCase();
        for (let i = rows.length - 1; i >= dataStart; i -= 1) {
          const r = rows[i] || [];
          const rowActor = String(r[3] || '').trim().toUpperCase();
          if (rowActor === normalizedActor) {
            resolvedRow = i + 1;
            break;
          }
        }
      }

      // Strong fallback: match recent row by payload signature from frontend.
      if ((!resolvedRow || resolvedRow < 1) && (String(postActor || '').trim() || String(postContent || '').trim())) {
        const dataStart = hasHeader ? 1 : 0;
        const normalizedPostActor = String(postActor || '').trim().toUpperCase();
        const normalizedPostContent = String(postContent || '').trim();
        const normalizedPostType = String(postType || '').trim().toLowerCase();
        for (let i = rows.length - 1; i >= dataStart; i -= 1) {
          const r = rows[i] || [];
          const rowType = String(r[2] || '').trim().toLowerCase();
          const rowActor = String(r[3] || '').trim().toUpperCase();
          const rowContent = String(r[6] || '').trim();
          const typeMatches = !normalizedPostType || rowType === normalizedPostType;
          const actorMatches = !normalizedPostActor || rowActor === normalizedPostActor;
          const contentMatches = !normalizedPostContent || rowContent === normalizedPostContent;
          if (typeMatches && actorMatches && contentMatches) {
            resolvedRow = i + 1;
            break;
          }
        }
      }

      if (!resolvedRow || resolvedRow < 1) return badRequest(res, 'rowIndex ou ts invalidos.');
      const zeroIdx = resolvedRow - 1;
      const current = rows[zeroIdx] || [];
      if (!current.length) {
        if (normalizedTs) return badRequest(res, 'Post nao encontrado para o timestamp informado.');
        return badRequest(res, 'Post nao encontrado.');
      }
      await updateRange(`${TASK_FEED_SHEET}!A${resolvedRow}:H${resolvedRow}`, ['', '', 'deleted', '', '', '', '[post removido]', '']);
      return res.json({ ok: true, message: 'Post excluido com sucesso.' });
    }
    return badRequest(res, `action POST nao suportada: ${action}`);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Tocah proxy ativo na porta ${PORT}`);
});

```

## `index.js`

```javascript
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

```

## `package.json`

```json
{
  "name": "tocah-do-coelho-app",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "build:web": "expo export --platform web",
    "preview:web": "npm run build:web && node scripts/web-preview.cjs",
    "backend": "npm --prefix backend start"
  },
  "dependencies": {
    "@expo/metro-runtime": "~6.1.2",
    "@expo/vector-icons": "^15.1.1",
    "@react-native-async-storage/async-storage": "^2.2.0",
    "@react-navigation/bottom-tabs": "^7.15.9",
    "@react-navigation/native": "^7.2.2",
    "expo": "~54.0.33",
    "expo-blur": "~15.0.8",
    "expo-image-picker": "^55.0.14",
    "expo-linear-gradient": "~15.0.8",
    "expo-status-bar": "~3.0.9",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-web": "^0.21.0"
  },
  "private": true,
  "devDependencies": {
    "babel-preset-expo": "~54.0.10"
  }
}

```

## `scripts/web-preview.cjs`

```javascript
#!/usr/bin/env node
/**
 * Serve o export web em /tocah-do-coelho-app (mesmo baseUrl do app.json).
 * Usa porta livre em 127.0.0.1 — evita EADDRINUSE quando 4173 já está em uso.
 * Encaminha /api e /health para o backend (PREVIEW_API_TARGET, padrão http://127.0.0.1:4000)
 * para a prévia funcionar com EXPO_PUBLIC_API_URL vazio (mesma origem que o static).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const { URL } = require('url');

const PREVIEW_API_TARGET_RAW = (process.env.PREVIEW_API_TARGET || 'http://127.0.0.1:4000').replace(/\/+$/, '');
let backendOrigin;
try {
  backendOrigin = new URL(PREVIEW_API_TARGET_RAW.includes('://') ? PREVIEW_API_TARGET_RAW : `http://${PREVIEW_API_TARGET_RAW}`);
} catch {
  console.error('PREVIEW_API_TARGET invalido:', process.env.PREVIEW_API_TARGET);
  process.exit(1);
}

function shouldProxyPath(pathname) {
  return pathname.startsWith('/api') || pathname === '/health';
}

function stripHopByHop(headers) {
  const out = { ...headers };
  delete out.connection;
  delete out['keep-alive'];
  delete out['transfer-encoding'];
  delete out['proxy-connection'];
  return out;
}

function proxyToBackend(clientReq, clientRes) {
  const isHttps = backendOrigin.protocol === 'https:';
  const lib = isHttps ? https : http;
  const port =
    backendOrigin.port || (isHttps ? 443 : backendOrigin.protocol === 'http:' ? 80 : 443);
  const opts = {
    hostname: backendOrigin.hostname,
    port,
    path: clientReq.url,
    method: clientReq.method,
    headers: stripHopByHop({ ...clientReq.headers }),
  };
  opts.headers.host = backendOrigin.host;

  const preq = lib.request(opts, (pres) => {
    clientRes.writeHead(pres.statusCode || 502, pres.headers);
    pres.pipe(clientRes);
  });
  preq.on('error', (err) => {
    console.error('[preview proxy]', err.message);
    if (clientRes.headersSent) {
      clientRes.destroy();
      return;
    }
    clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    clientRes.end(
      `Backend indisponivel em ${backendOrigin.origin}. Inicie na raiz: npm run backend\n`
    );
  });
  clientReq.pipe(preq);
}

const repoRoot = path.join(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const outDir = path.join(repoRoot, '.web-preview');

/** Lê o prefixo do export (ex. /tocah-do-coelho-app) a partir do index.html gerado pelo Expo. */
function detectWebBaseFromDistHtml(distRoot) {
  const indexPath = path.join(distRoot, 'index.html');
  if (!fs.existsSync(indexPath)) return '';
  const html = fs.readFileSync(indexPath, 'utf8');
  const m = html.match(/src="([^"]+\/_expo\/static\/[^"]+\.js)"/);
  if (!m) return '';
  const full = m[1];
  const idx = full.indexOf('/_expo/');
  if (idx <= 0) return '';
  return full.slice(0, idx).replace(/\/$/, '') || '';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const p = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(p));
    });
  });
}

function copyDistToPreview() {
  if (!fs.existsSync(distDir)) {
    console.error('Pasta dist/ não existe. Rode: npm run build:web');
    process.exit(1);
  }
  const webBase = detectWebBaseFromDistHtml(distDir);
  const nestedSegment = String(webBase || '').replace(/^\//, '');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  if (nestedSegment) {
    const nestedDir = path.join(outDir, nestedSegment);
    fs.mkdirSync(nestedDir, { recursive: true });
    for (const name of fs.readdirSync(distDir)) {
      fs.cpSync(path.join(distDir, name), path.join(nestedDir, name), { recursive: true });
    }
  } else {
    for (const name of fs.readdirSync(distDir)) {
      fs.cpSync(path.join(distDir, name), path.join(outDir, name), { recursive: true });
    }
  }
  return nestedSegment;
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.writeHead(200);
    res.end(data);
  });
}

async function main() {
  const nestedSegment = copyDistToPreview();
  const port = await getFreePort();

  const server = http.createServer((req, res) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    } catch {
      pathname = '/';
    }
    if (shouldProxyPath(pathname)) {
      proxyToBackend(req, res);
      return;
    }

    const raw = (req.url || '/').split('?')[0];
    if (raw === '/' || raw === '') {
      if (nestedSegment) {
        res.writeHead(302, { Location: `/${nestedSegment}/` });
        res.end();
        return;
      }
      sendFile(res, path.join(outDir, 'index.html'));
      return;
    }

    let rel = decodeURIComponent(raw);
    const filePath = path.normalize(path.join(outDir, rel)).replace(/\\/g, '/');
    const base = path.normalize(outDir).replace(/\\/g, '/');
    if (!filePath.startsWith(base)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, st) => {
      if (!err && st.isFile()) {
        sendFile(res, filePath);
        return;
      }
      if (!err && st.isDirectory()) {
        const idx = path.join(filePath, 'index.html');
        fs.stat(idx, (e2, st2) => {
          if (!e2 && st2.isFile()) sendFile(res, idx);
          else {
            res.writeHead(404);
            res.end('Not found');
          }
        });
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
  });

  server.listen(port, '127.0.0.1', () => {
    const basePath = nestedSegment ? `/${nestedSegment}/` : '/';
    const url = `http://127.0.0.1:${port}${basePath}`;
    console.log('');
    console.log('  Prévia (export estático; caminho igual ao do build atual):');
    console.log(`  ${url}`);
    console.log('');
    console.log(`  Proxy API: /api e /health → ${backendOrigin.origin}`);
    console.log('  (outro host: PREVIEW_API_TARGET=https://... npm run preview:web)');
    console.log('  Com EXPO_PUBLIC_API_URL vazio no build, o app usa esta origem + /api.');
    console.log('  Suba o backend: npm run backend');
    console.log('');
    console.log('  Encerre com Ctrl+C.');
    console.log('');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

```

## `src/components/AppHeader.js`

```javascript
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../context/ThemeContext';

const TOCAH_LOGO_SOURCES = [
  { uri: 'https://drive.google.com/uc?export=download&id=1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS' },
  { uri: 'https://drive.google.com/uc?export=view&id=1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS' },
  { uri: 'https://drive.google.com/thumbnail?id=1K-KUlO4ZNy5TFz1YIsVh__uxICixnkBS&sz=w512' },
  require('../../assets/icon.png'),
];

export function AppHeader({ title = 'República Tocah', subtitle = '', onBellPress, notificationCount = 0 }) {
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme } = useThemeMode();
  const [logoSourceIdx, setLogoSourceIdx] = useState(0);
  const contextLine = subtitle || title;
  const gradient = isDark ? ['#3b1f55', '#241033'] : ['#6a1b9a', '#4a148c'];
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { paddingTop: Math.max(10, insets.top * 0.4), marginTop: 0 }]}
    >
      <View style={styles.glowOrbTop} />
      <View style={styles.glowOrbBottom} />
      <View style={styles.left}>
        <View style={styles.logoOuterRing}>
          {logoSourceIdx < TOCAH_LOGO_SOURCES.length ? (
            <Image
              source={TOCAH_LOGO_SOURCES[logoSourceIdx]}
              style={styles.logo}
              resizeMode="contain"
              onError={() => setLogoSourceIdx((prev) => prev + 1)}
            />
          ) : (
            <View style={styles.logoFallback}>
              <MaterialCommunityIcons name="rabbit-variant" size={20} color="#6a1b9a" />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>Painel da Casa</Text>
          <Text style={styles.houseTitle} numberOfLines={2}>República Tocah do Coelho</Text>
          {!!contextLine && <Text style={styles.contextText} numberOfLines={1}>{contextLine}</Text>}
        </View>
      </View>
      <View style={styles.rightActions}>
        <Pressable style={styles.themeBtn} onPress={toggleTheme}>
          <MaterialCommunityIcons name={isDark ? 'white-balance-sunny' : 'moon-waning-crescent'} size={17} color="#fff" />
        </Pressable>
        <Pressable style={styles.bell} onPress={onBellPress}>
          <MaterialCommunityIcons name="bell-outline" size={20} color="#fff" />
          {notificationCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notificationCount > 99 ? '99+' : String(notificationCount)}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#3f2d87',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 9,
  },
  glowOrbTop: {
    position: 'absolute',
    top: -34,
    right: -16,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  glowOrbBottom: {
    position: 'absolute',
    bottom: -50,
    left: -34,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 10 },
  logoOuterRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  logo: { width: '100%', height: '100%', borderRadius: 26 },
  logoFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e8ff', borderRadius: 26 },
  houseTitle: { color: '#fff', fontSize: 18, lineHeight: 20, fontWeight: '900', letterSpacing: 0.15 },
  overline: { color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  contextText: { color: 'rgba(255,255,255,0.93)', fontSize: 12, marginTop: 2, fontWeight: '700' },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  themeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  badge: {
    position: 'absolute',
    right: -6,
    top: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
});

```

## `src/constants/residents.js`

```javascript
export const RESIDENTS = ['ALLAN', 'RAMON', 'VITOR', 'GUSTAVO', 'GUILHERME'];

```

## `src/constants/theme.js`

```javascript
export const lightTheme = {
  background: '#f6f4fb',
  surface: '#ffffff',
  text: '#1d1b2a',
  muted: '#7a7394',
  primary: '#6a1b9a',
  positive: '#00c853',
  border: '#e9e5f7',
  secondary: '#ede7ff',
  warning: '#f59e0b',
  danger: '#ef4444',
};

export const darkTheme = {
  background: '#14131d',
  surface: '#1e1d2b',
  text: '#f5f3ff',
  muted: '#b2aacd',
  primary: '#b57ad6',
  positive: '#00c853',
  border: '#312f45',
  secondary: '#2e2340',
  warning: '#fbbf24',
  danger: '#f87171',
};

```

## `src/context/NotificationContext.js`

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getTaskFeed } from '../services/api';
import { useResident } from './ResidentContext';

const STORAGE_KEY = '@tocah_last_seen_feed_ts';
const NotificationContext = createContext(null);

function toMs(value) {
  const ms = new Date(String(value || '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function NotificationProvider({ children }) {
  const { resident } = useResident();
  const [notificationCount, setNotificationCount] = useState(0);
  const [latestFeedTs, setLatestFeedTs] = useState('');
  const [notificationItems, setNotificationItems] = useState([]);

  const refreshNotifications = useCallback(async () => {
    const data = await getTaskFeed();
    const items = Array.isArray(data?.feed) ? data.feed : [];
    const filtered = items
      .filter((item) => item?.type !== 'deleted' && item?.type !== 'comment_reply')
      .sort((a, b) => toMs(b?.ts) - toMs(a?.ts));
    const newest = filtered.reduce((acc, item) => (toMs(item?.ts) > toMs(acc) ? item.ts : acc), '');
    setLatestFeedTs(newest);

    const key = `${STORAGE_KEY}:${resident}`;
    const lastSeen = await AsyncStorage.getItem(key);
    const lastSeenMs = toMs(lastSeen);

    const unseenItems = filtered.filter((item) => {
      const itemMs = toMs(item?.ts);
      const isNew = itemMs > lastSeenMs;
      const fromOtherResident = String(item?.actor || '').trim().toUpperCase() !== String(resident || '').trim().toUpperCase();
      return isNew && fromOtherResident;
    });
    setNotificationCount(unseenItems.length);

    const topItems = filtered.slice(0, 30).map((item) => ({
      ...item,
      isUnread:
        toMs(item?.ts) > lastSeenMs &&
        String(item?.actor || '').trim().toUpperCase() !== String(resident || '').trim().toUpperCase(),
    }));
    setNotificationItems(topItems);
    return { unseen: unseenItems.length, newest, items: topItems };
  }, [resident]);

  const markNotificationsAsSeen = useCallback(async () => {
    const key = `${STORAGE_KEY}:${resident}`;
    const nowValue = latestFeedTs || new Date().toISOString();
    await AsyncStorage.setItem(key, nowValue);
    setNotificationCount(0);
    setNotificationItems((prev) => prev.map((item) => ({ ...item, isUnread: false })));
  }, [resident, latestFeedTs]);

  useEffect(() => {
    let mounted = true;
    const safeRefresh = async () => {
      try {
        await refreshNotifications();
      } catch {
        // Keep last successful notification snapshot while offline.
      }
    };
    safeRefresh();
    const timer = setInterval(safeRefresh, 12000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [refreshNotifications]);

  const value = useMemo(
    () => ({
      notificationCount,
      notificationItems,
      refreshNotifications,
      markNotificationsAsSeen,
    }),
    [notificationCount, notificationItems, refreshNotifications, markNotificationsAsSeen]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

```

## `src/context/ResidentContext.js`

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { RESIDENTS } from '../constants/residents';

const STORAGE_KEY = '@tocah_selected_resident';
const PHOTOS_STORAGE_KEY = '@tocah_resident_photos';
const ResidentContext = createContext(null);

export function ResidentProvider({ children }) {
  const [resident, setResident] = useState(RESIDENTS[0]);
  const [residentPhotos, setResidentPhotos] = useState({});

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved && RESIDENTS.includes(saved)) setResident(saved);
      const rawPhotos = await AsyncStorage.getItem(PHOTOS_STORAGE_KEY);
      if (rawPhotos) {
        try {
          const parsed = JSON.parse(rawPhotos);
          if (parsed && typeof parsed === 'object') setResidentPhotos(parsed);
        } catch {
          // Ignore invalid persisted content.
        }
      }
    })();
  }, []);

  const selectResident = async (name) => {
    if (!RESIDENTS.includes(name)) return;
    setResident(name);
    await AsyncStorage.setItem(STORAGE_KEY, name);
  };

  const setResidentPhoto = async (name, uri) => {
    if (!RESIDENTS.includes(name)) return;
    const normalized = String(uri || '').trim();
    const next = {
      ...residentPhotos,
      [name]: normalized,
    };
    setResidentPhotos(next);
    await AsyncStorage.setItem(PHOTOS_STORAGE_KEY, JSON.stringify(next));
  };

  const removeResidentPhoto = async (name) => {
    if (!RESIDENTS.includes(name)) return;
    const next = { ...residentPhotos };
    delete next[name];
    setResidentPhotos(next);
    await AsyncStorage.setItem(PHOTOS_STORAGE_KEY, JSON.stringify(next));
  };

  const getResidentPhoto = (name) => {
    const key = String(name || '').trim();
    return residentPhotos[key] || '';
  };

  const value = useMemo(
    () => ({
      resident,
      selectResident,
      residents: RESIDENTS,
      residentPhotos,
      getResidentPhoto,
      setResidentPhoto,
      removeResidentPhoto,
    }),
    [resident, residentPhotos]
  );
  return <ResidentContext.Provider value={value}>{children}</ResidentContext.Provider>;
}

export function useResident() {
  const ctx = useContext(ResidentContext);
  if (!ctx) throw new Error('useResident must be used within ResidentProvider');
  return ctx;
}

```

## `src/context/ThemeContext.js`

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = '@tocah_theme_mode';
const ThemeModeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved != null) setIsDark(saved === 'dark');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  };

  const value = useMemo(() => ({ isDark, toggleTheme, ready }), [isDark, ready]);
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeProvider');
  return ctx;
}

```

## `src/navigation/AppNavigator.js`

```javascript
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FinancesScreen } from '../screens/FinancesScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { NildeScreen } from '../screens/NildeScreen';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { useNotifications } from '../context/NotificationContext';

const Tab = createBottomTabNavigator();

export function AppNavigator() {
  const { isDark } = useThemeMode();
  const { notificationCount } = useNotifications();
  const colors = isDark ? darkTheme : lightTheme;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          height: 82,
          paddingBottom: 10,
          paddingTop: 10,
          marginHorizontal: 12,
          marginBottom: 4,
          borderRadius: 20,
          shadowColor: isDark ? '#000' : '#4b3b83',
          shadowOpacity: isDark ? 0.3 : 0.15,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 9,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontWeight: '800', fontSize: 11 },
        tabBarItemStyle: { borderRadius: 12 },
        tabBarActiveBackgroundColor: isDark ? colors.secondary : '#f3efff',
        tabBarIcon: ({ color, size }) => {
          const map = { Inicio: 'home-outline', Financas: 'cash-multiple', Tarefas: 'clipboard-list-outline', Nilde: 'rabbit', Feed: 'message-text-outline' };
          return <MaterialCommunityIcons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen name="Financas" component={FinancesScreen} />
      <Tab.Screen name="Tarefas" component={TasksScreen} />
      <Tab.Screen name="Nilde" component={NildeScreen} />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarBadge: notificationCount > 0 ? (notificationCount > 99 ? '99+' : notificationCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444', color: '#fff', fontSize: 10, fontWeight: '800' },
        }}
      />
    </Tab.Navigator>
  );
}

```

## `src/screens/AdminScreen.js`

```javascript
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { triggerAdminAction } from '../services/api';
import { AppHeader } from '../components/AppHeader';

export function AdminScreen() {
  const { isDark } = useThemeMode();
  const colors = isDark ? darkTheme : lightTheme;
  const confirmAction = (title, action) => {
    Alert.alert(title, 'Tem certeza que deseja executar agora?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Executar', onPress: () => callAction(action) },
    ]);
  };
  const callAction = async (action) => {
    try {
      const response = await triggerAdminAction(action, 'ADMIN');
      Alert.alert('Sucesso', response?.message || 'Acao executada');
    } catch (error) {
      Alert.alert('Erro', error?.message || 'Nao foi possivel executar agora');
    }
  };
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Bot Admin" subtitle="Comandos da casa" />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Admin</Text>
        <Text style={[styles.helper, { color: colors.muted }]}>Use com cuidado: estas acoes afetam todos os moradores.</Text>
        <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => confirmAction('Disparar cobranca', 'dispararCobrancaAluguel')}>
          <Text style={styles.btnText}>Disparar Cobranca de Aluguel</Text>
        </Pressable>
        <Pressable style={[styles.btn, { backgroundColor: '#d32f2f' }]} onPress={() => confirmAction('Cobrar atrasados', 'cobrarAtrasados')}>
          <Text style={styles.btnText}>Cobrar Atrasados</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 6 },
  card: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 10 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  helper: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10 },
  btnText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
});

```

## `src/screens/FeedScreen.js`

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { addTaskFeedComment, deleteTaskFeedPost, getApiConnectionStatus, getTaskFeed, subscribeApiConnectionStatus } from '../services/api';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { AppHeader } from '../components/AppHeader';
import { useResident } from '../context/ResidentContext';

function formatRelativeTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `ha ${diffMin} min`;
  if (diffHour < 24) return `ha ${diffHour} h`;
  if (diffDay === 1) return 'ontem';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function looksLikePostTs(value = '') {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw);
}

function getPostMeta(post) {
  if (post.type === 'check') return { icon: 'checkbox-marked-circle-outline', label: 'Concluiu tarefa', color: '#16a34a' };
  if (post.type === 'rating') return { icon: 'star-circle-outline', label: 'Avaliação', color: '#f59e0b' };
  return { icon: 'message-reply-text-outline', label: 'Publicação', color: '#7c3aed' };
}

function getAvatarPalette(name = '') {
  const palettes = [
    { bg: '#ede9fe', fg: '#5b21b6' },
    { bg: '#e0f2fe', fg: '#0c4a6e' },
    { bg: '#dcfce7', fg: '#166534' },
    { bg: '#ffe4e6', fg: '#9f1239' },
    { bg: '#fef3c7', fg: '#92400e' },
  ];
  const str = String(name || '').trim().toUpperCase();
  const seed = str.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palettes[seed % palettes.length];
}

function getInitial(name = '') {
  const raw = String(name || '').trim();
  return raw ? raw.slice(0, 1).toUpperCase() : '?';
}

const FEED_LIKES_KEY = '@tocah_feed_likes_v1';
const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images || 'images';

export function FeedScreen() {
  const { isDark } = useThemeMode();
  const { resident, getResidentPhoto, setResidentPhoto, removeResidentPhoto } = useResident();
  const colors = isDark ? darkTheme : lightTheme;
  const panelBg = isDark ? '#252338' : '#fff';
  const panelBorder = isDark ? '#3b3754' : '#d1d5db';
  const softBg = isDark ? '#2c2940' : '#f3e5f5';
  const softBorder = isDark ? '#4a4566' : '#e9d5ff';
  const inputBg = isDark ? '#211f31' : '#fff';
  const inputBorder = isDark ? '#3e3a56' : '#d1d5db';
  const footerBg = isDark ? '#242238' : '#f8fafc';
  const footerBorder = isDark ? '#3a3652' : '#e5e7eb';
  const replyBg = isDark ? '#221f34' : '#faf5ff';
  const replyBorder = isDark ? '#3f3a58' : '#ede9fe';
  const activePurple = isDark ? '#c4b5fd' : '#6a1b9a';
  const activePurpleDeep = isDark ? '#ddd6fe' : '#4a148c';
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [commentText, setCommentText] = useState('');
  const [postPhoto, setPostPhoto] = useState('');
  const [postingMain, setPostingMain] = useState(false);
  const [replyingToTs, setReplyingToTs] = useState('');
  const [replyText, setReplyText] = useState('');
  const [postingReply, setPostingReply] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [selectedFeedPhoto, setSelectedFeedPhoto] = useState('');
  const [likedByPostTs, setLikedByPostTs] = useState({});
  const [apiStatus, setApiStatus] = useState(() => getApiConnectionStatus());

  const load = useCallback(async (mode = 'normal') => {
    if (mode === 'pull') setRefreshing(true);
    if (mode === 'normal') setLoading(true);
    try {
      const data = await getTaskFeed();
      setFeed(data?.feed || []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Nao foi possivel carregar o feed.');
    } finally {
      if (mode === 'pull') setRefreshing(false);
      if (mode === 'normal') setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FEED_LIKES_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        setLikedByPostTs(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        setLikedByPostTs({});
      }
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeApiConnectionStatus((next) => setApiStatus(next));
    return unsubscribe;
  }, []);

  useFocusEffect(
    useCallback(() => {
      load('silent');
      const timer = setInterval(() => load('silent'), 20000);
      return () => clearInterval(timer);
    }, [load])
  );

  const pickPostPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria para anexar foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: IMAGE_MEDIA_TYPES,
      quality: 0.25,
      allowsEditing: true,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) {
      Alert.alert('Falha na foto', 'Selecione uma imagem (não vídeo) para postar.');
      return;
    }
    setPostPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const takePostPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita o uso da câmera para tirar foto no post.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: IMAGE_MEDIA_TYPES,
      quality: 0.25,
      allowsEditing: true,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) {
      Alert.alert('Falha na foto', 'Não foi possível capturar a imagem.');
      return;
    }
    setPostPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const topLevelFeed = useMemo(() => {
    const base = (feed || []).filter((item) => {
      if (item.type === 'deleted') return false;
      if (item.type === 'comment_reply') return false;
      if (item.type === 'comment' && looksLikePostTs(item.target)) return false;
      return item.type === 'check' || item.type === 'rating' || item.type === 'comment';
    });
    if (filter === 'all') return base;
    return base.filter((item) => item.type === filter);
  }, [feed, filter]);

  const repliesByPostTs = useMemo(() => {
    const map = {};
    (feed || []).forEach((post) => {
      const isReply = post.type === 'comment_reply' || (post.type === 'comment' && looksLikePostTs(post.target));
      if (!isReply) return;
      const parentTs = String(post.target || post.tarefa || '').trim();
      if (!parentTs) return;
      if (!map[parentTs]) map[parentTs] = [];
      map[parentTs].push(post);
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => String(a.ts).localeCompare(String(b.ts))));
    return map;
  }, [feed]);

  const counters = useMemo(() => {
    const base = (feed || []).filter((item) => item.type === 'check' || item.type === 'rating' || item.type === 'comment');
    return {
      all: base.length,
      check: base.filter((x) => x.type === 'check').length,
      rating: base.filter((x) => x.type === 'rating').length,
      comment: base.filter((x) => x.type === 'comment').length,
    };
  }, [feed]);

  const pickProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita acesso à galeria para escolher sua foto de perfil.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: IMAGE_MEDIA_TYPES,
      quality: 0.35,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    await setResidentPhoto(resident, result.assets[0].uri);
    Alert.alert('Perfil atualizado', 'Sua foto de perfil foi atualizada.');
  };

  const handleProfilePhotoOptions = () => {
    Alert.alert('Foto de perfil', `Perfil atual: ${resident}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Escolher da galeria', onPress: pickProfilePhoto },
      {
        text: 'Remover foto',
        style: 'destructive',
        onPress: async () => {
          await removeResidentPhoto(resident);
        },
      },
    ]);
  };

  const toggleLike = async (postTs) => {
    const key = String(postTs || '').trim();
    if (!key) return;
    const next = { ...likedByPostTs };
    if (next[key]) delete next[key];
    else next[key] = true;
    setLikedByPostTs(next);
    try {
      await AsyncStorage.setItem(FEED_LIKES_KEY, JSON.stringify(next));
    } catch {
      // Ignore persistence failures to keep UI responsive.
    }
  };

  const openReplyComposer = (postTs) => {
    const key = String(postTs || '').trim();
    if (!key) return;
    setReplyingToTs((prev) => (prev === key ? '' : key));
  };

  const sharePost = async (post) => {
    try {
      const body = `${post?.actor || 'Morador'} • ${formatRelativeTime(post?.ts || '')}\n${post?.content || ''}`;
      await Share.share({
        message: `República Tocah\n\n${body}`.trim(),
        title: 'Compartilhar publicação',
      });
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Não foi possível compartilhar a publicação.');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
    >
      <AppHeader title="Feed da Casa" subtitle={`Atualizações semanais • ${resident}`} />

      <View style={[styles.composerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.composerHead}>
          {getResidentPhoto(resident) ? (
            <Image source={{ uri: getResidentPhoto(resident) }} style={styles.composerAvatarPhoto} />
          ) : (
            <View style={[styles.composerAvatar, { backgroundColor: getAvatarPalette(resident).bg }]}>
              <Text style={[styles.composerAvatarText, { color: getAvatarPalette(resident).fg }]}>{getInitial(resident)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.composerTitle, { color: colors.text }]}>Publicar no feed</Text>
            <Text style={styles.composerSubtitle}>Compartilhe progresso, foto ou aviso da casa.</Text>
          </View>
          <Pressable style={[styles.profileEditBtn, { backgroundColor: softBg, borderColor: softBorder }]} onPress={handleProfilePhotoOptions}>
            <MaterialCommunityIcons name="account-edit-outline" size={16} color={activePurple} />
          </Pressable>
        </View>
        <View style={styles.filterRow}>
          {[
            ['all', `Tudo (${counters.all})`],
            ['check', `Checks (${counters.check})`],
            ['rating', `Notas (${counters.rating})`],
            ['comment', `Posts (${counters.comment})`],
          ].map(([id, label]) => (
            <Pressable
              key={id}
              style={[
                styles.filterChip,
                { backgroundColor: panelBg, borderColor: panelBorder },
                filter === id && [styles.filterChipActive, { borderColor: activePurple, backgroundColor: softBg }],
              ]}
              onPress={() => setFilter(id)}
            >
              <Text style={[styles.filterChipText, { color: colors.muted }, filter === id && [styles.filterChipTextActive, { color: activePurpleDeep }]]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.commentRow}>
          <TextInput
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Compartilhe algo da semana..."
            placeholderTextColor="#94a3b8"
            style={[styles.commentInput, { backgroundColor: inputBg, borderColor: inputBorder, color: colors.text }]}
          />
          <Pressable style={[styles.attachBtn, { backgroundColor: panelBg, borderColor: panelBorder }]} onPress={pickPostPhoto}>
            <MaterialCommunityIcons name="image-plus" size={16} color={activePurple} />
          </Pressable>
          <Pressable style={[styles.attachBtn, { backgroundColor: panelBg, borderColor: panelBorder }]} onPress={takePostPhoto}>
            <MaterialCommunityIcons name="camera-outline" size={16} color={activePurple} />
          </Pressable>
          <Pressable
            style={[styles.sendBtn, postingMain && { opacity: 0.75 }]}
            onPress={async () => {
              if (postingMain) return;
              if (!commentText.trim() && !postPhoto) return;
              try {
                setPostingMain(true);
                await addTaskFeedComment({ actor: resident, content: commentText.trim() || 'publicou uma foto', photoDataUrl: postPhoto });
                setCommentText('');
                setPostPhoto('');
                await load('pull');
              } catch (e) {
                    Alert.alert('Erro', e?.message || 'Não foi possível postar.');
              } finally {
                setPostingMain(false);
              }
            }}
            disabled={postingMain}
          >
            <MaterialCommunityIcons name={postingMain ? 'progress-clock' : 'send'} size={16} color="#fff" />
          </Pressable>
        </View>
        {!!postPhoto && (
          <View style={styles.previewWrap}>
            <Image source={{ uri: postPhoto }} style={styles.previewImg} resizeMode="contain" />
            <Pressable style={[styles.previewRemove, { backgroundColor: panelBg }]} onPress={() => setPostPhoto('')}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#ef4444" />
            </Pressable>
          </View>
        )}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!apiStatus?.online && !!apiStatus?.message && <Text style={styles.offlineHint}>{apiStatus.message}</Text>}
      {!apiStatus?.online && !!apiStatus?.cachedAt && (
        <Text style={styles.offlineHint}>Ultima consulta salva: {new Date(apiStatus.cachedAt).toLocaleString('pt-BR')}</Text>
      )}
      {!!error && (
        <Pressable style={styles.retryBtn} onPress={() => load('pull')}>
          <MaterialCommunityIcons name="refresh" size={14} color="#fff" />
          <Text style={styles.retryBtnText}>Tentar novamente</Text>
        </Pressable>
      )}

      {loading ? (
        <>
          {[0, 1, 2].map((item) => (
            <View key={`skeleton-${item}`} style={[styles.feedSkeleton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.feedSkeletonHead}>
                <View style={[styles.skeletonAvatar, { backgroundColor: isDark ? '#2c2940' : '#ececf1' }]} />
                <View style={{ flex: 1 }}>
                  <View style={[styles.skeletonLineLg, { backgroundColor: isDark ? '#2c2940' : '#ececf1' }]} />
                  <View style={[styles.skeletonLineSm, { backgroundColor: isDark ? '#2c2940' : '#ececf1' }]} />
                </View>
              </View>
              <View style={[styles.skeletonLineFull, { backgroundColor: isDark ? '#2c2940' : '#ececf1' }]} />
              <View style={[styles.skeletonImage, { backgroundColor: isDark ? '#2c2940' : '#ececf1' }]} />
            </View>
          ))}
        </>
      ) : null}

      {topLevelFeed.map((post, idx) => (
        <View key={`${post.ts}-${idx}`} style={[styles.feedItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.feedHeadRow}>
            <View style={styles.feedAuthorRow}>
              {getResidentPhoto(post.actor) ? (
                <Image source={{ uri: getResidentPhoto(post.actor) }} style={styles.feedAvatarPhoto} />
              ) : (
                <View style={[styles.feedAvatar, { backgroundColor: getAvatarPalette(post.actor).bg }]}>
                  <Text style={[styles.feedAvatarText, { color: getAvatarPalette(post.actor).fg }]}>{getInitial(post.actor)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.feedHead, { color: colors.text }]}>{post.actor}</Text>
                <View style={styles.feedMetaRow}>
                  <View style={[styles.postTypePill, { backgroundColor: `${getPostMeta(post).color}1A` }]}>
                    <MaterialCommunityIcons name={getPostMeta(post).icon} size={12} color={getPostMeta(post).color} />
                    <Text style={[styles.postTypeText, { color: getPostMeta(post).color }]}>{getPostMeta(post).label}</Text>
                  </View>
                  <Text style={styles.feedTime}>• {formatRelativeTime(post.ts)}</Text>
                </View>
              </View>
            </View>
            <View style={styles.feedActions}>
              <Pressable style={[styles.feedReplyBtn, { backgroundColor: softBg }]} onPress={() => openReplyComposer(post.ts)}>
                <MaterialCommunityIcons name="comment-text-outline" size={15} color={activePurple} />
              </Pressable>
              <Pressable
                hitSlop={10}
                style={styles.feedDeleteBtn}
                onPress={() =>
                  Alert.alert('Excluir post', 'Deseja realmente excluir este post?', [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Excluir',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteTaskFeedPost({
                            rowIndex: post.rowIndex,
                            ts: post.ts,
                            actor: resident,
                            postActor: post.actor,
                            postContent: post.content,
                            postType: post.type,
                          });
                          await load('pull');
                        } catch (e) {
                          Alert.alert('Erro', e?.message || 'Não foi possível excluir o post.');
                        }
                      },
                    },
                  ])
                }
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#ef4444" />
              </Pressable>
            </View>
          </View>

          {!!post.tarefa && (
            <Text style={[styles.feedHighlight, { color: colors.text }]}>
              {post.tarefa}
            </Text>
          )}
          <Text style={[styles.feedBody, { color: colors.muted }]}>{post.content || post.target || ''}</Text>

          {!!post.photoDataUrl && (
            <Pressable
              onPress={() => {
                setSelectedFeedPhoto(post.photoDataUrl);
                setPhotoViewerVisible(true);
              }}
            >
              <Image source={{ uri: post.photoDataUrl }} style={styles.feedPhoto} resizeMode="contain" />
            </Pressable>
          )}

          <View style={styles.feedFooterBar}>
            <Pressable
              style={[
                styles.feedFooterAction,
                { backgroundColor: footerBg, borderColor: footerBorder },
                likedByPostTs[post.ts] && [styles.feedFooterActionActive, { backgroundColor: softBg, borderColor: softBorder }],
              ]}
              onPress={() => toggleLike(post.ts)}
            >
              <MaterialCommunityIcons name={likedByPostTs[post.ts] ? 'heart' : 'heart-outline'} size={16} color={likedByPostTs[post.ts] ? '#e11d48' : '#9ca3af'} />
              <Text style={[styles.feedFooterText, likedByPostTs[post.ts] && styles.feedFooterTextActive]}>
                {likedByPostTs[post.ts] ? 'Curtido' : 'Curtir'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.feedFooterAction,
                { backgroundColor: footerBg, borderColor: footerBorder },
                replyingToTs === post.ts && [styles.feedFooterActionActive, { backgroundColor: softBg, borderColor: softBorder }],
              ]}
              onPress={() => openReplyComposer(post.ts)}
            >
              <MaterialCommunityIcons name="comment-outline" size={16} color={replyingToTs === post.ts ? activePurple : '#9ca3af'} />
              <Text style={[styles.feedFooterText, replyingToTs === post.ts && styles.feedFooterTextActive]}>
                {(repliesByPostTs[post.ts] || []).length} comentários
              </Text>
            </Pressable>
            <Pressable style={[styles.feedFooterAction, { backgroundColor: footerBg, borderColor: footerBorder }]} onPress={() => sharePost(post)}>
              <MaterialCommunityIcons name="share-outline" size={16} color="#9ca3af" />
              <Text style={styles.feedFooterText}>Compartilhar</Text>
            </Pressable>
          </View>

          {!!(repliesByPostTs[post.ts] || []).length && (
            <View style={styles.replyTimeline}>
              <View style={styles.replyTimelineLine} />
              {(repliesByPostTs[post.ts] || []).map((reply, ridx) => (
                <View key={`${post.ts}-r-${reply.ts}-${ridx}`} style={styles.replyTimelineItem}>
                  <View style={styles.replyDot} />
                  <View style={[styles.replyBubble, { backgroundColor: replyBg, borderColor: replyBorder }]}>
                    <View style={styles.replyTopRow}>
                      <Text style={[styles.replyHead, { color: colors.text }]}>{reply.actor} respondeu</Text>
                      <View style={styles.replyTopActions}>
                        <Text style={styles.replyTime}>{formatRelativeTime(reply.ts)}</Text>
                        <Pressable
                          hitSlop={10}
                          style={styles.replyDeleteBtn}
                          onPress={() =>
                            Alert.alert('Excluir comentario', 'Deseja realmente excluir este comentario?', [
                              { text: 'Cancelar', style: 'cancel' },
                              {
                                text: 'Excluir',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await deleteTaskFeedPost({
                                      rowIndex: reply.rowIndex,
                                      ts: reply.ts,
                                      actor: resident,
                                      postActor: reply.actor,
                                      postContent: reply.content,
                                      postType: reply.type,
                                    });
                                    await load('pull');
                                  } catch (e) {
                                    Alert.alert('Erro', e?.message || 'Não foi possível excluir o comentário.');
                                  }
                                },
                              },
                            ])
                          }
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={14} color="#ef4444" />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={[styles.replyBody, { color: colors.muted }]}>{reply.content}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {replyingToTs === post.ts && (
            <View style={styles.replyComposer}>
              <TextInput
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Escreva sua resposta..."
                placeholderTextColor="#94a3b8"
                style={[styles.replyInput, { backgroundColor: inputBg, borderColor: inputBorder, color: colors.text }]}
              />
              <Pressable
                style={[styles.replySendBtn, postingReply && { opacity: 0.75 }]}
                onPress={async () => {
                  if (postingReply) return;
                  if (!replyText.trim()) return;
                  try {
                    setPostingReply(true);
                    await addTaskFeedComment({
                      actor: resident,
                      content: replyText.trim(),
                      target: post.ts,
                      tarefa: post.actor,
                      parentTs: post.ts,
                      parentActor: post.actor,
                    });
                    setReplyText('');
                    setReplyingToTs('');
                    await load('pull');
                  } catch (e) {
                    Alert.alert('Erro', e?.message || 'Não foi possível responder o post.');
                  } finally {
                    setPostingReply(false);
                  }
                }}
                disabled={postingReply}
              >
                <MaterialCommunityIcons name={postingReply ? 'progress-clock' : 'send'} size={15} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {!loading && !topLevelFeed.length && <Text style={[styles.subtitle, { color: colors.muted }]}>Sem publicações nesta semana.</Text>}

      <Modal visible={photoViewerVisible} transparent animationType="fade" onRequestClose={() => setPhotoViewerVisible(false)}>
        <View style={styles.photoViewerOverlay}>
          <Pressable style={styles.photoViewerClose} onPress={() => setPhotoViewerVisible(false)}>
            <MaterialCommunityIcons name="close" size={24} color="#fff" />
          </Pressable>
          {!!selectedFeedPhoto && <Image source={{ uri: selectedFeedPhoto }} style={styles.photoViewerImage} resizeMode="contain" />}
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 8, gap: 12, paddingBottom: 30 },
  composerCard: { borderWidth: 1, borderRadius: 20, padding: 13, shadowColor: '#2a1d52', shadowOpacity: 0.08, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  composerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  composerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  composerAvatarPhoto: { width: 36, height: 36, borderRadius: 18 },
  composerAvatarText: { fontSize: 12, fontWeight: '900' },
  profileEditBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5', borderWidth: 1, borderColor: '#e9d5ff' },
  composerTitle: { fontSize: 13, fontWeight: '900' },
  composerSubtitle: { marginTop: 1, color: '#94a3b8', fontSize: 10, fontWeight: '600' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  filterChipActive: { borderColor: '#6a1b9a', backgroundColor: '#f3e5f5' },
  filterChipText: { color: '#6b7280', fontSize: 10, fontWeight: '800' },
  filterChipTextActive: { color: '#4a148c' },
  commentRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, color: '#111827', fontWeight: '600' },
  attachBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  sendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  previewWrap: { marginBottom: 4, position: 'relative' },
  previewImg: { width: '100%', height: 140, borderRadius: 10, backgroundColor: '#e5e7eb' },
  previewRemove: { position: 'absolute', right: 8, top: 8, backgroundColor: '#fff', borderRadius: 999 },
  feedItem: { borderWidth: 1, borderRadius: 20, padding: 13, shadowColor: '#2a1d52', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  feedSkeleton: { borderWidth: 1, borderRadius: 20, padding: 13 },
  feedSkeletonHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  skeletonAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ececf1' },
  skeletonLineLg: { width: '62%', height: 10, borderRadius: 5, backgroundColor: '#ececf1', marginBottom: 6 },
  skeletonLineSm: { width: '32%', height: 8, borderRadius: 4, backgroundColor: '#ececf1' },
  skeletonLineFull: { width: '92%', height: 9, borderRadius: 5, backgroundColor: '#ececf1', marginBottom: 8 },
  skeletonImage: { width: '100%', height: 150, borderRadius: 10, backgroundColor: '#ececf1' },
  feedHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  feedAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  feedAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  feedAvatarPhoto: { width: 38, height: 38, borderRadius: 19 },
  feedAvatarText: { fontSize: 13, fontWeight: '900' },
  feedActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  feedHead: { fontSize: 13, fontWeight: '900' },
  feedMetaRow: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  postTypePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  postTypeText: { fontSize: 10, fontWeight: '800' },
  feedTime: { marginTop: 2, fontSize: 10, color: '#9ca3af', fontWeight: '700' },
  feedReplyBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5' },
  feedDeleteBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  feedHighlight: { marginTop: 8, fontSize: 12, fontWeight: '800' },
  feedBody: { fontSize: 12, marginTop: 4, fontWeight: '600', lineHeight: 18 },
  feedPhoto: { width: '100%', height: 190, borderRadius: 10, marginTop: 8, backgroundColor: '#e5e7eb' },
  feedFooterBar: { marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ede9fe', flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedFooterAction: { flex: 1, minHeight: 35, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb' },
  feedFooterActionActive: { backgroundColor: '#f3e8ff', borderColor: '#d8b4fe' },
  feedFooterText: { color: '#94a3b8', fontSize: 10, fontWeight: '700' },
  feedFooterTextActive: { color: '#6a1b9a' },
  replyTimeline: { marginTop: 8, marginLeft: 6, paddingLeft: 14, position: 'relative' },
  replyTimelineLine: { position: 'absolute', left: 4, top: 2, bottom: 2, width: 2, backgroundColor: '#ddd6fe' },
  replyTimelineItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  replyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7e57c2', marginTop: 6, marginLeft: -15 },
  replyBubble: { flex: 1, borderWidth: 1, borderColor: '#ede9fe', backgroundColor: '#faf5ff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  replyTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  replyTopActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyHead: { fontSize: 11, fontWeight: '800' },
  replyTime: { fontSize: 10, color: '#9ca3af', fontWeight: '700' },
  replyDeleteBtn: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  replyBody: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  replyComposer: { marginTop: 8, flexDirection: 'row', gap: 6, alignItems: 'center' },
  replyInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, color: '#111827', fontWeight: '600' },
  replySendBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  photoViewerClose: { position: 'absolute', top: 52, right: 16, zIndex: 3, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  photoViewerImage: { width: '100%', height: '78%', borderRadius: 12 },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  error: { color: '#ef4444', fontWeight: '700', marginBottom: 2 },
  offlineHint: { color: '#b45309', fontWeight: '700', marginBottom: 2 },
  retryBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6a1b9a', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, marginBottom: 6 },
  retryBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  progressText: { fontSize: 11, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 7 },
});


```

## `src/screens/FinancesScreen.js`

```javascript
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { addFinanceEntry, deleteFinanceEntry, getApiConnectionStatus, getApiHealth, getFinanceSnapshot, subscribeApiConnectionStatus, toggleContaStatus, updateFinanceEntry } from '../services/api';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { AppHeader } from '../components/AppHeader';
import { formatMonthReference } from '../utils/dateLabel';
import { useResident } from '../context/ResidentContext';

function toNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  let normalized = raw.replace(/[^\d,.-]/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 || lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = normalized.split(thousandSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toSheetMoney(value) {
  const n = toNumber(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function forceDotDecimal(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '0.00';
  if (raw.includes('.') || raw.includes(',')) return toSheetMoney(raw);
  const digits = raw.replace(/[^\d-]/g, '');
  if (!digits || digits === '-') return '0.00';
  const negative = digits.startsWith('-');
  const onlyDigits = digits.replace('-', '');
  if (!onlyDigits) return '0.00';
  if (onlyDigits.length === 1) return `${negative ? '-' : ''}0.0${onlyDigits}`;
  if (onlyDigits.length === 2) return `${negative ? '-' : ''}0.${onlyDigits}`;
  const intPart = onlyDigits.slice(0, -2);
  const decPart = onlyDigits.slice(-2);
  return `${negative ? '-' : ''}${intPart}.${decPart}`;
}

function formatMoneyInput(value) {
  let digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length > 9) digits = digits.slice(0, 9);
  const cents = digits.slice(-2).padStart(2, '0');
  const whole = digits.length > 2 ? digits.slice(0, -2) : '0';
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  return `${normalizedWhole || '0'},${cents}`;
}

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNumber(v));
const getAvatarInitial = (value) => {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return '•';
  return cleaned.slice(0, 1).toUpperCase();
};
const formatBreakdownValue = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return brl(0);
  if (/[A-Za-z]/.test(raw)) return raw;
  return brl(value);
};
const getBreakdownMeta = (value, key) => {
  const raw = String(value ?? '').trim();
  if (!raw) return { text: brl(0), color: '#374151' };
  if (/[A-Za-z]/.test(raw)) return { text: raw, color: '#6b7280' };
  const numeric = toNumber(value);
  if (key === 'contaQuePaga') {
    if (numeric > 0) return { text: `-${brl(Math.abs(numeric))}`, color: '#c62828' };
    if (numeric < 0) return { text: `+${brl(Math.abs(numeric))}`, color: '#2e7d32' };
  }
  if (numeric > 0) return { text: `+${brl(Math.abs(numeric))}`, color: '#2e7d32' };
  if (numeric < 0) return { text: `-${brl(Math.abs(numeric))}`, color: '#c62828' };
  return { text: formatBreakdownValue(value), color: '#374151' };
};

function parseDueDay(conta) {
  const candidates = [
    conta?.diaVencimento,
    conta?.vencimentoDia,
    conta?.dia,
    conta?.vencimento,
    conta?.dueDay,
  ];
  for (const candidate of candidates) {
    const value = Number(String(candidate ?? '').replace(/[^\d]/g, ''));
    if (Number.isFinite(value) && value >= 1 && value <= 31) return value;
  }
  return null;
}

function getContaStatusMeta(conta, referenceDate = new Date()) {
  const paid = String(conta?.status || '').toUpperCase() === 'TRUE';
  const dueDay = parseDueDay(conta);
  if (paid) return { label: 'Paga', tone: 'paid', dueDay };
  if (!dueDay) return { label: 'Pendente', tone: 'pending', dueDay: null };
  const today = referenceDate.getDate();
  if (today > dueDay) return { label: 'Atrasada', tone: 'overdue', dueDay };
  return { label: 'Pendente', tone: 'pending', dueDay };
}

function getContaToneStyles(tone = 'pending', isDark = false) {
  if (!isDark) {
    return {
      row: tone === 'paid' ? styles.contaRowPaid : tone === 'overdue' ? styles.contaRowOverdue : styles.contaRowPending,
      textColor: '#1f2937',
    };
  }
  if (tone === 'paid') return { row: styles.contaRowPaidDark, textColor: '#ecfdf3' };
  if (tone === 'overdue') return { row: styles.contaRowOverdueDark, textColor: '#fff1f2' };
  return { row: styles.contaRowPendingDark, textColor: '#fffbeb' };
}

export function FinancesScreen() {
  const { isDark, toggleTheme } = useThemeMode();
  const { resident, getResidentPhoto } = useResident();
  const colors = isDark ? darkTheme : lightTheme;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState({ mesReferencia: '', residents: [], contas: [], gastosColetivos: [], acertosIndividuais: [] });
  const [modalVisible, setModalVisible] = useState(false);
  const [quickCreateVisible, setQuickCreateVisible] = useState(false);
  const [pickContaVisible, setPickContaVisible] = useState(false);
  const [pickAcertoDeleteVisible, setPickAcertoDeleteVisible] = useState(false);
  const [pickGastoDeleteVisible, setPickGastoDeleteVisible] = useState(false);
  const [entryType, setEntryType] = useState('gastoColetivo');
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rentDetailVisible, setRentDetailVisible] = useState(false);
  const [rentDetailResident, setRentDetailResident] = useState(null);
  const [apiOnline, setApiOnline] = useState(true);
  const [apiStatus, setApiStatus] = useState(() => getApiConnectionStatus());
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [form, setForm] = useState({
    quem: '',
    oQue: '',
    quanto: '',
    paraQuem: '',
    quemMulti: [],
    deveQuanto: '',
    obs: '',
    dividirCom: [],
    conta: '',
    valor: '',
    status: false,
  });

  const load = useCallback(async (mode = 'normal') => {
    if (mode === 'pull') setRefreshing(true);
    else if (mode === 'normal') setLoading(true);
    try {
      const data = await getFinanceSnapshot();
      setSnapshot({
        mesReferencia: data?.mesReferencia || '',
        residents: data?.residents || [],
        contas: data?.contas || [],
        gastosColetivos: data?.gastosColetivos || [],
        acertosIndividuais: data?.acertosIndividuais || [],
      });
      setApiOnline(true);
      setLastSyncAt(new Date().toISOString());
      setError('');
    } catch (e) {
      setApiOnline(false);
      setError(e.message || 'Erro ao carregar financas');
    } finally {
      if (mode === 'normal') setLoading(false);
      if (mode === 'pull') setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await getApiHealth();
        setApiOnline(true);
      } catch {
        setApiOnline(false);
      }
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeApiConnectionStatus((next) => {
      setApiStatus(next);
      setApiOnline(Boolean(next?.online));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load('silent');
    });
    return () => sub.remove();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load('silent');
      const timer = setInterval(() => {
        load('silent');
      }, 20000);
      return () => clearInterval(timer);
    }, [load])
  );

  const contasOperacionais = useMemo(
    () =>
      (snapshot.contas || []).filter((item) => {
        const conta = String(item?.conta || '').trim().toUpperCase();
        return conta !== 'TOTAL' && conta !== 'MORADORES';
      }),
    [snapshot.contas]
  );
  const totalContas = useMemo(() => contasOperacionais.reduce((acc, item) => acc + toNumber(item?.valor), 0), [contasOperacionais]);
  const moradoresCount = useMemo(() => {
    const row = (snapshot.contas || []).find((item) => String(item?.conta || '').trim().toUpperCase() === 'MORADORES');
    const fromRow = Number(String(row?.valor ?? '').replace(/[^\d]/g, ''));
    if (Number.isFinite(fromRow) && fromRow > 0) return fromRow;
    return (snapshot.residents || []).length || 1;
  }, [snapshot.contas, snapshot.residents]);
  const totalContasPorMorador = useMemo(() => totalContas / Math.max(1, moradoresCount), [totalContas, moradoresCount]);
  const totalColetivos = useMemo(
    () => snapshot.gastosColetivos.reduce((acc, item) => acc + toNumber(item?.quanto || item?.valor), 0),
    [snapshot.gastosColetivos]
  );
  const totalAcertos = useMemo(
    () => snapshot.acertosIndividuais.reduce((acc, item) => acc + toNumber(item?.deveQuanto || item?.valor), 0),
    [snapshot.acertosIndividuais]
  );
  const totalGeral = useMemo(() => totalContas + totalColetivos + totalAcertos, [totalContas, totalColetivos, totalAcertos]);
  const totalColetivosPorMorador = useMemo(() => totalColetivos / Math.max(1, moradoresCount), [totalColetivos, moradoresCount]);
  const contasStats = useMemo(() => {
    const contas = snapshot.contas || [];
    const count = contas.length;
    const paid = contas.filter((c) => String(c?.status || '').toUpperCase() === 'TRUE').length;
    const pending = Math.max(0, count - paid);
    const avg = count ? totalContas / count : 0;
    return { count, paid, pending, avg };
  }, [snapshot.contas, totalContas]);
  const detailItems = [
    ['Aluguel base', 'aluguel'],
    ['Agua', 'agua'],
    ['Luz', 'luz'],
    ['Internet', 'net'],
    ['IPTU', 'iptu'],
    ['Sofa', 'sofa'],
    ['Drywall', 'dryWall'],
    ['Caixinha', 'caixinha'],
    ['Subtotal', 'subtotal'],
    ['Multas', 'multas'],
    ['Conta que paga', 'contaQuePaga'],
    ['Dividas', 'dividas'],
  ];

  const inferRowIndex = (item, idx) => {
    const raw = item?.rowIndex ?? item?.row ?? item?.linha;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    return idx + 2;
  };

  const openCreateModal = (type) => {
    const defaultConta = (snapshot.contas || []).find((item) => String(item?.conta || '').trim().toUpperCase() !== 'TOTAL' && String(item?.conta || '').trim().toUpperCase() !== 'MORADORES');
    setEntryType(type);
    setEditingItem(null);
    setForm({
      quem: resident || '',
      oQue: '',
      quanto: '',
      paraQuem: '',
      quemMulti: [],
      deveQuanto: '',
      obs: '',
      dividirCom: [],
      conta: type === 'contaFixa' ? (defaultConta?.conta || '') : '',
      valor: type === 'contaFixa' ? String(defaultConta?.valor ?? '') : '',
      status: type === 'contaFixa' ? String(defaultConta?.status || '').toUpperCase() === 'TRUE' : false,
    });
    setModalVisible(true);
  };

  const openCreateFromFab = (type) => {
    setQuickCreateVisible(false);
    openCreateModal(type);
  };

  const openContaPickerFromFab = () => {
    setQuickCreateVisible(false);
    setPickContaVisible(true);
  };

  const openAcertoDeletePickerFromFab = () => {
    setQuickCreateVisible(false);
    setPickAcertoDeleteVisible(true);
  };

  const openGastoDeletePickerFromFab = () => {
    setQuickCreateVisible(false);
    setPickGastoDeleteVisible(true);
  };

  const openEditModal = (type, item, idx) => {
    setEntryType(type);
    setEditingItem({ ...item, _idx: idx, _rowIndex: inferRowIndex(item, idx) });
    setForm({
      quem: item?.quem || '',
      oQue: item?.oQue || item?.descricao || '',
      quanto: String(item?.quanto ?? item?.valor ?? ''),
      paraQuem: item?.paraQuem || '',
      quemMulti: [],
      deveQuanto: String(item?.deveQuanto ?? item?.valor ?? ''),
      obs: item?.obs || item?.observacao || '',
      dividirCom: [],
      conta: item?.conta || '',
      valor: String(item?.valor ?? ''),
      status: String(item?.status || '').toUpperCase() === 'TRUE',
    });
    setModalVisible(true);
  };

  const applyContaTemplate = (contaName) => {
    const found = (contasOperacionais || []).find(
      (item) => String(item?.conta || '').trim().toUpperCase() === String(contaName || '').trim().toUpperCase()
    );
    if (!found) {
      setForm((prev) => ({ ...prev, conta: contaName }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      conta: found.conta || prev.conta,
      valor: String(found.valor ?? prev.valor ?? ''),
      status: String(found.status || '').toUpperCase() === 'TRUE',
    }));
  };

  const toggleDividirCom = (nome) => {
    setForm((prev) => {
      const current = Array.isArray(prev.dividirCom) ? prev.dividirCom : [];
      const exists = current.some((n) => String(n).toUpperCase() === String(nome).toUpperCase());
      return {
        ...prev,
        dividirCom: exists
          ? current.filter((n) => String(n).toUpperCase() !== String(nome).toUpperCase())
          : [...current, nome],
      };
    });
  };

  const toggleQuemMulti = (nome) => {
    setForm((prev) => {
      const current = Array.isArray(prev.quemMulti) ? prev.quemMulti : [];
      const exists = current.some((n) => String(n).toUpperCase() === String(nome).toUpperCase());
      return {
        ...prev,
        quemMulti: exists
          ? current.filter((n) => String(n).toUpperCase() !== String(nome).toUpperCase())
          : [...current, nome],
      };
    });
  };

  const saveEntry = async () => {
    try {
      setSaving(true);
      if (!editingItem) {
        if (entryType === 'contaFixa') {
          if (!form.conta.trim() || !form.valor.trim()) {
            Alert.alert('Campos obrigatorios', 'Preencha conta e valor.');
            return;
          }
          await addFinanceEntry({
            entryType: 'contaFixa',
            usuario: resident,
            payload: { conta: form.conta.trim(), valor: toSheetMoney(form.valor), status: form.status ? 'TRUE' : 'FALSE' },
          });
        } else if (entryType === 'gastoColetivo') {
          if (!form.quem.trim() || !form.oQue.trim() || !form.quanto.trim()) {
            Alert.alert('Campos obrigatorios', 'Preencha quem, descricao e valor.');
            return;
          }
          const payer = form.quem.trim();
          const devedores = Array.from(
            new Set(
              (form.dividirCom || [])
                .map((n) => String(n).trim())
                .filter(Boolean)
                .filter((nome) => String(nome).toUpperCase() !== String(payer).toUpperCase())
            )
          );
          if (!devedores.length) {
            Alert.alert('Devedores obrigatorios', 'Selecione ao menos um morador para dividir com quem emprestou.');
            return;
          }
          const qtdDevedores = Math.max(1, devedores.length);
          const valorPorPessoa = toNumber(form.quanto) / qtdDevedores;
          const splitMeta = `Divisao: ${qtdDevedores} devedor(es) (${brl(valorPorPessoa)}/devedor) • ${devedores.join(', ')} -> ${payer}`;
          const obsPayload = [form.obs.trim(), splitMeta].filter(Boolean).join(' | ');
          await addFinanceEntry({
            entryType: 'gastoColetivo',
            usuario: resident,
            payload: {
              quem: form.quem.trim(),
              oQue: form.oQue.trim(),
              quanto: forceDotDecimal(form.quanto),
              obs: obsPayload,
            },
          });
          const valorAcerto = (toNumber(form.quanto) / qtdDevedores).toFixed(2);
          for (const devedor of devedores) {
            await addFinanceEntry({
              entryType: 'acertoIndividual',
              usuario: resident,
              payload: {
                quem: devedor,
                paraQuem: payer,
                deveQuanto: forceDotDecimal(valorAcerto),
                obs: form.obs.trim(),
              },
            });
          }
        } else if (entryType === 'acertoIndividual') {
          if (!form.quem.trim() || !form.paraQuem.trim() || !form.deveQuanto.trim()) {
            Alert.alert('Campos obrigatorios', 'Preencha quem deve, quem emprestou e valor.');
            return;
          }
          const credor = form.paraQuem.trim();
          const devedores = Array.from(
            new Set([form.quem.trim(), ...(form.quemMulti || []).map((n) => String(n).trim()).filter(Boolean)])
          ).filter((nome) => String(nome).toUpperCase() !== String(credor).toUpperCase());
          const qtdDevedores = Math.max(1, devedores.length);
          const valorTotal = toNumber(form.deveQuanto);
          const valorPorPessoa = valorTotal / qtdDevedores;
          const splitMeta = `Emprestimo dividido: ${qtdDevedores} devedor(es) (${brl(valorPorPessoa)}/pessoa) • ${devedores.join(', ')} -> ${credor}`;
          const obsPayload = [form.obs.trim(), devedores.length > 1 ? splitMeta : ''].filter(Boolean).join(' | ');
          const listaFinal = devedores.length ? devedores : [form.quem.trim()];
          for (const devedor of listaFinal) {
            await addFinanceEntry({
              entryType: 'acertoIndividual',
              usuario: resident,
              payload: { quem: devedor, paraQuem: credor, deveQuanto: forceDotDecimal(valorPorPessoa), obs: obsPayload },
            });
          }
        }
      } else {
        if (entryType === 'contaFixa') {
          if (!form.conta.trim() || !form.valor.trim()) {
            Alert.alert('Campos obrigatorios', 'Preencha conta e valor.');
            return;
          }
          await updateFinanceEntry({
            entryType: 'contaFixa',
            rowIndex: editingItem._rowIndex,
            payload: { conta: form.conta.trim(), valor: toSheetMoney(form.valor), status: form.status ? 'TRUE' : 'FALSE' },
          });
        } else if (entryType === 'gastoColetivo') {
          const participantes = Array.from(
            new Set([form.quem.trim(), ...(form.dividirCom || []).map((n) => String(n).trim()).filter(Boolean)])
          );
          const qtdPessoas = Math.max(1, participantes.length);
          const valorPorPessoa = toNumber(form.quanto) / qtdPessoas;
          const splitMeta = `Divisao: ${qtdPessoas} pessoas (${brl(valorPorPessoa)}/pessoa) • ${participantes.join(', ')}`;
          const obsPayload = [form.obs.trim(), splitMeta].filter(Boolean).join(' | ');
          await updateFinanceEntry({
            entryType: 'gastoColetivo',
            rowIndex: editingItem._rowIndex,
            payload: { quem: form.quem.trim(), oQue: form.oQue.trim(), quanto: forceDotDecimal(form.quanto), obs: obsPayload },
          });
        } else if (entryType === 'acertoIndividual') {
          await updateFinanceEntry({
            entryType: 'acertoIndividual',
            rowIndex: editingItem._rowIndex,
            payload: { quem: form.quem.trim(), paraQuem: form.paraQuem.trim(), deveQuanto: forceDotDecimal(form.deveQuanto), obs: form.obs.trim() },
          });
        }
      }

      setModalVisible(false);
      await load('pull');
      Alert.alert('Sucesso', 'Planilha e app sincronizados.');
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Nao foi possivel salvar.');
    } finally {
      setSaving(false);
    }
  };

  const onToggleConta = async (item, idx) => {
    try {
      const current = String(item?.status || '').toUpperCase() === 'TRUE';
      await toggleContaStatus({ rowIndex: inferRowIndex(item, idx), status: !current });
      await load('silent');
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Nao foi possivel atualizar status da conta.');
    }
  };

  const onDeleteEntry = async (type, item, idx) => {
    Alert.alert('Excluir lancamento', 'Tem certeza que deseja excluir este item?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            const rowIndex = inferRowIndex(item, idx);
            const match = type === 'contaFixa'
              ? { conta: item?.conta || '', valor: item?.valor || '' }
              : type === 'gastoColetivo'
                ? { quem: item?.quem || '', oQue: item?.oQue || item?.descricao || '', quanto: item?.quanto || item?.valor || '' }
                : { quem: item?.quem || '', paraQuem: item?.paraQuem || '', deveQuanto: item?.deveQuanto || item?.valor || '' };
            try {
              await deleteFinanceEntry({ entryType: type, rowIndex, match });
            } catch {
              if (type === 'contaFixa') {
                await updateFinanceEntry({
                  entryType: 'contaFixa',
                  rowIndex,
                  payload: { conta: '', valor: '', divisao: '', vencimento: '', status: '' },
                });
              } else if (type === 'gastoColetivo') {
                await updateFinanceEntry({
                  entryType: 'gastoColetivo',
                  rowIndex,
                  payload: { quem: '', quanto: '', oQue: '', obs: '' },
                });
              } else if (type === 'acertoIndividual') {
                await updateFinanceEntry({
                  entryType: 'acertoIndividual',
                  rowIndex,
                  payload: { quem: '', deveQuanto: '', paraQuem: '', obs: '' },
                });
              } else {
                throw new Error('Tipo de lancamento invalido para exclusao.');
              }
            }
            await load('pull');
            Alert.alert('Sucesso', 'Item removido com sucesso.');
          } catch (e) {
            Alert.alert('Erro', e?.message || 'Nao foi possivel excluir.');
          }
        },
      },
    ]);
  };

  const openRentDetail = (residentItem) => {
    setRentDetailResident(residentItem || null);
    setRentDetailVisible(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Finanças" subtitle={formatMonthReference(snapshot.mesReferencia)} />
      <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 0 }]}>
        <View>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Gestão Financeira</Text>
          <Text style={[styles.helper, { color: colors.muted }]}>Atualiza automaticamente com a planilha</Text>
          <View style={[styles.syncPill, { backgroundColor: apiOnline ? (isDark ? '#1f3a2f' : '#e8f5e9') : (isDark ? '#3a1f25' : '#ffebee') }]}>
            <MaterialCommunityIcons name={apiOnline ? 'cloud-check-outline' : 'cloud-alert-outline'} size={12} color={apiOnline ? '#2e7d32' : '#c62828'} />
            <Text style={[styles.syncPillText, { color: apiOnline ? '#2e7d32' : '#c62828' }]}>
              {apiOnline
                ? `Sincronização ativa${lastSyncAt ? ` • ${new Date(lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                : (apiStatus?.message || 'Sem conexão com API')}
            </Text>
          </View>
        </View>
        <Pressable style={[styles.themeBtn, { backgroundColor: colors.background }]} onPress={toggleTheme}>
          <MaterialCommunityIcons name={isDark ? 'white-balance-sunny' : 'moon-waning-crescent'} size={18} color={colors.text} />
          <Text style={[styles.themeBtnText, { color: colors.text }]}>{isDark ? 'Claro' : 'Noturno'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
        >
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!apiOnline && !!apiStatus?.cachedAt && (
            <Text style={styles.offlineHint}>Ultima consulta salva: {new Date(apiStatus.cachedAt).toLocaleString('pt-BR')}</Text>
          )}
          {!!error && (
            <Pressable style={styles.retryBtn} onPress={() => load('pull')}>
              <MaterialCommunityIcons name="refresh" size={14} color="#fff" />
              <Text style={styles.retryBtnText}>Tentar novamente</Text>
            </Pressable>
          )}

          <View style={styles.kpiStrip}>
            <View style={[styles.kpiPill, { backgroundColor: isDark ? '#221c2e' : '#f3e5f5' }]}>
              <Text style={[styles.kpiPillLabel, { color: colors.muted }]}>Contas fixas</Text>
              <Text style={[styles.kpiPillValue, { color: colors.primary }]}>{brl(totalContas)}</Text>
            </View>
            <View style={[styles.kpiPill, { backgroundColor: isDark ? '#1a2a24' : '#e8f5e9' }]}>
              <Text style={[styles.kpiPillLabel, { color: colors.muted }]}>Por morador</Text>
              <Text style={[styles.kpiPillValue, { color: '#2e7d32' }]}>{brl(totalContasPorMorador)}</Text>
            </View>
            <View style={[styles.kpiPill, { backgroundColor: isDark ? '#2d2126' : '#ffebee' }]}>
              <Text style={[styles.kpiPillLabel, { color: colors.muted }]}>Pendências</Text>
              <Text style={[styles.kpiPillValue, { color: '#c62828' }]}>{contasStats.pending}</Text>
            </View>
          </View>

          <View style={[styles.highlightCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <View style={styles.titleRow}>
                <View style={styles.titleIconPill}>
                  <MaterialCommunityIcons name="home-city-outline" size={15} color="#6a1b9a" />
                </View>
                <View>
                  <Text style={[styles.highlightTitle, { color: colors.text }]}>Prévia dos Aluguéis</Text>
                  <Text style={[styles.previewSubTitle, { color: colors.muted }]}>Aluguel + contas por morador</Text>
                </View>
              </View>
              <View style={styles.livePill}>
                <MaterialCommunityIcons name="pulse" size={11} color="#6a1b9a" />
                <Text style={[styles.liveBadge, { color: colors.primary }]}>Ao vivo</Text>
              </View>
            </View>
            {(snapshot.residents || []).map((r, idx) => (
              <Pressable key={`r-${idx}`} style={[styles.previewResidentCard, { borderColor: colors.border }]} onPress={() => openRentDetail(r)}>
                {getResidentPhoto(r?.nome) ? (
                  <Image source={{ uri: getResidentPhoto(r?.nome) }} style={[styles.rentAvatarPhoto, styles.rentAvatarStrong, styles.previewAvatar]} />
                ) : (
                  <View style={[styles.rentAvatar, styles.rentAvatarStrong, styles.previewAvatar]}>
                    <Text style={styles.rentAvatarText}>{getAvatarInitial(r?.nome)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.labelStrong, { color: colors.text }]}>{r?.nome || '-'}</Text>
                  <View style={styles.previewMetaRow}>
                    <MaterialCommunityIcons name="lightning-bolt-outline" size={12} color="#7e57c2" />
                    <Text style={[styles.previewHint, { color: colors.muted }]}>Composição mensal individual</Text>
                  </View>
                </View>
                <View style={styles.previewAmountWrap}>
                  <Text style={[styles.previewAmountLabel, { color: colors.muted }]}>Total</Text>
                  <Text style={[styles.previewAmountValue, { color: colors.text }]}>{brl(r?.total)}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={16} color="#94a3b8" />
              </Pressable>
            ))}
            {!snapshot.residents?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum morador encontrado.</Text>}
            {!!snapshot.residents?.length && (
              <View style={[styles.previewFooter, { borderTopColor: colors.border }]}>
                <Text style={[styles.previewFooterLabel, { color: colors.muted }]}>Valor médio por morador</Text>
                <Text style={[styles.previewFooterValue, { color: colors.primary }]}>{brl(totalContasPorMorador)}</Text>
              </View>
            )}
          </View>

          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.titleRow}>
              <View style={styles.titleIconPill}>
                <MaterialCommunityIcons name="chart-donut" size={15} color="#6a1b9a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroLabel, { color: colors.muted }]}>Resumo Financeiro</Text>
                <Text style={[styles.heroSubLabel, { color: colors.muted }]}>Visão consolidada das despesas da república</Text>
              </View>
            </View>
            <Text style={[styles.heroValue, { color: colors.text }]}>{brl(totalGeral)}</Text>
            <View style={styles.metricGrid}>
              <View style={[styles.metricBox, { borderColor: colors.border }]}>
                <Text style={[styles.metricBoxLabel, { color: colors.muted }]}>Média por Conta</Text>
                <Text style={[styles.metricBoxValue, { color: colors.text }]}>{brl(contasStats.avg)}</Text>
              </View>
              <View style={[styles.metricBox, { borderColor: colors.border }]}>
                <Text style={[styles.metricBoxLabel, { color: colors.muted }]}>Total de Contas</Text>
                <Text style={[styles.metricBoxValue, { color: colors.text }]}>{contasStats.count}</Text>
              </View>
            </View>
            <View style={styles.metricGrid}>
              <View style={[styles.metricBox, { borderColor: colors.border }]}>
                <Text style={[styles.metricBoxLabel, { color: colors.muted }]}>Contas Pagas</Text>
                <Text style={[styles.metricBoxValue, { color: '#2e7d32' }]}>{contasStats.paid}</Text>
              </View>
              <View style={[styles.metricBox, { borderColor: colors.border }]}>
                <Text style={[styles.metricBoxLabel, { color: colors.muted }]}>Contas Pendentes</Text>
                <Text style={[styles.metricBoxValue, { color: '#c62828' }]}>{contasStats.pending}</Text>
              </View>
            </View>
            <View style={styles.heroRow}>
              <View style={[styles.metricPill, { backgroundColor: isDark ? '#2a2232' : '#f3e5f5' }]}>
                <Text style={[styles.metricText, { color: colors.primary }]}>Contas {brl(totalContas)}</Text>
              </View>
              <View style={[styles.metricPill, { backgroundColor: isDark ? '#1f2e29' : '#e8f5e9' }]}>
                <Text style={[styles.metricText, { color: '#2e7d32' }]}>Coletivo {brl(totalColetivos)}</Text>
              </View>
              <View style={[styles.metricPill, { backgroundColor: isDark ? '#302429' : '#ffebee' }]}>
                <Text style={[styles.metricText, { color: '#c62828' }]}>Acertos {brl(totalAcertos)}</Text>
              </View>
            </View>
            <Text style={[styles.heroFootnote, { color: colors.muted }]}>
              Lançamentos: {snapshot.contas.length} contas • {snapshot.gastosColetivos.length} coletivos • {snapshot.acertosIndividuais.length} acertos
            </Text>
          </View>

          <View style={[styles.card, styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <View style={styles.titleRow}>
                <View style={styles.titleIconPill}>
                  <MaterialCommunityIcons name="file-document-outline" size={15} color="#6a1b9a" />
                </View>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Contas Fixas</Text>
                  <Text style={[styles.sectionHint, { color: colors.muted }]}>Despesas recorrentes do mês</Text>
                </View>
              </View>
              <View style={styles.sectionHeadRight}>
                <Text style={[styles.total, { color: colors.primary }]}>Total: {brl(totalContas)}</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{contasOperacionais.length} itens</Text>
                </View>
              </View>
            </View>
            {contasOperacionais.map((c, idx) => {
              const statusMeta = getContaStatusMeta(c);
              const tone = getContaToneStyles(statusMeta.tone, isDark);
              const hintToneStyle = statusMeta.tone === 'paid'
                ? (isDark ? styles.contaHintPaidDark : styles.contaHintPaid)
                : statusMeta.tone === 'overdue'
                  ? (isDark ? styles.contaHintOverdueDark : styles.contaHintOverdue)
                  : (isDark ? styles.contaHintPendingDark : styles.contaHintPending);
              return (
              <View
                key={`c-${idx}`}
                style={[
                  styles.row,
                  styles.entryRow,
                  styles.contaRow,
                  {
                    borderBottomColor: colors.border,
                  },
                  tone.row,
                ]}
              >
                <View style={styles.entryMain}>
                  <Text style={[styles.label, { color: tone.textColor }]}>{c?.conta || '-'}</Text>
                  <Text
                    style={[
                      styles.rentHint,
                      hintToneStyle,
                    ]}
                  >
                    Status: {statusMeta.label}
                    {statusMeta.dueDay ? ` • Vence dia ${statusMeta.dueDay}` : ' • Vencimento nao informado'}
                  </Text>
                </View>
                <View style={styles.entryAside}>
                  <Text style={[styles.value, styles.entryValue, styles.valueEmphasis, { color: tone.textColor }]}>{brl(c?.valor)}</Text>
                  <View style={styles.entryActionsRow}>
                    <Pressable style={[styles.iconBtn, String(c?.status || '').toUpperCase() === 'TRUE' && styles.iconBtnOk]} onPress={() => onToggleConta(c, idx)}>
                      <MaterialCommunityIcons name={String(c?.status || '').toUpperCase() === 'TRUE' ? 'check-circle' : 'clock-outline'} size={16} color={String(c?.status || '').toUpperCase() === 'TRUE' ? '#fff' : '#6a1b9a'} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => openEditModal('contaFixa', c, idx)}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#6a1b9a" />
                    </Pressable>
                    <Pressable hitSlop={10} style={styles.iconBtn} onPress={() => onDeleteEntry('contaFixa', c, idx)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
                    </Pressable>
                  </View>
                </View>
              </View>
              );
            })}
            {!contasOperacionais.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhuma conta fixa encontrada.</Text>}
            {!!contasOperacionais.length && (
              <View style={[styles.row, styles.fixedSplitRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.label, styles.fixedSplitLabel]}>Total por morador ({moradoresCount})</Text>
                <Text style={[styles.value, styles.fixedSplitValue]}>{brl(totalContasPorMorador)}</Text>
              </View>
            )}
          </View>

          <View style={[styles.card, styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <View style={styles.titleRow}>
                <View style={styles.titleIconPill}>
                  <MaterialCommunityIcons name="cart-outline" size={15} color="#6a1b9a" />
                </View>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Gastos Coletivos</Text>
                  <Text style={[styles.sectionHint, { color: colors.muted }]}>Compras e despesas compartilhadas</Text>
                </View>
              </View>
              <View style={styles.sectionHeadRight}>
                <Text style={[styles.total, { color: colors.primary }]}>Total: {brl(totalColetivos)}</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{snapshot.gastosColetivos.length} itens</Text>
                </View>
              </View>
            </View>
            {(snapshot.gastosColetivos || []).map((g, idx) => (
              <View key={`g-${idx}`} style={[styles.row, styles.entryRow, { borderBottomColor: colors.border }]}>
                <View style={styles.entryMain}>
                  <Text style={[styles.label, { color: colors.text }]}>{g?.quem} - {g?.oQue || g?.descricao || '-'}</Text>
                  {!!String(g?.obs || g?.observacao || '').trim() && (
                    <View style={[styles.obsChip, { backgroundColor: isDark ? '#2d3342' : '#f1f5f9' }]}>
                      <MaterialCommunityIcons name="note-text-outline" size={12} color="#64748b" />
                      <Text style={[styles.obsChipText, { color: colors.text }]}>Obs: {g?.obs || g?.observacao}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.entryAside}>
                  <Text style={[styles.value, styles.entryValue, styles.valueEmphasis, { color: colors.text }]}>{brl(g?.quanto || g?.valor)}</Text>
                  <View style={styles.entryActionsRow}>
                    <Pressable style={styles.iconBtn} onPress={() => openEditModal('gastoColetivo', g, idx)}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#6a1b9a" />
                    </Pressable>
                    <Pressable hitSlop={10} style={styles.iconBtn} onPress={() => onDeleteEntry('gastoColetivo', g, idx)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
            {!snapshot.gastosColetivos?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum gasto coletivo encontrado.</Text>}
            {!!snapshot.gastosColetivos?.length && (
              <View style={[styles.row, styles.fixedSplitRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.label, styles.fixedSplitLabel]}>Total por morador ({moradoresCount})</Text>
                <Text style={[styles.value, styles.fixedSplitValue]}>{brl(totalColetivosPorMorador)}</Text>
              </View>
            )}
          </View>

          <View style={[styles.card, styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <View style={styles.titleRow}>
                <View style={styles.titleIconPill}>
                  <MaterialCommunityIcons name="handshake-outline" size={15} color="#6a1b9a" />
                </View>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Acertos Individuais</Text>
                  <Text style={[styles.sectionHint, { color: colors.muted }]}>Quem deve e quem recebe</Text>
                </View>
              </View>
              <View style={styles.sectionHeadRight}>
                <Text style={[styles.total, { color: colors.primary }]}>Total: {brl(totalAcertos)}</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{snapshot.acertosIndividuais.length} itens</Text>
                </View>
              </View>
            </View>
            {(snapshot.acertosIndividuais || []).map((a, idx) => (
              <View key={`a-${idx}`} style={[styles.row, styles.entryRow, { borderBottomColor: colors.border }]}>
                <View style={styles.entryMain}>
                  <Text style={[styles.label, { color: colors.text }]}>Deve: {a?.quem || '-'}</Text>
                  <Text style={[styles.rentHint, { color: colors.muted }]}>Emprestou: {a?.paraQuem || '-'}</Text>
                  {!!String(a?.obs || a?.observacao || '').trim() && (
                    <View style={[styles.obsChip, { backgroundColor: isDark ? '#2d3342' : '#f1f5f9' }]}>
                      <MaterialCommunityIcons name="note-text-outline" size={12} color="#64748b" />
                      <Text style={[styles.obsChipText, { color: colors.text }]}>Obs: {a?.obs || a?.observacao}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.entryAside}>
                  <Text style={[styles.value, styles.entryValue, styles.valueEmphasis, { color: colors.text }]}>{brl(a?.deveQuanto || a?.valor)}</Text>
                  <View style={styles.entryActionsRow}>
                    <Pressable style={styles.iconBtn} onPress={() => openEditModal('acertoIndividual', a, idx)}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#6a1b9a" />
                    </Pressable>
                    <Pressable hitSlop={10} style={styles.iconBtn} onPress={() => onDeleteEntry('acertoIndividual', a, idx)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
            {!snapshot.acertosIndividuais?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum acerto individual encontrado.</Text>}
          </View>

          <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
                <View style={styles.modalHead}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {editingItem ? 'Editar lancamento' : 'Novo lancamento'}
                  </Text>
                  <Pressable style={styles.iconBtn} onPress={() => setModalVisible(false)}>
                    <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
                  </Pressable>
                </View>
                <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>
                  {entryType === 'contaFixa' ? 'Conta fixa' : entryType === 'gastoColetivo' ? 'Gasto coletivo' : 'Acerto individual'}
                </Text>

                {entryType === 'contaFixa' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Conta fixa (selecione da lista)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {contasOperacionais.map((c, idx) => {
                        const contaName = c?.conta || '';
                        const active = String(form.conta).toUpperCase() === String(contaName).toUpperCase();
                        return (
                          <Pressable key={`conta-chip-${idx}`} style={[styles.nameChip, active && styles.nameChipActive]} onPress={() => applyContaTemplate(contaName)}>
                            <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{contaName}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    {!contasOperacionais.length && (
                      <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>Nenhuma conta fixa cadastrada para selecionar.</Text>
                    )}
                    <TextInput value={form.valor} onChangeText={(v) => setForm((p) => ({ ...p, valor: formatMoneyInput(v) }))} style={styles.input} placeholder="Valor" keyboardType="decimal-pad" placeholderTextColor="#94a3b8" />
                    <Pressable style={styles.statusToggle} onPress={() => setForm((p) => ({ ...p, status: !p.status }))}>
                      <MaterialCommunityIcons name={form.status ? 'check-circle' : 'clock-outline'} size={17} color={form.status ? '#16a34a' : '#6a1b9a'} />
                      <Text style={[styles.label, { color: colors.text }]}>{form.status ? 'Conta paga' : 'Conta pendente'}</Text>
                    </Pressable>
                  </>
                ) : null}

                {entryType === 'gastoColetivo' ? (
                  <>
                    <TextInput value={form.quem} onChangeText={(v) => setForm((p) => ({ ...p, quem: v }))} style={styles.input} placeholder="Quem pagou" placeholderTextColor="#94a3b8" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || []).map((r, idx) => {
                        const nome = r?.nome || '';
                        const active = String(form.quem).toUpperCase() === String(nome).toUpperCase();
                        return (
                          <Pressable
                            key={`gc-nome-${idx}`}
                            style={[styles.nameChip, active && styles.nameChipActive]}
                            onPress={() =>
                              setForm((p) => ({
                                ...p,
                                quem: nome,
                                dividirCom: (p.dividirCom || []).filter((n) => String(n).toUpperCase() !== String(nome).toUpperCase()),
                              }))
                            }
                          >
                            <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Dividir com (alem de quem pagou)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || [])
                        .filter((r) => String(r?.nome || '').toUpperCase() !== String(form.quem || '').toUpperCase())
                        .map((r, idx) => {
                          const nome = r?.nome || '';
                          const active = (form.dividirCom || []).some((n) => String(n).toUpperCase() === String(nome).toUpperCase());
                          return (
                            <Pressable key={`gc-div-${idx}`} style={[styles.nameChip, active && styles.nameChipActive]} onPress={() => toggleDividirCom(nome)}>
                              <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                            </Pressable>
                          );
                        })}
                    </ScrollView>
                    <TextInput value={form.oQue} onChangeText={(v) => setForm((p) => ({ ...p, oQue: v }))} style={styles.input} placeholder="Descrição" placeholderTextColor="#94a3b8" />
                    <TextInput value={form.quanto} onChangeText={(v) => setForm((p) => ({ ...p, quanto: formatMoneyInput(v) }))} style={styles.input} placeholder="Valor" keyboardType="decimal-pad" placeholderTextColor="#94a3b8" />
                    <Text style={[styles.helper, { color: colors.muted, marginBottom: 6 }]}>
                      Divisao atual: {Math.max(1, (form.dividirCom || []).filter((n) => String(n).trim().toUpperCase() !== String(form.quem || '').trim().toUpperCase()).length)} devedor(es) •{' '}
                      {brl(
                        toNumber(form.quanto) /
                        Math.max(
                          1,
                          (form.dividirCom || [])
                            .filter((n) => String(n).trim().toUpperCase() !== String(form.quem || '').trim().toUpperCase()).length
                        )
                      )} por devedor
                    </Text>
                    <TextInput value={form.obs} onChangeText={(v) => setForm((p) => ({ ...p, obs: v }))} style={styles.input} placeholder="Observacao (opcional)" placeholderTextColor="#94a3b8" />
                  </>
                ) : null}

                {entryType === 'acertoIndividual' ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Quem deve (devedor principal)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || []).map((r, idx) => {
                        const nome = r?.nome || '';
                        const active = String(form.quem).toUpperCase() === String(nome).toUpperCase();
                        return (
                          <Pressable key={`acerto-deve-${idx}`} style={[styles.nameChip, active && styles.nameChipActive]} onPress={() => setForm((p) => ({ ...p, quem: nome }))}>
                            <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Quem emprestou (credor)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || []).map((r, idx) => {
                        const nome = r?.nome || '';
                        const active = String(form.paraQuem).toUpperCase() === String(nome).toUpperCase();
                        return (
                          <Pressable
                            key={`acerto-para-${idx}`}
                            style={[styles.nameChip, active && styles.nameChipActive]}
                            onPress={() => setForm((p) => ({
                              ...p,
                              paraQuem: nome,
                              quemMulti: (p.quemMulti || []).filter((n) => String(n).toUpperCase() !== String(nome).toUpperCase()),
                            }))}
                          >
                            <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Mais pessoas que devem para o mesmo credor</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChipRow}>
                      {(snapshot.residents || [])
                        .filter((r) => {
                          const nome = String(r?.nome || '').toUpperCase();
                          return nome !== String(form.quem || '').toUpperCase() && nome !== String(form.paraQuem || '').toUpperCase();
                        })
                        .map((r, idx) => {
                          const nome = r?.nome || '';
                          const active = (form.quemMulti || []).some((n) => String(n).toUpperCase() === String(nome).toUpperCase());
                          return (
                            <Pressable key={`acerto-para-multi-${idx}`} style={[styles.nameChip, active && styles.nameChipActive]} onPress={() => toggleQuemMulti(nome)}>
                              <Text style={[styles.nameChipText, active && styles.nameChipTextActive]}>{nome}</Text>
                            </Pressable>
                          );
                        })}
                    </ScrollView>
                    <TextInput value={form.deveQuanto} onChangeText={(v) => setForm((p) => ({ ...p, deveQuanto: formatMoneyInput(v) }))} style={styles.input} placeholder="Valor" keyboardType="decimal-pad" placeholderTextColor="#94a3b8" />
                    <Text style={[styles.helper, { color: colors.muted, marginBottom: 6 }]}>
                      Divisao do emprestimo: {Math.max(1, 1 + (form.quemMulti || []).length)} devedor(es) •{' '}
                      {brl(toNumber(form.deveQuanto) / Math.max(1, 1 + (form.quemMulti || []).length))} por devedor
                    </Text>
                    <TextInput value={form.obs} onChangeText={(v) => setForm((p) => ({ ...p, obs: v }))} style={styles.input} placeholder="Observacao (opcional)" placeholderTextColor="#94a3b8" />
                  </>
                ) : null}

                <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving} onPress={saveEntry}>
                  <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : editingItem ? 'Salvar alteracoes' : 'Adicionar lancamento'}</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </ScrollView>
      )}

      <Pressable style={styles.fabLeft} onPress={() => setQuickCreateVisible(true)}>
        <MaterialCommunityIcons name="plus" size={24} color="#fff" />
      </Pressable>

          <Modal visible={quickCreateVisible} transparent animationType="fade" onRequestClose={() => setQuickCreateVisible(false)}>
        <View style={styles.quickOverlay}>
              <View style={[styles.quickSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.quickHead}>
                  <Text style={[styles.quickTitle, { color: colors.text }]}>Novo lancamento</Text>
              <Pressable style={styles.quickCloseBtn} onPress={() => setQuickCreateVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
                <Text style={[styles.quickSubtitle, { color: colors.muted }]}>Escolha o tipo para enviar na planilha</Text>
            <Pressable style={styles.quickOption} onPress={openContaPickerFromFab}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="playlist-edit" size={16} color="#6a1b9a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Alterar valor conta fixa</Text>
                <Text style={styles.quickOptionText}>Escolha uma conta da lista para editar</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
            <Pressable style={styles.quickOption} onPress={() => openCreateFromFab('gastoColetivo')}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="cart-plus" size={16} color="#6a1b9a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Gasto coletivo</Text>
                <Text style={styles.quickOptionText}>Registrar compra ou despesa compartilhada</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
            <Pressable style={styles.quickOption} onPress={openGastoDeletePickerFromFab}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Excluir gasto coletivo</Text>
                <Text style={styles.quickOptionText}>Selecione um gasto para remover</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
            <Pressable style={styles.quickOption} onPress={() => openCreateFromFab('acertoIndividual')}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="handshake-outline" size={16} color="#6a1b9a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Acerto individual</Text>
                <Text style={styles.quickOptionText}>Registrar quem deve e para quem</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
            <Pressable style={styles.quickOption} onPress={openAcertoDeletePickerFromFab}>
              <View style={styles.quickOptionIcon}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#c62828" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickOptionTitle}>Excluir acerto individual</Text>
                <Text style={styles.quickOptionText}>Selecione um acerto para remover</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#9ca3af" />
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={pickContaVisible} transparent animationType="slide" onRequestClose={() => setPickContaVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Selecionar conta fixa</Text>
              <Pressable style={styles.iconBtn} onPress={() => setPickContaVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>
              Toque em uma conta para editar valor e status.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {contasOperacionais.map((conta, idx) => (
                <Pressable
                  key={`pick-conta-${conta?.rowIndex || idx}`}
                  style={styles.statementRow}
                  onPress={() => {
                    setPickContaVisible(false);
                    openEditModal('contaFixa', conta, idx);
                  }}
                >
                  <Text style={[styles.label, { color: colors.text }]}>{conta?.conta || 'Conta'}</Text>
                  <Text style={[styles.value, { color: colors.text }]}>{brl(conta?.valor || 0)}</Text>
                </Pressable>
              ))}
              {!contasOperacionais.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhuma conta fixa disponivel.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={pickGastoDeleteVisible} transparent animationType="slide" onRequestClose={() => setPickGastoDeleteVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Excluir gasto coletivo</Text>
              <Pressable style={styles.iconBtn} onPress={() => setPickGastoDeleteVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>
              Toque no gasto que deseja excluir.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {(snapshot.gastosColetivos || []).map((gasto, idx) => (
                <Pressable
                  key={`pick-gasto-delete-${gasto?.rowIndex || idx}`}
                  style={styles.statementRow}
                  onPress={() => {
                    setPickGastoDeleteVisible(false);
                    onDeleteEntry('gastoColetivo', gasto, idx);
                  }}
                >
                  <Text style={[styles.label, { color: colors.text }]}>
                    {gasto?.quem || '-'} - {gasto?.oQue || gasto?.descricao || 'Sem descricao'}
                  </Text>
                  <Text style={[styles.value, { color: colors.text }]}>{brl(gasto?.quanto || gasto?.valor || 0)}</Text>
                </Pressable>
              ))}
              {!snapshot.gastosColetivos?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum gasto coletivo disponivel.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={pickAcertoDeleteVisible} transparent animationType="slide" onRequestClose={() => setPickAcertoDeleteVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Excluir acerto individual</Text>
              <Pressable style={styles.iconBtn} onPress={() => setPickAcertoDeleteVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.helper, { color: colors.muted, marginBottom: 8 }]}>
              Toque no acerto que deseja excluir.
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {(snapshot.acertosIndividuais || []).map((acerto, idx) => (
                <Pressable
                  key={`pick-acerto-delete-${acerto?.rowIndex || idx}`}
                  style={styles.statementRow}
                  onPress={() => {
                    setPickAcertoDeleteVisible(false);
                    onDeleteEntry('acertoIndividual', acerto, idx);
                  }}
                >
                  <Text style={[styles.label, { color: colors.text }]}>
                    {acerto?.quem || '-'} para {acerto?.paraQuem || '-'}
                  </Text>
                  <Text style={[styles.value, { color: colors.text }]}>{brl(acerto?.deveQuanto || acerto?.valor || 0)}</Text>
                </Pressable>
              ))}
              {!snapshot.acertosIndividuais?.length && <Text style={[styles.empty, { color: colors.muted }]}>Nenhum acerto individual disponivel.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={rentDetailVisible} transparent animationType="slide" onRequestClose={() => setRentDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Extrato do Aluguel</Text>
              <Pressable style={styles.iconBtn} onPress={() => setRentDetailVisible(false)}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.helper, { color: colors.muted, marginBottom: 6 }]}>
              {rentDetailResident?.nome || '-'} • {formatMonthReference(snapshot.mesReferencia)}
            </Text>
            <Text style={[styles.heroValue, { color: colors.text, fontSize: 24, marginTop: 0, marginBottom: 8 }]}>{brl(rentDetailResident?.total || 0)}</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {detailItems.map(([label, key]) => {
                const raw = rentDetailResident?.[key];
                const meta = getBreakdownMeta(raw, key);
                return (
                  <View key={key} style={styles.statementRow}>
                    <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
                    <Text style={[styles.value, { color: meta.color }]}>{meta.text}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 38 },
  kpiStrip: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  kpiPill: { flexGrow: 1, minWidth: '31%', borderRadius: 16, paddingVertical: 11, paddingHorizontal: 11, borderWidth: 1, borderColor: 'rgba(106,27,154,0.12)' },
  kpiPillLabel: { fontSize: 10, fontWeight: '700' },
  kpiPillValue: { fontSize: 12, fontWeight: '900', marginTop: 2 },
  heroCard: { borderRadius: 20, borderWidth: 1, padding: 15, shadowColor: '#0f172a', shadowOpacity: 0.07, shadowRadius: 11, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  highlightCard: { borderRadius: 20, borderWidth: 1.5, padding: 14, shadowColor: '#6a1b9a', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
  highlightTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
  previewSubTitle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  previewResidentCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, backgroundColor: 'rgba(106,27,154,0.03)' },
  previewAvatar: { backgroundColor: '#7e57c2' },
  previewMetaRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewHint: { fontSize: 10, fontWeight: '600' },
  previewAmountWrap: { alignItems: 'flex-end' },
  previewAmountLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  previewAmountValue: { marginTop: 1, fontSize: 14, fontWeight: '900' },
  previewFooter: { marginTop: 2, paddingTop: 10, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewFooterLabel: { fontSize: 11, fontWeight: '700' },
  previewFooterValue: { fontSize: 13, fontWeight: '900' },
  livePill: { borderRadius: 999, backgroundColor: '#f3e8ff', paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveBadge: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 },
  titleIconPill: { width: 24, height: 24, borderRadius: 999, backgroundColor: '#f3e5f5', alignItems: 'center', justifyContent: 'center' },
  heroLabel: { fontSize: 12, fontWeight: '700' },
  heroSubLabel: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  heroValue: { fontSize: 30, fontWeight: '900', marginTop: 4, marginBottom: 12, letterSpacing: -0.6 },
  heroRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metricPill: { flexGrow: 1, minWidth: '31%', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 8 },
  metricText: { fontSize: 10, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  metricBox: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 9 },
  metricBoxLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  metricBoxValue: { fontSize: 12, fontWeight: '800' },
  heroFootnote: { fontSize: 10, fontWeight: '600', marginTop: 8 },
  header: {
    margin: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#2a1d52',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  helper: { marginTop: 2, fontSize: 11, fontWeight: '500' },
  syncPill: { marginTop: 7, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncPillText: { color: '#2e7d32', fontSize: 10, fontWeight: '800' },
  themeBtn: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', gap: 6, alignItems: 'center' },
  themeBtnText: { fontSize: 12, fontWeight: '700' },
  card: { borderRadius: 20, borderWidth: 1, padding: 14 },
  sectionCard: { shadowColor: '#2a1d52', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 9, flexWrap: 'wrap' },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  sectionHint: { marginTop: 2, fontSize: 10, fontWeight: '600' },
  sectionHeadRight: { alignItems: 'flex-end', gap: 4, marginLeft: 'auto' },
  countPill: { borderRadius: 999, backgroundColor: '#efe7ff', paddingHorizontal: 9, paddingVertical: 4 },
  countPillText: { color: '#6a1b9a', fontSize: 10, fontWeight: '800' },
  total: { fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  entryRow: { alignItems: 'flex-start', gap: 10 },
  entryMain: { flex: 1, minWidth: 0 },
  entryAside: { minWidth: 96, maxWidth: 126, alignItems: 'flex-end', gap: 6 },
  entryActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  entryValue: { fontSize: 13, fontWeight: '900' },
  valueEmphasis: { fontSize: 15, letterSpacing: -0.2 },
  contaRow: { borderRadius: 12, paddingHorizontal: 10, marginBottom: 6, borderWidth: 1, borderBottomWidth: 1 },
  contaRowPaid: { backgroundColor: '#ecfdf3', borderColor: '#86efac' },
  contaRowPending: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  contaRowOverdue: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  contaRowPaidDark: { backgroundColor: '#14532d', borderColor: '#22c55e' },
  contaRowPendingDark: { backgroundColor: '#78350f', borderColor: '#f59e0b' },
  contaRowOverdueDark: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },
  label: { flex: 1, paddingRight: 8, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  value: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  fixedSplitRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 11 },
  fixedSplitLabel: { color: '#6a1b9a', fontWeight: '800' },
  fixedSplitValue: { color: '#4a148c', fontSize: 13, fontWeight: '900' },
  iconBtn: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5', marginLeft: 0, flexShrink: 0, borderWidth: 1, borderColor: 'rgba(106,27,154,0.12)' },
  iconBtnOk: { backgroundColor: '#16a34a' },
  error: { color: '#ef4444', fontWeight: '700', marginBottom: 4 },
  offlineHint: { color: '#b45309', fontWeight: '700', marginBottom: 4 },
  retryBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6a1b9a', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, marginBottom: 8 },
  retryBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rentItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  rentItemStrong: { paddingVertical: 11 },
  rentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  rentAvatarPhoto: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff' },
  rentAvatarStrong: { width: 34, height: 34, borderRadius: 17 },
  rentAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  labelStrong: { flex: 1, paddingRight: 8, fontSize: 13, fontWeight: '800' },
  valueStrong: { fontSize: 14, fontWeight: '900' },
  rentHint: { fontSize: 11, fontWeight: '600' },
  obsChip: { marginTop: 5, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  obsChipText: { fontSize: 11, fontWeight: '700', lineHeight: 15, flex: 1 },
  contaHintPaid: { color: '#166534' },
  contaHintPending: { color: '#b45309' },
  contaHintOverdue: { color: '#b91c1c' },
  contaHintPaidDark: { color: '#bbf7d0' },
  contaHintPendingDark: { color: '#fde68a' },
  contaHintOverdueDark: { color: '#fecdd3' },
  empty: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, color: '#111827', fontWeight: '600', backgroundColor: '#fff' },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 2 },
  nameChipRow: { gap: 8, paddingBottom: 8, marginBottom: 2 },
  nameChip: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  nameChipActive: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
  nameChipText: { color: '#374151', fontSize: 11, fontWeight: '800' },
  nameChipTextActive: { color: '#fff' },
  statusToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, marginBottom: 8 },
  saveBtn: { backgroundColor: '#6a1b9a', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6, shadowColor: '#6a1b9a', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  saveBtnText: { color: '#fff', fontWeight: '800' },
  statementRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  fabLeft: {
    position: 'absolute',
    left: 16,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#6a1b9a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6a1b9a',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  quickOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  quickSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24, gap: 10, borderTopWidth: 1, borderColor: 'rgba(106,27,154,0.14)' },
  quickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quickTitle: { fontSize: 16, fontWeight: '800' },
  quickSubtitle: { fontSize: 12, fontWeight: '600', marginTop: -4 },
  quickCloseBtn: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5' },
  quickOption: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(106,27,154,0.03)' },
  quickOptionIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center' },
  quickOptionTitle: { color: '#111827', fontSize: 13, fontWeight: '800' },
  quickOptionText: { color: '#6b7280', fontSize: 11, fontWeight: '600', marginTop: 2 },
});

```

## `src/screens/HomeScreen.js`

```javascript
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { addCaixinhaEntry, concluirTarefa, getApiConnectionStatus, getCaixinha, getCaixinhaStatement, getFinanceSnapshot, getTarefaSemana, subscribeApiConnectionStatus } from '../services/api';
import { AppHeader } from '../components/AppHeader';
import { useResident } from '../context/ResidentContext';
import { useNotifications } from '../context/NotificationContext';
import { formatMonthReference } from '../utils/dateLabel';
const HOME_HERO_IMAGE_URLS = [
  'https://drive.google.com/uc?export=download&id=1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ',
  'https://drive.google.com/uc?export=view&id=1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ',
  'https://drive.google.com/thumbnail?id=1GLeZgJ8o3l5Gvp8j5_W42Ld3f-puR2aQ&sz=w1600',
];
const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images || 'images';

function toNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  let normalized = raw.replace(/[^\d,.-]/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 || lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = normalized.split(thousandSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toNumber(v));
const getAvatarInitial = (value) => {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return '•';
  return cleaned.slice(0, 1).toUpperCase();
};

function formatNotificationTime(iso) {
  const dt = new Date(String(iso || ''));
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getNotificationMeta(item) {
  const type = String(item?.type || '').toLowerCase();
  if (type === 'check') return { icon: 'checkbox-marked-circle-outline', color: '#16a34a', title: 'Tarefa concluída' };
  if (type === 'rating') return { icon: 'star-circle-outline', color: '#f59e0b', title: 'Nova avaliação' };
  return { icon: 'message-reply-text-outline', color: '#0ea5e9', title: 'Nova publicação' };
}

export function HomeScreen() {
  const navigation = useNavigation();
  const { isDark } = useThemeMode();
  const { resident, selectResident, residents, getResidentPhoto } = useResident();
  const { notificationCount, notificationItems, markNotificationsAsSeen, refreshNotifications } = useNotifications();
  const colors = isDark ? darkTheme : lightTheme;
  const accent = isDark ? '#c4b5fd' : '#6a1b9a';
  const accentStrong = isDark ? '#ddd6fe' : '#4a148c';
  const accentSoftBg = isDark ? '#2a2440' : '#f3e5f5';
  const [snapshot, setSnapshot] = useState({ mesReferencia: '', residents: [] });
  const [caixinha, setCaixinha] = useState({ saldo: '0,00' });
  const [meuResumo, setMeuResumo] = useState({ aluguel: '--', mesReferencia: '' });
  const [tarefa, setTarefa] = useState({ tarefaNome: 'Sala, Corredor e Garagem' });
  const [taskDone, setTaskDone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [caixinhaModalVisible, setCaixinhaModalVisible] = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);
  const [caixinhaItems, setCaixinhaItems] = useState([]);
  const [txTipo, setTxTipo] = useState('entrada');
  const [txDescricao, setTxDescricao] = useState('');
  const [txValor, setTxValor] = useState('');
  const [txObs, setTxObs] = useState('');
  const [txSaving, setTxSaving] = useState(false);
  const [valuesVisible, setValuesVisible] = useState(true);
  const [rentDetailVisible, setRentDetailVisible] = useState(false);
  const [rentDetailResident, setRentDetailResident] = useState(null);
  const [taskPosting, setTaskPosting] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [apiStatus, setApiStatus] = useState(() => getApiConnectionStatus());

  const takeTaskProofPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita o uso da câmera para comprovar a tarefa.');
      return '';
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.25,
      allowsEditing: true,
      base64: true,
      mediaTypes: IMAGE_MEDIA_TYPES,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return '';
    return `data:image/jpeg;base64,${result.assets[0].base64}`;
  };
  const [homeHeroImageIdx, setHomeHeroImageIdx] = useState(0);

  const load = useCallback(async (mode = 'normal') => {
    if (mode === 'normal' || mode === 'pull') setRefreshing(true);
    try {
      const [finRes, cxRes, tfRes] = await Promise.allSettled([
        getFinanceSnapshot(),
        getCaixinha(),
        getTarefaSemana(resident),
      ]);

      if (finRes.status === 'fulfilled') {
        const fin = finRes.value || {};
        setSnapshot({ mesReferencia: fin.mesReferencia || '', residents: fin.residents || [] });
      }
      if (cxRes.status === 'fulfilled') {
        const cx = cxRes.value || {};
        setCaixinha({ saldo: cx.saldo || '0,00' });
      }
      if (finRes.status === 'fulfilled') {
        const fin = finRes.value || {};
        const residentRow = (fin.residents || []).find(
          (r) => String(r?.nome || '').trim().toUpperCase() === String(resident || '').trim().toUpperCase()
        );
        setMeuResumo({
          aluguel: residentRow?.total || residentRow?.aluguel || '--',
          mesReferencia: fin.mesReferencia || '',
        });
      }
      if (tfRes.status === 'fulfilled') {
        const tf = tfRes.value || {};
        setTarefa({ tarefaNome: tf.tarefaNome || 'Sala, Corredor e Garagem' });
      }

      const hasError =
        finRes.status === 'rejected' ||
        cxRes.status === 'rejected' ||
        tfRes.status === 'rejected';
      setError(
        hasError
          ? 'Alguns dados nao carregaram, mas o restante foi atualizado.'
          : ''
      );
    } catch (e) {
      setError(e?.message || 'Erro ao sincronizar dados');
    } finally {
      if (mode === 'normal' || mode === 'pull') setRefreshing(false);
    }
  }, [resident]);

  const openCaixinhaModal = async () => {
    setCaixinhaModalVisible(true);
    setStatementLoading(true);
    try {
      const data = await getCaixinhaStatement();
      setCaixinhaItems(data?.items || []);
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Nao foi possivel carregar extrato da caixinha.');
      setCaixinhaItems([]);
    } finally {
      setStatementLoading(false);
    }
  };

  const submitCaixinha = async () => {
    if (!txDescricao || !txValor) {
      Alert.alert('Campos obrigatorios', 'Preencha descricao e valor.');
      return;
    }
    setTxSaving(true);
    try {
      await addCaixinhaEntry({
        tipo: txTipo,
        descricao: txDescricao,
        valor: txValor,
        obs: txObs,
      });
      setTxDescricao('');
      setTxValor('');
      setTxObs('');
      await Promise.all([load(), openCaixinhaModal()]);
      Alert.alert('Sucesso', 'Transacao adicionada na aba Caixinha.');
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Nao foi possivel salvar a transacao.');
    } finally {
      setTxSaving(false);
    }
  };

  useEffect(() => {
    load();
  }, [resident]);

  useEffect(() => {
    refreshNotifications();
  }, [resident]);

  useEffect(() => {
    const unsubscribe = subscribeApiConnectionStatus((next) => setApiStatus(next));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load('silent');
    });
    return () => sub.remove();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load('silent');
      const timer = setInterval(() => {
        load('silent');
      }, 20000);
      return () => clearInterval(timer);
    }, [load])
  );

  const totalCasa = useMemo(
    () => (snapshot.residents || []).reduce((acc, r) => acc + toNumber(r?.total), 0),
    [snapshot.residents]
  );

  const maskValue = (value) => (valuesVisible ? brl(value) : 'R$ ••••');
  const formatBreakdownValue = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return valuesVisible ? brl(0) : 'R$ ••••';
    const hasLetters = /[A-Za-z]/.test(raw);
    if (hasLetters) return raw;
    return maskValue(value);
  };
  const getBreakdownMeta = (value, key) => {
    const raw = String(value ?? '').trim();
    if (!raw) return { text: valuesVisible ? brl(0) : 'R$ ••••', color: '#374151' };
    if (/[A-Za-z]/.test(raw)) return { text: raw, color: '#6b7280' };
    const numeric = toNumber(value);
    if (key === 'contaQuePaga') {
      if (numeric > 0) return { text: valuesVisible ? `-${brl(Math.abs(numeric))}` : 'R$ ••••', color: '#c62828' };
      if (numeric < 0) return { text: valuesVisible ? `+${brl(Math.abs(numeric))}` : 'R$ ••••', color: '#2e7d32' };
    }
    if (numeric > 0) return { text: valuesVisible ? `+${brl(Math.abs(numeric))}` : 'R$ ••••', color: '#2e7d32' };
    if (numeric < 0) return { text: valuesVisible ? `-${brl(Math.abs(numeric))}` : 'R$ ••••', color: '#c62828' };
    return { text: formatBreakdownValue(value), color: '#374151' };
  };
  const detailItems = [
    ['Aluguel base', 'aluguel'],
    ['Agua', 'agua'],
    ['Luz', 'luz'],
    ['Internet', 'net'],
    ['IPTU', 'iptu'],
    ['Sofa', 'sofa'],
    ['Drywall', 'dryWall'],
    ['Caixinha', 'caixinha'],
    ['Subtotal', 'subtotal'],
    ['Multas', 'multas'],
    ['Conta que paga', 'contaQuePaga'],
    ['Dividas', 'dividas'],
  ];

  const openRentDetail = (residentName) => {
    const found = (snapshot.residents || []).find(
      (r) => String(r?.nome || '').toUpperCase() === String(residentName || '').toUpperCase()
    );
    setRentDetailResident(
      found || {
        nome: residentName,
        total: meuResumo.aluguel,
      }
    );
    setRentDetailVisible(true);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
    >
      <AppHeader
        title="República Tocah"
        subtitle={`Morador: ${resident} • ${formatMonthReference(snapshot.mesReferencia)}`}
        notificationCount={notificationCount}
        onBellPress={async () => {
          setNotificationModalVisible(true);
          await markNotificationsAsSeen();
        }}
      />
      <View style={styles.visibilityRow}>
        <Pressable style={[styles.visibilityBtn, { backgroundColor: accentSoftBg, borderColor: isDark ? '#3d345f' : '#e1bee7' }]} onPress={() => setValuesVisible((prev) => !prev)}>
          <MaterialCommunityIcons name={valuesVisible ? 'eye-off-outline' : 'eye-outline'} size={16} color={accent} />
          <Text style={[styles.visibilityText, { color: accent }]}>{valuesVisible ? 'Ocultar valores' : 'Mostrar valores'}</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.residentRow}>
        {residents.map((name) => {
          const selected = name === resident;
          return (
            <Pressable key={name} onPress={() => selectResident(name)} style={[styles.residentChip, selected && styles.residentChipActive]}>
              <Text style={[styles.residentChipText, selected && styles.residentChipTextActive]}>{name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable style={[styles.caixinhaCard, { borderColor: '#c8e6c9' }]} onPress={openCaixinhaModal}>
        <View>
          <Text style={styles.caixinhaTitle}>Caixinha</Text>
          <Text style={styles.caixinhaHint}>Clique para ver o extrato</Text>
        </View>
        <Text style={styles.caixinhaValue}>{maskValue(caixinha.saldo)}</Text>
      </Pressable>

      <View style={[styles.heroImageCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Image
          source={{ uri: HOME_HERO_IMAGE_URLS[Math.min(homeHeroImageIdx, HOME_HERO_IMAGE_URLS.length - 1)] }}
          style={styles.heroImage}
          resizeMode="cover"
          onError={() => {
            setHomeHeroImageIdx((prev) => (prev < HOME_HERO_IMAGE_URLS.length - 1 ? prev + 1 : prev));
          }}
        />
        <View style={styles.heroImageOverlay}>
          <Text style={styles.heroImageTitle}>República Tocah do Coelho</Text>
          <Text style={styles.heroImageSubtitle}>Gente, sabe aquele momento que você já gozou tudo que cê tinha pra gozar?</Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <Pressable style={[styles.actionBox, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate('Financas')}>
          <MaterialCommunityIcons name="cash-plus" size={24} color={accent} />
          <Text style={[styles.actionText, { color: accent }]}>Lancar Gasto</Text>
        </Pressable>
        <Pressable style={[styles.actionBox, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate('Tarefas')}>
          <MaterialCommunityIcons name="calendar-month-outline" size={24} color={accent} />
          <Text style={[styles.actionText, { color: accent }]}>Escala Mes</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => Alert.alert('Regras da Casa', 'Limpe o que usar, respeite os turnos e registre gastos no mesmo dia.')}
        >
          <MaterialCommunityIcons name="book-open-page-variant-outline" size={24} color={accent} />
          <Text style={[styles.actionText, { color: accent }]}>Regras</Text>
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!apiStatus?.online && !!apiStatus?.message && <Text style={styles.offlineHint}>{apiStatus.message}</Text>}
      {!apiStatus?.online && !!apiStatus?.cachedAt && (
        <Text style={styles.offlineHint}>Ultima consulta salva: {new Date(apiStatus.cachedAt).toLocaleString('pt-BR')}</Text>
      )}
      {!!error && (
        <Pressable style={styles.retryBtn} onPress={() => load('pull')}>
          <MaterialCommunityIcons name="refresh" size={14} color="#fff" />
          <Text style={styles.retryBtnText}>Tentar novamente</Text>
        </Pressable>
      )}

      <Pressable onPress={() => openRentDetail(resident)} style={[styles.card, styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.rentTopRow}>
          <View>
            <Text style={[styles.metricLabel, { color: accent } ]}>Seu Aluguel</Text>
            <Text style={[styles.rentMonth, { color: '#7e57c2' }]}>{formatMonthReference(meuResumo.mesReferencia || snapshot.mesReferencia)}</Text>
          </View>
          <View style={styles.rentBadge}>
            <Text style={styles.rentBadgeText}>AO VIVO</Text>
          </View>
        </View>
        <Text style={[styles.metricValue, { color: accentStrong }]}>{maskValue(meuResumo.aluguel)}</Text>
        <View style={styles.rentBottomRow}>
          <View style={styles.rentChip}>
            <MaterialCommunityIcons name="account-circle-outline" size={14} color={accent} />
            <Text style={styles.rentChipText}>{resident}</Text>
          </View>
          <View style={styles.rentChip}>
            <MaterialCommunityIcons name="calendar-clock-outline" size={14} color="#d32f2f" />
            <Text style={[styles.rentChipText, { color: '#d32f2f' }]}>Vence dia 12</Text>
          </View>
        </View>
      </Pressable>

      <View style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.taskHeaderRow}>
          <View style={styles.taskTitleWrap}>
            <MaterialCommunityIcons name="calendar-check-outline" size={18} color={accent} />
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Tarefa da Semana</Text>
          </View>
          <View style={[styles.taskStatusPill, taskDone ? styles.taskStatusDone : styles.taskStatusPending]}>
            <Text style={[styles.taskStatusText, taskDone && styles.taskStatusTextDone]}>{taskDone ? 'Concluida' : 'Pendente'}</Text>
          </View>
        </View>

        <View style={styles.taskBodyRow}>
          {getResidentPhoto(resident) ? (
            <Image source={{ uri: getResidentPhoto(resident) }} style={styles.taskAvatarPhoto} />
          ) : (
            <View style={styles.taskAvatar}>
              <Text style={styles.taskAvatarText}>{getAvatarInitial(resident)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>{tarefa.tarefaNome}</Text>
            <Text style={[styles.subtitle, { color: colors.muted, marginTop: 2 }]}>Responsavel: {resident}</Text>
            <Text style={[styles.subtitle, { color: colors.muted, marginTop: 2 }]}>Varrer, tirar lixos e organizar.</Text>
          </View>
        </View>

        <Pressable
          style={[styles.taskActionBtn, taskDone && styles.taskActionBtnDone, taskPosting && { opacity: 0.75 }]}
          onPress={async () => {
            if (taskDone || taskPosting) return;
            const photoDataUrl = await takeTaskProofPhoto();
            if (!photoDataUrl) {
              Alert.alert('Comprovação obrigatória', 'Para concluir a tarefa, envie uma foto da tarefa feita.');
              return;
            }
            try {
              setTaskPosting(true);
              await concluirTarefa(tarefa.tarefaNome, resident, photoDataUrl);
              setTaskDone(true);
            } catch {
              Alert.alert('Erro', 'Não foi possível concluir a tarefa.');
            } finally {
              setTaskPosting(false);
            }
          }}
          disabled={taskPosting}
        >
          <MaterialCommunityIcons name={taskDone ? 'check-circle-outline' : 'checkbox-marked-circle-outline'} size={18} color={taskDone ? '#166534' : '#fff'} />
          <Text style={[styles.taskActionText, taskDone && styles.taskActionTextDone]}>
            {taskPosting ? 'Enviando...' : taskDone ? 'Tarefa concluída' : 'Marcar como concluída'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Prévia dos Aluguéis</Text>
        {(snapshot.residents || []).map((r) => (
          <Pressable key={r.nome} style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => openRentDetail(r.nome)}>
            <View style={styles.rowUser}>
              {getResidentPhoto(r.nome) ? (
                <Image source={{ uri: getResidentPhoto(r.nome) }} style={styles.rowAvatarPhoto} />
              ) : (
                <View style={styles.rowAvatar}>
                  <Text style={styles.rowAvatarText}>{getAvatarInitial(r.nome)}</Text>
                </View>
              )}
              <Text style={[styles.rowLabel, { color: colors.text }]}>{r.nome}</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.text }]}>{maskValue(r.total)}</Text>
          </Pressable>
        ))}
        {!snapshot.residents?.length && <Text style={[styles.subtitle, { color: colors.muted }]}>Nenhum aluguel encontrado nesta referência.</Text>}
        <View style={[styles.row, { marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }]}>
          <Text style={[styles.rowLabel, { color: colors.muted }]}>Total Casa</Text>
          <Text style={[styles.rowValue, { color: colors.primary }]}>{maskValue(totalCasa)}</Text>
        </View>
      </View>

      <Modal visible={caixinhaModalVisible} animationType="slide" transparent onRequestClose={() => setCaixinhaModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Extrato da Caixinha</Text>
              <Pressable onPress={() => setCaixinhaModalVisible(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>

            <View style={styles.segmentRow}>
              <Pressable style={[styles.segmentBtn, txTipo === 'entrada' && styles.segmentBtnActive]} onPress={() => setTxTipo('entrada')}>
                <Text style={[styles.segmentText, txTipo === 'entrada' && styles.segmentTextActive]}>Entrada</Text>
              </Pressable>
              <Pressable style={[styles.segmentBtn, txTipo === 'saida' && styles.segmentBtnActive]} onPress={() => setTxTipo('saida')}>
                <Text style={[styles.segmentText, txTipo === 'saida' && styles.segmentTextActive]}>Saida</Text>
              </Pressable>
            </View>
            <TextInput placeholder="Descrição" value={txDescricao} onChangeText={setTxDescricao} style={styles.input} placeholderTextColor="#94a3b8" />
            <TextInput placeholder="Valor (ex: 45.90)" value={txValor} onChangeText={setTxValor} style={styles.input} keyboardType="decimal-pad" placeholderTextColor="#94a3b8" />
            <TextInput placeholder="Observação (opcional)" value={txObs} onChangeText={setTxObs} style={styles.input} placeholderTextColor="#94a3b8" />
            <Pressable style={[styles.saveBtn, txSaving && { opacity: 0.7 }]} onPress={submitCaixinha} disabled={txSaving}>
              <Text style={styles.saveBtnText}>{txSaving ? 'Salvando...' : 'Adicionar transacao'}</Text>
            </Pressable>

            <Text style={[styles.metricLabel, { color: colors.muted, marginTop: 12 }]}>Últimas movimentações</Text>
            {statementLoading ? (
              <Text style={[styles.subtitle, { color: colors.muted }]}>Carregando extrato...</Text>
            ) : (
              <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ paddingBottom: 10 }}>
                {caixinhaItems.map((item, idx) => (
                  <View key={`${item.data}-${idx}`} style={styles.statementRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: colors.text }]}>{item.descricao}</Text>
                      <Text style={[styles.subtitle, { color: colors.muted }]}>{item.data} {item.obs ? `• ${item.obs}` : ''}</Text>
                    </View>
                    <Text style={[styles.rowValue, { color: item.tipo === 'saida' ? '#c62828' : '#2e7d32' }]}>{brl(item.valor)}</Text>
                  </View>
                ))}
                {!caixinhaItems.length && <Text style={[styles.subtitle, { color: colors.muted }]}>Sem transações no extrato.</Text>}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={rentDetailVisible} animationType="slide" transparent onRequestClose={() => setRentDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Extrato do Aluguel</Text>
              <Pressable onPress={() => setRentDetailVisible(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.subtitle, { color: colors.muted, marginTop: 0 }]}>
              {rentDetailResident?.nome || resident} • {formatMonthReference(snapshot.mesReferencia)}
            </Text>
            <Text style={[styles.metricValue, { color: '#4a148c', fontSize: 24 }]}>{maskValue(rentDetailResident?.total || 0)}</Text>
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {detailItems.map(([label, key]) => {
                const value = rentDetailResident?.[key];
                const meta = getBreakdownMeta(value, key);
                return (
                  <View key={key} style={styles.statementRow}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
                    <Text style={[styles.rowValue, { color: meta.color }]}>{meta.text}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={notificationModalVisible} animationType="slide" transparent onRequestClose={() => setNotificationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Notificações</Text>
              <Pressable onPress={() => setNotificationModalVisible(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#6a1b9a" />
              </Pressable>
            </View>
            <Text style={[styles.subtitle, { color: colors.muted, marginTop: 0 }]}>
              {notificationItems.filter((item) => item.isUnread).length > 0
                ? `${notificationItems.filter((item) => item.isUnread).length} nova(s) atualização(ões)`
                : 'Sem novidades não lidas agora'}
            </Text>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 8, marginTop: 8 }}>
              {notificationItems.map((item, idx) => {
                const meta = getNotificationMeta(item);
                return (
                  <View
                    key={`${item.ts}-${idx}`}
                    style={[
                      styles.statementRow,
                      item.isUnread && { backgroundColor: '#f5f3ff', borderRadius: 10, paddingHorizontal: 8 },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <MaterialCommunityIcons name={meta.icon} size={16} color={meta.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowLabel, { color: colors.text }]}>{meta.title}</Text>
                        <Text style={[styles.subtitle, { color: colors.muted, marginTop: 0 }]}>
                          {item.actor || 'Morador'} • {item.content || item.tarefa || 'Atualização da casa'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.subtitle, { color: colors.muted, marginTop: 0 }]}>{formatNotificationTime(item.ts)}</Text>
                  </View>
                );
              })}
              {!notificationItems.length && <Text style={[styles.subtitle, { color: colors.muted }]}>Nenhuma notificação disponível.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 30 },
  visibilityRow: { alignItems: 'flex-end', marginTop: -2, marginBottom: 2 },
  visibilityBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f3e5f5', borderRadius: 999, borderWidth: 1, borderColor: '#e1bee7', paddingHorizontal: 10, paddingVertical: 6 },
  visibilityText: { color: '#6a1b9a', fontSize: 11, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 20, padding: 15, shadowColor: '#2a1d52', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  metricLabel: { fontSize: 12, fontWeight: '700' },
  metricValue: { fontSize: 26, fontWeight: '900', marginTop: 4 },
  balanceCard: { backgroundColor: '#f7f1ff', borderWidth: 1.2, borderColor: '#e6dcff' },
  rentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rentMonth: { marginTop: 2, fontSize: 12, fontWeight: '600' },
  rentBadge: { backgroundColor: '#efe7ff', borderWidth: 1, borderColor: '#d1c4e9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  rentBadgeText: { color: '#6a1b9a', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  rentBottomRow: { marginTop: 8, flexDirection: 'row', gap: 8 },
  rentChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: '#ede7f6' },
  rentChipText: { color: '#6a1b9a', fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  rowUser: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  rowAvatarPhoto: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  rowAvatarText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  rowLabel: { fontSize: 13, fontWeight: '600' },
  rowValue: { fontSize: 13, fontWeight: '800' },
  caixinhaCard: { backgroundColor: '#edf9f0', borderLeftWidth: 5, borderLeftColor: '#16a34a', borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 10, marginHorizontal: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#16a34a', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  caixinhaTitle: { color: '#1b5e20', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  caixinhaHint: { color: '#4caf50', fontSize: 11, fontWeight: '600', marginTop: 3 },
  caixinhaValue: { color: '#1b5e20', fontSize: 22, fontWeight: '900' },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  heroImageCard: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroImage: { width: '100%', height: 180 },
  heroImageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroImageTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  heroImageSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 11, marginTop: 2, fontWeight: '600' },
  actionBox: { flex: 1, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5, shadowColor: '#2a1d52', shadowOpacity: 0.06, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  actionText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', textAlign: 'center', letterSpacing: 0.2 },
  taskRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  checkBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: '#adb5bd', alignItems: 'center', justifyContent: 'center' },
  taskCard: { borderWidth: 1, borderRadius: 18, padding: 14, shadowColor: '#6a1b9a', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  taskHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  taskTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  taskStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  taskStatusPending: { backgroundColor: '#fff7ed', borderColor: '#fdba74' },
  taskStatusDone: { backgroundColor: '#ecfdf3', borderColor: '#86efac' },
  taskStatusText: { color: '#b45309', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  taskStatusTextDone: { color: '#166534' },
  taskBodyRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  taskAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6a1b9a', alignItems: 'center', justifyContent: 'center' },
  taskAvatarPhoto: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff' },
  taskAvatarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  taskActionBtn: { marginTop: 12, backgroundColor: '#6a1b9a', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  taskActionBtnDone: { backgroundColor: '#dcfce7' },
  taskActionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  taskActionTextDone: { color: '#166534' },
  error: { color: '#ef4444', fontWeight: '700', marginBottom: 2 },
  offlineHint: { color: '#b45309', fontWeight: '700', marginBottom: 2 },
  retryBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6a1b9a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6 },
  retryBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  residentRow: { gap: 8, paddingBottom: 4, marginBottom: 2 },
  residentChip: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  residentChipActive: { backgroundColor: '#6a1b9a', borderColor: '#6a1b9a' },
  residentChipText: { color: '#374151', fontSize: 11, fontWeight: '800' },
  residentChipTextActive: { color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5' },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  segmentBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: '#fff' },
  segmentBtnActive: { borderColor: '#6a1b9a', backgroundColor: '#f3e5f5' },
  segmentText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  segmentTextActive: { color: '#4a148c' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, color: '#111827', fontWeight: '600' },
  saveBtn: { backgroundColor: '#6a1b9a', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800' },
  statementRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
});

```

## `src/screens/NildeScreen.js`

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { AppHeader } from '../components/AppHeader';
import { useResident } from '../context/ResidentContext';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { addTaskFeedComment } from '../services/api';

const STORAGE_KEY = '@tocah_nilde_feed_log_v2';
const NILDE_HERO_IMAGE_URLS = [
  'https://drive.google.com/uc?export=download&id=1O5j25VTPPB96BqSHmXULim99qmc2tfuH',
  'https://drive.google.com/uc?export=view&id=1O5j25VTPPB96BqSHmXULim99qmc2tfuH',
  'https://drive.google.com/thumbnail?id=1O5j25VTPPB96BqSHmXULim99qmc2tfuH&sz=w1600',
];
const SLOT_DEFS = [
  { id: 'manha_feno', label: 'Manha - Feno', icon: 'weather-sunset-up' },
  { id: 'tarde_feno', label: 'Tarde - Feno', icon: 'weather-sunny' },
  { id: 'noite_racao', label: 'Noite - Racao', icon: 'weather-night' },
];
const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images || 'images';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoDateLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + delta);
  return d;
}

function getWeekMeta(now = new Date()) {
  const monday = getMonday(now);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekId = `${isoDateLocal(monday)}_to_${isoDateLocal(sunday)}`;
  return { weekId, monday, sunday };
}

function parseWeekId(weekId = '') {
  const [start] = String(weekId).split('_to_');
  if (!start) return null;
  const [y, m, d] = start.split('-').map(Number);
  if (!y || !m || !d) return null;
  const monday = new Date(y, m - 1, d);
  if (Number.isNaN(monday.getTime())) return null;
  return { monday };
}

function buildWeekDays(weekId) {
  const parsed = parseWeekId(weekId);
  if (!parsed) return [];
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const dt = new Date(parsed.monday);
    dt.setDate(parsed.monday.getDate() + i);
    days.push({ key: isoDateLocal(dt), label: WEEK_DAYS[i] });
  }
  return days;
}

function formatCalendarDateLabel(dayKey = '') {
  const d = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  const dd = pad2(d.getDate());
  const month = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
  return `${dd} ${month}`;
}

function formatTodayTitle(dayKey = '') {
  const d = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

export function NildeScreen() {
  const { resident } = useResident();
  const { isDark } = useThemeMode();
  const colors = isDark ? darkTheme : lightTheme;
  const [refreshing, setRefreshing] = useState(false);
  const [store, setStore] = useState({});
  const [proofVisible, setProofVisible] = useState(false);
  const [proofTarget, setProofTarget] = useState(null);
  const [proofComment, setProofComment] = useState('');
  const [proofSending, setProofSending] = useState(false);
  const [nildeImageIdx, setNildeImageIdx] = useState(0);

  const { weekId } = useMemo(() => getWeekMeta(new Date()), []);
  const weekDays = useMemo(() => buildWeekDays(weekId), [weekId]);
  const today = isoDateLocal(new Date());
  const weekLog = store[weekId] || {};
  const todayLog = weekLog[today] || {};
  const totalWeekSlots = 21;

  const doneWeekCount = useMemo(() => {
    let count = 0;
    weekDays.forEach((d) => {
      const dayLog = weekLog[d.key] || {};
      SLOT_DEFS.forEach((slot) => {
        if (dayLog[slot.id]?.by) count += 1;
      });
    });
    return count;
  }, [weekDays, weekLog]);
  const progressPct = Math.round((doneWeekCount / totalWeekSlots) * 100);
  const todayDoneCount = SLOT_DEFS.filter((slot) => !!todayLog[slot.id]?.by).length;
  const fullyCompletedDays = useMemo(
    () =>
      weekDays.filter((day) => {
        const dayLog = weekLog[day.key] || {};
        return SLOT_DEFS.every((slot) => !!dayLog[slot.id]?.by);
      }).length,
    [weekDays, weekLog]
  );
  const nextPendingSlot = useMemo(() => {
    const pending = SLOT_DEFS.find((slot) => !todayLog[slot.id]?.by);
    return pending?.label || 'Todos os checks de hoje concluídos';
  }, [todayLog]);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const safe = parsed && typeof parsed === 'object' ? parsed : {};
      const filtered = Object.fromEntries(Object.entries(safe).filter(([k]) => k === weekId));
      setStore(filtered);
    } catch {
      setStore({});
    }
  }, [weekId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async (next) => {
    setStore(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const openProofFlow = (dayKey, slotId) => {
    const already = weekLog?.[dayKey]?.[slotId];
    if (already?.by) {
      Alert.alert('Já registrado', `${SLOT_DEFS.find((x) => x.id === slotId)?.label || 'Slot'} já foi marcado por ${already.by}.`);
      return;
    }
    setProofTarget({ dayKey, slotId });
    setProofComment('');
    setProofVisible(true);
  };

  const onCheckSlot = async (dayKey, slotId, comment = '', withPhoto = false) => {
    let photoDataUrl = '';
    if (withPhoto) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'Permita o uso da câmera para adicionar a foto opcional.');
        return;
      }
      const capture = await ImagePicker.launchCameraAsync({
        quality: 0.25,
        allowsEditing: true,
        base64: true,
        mediaTypes: IMAGE_MEDIA_TYPES,
      });
      if (capture.canceled || !capture.assets?.[0]?.base64) {
        Alert.alert('Sem foto', 'Você pode confirmar sem foto ou tentar novamente com foto.');
        return;
      }
      photoDataUrl = `data:image/jpeg;base64,${capture.assets[0].base64}`;
    }
    const slotLabel = SLOT_DEFS.find((s) => s.id === slotId)?.label || slotId;
    const content = comment?.trim()
      ? `Nilde • ${slotLabel} • ${comment.trim()}`
      : `Nilde • ${slotLabel} • alimentação registrada${withPhoto ? ' com foto' : ''}`;

    setProofSending(true);
    const next = {
      ...store,
      [weekId]: {
        ...weekLog,
        [dayKey]: {
          ...(weekLog[dayKey] || {}),
          [slotId]: { by: resident, at: new Date().toISOString() },
        },
      },
    };
    try {
      await addTaskFeedComment({
        actor: resident,
        content,
        target: 'NILDE',
        tarefa: slotLabel,
        photoDataUrl,
      });
      await save(next);
      setProofVisible(false);
      setProofTarget(null);
      setProofComment('');
      Alert.alert('Check registrado', withPhoto ? 'Check confirmado com foto no Feed.' : 'Check confirmado sem foto.');
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Não foi possível enviar comprovação.');
    } finally {
      setProofSending(false);
    }
  };

  const onUndoSlot = async (dayKey, slotId) => {
    const current = weekLog?.[dayKey]?.[slotId];
    if (!current?.by) return;
    if (String(current.by).toUpperCase() !== String(resident).toUpperCase()) {
      Alert.alert('Sem permissão', `Esse check foi feito por ${current.by}. Apenas quem marcou pode desfazer.`);
      return;
    }
    const dayNext = { ...(weekLog[dayKey] || {}) };
    delete dayNext[slotId];
    const next = {
      ...store,
      [weekId]: {
        ...weekLog,
        [dayKey]: dayNext,
      },
    };
    await save(next);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <AppHeader title="Nilde" subtitle="Controle Semanal de Alimentação" />

      <View style={[styles.nildePhotoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Image
          source={{ uri: NILDE_HERO_IMAGE_URLS[Math.min(nildeImageIdx, NILDE_HERO_IMAGE_URLS.length - 1)] }}
          style={styles.nildePhoto}
          resizeMode="cover"
          onError={() => {
            setNildeImageIdx((prev) => (prev < NILDE_HERO_IMAGE_URLS.length - 1 ? prev + 1 : prev));
          }}
        />
        <View style={styles.nildePhotoOverlay}>
          <Text style={styles.nildePhotoTitle}>Nilde</Text>
          <Text style={styles.nildePhotoSubtitle}>Mascote da república</Text>
        </View>
      </View>

      <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.heroHead}>
          <View style={styles.heroTitleWrap}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="rabbit" size={16} color="#7c3aed" />
            </View>
            <View style={styles.heroTitleTextWrap}>
              <Text style={[styles.title, styles.heroTitle, { color: colors.text }]}>Semana Atual</Text>
              <Text style={[styles.helper, styles.heroSubtitle, { color: colors.muted }]}>3 checks por dia • reset semanal</Text>
            </View>
          </View>
          <View style={[styles.progressBadge, { backgroundColor: isDark ? '#222438' : '#ede9fe' }]}>
            <Text style={styles.progressBadgeText}>{progressPct}%</Text>
          </View>
        </View>
        <Text style={[styles.kpi, { color: colors.primary }]}>{doneWeekCount}/{totalWeekSlots} checks concluídos</Text>
        <View style={[styles.progressTrack, { backgroundColor: isDark ? '#2b2f3f' : '#ede9fe' }]}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <View style={styles.quickStatsRow}>
          <View style={[styles.quickStatCard, { backgroundColor: isDark ? '#1f3a2f' : '#ecfdf3' }]}>
            <Text style={styles.quickStatValue}>{todayDoneCount}/3</Text>
            <Text style={styles.quickStatLabel}>Hoje</Text>
          </View>
          <View style={[styles.quickStatCard, { backgroundColor: isDark ? '#232741' : '#eef2ff' }]}>
            <Text style={styles.quickStatValue}>{fullyCompletedDays}</Text>
            <Text style={styles.quickStatLabel}>Dias 100%</Text>
          </View>
          <View style={[styles.quickStatCard, { backgroundColor: isDark ? '#3a2f1f' : '#fffbeb' }]}>
            <Text style={styles.quickStatValue}>{resident}</Text>
            <Text style={styles.quickStatLabel}>De plantão</Text>
          </View>
        </View>
        <View style={[styles.nextSlotBar, { backgroundColor: isDark ? '#2a2e3d' : '#f8fafc' }]}>
          <MaterialCommunityIcons name="clock-time-four-outline" size={14} color="#6a1b9a" />
          <Text style={[styles.nextSlotText, { color: colors.text }]}>{nextPendingSlot}</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <MaterialCommunityIcons name="calendar-today" size={14} color="#6a1b9a" />
            <Text style={[styles.title, { color: colors.text, marginBottom: 0 }]}>Hoje ({formatTodayTitle(today)})</Text>
          </View>
          <View style={[styles.todayPill, { backgroundColor: isDark ? '#1f3a2f' : '#e8f5e9' }]}>
            <Text style={styles.todayPillText}>{todayDoneCount}/3</Text>
          </View>
        </View>
        {SLOT_DEFS.map((slot) => {
          const entry = todayLog[slot.id];
          const done = !!entry?.by;
          const doneByMe = String(entry?.by || '').toUpperCase() === String(resident).toUpperCase();
          return (
            <View key={slot.id} style={[styles.slotRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <View style={styles.slotBadgeRow}>
                  <View style={[styles.slotTypeChip, slot.id.includes('feno') ? styles.slotTypeFeno : styles.slotTypeRacao]}>
                    <Text style={styles.slotTypeChipText}>{slot.id.includes('feno') ? 'FENO' : 'RACAO'}</Text>
                  </View>
                </View>
                <Text style={[styles.slotTitle, { color: colors.text }]}>{slot.label}</Text>
                <Text style={[styles.slotMeta, { color: colors.muted }]}>{done ? `Feito por ${entry.by}` : 'Pendente'}</Text>
              </View>
              <Pressable
                style={[styles.slotBtn, done ? styles.slotBtnDone : styles.slotBtnPending]}
                onPress={() => (done && doneByMe ? onUndoSlot(today, slot.id) : openProofFlow(today, slot.id))}
              >
                <MaterialCommunityIcons name={done ? 'check' : slot.icon} size={16} color="#fff" />
                <Text style={styles.slotBtnText}>{done && doneByMe ? 'Desfazer' : done ? 'Feito' : 'Marcar'}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionTitleRow}>
          <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#6a1b9a" />
          <Text style={[styles.title, { color: colors.text }]}>Visão da Semana</Text>
        </View>
        <View style={styles.calendarGrid}>
          {weekDays.map((day) => {
            const dayLog = weekLog[day.key] || {};
            const done = SLOT_DEFS.filter((slot) => !!dayLog[slot.id]?.by).length;
            const pct = Math.round((done / SLOT_DEFS.length) * 100);
            const isToday = day.key === today;
            return (
              <View
                key={day.key}
                style={[
                  styles.calendarDayCard,
                  isToday && styles.calendarDayCardToday,
                  { borderColor: isToday ? '#8b5cf6' : colors.border, backgroundColor: isDark ? '#171b25' : '#ffffff' },
                ]}
              >
                <View style={styles.calendarDayHead}>
                  <View>
                    <Text style={[styles.calendarWeekLabel, { color: colors.muted }]}>{day.label}</Text>
                    <Text style={[styles.calendarDateLabel, { color: colors.text }]}>{formatCalendarDateLabel(day.key)}</Text>
                  </View>
                  <View style={[styles.calendarPctPill, done === 3 ? styles.calendarPctPillDone : styles.calendarPctPillPending]}>
                    <Text style={styles.calendarPctText}>{pct}%</Text>
                  </View>
                </View>

                <View style={[styles.weekProgressTrack, { width: '100%', backgroundColor: isDark ? '#2b3242' : '#ede9fe' }]}>
                  <View style={[styles.weekProgressFill, { width: `${pct}%` }]} />
                </View>

                <View style={styles.calendarSlotsList}>
                  {SLOT_DEFS.map((slot) => {
                    const ok = !!dayLog[slot.id]?.by;
                    const shortLabel = slot.label.split(' - ')[0];
                    return (
                      <View key={`${day.key}-${slot.id}`} style={styles.calendarSlotRow}>
                        <MaterialCommunityIcons
                          name={ok ? 'check-circle' : 'checkbox-blank-circle-outline'}
                          size={14}
                          color={ok ? '#16a34a' : '#9ca3af'}
                        />
                        <Text style={[styles.calendarSlotText, { color: colors.text }]}>{shortLabel}</Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.calendarBottomMeta}>
                  <Text style={[styles.weekMeta, { color: colors.muted }]}>{done}/3 concluídos</Text>
                  {isToday && <Text style={styles.calendarTodayTag}>Hoje</Text>}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.nutritionHeader}>
          <View style={styles.nutritionHeaderIconWrap}>
            <MaterialCommunityIcons name="leaf-circle" size={18} color="#047857" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text, marginBottom: 1 }]}>Alimentação Ideal</Text>
            <Text style={[styles.nutritionSubtitle, { color: colors.muted }]}>Plano diário recomendado para a saúde da Nilde</Text>
          </View>
        </View>
        <View style={styles.nutritionGrid}>
          <View style={[styles.nutritionItemCard, { backgroundColor: isDark ? '#17352d' : '#ecfdf5' }]}>
            <MaterialCommunityIcons name="grass" size={15} color="#047857" />
            <Text style={[styles.nutritionItemTitle, { color: colors.text }]}>Feno livre 24h</Text>
            <Text style={[styles.nutritionItemBody, { color: colors.muted }]}>Base da dieta (80% a 90%).</Text>
          </View>
          <View style={[styles.nutritionItemCard, { backgroundColor: isDark ? '#1f333f' : '#ecfeff' }]}>
            <MaterialCommunityIcons name="food-apple-outline" size={15} color="#0e7490" />
            <Text style={[styles.nutritionItemTitle, { color: colors.text }]}>Verduras diárias</Text>
            <Text style={[styles.nutritionItemBody, { color: colors.muted }]}>Rúcula, escarola, chicória e manjericão.</Text>
          </View>
          <View style={[styles.nutritionItemCard, { backgroundColor: isDark ? '#352a18' : '#fffbeb' }]}>
            <MaterialCommunityIcons name="cup-outline" size={15} color="#b45309" />
            <Text style={[styles.nutritionItemTitle, { color: colors.text }]}>Ração controlada</Text>
            <Text style={[styles.nutritionItemBody, { color: colors.muted }]}>20g a 30g/kg por dia (adulto).</Text>
          </View>
          <View style={[styles.nutritionItemCard, { backgroundColor: isDark ? '#2d3145' : '#eef2ff' }]}>
            <MaterialCommunityIcons name="water-outline" size={15} color="#4f46e5" />
            <Text style={[styles.nutritionItemTitle, { color: colors.text }]}>Água sempre fresca</Text>
            <Text style={[styles.nutritionItemBody, { color: colors.muted }]}>Trocar e higienizar bebedouro com frequência.</Text>
          </View>
        </View>
        <View style={[styles.snackNote, { backgroundColor: isDark ? '#32291b' : '#fff7ed' }]}>
          <MaterialCommunityIcons name="carrot" size={14} color="#c2410c" />
          <Text style={[styles.snackNoteText, { color: colors.text }]}>Frutas e cenoura: apenas petisco ocasional.</Text>
        </View>
      </View>

      <View style={[styles.card, styles.warnCard, { backgroundColor: isDark ? '#341923' : '#fff1f2', borderColor: '#fecdd3' }]}>
        <View style={styles.toxicHeader}>
          <View style={styles.toxicHeaderIconWrap}>
            <MaterialCommunityIcons name="alert-octagon" size={17} color="#be123c" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: '#be123c', marginBottom: 1 }]}>Não pode comer</Text>
            <Text style={styles.toxicSubtitle}>Alimentos tóxicos ou proibidos para coelhos</Text>
          </View>
        </View>
        <View style={styles.toxicChipsWrap}>
          {[
            'Batata, mandioca, cará e inhame',
            'Cebola e alho',
            'Berinjela',
            'Feijão, milho, ervilha e grão-de-bico',
            'Pão, massas, doces e chocolate',
            'Laticínios',
            'Alface-americana e abacate',
          ].map((item) => (
            <View key={item} style={styles.toxicChip}>
              <MaterialCommunityIcons name="close-circle-outline" size={13} color="#be123c" />
              <Text style={styles.toxicChipText}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={styles.toxicFooter}>
          <MaterialCommunityIcons name="shield-alert-outline" size={14} color="#be123c" />
          <Text style={styles.toxicFooterText}>Em caso de ingestão acidental, procurar orientação veterinária imediatamente.</Text>
        </View>
      </View>

      <Modal visible={proofVisible} transparent animationType="slide" onRequestClose={() => setProofVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.title, { color: colors.text, marginBottom: 4 }]}>Comprovar alimentação</Text>
            <Text style={[styles.helper, { color: colors.muted }]}>
              {SLOT_DEFS.find((s) => s.id === proofTarget?.slotId)?.label || '-'} • foto opcional
            </Text>
            <TextInput
              value={proofComment}
              onChangeText={setProofComment}
              placeholder="Comentário opcional"
              placeholderTextColor="#94a3b8"
              style={styles.modalInput}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setProofVisible(false)} disabled={proofSending}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryConfirmBtn, proofSending && { opacity: 0.75 }]}
                onPress={() => onCheckSlot(proofTarget?.dayKey, proofTarget?.slotId, proofComment, false)}
                disabled={proofSending}
              >
                {proofSending ? <ActivityIndicator color="#4a148c" size="small" /> : <Text style={styles.secondaryConfirmBtnText}>Confirmar sem foto</Text>}
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, proofSending && { opacity: 0.75 }]}
                onPress={() => onCheckSlot(proofTarget?.dayKey, proofTarget?.slotId, proofComment, true)}
                disabled={proofSending}
              >
                {proofSending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmBtnText}>Confirmar com foto</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 26 },
  card: { borderRadius: 18, borderWidth: 1, padding: 13, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  nildePhotoCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  nildePhoto: { width: '100%', height: 180 },
  nildePhotoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  nildePhotoTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  nildePhotoSubtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 11, marginTop: 2, fontWeight: '600' },
  heroCard: { borderRadius: 20, borderWidth: 1.5, padding: 14, shadowColor: '#6a1b9a', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  heroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  heroTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  heroTitleTextWrap: { flex: 1, minWidth: 0 },
  heroTitle: { marginBottom: 0, lineHeight: 20 },
  heroSubtitle: { marginTop: 2, lineHeight: 16 },
  heroIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center' },
  progressBadge: { minWidth: 56, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  progressBadgeText: { color: '#5b21b6', fontSize: 12, fontWeight: '900' },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  helper: { fontSize: 12, fontWeight: '600' },
  kpi: { fontSize: 15, fontWeight: '900', marginTop: 10, lineHeight: 20 },
  progressTrack: { height: 8, borderRadius: 999, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#7c3aed' },
  quickStatsRow: { flexDirection: 'row', gap: 8, marginTop: 11, alignItems: 'stretch' },
  quickStatCard: { flex: 1, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', minHeight: 58 },
  quickStatValue: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'center' },
  quickStatLabel: { marginTop: 2, fontSize: 10, fontWeight: '700', color: '#6b7280', textAlign: 'center' },
  nextSlotBar: { marginTop: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextSlotText: { fontSize: 11, fontWeight: '700', flex: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  todayPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  todayPillText: { color: '#166534', fontWeight: '900', fontSize: 11 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1 },
  slotBadgeRow: { marginBottom: 3 },
  slotTypeChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  slotTypeFeno: { backgroundColor: '#dcfce7' },
  slotTypeRacao: { backgroundColor: '#fee2e2' },
  slotTypeChipText: { fontSize: 9, fontWeight: '900', color: '#374151', letterSpacing: 0.4 },
  slotTitle: { fontSize: 13, fontWeight: '800' },
  slotMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  slotBtn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  slotBtnPending: { backgroundColor: '#6a1b9a' },
  slotBtnDone: { backgroundColor: '#16a34a' },
  slotBtnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  calendarDayCard: { width: '48.6%', borderRadius: 14, borderWidth: 1, padding: 10 },
  calendarDayCardToday: { shadowColor: '#8b5cf6', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  calendarDayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarWeekLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  calendarDateLabel: { fontSize: 13, fontWeight: '900', marginTop: 1 },
  calendarPctPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  calendarPctPillDone: { backgroundColor: '#dcfce7' },
  calendarPctPillPending: { backgroundColor: '#f1f5f9' },
  calendarPctText: { fontSize: 10, fontWeight: '900', color: '#334155' },
  calendarSlotsList: { marginTop: 8, gap: 5 },
  calendarSlotRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  calendarSlotText: { fontSize: 11, fontWeight: '700' },
  calendarBottomMeta: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarTodayTag: { fontSize: 10, fontWeight: '900', color: '#6a1b9a', backgroundColor: '#f3e8ff', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  weekProgressTrack: { marginTop: 6, height: 5, borderRadius: 999, backgroundColor: '#e5e7eb', overflow: 'hidden', width: 120 },
  weekProgressFill: { height: '100%', borderRadius: 999, backgroundColor: '#7c3aed' },
  weekDot: { width: 8, height: 8, borderRadius: 4 },
  weekDotOn: { backgroundColor: '#16a34a' },
  weekDotOff: { backgroundColor: '#d1d5db' },
  weekMeta: { fontSize: 11, fontWeight: '700' },
  infoCard: { borderLeftWidth: 4, borderLeftColor: '#7c3aed' },
  warnCard: { borderLeftWidth: 4, borderLeftColor: '#e11d48' },
  nutritionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  nutritionHeaderIconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' },
  nutritionSubtitle: { fontSize: 11, fontWeight: '600' },
  nutritionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nutritionItemCard: { width: '48.7%', borderRadius: 12, padding: 10 },
  nutritionItemTitle: { marginTop: 5, fontSize: 12, fontWeight: '900' },
  nutritionItemBody: { marginTop: 3, fontSize: 10, fontWeight: '600', lineHeight: 14 },
  snackNote: { marginTop: 9, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  snackNoteText: { fontSize: 11, fontWeight: '700', flex: 1 },
  toxicHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 },
  toxicHeaderIconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ffe4e6', alignItems: 'center', justifyContent: 'center' },
  toxicSubtitle: { fontSize: 11, fontWeight: '700', color: '#be123c' },
  toxicChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toxicChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#fecdd3', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  toxicChipText: { color: '#9f1239', fontSize: 10, fontWeight: '800' },
  toxicFooter: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#fecdd3', paddingTop: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  toxicFooterText: { color: '#be123c', fontSize: 10, fontWeight: '700', flex: 1, lineHeight: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 26 },
  modalInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, marginBottom: 12, color: '#111827', fontWeight: '600', minHeight: 60, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'column', gap: 8 },
  cancelBtn: { borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', paddingVertical: 11, alignItems: 'center', backgroundColor: '#fff' },
  cancelBtnText: { color: '#6b7280', fontWeight: '700' },
  secondaryConfirmBtn: { borderRadius: 10, borderWidth: 1, borderColor: '#d8b4fe', paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e8ff' },
  secondaryConfirmBtnText: { color: '#4a148c', fontWeight: '800' },
  confirmBtn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6a1b9a' },
  confirmBtnText: { color: '#fff', fontWeight: '800' },
});

```

## `src/screens/TasksScreen.js`

```javascript
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { concluirTarefa, getApiConnectionStatus, getEscalaSemana, getTaskRatings, rateTask, subscribeApiConnectionStatus } from '../services/api';
import { useThemeMode } from '../context/ThemeContext';
import { darkTheme, lightTheme } from '../constants/theme';
import { AppHeader } from '../components/AppHeader';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useResident } from '../context/ResidentContext';
const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images || 'images';
const getAvatarInitial = (value) => {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return '•';
  return cleaned.slice(0, 1).toUpperCase();
};

export function TasksScreen() {
  const { isDark } = useThemeMode();
  const { resident, getResidentPhoto } = useResident();
  const colors = isDark ? darkTheme : lightTheme;
  const [escala, setEscala] = useState([]);
  const [checked, setChecked] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState({});
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [nota, setNota] = useState(5);
  const [comentario, setComentario] = useState('');
  const [categoriaNota, setCategoriaNota] = useState('casa');
  const [ratingSaving, setRatingSaving] = useState(false);
  const [apiStatus, setApiStatus] = useState(() => getApiConnectionStatus());
  const completedCount = Object.values(checked).filter(Boolean).length;
  const hasBanheirao = (taskName) => String(taskName || '').toLowerCase().includes('banheir');
  const takeTaskProofPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Permita o uso da câmera para comprovar a tarefa.');
      return '';
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.25,
      allowsEditing: true,
      base64: true,
      mediaTypes: IMAGE_MEDIA_TYPES,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return '';
    return `data:image/jpeg;base64,${result.assets[0].base64}`;
  };

  const load = useCallback(async (mode = 'normal') => {
    if (mode === 'pull') setRefreshing(true);
    else if (mode === 'normal') setLoading(true);
    try {
      const [escalaRes, ratingsRes] = await Promise.allSettled([
        getEscalaSemana(),
        getTaskRatings(),
      ]);

      if (escalaRes.status === 'fulfilled') {
        setEscala(Array.isArray(escalaRes.value) ? escalaRes.value : []);
      } else {
        setEscala([]);
      }

      setRatings(ratingsRes.status === 'fulfilled' ? (ratingsRes.value?.ratings || {}) : {});

      const hardFail = escalaRes.status === 'rejected';
      const partialFail = ratingsRes.status === 'rejected';
      setError(hardFail ? 'Nao foi possivel carregar tarefas.' : partialFail ? 'Parte social indisponivel no momento.' : '');
    } catch (e) {
      setError(e?.message || 'Nao foi possivel carregar tarefas.');
    } finally {
      if (mode === 'normal') setLoading(false);
      if (mode === 'pull') setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeApiConnectionStatus((next) => setApiStatus(next));
    return unsubscribe;
  }, []);

  useFocusEffect(
    useCallback(() => {
      load('silent');
      const timer = setInterval(() => {
        load('silent');
      }, 20000);
      return () => clearInterval(timer);
    }, [load])
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={colors.primary} />}
    >
      <AppHeader title="Tarefas" subtitle={`Feed semanal • ${resident}`} />
      <View style={[styles.card, { backgroundColor: '#fff8e1', borderColor: '#ffe0b2', borderLeftWidth: 5, borderLeftColor: '#ff9800' }]}>
        <Text style={[styles.title, { color: '#e65100' }]}>Mascote Nilde (Diário)</Text>
        <Text style={[styles.text, { color: '#5f4339' }]}>Feno à vontade, água fresca e check diário de alimentação.</Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.title, { color: colors.text }]}>Tarefas da Semana</Text>
          <View style={[styles.progressPill, { backgroundColor: isDark ? '#1b4332' : '#e8f5e9' }]}>
            <Text style={[styles.progressText, { color: '#2e7d32' }]}>{completedCount} feitas</Text>
          </View>
        </View>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
        {!!error && !loading && <Text style={[styles.error, { color: '#ef4444' }]}>{error}</Text>}
        {!apiStatus?.online && !!apiStatus?.message && !loading && <Text style={[styles.error, { color: '#b45309' }]}>{apiStatus.message}</Text>}
        {!apiStatus?.online && !!apiStatus?.cachedAt && !loading && (
          <Text style={[styles.error, { color: '#b45309' }]}>Ultima consulta salva: {new Date(apiStatus.cachedAt).toLocaleString('pt-BR')}</Text>
        )}
        {!loading && escala.map((item, idx) => {
          const done = !!checked[idx];
          const stat = ratings[item.nome] || {};
          const casaStat = stat?.casa || { media: 0, total: 0 };
          const banheiraoStat = stat?.banheirao || { media: 0, total: 0 };
          return (
            <View key={`${item.nome}-${idx}`} style={[styles.item, { backgroundColor: isDark ? '#1f2430' : '#fafafa' }, done && styles.itemDone]}>
              {getResidentPhoto(item.nome) ? (
                <Image source={{ uri: getResidentPhoto(item.nome) }} style={[styles.avatarPhoto, done && styles.avatarDone]} />
              ) : (
                <View style={[styles.avatar, done && styles.avatarDone]}>
                  <Text style={styles.avatarText}>{getAvatarInitial(item.nome)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.text }]}>{item.nome}</Text>
                <Text style={[styles.itemTask, { color: colors.muted }]}>{item.tarefa}</Text>
                <Text style={[styles.ratingText, { color: colors.muted }]}>
                  Nota casa: {casaStat.total ? `${casaStat.media.toFixed(1)} (${casaStat.total}/4)` : 'sem avaliacoes'}
                </Text>
                {hasBanheirao(item.tarefa) && (
                  <Text style={[styles.ratingText, { color: '#7e57c2' }]}>
                    Nota banheirao: {banheiraoStat.total ? `${banheiraoStat.media.toFixed(1)} (${banheiraoStat.total}/4)` : 'sem avaliacoes'}
                  </Text>
                )}
              </View>
              <Pressable
                style={[styles.check, done && { backgroundColor: '#00c853', borderColor: '#00c853' }]}
                onPress={async () => {
                  if (done) {
                    setChecked((prev) => ({ ...prev, [idx]: false }));
                    return;
                  }
                  const photoDataUrl = await takeTaskProofPhoto();
                  if (!photoDataUrl) {
                    Alert.alert('Comprovacao obrigatoria', 'Para concluir a tarefa, envie uma foto da tarefa feita.');
                    return;
                  }
                  try {
                    await concluirTarefa(item.tarefa, resident, photoDataUrl);
                    setChecked((prev) => ({ ...prev, [idx]: true }));
                    await load('pull');
                  } catch (e) {
                    Alert.alert('Erro', e?.message || 'Nao foi possivel concluir a tarefa.');
                  }
                }}
              >
                <MaterialCommunityIcons name={done ? 'check' : 'checkbox-blank-outline'} size={17} color={done ? '#fff' : '#6b7280'} />
              </Pressable>
              <Pressable
                style={styles.rateBtn}
                onPress={() => {
                  if (String(item.nome).toUpperCase() === String(resident).toUpperCase()) {
                    Alert.alert('Aviso', 'Voce nao pode avaliar sua propria tarefa.');
                    return;
                  }
                  setSelectedTask(item);
                  setNota(5);
                  setComentario('');
                  setCategoriaNota('casa');
                  setRateModalVisible(true);
                }}
              >
                <MaterialCommunityIcons name="star-outline" size={16} color="#6a1b9a" />
              </Pressable>
            </View>
          );
        })}
        {!loading && !escala.length && <Text style={[styles.text, { color: colors.muted }]}>Sem dados de escala no momento.</Text>}
      </View>

      <Modal visible={rateModalVisible} transparent animationType="slide" onRequestClose={() => setRateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.title, { color: colors.text, marginBottom: 4 }]}>Avaliar tarefa</Text>
            <Text style={[styles.text, { color: colors.muted, marginBottom: 10 }]}>
              {selectedTask?.nome} • {selectedTask?.tarefa}
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setNota(n)}>
                  <MaterialCommunityIcons name={nota >= n ? 'star' : 'star-outline'} size={28} color={nota >= n ? '#ffb300' : '#b0b7c3'} />
                </Pressable>
              ))}
            </View>
            {hasBanheirao(selectedTask?.tarefa) && (
              <View style={styles.categoryRow}>
                <Pressable style={[styles.categoryBtn, categoriaNota === 'casa' && styles.categoryBtnActive]} onPress={() => setCategoriaNota('casa')}>
                  <Text style={[styles.categoryBtnText, categoriaNota === 'casa' && styles.categoryBtnTextActive]}>Tarefa da casa</Text>
                </Pressable>
                <Pressable style={[styles.categoryBtn, categoriaNota === 'banheirao' && styles.categoryBtnActive]} onPress={() => setCategoriaNota('banheirao')}>
                  <Text style={[styles.categoryBtnText, categoriaNota === 'banheirao' && styles.categoryBtnTextActive]}>Banheirao</Text>
                </Pressable>
              </View>
            )}
            <TextInput
              value={comentario}
              onChangeText={setComentario}
              placeholder="Comentário opcional"
              placeholderTextColor="#94a3b8"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setRateModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, ratingSaving && { opacity: 0.75 }]}
                onPress={async () => {
                  if (ratingSaving) return;
                  try {
                    setRatingSaving(true);
                    await rateTask({
                      actor: resident,
                      target: selectedTask?.nome,
                      tarefa: selectedTask?.tarefa,
                      nota,
                      comentario,
                      categoria: categoriaNota,
                    });
                    setRateModalVisible(false);
                    await load('pull');
                    Alert.alert('Sucesso', 'Avaliacao registrada para a semana.');
                  } catch (e) {
                    Alert.alert('Erro', e?.message || 'Nao foi possivel avaliar.');
                  } finally {
                    setRatingSaving(false);
                  }
                }}
                disabled={ratingSaving}
              >
                <Text style={styles.confirmBtnText}>{ratingSaving ? 'Enviando...' : 'Enviar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 8, gap: 12, paddingBottom: 30 },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, shadowColor: '#2a1d52', shadowOpacity: 0.08, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 7 },
  text: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  item: { borderRadius: 16, padding: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftWidth: 4, borderLeftColor: '#6a1b9a', borderWidth: 1, borderColor: 'rgba(106,27,154,0.08)' },
  itemDone: { borderLeftColor: '#00c853', backgroundColor: '#f1f8e9' },
  check: { width: 32, height: 32, borderRadius: 10, borderWidth: 2, borderColor: '#b0b7c3', alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 14, fontWeight: '800' },
  itemTask: { fontSize: 12, marginTop: 3, fontWeight: '600' },
  ratingText: { fontSize: 11, marginTop: 3, fontWeight: '600' },
  loadingWrap: { paddingVertical: 12, alignItems: 'center' },
  error: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  progressPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(46,125,50,0.25)' },
  progressText: { fontSize: 11, fontWeight: '800' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6a1b9a' },
  avatarPhoto: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff' },
  avatarDone: { backgroundColor: '#00c853' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  rateBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3e5f5', borderWidth: 1, borderColor: '#e9d5ff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 28 },
  starsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 10 },
  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  categoryBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: '#fff' },
  categoryBtnActive: { borderColor: '#6a1b9a', backgroundColor: '#f3e5f5' },
  categoryBtnText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  categoryBtnTextActive: { color: '#4a148c' },
  modalInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, color: '#111827', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', paddingVertical: 11, alignItems: 'center', backgroundColor: '#fff' },
  cancelBtnText: { color: '#6b7280', fontWeight: '700' },
  confirmBtn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', backgroundColor: '#6a1b9a' },
  confirmBtnText: { color: '#fff', fontWeight: '800' },
});

```

## `src/services/api.js`

```javascript
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const hostFromExpo =
  String(Constants?.expoConfig?.hostUri || Constants?.manifest2?.extra?.expoGo?.debuggerHost || '')
    .split(':')[0]
    .trim();
const hostFromManifest =
  String(Constants?.manifest?.debuggerHost || Constants?.manifest?.hostUri || '')
    .split(':')[0]
    .trim();
const hostFromScriptUrl = String(NativeModules?.SourceCode?.scriptURL || '')
  .replace('http://', '')
  .replace('https://', '')
  .split('/')[0]
  .split(':')[0]
  .trim();
const webOrigin =
  typeof window !== 'undefined' && window?.location?.origin
    ? String(window.location.origin).trim()
    : '';
/** Prévia estática em 127.0.0.1/localhost: usa /api no mesmo host (proxy em scripts/web-preview.cjs), mesmo com EXPO_PUBLIC_API_URL de produção no bundle. */
const isLoopbackWeb =
  typeof window !== 'undefined' &&
  (window.location?.hostname === '127.0.0.1' || window.location?.hostname === 'localhost');
const loopbackSameOriginApi = isLoopbackWeb && webOrigin ? `${webOrigin}/api` : '';
const FALLBACK_REMOTE_API = 'https://tocah-do-coelho-app.onrender.com/api';

function normalizeApiBase(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

const API_URL =
  loopbackSameOriginApi ||
  normalizeApiBase(process.env.EXPO_PUBLIC_API_URL) ||
  (webOrigin ? `${webOrigin}/api` : '') ||
  FALLBACK_REMOTE_API ||
  (hostFromExpo ? `http://${hostFromExpo}:4000/api` : '') ||
  'http://localhost:4000/api';

function isValidHost(raw = '') {
  const host = String(raw || '').trim();
  if (!host) return false;
  if (host === 'localhost') return true;
  const ipv4 = host.match(/^(\d{1,3})(\.\d{1,3}){3}$/);
  if (!ipv4) return false;
  return host.split('.').every((part) => {
    const n = Number(part);
    return Number.isFinite(n) && n >= 0 && n <= 255;
  });
}

const API_BASE_CANDIDATES = Array.from(
  new Set(
    [
      loopbackSameOriginApi,
      normalizeApiBase(process.env.EXPO_PUBLIC_API_URL),
      FALLBACK_REMOTE_API,
      webOrigin ? `${webOrigin}/api` : '',
      isValidHost(hostFromExpo) ? `http://${hostFromExpo}:4000/api` : '',
      isValidHost(hostFromManifest) ? `http://${hostFromManifest}:4000/api` : '',
      isValidHost(hostFromScriptUrl) ? `http://${hostFromScriptUrl}:4000/api` : '',
      'http://localhost:4000/api',
    ].map((base) => normalizeApiBase(base)).filter(Boolean)
  )
);

let preferredApiBase = API_URL;
const CACHE_KEY_PREFIX = '@tocah_api_cache:';
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24; // 24h
let connectionStatus = {
  online: true,
  source: 'network',
  message: '',
  cachedAt: '',
  apiBase: API_URL,
  updatedAt: '',
};
const connectionListeners = new Set();

function notifyConnectionStatus() {
  connectionListeners.forEach((listener) => {
    try {
      listener(connectionStatus);
    } catch {
      // Ignore listener errors to keep network flow stable.
    }
  });
}

function updateConnectionStatus(next = {}) {
  connectionStatus = {
    ...connectionStatus,
    ...next,
    updatedAt: new Date().toISOString(),
  };
  notifyConnectionStatus();
}

export function getApiConnectionStatus() {
  return { ...connectionStatus };
}

export function subscribeApiConnectionStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  connectionListeners.add(listener);
  listener({ ...connectionStatus });
  return () => {
    connectionListeners.delete(listener);
  };
}

function buildCacheKey(url) {
  try {
    const parsed = new URL(String(url || ''));
    return `${CACHE_KEY_PREFIX}${parsed.pathname}${parsed.search}`;
  } catch {
    return `${CACHE_KEY_PREFIX}${String(url || '').trim()}`;
  }
}

/** YYYY-MM no fuso da república — muda na virada do mês e evita reusar cache do AsyncStorage com aba antiga. */
function financeMonthRefQuery() {
  try {
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const ym = String(ymd || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) return `refYm=${encodeURIComponent(ym)}`;
  } catch {
    // ignore
  }
  const d = new Date();
  return `refYm=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function readCachedPayload(url) {
  try {
    const raw = await AsyncStorage.getItem(buildCacheKey(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || typeof parsed?.payload === 'undefined') return null;
    const ageMs = Date.now() - new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_CACHE_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveCachedPayload(url, payload) {
  try {
    await AsyncStorage.setItem(
      buildCacheKey(url),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        payload,
      })
    );
  } catch {
    // Cache failure should not block app usage.
  }
}

export function getApiDebugInfo() {
  return {
    preferredApiBase,
    candidates: API_BASE_CANDIDATES,
    envApiUrl: process.env.EXPO_PUBLIC_API_URL || '',
    hostFromExpo,
    hostFromManifest,
    hostFromScriptUrl,
  };
}

export function setPreferredApiBase(nextBase) {
  if (nextBase) preferredApiBase = normalizeApiBase(nextBase);
}

function mapUrlToBase(url, base) {
  if (url.startsWith(API_URL)) return url.replace(API_URL, base);
  if (url.startsWith(preferredApiBase)) return url.replace(preferredApiBase, base);
  return url;
}

function toHealthUrl(base) {
  const trimmed = String(base || '').replace(/\/+$/, '');
  return `${trimmed.replace(/\/api$/, '')}/health`;
}

async function fetchJson(url, init) {
  const controller = new AbortController();
  const method = String(init?.method || 'GET').toUpperCase();
  const bodyLength = typeof init?.body === 'string' ? init.body.length : 0;
  const timeoutMs = method === 'POST'
    ? (bodyLength > 200000 ? 35000 : 18000)
    : 18000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...(init || {}), signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Tempo esgotado ao conectar com a API em ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Resposta invalida da API em ${url}`);
  }
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.message || `Falha ao buscar dados em ${url}`);
  }
  return data;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url) {
  const candidates = [preferredApiBase, ...API_BASE_CANDIDATES.filter((b) => b !== preferredApiBase)];
  let lastError = null;
  for (const base of candidates) {
    const candidateUrl = mapUrlToBase(url, base);
    try {
      const data = await fetchJson(candidateUrl);
      preferredApiBase = base;
      updateConnectionStatus({
        online: true,
        source: 'network',
        message: '',
        cachedAt: '',
        apiBase: base,
      });
      await saveCachedPayload(url, data);
      return data;
    } catch (error) {
      lastError = error;
      const transient = /Tempo esgotado|Network request failed|Failed to fetch/i.test(String(error?.message || ''));
      if (transient) {
        try {
          await sleep(1200);
          const retryData = await fetchJson(candidateUrl);
          preferredApiBase = base;
          updateConnectionStatus({
            online: true,
            source: 'network',
            message: '',
            cachedAt: '',
            apiBase: base,
          });
          await saveCachedPayload(url, retryData);
          return retryData;
        } catch (retryError) {
          lastError = retryError;
        }
      }
    }
  }
  const cached = await readCachedPayload(url);
  if (cached) {
    updateConnectionStatus({
      online: false,
      source: 'cache',
      message: 'API indisponivel. Exibindo ultima consulta salva.',
      cachedAt: cached.savedAt,
      apiBase: preferredApiBase,
    });
    return cached.payload;
  }
  updateConnectionStatus({
    online: false,
    source: 'offline',
    message: 'Sem conexao com API/planilha no momento.',
    cachedAt: '',
    apiBase: preferredApiBase,
  });
  if (String(lastError?.message || '').includes('Network request failed')) {
    throw new Error(`Sem conexao com a API (${preferredApiBase}). Verifique backend e IP local.`);
  }
  throw lastError || new Error('Falha ao buscar dados da API.');
}

async function postJson(body) {
  const candidates = [preferredApiBase, ...API_BASE_CANDIDATES.filter((b) => b !== preferredApiBase)];
  let lastError = null;
  for (const base of candidates) {
    try {
      const data = await fetchJson(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      preferredApiBase = base;
      updateConnectionStatus({
        online: true,
        source: 'network',
        message: '',
        cachedAt: '',
        apiBase: base,
      });
      return data;
    } catch (error) {
      lastError = error;
      const transient = /Tempo esgotado|Network request failed|Failed to fetch/i.test(String(error?.message || ''));
      if (transient) {
        try {
          await sleep(1200);
          const retryData = await fetchJson(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          preferredApiBase = base;
          updateConnectionStatus({
            online: true,
            source: 'network',
            message: '',
            cachedAt: '',
            apiBase: base,
          });
          return retryData;
        } catch (retryError) {
          lastError = retryError;
        }
      }
    }
  }
  updateConnectionStatus({
    online: false,
    source: 'offline',
    message: 'Sem conexao com API/planilha no momento.',
    cachedAt: '',
    apiBase: preferredApiBase,
  });
  if (String(lastError?.message || '').includes('Network request failed')) {
    throw new Error(`Sem conexao com a API (${preferredApiBase}). Verifique backend e IP local.`);
  }
  throw lastError || new Error('Falha na requisicao.');
}

function normalizeEntryType(entryType = '') {
  const raw = String(entryType || '').trim();
  const map = {
    contaFixa: 'conta_fixa',
    gastoColetivo: 'gasto_coletivo',
    acertoIndividual: 'acerto_individual',
    conta_fixa: 'conta_fixa',
    gasto_coletivo: 'gasto_coletivo',
    acerto_individual: 'acerto_individual',
  };
  return map[raw] || raw;
}

function toSheetBool(value) {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'TRUE' ? 'TRUE' : 'FALSE';
}

export async function getFinanceSnapshot() {
  return requestJson(`${API_URL}?action=getFinanceSnapshot&${financeMonthRefQuery()}`);
}

export async function getApiHealth() {
  const candidates = [preferredApiBase, ...API_BASE_CANDIDATES.filter((b) => b !== preferredApiBase)];
  let lastError = null;
  for (const base of candidates) {
    try {
      const data = await fetchJson(toHealthUrl(base));
      preferredApiBase = base;
      const sheetsOk = data?.sheets?.ok !== false;
      updateConnectionStatus({
        online: Boolean(data?.ok) && sheetsOk,
        source: sheetsOk ? 'network' : 'degraded',
        message: sheetsOk ? '' : (data?.sheets?.message || 'API online, mas sem conexao com a planilha.'),
        cachedAt: '',
        apiBase: base,
      });
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  updateConnectionStatus({
    online: false,
    source: 'offline',
    message: 'API indisponivel. Sem validacao de conexao com planilha.',
    cachedAt: '',
    apiBase: preferredApiBase,
  });
  throw lastError || new Error('Falha ao verificar saude da API.');
}

export async function addFinanceEntry({ entryType, usuario, payload }) {
  return postJson({ action: 'addFinanceEntry', entryType: normalizeEntryType(entryType), usuario, payload });
}

export async function updateFinanceEntry({ entryType, rowIndex, payload }) {
  return postJson({ action: 'updateFinanceEntry', entryType: normalizeEntryType(entryType), rowIndex, payload });
}

export async function deleteFinanceEntry({ entryType, rowIndex, match = {} }) {
  return postJson({ action: 'deleteFinanceEntry', entryType: normalizeEntryType(entryType), rowIndex, match });
}

export async function toggleContaStatus({ rowIndex, status }) {
  return postJson({ action: 'toggleContaStatus', rowIndex, status: toSheetBool(status) });
}

export async function getDados(usuario = 'GUILHERME') {
  return requestJson(
    `${API_URL}?action=getDados&usuario=${encodeURIComponent(usuario)}&${financeMonthRefQuery()}`
  );
}

export async function getCaixinha() {
  return requestJson(`${API_URL}?action=getCaixinha`);
}

export async function getCaixinhaStatement() {
  return requestJson(`${API_URL}?action=getCaixinhaStatement`);
}

export async function getTarefaSemana(usuario = 'GUILHERME') {
  return requestJson(`${API_URL}?action=getTarefaSemana&usuario=${encodeURIComponent(usuario)}`);
}

export async function getEscalaSemana() {
  return requestJson(`${API_URL}?action=getEscalaSemana`);
}

export async function getTaskRatings() {
  return requestJson(`${API_URL}?action=getTaskRatings`);
}

export async function getTaskFeed() {
  return requestJson(`${API_URL}?action=getTaskFeed`);
}

export async function concluirTarefa(tarefaNome, usuario = 'GUILHERME', photoDataUrl = '') {
  return postJson({ action: 'concluirTarefa', tarefaNome, usuario, photoDataUrl });
}

export async function triggerAdminAction(action, usuario = 'ADMIN') {
  return postJson({ action, usuario });
}

export async function addCaixinhaEntry({ tipo, descricao, valor, obs = '' }) {
  return postJson({ action: 'addCaixinhaEntry', tipo, descricao, valor, obs });
}

export async function rateTask({ actor, target, tarefa, nota, comentario = '', categoria = 'casa' }) {
  return postJson({ action: 'rateTask', actor, target, tarefa, nota, comentario, categoria });
}

export async function addTaskFeedComment({ actor, content, target = '', tarefa = '', photoDataUrl = '', parentTs = '', parentActor = '' }) {
  return postJson({ action: 'addTaskFeedComment', actor, content, target, tarefa, photoDataUrl, parentTs, parentActor });
}

export async function deleteTaskFeedPost({ rowIndex, ts = '', actor, postActor = '', postContent = '', postType = '' }) {
  return postJson({ action: 'deleteTaskFeedPost', rowIndex, ts, actor, postActor, postContent, postType });
}

```

## `src/utils/dateLabel.js`

```javascript
const MONTH_MAP = {
  JAN: 'Janeiro',
  FEV: 'Fevereiro',
  MAR: 'Marco',
  ABR: 'Abril',
  MAI: 'Maio',
  JUN: 'Junho',
  JUL: 'Julho',
  AGO: 'Agosto',
  SET: 'Setembro',
  OUT: 'Outubro',
  NOV: 'Novembro',
  DEZ: 'Dezembro',
};

export function formatMonthReference(value) {
  const raw = String(value || '').trim().toUpperCase();
  const match = raw.match(/^([A-Z]{3})_(\d{4})$/);
  if (!match) return value || 'Mes atual';
  const month = MONTH_MAP[match[1]] || match[1];
  return `${month} ${match[2]}`;
}

```

