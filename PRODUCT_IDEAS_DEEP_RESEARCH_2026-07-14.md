# Marathon 七候选创意 · Deep Research 产品规格

> 日期：2026-07-14
> 作者角色：产品负责人 / UX / 前端与数据架构（Grok 主协作者）
> 约束：只改文档；不改产品代码 / 配置 / 依赖 / 数据；不提交、不推送、不部署
> 用途：产品评审 + 后续开发拆分

---

## 0. 研究边界与证据口径

| 标签 | 含义 |
|------|------|
| **已观察** | 本仓库源码、验收产物、线上契约中可直接核对 |
| **外部事实** | 已打开或检索到的一手/可靠文档（链接可点） |
| **推断** | 基于证据的合理设计结论，实现前可证伪 |
| **未知** | 缺数据或需用户决策 |

**访问边界**

- **GitHub / 官方文档 / NN/g / Duolingo Blog / Intervals.icu 论坛 / Garmin FIT / Product Hunt 产品页**：本轮可访问并核验。
- **X（Twitter）**：可用关键词检索，但跑步训练产品相关命中噪声高，**不作为主要证据**。
- **Product Hunt**：可打开产品页；无「完整内部埋点」，仅作定位与相似产品参考。
- **禁止方向**（任务约束）：通用 AI 聊天、社交社区、医疗诊断、年度赛季编排、私有 API 逆向。

**本轮核验过的关键外部来源（节选，全文见各点子 B 节）**

1. https://www.nngroup.com/articles/ten-usability-heuristics/
2. https://blog.duolingo.com/how-duolingo-streak-builds-habit/
3. https://developer.garmin.com/fit/
4. https://forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624
5. https://www.intervals.icu/features/open-api/
6. https://support.garmin.com/en-US/?faq=o21H5a4cSU52FwFAy0R6Z5
7. https://www.garmin.com/en-US/garmin-coach/overview/
8. https://www.trainingpeaks.com/learn/trainingpeaks-athlete-user-guide/
9. https://support.runna.com/en/articles/6205993-adjusting-your-running-ability
10. https://www.producthunt.com/products/smart-runner
11. https://www.behaviormodel.org/ （BJ Fogg Behavior Model，公开站点）
12. https://github.com/mkuthan/garmin-workouts
13. https://github.com/stacksjs/ts-watches
14. https://help.trainingpeaks.com/hc/en-us/articles/231472468-TrainingPeaks-Athlete-User-Guide

**源数量统计（报告级）**：约 **40+** 条 Web 检索命中；其中 **14** 条一手/可点链接写入规格；X 侧有效产品信号弱（标注访问边界）。

---

## 1. 总原则与七点整体产品架构

### 1.1 产品定位（已观察）

Marathon 是 **local-first、无账号、中文跑者备赛 Web App**：

- 栈：React + TypeScript + Vite + Zustand persist + Tailwind（Apple Dark）+ PWA。
- 计划流水线（已观察）：`generateTrainingPlan` → `applyRaceOverlays` → `applyVacationOverlay` → `applyWeeklyAdaptation`（见 `src/hooks/useEffectivePlan.ts`）。
- 赛事：`public/races.json`（`generatedAt` + `races[]`），多源 `sources[]`，爬虫日更；前端可 fallback seed。
- 导出：ICS / 全量 FIT ZIP / Intervals.icu（API Key 仅会话内存）。
- **不是**：社交、云账号、医疗诊断、教练后台。

### 1.2 七点在「同一用户心智」中的位置

```
选赛/关注 ──► 生成计划 ──► 本周执行 ──► 打卡反馈 ──► 周自适应 ──► 手表/日历同步
   │              │            │            │            │              │
   ③变更单        ④重同步      ⑤区间导出    ⑥低压力     ①三行证明      ④重同步
   ⑦冲突解释                  ②周日周报    动量完成度   ②周日周报
```

| 点子 | 用户一句话 | 主 Tab | 是否新增算法 |
|------|-----------|--------|-------------|
| 1 三行证明 | 「为什么本周距离变了？」 | 训练 | 否，包装已有自适应 |
| 2 周日周报 | 「上周跑得怎么样？」 | 训练 | 轻量汇总 + 分享 |
| 3 赛事变更单 | 「我关注的赛变了吗？」 | 赛事 | 快照 diff |
| 4 重同步提醒 | 「改完计划手表还是旧的」 | 训练/导出 | 指纹 + 提醒态 |
| 5 区间 FIT | 「只要今天/本周课表」 | 训练/导出 | 过滤已有 encoder |
| 6 低压力 Momentum | 「没跑满也不崩」 | 训练/日志 | 完成度重定义 |
| 7 字段冲突解释 | 「两个来源日期不一样」 | 赛事 | 合并溯源展示 |

### 1.3 总原则（评审门禁）

1. **解释先于自动化**：任何自动改距离/改日程，必须用白话说明「改了什么 / 依据 / 没改什么」（NN/g Visibility of System Status）。
2. **local-first 优先**：无账号也能完整用；跨设备云同步不在本批。
3. **复用计算，少造引擎**：自适应、FIT、merge、completions 已存在；优先 UI + 小工具函数。
4. **低压力默认**：不惩罚 skip；不把「连续天」当唯一成功标准。
5. **数据诚实**：无字段级证据时不假装「已核实」；缺失显示为风险而非完成。
6. **导出与同步同源**：都读 `useEffectivePlan()` 结果，避免日历看的是自适应后、手表是生成时旧 plan。
7. **不做过度工程**：无通用聊天、无消息中台、无私有爬取逆向。

### 1.4 共享能力层（摘要；详 § 共享架构）

