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
