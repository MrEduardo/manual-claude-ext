import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ArvoreRecursos } from './arvore';
import { ARQ_DESCRICOES, existe, expandirTil, HOME } from './caminhos';
import { itemErro } from './coletores/comum';
import { coletarTudo } from './coletores';
import { aplicarDescricoes, carregarDescricoes, ordemDosGrupos } from './descricoes';
import { gerarMarkdown, hashInventario } from './manualMd';
import { aplicarSaude, executarMcpList, interpretarMcpList, localizarClaude, SaudeMcp } from './saudeMcp';
import { contarStatus, mensagemDeErro, Recurso, Removido } from './tipos';

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ A VERIFICAÇÃO — o ponto central para alterar a lógica.                   │
 * │                                                                          │
 * │ 1. montarInventario(): coleta tudo (coletores/), aplica a saúde dos MCPs │
 * │    em cache, as descrições curtas e as marcas 🆕 / removidos.             │
 * │ 2. publicar(): atualiza o painel e reescreve o .md se algo mudou.        │
 * │ 3. verificarSaude(): roda `claude mcp list` em segundo plano e publica   │
 * │    de novo quando termina.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const CHAVE_VISTOS = 'manualClaude.vistos'; // id → quando foi visto pela 1ª vez
const CHAVE_REMOVIDOS = 'manualClaude.removidos';
const CHAVE_HASH = 'manualClaude.hash';
const CHAVE_SAUDE = 'manualClaude.saude';
const CHAVE_INICIO = 'manualClaude.inicio';

/** Itens vistos nos primeiros minutos de uso não contam como "novos". */
const JANELA_INICIAL_MS = 10 * 60 * 1000;

interface Visto {
  nome: string;
  categoria: string;
  desde: number; // 0 = já existia quando a extensão foi instalada
}

export interface OpcoesVerificacao {
  /** Disparada por você (botão/atalho): mostra notificação de progresso e resumo. */
  manual: boolean;
  /** Também checar a saúde dos MCPs. */
  saude: boolean;
}

interface Inventario {
  recursos: Recurso[];
  removidos: Removido[];
  adicionadosAgora: number;
  removidosAgora: number;
  ordemGrupos: string[];
}

function config() {
  return vscode.workspace.getConfiguration('manualClaude');
}

/**
 * Valor de um caminho configurável. Prioridade:
 * 1. configuração do VS Code que você definiu (usuário, workspace ou pasta);
 * 2. variável de ambiente (ex.: vinda do .env no modo F5);
 * 3. vazio, para quem chama aplicar o padrão.
 * Assim, caminhos pessoais ficam nas suas configurações ou no .env, nunca no código.
 */
function lerCaminho(chave: string, variavel: string): string {
  const v = config().inspect<string>(chave);
  const definido = v?.workspaceFolderValue ?? v?.workspaceValue ?? v?.globalValue;
  return definido?.trim() || process.env[variavel]?.trim() || '';
}

export function caminhoManual(): string {
  return expandirTil(lerCaminho('caminhoManual', 'MANUAL_CLAUDE_CAMINHO_MANUAL') || '~/.claude/manual-comandos.md');
}

function pastasAbertas(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
}

