# 智能马拉松训练计划生成器 - 产品需求文档 (PRD)

## 1. 产品定位与愿景

### 1.1 产品定位
一款基于运动科学最佳实践（COROS EvoLab, Garmin, Jack Daniels VDOT, Joe Friel）构建的**高度个性化、动态自适应**的马拉松训练计划生成 Web 应用。

### 1.2 核心价值主张
解决传统模板化训练计划（如 Hal Higdon 静态表格）“千人一面”、“无法根据个人能力适配跑量与配速”的痛点。通过采集跑者的真实生理数据与过往成绩，利用多维度的数学模型，在浏览器端瞬间生成一份**科学、安全、高度定制化**的备赛日历。

---

## 2. 目标用户与使用场景

### 2.1 目标用户画像
- **初中级跑者（完赛导向/PB导向）**：希望有一份能直接照着跑的日历，不需要自己去查繁琐的配速表和心率区间。
- **数据极客跑者**：日常佩戴 COROS/Garmin 等专业运动手表，对自己的乳酸阈值（LT）、最大摄氧量（VO2max）有清晰认知，希望训练计划能与手表上的多级生理指标（如 6-Zone 体系）完美映射。

### 2.2 核心使用场景
跑者在备赛周期开始前（如赛前 16 周），输入自己的身体数据、近期最好成绩、手表测得的乳酸阈值，选择目标赛事与强度。点击生成后，获得一份可以直接导出执行的每日训练课表。

---

## 3. 核心功能架构

本应用采用“三大金刚”底部导航结构，分为三大核心模块：

### 3.1 跑者档案 (Profile)
- **定位**：系统的数据输入源与引擎驱动层。
- **输入模块设计**：
  1. **基础生理数据**：身高、体重（用于计算 BMI 安全系数）。
  2. **专业生理指标**：乳酸阈值心率 (LTHR)、乳酸阈值配速 (LT Pace)。
  3. **个人最好成绩 (PB)**：
     - **必填**：5km、10km（用于推算基础 VDOT 能力）。
     - **选填**：半马、全马（若填写，将覆盖 5k/10k 的 VDOT，拥有最高优先级）。
  4. **目标与训练负荷**：
     - 目标比赛类型（半马/全马）、比赛日期。
     - 目标完成时间（系统提供基于当前 PB 的智能预测参考）。
     - 训练负荷（Light/Medium/Heavy）：决定峰值跑量天花板与每周里程爬升斜率。

### 3.2 生理指标分析 (Training Stats)
- **定位**：数据验证与训练基准锚点展示。
- **功能表现**：
  - 在用户填写档案后，系统瞬间完成复杂运算，将结果以直观的**配速区间表 (Zone 1 - Zone 6)** 和 **心率区间表 (Zone 1 - Zone 6)** 呈现（基于 COROS EvoLab 6 区间体系）。
  - 核心交互理念：”配速为主，心率为辅”。

### 3.3 跑者日历 (Calendar View)
- **定位**：训练计划的最终可视化落地层。
- **功能表现**：
  - 以日历网格形态展示从当天到比赛日的每一天训练安排。
  - **动态日历卡片**：直观展示当天的训练类型（LSD、Tempo、间歇等）、目标总里程、核心配速标签。
  - **周跑量汇总**：在每个日历周的末尾（周日），动态汇总该周的实际排课总跑量，并提供基于周期的训练建议（如“单次长跑增幅不宜超过 10%”）。
  - **月跑量汇总**：顶部显示自然月的累计跑量。
  - **下钻详情弹窗**：点击单日卡片，弹出该日训练的颗粒度分解，严格拆分为：
    - 跑前热身（动作描述 + 时长 + Z1 心率）。
    - 主训练项（X km × Y 组 + 目标配速 + 目标心率 + 恢复段落）。
    - 跑后冷身（拉伸动作描述 + 时长）。

---

## 4. 底层数据运算逻辑 (v3.0 核心算法引擎 - `training-engine.ts`)

本产品的护城河在于其背后的 `training-engine.ts` 动态生成逻辑。该逻辑通过将多个运动科学公式进行工程化封装，彻底摒弃了死板的模板映射，采用了高耦合度、纯函数驱动的动态推导体系。