建议抽 **4 个纯函数模块 + 2 个 store 字段组**（实现阶段再落代码，本报告只定边界）：

| 模块（建议路径） | 职责 | 消费点子 |
|------------------|------|----------|
| `utils/week-snapshot.ts` | 周区间、打卡率、跑量、自适应 meta 结构化 | 1,2,6 |
| `utils/plan-fingerprint.ts` | 有效计划内容指纹 + lastExport/lastSync | 4,5 |
| `utils/race-watch-diff.ts` | myRaces 快照 vs 目录最新 | 3,7 |
| `utils/export-fit.ts`（扩展） | 按日期范围过滤再 ZIP | 5 |
| store: `exportSyncMeta` | 上次同步范围/时间/指纹 | 4 |
| store: `raceSnapshots` | 关注赛事字段快照 | 3 |
| store: `momentumPrefs`（可选） | 低压力模式开关 | 6 |

---

## 2. 点子 1 — 本周调整「三行证明」

### A. 真实用户任务与证据强度

- **任务**：打开本周训练时，3 秒内理解「距离为什么 ±N%、依据哪一周的打卡、什么没变」。
- **痛点（已观察）**：`applyWeeklyAdaptation` 会静默缩放；UI 已有横幅但文案仍偏算法口语（「完成率 80% · 体感正常」），缺固定三行骨架与可展开证据。
- **证据强度**：高（功能已接线；缺口在可解释性与一致性）。

### B. 外部案例与借鉴（事实 / 推断）

| 来源 | 类型 | 可点击链接 | 事实 | 可借鉴（推断） |
|------|------|------------|------|----------------|
| Garmin Coach | 官方 | https://www.garmin.com/en-US/garmin-coach/overview/ | 自适应计划会说明「为何建议该课」；缺课/恢复会调整 | 把「为什么」放在课表入口，而非设置页 |
| Garmin Support | 官方 | https://support.garmin.com/en-US/?faq=o21H5a4cSU52FwFAy0R6Z5 | 部分自适应计划禁止手改排期，靠自动重排 | 我们**不**禁止手改；只解释自动缩放 |
| Runna Support | 官方 | https://support.runna.com/en/articles/6205993-adjusting-your-running-ability | 调整能力会 rebuild 周跑量与长跑 | 改动后给一句结果说明 |
| NN/g Heuristic #1 | 研究 | https://www.nngroup.com/articles/ten-usability-heuristics/ | 系统状态可见建立信任 | 三行固定结构 = 状态可见 |
| Smart Runner PH | PH | https://www.producthunt.com/products/smart-runner | on-device 自适应；评论关心「坏一次读数是否改整块」 | 我们已用「整周聚合」抗噪声；应写进证明第 2 行 |

### C. 当前可复用（已观察）

| 资产 | 路径 | 说明 |
|------|------|------|
| 系数计算 | `src/utils/weekly-adaptation.ts` → `computeWeeklyAdaptation` | factor 0.90 / 1.00 / 1.05；completionRate、avgRpe |
| 应用规则 | 同文件 `applyWeeklyAdaptation` | 仅上一完整周结束后，缩放「下一周」今天及以后非 Rest/Race |
| UI meta | `getActiveAdaptationMeta` | active / factor / advice / prevWeek |
| 横幅 | `CalendarView.tsx` ~992–1007 | 已有标题 + advice +「配速与比赛日不变」 |
| 底表 | `useBasePlan` / `useEffectivePlan` | 自适应与 meta 共用 race+vacation 底表 |
| 自测 | `scripts/selftest-core.mts` | 自适应规则已有用例 |

**限制**：自适应不改配速/类型/比赛日；factor=1 时无 active 横幅；用原始 plan 算 completion 的 store 方法与 effective plan 距离可能略有差异（注释已说明）。

### D. 范围 / 明确不做

**做**

- 固定 **三行证明** 组件：①改了什么 ②依据什么 ③没改什么。
- 可点开「证据」：上周打卡 X/Y、完成率、平均 RPE、作用日期窗。
- factor=1 时可选展示「保持」态（弱样式，不抢主任务）。

**不做**

- 不改自适应阈值/阈值科学本身（除非另开算法项目）。
- 不做 LLM 解释、不做推送、不让用户手调 factor（MVP）。

### E. 用户旅程

1. 用户上周至少打卡 1 次且周日已过 → 进入「训练 · 本周」。
2. 若 factor≠1：顶部出现三行证明卡（绿 +5% / 橙 −10%）。
3. 扫读 3 行 → 可选「查看依据」展开数字。
4. 继续看本周日列表；课次 description 仍可含【自适应±N%】。
5. 若无打卡 / 无缩放：无强调卡，或弱「本周保持原计划距离」。

### F. 交互状态

| 状态 | 表现 |
|------|------|
| 首次有计划、上周无打卡 | 无强调卡；不假装已评估 |
| 正常缩放 | 三行 + 可展开 |
| 保持 factor=1 且有打卡 | 可选弱态一行 |
| 加载 | 无（纯本地计算） |
| 失败 | 无网络依赖 |
| 数据过期 | 跨周后自动切到新 prevWeek；旧周证明消失 |
| 撤销 | 改/删上周打卡 → 立即重算（无单独撤销按钮） |
| 权限 | N/A |
| 跨设备/旧数据 | 仅当前浏览器 localStorage；无云同步说明可放帮助一行 |

### G. 技术实现

**前端边界**

- 新展示组件建议：`AdaptationProofCard`（仅 props，无 store 副作用）。
- 父级：`CalendarView` 本周视图顶部（替换/升级现有 banner）。
- 数据：`getActiveAdaptationMeta(basePlan, completions)` + 可选 `prevWeek` 明细。