export class Verificador {
  private rodando = false;
  private pendente?: OpcoesVerificacao;
  private checandoSaude = false;
  private idsMcp = '';

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly arvore: ArvoreRecursos,
    private readonly log: vscode.OutputChannel,
  ) {}

  /** Ponto de entrada. Se já estiver rodando, agenda mais uma rodada no fim. */
  async executar(op: OpcoesVerificacao): Promise<void> {
    if (this.rodando) {
      this.pendente = { manual: op.manual || !!this.pendente?.manual, saude: op.saude || !!this.pendente?.saude };
      return;
    }
    this.rodando = true;
    try {
      await this.executarUmaVez(op);
    } finally {
      this.rodando = false;
      const p = this.pendente;
      this.pendente = undefined;
      if (p) {
        void this.executar(p);
      }
    }
  }

  private async executarUmaVez(op: OpcoesVerificacao): Promise<void> {
    this.arvore.definirVerificando(true);
    try {
      const inv = await vscode.window.withProgress(
        {
          location: op.manual ? vscode.ProgressLocation.Notification : vscode.ProgressLocation.Window,
          title: 'Manual Claude',
        },
        async (progresso) => {
          progresso.report({ message: 'lendo recursos…' });
          return this.montarInventario();
        },
      );
      this.publicar(inv, op.manual ? 'manual' : 'automatica');

      // A saúde dos MCPs roda em segundo plano. Também roda quando a lista de MCPs muda.
      const ids = inv.recursos.filter((r) => r.id.startsWith('mcp:')).map((r) => r.id).join('|');
      const mcpsMudaram = this.idsMcp !== '' && ids !== this.idsMcp;
      this.idsMcp = ids;
      if (config().get<boolean>('verificarSaudeMcp', true) && (op.saude || mcpsMudaram)) {
        void this.verificarSaude(op.manual);
      }
    } catch (e) {
      const msg = mensagemDeErro(e);
      this.log.appendLine(`[erro] ${msg}`);
      this.arvore.definirErro(msg);
      void vscode.window.showErrorMessage(`Manual Claude: a verificação falhou — ${msg}`, 'Ver log').then((acao) => {
        if (acao) {
          this.log.show();
        }
      });
    } finally {
      this.arvore.definirVerificando(false);
    }
  }

  /** Passo 1: junta tudo num inventário. Síncrono e rápido (só lê arquivos). */
  private montarInventario(): Inventario {
    const recursos = coletarTudo(pastasAbertas());

    const saude = this.ctx.globalState.get<SaudeMcp[]>(CHAVE_SAUDE);
    if (saude) {
      aplicarSaude(recursos, saude);
    }

    const desc = carregarDescricoes(ARQ_DESCRICOES, this.ctx.asAbsolutePath(path.join('resources', 'descricoes-padrao.json')));
    if (desc.erro) {
      recursos.push(itemErro('Problemas', 'manual-descricoes.json', ARQ_DESCRICOES, desc.erro));
    }
    aplicarDescricoes(recursos, desc.mapa);

    return { recursos, ordemGrupos: ordemDosGrupos(desc.mapa), ...this.marcarNovosERemovidos(recursos) };
  }

  /** Compara com o que já foi visto antes: marca 🆕 e monta a lista de removidos. */
  private marcarNovosERemovidos(recursos: Recurso[]) {
    const agora = Date.now();
    const janelaNovo = config().get<number>('diasNovo', 7) * 24 * 60 * 60 * 1000;
    const estado = this.ctx.globalState;

    let inicio = estado.get<number>(CHAVE_INICIO);
    if (!inicio) {
      inicio = agora;
      void estado.update(CHAVE_INICIO, inicio);
    }
    const periodoInicial = agora - inicio < JANELA_INICIAL_MS;

    const vistos = estado.get<Record<string, Visto>>(CHAVE_VISTOS) ?? {};
    const atuais: Record<string, Visto> = {};
    let adicionadosAgora = 0;
    for (const r of recursos) {
      if (r.id.startsWith('erro:')) {
        continue;
      }
      const v = vistos[r.id];
      const desde = v ? v.desde : periodoInicial ? 0 : agora;
      if (!v && desde) {
        adicionadosAgora++;
      }
      atuais[r.id] = { nome: r.nome, categoria: r.categoria, desde };
      r.novo = desde > 0 && agora - desde < janelaNovo;
    }

    // Removidos: o que estava em `vistos` e sumiu. Ficam listados pelo mesmo número de dias.
    const novosRemovidos: Removido[] = Object.entries(vistos)
      .filter(([id]) => !atuais[id])
      .map(([, v]) => ({ nome: v.nome, categoria: v.categoria, quando: agora }));
    const nomesAtuais = new Set(Object.values(atuais).map((v) => v.nome));
    const removidos = [...novosRemovidos, ...(estado.get<Removido[]>(CHAVE_REMOVIDOS) ?? [])].filter(
      (r) => agora - r.quando < janelaNovo && !nomesAtuais.has(r.nome),
    );

    void estado.update(CHAVE_VISTOS, atuais);
    void estado.update(CHAVE_REMOVIDOS, removidos);
    return { removidos, adicionadosAgora, removidosAgora: novosRemovidos.length };
  }

  /** Passo 2: atualiza o painel, grava o .md (se mudou) e avisa. */
  private publicar(inv: Inventario, origem: 'manual' | 'automatica' | 'saude'): void {
    const quando = new Date();
    this.arvore.definirResultado(inv.recursos, inv.removidos, inv.ordemGrupos, quando);

    const arquivo = caminhoManual();
    const hash = hashInventario(inv.recursos) + inv.ordemGrupos.join('|');
    if (hash !== this.ctx.globalState.get(CHAVE_HASH) || !existe(arquivo)) {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      fs.writeFileSync(arquivo, gerarMarkdown(inv.recursos, quando, ARQ_DESCRICOES, inv.ordemGrupos), 'utf8');
      void this.ctx.globalState.update(CHAVE_HASH, hash);
      this.log.appendLine(`[${quando.toISOString()}] manual gravado em ${arquivo} (${inv.recursos.length} recursos)`);
    }

    const c = contarStatus(inv.recursos);
    const mudancas = `${inv.adicionadosAgora} novo(s) · ${inv.removidosAgora} removido(s)`;
    const atencao = c.aviso + c.erro ? ` · ⚠ ${c.aviso} · ✗ ${c.erro}` : '';
    if (origem === 'manual') {
      void this.notificar(`Manual atualizado: ${inv.recursos.length} recursos · ${mudancas}${atencao}`);
    } else if (inv.adicionadosAgora || inv.removidosAgora) {
      void this.notificar(`Manual Claude atualizado sozinho: ${mudancas}`);
    }
  }

  private async notificar(msg: string): Promise<void> {
    const acao = await vscode.window.showInformationMessage(msg, 'Abrir manual');
    if (acao) {
      await vscode.commands.executeCommand('manualClaude.abrirManual');
    }
  }

  /** Passo 3: `claude mcp list` em segundo plano (pode levar dezenas de segundos). */
  private async verificarSaude(manual: boolean): Promise<void> {
    if (this.checandoSaude) {
      return;
    }
    this.checandoSaude = true;
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Manual Claude: checando MCPs…' },
        async () => {
          const exe = localizarClaude(lerCaminho('caminhoClaude', 'MANUAL_CLAUDE_CAMINHO_CLAUDE'));
          const saida = await executarMcpList(exe, pastasAbertas()[0] ?? HOME);
          const saude = interpretarMcpList(saida);
          if (!saude.length) {
            throw new Error('a saída do "claude mcp list" não foi reconhecida');
          }
          await this.ctx.globalState.update(CHAVE_SAUDE, saude);
          this.arvore.definirAvisoSaude(undefined);
          this.publicar(this.montarInventario(), 'saude');

          if (manual) {
            const ok = saude.filter((s) => s.status === 'ok').length;
            const problemas = saude.filter((s) => s.status !== 'ok').map((s) => `${s.nome} (${s.texto})`);
            const texto = problemas.length ? ` · atenção: ${problemas.join(', ')}` : '';
            void vscode.window.showInformationMessage(`MCPs: ${ok} de ${saude.length} conectados${texto}`);
          }
        },
      );
    } catch (e) {
      const msg = mensagemDeErro(e);
      this.log.appendLine(`[saúde MCP] ${msg}`);
      this.arvore.definirAvisoSaude(msg);
      if (manual) {
        void vscode.window.showWarningMessage(`Manual Claude: não consegui checar os MCPs — ${msg}`);
      }
    } finally {
      this.checandoSaude = false;
    }
  }
}
