import * as fs from 'fs';
import * as path from 'path';
import { existe } from './caminhos';
import { juntar, mensagemDeErro, Recurso } from './tipos';

/**
 * Uma entrada do manual-descricoes.json. No arquivo, o valor pode ser só o texto
 * ("mcp:mcp-exemplo": "Ferramenta de consulta") ou um objeto com grupo:
 * ("comando:/meu-plugin:exemplo": { "descricao": "Ferramenta de consulta", "grupo": "Consultas" }).
 */
export interface EntradaDescricao {
  descricao?: string;
  grupo?: string;
}

export type MapaDescricoes = Record<string, EntradaDescricao>;

/** Limite de palavras das descrições curtas. */
export const MAX_PALAVRAS = 5;

export function normalizarMapa(bruto: unknown): MapaDescricoes {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new Error('o arquivo deve conter um objeto JSON { "id": "descrição" }');
  }
  const saida: MapaDescricoes = {};
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (chave.startsWith('$')) {
      continue; // "$comentario" e afins
    }
    if (typeof valor === 'string') {
      saida[chave] = { descricao: valor };
    } else if (valor && typeof valor === 'object') {
      const v = valor as Record<string, unknown>;
      saida[chave] = {
        descricao: typeof v.descricao === 'string' ? v.descricao : undefined,
        grupo: typeof v.grupo === 'string' ? v.grupo : undefined,
      };
    }
  }
  return saida;
}

function lerJson(arquivo: string): unknown {
  return JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, ''));
}

/**
 * Carrega as descrições: as padrão (que vêm com a extensão) e, por cima, as suas.
 * Se o seu arquivo ainda não existe, ele é criado como cópia do padrão.
 * Um JSON inválido não interrompe a verificação: as padrão são usadas e o erro é devolvido.
 */
export function carregarDescricoes(arqUsuario: string, arqPadrao: string): { mapa: MapaDescricoes; erro?: string } {
  let padrao: MapaDescricoes = {};
  try {
    padrao = normalizarMapa(lerJson(arqPadrao));
  } catch {
    // Sem as padrão, seguimos só com as do usuário.
  }

  if (!existe(arqUsuario)) {
    try {
      fs.mkdirSync(path.dirname(arqUsuario), { recursive: true });
      fs.copyFileSync(arqPadrao, arqUsuario);
    } catch (e) {
      return { mapa: padrao, erro: `Não foi possível criar ${arqUsuario}: ${mensagemDeErro(e)}` };
    }
  }

  try {
    const usuario = normalizarMapa(lerJson(arqUsuario));
    const mapa: MapaDescricoes = { ...padrao };
    for (const [id, e] of Object.entries(usuario)) {
      mapa[id] = {
        descricao: e.descricao ?? padrao[id]?.descricao,
        grupo: e.grupo ?? padrao[id]?.grupo,
      };
    }
    return { mapa };
  } catch (e) {
    return { mapa: padrao, erro: `manual-descricoes.json inválido: ${mensagemDeErro(e)}` };
  }
}

/** Ordem dos grupos = ordem em que aparecem pela primeira vez no arquivo de descrições. */
export function ordemDosGrupos(mapa: MapaDescricoes): string[] {
  const grupos: string[] = [];
  for (const e of Object.values(mapa)) {
    if (e.grupo && !grupos.includes(e.grupo)) {
      grupos.push(e.grupo);
    }
  }
  return grupos;
}

/**
 * Resumo automático para quem não tem descrição curta:
 * pega a primeira frase/oração e corta em `max` palavras.
 */
export function resumir(texto: string | undefined, max = MAX_PALAVRAS): string {
  if (!texto) {
    return '';
  }
  const primeira = texto.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s|\s[—–]\s|\s-\s|:\s/)[0];
  const palavras = primeira.replace(/[.,;:!?]+$/, '').split(' ').filter(Boolean);
  return palavras.length > max ? palavras.slice(0, max).join(' ') + '…' : palavras.join(' ');
}

/**
 * Aplica descrição curta e grupo a cada recurso.
 * Prioridade: manual-descricoes.json > descrição fixa do coletor > resumo automático.
 * Sem descrição curta, o recurso fica com ⚠ (exceto skills de referência, que usam o resumo).
 */
export function aplicarDescricoes(recursos: Recurso[], mapa: MapaDescricoes): void {
  for (const r of recursos) {
    const e = mapa[r.id];
    if (e?.grupo) {
      r.grupo = e.grupo;
    }
    if (e?.descricao) {
      r.descricao = e.descricao;
      continue;
    }
    if (r.descricao) {
      continue;
    }
    r.descricao = resumir(r.descricaoOriginal) || '(sem descrição)';
    if (!r.referencia && r.status === 'ok') {
      r.status = 'aviso';
      r.detalhe = juntar(r.detalhe, 'Sem descrição curta: adicione no manual-descricoes.json');
    }
  }
}
