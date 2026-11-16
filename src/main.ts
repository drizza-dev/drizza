import './style.css'

type ThemeFamily = 'drizza' | 'violeeter'
type Appearance = 'light' | 'dark'
type LayoutWidth = '100' | '70' | '50'
type GithubSyncRunStatus = 'running' | 'ok' | 'error'
type GithubTokenSource = 'gh' | 'env' | null

interface GithubPullRequest {
  id: number
  repo: string
  number: number
  title: string
  url: string
  author: string
  draft: boolean
  updatedAt: string
}

interface GithubSyncRun {
  id: string
  startedAt: string
  finishedAt: string | null
  status: GithubSyncRunStatus
  tokenSource: GithubTokenSource
  reviews: number
  authored: number
  incomplete: boolean
  error: string | null
}

interface GithubPrsResponse {
  reviews: GithubPullRequest[]
  authored: GithubPullRequest[]
  lastSync: GithubSyncRun | null
}

interface GithubCardView {
  status: HTMLParagraphElement
  list: HTMLUListElement
  empty: HTMLDivElement
  emptyMessage: HTMLSpanElement
}

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
  '    <div class="local-state"><span class="state-dot"></span><span id="local-sync-state">Local · GitHub ainda não sincronizado</span></div>',
  '    <div class="theme-controls">',
  '      <label class="theme-family-picker">',
  '        <span class="visually-hidden">Tema do Drizza</span>',
  '        <select id="theme-family-select">',
  '          <option value="drizza">Drizza</option>',
  '          <option value="violeeter">Violeeter</option>',
  '        </select>',
  '      </label>',
  '      <div class="appearance-picker" role="group" aria-label="Aparência">',
  '        <button class="appearance-button" type="button" data-appearance-choice="light" aria-label="Tema claro" title="Tema claro">',
  '          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3.5-7.5-1.4 1.4m-10.2 10.2-1.4 1.4m14.4 0-1.4-1.4M6.1 6.1 4.7 4.7"></path></svg>',
  '        </button>',
  '        <button class="appearance-button" type="button" data-appearance-choice="dark" aria-label="Tema escuro" title="Tema escuro">',
  '          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.6 8.6 0 0 1 8.9 3.8 8.7 8.7 0 1 0 20.2 15.1Z"></path></svg>',
  '        </button>',
  '      </div>',
  '      <label class="layout-width-picker">',
  '        <span class="visually-hidden">Largura do Drizza</span>',
  '        <select id="layout-width-select">',
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
  '          <p>Conecte Slack e sincronize o GitHub para reunir o que merece sua atenção, com links para cada fonte.</p>',
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
  '        <div class="empty-state github-pr-empty"><span class="empty-icon" aria-hidden="true">⌁</span><span>Ainda não sincronizado</span></div>',
  '      </article>',
  '      <article class="work-card" id="in-progress">',
  '        <div class="card-topline"><span class="card-icon progress-icon" aria-hidden="true">◷</span><span class="quiet-label">GITHUB · EM ANDAMENTO</span></div>',
  '        <h2>Seu trabalho em curso</h2>',
  '        <p class="card-description">PRs de sua autoria que ainda estão abertas.</p>',
  '        <div class="empty-state github-pr-empty"><span class="empty-icon" aria-hidden="true">◷</span><span>Ainda não sincronizado</span></div>',
  '      </article>',
  '    </section>',
  '',
  '    <section class="lower-grid" aria-label="Sincronização e fontes">',
  '      <article class="panel timeline-panel" aria-labelledby="timeline-title">',
  '        <div class="section-heading compact-heading"><div><p class="eyebrow">ATIVIDADE</p><h2 id="timeline-title">Linha do sync</h2></div><span class="quiet-label">Hoje</span></div>',
  '        <div class="timeline-empty"><span class="timeline-node" aria-hidden="true"></span><div><strong>Pronto quando você estiver.</strong><p>O histórico de atualizações aparecerá aqui.</p></div></div>',
  '      </article>',
  '      <article class="panel sources-panel" aria-labelledby="sources-title">',
  '        <div class="section-heading compact-heading"><div><p class="eyebrow">SUAS FONTES</p><h2 id="sources-title">Conexões</h2></div><span class="quiet-label" id="source-pending-count">2 pendentes</span></div>',
  '        <div class="source-row"><span class="source-brand slack-brand">S</span><span class="source-name">Slack</span><span class="source-status">Não conectado</span></div>',
  '        <div class="source-row"><span class="source-brand github-brand">GH</span><span class="source-name">GitHub</span><span class="source-status" id="github-source-status">Aguardando sync</span></div>',
  '        <p class="source-note" id="sources-note">GitHub será lido quando você iniciar o sync. Slack ainda não está conectado.</p>',
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

