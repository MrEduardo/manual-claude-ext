import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { carregarEnv } from '../caminhos';
import { coletarAgentes, coletarComandos, coletarSkills } from '../coletores/comum';
import { coletarMcp } from '../coletores/mcp';
import { aplicarDescricoes, carregarDescricoes, resumir } from '../descricoes';
import { lerFrontmatter } from '../frontmatter';
import { ancora, gerarMarkdown } from '../manualMd';
import { aplicarSaude, interpretarMcpList } from '../saudeMcp';
import { Recurso } from '../tipos';

// Todos os nomes, URLs e "segredos" abaixo são fictícios.

function pastaTemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'manual-claude-'));
}

function escrever(arquivo: string, conteudo: string): void {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, conteudo, 'utf8');
}

describe('frontmatter', () => {
  it('lê valores simples e com aspas, ignora chaves indentadas', () => {
    const fm = lerFrontmatter('---\nname: exemplo\ndescription: "Consulta: tudo"\nmetadata:\n  origin: EXEMPLO\n---\n# corpo');
    assert.strictEqual(fm.name, 'exemplo');
    assert.strictEqual(fm.description, 'Consulta: tudo');
    assert.strictEqual(fm.origin, undefined);
  });

  it('dobra blocos ">-" em uma linha', () => {
    const fm = lerFrontmatter('---\nname: x\ndescription: >-\n  Primeira linha\n  segunda linha\nmodel: modelo-exemplo\n---');
    assert.strictEqual(fm.description, 'Primeira linha segunda linha');
    assert.strictEqual(fm.model, 'modelo-exemplo');
  });

  it('sem frontmatter devolve objeto vazio', () => {
    assert.deepStrictEqual(lerFrontmatter('# só título'), {});
  });
});

describe('resumir', () => {
  it('corta na primeira frase e em 5 palavras', () => {
    assert.strictEqual(resumir('Answer a quick side question without interrupting. Resume work.'), 'Answer a quick side question…');
    assert.strictEqual(resumir('Ferramenta de consulta.'), 'Ferramenta de consulta');
    assert.strictEqual(resumir(undefined), '');
  });
});

describe('coletores de arquivos', () => {
  it('lê comandos, agentes e skills com prefixo do plugin', () => {
    const raiz = pastaTemp();
    escrever(path.join(raiz, 'commands', 'consulta.md'), '---\ndescription: Ferramenta de consulta\n---\n');
    escrever(path.join(raiz, 'agents', 'automacao.md'), '---\nname: agente-de-automacao\ndescription: Agente de automação\n---\n');
    escrever(path.join(raiz, 'skills', 'pasta-skill', 'SKILL.md'), '---\nname: skill-exemplo\ndescription: Exemplo\n---\n');
    escrever(path.join(raiz, 'skills', '.trash', 'velha', 'SKILL.md'), '---\nname: velha\n---\n');

    const [cmd] = coletarComandos(path.join(raiz, 'commands'), 'Comandos — meu-plugin', 'meu-plugin:');
    assert.strictEqual(cmd.id, 'comando:/meu-plugin:consulta');
    assert.strictEqual(cmd.uso, 'Digite /meu-plugin:consulta');

    const [ag] = coletarAgentes(path.join(raiz, 'agents'), 'Agentes — meu-plugin', 'meu-plugin:');
    assert.strictEqual(ag.id, 'agente:meu-plugin:agente-de-automacao');

    const skills = coletarSkills(path.join(raiz, 'skills'), 'Skills de referência — meu-plugin', 'meu-plugin:', true);
    assert.deepStrictEqual(skills.map((s) => s.id), ['skill:meu-plugin:skill-exemplo']);
    assert.strictEqual(skills[0].referencia, true);
  });

  it('pasta inexistente devolve lista vazia', () => {
    assert.deepStrictEqual(coletarComandos(path.join(pastaTemp(), 'nada'), 'X', ''), []);
  });
});

