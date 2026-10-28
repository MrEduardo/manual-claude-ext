import * as fs from 'fs';
import * as path from 'path';
import { existe } from '../caminhos';
import { lerFrontmatter } from '../frontmatter';
import { mensagemDeErro, Recurso } from '../tipos';

/** Arquivos .md diretamente dentro de `dir` (sem subpastas). Pasta ausente = lista vazia. */
export function listarMd(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** Subpastas de `dir` que não começam com ponto (ignora .trash, .staging…). */
export function listarPastas(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** Lê `name` e `description` do frontmatter. Nunca lança: devolve `erro` se não conseguir ler. */
export function lerMetadados(arquivo: string): { nome?: string; descricao?: string; erro?: string } {
  try {
    const fm = lerFrontmatter(fs.readFileSync(arquivo, 'utf8'));
    return { nome: fm.name || undefined, descricao: fm.description || undefined };
  } catch (e) {
    return { erro: `Não foi possível ler o arquivo: ${mensagemDeErro(e)}` };
  }
}

/** Item ✗ usado quando uma fonte inteira falha (ex.: JSON corrompido). */
export function itemErro(categoria: string, nome: string, origem: string | undefined, msg: string): Recurso {
  return {
    id: `erro:${categoria}:${nome}`,
    nome,
    categoria,
    descricao: 'Erro ao ler',
    uso: '—',
    origem,
    status: 'erro',
    detalhe: msg,
  };
}

/** Comandos de barra: um .md por comando. `prefixo` = "nome-do-plugin:" para plugins, "" para os seus. */
export function coletarComandos(dir: string, categoria: string, prefixo: string): Recurso[] {
  return listarMd(dir).map((arq) => {
    const m = lerMetadados(arq);
    const nome = `/${prefixo}${m.nome ?? path.basename(arq, '.md')}`;
    return {
      id: `comando:${nome}`,
      nome,
      categoria,
      descricao: '',
      descricaoOriginal: m.descricao,
      uso: `Digite ${nome}`,
      origem: arq,
      status: m.erro ? 'erro' : 'ok',
      detalhe: m.erro,
    };
  });
}

/** Subagentes: um .md por agente. */
export function coletarAgentes(dir: string, categoria: string, prefixo: string): Recurso[] {
  return listarMd(dir).map((arq) => {
    const m = lerMetadados(arq);
    const nome = `${prefixo}${m.nome ?? path.basename(arq, '.md')}`;
    return {
      id: `agente:${nome}`,
      nome,
      categoria,
      descricao: '',
      descricaoOriginal: m.descricao,
      uso: 'Subagente (o Claude delega)',
      origem: arq,
      status: m.erro ? 'erro' : 'ok',
      detalhe: m.erro,
    };
  });
}

/** Skills: uma pasta por skill, com SKILL.md dentro. */
export function coletarSkills(dir: string, categoria: string, prefixo: string, referencia = false): Recurso[] {
  const saida: Recurso[] = [];
  for (const pasta of listarPastas(dir)) {
    const arq = path.join(pasta, 'SKILL.md');
    if (!existe(arq)) {
      continue;
    }
    const m = lerMetadados(arq);
    const base = `${prefixo}${m.nome ?? path.basename(pasta)}`;
    saida.push({
      id: `skill:${base}`,
      nome: `/${base}`,
      categoria,
      descricao: '',
      descricaoOriginal: m.descricao,
      uso: referencia ? `Automático ou /${base}` : `Digite /${base}`,
      origem: arq,
      status: m.erro ? 'erro' : 'ok',
      detalhe: m.erro,
      referencia: referencia || undefined,
    });
  }
  return saida;
}
