# 任务 2 集成设计：insights 合并进 PWA（已确认）

- **日期**：2026-08-16
- **状态**：用户全部确认，执行中
- **前置**：`TRAINING_LOOP_MASTER_PLAN_2026-08-16.md`（总纲）、`ADR_PWA_MCP_ARCHITECTURE_2026-08-15.md`

## 1. 合并后形态

普通跑者仍是今天的 4 Tab；COROS 用户多出「洞察」Tab + 两处引擎增强（LT 校准、客观自适应），数据按设定频率同步，全程本地。

```
底部导航：档案 │ 指标 │ 训练 │ 赛事 │ 洞察（新）
```

- **洞察 Tab**：未连接 = 连接引导 + "无手表无需理会"；已连接 = 同步状态条 + 教练处方 + 全部数据面板。
- **档案**：LT 字段显示 COROS 实测徽章 + 一键应用（store action，不再 localStorage 手术）。
- **训练**：自适应横幅双源透明（主观打卡 vs 客观裁决 → 采用保守值，可一键否决）。

## 2. 同步机制（确认语义）

- PWA 无真后台任务："定时" = **打开应用时距上次同步 > N 天 → 自动同步** + 洞察页"立即同步"按钮；频率可配（1/3/7 天，默认 3）。
- 同步 = 浏览器内 MCP 客户端（OAuth PKCE，已验证公共客户端 + CORS 可行）→ 复用 snapshot 解析 → store → 处方/面板自动刷新。
- 不做服务器端同步（与"数据只存本机"冲突）。

## 3. L2 客观自适应（确认方案）

```
factor = COROS 数据新鲜（≤N天）
         ? conservative(六信号客观裁决, 主观打卡裁决)   // 冲突取保守（总纲铁律）
         : 主观打卡裁决（普通用户路径不变）
```

横幅展示来源分解；用户可一键否决恢复 1.00；RPE 打卡保留为否决通道。

## 4. 代码架构

| 资产 | 去向 |
|---|---|
| insights 面板组件 + metrics/coach/zones 库 | `src/components/insights/`、`src/utils/insights/`（原样复用，CSS 变量已验证一致） |
| build-coros-snapshot 解析逻辑 | 移植为浏览器版 `src/utils/insights/snapshot-builder.ts`（2.2） |
| sync.ts 的 localStorage 手术 | **删除**，改 store action |
| MPA 双入口 insights.html | 过渡保留，稳定后移除 |
| 新增 `src/utils/coros-mcp.ts` | OAuth PKCE + token 管理 + MCP JSON-RPC（2.2） |
| store 新增 | `corosSnapshot`（不入 zustand persist，单独键 `marathon-coros-snapshot`）+ 元数据切片 |
| weekly-adaptation.ts | 接受客观裁决 + 保守合并 + 来源标注（2.3） |

性能：洞察 Tab 用 React.lazy 代码分割，echarts 不进首屏包。

## 5. 分步（每步独立验收）

| 步骤 | 内容 | 风险 |
|---|---|---|
| **2.1 面板合并** | 洞察 Tab + 快照入 store + 校准 store action（文件导入仍支持） | 低 |
| **2.2 COROS 直连** | 先做 MCP 连接原型（OAuth+工具调用通路），通过后产品化：过期自动同步 + 频率设置 | 高 |
| **2.3 客观自适应** | 引擎双源合并 + 透明横幅 + 否决 | 中 |

## 6. 已确认决策记录

1. Tab 名 =「洞察」
2. 同步 = 打开过期自动 + 手动按钮（无真后台）
3. L2 = 自动采用保守值 + 透明展示 + 一键否决
4. 顺序 2.1 → 2.2（先原型）→ 2.3