**数据模型（纯派生，可不 persist）**

```ts
type AdaptationProof = {
  active: boolean;
  factor: 0.9 | 1 | 1.05; // 实际以 number
  line1: string; // 改了什么
  line2: string; // 依据
  line3: string; // 没改什么
  evidence: {
    prevWeekStart: string; prevWeekEnd: string;
    checkedCount: number; totalWorkouts: number;
    completionRate: number; avgRpe: number;
    targetWeekStart: string; targetWeekEnd: string;
  } | null;
};
```

**计算规则**：完全复用现有 threshold（&lt;70% 或 RPE≥3 → 0.9；≥90% 且 RPE≤1.5 → 1.05；否则 1.0）。文案模板化，禁止手写分叉逻辑第二套。

**persist**：无需迁移。

**性能/安全**：O(周课次数)；无 PII 外传。

### H. 文案示例

- L1：`本周训练距离已自动 −10%`
- L2：`依据：上周 3/5 节打卡，完成率 60%，平均体感「累」`
- L3：`配速、课型、比赛日、休息日不变`
- 展开：`作用范围：本周一至周日中，今天及以后的跑步课`
- 保持：`上周完成正常 · 本周距离保持不变`

### I. UI 规格

- 层级：本周标题下方、日列表上方；单卡，不遮导航。
- 颜色：− → `--color-orange`；+ → `--color-accent`；保持 → `label-3` 弱边框。
- 图标：`Info` / `TrendingDown` / `TrendingUp`（lucide 已有生态）。
- 移动：全文 `break-words`；展开区 `text-[11px]`。
- 桌面：`max-w-lg` 内同构。
- a11y：卡片 `role="status"`；对比度用现有语义色。

### J. 分期

| 阶段 | 内容 |
|------|------|
| MVP | 三行模板 + 替换现 banner + 展开证据 |
| P2 | 月历周日 tip 复用同一组件；打卡后预告「将影响下周」 |
| 后置 | 用户覆盖 factor、历史周证明时间线 |

### K. 测试与验收

- 单测：给定 completions 快照 → 三行字符串与 factor 一致（扩展 `test:core`）。
- 浏览：上周低完成 → 橙卡；高完成低 RPE → 绿卡；无打卡 → 无卡。
- 验收：用户不用读代码即可复述「为什么变」。

### L. 指标

- 验证（无开发）：5 名目标用户看截图复述正确率 ≥4/5。
- 成功：周视图打开后证明卡曝光且无「看不懂」反馈主导。
- 失败停止：文案导致误以为配速也变了 → 立刻改 L3 权重。

### M. 风险与依赖

- 与「周报」「Momentum」文案抢注意力 → 合并信息架构（见后文）。
- `getWeeklyAdaptation(sundayOfRow)` 与 active meta 口径要统一。

### N. 影响文件与复杂度

- 影响：`CalendarView.tsx`，可选新 `components/AdaptationProofCard.tsx`，`weekly-adaptation.ts` 导出 builder。
- **复杂度：小**。

---

## 3. 点子 2 — 周日 60 秒周报

### A. 真实用户任务与证据强度

- **任务**：周日晚或周一早，用 ≤60 秒回顾上周完成度、跑量、体感、对下周的影响，并可复制分享。
- **证据强度**：中高（数据已有；缺「周报」入口与固定模板）。

### B. 外部案例

| 来源 | 链接 | 事实 | 借鉴（推断） |
|------|------|------|--------------|
| TrainingPeaks Week Summary | https://www.trainingpeaks.com/learn/trainingpeaks-athlete-user-guide/ | 日历侧有 Week Summary 布局 | 周级汇总是训练产品标准物件 |
| TP Help | https://help.trainingpeaks.com/hc/en-us/articles/231472468-TrainingPeaks-Athlete-User-Guide | Layout 可配置周摘要指标 | MVP 固定 4–5 指标即可 |
| 分享文案现状 | 已观察 `CalendarView` shareText | 已有本周 km / 今天课 | 周报扩展为「上周结果 + 下周一句」 |
| Smart Runner / Runna | PH / support 链接见上 | 自适应后用户要「总结感」 | 周报承接三行证明 |

### C. 可复用

- `completions`、`useEffectivePlan`、`computeWeeklyAdaptation`、`TrainingLog` 统计逻辑、`sharePlan` / clipboard、`checkin-messages` 语气库（可选一句鼓励）。
- **限制**：无服务端邮件/推送；PWA 无可靠「周日 20:00 必达」除非系统通知权限（后置）。

### D. 范围

**做**：应用内「上周小结」卡片 + 一键复制 60 秒文案；周日/周一入口高亮。
**不做**：邮件、微信服务号、PDF、教练批注、年度报告。

### E. 旅程

1. 周日 12:00 后或周一打开训练 Tab。
2. 见「上周 60 秒」卡（可折叠）。
3. 扫读：完成 X/Y · 跑量 · 均 RPE · 对下周影响。
4. 点「复制周报」→ Toast。
5. 可选跳转打卡补记。

### F. 状态

| 状态 | 表现 |
|------|------|
| 首次周、无计划 | 不显示 |
| 上周无任何打卡 | 空态：「还没打卡，补记后生成小结」+ CTA |
| 正常 | 完整四行 + 复制 |
| 加载/失败 | 本地即时 |
| 过期 | 仅展示「上一完整周」；更早周后置 |
| 撤销 | 改打卡后文案即时变 |
| 权限 | clipboard 失败 → 降级 textarea 选中（已有模式） |

### G. 技术

