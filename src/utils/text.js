export function norm(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

export function sameName(a, b) {
  return !!norm(a) && norm(a) === norm(b);
}

export function initial(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() : '?';
}

/** "GUILHERME" -> "Guilherme" */
export function displayName(value) {
  const s = String(value || '').trim().toLowerCase();
  return s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export function makeRequestId() {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Remove os textos automáticos da obs (Divisão:..., tag #g...) para mostrar/editar só o que o morador escreveu. */
export function userObs(obs) {
  return String(obs || '')
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p && !/^divisao\s*:/i.test(norm(p)) && !/^emprestimo dividido\s*:/i.test(norm(p)) && !/^↳/.test(p))
    .map((p) => p.replace(/#g[a-z0-9]{4,8}\+?/gi, '').trim())
    .filter(Boolean)
    .join(' | ');
}

export function autoObs(obs) {
  return String(obs || '')
    .split('|')
    .map((p) => p.trim())
    .filter((p) => /^divisao\s*:/i.test(norm(p)) || /^emprestimo dividido\s*:/i.test(norm(p)) || /^↳/.test(p))
    .map((p) => p.replace(/#g[a-z0-9]{4,8}\+?/gi, '').trim())
    .join(' · ');
}

export function isLinkedToCollective(obs) {
  return /#g[a-z0-9]{4,8}/i.test(String(obs || ''));
}
