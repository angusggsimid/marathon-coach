# 马拉松备赛 App · 项目文档

> 最后更新：2026年5月

---

## 一、产品概述

一个面向中国跑者的马拉松训练计划生成器。用户填入目标赛事和历史成绩，系统在 30 秒内生成完整的个性化训练计划，支持多场赛事管理、打卡记录、导出到 Garmin/苹果日历，以及同步到 intervals.icu。

**核心价值主张：**
- 零订阅费，数据全在本地，不需要注册账号
- 基于 Jack Daniels VDOT 方法论，算法经过科学验证
- 自动处理多场赛事的降量/恢复期，不需要手动调整

---

## 二、技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | React 19 + Vite 8 | SPA，纯前端 |
| 样式 | Tailwind CSS v4 | Apple Dark 设计语言 |
| 状态 | Zustand 5 + persist | 全量存 localStorage |
| 路由 | 无（Tab 切换） | 4个Tab，无URL路由 |
| 日期 | date-fns | 所有日期计算 |
| 图标 | lucide-react | |
| PWA | vite-plugin-pwa + Workbox | 支持"添加到主屏幕" |
| 语言 | TypeScript（严格模式） | |
| 数据爬虫 | Node.js + Cheerio | 独立子项目，非运行时依赖 |

---

## 三、文件结构

```
Marathon/
│
├── src/
│   ├── App.tsx                    # 根组件：Tab 导航 + Toast
│   ├── main.tsx                   # 入口
│   ├── index.css                  # 全局样式 + CSS 变量（Apple 色板）
│   │
│   ├── components/
│   │   ├── ProfileForm.tsx        # Tab「档案」：用户信息 + 计划生成
│   │   ├── TrainingStats.tsx      # Tab「指标」：VDOT/配速区间/周均跑量图
│   │   ├── CalendarView.tsx       # Tab「训练」：训练日历 + 打卡 + 导出
│   │   ├── RaceTab.tsx            # Tab「赛事」：赛事库 + 我的赛事
│   │   └── TrainingLog.tsx        # 嵌入 CalendarView 的训练日志子页
│   │
│   ├── store/
│   │   └── useStore.ts            # Zustand store：全部应用状态
│   │
│   ├── hooks/
│   │   └── useEffectivePlan.ts    # 计算最终计划（叠加赛事覆盖 + 休假覆盖）
│   │
│   ├── utils/
│   │   ├── training-engine.ts     # 核心训练计划生成器（VDOT + 周期化）
│   │   ├── race-plan-overlay.ts   # 多赛事降量/恢复期覆盖
│   │   ├── checkin-messages.ts    # 打卡后励志语录池（按状态+强度+类型分类）
│   │   ├── export-ics.ts          # 导出 .ics 日历文件（苹果/Google 日历）
│   │   ├── export-fit.ts          # 导出 .fit 训练文件（Garmin Connect）
│   │   ├── zip.ts                 # 打包多个 .fit 为 .zip
│   │   ├── intervals-icu.ts       # 同步到 intervals.icu API
│   │   └── cn.ts                  # Tailwind className 合并工具
│   │
│   └── data/
│       └── races.ts               # 种子赛事数据（/api/data 失败时的 fallback）
│
├── public/
│   ├── favicon.svg                # App 图标（紫色闪电，用于 PWA）
│   └── races.json                 # 爬虫产出的赛事数据（每天自动刷新）
│
├── crawler/                       # 独立子项目：赛事数据爬虫
│   └── src/
│       ├── index.ts               # 爬虫入口
│       ├── scrapers/zuicool.ts    # 爬取 zuicool.com
│       ├── scrapers/gusto.ts      # 爬取 gusto.cn
│       ├── merge.ts               # 合并两个来源的数据
│       ├── server.ts              # 本地验证面板（仅开发用，port 3333）
│       └── types.ts               # 共享类型
│
├── .github/workflows/
│   └── crawl.yml                  # 每天 10:17（北京）自动跑爬虫，更新 public/races.json
│
├── cloudflare-worker.js           # intervals.icu CORS 代理（需手动部署到 CF Workers）
├── vercel.json                    # Vercel 路由配置（SPA fallback + API 重写）
├── vite.config.ts                 # Vite + Tailwind + PWA 配置
├── DEPLOY.md                      # 部署操作手册（面向新手）
└── PROJECT.md                     # 本文件
```

