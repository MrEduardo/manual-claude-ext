import * as fs from 'fs';
import * as path from 'path';
import { ARQ_PLUGINS, existe } from '../caminhos';
import { mensagemDeErro, Recurso } from '../tipos';
import { coletarAgentes, coletarComandos, coletarSkills, itemErro } from './comum';
import { recursoMcp } from './mcp';

interface Instalacao {
  installPath?: string;
  lastUpdated?: string;
}

/** Entre várias instalações do mesmo plugin (escopos diferentes), usa a mais recente. */
function maisRecente(instalacoes: unknown): Instalacao | undefined {
  if (!Array.isArray(instalacoes)) {
    return undefined;
  }
  return [...(instalacoes as Instalacao[])]
    .filter((i) => i && typeof i.installPath === 'string')
    .sort((a, b) => String(b.lastUpdated ?? '').localeCompare(String(a.lastUpdated ?? '')))[0];
}

/**
 * Plugins instalados (installed_plugins.json). De cada um:
 * commands/*.md, agents/*.md, skills/<nome>/SKILL.md e .mcp.json.
 */
export function coletarPlugins(arqPlugins = ARQ_PLUGINS): Recurso[] {
  if (!existe(arqPlugins)) {
    return [];
  }
  let dados: { plugins?: Record<string, unknown> };
  try {
    dados = JSON.parse(fs.readFileSync(arqPlugins, 'utf8'));
  } catch (e) {
    return [itemErro('Problemas', 'installed_plugins.json', arqPlugins, mensagemDeErro(e))];
  }

  const saida: Recurso[] = [];
  for (const [chave, instalacoes] of Object.entries(dados.plugins ?? {})) {
    const plugin = chave.split('@')[0]; // "meu-plugin@marketplace" → "meu-plugin"
    const inst = maisRecente(instalacoes);
    if (!inst?.installPath || !existe(inst.installPath)) {
      saida.push(itemErro('Problemas', `plugin ${plugin}`, arqPlugins, 'Pasta de instalação não encontrada'));
      continue;
    }
    const raiz = inst.installPath;
    saida.push(
      ...coletarComandos(path.join(raiz, 'commands'), `Comandos — ${plugin}`, `${plugin}:`),
      ...coletarAgentes(path.join(raiz, 'agents'), `Agentes — ${plugin}`, `${plugin}:`),
      ...coletarSkills(path.join(raiz, 'skills'), `Skills de referência — ${plugin}`, `${plugin}:`, true),
    );

    const arqMcp = path.join(raiz, '.mcp.json');
    if (existe(arqMcp)) {
      try {
        const servidores = JSON.parse(fs.readFileSync(arqMcp, 'utf8')).mcpServers ?? {};
        for (const [nome, cfg] of Object.entries(servidores)) {
          saida.push(recursoMcp(`plugin:${plugin}:${nome}`, cfg, `plugin ${plugin}`, arqMcp));
        }
      } catch (e) {
        saida.push(itemErro('Servidores MCP', `plugin:${plugin}`, arqMcp, `.mcp.json inválido: ${mensagemDeErro(e)}`));
      }
    }
  }
  return saida;
}