const localSyncState = document.querySelector<HTMLElement>('#local-sync-state')
const githubSourceStatus = document.querySelector<HTMLElement>('#github-source-status')
const sourcePendingCount = document.querySelector<HTMLElement>('#source-pending-count')
const reviewsCard = document.querySelector<HTMLElement>('#reviews')
const authoredCard = document.querySelector<HTMLElement>('#in-progress')

const makeGithubCardView = (card: HTMLElement | null): GithubCardView | null => {
  const empty = card?.querySelector<HTMLDivElement>('.github-pr-empty')
  const emptyMessage = empty?.querySelector<HTMLSpanElement>('span:last-child')
  if (!card || !empty || !emptyMessage) return null

  const status = document.createElement('p')
  status.className = 'github-sync-state'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const list = document.createElement('ul')
  list.className = 'github-pr-list'

  card.insertBefore(status, empty)
  card.insertBefore(list, empty)

  return { status, list, empty, emptyMessage }
}

const reviewsView = makeGithubCardView(reviewsCard)
const authoredView = makeGithubCardView(authoredCard)
let githubData: GithubPrsResponse | null = null
let githubLoadError: string | null = null
let startingGithubSync = false
let pendingGithubRunId: string | null = null
let githubRefreshGeneration = 0
let githubRefreshTimer: number | null = null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isGithubPullRequest = (value: unknown): value is GithubPullRequest => {
  if (!isRecord(value)) return false

  return Number.isSafeInteger(value.id)
    && typeof value.repo === 'string'
    && Number.isSafeInteger(value.number)
    && typeof value.title === 'string'
    && typeof value.url === 'string'
    && typeof value.author === 'string'
    && typeof value.draft === 'boolean'
    && typeof value.updatedAt === 'string'
}

const isGithubSyncRun = (value: unknown): value is GithubSyncRun => {
  if (!isRecord(value)) return false

  return typeof value.id === 'string'
    && typeof value.startedAt === 'string'
    && (typeof value.finishedAt === 'string' || value.finishedAt === null)
    && (value.status === 'running' || value.status === 'ok' || value.status === 'error')
    && (value.tokenSource === 'gh' || value.tokenSource === 'env' || value.tokenSource === null)
    && typeof value.reviews === 'number'
    && typeof value.authored === 'number'
    && typeof value.incomplete === 'boolean'
    && (typeof value.error === 'string' || value.error === null)
}

const parseGithubPrsResponse = (value: unknown): GithubPrsResponse => {
  if (!isRecord(value) || !Array.isArray(value.reviews) || !Array.isArray(value.authored)) {
    throw new Error('Resposta inválida do servidor local.')
  }

  if (value.lastSync !== null && !isGithubSyncRun(value.lastSync)) {
    throw new Error('Resposta inválida do servidor local.')
  }

  return {
    reviews: value.reviews.filter(isGithubPullRequest),
    authored: value.authored.filter(isGithubPullRequest),
    lastSync: value.lastSync as GithubSyncRun | null,
  }
}

const formatSyncTime = (value: string | null): string => {
  if (!value) return 'horário indisponível'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'horário indisponível'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(date)
}

const safePullRequestUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

