# Marathon · 马拉松备赛 / Marathon Race-Prep App

面向中文跑者的马拉松备赛 PWA：填写成绩与目标赛事，30 秒生成个性化训练计划；连接 COROS 手表后自动同步训练数据，用科学指标解读身体状态，并持续校准你的训练方案。

_A marathon-prep PWA for Chinese runners: fill in your results and target race, and get a personalized training plan in 30 seconds. Connect your COROS watch to auto-sync training data, interpret your body with science-based metrics, and keep your plan calibrated._

## ✨ 功能 / Features

| 能力 / Ability | 说明 / Description |
|---|---|
| **生成计划 / Plan** | 成绩 → VDOT → 周期化每日课表（基础/强度/峰值/减量）+ 配速·心率区间 |
| **打卡与自适应 / Check-in & Adaptation** | 本周视图、周报、距离自适应（主观打卡 × COROS 客观裁决，冲突取保守） |
| **COROS 直连 / COROS Live Sync** | OAuth 一键授权，按设定频率自动同步活动、负荷、睡眠、HRV、体能评估 |
| **科学解读 / Insights** | 效率因子（EF）、有氧解耦、Seiler 80/20 强度分布、恢复雷达、睡眠负债、课级就绪门 |
| **Garmin 导入 / Garmin Import** | 拖拽 .fit 文件即解析，执行侧指标全量支持 |
| **赛事库 / Race Library** | 1200+ 场中国赛事，多源聚合，每日自动刷新 |
| **导出 / Export** | 日历 ICS、FIT、Intervals.icu 同步（可选代理） |

## 🚀 线上地址 / Live Sites

- Vercel：https://marathon-pi-seven.vercel.app
- 腾讯云 EdgeOne：https://marathon-gzgm45fm.edgeone.cool

两个生产环境均关联 GitHub `main` 分支自动部署。_Both production environments auto-deploy from the `main` branch._

## 🛠 本地运行 / Local Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建
npm run test:core # 引擎与算法自测（307 用例）
```

> 开发环境会自动复用本机 OpenCode 的 COROS 授权（`/__dev/coros-auth`），免反复登录；生产环境走标准 OAuth。

## 🧠 工作原理 / How It Works

```
成绩/PB ──→ 训练引擎（VDOT + COROS EvoLab 区间）──→ 周期化计划
                                                     │
COROS 手表 ──MCP/OAuth──→ 快照 ──→ 科学解读（EF/解耦/Seiler/恢复）
        ──→ 客观裁决 × 主观打卡 ──→ 下周计划调整（可一键否决）
```

引擎、算法、接口全部为纯函数 + 自测覆盖（`src/utils/`、`scripts/selftest-core.mts`）。

## 📦 技术栈 / Tech Stack

React 19 · Vite 7 · TypeScript · Tailwind CSS v4 · Zustand · ECharts · date-fns · Vite PWA · fit-file-parser

## 📁 目录结构 / Structure

- `src/` — 主应用（档案/指标/训练/赛事/洞察 五 Tab）
- `crawler/` — 赛事数据爬虫（zuicool / nowrun / chinarun / marathonbm）
- `scripts/` — 自测与数据脚本
- `docs` — 架构决策记录（ADR）、任务规划（TRAINING_LOOP）等

## 📜 License

[MIT](LICENSE)