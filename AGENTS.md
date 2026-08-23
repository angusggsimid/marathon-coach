# Marathon 项目规则

- 由 OpenCode 负责实现、审查和测试，并可自行判断是否使用原生子代理；其他模型仍须用户明确要求。
- 除非用户明确授权，不提交、推送、部署、删除或执行不可逆迁移。

## 仓库与文档

- 仓库已公开：`https://github.com/angusggsimid/marathon-coach`（MIT License）。公开后历史不可撤回——提交前确认不含个人数据/密钥。
- `CONTEXT.md` 是本地项目日志（含个人训练数据），**已 gitignore、不进仓库**；归档副本在 `local-data/CONTEXT.md`。新会话先读本地 CONTEXT.md。
- 个人数据目录 `local-data/`（COROS 快照等）永不提交。

## 发布

- 用户明确要求“推送”时，本轮同时授权：本地验证、GitHub 推送、Vercel 与 EdgeOne Makers 部署及生产地址检查。
- 固定顺序：本地验证 → GitHub → Vercel → EdgeOne → 两个生产地址。
- 两个生产环境（Vercel / EdgeOne Makers）都关联 GitHub main 分支自动部署，push 后只需等待并验证，不做手动部署。
- 任一平台失败都明确报告；部分成功不得写成发布完成。
- 查 EdgeOne 部署状态必须按 `RepoName == 'marathon'` 过滤（API 列表首项可能是账号下其他项目）。

## 数据产品

- tracker、monitor 或 dashboard 必须先完成真实数据底表、口径与去重、决策规则和最小可用判断，再做 UI。
- 没有真实数据或可用判断时不得声称完成；验收必须包含对用户决策是否有用。