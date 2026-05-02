# 马拉松训练助手 — 产品全景文档

> 最后更新：2026-04-28  
> 工作语言：中文  
> 技术栈：React 18 / TypeScript / Vite / Zustand / Tailwind CSS 4 / Node.js + tsx

---

## 目录

1. [产品定位与愿景](#1-产品定位与愿景)
2. [三大金刚：主应用架构](#2-三大金刚主应用架构)
3. [第四金刚：赛事页](#3-第四金刚赛事页)
4. [各页面连接关系](#4-各页面连接关系)
5. [爬虫架构（crawler/）](#5-爬虫架构crawler)
6. [已完成的工作](#6-已完成的工作)
7. [即将要做的事情](#7-即将要做的事情)
8. [Outstanding 待解决事项](#8-outstanding-待解决事项)
9. [目录结构速查](#9-目录结构速查)

---

## 1. 产品定位与愿景

**一句话**：面向中国跑者的高度个性化马拉松备赛助手，以运动科学（VDOT / Jack Daniels / COROS EvoLab）为引擎，在浏览器端瞬间生成定制化训练计划，并聚合全国路跑赛事信息帮助跑者选赛报名。

**目标用户**：
- 初中级跑者（完赛 / PB 导向）：需要一份直接照着跑的课表，不想自己查配速表。
- 数据极客跑者：日常戴 COROS/Garmin，了解自己的 VO2max 和 LT，希望计划与手表 6-区间完美映射。

**核心价值**：
- 打破 Hal Higdon 式"千人一面"静态表格。
- 多维度生理数学模型（VDOT + LTHR + BMI + 目标差距）驱动，输入即生成。
- 聚合全国路跑赛事，解决"在哪报名"的信息碎片化问题。

---

## 2. 三大金刚：主应用架构

主应用入口：`/Users/agg/Desktop/Marathon/`（React + Vite 项目）

### 2.1 金刚一：跑者档案（Profile）

**定位**：全系统的数据输入源与引擎驱动层。所有计算从这里开始。

**输入字段**：
| 字段 | 类型 | 说明 |
|------|------|------|
| 身高 / 体重 | 数字 | 计算 BMI 安全系数 |
| 乳酸阈值心率 LTHR | 数字（可选） | 不填则从 PB 反推 |
| 乳酸阈值配速 LT Pace | mm:ss（可选） | 同上 |
| 5K PB / 10K PB | mm:ss（必填） | 基础 VDOT 推算 |
| 半马 PB / 全马 PB | mm:ss（选填） | 若填写，覆盖 5K/10K 的 VDOT，优先级最高 |
| 目标赛事类型 | 半马 / 全马 | |
| 比赛日期 | 日期 | 决定训练周期总长 |
| 目标完成时间 | mm:ss（选填） | 触发目标差距系数 |
| 训练负荷 | Light / Medium / Heavy | 决定峰值跑量和每周训练天数 |

**数据持久化**：Zustand store + localStorage。

---

### 2.2 金刚二：生理指标分析（Training Stats）

**定位**：数据验证层 + 训练基准锚点展示。

**产出**：
- **配速区间表 Zone 1–6**（以 LT Pace 为锚点，秒数偏移算法，COROS EvoLab 6 区间体系）
- **心率区间表 Zone 1–6**（以 LTHR 为锚点，百分比算法）
- 若未填 LTHR/LT Pace，系统从 PB 反推 VDOT 再估算各区间，标注「系统推算」

**核心理念**："配速为主，心率为辅"。

---

### 2.3 金刚三：跑者日历（Calendar View）

**定位**：训练计划可视化落地层。

**功能**：
- 日历网格，从今日到比赛日，每日一格
- 每格显示：训练类型（LSD / Tempo / 间歇等）、目标里程、配速标签
- 周末汇总当周总跑量
- 顶部显示自然月累计跑量
- 点击单日弹窗：热身 → 主训练（X km × Y 组 + 配速 + 心率 + 恢复段）→ 冷身

---

### 2.4 训练引擎算法（`training-engine.ts`）

**峰值跑量计算**（7 层因子正交相乘）：

```
peakMPW = baseCapacity(VDOT) 
        × intensityMultiplier (light: 0.82 / moderate: 1.00 / heavy: 1.18)
        × bmiSafety (BMI > 22 线性衰减, 最低 0.88)
        × goalGapFactor (目标越激进最高 1.25, 带封顶保护)
        × weeksFactor (总周数 ≥ 24 取 0.95, ≥ 16 取 1.00, 否则 1.05)
        → 再取 min(vdotBasedMaxPeak, userLevelMaxPeak)
```

**跑量曲线**：`progress^0.8` 二次方缓动 S 曲线（模仿 Garmin/COROS 官方架构），避免过早平缓和首月倒挂。

**恢复周**：Light/Moderate → 4 周一循环（3 建 1 休）；Heavy → 3 周一循环（2 建 1 休）。

**赛前减量**：严格 3 周 Taper（75% → 50% → 25%）。

**每日课程类型**（9 种）：LSD、Recovery、MP、Tempo、Tempo Intervals、Interval、Fartlek、Progression、Cruise。

**每周排期**（按强度固定网络，避免高强度课连排）：
- Light：周二(强度)、周四(轻松)、周六(轻松)、周日(LSD)
- Moderate：周二(轻松)、周三(主强度)、周四(轻松)、周六(次强度)、周日(LSD)
- Heavy：周二(轻松)、周三(主强度)、周四(恢复)、周五(次强度)、周六(轻松)、周日(LSD)

---

## 3. 第四金刚：赛事页

**入口**：`/Users/agg/Desktop/Marathon/crawler/public/index.html`  
**开发服务器**：`cd crawler && npm run serve` → http://localhost:3333

### 3.1 双用户类型设计

**用户 A — 已报名跑者**：想找到自己报名的比赛，在日历里标记，追踪比赛日期。  
→ 搜索 + 我的赛事 + 底部详情sheet  

**用户 B — 未报名跑者**：想找合适的比赛去报名。  
→ "报名中"醒目高亮 + 绿色 CTA 按钮 + 一键去官网报名

### 3.2 赛事分组逻辑

赛事按时间状态分为三大组（竖向排列）：

```
┌─────────────────────────────┐
│  📌 我的赛事（我的标记）       │  ← 任何时间轴位置的关注赛事，置顶
├─────────────────────────────┤
│  🟢 报名中（N场）            │  ← 绿色区块，不可折叠，优先展示
│     [卡片] [卡片] [卡片]     │
├─────────────────────────────┤
│  📅 日期已公布（N场）▾       │  ← 默认折叠（当报名中有内容时）
│     [卡片] [卡片] ...        │
├─────────────────────────────┤
│  📋 待定场次（N场）▾         │  ← 默认折叠
└─────────────────────────────┘
```

### 3.3 Filter 体系

**筛选条件**（多维度独立过滤）：
- **省份** dropdown
- **距离** chip：全程 / 半程
- **月份** chip：1–12 月（仅显示有赛事的月份）
- **报名中** chip：快速过滤只看当前可报名赛事

**Stats 统计栏**（顶部 4 个数字）：
- 总赛事数
- 报名中（**可点击**，等同点击「报名中」chip）
- 全程 / 半程

### 3.4 赛事卡片设计

**普通卡片（upcoming）**：
```
[省份标签] 赛事名称
日期   城市
[全程] [半程]
```

**报名中卡片（open）**：
- 左侧绿色竖条
- 绿色「去报名 →」链接（直达官网，阻止冒泡避免触发底部 sheet）

### 3.5 底部详情 Sheet（点击卡片触发）

内容：赛事名 + 日期 + 城市 + 省份 + 地形 + 标签（IAAF 金/银/铜）+ 距离

操作按钮行：
- ★ 添加关注 / ✓ 已关注（切换）
- 📅 导入日历（生成 .ics）

若 `status === 'open'` 且有 `registrationUrl`：
- 全宽绿色按钮「去官网报名 ↗」

### 3.6 我的赛事 & 手动添加

- 数据存储：`localStorage('myRaces')`，无服务端，无账号
- 手动添加时提供模糊匹配建议（字符 bigram Jaccard + 包含度算法）
- 未能匹配到已知赛事时，可手动输入名称、日期、城市

---

## 4. 各页面连接关系

```
主应用 (React / Vite)
├── /src/components/ProfileTab.tsx        ← 跑者档案
├── /src/components/StatsTab.tsx          ← 生理指标分析
├── /src/components/CalendarTab.tsx       ← 跑者日历
└── /src/data/races.ts                    ← ⚠️ 当前还是手动 seed 数据 (v1)
                                             将来替换为爬虫输出 (v2 规划)

爬虫（独立 Node.js 项目）
└── /crawler/
    ├── src/index.ts                      ← 主入口，CLI 运行
    ├── src/scrapers/zuicool.ts           ← 主爬虫
    ├── src/scrapers/gusto.ts             ← 待修复
    ├── src/merge.ts                      ← 数据合并脚本
    ├── src/server.ts                     ← 验证面板服务器 :3333
    ├── src/types.ts                      ← 共享类型定义
    ├── src/utils.ts                      ← 工具函数
    ├── output/scraped-races.json         ← 爬虫输出（不纳入 git）
    └── public/index.html                 ← 赛事页前端（第四金刚）

连接点（目前手动，v2 自动化）：
  crawler/output/scraped-races.json
        ↓  (手动复制 or 构建脚本)
  src/data/races.ts  (主应用赛事数据源)
```

**注意**：两个项目目前独立运行，赛事数据尚未打通。第四金刚（赛事页）当前独立在 `crawler/public/index.html`，未集成进主 React App 的四大金刚导航。

---

## 5. 爬虫架构（crawler/）

### 5.1 数据源三层体系

| 来源 | URL | 内容 | 状态可信度 |
|------|-----|------|-----------|
| **Source 1** `reg.zuicool.com` | `/?race_type_id=4` | ~76 张卡片，zuicool 自有报名平台的马拉松·路跑 | ★★★★★ 最准（有明确 span.label：报名中/即将截止/报名截止） |
| **Source 2** `zuicool.com/events/reg` | `?type=run` | ~76 张卡片，报名开启或即将开启的赛事（跨平台） | ★★★★ 需区分：`报名截止:` = 真正开放；`即将报名` = 未开放 |
| **Source 3** `zuicool.com/events` | `?type=run&page=N` | 全量目录，~20 页 × 100 条 = 约 2000 条路跑赛事 | ★★★ `.meta` div 含 `报名截止:` 则开放；否则 upcoming |

### 5.2 报名状态检测（三层叠加）

```
Race.status 判断逻辑：

1. Source 1 (reg.zuicool.com)
   span.label 文本 → parseStatus() → STATUS_MAP
   "报名中" / "即将截止" → open
   "报名截止" / "已截止" / "已关闭" → closed
   "尚未开始" / "即将开放" / "筹备中" → upcoming

2. Source 2 (events/reg) — 构建 openSourceIds Set
   每张卡片 → 提取 sourceId（href 中的数字）
   若 div.meta 含 "报名截止" 且不含 "即将报名" → 加入 openSourceIds
   ⚠️ 关键：不能把"即将报名"的卡片也加入（上海马拉松 bug 根因）

3. Source 3 (events 全量目录) → parseEventCard()
   若 div.meta 含 "报名截止" / "即将截止" → isOpenByMeta = true
   若 sourceId 在 openSourceIds 中 → isOpenById = true
   status = (isOpenByMeta || isOpenById) ? 'open' : 'upcoming'
   dedup 时：若 catalog 版本 status='open'，升级已有记录的 status
```

### 5.3 内容过滤（isValidRace 5 层）

```typescript
// Filter 1: 虚拟/无固定地点
city.includes('不限地点') || city.includes('全国') → reject

// Filter 2: HARD_SKIP（硬性排除，无论其他关键词）
HARD_SKIP = ['线上', '虚拟', '地图跑', '云跑', '轨迹跑',
             '骑行', '铁人', '自行车',
             '急救培训',
             '越野', '山地跑', '垂直马拉松', '登高赛', '爬升赛',
             '野跑', '跑山赛', '登山', '徒步',
             '健步行', '健步走',
             'citywalk', 'CityWalk', 'city walk',
             '湿身', '彩色']

// Filter 3: REQUIRE_KEYWORDS（至少命中一个才保留）
REQUIRE_KEYWORDS = ['马拉松', '半马', '全马', '21公里', '半程', '公开赛']

// Filter 4: 纯 10K 赛事排除（有 10K 无马拉松关键词）
/10[Kk公里千]/.test(name) && !/马拉松|半马|全马|半程/.test(name) → reject

// Filter 5: SOFT_SKIP（亲子/欢乐跑等，若无明确全/半程距离关键词则排除）
SOFT_SKIP = ['亲子', '萌娃', '儿童', '少儿', '青少年',
             '欢乐跑', '嘉年华', '感恩跑', '公益跑', '训练营']
若命中 soft_skip 且无 /全马|半马|全程马拉松|半程马拉松|21公里|42公里/ → reject
```

### 5.4 数据去重（index.ts dedup）

去重 key：`正规化赛名（去年份前缀、括号备注）+ 年月`

合并规则：
- status 取优先级高的（open > closed > upcoming > postponed > cancelled）
- distances 取并集
- registrationUrl 取先有值

### 5.5 字段说明（RaceEvent 类型）

```typescript
interface RaceEvent {
  id:               string;       // 'zc-12345' 或 'gt-xxx'
  name:             string;
  date:             string;       // 'YYYY-MM-DD'
  city:             string;
  province:         string;
  distances:        RaceDistance[];  // 'full' | 'half'
  terrain:          RaceTerrain;     // 'flat' | 'hilly' | 'mountain'
  label:            RaceLabel;       // 'iaaf-gold' | ... | null
  status:           RaceStatus;      // 'open' | 'closed' | 'upcoming' | 'cancelled' | 'postponed'
  altitude?:        number;
  registrationUrl?: string;
  note?:            string;
  _source?:         string;       // 'zuicool' | 'zuicool-events' | 'gusto'（最终导出时去除）
  _sourceId?:       string;       // zuicool 原始数字 ID
  _dateTBD?:        boolean;      // true = 日期含"待定"
}
```

### 5.6 运行命令

```bash
cd /Users/agg/Desktop/Marathon/crawler

npm run scrape             # 所有来源 → output/scraped-races.json
npm run scrape:zuicool     # 仅 zuicool
npm run scrape:dry         # 不写文件，仅打印
npm run serve              # 启动验证面板 → http://localhost:3333
npm test                   # dry-run + limit 5（快速验证）
```

验证面板功能：
- `GET /` → 赛事页 HTML（第四金刚）
- `GET /api/data` → scraped-races.json + 统计
- `POST /api/scrape` → SSE 实时日志流（触发 npm run scrape）
- `POST /api/merge` → SSE 实时日志流（触发 npm run merge）

### 5.7 地理解析逻辑（utils.ts）

**parseCityProvince**：处理 "河北・张家口市涿鹿县" → `{province:'河北', city:'张家口'}`

支持分隔符：`・ · • · 丨 | －`

**stripEthnic**：剥离少数民族后缀（白/回/苗/傣/彝/藏/壮/蒙古/维吾尔/朝鲜族等），防止过度剥离（如"大理白族"→"大理" ✓，而非"大" ✗）

**parseChineseDate**：支持格式：
- `2026年5月31日` → `2026-05-31`
- `2026年5月30日-31日` → `2026-05-30`（范围取第一日）
- `2026.5.31` / `2026-05-31` → `2026-05-31`
- `2026.08 待定` → `2026-08-01`（月份已知，日未定）
- `2026 待定` → `2026-01-01`（_dateTBD=true）

---

## 6. 已完成的工作

### 主应用（三大金刚）
- [x] 三大金刚底部导航结构（Profile / Stats / Calendar）
- [x] 跑者档案：全部输入字段 + Zustand 持久化
- [x] 生理指标分析：COROS 6 区间配速 & 心率表，VDOT 推算
- [x] 跑者日历：完整训练计划生成，日历网格，每日弹窗
- [x] 训练引擎 v3.0：7 因子峰值跑量，S 曲线进阶，9 种课程类型，无连排保护
- [x] VDOT 修复（之前指数公式过高的 bug，改用 Jack Daniels 查表线性拟合）
- [x] 目标差距系数（goalGapFactor）封顶保护

### 爬虫（第四金刚数据层）
- [x] zuicool 三源爬虫架构（reg / events/reg / events 全量）
- [x] 报名状态三层检测逻辑
- [x] 上海马拉松误标为"报名中"bug 修复（区分"报名截止"vs"即将报名"）
- [x] 爱徒野跑等越野赛漏网 bug 修复（"野跑"加入 HARD_SKIP）
- [x] SOFT_SKIP 5 层过滤启用（之前定义了但未使用）
- [x] STATUS_MAP 补全（"已关闭"→closed，"尚未开始"→upcoming）
- [x] 城市/省份解析：分隔符支持、少数民族后缀剥离
- [x] 日期解析：7 种格式支持，含日期范围和"待定"处理
- [x] 全量去重（name+月份 key，status 升级合并）
- [x] SSE 流式日志输出（验证面板实时显示爬虫进度）

### 赛事页 UI（第四金刚）
- [x] 双用户类型设计（已报名跟踪 vs 未报名找赛）
- [x] 三区块分组（报名中 / 日期已公布 / 待定场次）
- [x] 报名中区块绿色高亮，置于日期已公布之前
- [x] 日期已公布默认折叠（当报名中有内容时）
- [x] 绿色"去报名 →"内联链接（卡片级 CTA）
- [x] 底部 Sheet 全宽"去官网报名 ↗"按钮（仅 open 赛事显示）
- [x] "报名中"独立 filter chip + stats 栏数字可点击
- [x] 省份 / 距离 / 月份 / 报名中 多维筛选
- [x] 我的赛事：localStorage 存储，手动添加，fuzzy 匹配建议
- [x] 导入日历（.ics 生成）

---

## 7. 即将要做的事情

### P0（核心功能完整性）

#### 7.1 第四金刚集成进主应用
- 将 `crawler/public/index.html`（纯 HTML+JS）重写为 React 组件 `RacesTab.tsx`
- 加入主应用底部四大金刚导航（替换现有三大金刚）
- 入口：底部 nav 第四项，图标建议「🏁」或 flag 图标

#### 7.2 爬虫数据接入主应用
- 构建脚本或自动化流程：`crawler/output/scraped-races.json` → `src/data/races.ts`
- 或：主应用运行时 fetch JSON（本地或 CDN）
- `src/data/races.ts` 目前是 v1 手动 seed 数据（约 20 条），需替换为爬虫输出（约 1200 条）
- 注意类型对齐：`races.ts` 中还有 `'10k'` 这个已废弃的 RaceDistance，需清理

#### 7.3 gusto.cn 爬虫修复
- 当前所有 API 端点返回 404（gusto.cn 改版？）
- 需要：重新抓包分析 gusto.cn 新接口，更新 `src/scrapers/gusto.ts`
- gusto.cn 是国内另一大路跑数据平台，补充 zuicool 覆盖不到的赛事

### P1（数据质量提升）

#### 7.4 定时爬虫（服务端部署）
- 爬虫目前需要手动运行，数据会过时
- 方案：部署到服务器（VPS / 云函数） + cron job（每日 06:00 运行一次）
- 输出 JSON 托管到对象存储（OSS / S3），主应用 fetch 最新数据
- 或：GitHub Actions 每日触发，commit JSON 到仓库，Vercel 自动部署

#### 7.5 IAAF 标牌数据
- 当前所有赛事 `label: null`，无 IAAF 金/银/铜标
- 需要额外数据源（IAAF 官网 / 中国田协公告）手动或爬取补充
- 对跑者选赛有重要参考价值

#### 7.6 高程数据（altitude）
- 目前 `altitude` 字段为空
- 可考虑 Google Elevation API 或百度地图地形 API 按城市粗略填充

### P2（体验优化）

#### 7.7 赛事页 → 日历联动
- 在赛事详情 Sheet 添加「加入我的训练计划」
- 触发：以该赛事日期为比赛日，自动填充主应用 Profile 的比赛日期，跳转到 Calendar Tab

#### 7.8 PWA 与移动端适配
- 主应用已有移动端布局，但日历在小屏上体验待优化
- Service Worker 缓存赛事数据，支持离线查看

---

## 8. Outstanding 待解决事项

### 已知 Bug / 技术债

| 编号 | 问题 | 位置 | 严重度 |
|------|------|------|--------|
| B-01 | `src/data/races.ts` 中 RaceDistance 包含废弃的 `'10k'` 类型，与 crawler `types.ts` 不一致 | `src/data/races.ts` | 中 |
| B-02 | gusto.cn 爬虫全部 404，当前 graceful degrade 但不采集任何数据 | `crawler/src/scrapers/gusto.ts` | 中 |
| B-03 | 推断距离逻辑（inferDistances）：所有"马拉松"赛事默认返回 `['full', 'half']`，但部分赛事可能只有全程或只有半程 | `crawler/src/utils.ts` | 低 |
| B-04 | catalog 页的 registrationUrl 指向 zuicool 详情页，部分赛事实际报名在第三方，URL 无法直达报名表单 | `crawler/src/scrapers/zuicool.ts` | 低 |

### 产品功能债（曾计划，已明确推迟）

| 编号 | 功能 | 上次讨论结论 |
|------|------|-------------|
| F-01 | 假期/休息块（Vacation Block）：在日历中标记不可训练的日期，自动重排 | 明确推迟，无时间表 |
| F-02 | 周计划汇总卡片（Weekly Summary Card）：每周开始时展示本周训练概览 | 明确推迟，无时间表 |
| F-03 | 真实反馈闭环：打卡后输入实际配速+RPE，动态调整下周跑量 | PRD 提到，尚未启动 |
| F-04 | 数据导出：.ics 导出 / Garmin Connect / COROS Training Hub 同步 | PRD 提到，尚未启动 |

### 架构决策待定

| 编号 | 问题 | 当前状态 |
|------|------|---------|
| A-01 | 赛事数据更新频率与托管方案：GitHub Actions + JSON？还是专用服务器？ | 未决 |
| A-02 | 第四金刚集成方式：重写为 React 组件？还是 iframe 嵌入？ | 未决，倾向重写 |
| A-03 | 主应用是否需要后端（用户账号、跨设备同步）？当前纯前端 localStorage | 未决，v1 不做 |

---

## 9. 目录结构速查

```
/Users/agg/Desktop/Marathon/
│
├── PRODUCT_NOTES.md           ← 本文档
├── PRD_Architecture.md        ← 原始 PRD（详细算法说明）
│
├── src/                       ← 主应用（React + Vite）
│   ├── components/
│   │   ├── ProfileTab.tsx
│   │   ├── StatsTab.tsx
│   │   └── CalendarTab.tsx
│   ├── data/
│   │   └── races.ts           ← ⚠️ v1 手动数据，待替换
│   ├── store/                 ← Zustand stores
│   └── lib/
│       └── training-engine.ts ← 核心算法引擎
│
├── crawler/                   ← 爬虫（独立 Node.js 项目）
│   ├── package.json
│   ├── src/
│   │   ├── index.ts           ← CLI 主入口
│   │   ├── types.ts           ← 共享类型
│   │   ├── utils.ts           ← 工具函数（日期/城市/状态解析）
│   │   ├── merge.ts           ← 合并脚本
│   │   ├── server.ts          ← 验证面板服务器（port 3333）
│   │   └── scrapers/
│   │       ├── zuicool.ts     ← 主爬虫（三源）✓ 已完善
│   │       └── gusto.ts       ← ⚠️ 待修复（全部 404）
│   ├── public/
│   │   └── index.html         ← 第四金刚前端页面
│   └── output/                ← 爬虫输出（.gitignore）
│       ├── scraped-races.json
│       ├── scraped-zuicool.json
│       └── errors.log
│
└── [Vite config / tsconfig / etc.]
```

---

*文档由人机协作生成，反映截至 2026-04-28 的产品状态。*
