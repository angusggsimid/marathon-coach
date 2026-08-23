# Marathon — 项目说明（当前形态）

> 最后更新：2026-08-20。公开仓库：https://github.com/angusggsimid/marathon-coach（MIT License）。
> 部署与发布细节见 `DEPLOY.md`；历史决策见 `CONTEXT.md`（本地，不进仓库）。

## 一、产品概述

面向中文跑者的马拉松备赛 PWA：填写成绩与目标赛事生成训练计划，连接 COROS 手表自动同步训练数据，用科学指标解读身体状态并持续校准计划。

线上：Vercel `https://marathon-pi-seven.vercel.app` · EdgeOne `https://marathon-gzgm45fm.edgeone.cool`（均关联 main 自动部署）。

## 二、技术栈

React 19 · Vite 7 · TypeScript · Tailwind CSS v4 · Zustand · ECharts 6 · date-fns · Vite PWA · fit-file-parser（crawler 为独立 Node 子项目）。

## 三、结构

```
src/
├── App.tsx                  # 五 Tab 外壳 + OAuth 回调处理
├── components/
│   ├── ProfileForm.tsx      # 档案：成绩/目标/强度/高级（LT/LTHR）
│   ├── TrainingStats.tsx    # 指标：配速/心率区间（引擎推算）
│   ├── CalendarView.tsx     # 训练：日历/打卡/周报/证明卡/导出
│   ├── RaceTab.tsx          # 赛事：赛事库（races.json 每日刷新）
│   └── insights/            # 洞察 Tab：11 区块科学解读
├── store/useStore.ts        # Zustand：档案/计划/打卡/赛事/COROS 授权/快照
├── hooks/useEffectivePlan.ts# 计划流水线（赛事/休假/周自适应/课级就绪门）
└── utils/
    ├── training-engine.ts   # 训练引擎：VDOT→周期化课表 + 配速/心率区间（纯函数）
    ├── weekly-adaptation.ts # 周自适应：主观打卡 × COROS 客观裁决（min 保守）+ 周期层封顶 + 否决
    ├── week-snapshot.ts     # 周快照：三行证明 + 周报（单一数据口径）
    ├── coros-mcp.ts         # COROS OAuth PKCE + MCP 客户端（开发机免授权端点）
    ├── backup.ts            # JSON 备份/恢复
    ├── export-fit/ics.ts    # FIT/ICS 导出
    └── insights/            # 洞察库：快照解析、科学指标、教练处方、就绪门、周期层
crawler/                     # 赛事爬虫（zuicool/nowrun/chinarun/marathonbm），GitHub Actions 每日刷新
scripts/selftest-core.mts    # 引擎/算法/接口自测（372 用例）
```

## 四、五个 Tab

| Tab | 职责 | 数据来源 |
|---|---|---|
| 档案 | 成绩/目标/强度 → 生成计划 | 用户输入 |
| 指标 | 配速/心率区间参照表 | 引擎推算（LT 优先实测） |
| 训练 | 日历打卡、周报、自适应证明卡（可否决）、导出 | 计划 + 打卡 + COROS 客观裁决 |
| 赛事 | 赛事库检索与我的赛事 | races.json（每日刷新） |
| 洞察 | 科学解读 + 教练处方 + COROS 直连同步 + 手动导入 | COROS MCP / Garmin FIT / 快照文件 |

## 五、训练引擎与数据闭环

1. **引擎**（`training-engine.ts`，纯函数）：PB → VDOT → 周期化（基础/强度/峰值/减量）+ COROS EvoLab 六区间（`paceToZoneSec` 为单一事实源）。
2. **周自适应**：`factor = min(主观打卡, COROS 客观六信号)`，周期层（解耦>10%/EF 下滑）封顶 ≤1.0，用户可一键否决。
3. **课级就绪门**：近 3 天恢复信号差 → 3 天内第一个强度课自动降级为轻松跑（可否决）。
4. **数据源**：
   - COROS：OAuth 直连（官方 MCP），按设定频率自动同步活动/负荷/睡眠/HRV/体能评估；
   - Garmin：拖拽 .fit 导入（执行侧维度全量，恢复侧缺省并诚实标注）；
   - 手动：coros-snapshot.json。
5. **测试纪律**：引擎/算法/接口全部纯函数 + 372 用例（`npm run test:core`）。

## 六、关键文档索引

- `README.md` — 公开门面（中英）
- `DEPLOY.md` — 部署手册
- `AGENTS.md` — 项目规则（本仓库工作方式）
- `ADR_PWA_MCP_ARCHITECTURE_2026-08-15.md` — PWA 形态与 MCP 架构决策
- `TRAINING_LOOP_MASTER_PLAN_2026-08-16.md` — 三时程控制模型与路线图
- `TASK2_INTEGRATION_DESIGN_2026-08-16.md` — 洞察合并设计
- `PROJECT_REVIEW_PLAN_2026-08-20.md` — 复查规划与执行记录