- `buildWeeklyReport(plan, completions, asOf): WeeklyReport` 放 `week-snapshot.ts`。
- 文案长度目标 ≤280 字中文。
- 不 persist；可 persist `lastReportDismissedWeekKey` 避免烦。
- 与点子 1 共用 evidence 字段。

### H. 文案示例

```
【上周训练小结】
打卡 4/5 · 完成率 80% · 体感偏正常
折算跑量约 42 km
下周：距离保持（配速与比赛日不变）
目标赛：上海半马 · 还有 11 周
```

### I. UI

- 位置：本周视图顶部，**三行证明之下**或合并为「本周状态」区块第二节。
- 主按钮：复制；次：关闭本周不再提示。
- 遵守 `surface` / `rounded-2xl` / accent CTA。

### J. 分期

- MVP：卡 + 复制 + 空态
- P2：系统分享 `navigator.share`、简单条形完成可视化
- 后置：通知、邮件

### K. 测试

- 单测：固定 plan/completions → 报告字段；
- 手工：周日/周一显示，周二弱化为入口菜单项。

### L. 指标

- 无开发验证：用户朗读文案是否 ≤60 秒。
- 成功：复制使用率在活跃用户中可感知（本地 analytics 后置；MVP 用访谈）。
- 停止：与证明卡信息 80% 重复且用户抱怨吵 → 合并 UI。

### M. 风险

- 无推送导致「周日」场景召回弱 → 依赖打开 App；可在周一训练 Tab 红点。

### N. 复杂度：**小–中**（偏小）。影响：`CalendarView`、新 util、可选 store dismiss key。

---

## 4. 点子 3 — 关注赛事变更单

### A. 用户任务与证据

- **任务**：我的关注/参赛列表里，日期、状态、报名链接、城市若因数据刷新变化，进入 App 能看到「变更单」，决定是否改目标/重生成计划。
- **证据强度**：高需求逻辑；实现依赖已有 `myRaces` 反范式字段 + 日更 `races.json`。CONTEXT 记载多源合并与日期校正（如黄果树日期）。

### B. 外部案例

| 来源 | 链接 | 事实 | 借鉴 |
|------|------|------|------|
| 跑者注册变更 FAQ（多场官方） | 例：https://help.runsignup.com/support/solutions/articles/17000062920-view-edit-a-registration | 用户习惯在平台看注册变更 | 我们做「信息变更」非报名系统 |
| 爬虫审计 | 已观察 `crawler/output/crawler-audit.md` 机制 | 日更与状态校正真实发生 | 变更单是数据刷新的用户面 |
| 产品审计 | `product-audit-2026-06-03-fixcheck` | 多源确认已解释 | 变更单要区分「可信更新」vs「冲突」 |

### C. 可复用

- `MyRace`：`raceId, date, status, name, city, registrationUrl…`（`useStore.ts`）
- `RaceTab` 加载 `/races.json` 得 `generatedAt`
- `planNeedsRegen`：主赛事日期变会标（仅 primary 变时）
- **缺口**：无「上次已知目录快照」；删除/改期不会生成 diff 列表；非 primary 赛事变更可能静默。

### D. 范围

**做**

- 对 `myRaces` 每条保留 `catalogSnapshot`（加入时 + 用户确认后更新）。
- 打开赛事 Tab：目录命中同 id → diff 字段 →「变更单」列表。
- 字段：`date, status, name, city, province, registrationUrl, _dateTBD`。
- 用户可「接受更新」或「仍保留我的记录」。

**不做**

- 推送/短信；监控未关注的全库；自动改计划（可提示去重新生成）；抓登录后报名后台。

### E. 旅程

1. 用户加入赛事 → 写入 snapshot。
2. 日后 `races.json` 更新。
3. 打开「赛事」→ 顶部「N 条关注有变更」。
4. 点开：旧值 → 新值；CTA：接受 / 忽略本次 / 打开官网。
5. 若 date 影响 primary → 联动 `planNeedsRegen`。

### F. 状态

| 状态 | 表现 |
|------|------|
| 无 myRaces | 不显示 |
| 目录加载中 | 变更区 skeleton |
| 目录失败 seed | 提示「离线库可能不准，变更检测降级」 |
| 无 diff | 不打扰 |
| id 在新库消失 | 「目录中暂未找到，可能下架或 ID 变更」 |
| 跨设备 | 无；snapshot 在 localStorage |

### G. 技术

```ts
// store 扩展（persist v3 migrate）
type RaceFieldSnapshot = {
  name?: string; date?: string; status?: string;
  city?: string; province?: string;
  registrationUrl?: string; dateTBD?: boolean;
  capturedAt: string; // ISO
  catalogGeneratedAt?: string;
};
// MyRace.snapshot?: RaceFieldSnapshot
// raceChangeInbox: { raceId, changes: {field, from, to}[], detectedAt }[]
```

- 纯函数 `diffRaceSnapshot(old, live): Change[]`
- 比较时机：`RaceTab` races loaded 后。
- **不**在 crawler 改协议也可 MVP；P2 可让发布库带 `previousValues`（过大，后置）。

### H. 文案

- `关注的「杭州马拉松」开赛日 10-27 → 10-26`
- `报名状态：报名中 → 已截止`
- `接受更新并同步到我的赛事`
- `这可能影响训练计划 · 请到档案重新生成`

### I. UI

- 赛事 Tab 顶部警示卡（橙）；列表项小红点。
- Sheet：左右对比两列（旧/新），移动端上下堆叠。
- 图标：`AlertTriangle` / `ShieldCheck` 已引入。

### J. 分期

- MVP：date/status/url diff + 接受
- P2：名称模糊 ID 丢失找回；与点子 7 冲突合并展示
- 后置：通知权限

### K. 测试

