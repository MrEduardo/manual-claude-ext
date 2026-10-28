import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { existe, expandirTil, HOME } from './caminhos';
import { nomeFerramentas } from './coletores/mcp';
import { juntar, Recurso, Status } from './tipos';

export interface SaudeMcp {
  nome: string;
  status: Status;
  /** Texto original do Claude Code (ex.: "Connected", "Needs authentication"). */
  texto: string;
}

function classificar(texto: string): Status {
  const t = texto.toLowerCase();
  if (t.includes('fail') || t.includes('error') || t.includes('erro')) {
    return 'erro';
  }
  if (t.includes('auth') || t.includes('pending')) {
    return 'aviso';
  }
  return t.includes('connected') || t.includes('conectado') ? 'ok' : 'aviso';
}

/**
 * Interpreta a saída do `claude mcp list`. Cada servidor vem numa linha:
 *   "mcp-exemplo: https://mcp.example.com/mcp (HTTP) - √ Connected"
 *   "plugin:meu-plugin:ferramenta: npx -y pacote-exemplo - ! Needs authentication"
 * O nome termina no primeiro ": " e o status vem depois do último " - ".
 */
export function interpretarMcpList(saida: string): SaudeMcp[] {
  const resultado: SaudeMcp[] = [];
  for (const bruta of saida.split(/\r?\n/)) {
    const linha = bruta.trim();
    const i = linha.indexOf(': ');
    const j = linha.lastIndexOf(' - ');
    if (i <= 0 || j <= i) {
      continue;
    }
    const texto = linha.slice(j + 3).replace(/^[^\p{L}]+/u, '').trim(); // tira √ ! × do começo
    resultado.push({ nome: linha.slice(0, i).trim(), status: classificar(texto), texto });
  }
  return resultado;
}

function versao(nomePasta: string): number[] {
  return (/(\d+)\.(\d+)\.(\d+)/.exec(nomePasta) ?? []).slice(1).map(Number);
}

function compararVersoes(a: number[], b: number[]): number {
  for (let k = 0; k < 3; k++) {
    const d = (a[k] ?? 0) - (b[k] ?? 0);
    if (d) {
      return d;
    }
  }
  return 0;
}

/**
 * Onde está o executável do Claude Code:
 * 1. a configuração manualClaude.caminhoClaude;
 * 2. a versão mais nova da extensão do Claude Code no VS Code;
 * 3. "claude" no PATH.
 */
export function localizarClaude(configurado = '', dirExtensoes = path.join(HOME, '.vscode', 'extensions')): string {
  if (configurado.trim()) {
    return expandirTil(configurado.trim());
  }
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  try {
    const pastas = fs
      .readdirSync(dirExtensoes)
      .filter((n) => n.startsWith('anthropic.claude-code-'))
      .sort((a, b) => compararVersoes(versao(b), versao(a)));
    for (const p of pastas) {
      const candidato = path.join(dirExtensoes, p, 'resources', 'native-binary', exe);
      if (existe(candidato)) {
        return candidato;
      }
    }
  } catch {
    // Sem pasta de extensões: tenta o PATH.
  }
  return 'claude';
}

/** Roda `claude mcp list` e devolve a saída. Pode levar dezenas de segundos (ele conecta em cada MCP). */
export function executarMcpList(exe: string, cwd: string, timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      ['mcp', 'list'],
      {
        cwd,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        // "claude" sem .exe no Windows costuma ser um .cmd, que precisa de shell.
        shell: process.platform === 'win32' && !exe.toLowerCase().endsWith('.exe'),
      },
      (erro, stdout, stderr) => {
        if (erro && !stdout) {
          const e = erro as NodeJS.ErrnoException & { killed?: boolean };
          if (e.code === 'ENOENT') {
            reject(new Error(`Claude Code não encontrado (${exe}). Ajuste a configuração manualClaude.caminhoClaude.`));
          } else if (e.killed) {
            reject(new Error('o "claude mcp list" demorou demais e foi interrompido'));
          } else {
            reject(new Error(String(stderr || erro.message).trim()));
          }
          return;
        }
        resolve(String(stdout));
      },
    );
  });
}

/**
 * Atualiza o status dos MCPs com o resultado da checagem.
 * Servidores que só aparecem na checagem (ex.: conectores do claude.ai) são adicionados.
 */
export function aplicarSaude(recursos: Recurso[], saude: SaudeMcp[]): void {
  const verificados = new Set<string>();
  for (const s of saude) {
    const id = `mcp:${s.nome}`;
    verificados.add(id);
    const r = recursos.find((x) => x.id === id);
    if (r) {
      if (r.status !== 'erro') {
        r.status = s.status;
      }
      r.detalhe = juntar(r.detalhe, s.texto);
    } else {
      recursos.push({
        id,
        nome: s.nome,
        categoria: 'Servidores MCP',
        descricao: '',
        uso: `Ferramentas ${nomeFerramentas(s.nome)}`,
        status: s.status,
        detalhe: juntar('conector externo', s.texto),
      });
    }
  }
  for (const r of recursos) {
    if (r.id.startsWith('mcp:') && !verificados.has(r.id)) {
      r.detalhe = juntar(r.detalhe, 'status não verificado');
    }
  }
}
