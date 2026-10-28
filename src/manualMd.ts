import { createHash } from 'crypto';
import { agruparPorCategoria, agruparPorGrupo, contarStatus, ICONE_STATUS, Recurso } from './tipos';

export function formatarData(d: Date): string {
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Escapa texto para dentro de uma célula de tabela Markdown. */
function celula(texto: string): string {
  return texto.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

/** Âncora no estilo do GitHub: minúsculas, sem pontuação, espaços viram "-". */
export function ancora(titulo: string): string {
  return titulo
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function tabela(itens: Recurso[]): string[] {
  return [
    '| | Nome | Função | Uso |',
    '|:-:|---|---|---|',
    ...itens.map(
      (r) =>
        `| ${ICONE_STATUS[r.status]} | \`${celula(r.nome)}\` | ${r.novo ? '🆕 ' : ''}${celula(r.descricao)} | ${celula(r.uso)} |`,
    ),
  ];
}

/**
 * Gera o manual completo. O arquivo é sempre reescrito por inteiro, então nada
 * obsoleto sobra. Categorias só com skills de referência ficam dentro de <details>.
 */
export function gerarMarkdown(recursos: Recurso[], quando: Date, arqDescricoes: string, ordemGrupos: string[] = []): string {
  const c = contarStatus(recursos);
  const categorias = agruparPorCategoria(recursos);
  const l: string[] = [
    '# Manual de Recursos — Claude Code',
    '',
    `> Gerado automaticamente pela extensão **Manual Claude** em ${formatarData(quando)}.`,
    `> Não edite este arquivo: ele é reescrito a cada verificação. Para mudar descrições ou grupos, edite \`${arqDescricoes}\`.`,
    '',
    `**${recursos.length} recursos** · ✓ ${c.ok} ok · ⚠ ${c.aviso} atenção · ✗ ${c.erro} erro`,
    '',
    '**Legenda:** ✓ ok · ⚠ atenção (sem descrição curta, MCP pedindo login…) · ✗ erro · 🆕 adicionado recentemente',
    '',
    '## Índice',
    '',
    ...categorias.map(([cat, itens]) => `- [${cat}](#${ancora(cat)}) (${itens.length})`),
    '',
  ];

  for (const [cat, itens] of categorias) {
    l.push('---', '', `## ${cat}`, '');
    const recolher = itens.every((r) => r.referencia);
    if (recolher) {
      l.push('<details>', `<summary>Mostrar ${itens.length} itens (ativados automaticamente pelo assunto)</summary>`, '');
    }
    for (const [grupo, doGrupo] of agruparPorGrupo(itens, ordemGrupos)) {
      if (grupo) {
        l.push(`### ${grupo}`, '');
      }
      l.push(...tabela(doGrupo), '');
    }
    if (recolher) {
      l.push('</details>', '');
    }
  }
  return l.join('\n');
}

/** Hash do conteúdo (sem a data), para só reescrever o arquivo quando algo mudou de fato. */
export function hashInventario(recursos: Recurso[]): string {
  const essencial = [...recursos]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => [r.id, r.nome, r.categoria, r.grupo, r.descricao, r.uso, r.status, r.novo]);
  return createHash('sha1').update(JSON.stringify(essencial)).digest('hex');
}
