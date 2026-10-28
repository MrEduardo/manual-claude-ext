import * as path from 'path';
import * as vscode from 'vscode';
import { ArvoreRecursos, No } from './arvore';
import { ARQ_CLAUDE_JSON, ARQ_DESCRICOES, ARQ_PLUGINS, carregarEnv, DIR_CLAUDE, existe, HOME } from './caminhos';
import { assinaturaMcp } from './coletores/mcp';
import { carregarDescricoes } from './descricoes';
import { Alvo, Observador } from './observador';
import { ICONE_STATUS, mensagemDeErro, Recurso } from './tipos';
import { caminhoManual, Verificador } from './verificacao';

/** Envolve um comando para que um erro vire mensagem, e não uma falha silenciosa. */
function seguro<T extends unknown[]>(fn: (...args: T) => unknown): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (e) {
      void vscode.window.showErrorMessage(`Manual Claude: ${mensagemDeErro(e)}`);
    }
  };
}

/** O que observar para atualizar o manual sozinho. */
function alvosObservados(): Alvo[] {
  const alvos: Alvo[] = [
    // O ~/.claude.json muda o tempo todo; a assinatura filtra só mudanças de MCP.
    { caminho: HOME, recursivo: false, arquivo: path.basename(ARQ_CLAUDE_JSON), assinatura: () => assinaturaMcp() },
    { caminho: path.dirname(ARQ_PLUGINS), recursivo: false, arquivo: path.basename(ARQ_PLUGINS) },
    { caminho: DIR_CLAUDE, recursivo: false, arquivo: path.basename(ARQ_DESCRICOES) },
    { caminho: path.join(DIR_CLAUDE, 'skills'), recursivo: true },
    { caminho: path.join(DIR_CLAUDE, 'agents'), recursivo: true },
    { caminho: path.join(DIR_CLAUDE, 'commands'), recursivo: true },
  ];
  for (const pasta of (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath)) {
    alvos.push({ caminho: pasta, recursivo: false, arquivo: '.mcp.json' });
    alvos.push({ caminho: path.join(pasta, '.claude'), recursivo: true });
  }
  return alvos;
}

/** Aceita tanto o Recurso quanto o nó da árvore (o menu de contexto passa o nó). */
function comoRecurso(arg: unknown): Recurso | undefined {
  const no = arg as No | Recurso | undefined;
  if (!no) {
    return undefined;
  }
  if ('tipo' in no && no.tipo === 'recurso') {
    return no.recurso;
  }
  return 'id' in no ? no : undefined;
}

export function activate(ctx: vscode.ExtensionContext): void {
  // No modo F5, valores pessoais podem vir do .env do projeto (fora do git; veja .env.example).
  if (ctx.extensionMode !== vscode.ExtensionMode.Production) {
    carregarEnv(path.join(ctx.extensionPath, '.env'));
  }

  const log = vscode.window.createOutputChannel('Manual Claude');
  const arvore = new ArvoreRecursos();
  const view = vscode.window.createTreeView('manualClaude.recursos', { treeDataProvider: arvore, showCollapseAll: true });
  const verificador = new Verificador(ctx, arvore, log);
  const observador = new Observador(() => void verificador.executar({ manual: false, saude: false }), log);

  const abrirManual = async () => {
    const arquivo = caminhoManual();
    if (!existe(arquivo)) {
      await verificador.executar({ manual: true, saude: false });
    }
    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arquivo));
  };

  const abrirOrigem = async (arg: unknown) => {
    const r = comoRecurso(arg);
    if (!r?.origem) {
      return;
    }
    if (!existe(r.origem)) {
      throw new Error(`arquivo não encontrado: ${r.origem}`);
    }
    await vscode.window.showTextDocument(vscode.Uri.file(r.origem), { preview: true });
  };

  const copiarNome = async (arg: unknown) => {
    const r = comoRecurso(arg);
    if (r) {
      await vscode.env.clipboard.writeText(r.nome);
      vscode.window.setStatusBarMessage(`Copiado: ${r.nome}`, 2500);
    }
  };

  const buscar = async () => {
    if (!arvore.todos().length) {
      await verificador.executar({ manual: true, saude: false });
    }
    type Item = vscode.QuickPickItem & { recurso: Recurso };
    const itens: Item[] = arvore.todos().map((r) => ({
      label: `${ICONE_STATUS[r.status]} ${r.nome}`,
      description: `${r.novo ? '🆕 ' : ''}${r.descricao}`,
      detail: `${r.grupo ? `${r.categoria} › ${r.grupo}` : r.categoria} · ${r.uso}`,
      recurso: r,
    }));
    const escolhido = await vscode.window.showQuickPick(itens, {
      title: 'Manual Claude — buscar recurso',
      placeHolder: 'Digite nome, função ou categoria…',
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!escolhido) {
      return;
    }
    if (escolhido.recurso.origem) {
      await abrirOrigem(escolhido.recurso);
    } else {
      await copiarNome(escolhido.recurso);
    }
  };

  const editarDescricoes = async () => {
    // Garante que o arquivo existe (é criado a partir das descrições padrão).
    carregarDescricoes(ARQ_DESCRICOES, ctx.asAbsolutePath(path.join('resources', 'descricoes-padrao.json')));
    await vscode.window.showTextDocument(vscode.Uri.file(ARQ_DESCRICOES));
  };

  const configurarObservador = () => {
    if (vscode.workspace.getConfiguration('manualClaude').get<boolean>('atualizacaoAutomatica', true)) {
      observador.iniciar(alvosObservados());
    } else {
      observador.parar();
    }
  };

  ctx.subscriptions.push(
    log,
    view,
    observador,
    vscode.commands.registerCommand('manualClaude.verificar', seguro(() => verificador.executar({ manual: true, saude: true }))),
    vscode.commands.registerCommand('manualClaude.abrirManual', seguro(abrirManual)),
    vscode.commands.registerCommand('manualClaude.buscar', seguro(buscar)),
    vscode.commands.registerCommand('manualClaude.editarDescricoes', seguro(editarDescricoes)),
    vscode.commands.registerCommand('manualClaude.abrirOrigem', seguro(abrirOrigem)),
    vscode.commands.registerCommand('manualClaude.copiarNome', seguro(copiarNome)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('manualClaude')) {
        configurarObservador();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => configurarObservador()),
  );

  configurarObservador();
  if (vscode.workspace.getConfiguration('manualClaude').get<boolean>('verificarAoIniciar', true)) {
    void verificador.executar({ manual: false, saude: true });
  }
}

export function deactivate(): void {
  // Tudo é liberado pelos ctx.subscriptions.
}