- 单测 diff 矩阵；集成：mock races.json 改 date。
- 验收：人工改 local snapshot 能检出。

### L. 指标

- 无开发：询问「关注赛改期你怎么发现」——变更单是否优于自己刷官网。
- 成功：有 myRaces 用户中变更可解释率 100%（有 diff 必展示）。
- 停止：误报过高（字段噪声）→ 收窄监听字段。

### M. 风险

- 源站 ID 重映射（已有 `ensureUniqueRaceIds`）导致「找不到」→ 文案要诚实。
- 反范式 myRaces 与目录不一致是特性不是 bug。

### N. 复杂度：**中**。影响：`useStore.ts` migrate、`RaceTab.tsx`、新 `race-watch-diff.ts`。

---

## 5. 点子 4 — 训练计划调整后的重新同步提醒

### A. 用户任务与证据

- **任务**：计划因「重新生成 / 周自适应 / 休假 / 赛事覆盖」变化后，提醒用户重新导出 FIT 或同步 Intervals.icu，避免手表仍是旧课表。
- **证据强度**：高。已观察：ICU 同步推全量 non-Rest；自适应改的是 effective plan 距离，但用户可能很久前同步过；`planNeedsRegen` 只覆盖「主赛事变更需重新生成」，**不**覆盖「已生成但 effective 变了」或「同步过期」。

### B. 外部案例

| 来源 | 链接 | 事实 | 借鉴 |
|------|------|------|------|
| Intervals 上传指南 | https://forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624 | `events/bulk?upsert=true` + `external_id` 可更新 | 重同步应用 upsert，避免重复事件（P2） |
| ICU Open API | https://www.intervals.icu/features/open-api/ | 公开 REST；可写日历 | 保持现有代理架构 |
| 当前实现 | `intervals-icu.ts` | 逐条 POST events，无 external_id upsert | MVP 提醒重推；P2 再 upsert |
| Garmin 导出工具 | https://github.com/mkuthan/garmin-workouts | 导出/导入 workout FIT 是常见工作流 | 导出提醒同理 |

### C. 可复用

- `syncPlanToICU`、`downloadAllFIT`、`downloadICS`、导出 Sheet 状态机（menu/setup/syncing/done）。
- `planNeedsRegen` UI 脉冲按钮可参考样式。
- **限制**：API Key 不持久化 → 每次重同步可能要粘贴 Key；Worker 未部署时同步失败（CONTEXT 已知）。

### D. 范围

**做**

- 计算 `planContentFingerprint(effectivePlan)`（日期+类型+距离+描述 hash）。
- 记录 `lastSyncedFingerprint` / `lastExportedFitFingerprint` + 时间。
- 当 effective 指纹 ≠ last* 且用户曾同步/导出过 → 训练页/导出入口「计划已更新，建议重新同步」。

**不做**

- 后台静默自动推（无 Key 且有风险）。
- Garmin 私有 API。
- 差分只推变更日（P2+）。

### E. 旅程

1. 用户曾成功同步或导出。
2. 周一自适应生效或用户点重新生成。
3. 训练页顶条：`手表/日历可能仍是旧计划` → 点「去同步」。
4. 进入导出 Sheet，预选 ICU 或 FIT。
5. 成功后清除脏标记。

### F. 状态

| 状态 | 表现 |
|------|------|
| 从未导出/同步 | 不显示脏提醒 |
| 脏 | 橙条 + CTA |
| 同步中 | 现有 progress |
| 失败 | 现有错误 + 保持脏 |
| Key 被清 | 引导重贴；仍显示脏 |
| 跨设备 | 无 lastSync；不显示或显示「本机未同步过」 |

### G. 技术

```ts
// persist v3
exportSyncMeta: {
  lastIcuSyncAt?: string;
  lastIcuFingerprint?: string;
  lastFitExportAt?: string;
  lastFitFingerprint?: string;
  lastIcsExportAt?: string;
  lastIcsFingerprint?: string;
}
```

- fingerprint：对 non-Rest 课 `date|type|distanceKm|description` 排序后 hash（简单 djb2 即可，无 crypto 依赖要求）。
- 脏判定：`currentFp !== lastIcuFingerprint`（仅当 last 存在）。
- **重要**：指纹必须基于 **effectivePlan**，与 UI 一致。
- P2：ICU `external_id = marathon-${date}` + bulk upsert（官方支持）。

### H. 文案

- `训练内容已更新（自适应或重新生成）`
- `上次同步：7月6日 · 建议重新同步到 Intervals.icu 或导出本周 FIT`
- `稍后提醒` / `去处理`

### I. UI

- 训练页非阻塞 banner；导出按钮小圆点。
- 颜色：`--color-orange`。
- 勿用错误红（非故障）。

### J. 分期

- MVP：指纹 + 脏提醒 + 点进现有同步
- P2：external_id upsert、仅同步今天以后
- 后置：自动同步开关

### K. 测试

- 单测 fingerprint 稳定性；模拟 plan 距离变化 → dirty。
- 浏览：同步成功后 banner 消失。

### L. 指标

- 成功：发生自适应的用户中，看到提醒后 7 日内有再次导出/同步行为（访谈或本地计数）。
- 停止：误报（指纹含不稳定字段）→ 收窄字段。

### M. 风险

- Worker/CORS 失败导致「怎么点都脏」。
- 全量重推产生重复日历事件（当前 API 形态）——文案需提示「请在 ICU 检查重复」；P2 upsert 治本。

### N. 复杂度：**中**。影响：`useStore`、`CalendarView` 导出流、`intervals-icu.ts`（P2）、新 fingerprint util。

---

## 6. 点子 5 — 只导出今天 / 本周的 FIT 文件

### A. 用户任务与证据

