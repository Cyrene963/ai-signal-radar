import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Filter,
  GitBranch,
  Globe2,
  Newspaper,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import './App.css'

type SignalItem = {
  id?: string
  title: string
  title_en?: string | null
  url?: string
  source?: string
  publishedAt?: string
  summary?: string
  category?: string
  score?: number
  label?: string
  origin: 'AI HOT' | 'AI News Radar'
}

type HealthCard = {
  name: string
  status: 'verified' | 'partial' | 'risk'
  detail: string
  metric: string
}

const AIHOT_ITEMS = 'https://aihot.virxact.com/api/public/items?mode=selected&take=18'
const AIHOT_DAILY = 'https://aihot.virxact.com/api/public/daily'
const RADAR_LATEST = 'https://learnprompt.github.io/ai-news-radar/data/latest-24h.json'
const RADAR_STATUS = 'https://learnprompt.github.io/ai-news-radar/data/source-status.json'

const fallbackItems: SignalItem[] = [
  {
    title: 'OpenAI officially enters robotics and starts hiring',
    title_en: 'OpenAI Robotics is hiring',
    summary:
      'A high-signal robotics move surfaced in both AI HOT and AI News Radar. Treat it as a discovery item until official hiring pages / OpenAI posts are rechecked.',
    source: 'AI HOT / AI News Radar',
    category: 'industry',
    origin: 'AI HOT',
    score: 1,
  },
  {
    title: 'DeepSeek V4 Flash appears in developer-tool feeds',
    summary:
      'Useful for agent-stack monitoring: the item is relevant to coding workflows, but should be ratcheted to the vendor / tool release before alerting.',
    source: 'AI HOT selected feed',
    category: 'ai-products',
    origin: 'AI HOT',
    score: 0.92,
  },
  {
    title: 'AI News Radar reports healthy 24h source coverage',
    summary:
      'The radar pipeline exposes source-status JSON, which makes it better as a forkable broad scanner than as a black-box newsletter.',
    source: 'LearnPrompt / ai-news-radar',
    category: 'pipeline',
    origin: 'AI News Radar',
    score: 0.86,
  },
]

function normalizeRadarItems(payload: any): SignalItem[] {
  const pools = [payload?.items, payload?.ai_items, payload?.top_items, payload?.data]
  const raw = pools.find(Array.isArray) ?? []
  return raw.slice(0, 18).map((item: any, index: number) => ({
    id: item.id ?? item.url ?? `radar-${index}`,
    title: item.title ?? item.name ?? 'Untitled radar item',
    title_en: item.title_en ?? null,
    url: item.url ?? item.link,
    source: item.source_name ?? item.source ?? item.site_name ?? 'AI News Radar',
    publishedAt: item.published_at ?? item.publishedAt ?? item.date,
    summary: item.summary ?? item.description ?? item.ai_reason ?? 'AI News Radar item awaiting source ratcheting.',
    category: item.category ?? item.ai_label ?? item.label ?? 'ai_general',
    score: item.ai_score ?? item.score,
    label: item.ai_label ?? item.label,
    origin: 'AI News Radar' as const,
  }))
}

function normalizeAihotItems(payload: any): SignalItem[] {
  return (payload?.items ?? []).slice(0, 18).map((item: any) => ({
    ...item,
    origin: 'AI HOT' as const,
    score: 0.9,
  }))
}

function formatTime(value?: string) {
  if (!value) return 'freshness unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function statusLabel(status: HealthCard['status']) {
  if (status === 'verified') return 'Verified working'
  if (status === 'partial') return 'Partially verified'
  return 'Risk'
}

