# Drizza

Dashboard local para reunir contexto de trabalho agêntico: conversas, PRs e um briefing diário com links para as fontes.

## Começar

- Instale as dependências com pnpm install.
- Inicie o servidor de desenvolvimento com pnpm run dev.

## Estado deste starter

Este é um scaffold de interface em TypeScript com Vite e o template vanilla-ts. A tela mostra o recorte inicial do produto e estados vazios honestos. O GitHub já sincroniza PRs abertas (revisões pedidas e autoria) para o banco local em SQLite, e o briefing chega pelo endpoint MCP local e aparece no card "Briefing de hoje" sem recarregar a página. Slack e a geração do briefing ainda não estão conectados.

O uso de Vite e TypeScript aqui serve para iniciar a interface. Não decide o runtime local final, a autenticação dos providers nem o modelo de sincronização; esses pontos serão refinados antes de integrar dados reais.

Não há dados de exemplo nem credenciais no repositório.