const makePullRequestItem = (pullRequest: GithubPullRequest): HTMLLIElement => {
  const item = document.createElement('li')
  item.className = 'github-pr-item'

  const heading = document.createElement('div')
  heading.className = 'github-pr-heading'
  const url = safePullRequestUrl(pullRequest.url)

  if (url) {
    const link = document.createElement('a')
    link.className = 'github-pr-link'
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = pullRequest.title
    heading.append(link)
  } else {
    const title = document.createElement('span')
    title.className = 'github-pr-link'
    title.textContent = pullRequest.title
    heading.append(title)
  }

  if (pullRequest.draft) {
    const draft = document.createElement('span')
    draft.className = 'github-pr-draft'
    draft.textContent = 'Rascunho'
    heading.append(draft)
  }

  const details = document.createElement('p')
  details.className = 'github-pr-meta'
  details.textContent = `${pullRequest.repo} #${pullRequest.number} · ${pullRequest.author}`

  const updated = document.createElement('time')
  updated.className = 'github-pr-updated'
  updated.dateTime = pullRequest.updatedAt
  updated.textContent = `Atualizada ${formatSyncTime(pullRequest.updatedAt)}`

  item.append(heading, details, updated)
  return item
}

const cardState = (): { message: string; emptyMessage: string } => {
  const lastSync = githubData?.lastSync ?? null

  if (startingGithubSync) {
    return { message: 'Iniciando sincronização do GitHub.', emptyMessage: 'Aguardando início da busca.' }
  }

  if (lastSync?.status === 'running') {
    return { message: 'Sincronizando PRs do GitHub.', emptyMessage: 'A busca ainda está em andamento.' }
  }

  if (githubLoadError) {
    return { message: `Erro ao carregar o estado do GitHub: ${githubLoadError}`, emptyMessage: 'O cache local não pôde ser lido.' }
  }

  if (!lastSync) {
    return { message: 'Ainda não sincronizado.', emptyMessage: 'Clique em Sync Now para carregar as PRs.' }
  }

  if (lastSync.status === 'error') {
    return {
      message: `Erro no último sync: ${lastSync.error ?? 'Não foi possível atualizar.'} O cache não foi alterado.`,
      emptyMessage: 'Nenhuma PR disponível; o cache não foi alterado.',
    }
  }

  if (lastSync.incomplete) {
    return {
      message: 'Sync parcial. O cache foi mantido para as buscas incompletas.',
      emptyMessage: 'A sincronização foi parcial; esta lista pode estar desatualizada.',
    }
  }

  return {
    message: `Atualizado ${formatSyncTime(lastSync.finishedAt)}.`,
    emptyMessage: 'Nada pendente.',
  }
}

const renderGithubCard = (view: GithubCardView | null, pullRequests: GithubPullRequest[]): void => {
  if (!view) return

  const state = cardState()
  view.status.textContent = state.message
  view.emptyMessage.textContent = state.emptyMessage
  view.list.replaceChildren(...pullRequests.map(makePullRequestItem))
  view.list.hidden = pullRequests.length === 0
  view.empty.hidden = pullRequests.length > 0
}

const renderGithubState = (): void => {
  const lastSync = githubData?.lastSync ?? null
  const isRunning = startingGithubSync || lastSync?.status === 'running'

  renderGithubCard(reviewsView, githubData?.reviews ?? [])
  renderGithubCard(authoredView, githubData?.authored ?? [])

  if (localSyncState) {
    if (startingGithubSync) localSyncState.textContent = 'Local · iniciando sync do GitHub'
    else if (lastSync?.status === 'running') localSyncState.textContent = 'Local · sincronizando GitHub'
    else if (githubLoadError) localSyncState.textContent = 'Local · erro ao ler o estado do GitHub'
    else if (!lastSync) localSyncState.textContent = 'Local · GitHub ainda não sincronizado'
    else if (lastSync.status === 'error') localSyncState.textContent = 'Local · falha no sync do GitHub'
    else if (lastSync.incomplete) localSyncState.textContent = 'Local · sync parcial do GitHub'
    else localSyncState.textContent = `Local · atualizado ${formatSyncTime(lastSync.finishedAt)}`
  }

  if (githubSourceStatus) {
    if (isRunning) githubSourceStatus.textContent = 'Sincronizando'
    else if (!lastSync) githubSourceStatus.textContent = 'Aguardando sync'
    else if (lastSync.status === 'error' && !lastSync.tokenSource) githubSourceStatus.textContent = 'Token ausente'
    else if (lastSync.status === 'error') githubSourceStatus.textContent = 'Falha no sync'
    else if (lastSync.tokenSource === 'gh') githubSourceStatus.textContent = 'Sync via gh'
    else if (lastSync.tokenSource === 'env') githubSourceStatus.textContent = 'Sync via PAT'
    else githubSourceStatus.textContent = 'Aguardando sync'
  }

  if (sourcePendingCount) {
    sourcePendingCount.textContent = lastSync?.status === 'ok' ? '1 pendente' : '2 pendentes'
  }

  if (syncButton) syncButton.disabled = isRunning
}

