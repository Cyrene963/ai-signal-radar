VERDICT: MAJOR_REVISION

TOP_ISSUES:
1. **字体卖点与实现不符 + 全量 TTF 拖慢首屏**:README 与命令卡都宣称内置 LXGW 文楷用于"中文长文可读性",但 `index.css` 只把 `--zh` 应用到 `h1/h2/h3/.brand-mark/.eyebrow`,正文(`.lede`、卡片摘要等中文长文)落在 `--sans=Inter` 栈,Inter 无中文字形→实际回退到系统字体,核心卖点在正文处落空;且直接加载整套 `LXGWWenKai-Regular.ttf`(全 CJK 十几 MB)未子集化/未转 WOFF2,首屏严重受损。
2. **"浏览器实时抓取"对主源大概率因 CORS 失效**:`App.tsx` 用裸 `fetch` 直连 `aihot.virxact.com`,该第三方域名通常不向浏览器返回 CORS 头,生产环境会持续命中 catch→永远显示 fallback;健康卡报错文案自己都写"use server/cron fetch with browser-like UA",等于自认此路不通,而 Features 仍把它列为卖点,有误导性。
3. **变更检测/静默推送逻辑有 bug**:`fetch-radar` 把哈希写进 `{today}.hash.json` 并只和同日文件比对,跨天永远拿不到昨天的哈希(每天首跑 `previousHash` 恒空→`changed=true` 恒成立),README 宣称的"无实质变化则 cron 静默"在按天调度下基本失效;reports 里的 `(unchanged)` 只是同日重复跑出来的产物。

UI_DESIGN_COPY:
- 证据标签(Verified/Partial/Risk)思路好,但初始 health 恒为 `partial`("Live fetch pending"),叠加上面的 CORS 问题,用户最常看到的是 fallback+partial,与"source health visible"承诺有落差。
- `command-card` 里 `review.ui = claude_opus_latest()` 等是装饰性伪代码,对真实工作流无解释价值,反而与自述的"不要用精致卡片掩盖来源质量"自相矛盾。
- 输出文案大量全角标点/坏 URL 直接透传:`title_en` 出现 "hardware， ops"、"http：//lumalabs.ai/app"(全角冒号致链接不可点)、item #4 的 `title_en` 实为中文且夹 emoji,说明 normalize 未做清洗,降低可信观感。

CRON_DATA_PIPELINE:
- 质量门把"四端点必须 200"设为硬 FAIL:第三方一抖动 `npm run verify` 就挂,把发布与外部可用性强耦合,过脆;建议主源失败才 FAIL、单一聚合源降为 warning。
- 排序把引流类 KOL 内容顶到高位:`opportunityScore` 对 `agent/open source/github`+AI HOT 来源加权,使"免费领6个月ChatGPT Pro…推荐网易UU远程工具"这类带推广性质推文排到 #4,与"source-quality workflow"主张冲突;AIbase #9–#12 无 summary、缺 "Why it matters",深度不足。
- 去重 key 仅用 `url||title` 小写,标题近似但 URL 不同的同一事件不会合并,去重粒度偏粗;`privacy:scan` 被 README/门禁引用但脚本未在证据内,无法验证;UA 里仓库 owner(`Cyrene963`)与 git user(`Nitrogen`)、App 内 `LearnPrompt` 链接不一致,需核对。

FONT_LXGW_LXWG:
- 正确名称为 **LXGW WenKai(落霞孤鹜文楷)**,任务标题里的 "LXWG" 系笔误;代码引用 `LXGWWenKai-Regular.ttf`、路径 `/fonts/…→public/fonts/…`、OFL 1.1 许可与 `third-party-licenses` 声明齐备,合规无问题。
- 但文楷仅覆盖标题、中文正文未用上;`font-synthesis:none` 会让 h1/h2 失去合成粗体,削弱层级;必须子集化(按项目实际用字)+ WOFF2 + `unicode-range`,否则"为中文长文内置"名不副实且拖慢加载。

ACTIONABLE_FIXES:
1. **修正字体链路**:将 `--zh` 提升为 `body`/中文容器(正文、卡片、摘要)字体,`--sans` 仅留给英文数字;用 fonttools 子集化为 WOFF2 并加 `unicode-range`;去掉 `font-synthesis:none` 或显式提供粗体回退。
2. **主源走服务端**:前端改读 cron 产出的 `data/snapshots/latest.json`,或加轻量 serverless 代理转发 AI HOT;删除/降级"浏览器实时抓取"承诺,CORS 失败时给"已回退到快照"明确状态而非永久 partial。
3. **重构变更检测与清洗**:哈希持久化到单一 `latest.hash.json` 做跨天对比驱动静默推送;在 normalize 阶段清洗全角标点、修复 URL、校正 `title_en`,并对 KOL/广告模式(x.com 推广、"免费领"等)降权或强制打 `discovery-only` 标,给无 summary 项补抓或剔除出 Top。