### 4.1 生理指标模型引擎 (Pace & HR Zones)
`calculatePaces` 和 `calculateHRZones` 函数负责基于用户输入的 `LT Pace`（阈值配速）和 `LTHR`（阈值心率），计算 COROS EvoLab 6 级训练区间：
- *心率逻辑*：Z1 < 80% LTHR，Z2 80–89% LTHR，Z3 90–95% LTHR，Z4 96–100% LTHR，Z5 101–106%，Z6 > 106%。
- *配速逻辑*：以 LT Pace 为绝对锚点进行秒数偏移（如 Z2 = LT Pace + 52s 到 +97s）。
- 若用户未填写 LTHR / LT Pace，系统根据 5K/10K PB 反推 VDOT，再映射到各区间估算值，标注「系统推算」。

### 4.2 动态跑量生成引擎 (Mileage Plan Generator)
系统核心函数 `generateTrainingPlan` 通过一系列动态因子的正交相乘，计算用户的安全峰值跑量（Peak MPW）与起始跑量（Start MPW）。

**核心代码逻辑抽象：**
```typescript
// 1. VDOT 计算 (优先级：Full > Half > 5k/10k)
// 修复了之前的纯指数公式导致的 VDOT 计算过高 (如半马 1:41 会算出 80 的 Bug)
// 现在采用基于 Jack Daniels 标准对照表的精准一次函数拟合
let vdot = calculateVDOTFrom5K10K(profile.pb5k, profile.pb10k);
if (profile.pbHalf) vdot = calculateVDOTFromHalf(profile.pbHalf);

// 2. 基础能力因子 (Base Capacity) - 完全基于 Jack Daniels 和 RRCA 的查表法
const baseCapacity = getBaseCapacityFromVDOT(vdot, profile.raceType); 

// 3. 训练强度调整的动态乘数 (Intensity Multiplier)
const intensityMultiplier = { light: 0.82, moderate: 1.00, heavy: 1.18 }[profile.intensity];

// 4. 目标时间差距调整 (Goal Gap Factor)
// 预测成绩与目标成绩的差异，目标越激进乘数越大（上限1.25保护机制）
let goalGapFactor = 1.0;
if (profile.goalTime) {
  const predictedSec = timeToSeconds(predictTime(vdot, profile.raceType));
  const goalSec = timeToSeconds(profile.goalTime);
  const diffMinutes = (predictedSec - goalSec) / 60;
  if (diffMinutes > 0) {
    const linearFactor = 1 + (diffMinutes * 0.06);
    if (linearFactor <= 1.15) {
      goalGapFactor = linearFactor;
    } else {
      goalGapFactor = 1.15 + 0.10 * (1 - Math.exp(-(linearFactor - 1.15) / 0.10));
    }
  } else {
    goalGapFactor = 1.0;
  }
}

// 5. BMI安全系数
const bmi = profile.weight / Math.pow(profile.height / 100, 2);
const bmiSafety = Math.max(0.88, 1 - Math.max(0, bmi - 22) * 0.018);

// 6. 周期系数
const weeksFactor = totalWeeks >= 24 ? 0.95 : (totalWeeks >= 16 ? 1.0 : 1.05);

// 7. 核心：峰值周跑量（多层硬约束，杜绝失控）
let peakMPW = Math.round(baseCapacity * intensityMultiplier * bmiSafety * goalGapFactor * weeksFactor);

// 多层安全阀，取最小值
const pastAvg = baseCapacity * 0.55; // 稍微降低默认值
const vdotBasedMaxPeak = baseCapacity * 1.4;
// 用户级别上限区分全马/半马
const userLevelMaxPeak = profile.raceType === 'full' 
  ? { light: 65, moderate: 85, heavy: 110 }[profile.intensity]
  : { light: 45, moderate: 65, heavy: 85 }[profile.intensity];
peakMPW = Math.min(peakMPW, vdotBasedMaxPeak, userLevelMaxPeak);

// 8. 动态起始里程 (Start MPW)
// 修复起步差异：让强度选择在首周就能体现，且不超过峰值的 50-65%
const startMultiplier = { light: 0.85, moderate: 0.95, heavy: 1.05 }[profile.intensity];
const dynamicStartRatio = pastAvg >= 40 ? 0.65 : 0.50;
let startMPW = pastAvg * startMultiplier;
startMPW = Math.min(startMPW, peakMPW * dynamicStartRatio);
startMPW = Math.max(startMPW, pastAvg * 0.75); // 确保不低于过去的75%
startMPW = Math.round(startMPW);
```

### 4.3 线性爬升与期化排期 (Periodization & Progression)
在确定起终点后，系统生成平滑的周跑量曲线（`targetVolumes` 数组）：
- 摒弃死板的纯复利和直线增长，采用 **Garmin/COROS 官方架构的二次方缓动 S 曲线 (Sigmoid-like, `progress^0.8`)**。在冲到峰值前形成优美的周期爬升，彻底解决“跑量过早平缓”和“首月跑量倒挂”的问题。
- **恢复周深度与强度强关联**：疲劳越深，降载需越彻底。重度跑者 3 周一循环（2建1休），中/轻度跑者 4 周一循环（3建1休）。
- 赛前严格执行 3 周减量期（Taper: 75% -> 50% -> 25%）。