---

## 四、核心算法模块

### 4-1. 训练引擎（`training-engine.ts`）

整个系统的核心。输入用户档案，输出每日训练计划数组。

**计算流水线：**

```
用户历史成绩 (PB5K / PB10K / 半马 / 全马)
    ↓
VDOT（Jack Daniels 非线性公式，1979）
    ↓
基础峰值跑量（VDOT × 项目类型 查表插值）
    ↓
修正因子叠加：
  × 强度偏好（轻松0.80 / 适中1.00 / 较重1.25）
  × 目标差距（目标快于预测 → 增量最多25%）
  × BMI 安全系数（BMI > 22 线性折减，最低0.88）
  × 备赛周数（≥24周 1.00 / 16-23周 0.95 / <16周 0.88）
    ↓
三段式周期化曲线（基础期 → 专项期 → 峰值期）
  + 3:1 恢复周循环
  + Bosquet 2007 指数衰减减量（全马3周 / 半马2周）
    ↓
每周课次分配（COROS EvoLab 6区间配速模型）：
  轻松 4天制 / 适中 5-6天制 / 较重 6天制
    ↓
DailyWorkout[] — 每天：类型、距离、目标配速、心率区间、分段详情
```

**配速区间模型（COROS EvoLab）：**

以乳酸阈值配速（LT Pace）为锚点，±偏移量确定6个区间：

| 区间 | 相对 LT Pace | 用途 |
|------|-------------|------|
| Z1 | LT+97s 以上 | 恢复跑 |
| Z2 | LT+52s ~ +97s | 轻松跑/LSD |
| Z3 | LT+22s ~ +51s | 有氧功率 |
| Z4 | LT±12s | 节奏跑（阈值）|
| Z5 | LT-30s ~ -13s | 间歇跑 |
| Z6 | LT-30s 以下 | 速度训练 |

---

### 4-2. 赛事覆盖层（`race-plan-overlay.ts`）

处理多赛事的降量和赛后恢复期，不修改 training-engine 生成的基础计划。

**理论依据：**
- Mujika & Padilla (2003)：降量科学依据
- Bosquet et al. (2007) 182篇研究元分析：阶梯式减量优于线性减量
- Pfitzinger & Douglas《Advanced Marathoning》：分阶段强度保留原则

**降量策略（阶梯式）：**

| 降量阶段 | 距赛事 | 跑量保留 |
|---------|--------|---------|
| Phase A | 外1/3 | 75% |
| Phase B | 中1/3 | 60% |
| Phase C | 内1/3 | 45-60%（按目标） |

**课次类型转换（Pfitzinger原则）：降量前期保留强度，仅在最后一周取消高强度）**

**多赛事冲突处理规则：**
1. 同一天多个覆盖窗口重叠 → 取**最小**跑量系数（而非累乘）
2. 课次类型取**最保守**（强度最低）的那个
3. 双重降量防护：距主要赛事 ≤21天（全马）/ ≤14天（半马）的配速赛不触发降量

---

### 4-3. 休假覆盖层（`useEffectivePlan.ts`）

休假期间 → 训练变 Rest（0km）；复训期间根据停训长度渐进减量：

| 停训时长 | 复训减量 | 持续时间 |
|---------|---------|---------|
| ≤7天 | 无减量 | — |
| 8-14天 | -15% | 7天 |
| 15-28天 | -25% | 14天 |
| >28天 | -40% | 21天 |

