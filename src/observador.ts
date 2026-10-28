import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { existe } from './caminhos';
import { mensagemDeErro } from './tipos';

/** Algo a observar no disco. */
export interface Alvo {
  caminho: string;
  recursivo: boolean;
  /** Só reage a mudanças neste nome de arquivo (útil para observar um arquivo pela pasta). */
  arquivo?: string;
  /**
   * Opcional: função que resume o conteúdo relevante. Se o resultado não mudar,
   * a mudança é ignorada (evita reagir às gravações constantes do ~/.claude.json).
   */
  assinatura?: () => string;
}

/**
 * Observa arquivos e pastas com fs.watch (funciona também fora do workspace) e
 * chama `aoMudar` uma vez só depois que as mudanças param por `esperaMs`.
 */
export class Observador implements vscode.Disposable {
  private watchers: fs.FSWatcher[] = [];
  private timer?: NodeJS.Timeout;
  private assinaturas = new Map<Alvo, string>();
  private pendentes = new Set<Alvo>();
  private alvos: Alvo[] = [];

  constructor(
    private readonly aoMudar: () => void,
    private readonly log: vscode.OutputChannel,
    private readonly esperaMs = 3000,
  ) {}

  iniciar(alvos: Alvo[]): void {
    this.parar();
    this.alvos = alvos;
    for (const alvo of alvos) {
      if (!existe(alvo.caminho)) {
        this.observarCriacao(alvo.caminho);
        continue;
      }
      try {
        if (alvo.assinatura) {
          this.assinaturas.set(alvo, alvo.assinatura());
        }
        const w = fs.watch(alvo.caminho, { recursive: alvo.recursivo, persistent: false }, (_evento, nome) => {
          if (alvo.arquivo && nome && String(nome) !== alvo.arquivo) {
            return;
          }
          this.agendar(alvo);
        });
        w.on('error', (e) => this.log.appendLine(`[observador] ${alvo.caminho}: ${mensagemDeErro(e)}`));
        this.watchers.push(w);
      } catch (e) {
        this.log.appendLine(`[observador] não foi possível observar ${alvo.caminho}: ${mensagemDeErro(e)}`);
      }
    }
    this.log.appendLine(`[observador] observando ${this.watchers.length} local(is)`);
  }

  /**
   * A pasta ainda não existe (ex.: ~/.claude/agents antes do primeiro agente).
   * Vigia a pasta-pai; quando ela for criada, verifica e passa a observá-la.
   */
  private observarCriacao(caminho: string): void {
    const pai = path.dirname(caminho);
    const nome = path.basename(caminho);
    if (!existe(pai)) {
      return;
    }
    try {
      const w = fs.watch(pai, { persistent: false }, (_evento, arquivo) => {
        if (arquivo && String(arquivo) === nome && existe(caminho)) {
          this.log.appendLine(`[observador] ${caminho} foi criado`);
          this.aoMudar();
          this.iniciar(this.alvos); // agora a pasta existe e passa a ser observada
        }
      });
      w.on('error', (e) => this.log.appendLine(`[observador] ${pai}: ${mensagemDeErro(e)}`));
      this.watchers.push(w);
    } catch (e) {
      this.log.appendLine(`[observador] não foi possível observar ${pai}: ${mensagemDeErro(e)}`);
    }
  }

  private agendar(alvo: Alvo): void {
    this.pendentes.add(alvo);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const alvos = [...this.pendentes];
      this.pendentes.clear();
      // Reage se algum alvo não tem assinatura, ou se alguma assinatura mudou.
      let relevante = false;
      for (const a of alvos) {
        if (!a.assinatura) {
          relevante = true;
          continue;
        }
        const nova = a.assinatura();
        if (nova !== this.assinaturas.get(a)) {
          this.assinaturas.set(a, nova);
          relevante = true;
        }
      }
      if (relevante) {
        this.aoMudar();
      }
    }, this.esperaMs);
  }

  parar(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];
    this.assinaturas.clear();
    this.pendentes.clear();
  }

  dispose(): void {
    this.parar();
  }
}
