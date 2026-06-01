#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

const snap = JSON.parse(await readFile('data/snapshots/latest.json', 'utf8'))
const changed = Boolean(snap.changed)
const top = Array.isArray(snap.top) ? snap.top : []
const sourceHealth = Array.isArray(snap.sourceHealth) ? snap.sourceHealth : []
const unhealthy = sourceHealth.filter(x => !x.ok || x.status !== 200)
const previousHashExists = Boolean(snap.previousDigest)

function strongPrimarySignal(item) {
  if (!item || item.discoveryOnly) return false
  const text = `${item.title || ''} ${item.summary || ''} ${item.source || ''}`.toLowerCase()
  const host = String(item.primaryHost || '').toLowerCase()
  const trustedHost = /(^|\.)(openai\.com|anthropic\.com|deepmind\.google|googleblog\.com|microsoft\.com|github\.com|nvidia\.com|developer\.nvidia\.com|techcrunch\.com|simonwillison\.net|huggingface\.co|minimax\.io|qwen\.ai|alibabacloud\.com|tencent\.com)$/.test(host)
  const highValue = /security|guardrail|pricing|billing|token|robot|robotics|pyodide|wasm|browser|local|open source|memory|agent|inference|gpu|coding|copilot/.test(text)
  return trustedHost && highValue && Number(item.opportunityScore || 0) >= 0.9
}

// If the top digest did not change, do not repeatedly notify for the same
// strong primary signals. They remain in reports/latest.md for manual reading.
const highImpact = changed ? top.filter(strongPrimarySignal).slice(0, 8) : []
const decision = {
  changed,
  previousHashExists,
  highImpactCount: highImpact.length,
  highImpactSignals: highImpact.map(x => ({ title: x.title, url: x.url, source: x.source, score: x.opportunityScore })),
  unhealthyCount: unhealthy.length,
  digest: snap.digest || null,
  previousDigest: snap.previousDigest || null,
  shouldNotify: changed || unhealthy.length > 0 || !previousHashExists,
  reason: changed
    ? 'digest_changed'
    : unhealthy.length > 0
      ? 'source_degraded'
      : !previousHashExists
        ? 'first_run_no_previous_digest'
        : 'unchanged_no_high_impact',
}

console.log(JSON.stringify(decision, null, 2))
process.exit(decision.shouldNotify ? 0 : 10)
