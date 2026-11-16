# Drizza

Dashboard local para reunir contexto de trabalho agêntico: conversas, PRs e um briefing diário com links para as fontes.

## Começar

- Instale as dependências com pnpm install.
- Inicie o servidor de desenvolvimento com pnpm run dev.

## Estado deste starter

Este é um scaffold de interface em TypeScript com Vite e o template vanilla-ts. A tela mostra o recorte inicial do produto e estados vazios honestos. O GitHub já sincroniza PRs abertas (revisões pedidas e autoria) para o banco local em SQLite, e o briefing chega pelo endpoint MCP local e aparece no card "Briefing de hoje" sem recarregar a página. Quem escreve o briefing é o seu agente, pelo skill abaixo; o Drizza não chama nenhum modelo. Slack ainda não está conectado.

O uso de Vite e TypeScript aqui serve para iniciar a interface. Não decide o runtime local final, a autenticação dos providers nem o modelo de sincronização; esses pontos serão refinados antes de integrar dados reais.

## Briefing pelo seu agente

O skill [`skills/drizza-briefing/SKILL.md`](skills/drizza-briefing/SKILL.md) ensina o Claude Code e o Codex a ler o dia (GitHub via `gh` e o que mais o agente já tiver conectado), montar o briefing e enviá-lo pelas tools `get_today` e `push_briefing` do MCP local. Antes, registre o MCP com os comandos que o `drizza` imprime ao subir.

Para instalar, copie o arquivo para a pasta de skills de cada agente, a partir da raiz do repositório:

```sh
mkdir -p ~/.claude/skills/drizza-briefing && cp skills/drizza-briefing/SKILL.md ~/.claude/skills/drizza-briefing/
```

```sh
mkdir -p ~/.codex/skills/drizza-briefing && cp skills/drizza-briefing/SKILL.md ~/.codex/skills/drizza-briefing/
```

Depois rode `/drizza-briefing` no Claude Code ou `$drizza-briefing` no Codex. O botão "Copiar comando do briefing" da tela copia esse comando.

Não há dados de exemplo nem credenciais no repositório.
