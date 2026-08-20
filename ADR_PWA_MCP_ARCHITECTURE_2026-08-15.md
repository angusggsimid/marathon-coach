# ADR：PWA 形态保留，取数层可插拔，MCP 不绑定大模型

- **日期**：2026-08-15
- **状态**：已采纳（含当日 CORS 实测证据）
- **关联**：`COROS_MCP_DEEP_RESEARCH_2026-08-15.md`、`CONTEXT.md` 数据更新 Runbook

---

## 1. 背景与要回答的问题

Marathon 主产品是一个 **PWA**（GitHub + Vercel，离线可用、免账号、帮用户制定马拉松训练计划）。
后来我们做了 **insights 解读界面**，它通过 **MCP** 从 COROS 拉取个人训练数据。

由此产生一个架构疑虑：

> 「既然 insights 要通过 MCP 拉个人数据，那是不是意味着产品不能再保持 PWA 形态，
> 必须依附某个大模型 / Harness？是不是只能做成 Skill 或个人 MCP？」

**本 ADR 的回答：不是。PWA 形态保留。MCP 不与大模型绑定。**

## 2. 核心认知：MCP ≠ 需要大模型

MCP 是一个**数据协议**（HTTP + OAuth + JSON-RPC），大模型不是它的必要条件。

当前 dogfood 的真实数据链路：

```
COROS 服务器 ──OAuth──> COROS MCP 服务端 (mcpus.coros.com)
                              │
                              ▼
                 OpenCode（"恰好"充当 MCP 客户端，非智能来源）
                              │
                              ▼
                 本地 coros-snapshot.json
                              │
                              ▼
                 insights PWA（只读 JSON，完全不知道 MCP 存在）
```

两个关键事实：

1. **insights PWA 现在就已与 MCP 解耦**——它只消费一个 JSON 文件；MCP 只发生在"取数"环节。
2. **所有解读逻辑（EF、有氧解耦、Seiler 三区、睡眠负债）都是确定性 TypeScript**，零大模型参与。
   OpenCode 在链路里只是"一个方便的 MCP 客户端"，不是"智能来源"。

大模型只在一种情况下被需要：**自然语言对话式交互**。那是交互方式问题，不是数据通路问题。

## 3. 决策：分层架构，PWA 恒为前端

```
┌─ 呈现 + 解读层：PWA（不变，离线可用，确定性代码）
│
├─ 取数层：可插拔（随产品阶段升级，PWA 无感知）
│     档位0 手动上传 JSON          → 现状，零后端零大模型
│     档位1 本地 AI Harness 拉数    → 现状 dogfood，用到大模型仅为方便
│     档位2 PWA 直接 OAuth 连 MCP   → 无后端、无大模型（本 ADR 实测可行，见 §5）
│     档位3 轻量同步后端代拉        → 闭环/多用户时做；后端是数据同步服务，不是大模型
│
└─ 分发层：PWA 主体 +（可选）Marathon MCP Server 供 AI 助手调用
```

**取数层是唯一需要演进的部分；PWA 作为呈现层始终是产品主体。**

## 4. 取数档位对比

| 档位 | 取数方式 | 要后端 | 要大模型 | 适用阶段 |
|---|---|---|---|---|
| 0 | 手动上传 JSON | 否 | 否 | 现在 |
| 1 | 本地 AI Harness（OpenCode） | 否 | 用到（仅为方便） | dogfood |
| 2 | PWA 直接 OAuth 连 COROS MCP | 否 | **否** | 个人联网版候选 |
| 3 | 轻量同步后端代拉 | 小后端 | **否** | 闭环 / 多用户 |

> 注意：档位 3 的后端是**数据同步服务**（OAuth + 定时拉数 + 存储），不是大模型。
> "闭环需要最小后端"与"必须依附大模型"是两件不同的事。

## 5. CORS 实测证据（2026-08-15）

档位 2 的生死门是 CORS：PWA 在浏览器里能否跨域调 COROS 的 OAuth / MCP 端点。当日实测（`curl` 模拟浏览器 `Origin`）：

| 测试 | 端点 | 结果 |
|---|---|---|
| 预检 OPTIONS | `/oauth2/token` | `allow-origin` 回显请求方 + `allow-credentials: true` ✅ |
| 预检 OPTIONS | `/mcp` | 同上，且 `allow-headers` 明确含 `authorization`（Bearer 必需）✅ |
| Origin 白名单 | `/mcp` | 生产域名、陌生第三方域名均被原样回显 → **无白名单，任意 origin 放行** ✅ |
| 真实 POST（无 token） | `/mcp` | 返回 401，但**仍带 CORS 头** + 标准 `WWW-Authenticate: Bearer resource_metadata=...` ✅ |
| OAuth 客户端类型 | 发现文档 | `token_endpoint_auth_methods_supported` 含 `none` → **公共客户端 / PKCE 可行** ✅ |

**结论**：档位 2 在 CORS 层面完全可行。剩余工作只是工程量——在浏览器实现 OAuth PKCE + MCP JSON-RPC 握手——不是可行性障碍。

## 6. Skill / 个人 MCP 的真实定位

它们**不是 PWA 的替代品，是另一个方向的分发渠道**：

- **PWA** = 产品主体，面向普通跑者（离线、免账号、可安装）。
- **Marathon MCP Server / Skill** = 把我们的**计划引擎 + 赛事库**暴露给 Claude/OpenCode 等 AI 助手调用，面向 AI 原生用户。
  这是"让别人来调用我们"，不是"我们去依附别人"。

一个是躯干，一个是触手，不冲突。COROS 开放了数据，稀缺的是"解释数据 + 赛事情报"——这正是我们的引擎所在。

## 7. 会改变本决策的信号

| 信号 | 应对 |
|---|---|
| COROS 收紧 CORS / 改 OAuth 策略 | 档位 2 受阻 → 退回档位 3（薄后端代理） |
| 需要后台定时同步 / 多用户 / 多年历史 | 上档位 3 + 数据库（见 CONTEXT.md 数据库讨论） |
| 想要自然语言交互 | 在 PWA 之上**可选**接入 LLM，属交互层，不改取数层 |

## 8. 一句话结论

**不需要放弃 PWA，也不是只能做成 Skill / 个人 MCP。取数方式可渐进升级（档位 0→3），且没有任何一档要求绑定大模型。真正要决策的只是"何时、以哪一档接入个人数据"——这是产品节奏问题，不是技术形态问题。**
