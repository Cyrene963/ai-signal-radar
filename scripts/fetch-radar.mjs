import { mkdir, writeFile, readFile, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const ENDPOINTS = {
  aihotDaily: 'https://aihot.virxact.com/api/public/daily',
  aihotItems: 'https://aihot.virxact.com/api/public/items?mode=selected&take=60',
  radarLatest: 'https://learnprompt.github.io/ai-news-radar/data/latest-24h.json',
  radarStatus: 'https://learnprompt.github.io/ai-news-radar/data/source-status.json',
}

const UA = 'AI-Signal-Radar/1.0 (+https://github.com/Cyrene963/ai-signal-radar)'
const today = new Date().toISOString().slice(0, 10)
const dataDir = path.join(process.cwd(), 'data', 'snapshots')
const reportDir = path.join(process.cwd(), 'reports')
await mkdir(dataDir, { recursive: true })
await mkdir(reportDir, { recursive: true })

function asArray(v) { return Array.isArray(v) ? v : [] }
function asObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {} }
function str(v, fallback = '') { return typeof v === 'string' ? cleanText(v) : fallback }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : undefined }
function host(url) { try { return new URL(cleanUrl(url)).hostname.replace(/^www\./,'') } catch { return '' } }
function hashText(text) { return createHash('sha256').update(text).digest('hex') }
function cleanText(value) {
  return String(value || '')
    .replace(/，/g, ',')
    .replace(/：\/\//g, '://')
    .replace(/：/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
}
function cleanUrl(value) {
  const raw = cleanText(value)
  return raw.replace(/^http:\/\//, 'http://').replace(/^https:\/\//, 'https://')
}
function hasCjk(text) { return /[\u3400-\u9fff]/.test(text || '') }
function isPromo(item) {
  const text = `${item.title} ${item.title_en || ''} ${item.summary || ''}`.toLowerCase()
  return /免费领|福利|邀请码|返利|优惠券|加群|私信|抽奖|转发|推荐/.test(text) || /x\.com|twitter\.com/.test(item.url || '') && /free|promo|giveaway|coupon|referral/.test(text)
}
function summaryOrFallback(item) {
  const s = cleanText(item.summary)
  if (s) return s
  return 'No summary supplied by the aggregator. Treat as discovery-only until the primary source is checked.'
}
async function readJsonIfExists(file) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return null }
}

async function fetchJson(name, url) {
  const started = Date.now()
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json,text/plain,*/*' } })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { name, url, ok: res.ok, status: res.status, ms: Date.now() - started, bytes: text.length, hash: hashText(text), json, error: json ? '' : 'JSON_PARSE_FAILED' }
  } catch (e) {
    return { name, url, ok: false, status: 0, ms: Date.now() - started, bytes: 0, hash: '', json: null, error: String(e) }
  }
}

const fetched = Object.fromEntries((await Promise.all(Object.entries(ENDPOINTS).map(([name, url]) => fetchJson(name, url)))).map(r => [r.name, r]))

function normalizeAihot(payload) {
  return asArray(asObj(payload).items).map((raw, i) => {
    const x = asObj(raw)
    const title = str(x.title, 'Untitled AI HOT item')
    const titleEn = str(x.title_en)
    return {
      id: str(x.id, `aihot-${i}`),
      title,
      title_en: hasCjk(titleEn) ? '' : titleEn,
      url: cleanUrl(str(x.url)),
      source: str(x.source, host(str(x.url)) || 'AI HOT'),
      publishedAt: str(x.publishedAt),
      summary: summaryOrFallback({ summary: str(x.summary) }),
      category: str(x.category, 'ai_general'),
      score: 0.9,
      origin: 'AI HOT',
    }
  })
}

function normalizeRadar(payload) {
  const root = asObj(payload)
  const pool = [root.items, root.ai_items, root.top_items, root.data].find(Array.isArray) || []
  return pool.map((raw, i) => {
    const x = asObj(raw)
    const title = str(x.title, str(x.name, 'Untitled radar item'))
    const titleEn = str(x.title_en)
    return {
      id: str(x.id, str(x.url, `radar-${i}`)),
      title,
      title_en: hasCjk(titleEn) ? '' : titleEn,
      url: cleanUrl(str(x.url, str(x.link))),
      source: str(x.source_name, str(x.source, str(x.site_name, host(str(x.url)) || 'AI News Radar'))),
      publishedAt: str(x.published_at, str(x.publishedAt, str(x.date))),
      summary: summaryOrFallback({ summary: str(x.summary, str(x.description, str(x.ai_reason))) }),
      category: str(x.category, str(x.ai_label, str(x.label, 'ai_general'))),
      score: num(x.ai_score) ?? num(x.score) ?? 0.7,
      label: str(x.ai_label, str(x.label)),
      origin: 'AI News Radar',
    }
  })
}

const sourceHealth = Object.values(fetched).map(r => ({ name: r.name, url: r.url, ok: r.ok, status: r.status, ms: r.ms, bytes: r.bytes, hash: r.hash, error: r.error }))
const items = [...normalizeAihot(fetched.aihotItems.json), ...normalizeRadar(fetched.radarLatest.json)]
const seen = new Set()
const deduped = []
for (const item of items) {
  const key = (item.url ? cleanUrl(item.url) : item.title.toLowerCase().replace(/\W+/g, ' ').trim()).toLowerCase()
  if (!key || seen.has(key)) continue
  seen.add(key)
  deduped.push({ ...item, discoveryOnly: isPromo(item) || !item.summary || item.summary.startsWith('No summary supplied') })
}

const facets = {
  model: ['openai','anthropic','claude','gpt','gemini','deepseek','qwen','kimi','minimax','llama','mistral','model'],
  agents: ['agent','agents','browser','computer use','codex','claude code','copilot','cursor','opencode','workflow'],
  infra: ['gpu','inference','cost','token','pricing','serverless','pyodide','wasm','asgi','edge'],
  safety: ['security','prompt injection','exfiltration','safety','bio','policy','regulation','privacy'],
  robotics: ['robot','robotics','embodied','humanoid','autonomous driving','tesla','waymo'],
  business: ['funding','raises','startup','revenue','billing','enterprise','market','vc'],
}
function classify(item) {
  const text = `${item.title} ${item.title_en || ''} ${item.summary || ''} ${item.category || ''}`.toLowerCase()
  const hits = Object.entries(facets).flatMap(([k, arr]) => arr.some(w => text.includes(w)) ? [k] : [])
  return hits.length ? hits : ['general']
}
function opportunityScore(item) {
  const text = `${item.title} ${item.summary || ''}`.toLowerCase()
  let score = item.score || 0.5
  for (const w of ['cost','pricing','billing','token','security','agent','workflow','open source','github','pyodide','serverless','robot','browser']) if (text.includes(w)) score += 0.08
  if (item.origin === 'AI HOT') score += 0.04
  if (item.discoveryOnly) score -= 0.32
  return Math.max(0, Math.min(1, score))
}
const enriched = deduped.map(item => ({ ...item, facets: classify(item), opportunityScore: opportunityScore(item), primaryHost: host(item.url) }))
const top = enriched.sort((a,b) => (b.opportunityScore - a.opportunityScore)).slice(0, 28)
const snapshot = {
  generated_at: new Date().toISOString(),
  date: today,
  endpoints: ENDPOINTS,
  sourceHealth,
  counts: {
    aihot_items: normalizeAihot(fetched.aihotItems.json).length,
    radar_items: normalizeRadar(fetched.radarLatest.json).length,
    total_before_dedupe: items.length,
    total_after_dedupe: enriched.length,
    top_items: top.length,
    radar_total_items: num(asObj(fetched.radarLatest.json).total_items),
    radar_total_items_raw: num(asObj(fetched.radarLatest.json).total_items_raw),
    radar_source_count: num(asObj(fetched.radarLatest.json).source_count),
    radar_site_count: num(asObj(fetched.radarLatest.json).site_count),
    failed_sites: asArray(asObj(fetched.radarStatus.json).failed_sites).length,
  },
  top,
}
const snapshotPath = path.join(dataDir, `${today}.json`)

const digest = hashText(JSON.stringify(top.map(x => [x.title, x.url, x.summary, x.discoveryOnly]).slice(0, 20)))
const latestHashPath = path.join(dataDir, 'latest.hash.json')
const previous = await readJsonIfExists(latestHashPath)
const previousHash = previous?.hash || ''
await writeFile(path.join(dataDir, `${today}.hash.json`), JSON.stringify({ date: today, hash: digest }, null, 2), 'utf8')
await writeFile(`${latestHashPath}.tmp`, JSON.stringify({ date: today, hash: digest, updated_at: snapshot.generated_at }, null, 2), 'utf8')
await rename(`${latestHashPath}.tmp`, latestHashPath)
const changed = previousHash !== digest

snapshot.digest = digest
snapshot.previousDigest = previousHash
snapshot.changed = changed
snapshot.highImpactSignals = top.filter(item => !item.discoveryOnly && item.opportunityScore >= 0.97).slice(0, 8).map(item => ({
  title: item.title,
  url: item.url,
  source: item.source,
  origin: item.origin,
  opportunityScore: item.opportunityScore,
  facets: item.facets,
}))
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8')
await writeFile(path.join(dataDir, 'latest.json'), JSON.stringify(snapshot, null, 2), 'utf8')

const lines = []
lines.push(`# AI Signal Radar — ${today}`)
lines.push('')
lines.push(`Generated: ${snapshot.generated_at}`)
lines.push(`Change digest: ${digest}${changed ? ' (new/changed)' : ' (unchanged)'}`)
lines.push('')
lines.push('## Source health')
for (const h of sourceHealth) lines.push(`- ${h.ok ? 'Verified working' : 'Risk'}: ${h.name} HTTP ${h.status}, ${h.bytes} bytes, ${h.ms}ms`)
lines.push('')
lines.push('## Coverage')
lines.push(`- AI HOT selected items: ${snapshot.counts.aihot_items}`)
lines.push(`- AI News Radar AI-filtered/raw: ${snapshot.counts.radar_total_items ?? snapshot.counts.radar_items}/${snapshot.counts.radar_total_items_raw ?? 'unknown'}`)
lines.push(`- AI News Radar sites/sources: ${snapshot.counts.radar_site_count ?? 'unknown'}/${snapshot.counts.radar_source_count ?? 'unknown'}, failed sites: ${snapshot.counts.failed_sites}`)
lines.push(`- Unified deduped items: ${snapshot.counts.total_after_dedupe}`)
lines.push('')
lines.push('## Top signals to ratchet')
for (const [i, item] of top.slice(0, 12).entries()) {
  lines.push(`${i+1}. **${item.title}**${item.discoveryOnly ? ' · discovery-only' : ''}`)
  if (item.title_en) lines.push(`   - EN: ${item.title_en}`)
  lines.push(`   - Source: ${item.source || item.primaryHost || 'unknown'} · ${item.origin} · facets: ${item.facets.join(', ')}`)
  if (item.url) lines.push(`   - URL: ${item.url}`)
  lines.push(`   - Why it matters: ${item.summary.slice(0, 280)}`)
}
lines.push('')
lines.push('## Opportunity map')
const buckets = [
  ['Agent cost / routing / audit', ['cost','pricing','billing','token','agent','workflow']],
  ['AI security / plugin risk', ['security','exfiltration','prompt injection','privacy']],
  ['Local-first / browser compute', ['pyodide','wasm','serverless','browser','asgi']],
  ['Robotics / embodied AI software layer', ['robot','robotics','embodied','humanoid']],
]
for (const [name, terms] of buckets) {
  const matched = top.filter(item => !item.discoveryOnly && terms.some(t => `${item.title} ${item.summary}`.toLowerCase().includes(t))).slice(0,3)
  lines.push(`- **${name}**: ${matched.length ? matched.map(x => x.title).join(' / ') : 'no strong item today'}`)
}
lines.push('')
lines.push('## Quality gate')
lines.push('- Aggregator items are discovery signals only; push copy must ratchet major claims to vendor blogs, changelogs, papers, releases, official repos, or primary reporting.')
lines.push('- Discovery-only or promotional social posts are downranked and must not lead the briefing without primary-source confirmation.')
lines.push('- If no digest change and no high-impact signal, scheduled push may stay silent.')
const reportPath = path.join(reportDir, `${today}.md`)
await writeFile(reportPath, lines.join('\n'), 'utf8')
await writeFile(path.join(reportDir, 'latest.md'), lines.join('\n'), 'utf8')
console.log(JSON.stringify({ snapshotPath, reportPath, changed, counts: snapshot.counts, sourceHealth }, null, 2))
