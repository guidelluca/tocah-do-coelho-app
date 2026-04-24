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
