import * as vscode from 'vscode';
import { formatarData } from './manualMd';
import { agruparPorCategoria, agruparPorGrupo, contarStatus, Recurso, Removido, Status } from './tipos';

/** Tipos de nó do painel. */
export type No =
  | { tipo: 'info'; rotulo: string; descricao?: string; icone: vscode.ThemeIcon; tooltip?: string }
  | { tipo: 'categoria'; nome: string; itens: Recurso[] }
  | { tipo: 'grupo'; nome: string; itens: Recurso[] }
  | { tipo: 'removidos'; itens: Removido[] }
  | { tipo: 'removido'; item: Removido }
  | { tipo: 'recurso'; recurso: Recurso };

export function iconeStatus(status: Status): vscode.ThemeIcon {
  switch (status) {
    case 'ok':
      return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    case 'aviso':
      return new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
    default:
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('list.errorForeground'));
  }
}

/** Ícone da categoria pelo tipo de recurso. */
function iconeCategoria(categoria: string): vscode.ThemeIcon {
  if (categoria === 'Problemas') {
    return iconeStatus('erro');
  }
  if (categoria.startsWith('Servidores MCP')) {
    return new vscode.ThemeIcon('plug');
  }
  if (categoria.startsWith('Agentes')) {
    return new vscode.ThemeIcon('hubot');
  }
  if (categoria.startsWith('CLI')) {
    return new vscode.ThemeIcon('terminal');
  }
  if (categoria.includes('Skills')) {
    return new vscode.ThemeIcon('lightbulb');
  }
  return new vscode.ThemeIcon('symbol-event');
}

function resumoContagem(itens: Recurso[]): string {
  const c = contarStatus(itens);
  return [`${itens.length}`, c.aviso ? `⚠ ${c.aviso}` : '', c.erro ? `✗ ${c.erro}` : ''].filter(Boolean).join(' · ');
}

/** Painel "Recursos": cabeçalho com a última verificação, depois as categorias. */
export class ArvoreRecursos implements vscode.TreeDataProvider<No> {
  private readonly mudou = new vscode.EventEmitter<No | undefined | void>();
  readonly onDidChangeTreeData = this.mudou.event;

  private recursos: Recurso[] = [];
  private removidos: Removido[] = [];
  private ordemGrupos: string[] = [];
  private quando?: Date;
  private verificando = false;
  private erro?: string;
  private avisoSaude?: string;

  todos(): Recurso[] {
    return this.recursos;
  }

  definirResultado(recursos: Recurso[], removidos: Removido[], ordemGrupos: string[], quando: Date): void {
    this.recursos = recursos;
    this.removidos = removidos;
    this.ordemGrupos = ordemGrupos;
    this.quando = quando;
    this.erro = undefined;
    this.mudou.fire();
  }

  definirVerificando(v: boolean): void {
    this.verificando = v;
    this.mudou.fire();
  }

  definirErro(msg: string | undefined): void {
    this.erro = msg;
    this.mudou.fire();
  }

  definirAvisoSaude(msg: string | undefined): void {
    this.avisoSaude = msg;
    this.mudou.fire();
  }

  getChildren(no?: No): No[] {
    if (!no) {
      return this.raiz();
    }
    switch (no.tipo) {
      case 'categoria': {
        const grupos = agruparPorGrupo(no.itens, this.ordemGrupos);
        if (grupos.length === 1 && !grupos[0][0]) {
          return no.itens.map((recurso) => ({ tipo: 'recurso', recurso }));
        }
        return grupos.map(([nome, itens]) => ({ tipo: 'grupo', nome, itens }));
      }
      case 'grupo':
        return no.itens.map((recurso) => ({ tipo: 'recurso', recurso }));
      case 'removidos':
        return no.itens.map((item) => ({ tipo: 'removido', item }));
      default:
        return [];
    }
  }

