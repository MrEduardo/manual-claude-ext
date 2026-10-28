import * as path from 'path';
import { DIR_CLAUDE } from '../caminhos';
import { Recurso } from '../tipos';
import { coletarAgentes, coletarComandos, coletarSkills, listarPastas } from './comum';

/**
 * Seus recursos em ~/.claude:
 * - skills/<nome>/SKILL.md          → Skills do usuário
 * - skills/synced/<id>/<nome>/...   → Skills Anthropic (sincronizadas da conta claude.ai)
 * - commands/*.md, agents/*.md      → Comandos/Agentes do usuário
 */
export function coletarUsuario(dirClaude = DIR_CLAUDE): Recurso[] {
  const skills = path.join(dirClaude, 'skills');
  const sincronizadas = listarPastas(path.join(skills, 'synced')).flatMap((p) =>
    coletarSkills(p, 'Skills Anthropic', 'anthropic-skills:'),
  );
  return [
    ...coletarSkills(skills, 'Skills do usuário', ''),
    ...sincronizadas,
    ...coletarComandos(path.join(dirClaude, 'commands'), 'Comandos do usuário', ''),
    ...coletarAgentes(path.join(dirClaude, 'agents'), 'Agentes do usuário', ''),
  ];
}

/** O mesmo, para a pasta .claude de um projeto aberto no VS Code. */
export function coletarProjeto(pasta: string): Recurso[] {
  const dir = path.join(pasta, '.claude');
  return [
    ...coletarSkills(path.join(dir, 'skills'), 'Skills do projeto', ''),
    ...coletarComandos(path.join(dir, 'commands'), 'Comandos do projeto', ''),
    ...coletarAgentes(path.join(dir, 'agents'), 'Agentes do projeto', ''),
  ];
}