---

### 4-4. 计划数据流

```
useStore.plan (原始计划, 日期可能是字符串)
    ↓
useEffectivePlan()
    ↓ normalize dates (Date instances)
    ↓ applyRaceOverlays (我的赛事 降量/恢复)
    ↓ applyVacationOverlay (休假遮盖)
    → 最终 DailyWorkout[]（全部组件使用这个）
```

---

## 五、页面组件说明

### Tab 1 — 档案（`ProfileForm`）

用户输入界面。包含：
- 生理信息（身高/体重，可选）
- 历史最好成绩（5K / 10K / 半马 / 全马，填越多计划越精准）
- 乳酸阈值心率 / 配速（可选，不填则自动推算）
- 主赛事设置（日期/项目，自动从「赛事」Tab 同步）
- 强度偏好 + 长跑安排日
- 生成计划按钮

**联动逻辑：** 在「赛事」Tab 加了赛事后，日期和项目自动填入，并显示主赛事信息卡。

---

### Tab 2 — 指标（`TrainingStats`）

计划生成后的数据仪表盘：
- VDOT 值 + 预测完赛时间 vs 目标时间
- 6区间配速表 + 心率区间表
- 月度跑量柱状图（含假期/降量视觉变化）
- 本周自适应建议（完成率 + 体感RPE → 下周增/减/保持）
- ICU 同步入口（需要填 API Key）

---

### Tab 3 — 训练（`CalendarView`）

主操作界面：
- 月历视图，每格显示运动类型、距离、状态标记
- 点击任意日期展开详情：分段训练说明 + 打卡操作
- 打卡面板：完成状态（完成/部分/跳过）+ RPE 体感评分
- 打卡后显示语录（按状态+RPE+类型分类的 100+ 条励志名言）
- 底部切换：日历 / 训练日志
- 工具栏：导出（ICS日历/FIT文件）+ 休假管理

**训练日志（`TrainingLog`）：** 按月分组展示打卡记录，统计完成率、累计跑量、连续打卡次数。

---

### Tab 4 — 赛事（`RaceTab`）

赛事数据库 + 个人赛事管理：
- 赛事列表（来自 `/api/data` 或 seed 数据，1200+ 场）
- 筛选：关键词 / 省份 / 距离 / 月份 / 报名状态
- 点击赛事 → 底部弹出详情 + 选择目标（冲PB / 认真完赛 / 体验跑）
- 「我的赛事」列表，可删除
- 手动添加赛事（不在库里的情况）
- 添加赛事后自动同步到档案Tab的主赛事设置

---

## 六、状态管理（`useStore.ts`）

单一 Zustand Store，通过 `persist` 中间件全量持久化到 `localStorage`。

**主要状态结构：**

```typescript
interface AppState {
  profile: UserProfile          // 用户档案（成绩、目标等）
  plan: DailyWorkout[]          // 原始训练计划（training-engine 输出）
  completions: Record<string, CompletionEntry>  // 打卡记录（key = 'YYYY-MM-DD'）
  myRaces: MyRace[]             // 已加入的赛事
  vacations: Vacation[]         // 休假区间
  activeTab: TabType            // 当前激活的Tab
  isPlanGenerated: boolean      // 是否已生成过计划
  planNeedsRegen: boolean       // 赛事变化后是否需要重新生成
  icuApiKey / icuAthleteId      // Intervals.icu 凭据
}
```

**关键联动：**
- `addMyRace / removeMyRace` → 自动调用 `primaryRaceProfile()` 同步 profile.raceDate / raceType
- `primaryRaceProfile()` 规则：优先最远的 PB 赛事，无 PB 则取最远的任意赛事
- `getWeeklyAdaptation()` → 根据上周打卡数据计算下周建议系数（0.90 / 1.00 / 1.05）

---

## 七、导出功能

