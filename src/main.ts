import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Elemento raiz do Driza não encontrado.')
}

const today = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date())

app.innerHTML = [
  '<div class="app-shell">',
  '  <header class="topbar">',
  '    <a class="brand" href="#home" aria-label="Driza, início">',
  '      <img src="/driza-mark.svg" alt="" width="34" height="34" />',
  '      <span>driza</span>',
  '    </a>',
  '    <p class="brand-promise">seu dia, no seu rumo</p>',
  '    <div class="local-state"><span class="state-dot"></span><span>Local · sem sincronização</span></div>',
  '  </header>',
  '',
  '  <main id="home">',
  '    <section class="welcome" aria-labelledby="welcome-title">',
  '      <div class="welcome-copy">',
  '        <p class="eyebrow" id="today"></p>',
  '        <h1 id="welcome-title">Bom dia<span class="accent">.</span><br />Vamos ao que importa.</h1>',
  '        <p class="welcome-subtitle">Conversas, PRs e contexto de trabalho em um lugar só.</p>',
  '      </div>',
  '      <div class="welcome-actions">',
  '        <button class="button button-primary" id="brief-button" type="button">',
  '          <span>Me atualize para hoje</span><span class="button-arrow" aria-hidden="true">↗</span>',
  '        </button>',
  '        <button class="button button-secondary" id="sync-button" type="button">',
  '          <span class="sync-symbol" aria-hidden="true">↻</span><span>Sync Now</span>',
  '        </button>',
  '        <p class="action-note">Você escolhe quando os dados são atualizados.</p>',
  '      </div>',
  '    </section>',
  '',
  '    <p class="feedback" id="feedback" role="status" aria-live="polite" hidden></p>',
  '',
  '    <section class="briefing-section" id="briefing" aria-labelledby="briefing-title">',
  '      <div class="section-heading">',
  '        <div><p class="eyebrow">SEU PONTO DE PARTIDA</p><h2 id="briefing-title">Briefing de hoje</h2></div>',
  '        <span class="quiet-label">Aguardando fontes</span>',
  '      </div>',
  '      <article class="briefing-card">',
  '        <div class="briefing-orbit" aria-hidden="true"><span></span><span></span><span></span></div>',
  '        <div class="briefing-copy">',
  '          <p class="briefing-kicker">O dia começa com clareza</p>',
  '          <h3>Sua atualização aparece aqui.</h3>',
  '          <p>Conecte Slack e GitHub para reunir o que merece sua atenção, com links para cada fonte.</p>',
  '        </div>',
  '        <div class="briefing-meta"><span class="meta-mark"></span><span>Nenhum dado sincronizado</span></div>',
  '      </article>',
  '    </section>',
  '',
  '    <section class="work-grid" id="overview" aria-label="Visão do trabalho">',
  '      <article class="work-card" id="slack">',
  '        <div class="card-topline"><span class="card-icon slack-icon" aria-hidden="true">S</span><span class="quiet-label">SLACK</span></div>',
  '        <h2>Conversas em foco</h2>',
  '        <p class="card-description">Threads em que você participou ou foi mencionado.</p>',
  '        <div class="empty-state"><span class="empty-icon" aria-hidden="true">↗</span><span>Nenhuma conversa sincronizada</span></div>',
  '      </article>',
  '      <article class="work-card" id="reviews">',
  '        <div class="card-topline"><span class="card-icon review-icon" aria-hidden="true">⌁</span><span class="quiet-label">GITHUB · REVIEW</span></div>',
  '        <h2>Revisões pendentes</h2>',
  '        <p class="card-description">PRs que aguardam sua atenção.</p>',
  '        <div class="empty-state"><span class="empty-icon" aria-hidden="true">⌁</span><span>Nenhuma PR sincronizada</span></div>',
  '      </article>',
  '      <article class="work-card" id="in-progress">',
  '        <div class="card-topline"><span class="card-icon progress-icon" aria-hidden="true">◷</span><span class="quiet-label">GITHUB · EM ANDAMENTO</span></div>',
  '        <h2>Seu trabalho em curso</h2>',
  '        <p class="card-description">PRs de sua autoria que ainda estão abertas.</p>',
  '        <div class="empty-state"><span class="empty-icon" aria-hidden="true">◷</span><span>Nenhuma PR sincronizada</span></div>',
  '      </article>',
  '    </section>',
  '',
  '    <section class="lower-grid" aria-label="Sincronização e fontes">',
  '      <article class="panel timeline-panel" aria-labelledby="timeline-title">',
  '        <div class="section-heading compact-heading"><div><p class="eyebrow">ATIVIDADE</p><h2 id="timeline-title">Linha do sync</h2></div><span class="quiet-label">Hoje</span></div>',
  '        <div class="timeline-empty"><span class="timeline-node" aria-hidden="true"></span><div><strong>Pronto quando você estiver.</strong><p>O histórico de atualizações aparecerá aqui.</p></div></div>',
  '      </article>',
  '      <article class="panel sources-panel" aria-labelledby="sources-title">',
  '        <div class="section-heading compact-heading"><div><p class="eyebrow">SUAS FONTES</p><h2 id="sources-title">Conexões</h2></div><span class="quiet-label">2 pendentes</span></div>',
  '        <div class="source-row"><span class="source-brand slack-brand">S</span><span class="source-name">Slack</span><span class="source-status">Não conectado</span></div>',
  '        <div class="source-row"><span class="source-brand github-brand">GH</span><span class="source-name">GitHub</span><span class="source-status">Não conectado</span></div>',
  '        <p class="source-note">As conexões serão configuradas em uma próxima etapa.</p>',
  '      </article>',
  '    </section>',
  '  </main>',
  '',
  '  <footer class="footer"><span>driza</span><span>Seu trabalho, no seu rumo.</span><span>Local-first · somente leitura</span></footer>',
  '</div>',
].join('')

const todayLabel = document.querySelector<HTMLElement>('#today')
const feedback = document.querySelector<HTMLParagraphElement>('#feedback')
const syncButton = document.querySelector<HTMLButtonElement>('#sync-button')
const briefButton = document.querySelector<HTMLButtonElement>('#brief-button')

if (todayLabel) {
  todayLabel.textContent = today.toLocaleUpperCase('pt-BR')
}

const announce = (message: string): void => {
  if (!feedback) return

  feedback.textContent = message
  feedback.hidden = false
}

syncButton?.addEventListener('click', () => {
  announce('Nenhum dado foi sincronizado. Conecte Slack e GitHub para iniciar o sync.')
})

briefButton?.addEventListener('click', () => {
  announce('O briefing ainda não pode ser gerado: Slack e GitHub não estão conectados.')
})
