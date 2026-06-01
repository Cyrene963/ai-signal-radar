import { readFile } from 'node:fs/promises'
const snap = JSON.parse(await readFile('data/snapshots/latest.json', 'utf8'))
const report = await readFile('reports/latest.md', 'utf8')
const failures = []
const warnings = []
function ok(cond, msg) { if (!cond) failures.push(msg) }
function warn(cond, msg) { if (!cond) warnings.push(msg) }
const health = snap.sourceHealth || []
const primary = new Set(['aihotDaily', 'aihotItems', 'radarLatest', 'radarStatus'])
const primaryHealth = health.filter(x => primary.has(x.name))
ok(health.length >= 4, 'expected at least four source-health probes')
ok(primaryHealth.length === 4, 'expected all primary source probes to be present')
ok(primaryHealth.filter(x => x.ok && x.status === 200).length >= 3, 'at least three primary probes must be HTTP 200')
warn(primaryHealth.every(x => x.ok && x.status === 200), 'one or more primary probes degraded; keep report but label risk')
ok((snap.counts?.total_after_dedupe || 0) >= 100, 'deduped coverage must be broad')
ok((snap.counts?.radar_source_count || 0) >= 50, 'AI News Radar source_count must be broad')
ok((snap.counts?.top_items || 0) >= 20, 'top item pool must retain enough candidates')
ok((snap.top || []).slice(0, 8).every(x => !x.discoveryOnly), 'discovery-only/promotional items must not lead the top 8')
for (const section of ['Source health','Coverage','Top signals to ratchet','Opportunity map','Quality gate']) ok(report.includes(`## ${section}`), `missing report section ${section}`)
ok(report.length >= 3500, 'report too short for deep daily radar')
ok(!/API[_-]?KEY|SECRET|ghp_|sk-[A-Za-z0-9]{20,}/i.test(report), 'report contains secret-shaped text')
if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures, warnings }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ status: warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS', warnings, deduped: snap.counts.total_after_dedupe, radarSources: snap.counts.radar_source_count, reportBytes: report.length }, null, 2))
