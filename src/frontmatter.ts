/**
 * Lê o bloco YAML entre "---" no início de um .md e devolve as chaves de primeiro nível.
 *
 * É um leitor mínimo, suficiente para `name:` e `description:` de skills, agentes e comandos:
 * - valores simples, com ou sem aspas;
 * - blocos ">" / ">-" (dobrados em uma linha) e "|" (mantêm quebras);
 * - chaves indentadas (ex.: dentro de `metadata:`) são ignoradas.
 */
export function lerFrontmatter(texto: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto.replace(/^﻿/, ''));
  if (!m) {
    return {};
  }
  const linhas = m[1].split(/\r?\n/);
  const saida: Record<string, string> = {};
  for (let i = 0; i < linhas.length; i++) {
    const r = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(linhas[i]);
    if (!r) {
      continue;
    }
    const chave = r[1];
    let valor = r[2].trim();
    if (/^[>|][+-]?$/.test(valor)) {
      const bloco: string[] = [];
      while (i + 1 < linhas.length && (/^\s+\S/.test(linhas[i + 1]) || linhas[i + 1].trim() === '')) {
        bloco.push(linhas[++i].trim());
      }
      valor = valor.startsWith('>') ? bloco.filter(Boolean).join(' ') : bloco.join('\n').trim();
    }
    saida[chave] = tirarAspas(valor);
  }
  return saida;
}

function tirarAspas(v: string): string {
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}
