# Marathon — 马拉松备赛 Web App

面向中文跑者的备赛工具：根据成绩与目标赛事生成训练计划，提供配速/心率区间、训练日历、打卡、导出与 Intervals.icu 同步。

**执行本体**：未来 90 天以 **PWA** 为主（可安装、离线预缓存赛事数据、本机状态）。不依赖小程序/原生 App。

## 线上地址

- 生产：https://marathon-pi-seven.vercel.app
- 仓库：https://github.com/angusggsimid/marathon

## 用户可见能力（摘要）

| 能力 | 说明 |
|---|---|
| 生成计划 | 档案页填成绩/目标 → 训练日历与配速区间 |
| 打卡 / 自适应 | 本周视图、周报、距离自适应 |
| 导出 | ICS 日历、FIT（今天/本周/全部）、Intervals.icu 同步 |
| **安装 PWA** | PNG 192/512 + maskable、iOS `apple-touch-icon`（绿底+黑跑者，与 header 品牌一致） |
| **数据与备份** | 档案页导出/恢复 JSON（无 API Key；Athlete ID 不进备份且本机保留；恢复不改标签页，留在档案页） |
| **微信提示** | 仅微信内显示逃生舱：复制链接 + 系统浏览器打开说明 |
| **试用诊断** | 本机聚合计数导出（日粒度）；不含计划/成绩/密钥 |

## 本地开发

```bash
npm install
npm run dev
```

```bash
npm run lint
npm run build
npm run test:core
```

PWA 浏览器验收（需先 `npm run build` + `npx vite preview`）：

```bash
node acceptance-2026-07-15-pwa/browser-acceptance.mjs
```

爬虫子项目：

```bash
cd crawler && npm install
npm run scrape          # 全量 → output/scraped-races.json（裸数组）
npm run test:normalize
npx tsc --noEmit
```

公开赛事数据契约（`public/races.json` / `/api/data`）：

```json
{
  "generatedAt": "2026-07-13T08:46:23.209Z",
  "races": [ /* RaceEvent[] */ ]
}
```

`vercel.json` 将 `/api/data` 重写到 `/races.json`。GitHub Actions 每日 10:17（北京）刷新并写回同一结构。

## 部署

见 `DEPLOY.md`。推送 `main` 后 Vercel 自动构建部署。Intervals.icu 同步依赖可选的 Cloudflare Worker（`cloudflare-worker.js`），需单独在 Cloudflare 配置。

中国大陆可达性探针方案（外部、**尚未执行拨测**；阈值标为试运行 SLO，待建基线；需用户后续选具备大陆运营商拨测的供应商）：`PWA_FOUNDATION_MEASUREMENT_2026-07-15.md`。

## 当前数据快照（2026-07-13 发布）

| 指标 | 值 |
|---|---:|
| 赛事总数 | 1253 |
| 未来赛事 | 325 |
| 报名中 open | 72 |
| generatedAt | 2026-07-13T08:46:23.209Z |

详细状态见 `CONTEXT.md`。