- **任务**：导入手表时只要「今天」或「本周」课，而不是整备赛周期 ZIP（可能数十到上百个文件）。
- **证据强度**：高。已观察 `downloadAllFIT(plan)` 导出全部 non-Rest；`downloadFIT` 单课已存在但 UI 未暴露范围选择。

### B. 外部案例

| 来源 | 链接 | 事实 | 借鉴 |
|------|------|------|------|
| FIT 协议 | https://developer.garmin.com/fit/ | workout 文件标准 | 继续用现 encoder |
| ts-watches | https://github.com/stacksjs/ts-watches | CLI 支持 since 日期过滤下载 | 「按时间窗导出」是设备工作流常识 |
| garmin-workouts | https://github.com/mkuthan/garmin-workouts | 批量导出 workout | 批量但用户要可控范围 |
| 浏览器 | Blob + a.download | 多文件常用 ZIP | 保持 zip.ts |

### C. 可复用

- `encodeFIT` / `downloadAllFIT` / `buildZip` / 导出 Sheet UI。
- `currentWeekStart/End` 已在 `CalendarView` 计算。
- **限制**：Safari 多文件下载策略；大 ZIP 主线程编码（全量才痛，区间更轻）。

### D. 范围

**做**：导出菜单三项：今天 / 本周 / 全部；空范围禁用并说明。
**不做**：自定义任意日期范围（P2）、FIT 活动文件（activity）伪造成绩、云盘。

### E. 旅程

1. 导出 → 选 Garmin FIT。
2. 分段控件：今天 | 本周 | 全部。
3. 副文案显示将导出 N 个文件。
4. 下载 zip：`garmin-week-2026-07-14.zip`。

### F. 状态

| 状态 | 表现 |
|------|------|
| 今天 Rest | 「今天无跑步课」禁用今天 |
| 本周全 Rest | 禁用本周 |
| 正常 | 下载 |
| 失败 | 极少；编码异常 Toast |

### G. 技术

```ts
downloadFITRange(plan, { from: string, to: string }, zipName?: string)
// filter: dateKey in [from,to] && type !== Rest
```

- 必须传入 **effectivePlan**。
- 与点子 4：区间导出成功可只更新「导出指纹」为全量指纹或记录 `lastFitRange`（MVP 记全量 fp 仍可接受，或导出即视为用户已知晓）。

### H. 文案

- `今天 · 1 个文件`
- `本周 · 4 个文件（含自适应后距离）`
- `全部计划 · 86 个文件`

### I. UI

- 导出 Sheet 内 nested 选择；主色 accent 确认按钮。
- 移动优先大触控。

### J. 分期

- MVP：今天/本周/全部
- P2：自定义范围、单课从日详情导出
- 后置：File System Access 目录写入

### K. 测试

- 单测过滤；手工导入 Garmin Connect 抽 1 文件。

### L. 指标

- 成功：FIT 用户中「本周」选项占比（访谈）。
- 停止：无。

### M. 风险

- 用户以为「本周」含自适应前距离 → 文案标明 effective。

### N. 复杂度：**小**。影响：`export-fit.ts`、`CalendarView` 导出菜单。

---

## 7. 点子 6 — 低压力 Momentum 完成度

### A. 用户任务与证据

- **任务**：在无法完美打卡时仍感到「在备赛轨道上」，而不是被连续 streak 羞辱。
- **证据强度**：中高。`TrainingLog` 已有「当前连续」按最近记录连 full/partial；周自适应已把 skip 算进完成率。缺「低压力」产品叙事与周级 Momentum。

### B. 外部案例

| 来源 | 链接 | 事实 | 借鉴 |
|------|------|------|------|
| Duolingo Streak | https://blog.duolingo.com/how-duolingo-streak-builds-habit/ | 连续有用；Streak Freeze 研究支持 slack 更持久；丢 streak 可 demotivate | **不要**裸拷每日强制连续；提供 slack |
| BJ Fogg Tiny Habits | https://www.behaviormodel.org/ | B=MAP；把行为变小 | 「本周动起来 3 天」优于「永不中断」 |
| Gentler Streak（PH 相似） | https://www.producthunt.com/products/smart-runner 侧栏可见 Gentler Streak | 市场存在「温和健康」定位 | 文案语气友好 |
| 已观察 | `partial` 状态 | 已有部分完成 | Momentum 应计 partial |

### C. 可复用

- `completions` status/rpe、`TrainingLog` stats、自适应 completionRate、打卡语录。
- **限制**：无可穿戴真实完成验证；全靠自觉打卡。

### D. 范围

**做**

- 定义 **周 Momentum**：本周已打卡天数（full/partial 都算） / 本周计划跑步天数。
- 展示「轨道内」阈值：例如 ≥50% 为「保持动量」，≥80%「强势周」；&lt;50% 不骂，给复训建议一句。
- 弱化或重命名「当前连续」为「近期完成串」（可含 1 次 skip 豁免 — P2）。

**不做**

- 游戏化排行榜、徽章商城、社交羞辱、医疗建议。

### E. 旅程

1. 打卡后 Toast/语录下附 Momentum 变化。
2. 日志页主指标改为 Momentum 环，而非火焰连续。
3. 周报（点子 2）引用同一口径。

### F. 状态

| 状态 | 表现 |
|------|------|
| 无计划 | 隐藏 |
| 周初 0 | 「从第一次打卡开始攒动量」 |
| 正常 | 环 + 短句 |
| skip 很多 | 冷静文案 + 链到休假功能 |
| 撤销打卡 | 环回退 |

### G. 技术

