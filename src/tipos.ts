/** Situação de um recurso no painel e no manual. */
export type Status = 'ok' | 'aviso' | 'erro';

/** Um item do manual: comando, agente, skill, servidor MCP etc. */
export interface Recurso {
  /** Chave única. É também a chave usada no manual-descricoes.json. */
  id: string;
  /** Nome como você digita ou vê (ex.: "/meu-plugin:exemplo", "mcp-exemplo"). */
  nome: string;
  /** Seção do manual (ex.: "Comandos — meu-plugin"). */
  categoria: string;
  /** Subseção opcional dentro da categoria (vem do manual-descricoes.json). */
  grupo?: string;
  /** Descrição curta (ideal: até 5 palavras). */
  descricao: string;
  /** Descrição completa, tirada do arquivo de origem. */
  descricaoOriginal?: string;
  /** Como usar (ex.: "Digite /meu-plugin:exemplo"). */
  uso: string;
  /** Arquivo de onde o recurso foi lido (abre ao clicar). */
  origem?: string;
  status: Status;
  /** Motivo do status ou informação extra (aparece no tooltip). */
  detalhe?: string;
  /** Skills de referência: ficam numa seção recolhida. */
  referencia?: boolean;
  /** Foi adicionado há poucos dias. */
  novo?: boolean;
}

/** Recurso que existia na verificação anterior e sumiu. */
export interface Removido {
  nome: string;
  categoria: string;
  quando: number;
}

export const ICONE_STATUS: Record<Status, string> = { ok: '✓', aviso: '⚠', erro: '✗' };

/**
 * Ordem das seções no manual e no painel.
 * Itens terminados em espaço são prefixos (ex.: "Comandos — plugin-a", "Comandos — plugin-b").
 */
const ORDEM_CATEGORIAS = [
  'Problemas',
  'Comandos nativos',
  'Skills nativas',
  'Skills Anthropic',
  'Skills do usuário',
  'Comandos do usuário',
  'Agentes do usuário',
  'Skills do projeto',
  'Comandos do projeto',
  'Agentes do projeto',
  'Comandos — ',
  'Agentes — ',
  'Servidores MCP',
  'CLI (terminal)',
  'Skills de referência — ',
];

function posicaoCategoria(categoria: string): number {
  const i = ORDEM_CATEGORIAS.findIndex((c) => (c.endsWith(' ') ? categoria.startsWith(c) : categoria === c));
  return i === -1 ? ORDEM_CATEGORIAS.length : i;
}

export function compararCategorias(a: string, b: string): number {
  return posicaoCategoria(a) - posicaoCategoria(b) || a.localeCompare(b, 'pt');
}

/** Agrupa recursos por categoria, já na ordem do manual e com itens em ordem alfabética. */
export function agruparPorCategoria(recursos: Recurso[]): [string, Recurso[]][] {
  const mapa = new Map<string, Recurso[]>();
  for (const r of recursos) {
    const lista = mapa.get(r.categoria) ?? [];
    lista.push(r);
    mapa.set(r.categoria, lista);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => compararCategorias(a, b))
    .map(([c, itens]) => [c, [...itens].sort((x, y) => x.nome.localeCompare(y.nome, 'pt'))]);
}

/**
 * Divide os itens de uma categoria em grupos, na ordem `ordemGrupos`.
 * Sem nenhum grupo definido, devolve um único grupo sem nome ("").
 */
export function agruparPorGrupo(itens: Recurso[], ordemGrupos: string[]): [string, Recurso[]][] {
  if (!itens.some((r) => r.grupo)) {
    return [['', itens]];
  }
  const mapa = new Map<string, Recurso[]>();
  for (const r of itens) {
    const g = r.grupo ?? 'Outros';
    mapa.set(g, [...(mapa.get(g) ?? []), r]);
  }
  const pos = (g: string) => {
    if (g === 'Outros') {
      return Number.MAX_SAFE_INTEGER;
    }
    const i = ordemGrupos.indexOf(g);
    return i === -1 ? ordemGrupos.length : i;
  };
  return [...mapa.entries()].sort(([a], [b]) => pos(a) - pos(b) || a.localeCompare(b, 'pt'));
}

export function contarStatus(recursos: Recurso[]): Record<Status, number> {
  const c: Record<Status, number> = { ok: 0, aviso: 0, erro: 0 };
  for (const r of recursos) {
    c[r.status]++;
  }
  return c;
}

export function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Junta textos de detalhe com " · ", ignorando vazios. */
export function juntar(...partes: (string | undefined)[]): string {
  return partes.filter((p) => p && p.trim()).join(' · ');
}