| 格式 | 文件 | 用途 |
|------|------|------|
| `.ics` | `export-ics.ts` | 导入苹果日历 / Google 日历，全程计划一键同步 |
| `.fit` (ZIP) | `export-fit.ts` + `zip.ts` | 导入 Garmin Connect，包含完整训练结构和配速目标 |
| intervals.icu | `intervals-icu.ts` | 直接推送到 intervals.icu → 自动同步到 Garmin/COROS/Polar/Wahoo |

FIT 文件编码实现了完整的 ANT+ FIT Protocol v2.0 规范（包括 CRC-16 校验），无外部依赖。

---

## 八、部署架构

### 当前架构（已配置完毕）

```
GitHub Repo (mono-repo)
│
├── 前端 → Vercel 自动部署（生产：marathon-pi-seven.vercel.app）
│     每次 push main 触发，约1分钟上线
│
├── 前端 → EdgeOne Makers 自动部署（生产：marathon-gzgm45fm.edgeone.cool）
│     GitHub 集成，与 Vercel 并行；无 /api/data 重写，前端优先读 /races.json
│
├── 赛事数据 → GitHub Actions 定时刷新
│     每天 10:17 (北京时间)
│     爬虫运行 → public/races.json 更新 → push → 同时触发两端重部署
│
└── intervals.icu 代理 → Cloudflare Worker（可选）
      CORS 代理，无状态，免费额度充足
```

**路由配置（`vercel.json`）：**
```json
{ "source": "/api/data",  "destination": "/races.json" }  // 数据接口
{ "source": "/(.*)",      "destination": "/index.html"  }  // SPA fallback
```

**用户数据存储：** 全部在用户浏览器 `localStorage` 中，Vercel 不保存任何用户数据，无隐私问题。

---

## 九、未来规划

### 近期（部署上线后）

- [x] **PWA 图标完善**（2026-07-15 完成）：`pwa-192/512/512-maskable.png` + `apple-touch-icon-180`，绿底黑跑者品牌
- [x] **分享功能**（2026-06-03 完成）：备赛分享卡 + 复制/系统分享入口
- [x] **赛事数据来源扩展**（2026-07 完成）：zuicool + nowrun + chinarun + marathonbm 四源，质量门槛 + 跨源标准化去重

### 中期

- [ ] **云同步（可选）**：用户可以绑定账号将数据备份到云端，跨设备使用。考虑 Supabase（免费额度够用）
- [ ] **微信小程序**：使用 Taro 重写 UI 层，复用全部业务逻辑（training-engine、store、hooks），个人主体「工具」类目发布

### 长期

- [ ] **AI 计划调整**：基于打卡数据和用户反馈，用 LLM 生成自然语言解释和个性化调整建议
- [ ] **社区功能**：跑友计划对比、打卡动态流（需要账号系统，前提是云同步先做好）

---

## 十、开发注意事项

### 日期时区处理（重要）

训练引擎将所有日期设为**本地时间正午 12:00**（`setHours(12,0,0,0)`）以避免 DST 跨越问题。

日期比较**必须**使用 `format(date, 'yyyy-MM-dd')` 转换为本地日历字符串，然后以字符串或 UTC midnight（`new Date('YYYY-MM-DD')`）做差值比较，**不能**直接用 `differenceInDays(parseISO(str), workoutDate)`，否则在 UTC+8 环境下会出现 off-by-one。

### Zustand 反序列化

持久化存储中的 `Date` 会被 JSON 序列化为字符串。所有读取 `plan` 的代码应通过 `useEffectivePlan()`，该 hook 已做了 `instanceof Date` 检查和规范化。

### 计划生成逻辑是纯函数

`generateTrainingPlan(profile)` → `DailyWorkout[]` 是纯函数，无副作用。可以在单元测试中直接调用。`applyRaceOverlays` 和 `applyVacationOverlay` 同理。

---

*文档由 Claude 生成并维护。如功能有重大变更，请同步更新本文件。*