  private raiz(): No[] {
    // Lista vazia = o VS Code mostra a mensagem de boas-vindas (viewsWelcome).
    if (!this.quando && !this.verificando && !this.erro) {
      return [];
    }
    const nos: No[] = [];
    if (this.verificando) {
      nos.push({ tipo: 'info', rotulo: 'Verificando…', icone: new vscode.ThemeIcon('sync~spin') });
    } else if (this.quando) {
      nos.push({
        tipo: 'info',
        rotulo: `Última verificação: ${formatarData(this.quando)}`,
        descricao: `${this.recursos.length} recursos`,
        icone: new vscode.ThemeIcon('history'),
      });
    }
    if (this.erro) {
      nos.push({ tipo: 'info', rotulo: 'A verificação falhou', descricao: this.erro, tooltip: this.erro, icone: iconeStatus('erro') });
    }
    if (this.avisoSaude) {
      nos.push({
        tipo: 'info',
        rotulo: 'Status dos MCPs indisponível',
        descricao: this.avisoSaude,
        tooltip: this.avisoSaude,
        icone: iconeStatus('aviso'),
      });
    }
    for (const [nome, itens] of agruparPorCategoria(this.recursos)) {
      nos.push({ tipo: 'categoria', nome, itens });
    }
    if (this.removidos.length) {
      nos.push({ tipo: 'removidos', itens: this.removidos });
    }
    return nos;
  }

  getTreeItem(no: No): vscode.TreeItem {
    const Estado = vscode.TreeItemCollapsibleState;
    switch (no.tipo) {
      case 'info': {
        const item = new vscode.TreeItem(no.rotulo, Estado.None);
        item.description = no.descricao;
        item.iconPath = no.icone;
        item.tooltip = no.tooltip;
        return item;
      }
      case 'categoria': {
        const item = new vscode.TreeItem(no.nome, Estado.Collapsed);
        item.description = resumoContagem(no.itens);
        item.iconPath = iconeCategoria(no.nome);
        return item;
      }
      case 'grupo': {
        const item = new vscode.TreeItem(no.nome, Estado.Collapsed);
        item.description = resumoContagem(no.itens);
        item.iconPath = new vscode.ThemeIcon('folder');
        return item;
      }
      case 'removidos': {
        const item = new vscode.TreeItem('Removidos recentemente', Estado.Collapsed);
        item.description = `${no.itens.length}`;
        item.iconPath = new vscode.ThemeIcon('trash');
        return item;
      }
      case 'removido': {
        const item = new vscode.TreeItem(no.item.nome, Estado.None);
        item.description = `${no.item.categoria} · ${formatarData(new Date(no.item.quando))}`;
        item.iconPath = new vscode.ThemeIcon('circle-slash');
        return item;
      }
      case 'recurso':
        return this.itemRecurso(no.recurso);
    }
  }

  private itemRecurso(r: Recurso): vscode.TreeItem {
    const item = new vscode.TreeItem(r.nome, vscode.TreeItemCollapsibleState.None);
    item.description = `${r.novo ? '🆕 ' : ''}${r.descricao}`;
    item.iconPath = iconeStatus(r.status);
    item.contextValue = 'recurso';

    // appendText escapa o conteúdo: descrições vêm de arquivos de terceiros.
    const dica = new vscode.MarkdownString();
    dica.appendMarkdown('**').appendText(r.nome).appendMarkdown('**\n\n');
    if (r.descricaoOriginal) {
      dica.appendText(r.descricaoOriginal).appendMarkdown('\n\n');
    }
    dica.appendMarkdown('**Uso:** ').appendText(r.uso).appendMarkdown('  \n');
    dica.appendMarkdown('**Categoria:** ').appendText(r.grupo ? `${r.categoria} › ${r.grupo}` : r.categoria);
    if (r.detalhe) {
      dica.appendMarkdown('  \n**Info:** ').appendText(r.detalhe);
    }
    if (r.origem) {
      dica.appendMarkdown('  \n**Arquivo:** ').appendText(r.origem);
    }
    item.tooltip = dica;

    if (r.origem) {
      item.command = { command: 'manualClaude.abrirOrigem', title: 'Abrir arquivo de origem', arguments: [r] };
    }
    return item;
  }
}
