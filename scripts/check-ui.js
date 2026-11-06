#!/usr/bin/env node
/**
 * Garante as regras de UI do Tocah:
 *  - nenhuma cor literal fora de src/theme/tokens.js (dark mode sempre correto)
 *  - nenhum Alert.alert (não funciona no web)
 * Uso: npm run check:ui
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const allowed = new Set([path.join(root, 'theme', 'tokens.js')]);
const problems = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx)$/.test(entry.name)) check(full);
  }
}

function check(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const where = `${path.relative(path.join(root, '..'), file)}:${i + 1}`;
    if (!allowed.has(file) && /['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(/.test(line)) problems.push(`${where}  cor fora dos tokens: ${line.trim()}`);
    if (/Alert\.alert\s*\(/.test(line)) problems.push(`${where}  Alert.alert não funciona no web: use useFeedback()`);
  });
}

walk(root);
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problema(s).`);
  process.exit(1);
}
console.log('UI ok: sem cores fora dos tokens e sem Alert.alert.');
