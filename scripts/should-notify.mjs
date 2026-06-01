#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

const snap = JSON.parse(await readFile('data/snapshots/latest.json', 'utf8'))
const changed = Boolean(snap.changed)
const highImpact = Array.isArray(snap.highImpactSignals) ? snap.highImpactSignals : []
const sourceHealth = Array.isArray(snap.sourceHealth) ? snap.sourceHealth : []
const unhealthy = sourceHealth.filter(x => !x.ok || x.status !== 200)

const decision = {
  changed,
  highImpactCount: highImpact.length,
  unhealthyCount: unhealthy.length,
  digest: snap.digest || null,
  previousDigest: snap.previousDigest || null,
  shouldNotify: changed || highImpact.length > 0 || unhealthy.length > 0,
  reason: changed
    ? 'digest_changed'
    : highImpact.length > 0
      ? 'high_impact_signal'
      : unhealthy.length > 0
        ? 'source_degraded'
        : 'unchanged_no_high_impact',
}

console.log(JSON.stringify(decision, null, 2))
process.exit(decision.shouldNotify ? 0 : 10)