function App() {
  const [items, setItems] = useState<SignalItem[]>(fallbackItems)
  const [health, setHealth] = useState<HealthCard[]>([
    {
      name: 'AI HOT public API',
      status: 'partial',
      detail: 'Live fetch pending; fallback sample is bundled for offline reading.',
      metric: 'selected feed',
    },
    {
      name: 'AI News Radar',
      status: 'partial',
      detail: 'Live fetch pending; static fallback explains the integration contract.',
      metric: '24h JSON',
    },
  ])
  const [selected, setSelected] = useState('all')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('offline fallback')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const nextHealth: HealthCard[] = []
      const loaded: SignalItem[] = []

      try {
        const [itemsRes, dailyRes] = await Promise.all([fetch(AIHOT_ITEMS), fetch(AIHOT_DAILY)])
        const itemsJson = await itemsRes.json()
        const dailyJson = await dailyRes.json()
        loaded.push(...normalizeAihotItems(itemsJson))
        nextHealth.push({
          name: 'AI HOT public API',
          status: itemsRes.ok && dailyRes.ok ? 'verified' : 'partial',
          detail: `${itemsJson.count ?? loaded.length} selected items; daily sections: ${dailyJson.sections?.length ?? 'unknown'}.`,
          metric: dailyJson.date ?? 'daily feed',
        })
      } catch (error) {
        nextHealth.push({
          name: 'AI HOT public API',
          status: 'risk',
          detail: `Browser fetch failed; use server/cron fetch with browser-like User-Agent. ${String(error).slice(0, 96)}`,
          metric: 'fallback active',
        })
      }

      try {
        const [latestRes, statusRes] = await Promise.all([fetch(RADAR_LATEST), fetch(RADAR_STATUS)])
        const latestJson = await latestRes.json()
        const statusJson = await statusRes.json()
        loaded.push(...normalizeRadarItems(latestJson))
        nextHealth.push({
          name: 'AI News Radar',
          status: latestRes.ok && statusRes.ok ? 'verified' : 'partial',
          detail: `${latestJson.total_items ?? 'unknown'} AI-filtered items from ${latestJson.total_items_raw ?? 'unknown'} raw; failed sites: ${statusJson.failed_sites?.length ?? 'unknown'}.`,
          metric: `${latestJson.site_count ?? '?'} sites / ${latestJson.source_count ?? '?'} sources`,
        })
        setLastUpdated(latestJson.generated_at ?? statusJson.generated_at ?? new Date().toISOString())
      } catch (error) {
        nextHealth.push({
          name: 'AI News Radar',
          status: 'risk',
          detail: `Live radar fetch failed; fallback remains readable. ${String(error).slice(0, 96)}`,
          metric: 'fallback active',
        })
      }

      if (!cancelled) {
        setItems(loaded.length ? loaded : fallbackItems)
        setHealth(nextHealth)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map((item) => item.category ?? 'uncategorized'))).slice(0, 8)], [items])
  const filtered = selected === 'all' ? items : items.filter((item) => (item.category ?? 'uncategorized') === selected)

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="nav-row">
          <div className="brand-mark"><Radar size={22} /> AI Signal Radar</div>
          <div className="nav-actions">
            <a href={RADAR_STATUS} target="_blank" rel="noreferrer">Source health <ArrowUpRight size={14} /></a>
            <a href="https://github.com/LearnPrompt/ai-news-radar" target="_blank" rel="noreferrer"><GitBranch size={14} /> Upstream radar</a>
          </div>
        </div>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><Sparkles size={16} /> open-source AI briefing desk</p>
            <h1>把 AI HOT 的中文精选和 AI News Radar 的广域雷达，变成可验证的情报工作台。</h1>
            <p className="lede">
              Built for agents and humans: fetch public feeds, label confidence, keep source health visible, and force every important claim through official-source ratcheting before it becomes a push notification.
            </p>
            <div className="hero-cta">
              <a className="primary" href="#signals">View live signals</a>
              <a className="secondary" href="https://aihot.virxact.com/api/public/daily" target="_blank" rel="noreferrer">Inspect AI HOT API</a>
            </div>
          </div>

          <aside className="glass-card command-card">
            <div className="terminal-dot-row"><span></span><span></span><span></span></div>
            <code>sources.aihot = public_api()</code>
            <code>sources.radar = static_json()</code>
            <code>gate.claims = official_source_ratcheting()</code>
            <code>review.ui = claude_opus_latest()</code>
            <div className="font-note">LXGW WenKai is bundled for Chinese long-form readability.</div>
          </aside>
        </div>
      </section>

      <section className="metrics-grid" aria-label="source health">
        {health.map((card) => (
          <article className={`metric-card ${card.status}`} key={card.name}>
            <div className="metric-icon">{card.status === 'verified' ? <CheckCircle2 /> : card.status === 'risk' ? <AlertTriangle /> : <Activity />}</div>
            <div>
              <p className="metric-status">{statusLabel(card.status)}</p>
              <h2>{card.name}</h2>
              <p>{card.detail}</p>
              <strong>{card.metric}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="workflow-panel">
        <div>
          <p className="eyebrow"><ShieldCheck size={16} /> evidence first</p>
          <h2>Not another hotlist. A source-quality workflow.</h2>
        </div>
        <div className="workflow-steps">
          <div><Globe2 /><span>Discover</span><p>AI HOT for Chinese selected items; AI News Radar for broad public-source coverage.</p></div>
          <div><Filter /><span>Deduplicate</span><p>Normalize title, URL, source, score, category, and first-seen fields.</p></div>
          <div><ShieldCheck /><span>Ratcheting</span><p>Important claims must be replaced with vendor blog, changelog, paper, release, or primary source.</p></div>
          <div><Zap /><span>Brief</span><p>Only high-confidence deltas become Telegram/cron briefings.</p></div>
        </div>
      </section>

      <section id="signals" className="signals-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><Newspaper size={16} /> live signal board</p>
            <h2>Signals worth checking today</h2>
          </div>
          <div className="refresh-pill"><RefreshCw className={loading ? 'spin' : ''} size={15} /> {loading ? 'Fetching feeds…' : `Updated ${formatTime(lastUpdated)}`}</div>
        </div>

        <div className="category-row">
          {categories.map((category) => (
            <button className={category === selected ? 'active' : ''} onClick={() => setSelected(category)} key={category}>
              {category}
            </button>
          ))}
        </div>

        <div className="signal-list">
          {filtered.slice(0, 15).map((item, index) => (
            <article className="signal-card" key={`${item.origin}-${item.id ?? item.title}-${index}`}>
              <div className="signal-meta">
                <span>{item.origin}</span>
                <span>{item.category ?? 'uncategorized'}</span>
                <span><Clock3 size={13} /> {formatTime(item.publishedAt)}</span>
              </div>
              <h3>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</h3>
              {item.title_en && <p className="en-title">{item.title_en}</p>}
              <p>{item.summary ?? 'No summary supplied. Open the source and ratchet before using as evidence.'}</p>
              <div className="source-row">
                <span>{item.source ?? 'unknown source'}</span>
                <strong>{typeof item.score === 'number' ? `score ${item.score.toFixed(2)}` : item.label ?? 'needs review'}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