```ts
function weekMomentum(plan, completions, weekStart, weekEnd): {
  scheduled: number; done: number; ratio: number; label: 'off'|'building'|'on_track'|'strong';
}
// done: status full|partial；skip 不计；未打卡不计
```

- 与自适应 completionRate 对齐分母（non Rest/Race）。
- 可选 `momentumMode: 'gentle' | 'classic'` persist，默认 gentle。

### H. 文案

- `本周动量 3/5 · 在轨道上`
- `没跑满也没关系：部分完成也算前进`
- `若连续疲劳，可用「休假」盖住计划，而不是硬扛`

### I. UI

- 日志四格卡：用 Momentum 替换或并列「当前连续」。
- 颜色：on_track accent；off 用 label 不红惩罚。
- 避免火焰恐吓图标作主视觉（可保留小装饰）。

### J. 分期

- MVP：周 Momentum 指标 + 文案 + 日志改主指标
- P2：1 次周内 skip 豁免、与自适应证明共用
- 后置：年度温和报告

### K. 测试

- 单测 ratio 边界；文案快照。
- 验收：用户不把 skip 理解成「失败人格」。

### L. 指标

- 无开发：卡片文案 A/B 访谈。
- 成功：打卡意愿不降、自述压力降。
- 停止：完成率显著下降且无备赛进展 → 回调经典 streak 可选。

### M. 风险

- 过宽阈值让人躺平；保持与自适应 70% 阈值叙事一致（解释：动量是心理，自适应是负荷）。

### N. 复杂度：**小–中**。影响：`TrainingLog`、`week-snapshot`、打卡成功 UI。

---

## 8. 点子 7 — 多来源字段冲突解释

### A. 用户任务与证据

- **任务**：看到「多源确认」时，理解「一致增强可信」还是「源之间字段不一致，我们采用了谁」。
- **证据强度**：高数据侧、中 UI 侧。已观察：`sources[]`、多源文案「可信度更高」；`mergeRace` **静默**合并 status/distances/url/city，**不保留 per-field 来源**；`name-year-conflict` 会在发布前丢弃而非展示；CONTEXT 黄果树日期人工修过。

### B. 外部案例

| 来源 | 链接 | 事实 | 借鉴 |
|------|------|------|------|
| NN/g 状态可见 / 错误恢复 | https://www.nngroup.com/articles/ten-usability-heuristics/ | 说明发生了什么、如何继续 | 冲突要可诊断 |
| 产品审计 | fixcheck audit | 已有白话多源解释 | 升级为字段级 |
| 爬虫 merge | `race-normalize.ts` `mergeRace` | 先到/完整字段优先等启发式 | 需把启发式产品化文案 |

### C. 可复用

- `RaceTab` `sourceSummary`、`raceSourceKeys`、多源绿说明。
- crawler `mergeSources`、`duplicate-report.md`。
- **缺口**：发布 JSON **无** `fieldProvenance` / `conflicts[]`。

### D. 范围

**做（分两层）**

1. **前端 MVP（不改发布契约）**：多源时展示「一致字段 / 我们无法展示逐源原文（发布库已合并）」+ 引导以官网为准；对 myRaces snapshot vs catalog 的冲突用点子 3 的 diff（用户维度）。
2. **数据 P2**：爬虫输出可选 `fieldNotes: { date?: { value, sources[] } }` 或仅当合并前检测不一致时写 `conflicts: [{ field, values: {source, value}[] }]`。

**不做**

- 让用户在 App 内投票改全库；展示原始 HTML；医疗级保证。

### E. 旅程

1. 打开多源赛事详情。
2. 见「多源 · 2 种情况」：全部一致 / 存在合并。
3. 若 P2 有 conflicts：表格「日期：最酷 10-26 / 闹跑 10-27 → 采用 10-26（主源 zuicool）」。
4. CTA：打开 registrationUrl。

### F. 状态

| 状态 | 表现 |
|------|------|
| 单源 | 仅来源名 |
| 多源无冲突数据 | 「多源一致，可信度较高」 |
| 多源有 conflicts（P2） | 橙说明 + 表 |
| seed | 「离线库无多源细节」 |

### G. 技术

**MVP 前端 only**：文案分层，不假装有字段证据。

**P2 爬虫**（在 `mergeRace` 前 compare）：

```ts
type FieldConflict = {
  field: 'date' | 'status' | 'city' | 'name';
  variants: { source: string; value: string }[];
  chosen: string;
  reason: string; // 'primary_source' | 'status_priority' | 'non_empty_prefer'
};
// RaceEvent.conflicts?: FieldConflict[]
```

- 前端 `RaceTab` 渲染 conflicts。
- 体积：仅冲突赛事带数组，默认空。

### H. 文案

- `3 个来源对日期一致：2026-10-26`
- `城市写法不同：杭州 / 杭州市 → 展示「杭州」`
- `报名前请以官网为准，本页不代替官方通知`

### I. UI

- 详情 Sheet 来源区下方；冲突用橙边框表。
- 与点子 3 变更单视觉家族一致。

### J. 分期

- MVP：诚实文案分层 + 官网 CTA
- P2：conflicts 写入 races.json + UI 表
- 后置：按字段可信度评分

### K. 测试

- crawler 单测：人造双源不同 date → conflicts。
- 前端：fixture 渲染。

### L. 指标

- 成功：用户不再把「多源」误解为 100% 官方。
- 停止：conflicts 过多导致列表恐慌 → 只在详情展示。

### M. 风险

- 发布体积；误报冲突（格式化差异「杭州市」vs「杭州」）→ 规范化后再比。

### N. 复杂度：MVP **小**；含爬虫 P2 **中–大**（偏中）。

---

## 9. 共享底层能力与避免重复建设

### 9.1 模块划分

