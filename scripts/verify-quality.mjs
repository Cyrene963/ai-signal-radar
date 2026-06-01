import { readFile } from 'node:fs/promises'
const snap = JSON.parse(await readFile('data/snapshots/latest.json', 'utf8'))
const report = await readFile('reports/latest.md', 'utf8')
const failures = []
function ok(cond, msg) { if (!cond) failures.push(msg) }
ok((snap.sourceHealth || []).length >= 4, 'expected four source-health probes')
ok((snap.sourceHealth || []).every(x => x.ok && x.status === 200), 'all source probes must be HTTP 200')
ok((snap.counts?.total_after_dedupe || 0) >= 100, 'deduped coverage must be broad')
ok((snap.counts?.radar_source_count || 0) >= 50, 'AI News Radar source_count must be broad')
ok((snap.counts?.top_items || 0) >= 20, 'top item pool must retain enough candidates')
for (const section of ['Source health','Coverage','Top signals to ratchet','Opportunity map','Quality gate']) ok(report.includes(`## ${section}`), `missing report section ${section}`)
ok(report.length >= 3500, 'report too short for deep daily radar')
ok(!/API[_-]?KEY|SECRET|ghp_|sk-[A-Za-z0-9]{20,}/i.test(report), 'report contains secret-shaped text')
if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ status: 'PASS', deduped: snap.counts.total_after_dedupe, radarSources: snap.counts.radar_source_count, reportBytes: report.length }, null, 2))
