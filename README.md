# AI Signal Radar

An open-source AI news intelligence desk that combines two verified public sources:

- **AI HOT** (`aihot.virxact.com`) for Chinese selected AI briefings and daily sections.
- **AI News Radar** (`LearnPrompt/ai-news-radar`) for broad source-health-aware 24h radar JSON.

The goal is not to become another noisy hotlist. The goal is a source-quality workflow: discover → deduplicate → label confidence → ratchet important claims to primary sources before sending alerts.

## Features

- React + Vite single-page UI.
- Live browser fetch from public AI HOT and AI News Radar JSON endpoints.
- Offline fallback cards so the UI remains understandable when a feed blocks browser CORS or is temporarily unavailable.
- Visible evidence labels: `Verified working`, `Partially verified`, `Risk`.
- Built-in **LXGW WenKai** font for Chinese long-form readability.
- No API key required for the default public-source path.

## Verified source endpoints

- AI HOT daily: `https://aihot.virxact.com/api/public/daily`
- AI HOT selected items: `https://aihot.virxact.com/api/public/items?mode=selected&take=18`
- AI News Radar latest 24h: `https://learnprompt.github.io/ai-news-radar/data/latest-24h.json`
- AI News Radar source status: `https://learnprompt.github.io/ai-news-radar/data/source-status.json`

## Development

```bash
npm install
npm run build
npm run dev
```

## Design notes

- UI/copy should make source quality visible, not hide it behind polished cards.
- Aggregator/KOL items are discovery signals only. Important claims should be verified against vendor blogs, changelogs, papers, release notes, official GitHub repos, or primary reporting.
- AI News Radar's GitHub Pages JSON path includes `/data/`; the non-`data/` paths are not the canonical public endpoint.

## Font license

`public/fonts/LXGWWenKai-Regular.ttf` is bundled under the SIL Open Font License 1.1. See `public/third-party-licenses/LXGWWenKai-OFL.txt`.

## Roadmap

- Add a small server/cron collector that normalizes source items into JSONL.
- Add local cache snapshots under a user-controlled data directory.
- Add official-source ratcheting status per item.
- Add optional multi-model reviewer lane for UI, design, copy, and source-quality review.