```
week-snapshot.ts     → 周界、完成率、Momentum、周报文案、证明 evidence
plan-fingerprint.ts  → effective plan 指纹、脏同步
race-watch-diff.ts   → snapshot diff、变更单
export-fit.ts        → range filter（已有 encode）
store persist v3     → exportSyncMeta, race snapshots, dismiss keys
```

### 9.2 UI 模式复用

| 模式 | 用于 |
|------|------|
| 顶部 Status Banner（绿/橙） | 1,2,4,3 |
| Bottom Sheet 导出/详情 | 5,4,3,7 |
| 白话说明条（accent/8） | 1,7,已有赛事 |
| Toast | 全局已有 |

### 9.3 单一数据源原则

- 所有「本周数字」只从 `useEffectivePlan` + `completions` 派生。
- 所有「赛事真相」以 `/races.json` 为目录，以 `myRaces` 为用户意图层。

### 9.4 明确不共享的东西

- 不建通用通知中心。
- 不建通用「AI 解释服务」。
- 不为七点新建路由库（保持 Tab）。

---

## 10. 点子依赖图

```
                    ┌─────────────┐
                    │ week-snapshot│
                    └──────┬──────┘
              ┌───────────┼───────────┐
              ▼           ▼           ▼
           (1)证明      (2)周报     (6)Momentum
              │           │
              └─────► 文案/证据字段一致

 (5)区间FIT ──► fingerprint 可选更新 ──► (4)重同步提醒
 (1)自适应变化 ─────────────────────► (4)脏标记

 (3)变更单 ◄── myRaces snapshot
 (7)冲突   ◄── catalog conflicts (P2) ──► (3)展示可合并

 planNeedsRegen（已有）──► 档案重新生成 ──► (4)脏
```

**硬依赖**

- 4 依赖「能定义 plan 内容变了」（含 1 的自适应）。
- 2/6 依赖与 1 同一 completion 口径。
- 7 的深度版依赖爬虫契约扩展；MVP 不阻塞 3。

**无依赖可并行**

- 5 几乎独立。
- 1 的 UI 升级独立。
- 3 MVP 独立。

---

## 11. 推荐实施顺序与原因

| 序 | 点子 | 原因 |
|----|------|------|
| 1 | **5 区间 FIT** | 最小改动、立即减摩擦、无 persist 风险 |
| 2 | **1 三行证明** | 自适应已上线，解释是信任补丁；给 2/4 打基础 |
| 3 | **6 Momentum** | 提升打卡心理安全，强化 1/2 数据供给 |
| 4 | **2 周报** | 复用 week-snapshot；在 1/6 后做避免文案分叉 |
| 5 | **4 重同步提醒** | 需 fingerprint；在用户开始用导出后价值最大 |
| 6 | **3 变更单** | store 迁移；与赛事刷新运维价值相关 |
| 7 | **7 冲突解释** | MVP 文案可随 3；深度 P2 放爬虫迭代窗 |

**可合并同一体验（评审建议）**

- **1+2**：训练页「本周状态」区块：上证明、下周报。
- **3+7**：赛事详情「数据可信」一节：多源 + 冲突 + 关注变更。
- **4+5**：导出 Sheet：范围选择 + 若脏则默认高亮同步。

---

## 12. 未知项与需用户决策的分叉

| ID | 未知/分叉 | 选项 | 建议默认 |
|----|-----------|------|----------|
| D1 | 周报是否要系统通知 | 仅应用内 / PWA 通知 | 仅应用内 |
| D2 | ICU 重推重复事件是否可接受至 P2 | 文案警告 / 立刻做 upsert | MVP 警告 + P2 upsert |
| D3 | Momentum 是否替换连续 streak | 替换 / 并列 / 设置项 | 并列，主指标 Momentum |
| D4 | 变更单「接受」是否自动 `planNeedsRegen` | 总是 / 仅 primary date | 仅 primary date |
| D5 | 字段冲突是否改 `races.json` 契约 | 仅文案 / 加 conflicts[] | MVP 文案，下个爬虫版本加 |
| D6 | 自适应是否允许用户关闭 | 可关 / 不可关 | MVP 不可关，只解释 |
| D7 | 是否统计本地匿名事件 | 否 / 是 | 否（保持 local-first） |

---

## 13. 已有能力 vs 新增能力总表

| 能力 | 状态 |
|------|------|
| 周自适应缩放 | 已有 |
| 自适应横幅 | 已有（待产品化为三行证明） |
| 打卡 RPE/状态 | 已有 |
| 训练日志完成率/连续 | 已有（待低压力化） |
| 分享一句文案 | 已有（待周报） |
| 全量 FIT/ICS/ICU | 已有 |
| 单课 FIT 函数 | 已有未暴露 |
| 区间 FIT UI | **新增** |
| plan 指纹与脏同步 | **新增** |
| myRaces catalog 快照 | **新增** |
| 变更单 UI | **新增** |
| 多源字段 conflicts 数据 | **新增（P2）** |
| 多源白话 | 已有（待分层诚实） |
| planNeedsRegen | 已有（覆盖不全） |

---

## 14. 回读自检清单

- [x] 七点均含 A–N 同构模板
- [x] 链接为真实可访问来源；X/PH 边界已声明
- [x] 技术方案对齐 React/TS/Vite/Zustand/crawler/local-first
- [x] 未建议 AI 聊天/社交/医疗/赛季编排/私有逆向
- [x] 区分已观察 / 外部事实 / 推断 / 未知
- [x] 无虚假工时；仅小/中/大

---

*文件路径：`/Users/agg/Desktop/Marathon/PRODUCT_IDEAS_DEEP_RESEARCH_2026-07-14.md`*
