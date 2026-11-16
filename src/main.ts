import './style.css'

type ThemeFamily = 'drizza' | 'violeeter'
type Appearance = 'light' | 'dark'
type LayoutWidth = '100' | '70' | '50'

const readPreference = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const savePreference = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

const savedFamily = readPreference('drizza-theme-family')
const savedAppearance = readPreference('drizza-appearance')
const savedLayoutWidth = readPreference('drizza-layout-width')
const initialThemeFamily: ThemeFamily = savedFamily === 'violeeter' ? 'violeeter' : 'drizza'
const initialAppearance: Appearance = savedAppearance === 'dark' ? 'dark' : 'light'
const initialLayoutWidth: LayoutWidth = savedLayoutWidth === '70' || savedLayoutWidth === '50' ? savedLayoutWidth : '100'

document.documentElement.dataset.themeFamily = initialThemeFamily
document.documentElement.dataset.appearance = initialAppearance
document.documentElement.dataset.layoutWidth = initialLayoutWidth

const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
const themeColors: Record<ThemeFamily, Record<Appearance, string>> = {
  drizza: { light: '#F4F3ED', dark: '#121B16' },
  violeeter: { light: '#FAF8FE', dark: '#24203F' },
}
themeColor?.setAttribute('content', themeColors[initialThemeFamily][initialAppearance])

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Elemento raiz do Drizza não encontrado.')
}

const today = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date())

app.innerHTML = [
  '<div class="app-shell">',
  '  <header class="topbar">',
  '    <a class="brand" href="#home" aria-label="Drizza, início">',
  '      <img src="/drizza-mark.svg" alt="" width="34" height="34" />',
  '      <span>drizza</span>',
  '    </a>',
  '    <p class="brand-promise">seu dia, no seu rumo</p>',
  '    <div class="local-state" aria-label="Local · sem sincronização"><span class="state-dot"></span><span>Local · sem sincronização</span></div>',
  '    <div class="theme-controls">',
  '      <label class="theme-family-picker">',
  '        <span class="visually-hidden">Tema do Drizza</span>',
  '        <select id="theme-family-select" aria-label="Tema do Drizza">',
  '          <option value="drizza">Drizza</option>',
  '          <option value="violeeter">Violeeter</option>',
  '        </select>',
  '      </label>',
  '      <div class="appearance-picker" role="group" aria-label="Aparência">',
  '        <button class="appearance-button" type="button" data-appearance-choice="light" aria-label="Claro" title="Claro">',
  '          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3.5-7.5-1.4 1.4m-10.2 10.2-1.4 1.4m14.4 0-1.4-1.4M6.1 6.1 4.7 4.7"></path></svg>',
  '        </button>',
  '        <button class="appearance-button" type="button" data-appearance-choice="dark" aria-label="Escuro" title="Escuro">',
  '          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.6 8.6 0 0 1 8.9 3.8 8.7 8.7 0 1 0 20.2 15.1Z"></path></svg>',
  '        </button>',
  '      </div>',
  '      <label class="layout-width-picker">',
  '        <span class="visually-hidden">Largura do Drizza</span>',
  '        <select id="layout-width-select" aria-label="Largura do Drizza">',
  '          <option value="100">100%</option>',
  '          <option value="70">70%</option>',
  '          <option value="50">50%</option>',
  '        </select>',
  '      </label>',
  '    </div>',
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
  '  <footer class="footer"><span>drizza</span><span>Seu trabalho, no seu rumo.</span><span>Local-first · somente leitura</span></footer>',
  '</div>',
].join('')

const todayLabel = document.querySelector<HTMLElement>('#today')
const feedback = document.querySelector<HTMLParagraphElement>('#feedback')
const syncButton = document.querySelector<HTMLButtonElement>('#sync-button')
const briefButton = document.querySelector<HTMLButtonElement>('#brief-button')
const themeFamilySelect = document.querySelector<HTMLSelectElement>('#theme-family-select')
const layoutWidthSelect = document.querySelector<HTMLSelectElement>('#layout-width-select')
const appearanceButtons = document.querySelectorAll<HTMLButtonElement>('[data-appearance-choice]')
let selectedFamily = initialThemeFamily
let selectedAppearance = initialAppearance

const applyTheme = (family: ThemeFamily, appearance: Appearance): void => {
  selectedFamily = family
  selectedAppearance = appearance
  document.documentElement.dataset.themeFamily = family
  document.documentElement.dataset.appearance = appearance
  themeColor?.setAttribute('content', themeColors[family][appearance])
  savePreference('drizza-theme-family', family)
  savePreference('drizza-appearance', appearance)
  if (themeFamilySelect) themeFamilySelect.value = family
  appearanceButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.appearanceChoice === appearance))
  })
}

themeFamilySelect?.addEventListener('change', () => {
  applyTheme(themeFamilySelect.value === 'violeeter' ? 'violeeter' : 'drizza', selectedAppearance)
})

appearanceButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const nextAppearance: Appearance = button.dataset.appearanceChoice === 'dark' ? 'dark' : 'light'
    applyTheme(selectedFamily, nextAppearance)
  })
})

if (themeFamilySelect) {
  applyTheme(initialThemeFamily, initialAppearance)
}

if (layoutWidthSelect) {
  layoutWidthSelect.value = initialLayoutWidth
  layoutWidthSelect.addEventListener('change', () => {
    const nextWidth: LayoutWidth = layoutWidthSelect.value === '70' || layoutWidthSelect.value === '50'
      ? layoutWidthSelect.value
      : '100'
    document.documentElement.dataset.layoutWidth = nextWidth
    savePreference('drizza-layout-width', nextWidth)
  })
}

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
