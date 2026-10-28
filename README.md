# Manual Claude

Extensão do VS Code que mantém um **manual sempre atualizado de tudo o que o seu [Claude Code](https://claude.com/claude-code) sabe fazer**: comandos `/`, skills, subagentes, plugins e servidores MCP.

Quem instala MCPs, plugins e agentes acaba com dezenas (às vezes centenas) de recursos e esquece o que cada um faz. Esta extensão descobre tudo sozinha, organiza por categoria, descreve cada item em até 5 palavras e atualiza o manual sempre que você instala ou remove algo.

```
MANUAL CLAUDE: RECURSOS                      ▶  🔍  📖  ✏️
  🕘 Última verificação: 01/01/2026 12:00       42 recursos
  ▸ Comandos nativos                            26
  ▾ Comandos — meu-plugin                       5 · ⚠ 1
     ▾ Consultas
         ✓ /meu-plugin:exemplo   Ferramenta de consulta
         ⚠ /meu-plugin:novo      (sem descrição curta)
  ▾ Agentes do usuário                          1
         ✓ agente-de-automacao   🆕 Agente de automação
  ▾ Servidores MCP                              2 · ⚠ 1
         ✓ mcp-exemplo           Ferramenta de consulta
         ⚠ outro-mcp             MCP de exemplo
  ▸ Skills de referência — meu-plugin           8
```

*(Os nomes acima são exemplos fictícios. O painel mostra o que estiver instalado no seu ambiente.)*

## Recursos

- **Ícone próprio na Activity Bar** com um painel em árvore, agrupado por categoria e finalidade.
- **Status de cada item:**

  | Ícone | Significado |
  |:-:|---|
  | ✓ | OK |
  | ⚠ | Falta descrição curta, ou o MCP precisa de login |
  | ✗ | Erro: arquivo ilegível ou MCP com falha |
  | 🆕 | Adicionado nos últimos dias |

- **Saúde dos MCPs:** roda `claude mcp list` em segundo plano e mostra se cada servidor está conectado.
- **Manual em Markdown:** gera um `.md` com índice, uma tabela por categoria e skills de referência numa seção recolhida. Dá para exportar para PDF.
- **Atualização automática:** observa os arquivos de configuração do Claude Code e regera o manual quando algo muda. Também roda ao abrir o VS Code.
- **Busca rápida:** procura por nome, função ou categoria.
- **Clique para abrir:** abre o arquivo de origem de cada comando, skill ou agente.
- **Notificação** ao terminar a verificação, com o resumo de novos e removidos.

## Instalação

Pré-requisitos: [Node.js](https://nodejs.org) 20 ou mais recente, VS Code 1.96 ou mais recente, e o Claude Code instalado.

```bash
git clone <url-deste-repositorio>
cd manual-claude-ext
npm install
npm run empacotar                              # gera manual-claude-<versão>.vsix
code --install-extension manual-claude-0.1.0.vsix
```

Recarregue o VS Code (`Ctrl+Shift+P` → **Developer: Reload Window**). O ícone de livro com raio aparece na barra lateral.

## Como usar

| Ação | Como |
|---|---|
| Rodar verificação | Botão ▶ no painel, ou `Ctrl+Alt+M` |
| Buscar um recurso | Botão 🔍 |
| Abrir o manual | Botão 📖 (abre a pré-visualização do Markdown) |
| Editar descrições curtas | Botão ✏️ |
| Abrir o arquivo de origem | Clique no item |
| Copiar o nome do comando | Ícone de cópia ao lado do item |

### Descrições curtas

As descrições originais costumam ser parágrafos inteiros. O manual usa descrições de até 5 palavras, guardadas em `~/.claude/manual-descricoes.json`. Esse arquivo é criado na primeira execução a partir de [`resources/descricoes-padrao.json`](resources/descricoes-padrao.json), que só traz exemplos do formato:

```json
{
  "mcp:mcp-exemplo": "Ferramenta de consulta",
  "agente:agente-de-automacao": "Agente de automação",
  "comando:/meu-plugin:exemplo": { "descricao": "Ferramenta de consulta", "grupo": "Consultas" }
}
```

Recurso sem descrição aparece com ⚠ e um resumo automático. Ao salvar o arquivo, o manual se atualiza. O arquivo fica no seu computador e nunca entra no repositório.

Formato dos ids: `comando:/nome`, `agente:plugin:nome`, `skill:plugin:nome`, `mcp:nome`, `nativo:/nome`. O id de cada item também aparece no tooltip do painel.

## De onde vêm os dados

| Categoria | Fonte |
|---|---|
| Comandos nativos, Skills nativas, CLI | Lista fixa em [`src/coletores/nativos.ts`](src/coletores/nativos.ts) (não existem como arquivo) |
| Skills sincronizadas da conta | `~/.claude/skills/synced/*/<skill>/SKILL.md` |
| Skills, Comandos e Agentes do usuário | `~/.claude/skills`, `~/.claude/commands`, `~/.claude/agents` |
| … do projeto | `.claude/` de cada pasta aberta no VS Code |
| Comandos e Agentes de plugins | `~/.claude/plugins/installed_plugins.json` → `commands/`, `agents/` |
| Skills de referência | `skills/` de cada plugin |
| Servidores MCP | `~/.claude.json`, `.mcp.json` do projeto e dos plugins, mais o status do `claude mcp list` |

## Configurações

| Configuração | Variável de ambiente | Padrão |
|---|---|---|
| `manualClaude.caminhoManual` | `MANUAL_CLAUDE_CAMINHO_MANUAL` | `~/.claude/manual-comandos.md` |
| `manualClaude.caminhoClaude` | `MANUAL_CLAUDE_CAMINHO_CLAUDE` | vazio = detecta automaticamente |
| `manualClaude.verificarAoIniciar` | — | `true` |
| `manualClaude.atualizacaoAutomatica` | — | `true` |
| `manualClaude.verificarSaudeMcp` | — | `true` |
| `manualClaude.diasNovo` | — | `7` |

**Prioridade dos caminhos:** a configuração do VS Code (se você a definiu) vem primeiro, depois a variável de ambiente, depois o padrão. Caminhos pessoais ficam nas suas configurações do VS Code ou num `.env` local, nunca no código. Para desenvolver, copie [`.env.example`](.env.example) para `.env`; ele é lido no modo F5 e está no `.gitignore`.

## Privacidade e segurança

- Tudo roda **localmente**. Nada é enviado para fora.
- O `~/.claude.json` pode conter tokens nos `headers`, `env` ou `args` dos MCPs. **O coletor nunca lê esses campos**: do MCP, registra só o nome, o tipo e o host da URL ou o nome do executável. Um teste automatizado garante que nada disso vaza para o manual.
- Conteúdo de terceiros (descrições de plugins) é escapado antes de aparecer nos tooltips.
- O manual gerado, o arquivo de descrições e o `.env` são pessoais e ficam fora do git (veja o [`.gitignore`](.gitignore)).

## Estrutura do código

```
src/
├── extension.ts          ativação, comandos, busca
├── verificacao.ts        ★ orquestra a verificação (comece por aqui)
├── coletores/            uma fonte de dados por arquivo
│   ├── index.ts          lista de coletores, para adicionar uma fonte nova
│   ├── nativos.ts        lista fixa de comandos nativos
│   ├── usuario.ts        ~/.claude e .claude do projeto
│   ├── plugins.ts        plugins instalados
│   ├── mcp.ts            servidores MCP (sem headers/env/args)
│   └── comum.ts          leitura de comandos, agentes e skills
├── descricoes.ts         descrições curtas e resumo automático
├── saudeMcp.ts           claude mcp list
├── manualMd.ts           gera o Markdown
├── arvore.ts             painel (TreeView)
├── observador.ts         atualização automática (fs.watch + debounce)
├── caminhos.ts           locais do Claude Code e leitura do .env
└── test/                 testes (mocha), só com dados fictícios
```

O núcleo (coletores, descrições, Markdown, saúde) não depende do VS Code, então é testado direto com mocha.

## Desenvolvimento

```bash
npm install
npm test          # compila e roda os testes
```

Para testar a extensão, abra a pasta no VS Code e aperte **F5**. Isso abre uma janela de teste com a extensão carregada; nela, `Ctrl+R` recarrega depois de cada mudança.

## Licença

[MIT](LICENSE)
