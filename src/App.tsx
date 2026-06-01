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

type ApiRecord = Record<string, unknown>

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === 'object' ? (value as ApiRecord) : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeRadarItems(payload: unknown): SignalItem[] {
  const record = asRecord(payload)
  const pools = [record.items, record.ai_items, record.top_items, record.data]
  const raw = pools.find(Array.isArray) ?? []
  return raw.slice(0, 18).map((value, index: number) => {
    const item = asRecord(value)
    return {
      id: asString(item.id, asString(item.url, `radar-${index}`)),
      title: asString(item.title, asString(item.name, 'Untitled radar item')),
      title_en: asString(item.title_en) || null,
      url: asString(item.url, asString(item.link)),
      source: asString(item.source_name, asString(item.source, asString(item.site_name, 'AI News Radar'))),
      publishedAt: asString(item.published_at, asString(item.publishedAt, asString(item.date))),
      summary: asString(item.summary, asString(item.description, asString(item.ai_reason, 'AI News Radar item awaiting source ratcheting.'))),
      category: asString(item.category, asString(item.ai_label, asString(item.label, 'ai_general'))),
      score: asNumber(item.ai_score) ?? asNumber(item.score),
      label: asString(item.ai_label, asString(item.label)),
      origin: 'AI News Radar' as const,
    }
  })
}

function normalizeAihotItems(payload: unknown): SignalItem[] {
  const record = asRecord(payload)
  return asArray(record.items).slice(0, 18).map((value, index) => {
    const item = asRecord(value)
    return {
      id: asString(item.id, `aihot-${index}`),
      title: asString(item.title, 'Untitled AI HOT item'),
      title_en: asString(item.title_en) || null,
      url: asString(item.url),
      source: asString(item.source, 'AI HOT'),
      publishedAt: asString(item.publishedAt),
      summary: asString(item.summary, 'No summary supplied. Open the source and ratchet before using as evidence.'),
      category: asString(item.category, 'ai_general'),
      origin: 'AI HOT' as const,
      score: 0.9,
    }
  })
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
      name: 'Daily snapshot',
      status: 'partial',
      detail: 'Loading bundled cron snapshot first; live browser fetch is optional because third-party CORS can fail.',
      metric: 'snapshot-first',
    },
    {
      name: 'Public source probes',
      status: 'partial',
      detail: 'Cron/server verification is the source of truth; browser probes are convenience signals only.',
      metric: 'verified by npm run fetch',
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
        const snapshotRes = await fetch('/data/snapshots/latest.json', { cache: 'no-store' })
        const snapshotJson = asRecord(await snapshotRes.json())
        const snapshotItems = asArray(snapshotJson.top).map((value, index) => {
          const item = asRecord(value)
          return {
            id: asString(item.id, `snapshot-${index}`),
            title: asString(item.title, 'Untitled snapshot item'),
            title_en: asString(item.title_en) || null,
            url: asString(item.url),
            source: asString(item.source, 'daily snapshot'),
            publishedAt: asString(item.publishedAt),
            summary: asString(item.summary, 'Snapshot item awaiting source ratcheting.'),
            category: asString(item.category, 'ai_general'),
            score: asNumber(item.opportunityScore) ?? asNumber(item.score),
            label: asString(item.discoveryOnly) ? 'discovery-only' : asString(item.label),
            origin: asString(item.origin) === 'AI HOT' ? 'AI HOT' as const : 'AI News Radar' as const,
          }
        })
        loaded.push(...snapshotItems)
        const counts = asRecord(snapshotJson.counts)
        nextHealth.push({
          name: 'Daily snapshot',
          status: snapshotItems.length ? 'verified' : 'partial',
          detail: `${snapshotItems.length} ranked items from ${asNumber(counts.total_after_dedupe) ?? 'unknown'} deduped signals.`,
          metric: asString(snapshotJson.generated_at, 'latest snapshot'),
        })
        setLastUpdated(asString(snapshotJson.generated_at, new Date().toISOString()))
      } catch (error) {
        nextHealth.push({
          name: 'Daily snapshot',
          status: 'partial',
          detail: `Bundled snapshot unavailable; falling back to direct browser probes. ${String(error).slice(0, 96)}`,
          metric: 'fallback active',
        })
      }

      try {
        const [itemsRes, dailyRes] = await Promise.all([fetch(AIHOT_ITEMS), fetch(AIHOT_DAILY)])
        const itemsJson = asRecord(await itemsRes.json())
        const dailyJson = asRecord(await dailyRes.json())
        if (!loaded.length) loaded.push(...normalizeAihotItems(itemsJson))
        nextHealth.push({
          name: 'AI HOT browser probe',
          status: itemsRes.ok && dailyRes.ok ? 'verified' : 'partial',
          detail: `${asNumber(itemsJson.count) ?? normalizeAihotItems(itemsJson).length} selected items; daily sections: ${asArray(dailyJson.sections).length || 'unknown'}.`,
          metric: asString(dailyJson.date, 'daily feed'),
        })
      } catch (error) {
        nextHealth.push({
          name: 'AI HOT browser probe',
          status: 'risk',
          detail: `Browser CORS/probe failed; cron snapshot remains the reliable path. ${String(error).slice(0, 96)}`,
          metric: 'snapshot-first fallback',
        })
      }

      try {
        const [latestRes, statusRes] = await Promise.all([fetch(RADAR_LATEST), fetch(RADAR_STATUS)])
        const latestJson = asRecord(await latestRes.json())
        const statusJson = asRecord(await statusRes.json())
        if (!loaded.length) loaded.push(...normalizeRadarItems(latestJson))
        nextHealth.push({
          name: 'AI News Radar browser probe',
          status: latestRes.ok && statusRes.ok ? 'verified' : 'partial',
          detail: `${asNumber(latestJson.total_items) ?? 'unknown'} AI-filtered items from ${asNumber(latestJson.total_items_raw) ?? 'unknown'} raw; failed sites: ${asArray(statusJson.failed_sites).length}.`,
          metric: `${asNumber(latestJson.site_count) ?? '?'} sites / ${asNumber(latestJson.source_count) ?? '?'} sources`,
        })
        if (!lastUpdated || lastUpdated === 'offline fallback') setLastUpdated(asString(latestJson.generated_at, asString(statusJson.generated_at, new Date().toISOString())))
      } catch (error) {
        nextHealth.push({
          name: 'AI News Radar browser probe',
          status: 'risk',
          detail: `Live radar fetch failed; snapshot/fallback remains readable. ${String(error).slice(0, 96)}`,
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
            <code>snapshot = cron_fetch('/data/snapshots/latest.json')</code>
            <code>browser_probes = optional_cors_checks()</code>
            <code>gate.claims = official_source_ratcheting()</code>
            <code>review.ui = verified_external_review || blocked</code>
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
