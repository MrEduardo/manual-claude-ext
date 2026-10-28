import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Locais onde o Claude Code guarda a configuração do usuário. */
export const HOME = os.homedir();
export const DIR_CLAUDE = path.join(HOME, '.claude');
export const ARQ_CLAUDE_JSON = path.join(HOME, '.claude.json');
export const ARQ_PLUGINS = path.join(DIR_CLAUDE, 'plugins', 'installed_plugins.json');

/** Descrições curtas editáveis por você (criado na primeira verificação). */
export const ARQ_DESCRICOES = path.join(DIR_CLAUDE, 'manual-descricoes.json');

/** Troca o "~" inicial pela pasta do usuário. */
export function expandirTil(p: string): string {
  return p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? path.join(HOME, p.slice(1)) : p;
}

/**
 * Lê um arquivo .env simples (CHAVE=valor, # comentários) para process.env.
 * Não sobrescreve variáveis que já existem no ambiente. Arquivo ausente = nada acontece.
 */
export function carregarEnv(arquivo: string, ambiente: NodeJS.ProcessEnv = process.env): void {
  if (!existe(arquivo)) {
    return;
  }
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m || linha.trim().startsWith('#')) {
      continue;
    }
    const valor = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (valor && ambiente[m[1]] === undefined) {
      ambiente[m[1]] = valor;
    }
  }
}

export function existe(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