### 4.4 每日课表微观排布与对象生成 (Daily Workout Allocation)
**全新课程分配机制 (基于 Garmin/COROS 最佳实践重构)**
- **动态长跑距离 (Dynamic LSD)**：摒弃死板的“长跑占周跑量 30%”法则。LSD 距离随训练周期独立生长，平滑逼近 `MAX_LSD`（全马 26-32km，半马 16-22km），但绝对不超过当周总跑量的 50% 以确保安全。
- **80/20 极化训练**：强制规定强度课占总跑量的 20%，剩余跑量分配给 LSD、Easy 和 Recovery。
- **按强度分配训练天数**：Light=4 天/周，Moderate=5 天/周，Heavy=6 天/周。
- **完美错开的排期网络 (Avoid Back-to-Back)**：解除硬编码，确保高强度课（Intensity）、长跑（LSD）与恢复跑（Recovery/Rest）完美穿插。
  - *Light*：周二(强度)、周四(轻松)、周六(轻松)、周日(LSD)
  - *Moderate*：周二(轻松)、周三(主强度)、周四(轻松)、周六(次强度)、周日(LSD)
  - *Heavy*：周二(轻松)、周三(主强度)、周四(恢复)、周五(次强度)、周六(轻松)、周日(LSD)

#### 具体跑步课程生成逻辑 (Workout Variations)
**精简版训练活动（无坡度、无混乱节奏、逻辑清晰）**

1. **LSD (长距离慢跑)**
   - 合并原 Easy+LSD：日常有氧 + 周日长距离，统一类型。
   - 基础期：全程 `Zone 2`。
   - 专项期：前 80% `Zone 2`，后 20% `Zone 3` 马拉松配速模拟。
2. **Recovery (恢复跑)**
   - 强度课次日的主动恢复，全程 `Zone 1`，距离被硬性限制在最高 `6km` 以内。
3. **MP (马拉松配速跑)**
   - 专项核心，比赛配速模拟，主项 `Zone 3` 连续跑。
4. **Tempo (乳酸阈值节奏跑)**
   - 连续乳酸阈值跑，主项 `Zone 4`。
5. **Tempo Intervals (节奏间歇跑)**
   - 阈值跑低风险版，2km `Zone 4` 努力 + 400m 恢复。
6. **Interval (VO2max 间歇跑)**
   - 高强度速度训练，800m `Zone 5` 努力 + 400m 恢复。
7. **Fartlek (法特莱克变速跑)**
   - 修正版：无高频切换，固定节奏（1km `Zone 4` 快 + 1km `Zone 2` 慢），基础期趣味训练。
8. **Progression (渐进加速跑)**
   - 后段加速，`Zone 2` -> `Zone 3` -> `Zone 4`，赛前适应。
9. **Cruise (巡航间歇跑)**
   - 长段落阈值跑，3.2km `Zone 4` 努力 + 短暂极慢走恢复。

---

## 5. UI/UX 与前端技术架构

### 5.1 视觉风格
- 采用深色模式（Dark Mode）为主色调，搭配荧光绿（Neon Green）作为数据高亮和主操作按钮的强调色。
- 大量运用毛玻璃（Glassmorphism）、微边框、柔和阴影，营造专业且极具现代科技感的运动数据平台氛围。

### 5.2 前端技术栈
- **核心框架**：React 18 + TypeScript + Vite。
- **状态管理**：Zustand（轻量级，负责 Profile 数据和生成 Plan 数据的全局流转与 LocalStorage 持久化）。
- **样式方案**：Tailwind CSS 4 + Lucide Icons。
- **时间处理**：`date-fns`（精准处理日历网格的跨月、跨周运算，确保时区安全）。

---

## 6. 后续迭代规划 (Roadmap)
1. **PWA & 移动端适配强化**：优化日历在手机屏幕上的竖向瀑布流展示体验。
2. **数据导出支持**：支持将生成的课表直接导出为 `.ics` (Apple Calendar/Google Calendar) 或一键同步至 Garmin Connect / COROS Training Hub。
3. **真实反馈闭环 (Feedback Loop)**：允许用户在每天打卡后输入“实际完成配速与主观疲劳度 (RPE)”，系统据此动态调整下一周的跑量爬升斜率。