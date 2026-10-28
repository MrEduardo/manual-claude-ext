import * as fs from 'fs';
import * as path from 'path';
import { ARQ_CLAUDE_JSON, existe } from '../caminhos';
import { juntar, mensagemDeErro, Recurso } from '../tipos';
import { itemErro } from './comum';

const CATEGORIA = 'Servidores MCP';

/** Prefixo das ferramentas que o Claude vê (ex.: mcp__mcp-exemplo__*). */
export function nomeFerramentas(nome: string): string {
  return `mcp__${nome.replace(/[^A-Za-z0-9_-]/g, '_')}__*`;
}

function objeto(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
}

/**
 * Monta o recurso de um servidor MCP.
 *
 * SEGURANÇA: `headers`, `env` e `args` NUNCA são lidos aqui, porque podem conter tokens
 * (ex.: "Authorization: Bearer ..."). Só entram o tipo, o host da URL ou o nome do executável.
 */
export function recursoMcp(nome: string, cfg: unknown, escopo: string, origem: string): Recurso {
  const c = objeto(cfg);
  const url = typeof c.url === 'string' ? c.url : undefined;
  const tipo = typeof c.type === 'string' ? c.type : url ? 'http' : 'stdio';
  let onde = '';
  if (url) {
    try {
      onde = new URL(url).host;
    } catch {
      onde = 'URL inválida';
    }
  } else if (typeof c.command === 'string') {
    onde = path.basename(c.command);
  }
  return {
    id: `mcp:${nome}`,
    nome,
    categoria: CATEGORIA,
    descricao: '',
    uso: `Ferramentas ${nomeFerramentas(nome)}`,
    origem,
    status: 'ok',
    detalhe: juntar(tipo, onde, `escopo ${escopo}`),
  };
}

function lerConfig(arquivo: string): Record<string, unknown> | undefined {
  if (!existe(arquivo)) {
    return undefined;
  }
  return objeto(JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '')));
}

/**
 * MCPs declarados em arquivo:
 * - ~/.claude.json → `mcpServers` (escopo usuário) e `projects[pasta].mcpServers` (escopo local);
 * - `.mcp.json` em cada pasta aberta no VS Code (escopo projeto).
 * Conectores do claude.ai não ficam em arquivo: entram pela checagem de saúde.
 */
export function coletarMcp(arqClaudeJson = ARQ_CLAUDE_JSON, pastasProjeto: string[] = []): Recurso[] {
  const saida = new Map<string, Recurso>();
  const adicionar = (r: Recurso, escopo: string) => {
    const ja = saida.get(r.id);
    if (ja) {
      ja.detalhe = juntar(ja.detalhe, `também em ${escopo}`);
    } else {
      saida.set(r.id, r);
    }
  };

  try {
    const json = lerConfig(arqClaudeJson) ?? {};
    for (const [nome, cfg] of Object.entries(objeto(json.mcpServers))) {
      adicionar(recursoMcp(nome, cfg, 'usuário', arqClaudeJson), 'usuário');
    }
    for (const [pasta, dados] of Object.entries(objeto(json.projects))) {
      const escopo = `local: ${path.basename(pasta)}`;
      for (const [nome, cfg] of Object.entries(objeto(objeto(dados).mcpServers))) {
        adicionar(recursoMcp(nome, cfg, escopo, arqClaudeJson), escopo);
      }
    }
  } catch (e) {
    saida.set('erro:claude.json', itemErro(CATEGORIA, '~/.claude.json', arqClaudeJson, `Não foi possível ler: ${mensagemDeErro(e)}`));
  }

  for (const pasta of pastasProjeto) {
    const arq = path.join(pasta, '.mcp.json');
    try {
      const json = lerConfig(arq);
      const escopo = `projeto: ${path.basename(pasta)}`;
      for (const [nome, cfg] of Object.entries(objeto(json?.mcpServers))) {
        adicionar(recursoMcp(nome, cfg, escopo, arq), escopo);
      }
    } catch (e) {
      saida.set(`erro:${arq}`, itemErro(CATEGORIA, arq, arq, `.mcp.json inválido: ${mensagemDeErro(e)}`));
    }
  }
  return [...saida.values()];
}

/**
 * "Impressão digital" só da parte de MCP do ~/.claude.json (nomes + tipo/URL).
 * O Claude Code reescreve esse arquivo o tempo todo (estatísticas, histórico);
 * comparando isto, só reagimos quando os MCPs realmente mudam.
 */
export function assinaturaMcp(arqClaudeJson = ARQ_CLAUDE_JSON): string {
  try {
    return JSON.stringify(coletarMcp(arqClaudeJson).map((r) => [r.id, r.detalhe]));
  } catch {
    return '';
  }
}