const finishPendingSyncAnnouncement = (): void => {
  if (!pendingGithubRunId || githubData?.lastSync?.id !== pendingGithubRunId) return

  const lastSync = githubData.lastSync
  if (lastSync.status === 'running') return

  if (lastSync.status === 'error') {
    announce(`Sync falhou: ${lastSync.error ?? 'Não foi possível atualizar as PRs.'} O cache foi mantido.`)
  } else if (lastSync.incomplete) {
    announce('Sync parcial. As buscas incompletas mantiveram o cache anterior.')
  } else {
    announce(`Sync concluído: ${lastSync.reviews} revisões e ${lastSync.authored} PRs de sua autoria.`)
  }

  pendingGithubRunId = null
}

const loadGithubPrs = async (generation: number): Promise<void> => {
  if (generation !== githubRefreshGeneration) return
  githubRefreshTimer = null

  try {
    const response = await fetch('/api/github/prs', { cache: 'no-store' })
    if (!response.ok) throw new Error('O servidor local não respondeu.')

    const payload = parseGithubPrsResponse(await response.json())
    if (generation !== githubRefreshGeneration) return

    githubData = payload
    githubLoadError = null
    renderGithubState()
    finishPendingSyncAnnouncement()

    if (payload.lastSync?.status === 'running') {
      githubRefreshTimer = window.setTimeout(() => {
        void loadGithubPrs(generation)
      }, 1000)
    }
  } catch (error) {
    if (generation !== githubRefreshGeneration) return
    githubLoadError = error instanceof Error ? error.message : 'Não foi possível ler as PRs.'
    renderGithubState()
  }
}

const refreshGithubPrs = (): void => {
  githubRefreshGeneration += 1
  if (githubRefreshTimer !== null) window.clearTimeout(githubRefreshTimer)
  githubRefreshTimer = null
  void loadGithubPrs(githubRefreshGeneration)
}

const readResponseBody = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const value: unknown = await response.json()
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

syncButton?.addEventListener('click', async () => {
  if (startingGithubSync || githubData?.lastSync?.status === 'running') return

  startingGithubSync = true
  renderGithubState()
  announce('Iniciando sincronização das PRs do GitHub.')

  try {
    const response = await fetch('/api/sync/github', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
    const body = await readResponseBody(response)

    if (response.status === 202 && typeof body.runId === 'string') {
      startingGithubSync = false
      pendingGithubRunId = body.runId
      announce('Sincronização iniciada.')
      refreshGithubPrs()
      return
    }

    startingGithubSync = false

    if (response.status === 409) {
      announce('Já existe uma sincronização em andamento.')
      refreshGithubPrs()
      return
    }

    if (response.status === 401 && typeof body.hint === 'string') {
      announce(`Token do GitHub ausente. ${body.hint}`)
      refreshGithubPrs()
      return
    }

    announce('Não foi possível iniciar a sincronização do GitHub. Tente novamente.')
    refreshGithubPrs()
  } catch {
    startingGithubSync = false
    renderGithubState()
    announce('Não foi possível iniciar a sincronização do GitHub. Verifique o servidor local.')
  }
})

refreshGithubPrs()

briefButton?.addEventListener('click', () => {
  announce('O briefing ainda não pode ser gerado: Slack não está conectado.')
})
