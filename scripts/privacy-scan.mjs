import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
const roots = ['README.md','package.json','scripts','src','public']
const skipDirs = new Set(['.git','node_modules','dist','data','reports','review_artifacts'])
const skipExt = new Set(['.png','.jpg','.jpeg','.webp','.gif','.ttf','.woff','.woff2','.ico'])
const findings = []
const patterns = [
  ['private_key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['github_pat', /gh[pousr]_[A-Za-z0-9_]{20,}/],
  ['openai_like_key', /\bsk-[A-Za-z0-9_-]{24,}\b/],
  ['telegram_bot_token', /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/],
  ['local_private_path', /\/root\/(?:\.hermes|projects)\//],
]
async function walk(p) {
  const s = await stat(p)
  if (s.isDirectory()) {
    if (skipDirs.has(path.basename(p))) return
    for (const child of await readdir(p)) await walk(path.join(p, child))
  } else {
    if (skipExt.has(path.extname(p).toLowerCase())) return
    const text = await readFile(p, 'utf8').catch(() => '')
    for (const [name, rx] of patterns) {
      const m = text.match(rx)
      if (m) findings.push({ file: p, type: name, match: m[0].slice(0, 24) + '…' })
    }
  }
}
for (const r of roots) await walk(r).catch(() => {})
if (findings.length) { console.error(JSON.stringify({ status:'FAIL', findings }, null, 2)); process.exit(1) }
console.log(JSON.stringify({ status:'PASS', scanned: roots }, null, 2))
