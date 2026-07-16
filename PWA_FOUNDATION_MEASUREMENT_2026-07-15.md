# PWA 基础能力 · 中国大陆外部探针方案

日期：2026-07-15
范围：客户端无法自测的「大陆打开失败 / 资源可达性」；本地隐私指标见产品内「试用诊断」。

## 1. 要判断什么

14 天内，在中国大陆多地区、多运营商下：

1. 首页 HTML / JS / CSS / SW 是否可稳定打开
2. Web App Manifest 与 PNG 图标是否可达
3. `/api/data`（或 `/races.json`）是否可拉取
4. 失败是 DNS、TLS、TTFB 超时，还是 4xx/5xx

**试运行决策门（无基线前的工作假设，不是用户证据，也不是永久阈值）：**
连续 14 天探针建立基线后，再确认是否采用例如「关键路径成功率 < 95%」或「P95 TTFB > 3s（大陆样本）」作为付费/镜像触发条件。
**本轮不注册、不购买监控、域名或国内托管，不伪造探针数据。**

## 2. 探针 URL（生产）

以当前生产为准（可替换为自定义域）：

| 路径 | 用途 |
|---|---|
| `https://marathon-pi-seven.vercel.app/` | 首页 HTML |
| `https://marathon-pi-seven.vercel.app/manifest.webmanifest` | PWA manifest |
| `https://marathon-pi-seven.vercel.app/pwa-192x192.png` | 安装图标 |
| `https://marathon-pi-seven.vercel.app/pwa-512x512.png` | 安装图标 |
| `https://marathon-pi-seven.vercel.app/apple-touch-icon.png` | iOS 图标 |
| `https://marathon-pi-seven.vercel.app/assets/*.js`（从 HTML 解析最新 hash） | 主 JS |
| `https://marathon-pi-seven.vercel.app/assets/*.css` | 主 CSS |
| `https://marathon-pi-seven.vercel.app/sw.js` | Service Worker |
| `https://marathon-pi-seven.vercel.app/api/data` | 赛事 API |
| `https://marathon-pi-seven.vercel.app/races.json` | 静态数据回退 |

## 3. 频率与样本

| 项 | 建议 |
|---|---|
| 周期 | 连续 14 天 |
| 频率 | 每 URL 每点位每 30–60 分钟 1 次（避免把源站打挂） |
| 地区 | 至少 4 城：北京、上海、广州、成都（可加武汉/西安） |
| 运营商 | 电信、联通、移动各至少 1 条线路 |
| 终端 | HTTP 拨测即可（非浏览器渲染）；可选 1 条真实手机微信 UA 抽测 |

## 4. 采集字段

每次请求记录：

- `url`, `region`, `isp`, `ts`
- HTTP status
- DNS ms、TCP/TLS ms、TTFB ms、total ms
- 错误类：timeout / dns / tls / http_4xx / http_5xx / other
- 响应体大小（可选校验 Content-Type）

**不要采集：** 用户 Cookie、API Key、训练数据、个人标识。

## 5. 判定方法（试运行 SLO 草案）

下列阈值为**试运行 SLO**，须先有 ≥14 天基线后再固化；当前**无**大陆实测证据支撑。

| 指标 | 健康（草案） | 告警（草案） | 决策触发（草案） |
|---|---|---|---|
| 成功率（2xx） | ≥ 99% | < 98% | < 95% |
| TTFB P50 | < 800ms | > 1.5s | P95 > 3s |
| 首页连续失败 | 无 | 同城 ≥3 次/日 | 多城同日失败 |
| `/api/data` | 与首页同级 | 单独劣化 | 与静态资源分化 → 查 rewrite/缓存 |

成功定义：HTTP 2xx 且 TTFB < 10s。
超时：连接或首字节 > 15s 记失败。

## 6. 执行选项（用户后续二选一，本轮不代购）

1. **付费拨测**（推荐若要规模）：选用**具备中国大陆多运营商拨测能力**的供应商（如阿里云拨测、腾讯云拨测等——以该供应商官方文档可确认的节点为准；勿假设某全球监控品牌自带大陆多运营商节点）。
2. **人工小样本**：朋友在 4 城用系统浏览器 + 微信各打开一次，记录时间与是否白屏；配合本机「试用诊断」JSON。

## 7. 与本机 M 指标的分工

| 层 | 内容 | 上传 |
|---|---|---|
| 本机 `local-metrics` | 打开、回访、standalone、微信、备份/导出成败 | 否；用户可导出诊断 |
| 外部探针 | 大陆网络可达、TTFB、运营商差异 | 探针服务商侧；无用户训练数据 |

## 8. 自定义域 / 镜像决策门

仅当 §5「决策触发」在**有基线之后**成立时：

1. 评估 Vercel 自定义域 + 国内 DNS 优化是否足够
2. 若仍失败，再评估国内静态镜像（仅静态资源 + races.json，注意数据同步）
3. **禁止**在未验证前绑定不可逆 CDN 或泄露密钥的配置

## 9. 本轮状态

- [x] 本地隐私指标与诊断导出（代码；日粒度 first/last、严格反序列化）
- [x] PWA 安装图标与 header 品牌一致（绿底 + 黑跑者）
- [x] 备份/恢复严格校验（含 details / 日期 / URL / 状态不变量；不恢复 activeTab）
- [ ] 14 天大陆多地区外部探针（**唯一未执行外部项**，待用户选具备大陆运营商拨测的供应商 / 是否付费）
