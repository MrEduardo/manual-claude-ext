import { Recurso } from '../tipos';

/*
 * LISTA FIXA — os comandos nativos do Claude Code não existem como arquivo,
 * então não dá para descobri-los automaticamente. Quando o Claude Code ganhar
 * ou perder um comando, edite as listas abaixo. Formato: [nome, descrição curta].
 */

const COMANDOS: [string, string][] = [
  ['/help', 'Mostra a ajuda'],
  ['/mcp', 'Gerencia e autentica MCPs'],
  ['/clear', 'Limpa a conversa'],
  ['/compact', 'Resume a conversa'],
  ['/context', 'Mostra uso do contexto'],
  ['/cost', 'Custo da sessão'],
  ['/usage', 'Limites de uso do plano'],
  ['/model', 'Troca o modelo'],
  ['/fast', 'Liga/desliga modo rápido'],
  ['/config', 'Abre configurações'],
  ['/permissions', 'Gerencia permissões'],
  ['/hooks', 'Configura hooks'],
  ['/memory', 'Edita memória (CLAUDE.md)'],
  ['/agents', 'Gerencia subagentes'],
  ['/plugin', 'Gerencia plugins'],
  ['/resume', 'Retoma conversa anterior'],
  ['/rewind', 'Volta a ponto anterior'],
  ['/export', 'Exporta a conversa'],
  ['/add-dir', 'Adiciona pasta de trabalho'],
  ['/status', 'Status da conta/sistema'],
  ['/doctor', 'Diagnostica a instalação'],
  ['/login', 'Entra na conta'],
  ['/logout', 'Sai da conta'],
  ['/statusline', 'Configura linha de status'],
  ['/artifacts', 'Lista seus artifacts'],
  ['/exit', 'Sai do Claude Code'],
];

const SKILLS: [string, string][] = [
  ['/init', 'Cria CLAUDE.md do projeto'],
  ['/code-review', 'Revisa código buscando bugs'],
  ['/security-review', 'Revisão de segurança'],
  ['/simplify', 'Simplifica código alterado'],
  ['/run', 'Roda o app do projeto'],
  ['/loop', 'Repete tarefa em intervalos'],
  ['/schedule', 'Agenda tarefas na nuvem'],
  ['/update-config', 'Edita o settings.json'],
  ['/keybindings-help', 'Personaliza atalhos'],
  ['/fewer-permission-prompts', 'Reduz pedidos de permissão'],
  ['/claude-api', 'Referência da API Claude'],
  ['/plugin-authoring', 'Cria mods e plugins'],
];

const CLI: [string, string][] = [
  ['claude mcp add', 'Adiciona servidor MCP'],
  ['claude mcp list', 'Lista MCPs e status'],
  ['claude mcp get <nome>', 'Detalhes de um MCP'],
  ['claude mcp remove <nome>', 'Remove um MCP'],
];

const DETALHE = 'Lista fixa (src/coletores/nativos.ts)';

function montar(lista: [string, string][], categoria: string, uso: (nome: string) => string): Recurso[] {
  return lista.map(([nome, descricao]) => ({
    id: `nativo:${nome}`,
    nome,
    categoria,
    descricao,
    uso: uso(nome),
    status: 'ok',
    detalhe: DETALHE,
  }));
}

export function coletarNativos(): Recurso[] {
  return [
    ...montar(COMANDOS, 'Comandos nativos', (n) => `Digite ${n}`),
    ...montar(SKILLS, 'Skills nativas', (n) => `Digite ${n}`),
    ...montar(CLI, 'CLI (terminal)', () => 'No terminal'),
  ];
}
