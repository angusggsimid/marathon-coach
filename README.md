# Marathon — 马拉松备赛 Web App

面向中文跑者的备赛工具：根据成绩与目标赛事生成训练计划，提供配速/心率区间、训练日历、打卡、导出与 Intervals.icu 同步。

## 线上地址

- 生产：https://marathon-pi-seven.vercel.app
- 仓库：https://github.com/angusggsimid/marathon

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

## 当前数据快照（2026-07-13 发布）

| 指标 | 值 |
|---|---:|
| 赛事总数 | 1253 |
| 未来赛事 | 325 |
| 报名中 open | 72 |
| generatedAt | 2026-07-13T08:46:23.209Z |

详细状态见 `CONTEXT.md`。
