# 项目全面复查规划（2026-08-20）

> 审计范围：全部文档（8 个 md）、全部源码（src/ 30+ 文件、crawler/）、配置与工作流。
> 结论：核心引擎与算法健康（305+ 自测全绿），主要问题是**一轮测试覆盖回归**和**一批文档过时**。

---

## P0 正确性——立即修

### 1. 测试覆盖回归（删 insights/ 时静默丢失 ~40 例）
`rm -rf insights/` 时，`insights/selftest.ts` 里约 40 个用例随之消失，其中部分从未移植进 selftest-core：
| 丢失的覆盖 | 风险 |
|---|---|
| `validate.ts` 快照白名单校验（脏数据拒绝/版本拒绝/profile 字段校验） | 导入坏数据可能静默通过 |
| `zones.ts` paceToZone 六区边界 | 落区判定无护栏 |
| `metrics.ts` weeklyVolume / zoneDistribution / splitHalves | 周跑量与落区统计无护栏 |
| `coach.ts` 处方规则细节（LT 校准触发/PB 参照/目标可行性） | 处方逻辑回归无告警 |
**动作**：把这些用例移植进 `scripts/selftest-core.mts`（预计 +35 例）。

### 2. 过时注释指向已删除文件
- `src/utils/insights/snapshot-builder.ts:2` 与 `types.ts:1` 仍引用已删除的 `scripts/build-coros-snapshot.mjs`
**动作**：改为指向自身（唯一事实源）。

### 3. DEPLOY.md 旧仓库 URL
- 第 31 行仍写 `angusggsimid/marathon` → 改 `marathon-coach`。

### 4. AGENTS.md 过时
- "由 Codex 负责实现…" → 当前执行体是 OpenCode；补充"CONTEXT.md 为本地文件不进仓库"的新约定。
**动作**：更新两行。

## P1 文档时效——公开仓库门面

### 5. PROJECT.md 大幅过时（355 行）
- 只写到 4 个 Tab；无洞察 Tab、COROS 直连、客观自适应、Garmin FIT、双源合并等全部新架构。
**动作**：重写为当前形态（或顶部加"历史文档"声明 + 新增简版当前架构）。推荐重写精简版。

### 6. README 增强（可选）
- 补一张应用截图/GIF（公开仓库转化率关键）；补 English 段落的 Feature 表格对齐。

## P2 产品打磨——排期做

### 7. 洞察 Tab 长滚动
11 区块单栏堆叠过长 → 顶部加锚点分组导航（概览/负荷/效率/恢复），或区块折叠。

### 8. 赛事页长列表
~100 场平铺 → 按月折叠（默认展开当月）。

### 9. package.json 元数据
`name: "app"` → `marathon-coach`；补 description。

## P3 技术债——记录在案，暂不动

- `export-fit.ts` / `race-plan-overlay.ts` / `checkin-messages.ts` 无自测（计划核心链路建议下批补）
- `coros-sync.ts` 首次同步串行 60+ 调用（约 2 分钟）——可并行化或增量优先
- ICU 通道无代理不可用（已如实标注）

## 执行顺序建议

1. P0 全部（1-4）——一次提交完成
2. P1 的 PROJECT.md 重写
3. P2 按需排期
4. 最后统一推送 + 双平台验证
