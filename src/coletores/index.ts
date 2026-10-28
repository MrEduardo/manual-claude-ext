import { mensagemDeErro, Recurso } from '../tipos';
import { itemErro } from './comum';
import { coletarMcp } from './mcp';
import { coletarNativos } from './nativos';
import { coletarPlugins } from './plugins';
import { coletarProjeto, coletarUsuario } from './usuario';

/**
 * Roda todos os coletores. Para adicionar uma fonte nova, inclua uma linha em `fontes`.
 * Um coletor que falhar vira um item ✗ em "Problemas"; os outros continuam.
 * Se dois coletores devolverem o mesmo id, fica o primeiro.
 */
export function coletarTudo(pastasProjeto: string[] = []): Recurso[] {
  const fontes: [string, () => Recurso[]][] = [
    ['nativos', coletarNativos],
    ['usuário', () => coletarUsuario()],
    ...pastasProjeto.map((p): [string, () => Recurso[]] => [`projeto ${p}`, () => coletarProjeto(p)]),
    ['plugins', () => coletarPlugins()],
    ['MCP', () => coletarMcp(undefined, pastasProjeto)],
  ];

  const saida = new Map<string, Recurso>();
  for (const [nome, coletar] of fontes) {
    try {
      for (const r of coletar()) {
        if (!saida.has(r.id)) {
          saida.set(r.id, r);
        }
      }
    } catch (e) {
      const r = itemErro('Problemas', `Coletor ${nome}`, undefined, mensagemDeErro(e));
      saida.set(r.id, r);
    }
  }
  return [...saida.values()];
}