describe('coletor de MCP', () => {
  it('nunca copia headers, env ou args (podem ter tokens)', () => {
    const raiz = pastaTemp();
    const arq = path.join(raiz, '.claude.json');
    escrever(
      arq,
      JSON.stringify({
        mcpServers: {
          'mcp-exemplo': { type: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer SEGREDO-FICTICIO-1' } },
          'mcp-local': { command: 'npx', args: ['servidor', '--api-key', 'SEGREDO-FICTICIO-2'], env: { TOKEN: 'SEGREDO-FICTICIO-3' } },
        },
        projects: { '/caminho/projeto-exemplo': { mcpServers: { 'mcp-do-projeto': { command: 'node' } } } },
      }),
    );
    const recursos = coletarMcp(arq, []);
    const texto = JSON.stringify(recursos);
    assert.ok(!texto.includes('SEGREDO'), 'vazou segredo no inventário');
    const ex = recursos.find((r) => r.id === 'mcp:mcp-exemplo');
    assert.ok(ex?.detalhe?.includes('mcp.example.com'));
    assert.strictEqual(ex?.uso, 'Ferramentas mcp__mcp-exemplo__*');
    assert.ok(recursos.find((r) => r.id === 'mcp:mcp-do-projeto')?.detalhe?.includes('local: projeto-exemplo'));
  });

  it('JSON corrompido vira item de erro, sem lançar exceção', () => {
    const arq = path.join(pastaTemp(), '.claude.json');
    escrever(arq, '{ quebrado');
    const [r] = coletarMcp(arq, []);
    assert.strictEqual(r.status, 'erro');
  });
});

describe('saúde dos MCPs', () => {
  const saida = [
    'Checking MCP server health…',
    '',
    'conector.exemplo Ferramenta de consulta: https://api.example.com/mcp - √ Connected',
    'plugin:meu-plugin:ferramenta: npx -y pacote-exemplo - √ Connected',
    'mcp-exemplo: https://mcp.example.com (HTTP) - ! Needs authentication',
    'mcp-local: cmd /c npx -y pacote-local - × Failed to connect',
  ].join('\n');

  it('interpreta cada linha', () => {
    const s = interpretarMcpList(saida);
    assert.deepStrictEqual(
      s.map((x) => [x.nome, x.status]),
      [
        ['conector.exemplo Ferramenta de consulta', 'ok'],
        ['plugin:meu-plugin:ferramenta', 'ok'],
        ['mcp-exemplo', 'aviso'],
        ['mcp-local', 'erro'],
      ],
    );
    assert.strictEqual(s[2].texto, 'Needs authentication');
  });

  it('atualiza status e adiciona conectores que não estão em arquivo', () => {
    const recursos: Recurso[] = [
      { id: 'mcp:mcp-exemplo', nome: 'mcp-exemplo', categoria: 'Servidores MCP', descricao: '', uso: '', status: 'ok' },
    ];
    aplicarSaude(recursos, interpretarMcpList(saida));
    assert.strictEqual(recursos[0].status, 'aviso');
    const conector = recursos.find((r) => r.id === 'mcp:conector.exemplo Ferramenta de consulta');
    assert.strictEqual(conector?.uso, 'Ferramentas mcp__conector_exemplo_Ferramenta_de_consulta__*');
  });
});

describe('descrições', () => {
  it('cria o arquivo do usuário a partir do padrão e deixa o usuário sobrescrever', () => {
    const raiz = pastaTemp();
    const padrao = path.join(raiz, 'padrao.json');
    const usuario = path.join(raiz, 'sub', 'usuario.json');
    escrever(padrao, JSON.stringify({ $comentario: 'x', a: 'Padrão A', b: { descricao: 'Padrão B', grupo: 'G1' } }));

    let r = carregarDescricoes(usuario, padrao);
    assert.ok(fs.existsSync(usuario));
    assert.strictEqual(r.mapa.a.descricao, 'Padrão A');

    escrever(usuario, JSON.stringify({ b: 'Minha B' }));
    r = carregarDescricoes(usuario, padrao);
    assert.deepStrictEqual(r.mapa.b, { descricao: 'Minha B', grupo: 'G1' });
  });

  it('JSON do usuário inválido usa o padrão e devolve erro', () => {
    const raiz = pastaTemp();
    const padrao = path.join(raiz, 'padrao.json');
    const usuario = path.join(raiz, 'usuario.json');
    escrever(padrao, '{"a":"A"}');
    escrever(usuario, '{ inválido');
    const r = carregarDescricoes(usuario, padrao);
    assert.ok(r.erro);
    assert.strictEqual(r.mapa.a.descricao, 'A');
  });

  it('marca ⚠ quem não tem descrição curta, exceto skills de referência', () => {
    const base = { categoria: 'C', descricao: '', uso: '', status: 'ok' as const, descricaoOriginal: 'Faz algo muito útil hoje mesmo.' };
    const recursos: Recurso[] = [
      { ...base, id: 'x', nome: 'x' },
      { ...base, id: 'y', nome: 'y', referencia: true },
      { ...base, id: 'z', nome: 'z' },
    ];
    aplicarDescricoes(recursos, { z: { descricao: 'Curta', grupo: 'G' } });
    assert.strictEqual(recursos[0].status, 'aviso');
    assert.strictEqual(recursos[0].descricao, 'Faz algo muito útil hoje…');
    assert.strictEqual(recursos[1].status, 'ok');
    assert.deepStrictEqual([recursos[2].descricao, recursos[2].grupo, recursos[2].status], ['Curta', 'G', 'ok']);
  });

  it('o arquivo padrão publicado só tem exemplos fictícios', () => {
    const arq = path.join(__dirname, '..', '..', 'resources', 'descricoes-padrao.json');
    const ids = Object.keys(JSON.parse(fs.readFileSync(arq, 'utf8'))).filter((k) => !k.startsWith('$'));
    assert.deepStrictEqual(ids.sort(), ['agente:agente-de-automacao', 'comando:/meu-plugin:exemplo', 'mcp:mcp-exemplo', 'skill:minha-skill']);
  });
});

describe('.env', () => {
  it('lê CHAVE=valor, ignora comentários e vazios e não sobrescreve o ambiente', () => {
    const arq = path.join(pastaTemp(), '.env');
    escrever(arq, '# comentário\nMANUAL_A=/caminho/exemplo\nMANUAL_B=\nMANUAL_C="com aspas"\nMANUAL_D=novo\n');
    const amb: NodeJS.ProcessEnv = { MANUAL_D: 'existente' };
    carregarEnv(arq, amb);
    assert.deepStrictEqual(amb, { MANUAL_A: '/caminho/exemplo', MANUAL_C: 'com aspas', MANUAL_D: 'existente' });
  });

  it('arquivo ausente não faz nada', () => {
    const amb: NodeJS.ProcessEnv = {};
    carregarEnv(path.join(pastaTemp(), '.env'), amb);
    assert.deepStrictEqual(amb, {});
  });
});

describe('gerador do manual', () => {
  const recursos: Recurso[] = [
    { id: 'nativo:/mcp', nome: '/mcp', categoria: 'Comandos nativos', descricao: 'Gerencia MCPs', uso: 'Digite /mcp', status: 'ok' },
    { id: 'mcp:a', nome: 'a', categoria: 'Servidores MCP', descricao: 'Usa | barra', uso: 'x', status: 'erro', novo: true },
    {
      id: 'skill:meu-plugin:s',
      nome: '/meu-plugin:s',
      categoria: 'Skills de referência — meu-plugin',
      descricao: 'S',
      uso: 'Automático',
      status: 'ok',
      referencia: true,
    },
  ];
  const md = gerarMarkdown(recursos, new Date(2026, 0, 1, 12, 0), '~/.claude/manual-descricoes.json');

  it('tem índice, seções na ordem e escapa a barra vertical', () => {
    assert.ok(md.includes('- [Comandos nativos](#comandos-nativos) (1)'));
    assert.ok(md.indexOf('## Comandos nativos') < md.indexOf('## Servidores MCP'));
    assert.ok(md.includes('| ✗ | `a` | 🆕 Usa \\| barra | x |'));
  });

  it('recolhe skills de referência em <details>', () => {
    const i = md.indexOf('## Skills de referência — meu-plugin');
    assert.ok(i > 0 && md.indexOf('<details>', i) > i);
  });

  it('âncora no estilo do GitHub', () => {
    assert.strictEqual(ancora('Comandos — meu-plugin'), 'comandos--meu-plugin');
    assert.strictEqual(ancora('Servidores MCP'), 'servidores-mcp');
  });
});
