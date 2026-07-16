# Marathon 产品形态研究（PWA vs 小程序 / 混合 / 原生）

- **检索与撰写日期**：2026-07-15（**第四轮终审**：创业/工程双视角失败模式 + PWA 内债收敛 + 三层形态 + 矩阵独立复算 + 证据账本 + 最终一页 + 绝对化语言降级）
- **范围**：载体与基础能力决策；不扩张算法功能
- **方法**：仓库代码级证据 → ≥25 个外部来源 HTTP 打开核对 → 官方能力边界精读 → 失败模式反推载体 → 无诱导用户研究设计 → 加权矩阵重算与敏感性 → 反结论检查 → **第四轮决策清晰度审计**
- **证据分级**：【事实】可核对链接或仓库代码；【推断】基于事实的合理判断；【未知】未实测或无官方定论
- **硬声明**：本研究**没有真实用户行为数据**；第 9/11 节触发阈值均为**相对规则**，必须先建立 M1–M8 基线后才可决策开工。**矩阵分数是专家决策工具，不是用户证据。**
- **生产 URL 现场核对（第三/四轮）**：`https://marathon-pi-seven.vercel.app` 与 `manifest.webmanifest` 于 2026-07-15 探针 **HTTP 200**；manifest `icons` 仍仅 `/favicon.svg`。**这不证明中国大陆稳定可达**。

---

## 1. 执行摘要（结论先行）

### 核心结论（第四轮终审后：**未推翻，措辞收紧**）

**未来 90 天唯一执行本体：PWA（系统浏览器 / 主屏幕 Web App）。**
**获客入口：可选、极轻量的微信/社交链（只导流，不重做训练台）。**
**数据/计划本体：仍是浏览器 localStorage 中的同一计划状态（可导出备份），不是第二套数据产品。**
**明确不做什么（90 天内）：完整微信小程序执行台、Capacitor/混合 App、原生 iOS/Android、公众号内嵌完整业务 H5。**
**长期不是承诺**：90 天后门禁可改；本报告不锁定「永远纯 PWA」。

### 一句话理由

当前 Marathon 的价值闭环是「可信选赛 → 生成计划 → 每天查看/打卡/周报 → FIT·ICS·Intervals.icu 执行」。该闭环与 **local-first Web + Blob 文件导出 + 可选 CORS 代理** 匹配；与 **GPS 轨迹、硬件固件、支付报名、社交 Feed** 不匹配。竞品选原生/多端，是因为护城河在后者。在 **没有安装率/回访/中国可达性基线** 之前，换载体是用工程复杂度掩盖验证不足。多处「PWA 不行」表象是 **实现内债/托管/微信容器**，不是形态天花板。

### 第三/四轮是否改结论？

| 问题 | 答案 |
|------|------|
| 新证据是否推翻「主形态 PWA」？ | **否** |
| 最强反方「现在就该做小程序/Capacitor/原生」是否达到开工门槛？ | **否**（见第 21–22、24 节） |
| 矩阵算术是否曾有误？ | **是**——第二轮总分有误差；第三轮修基线；**第四轮再修敏感性 S1/S2 数字**；排序 **仍为 A > B ≫ D ≳ C > E** |
| 结论有何修正？ | ① 微信三层文件能力区分；② Chrome 安装规则演进但 192/512 仍应先补；③ 「唯一本体」→「**90 天唯一执行本体**」；④ 三层形态：入口可异质，执行+数据不可分叉；⑤ 首批只修 5 项阻塞性内债 |

### 升级门槛（摘要）

只有当隐私友好指标显示 **「打开成功但留存/导出失败可归因于载体」**（见第 9–11、19 节），才评估薄小程序或 Capacitor；在那之前，优先修 **192/512 图标、apple-touch-icon、备份导出、微信逃生舱文案、中国探针/自定义域**——这些是产品/运维问题，不是必须换壳。

---

## 2. 仓库现状（已观察，代码级）

| 维度 | 证据 | 含义 |
|------|------|------|
| 形态 | `vite.config.ts`：`vite-plugin-pwa`，`display: standalone`，`lang: zh-CN`，预缓存 `races.json` | 正式 PWA 配置，非试水页 |
| **PWA 安装债** | manifest `icons` **仅** `/favicon.svg`（`sizes: any`），**无** Chrome 要求的 192×192 / 512×512 | 【事实】Chrome 安装条件要求 192+512 图标（见 F16）；当前可能无法稳定触发 `beforeinstallprompt` |
| 部署 | 生产 `https://marathon-pi-seven.vercel.app`（README / CONTEXT）；现场 200 | 境外边缘托管 |
| 数据 | Zustand + `persist` → localStorage；ICU API Key 仅会话（persist v4） | local-first；无账号体系 |
| 主路径 | 档案生成 → 训练本周视图 → 赛事收藏 → 导出 Sheet | 日活锚点是训练页，不是 GPS |
| 导出 | `export-fit.ts` / `export-ics.ts`：Blob + `<a download>`；ICU 经 Worker | 强依赖 **系统浏览器下载** 与 **外网 API** |
| 分享 | `navigator.share` / 剪贴板；`index.html` 有 OG meta | Web 分享，非微信开放标签 |
| 通知 | 无 Web Push、无后台同步、无 analytics | 留存靠主动回访 + ICS 可替代 |
| 团队约束 | 单仓 Vite/React；爬虫+发布已占带宽；ICU 幂等/Worker 债仍在 CONTEXT | 载体扩张挤占正确性预算 |

**产品问题 vs 载体问题**

| 痛点 | 更可能类型 | 说明 |
|------|------------|------|
| 首次路径/生成后落点 | 产品 | 审计已部分修 |
| 调整解释/导出过期 | 产品 | 2026-07-15 闭环已接线 |
| 无提醒导致忘打卡 | **混合** | 可推送，也可用 ICS |
| iOS「添加到主屏幕」难 | **载体+引导** | 摩擦真实；文案/二维码可缓解 |
| **manifest 缺 192/512** | **PWA 工程债** | 应在换壳前先修 |
| 微信内下载差 | **环境** | 换小程序也不等于自动修好 FIT→手表 |
| Vercel 中国慢/不稳 | **托管** | 官方无大陆节点；镜像≠App |
| 无跨设备同步 | 产品架构 | 换壳不自动解决 |

---

## 3. 官方一手事实表（来源审计后，检索日 2026-07-15）

| # | 主题 | 可验证事实 | 来源状态 |
|---|------|------------|----------|
| F1 | iOS Web Push | Home Screen web app 支持 Web Push（iOS 16.4+）；须用户手势请求权限；通知可进锁屏/通知中心；**Safari 标签页内不作为已安装推送主体**（须主屏幕 Web App） | 【事实】[WebKit 官方博文](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)；[Apple Developer: Sending web push…](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)（页面可达） |
| F2 | iOS PWA 安装 | 无浏览器一键 Install 弹窗；路径为 Share → Add to Home Screen；`display: standalone/fullscreen` 才以 web app 打开 | 【事实】[web.dev Installation — iOS/iPadOS](https://web.dev/learn/pwa/installation) |
| F3 | iOS 后台/静默 | Apple 文档强调 push 需经标准 Push/Notification/Service Worker；**静默后台同步作为「不展示通知」的常规能力：本轮未在 Apple 文档中找到「允许 silent push 长期刷新」的正面承诺** → 归 **【未知/应假设不依赖】** | 降级：不引用二手博客当事实 |
| F4 | Chromium 安装 | HTTPS + manifest（name、**192+512 icons**、start_url、display 合适）+ 用户参与启发式 + SW 等；可 `beforeinstallprompt` | 【事实】[web.dev install criteria](https://web.dev/articles/install-criteria)；[Chrome installable-manifest](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest) |
| F5 | Vercel 中国 | **无中国大陆 servers/CDN**；GFW 可能干扰含 `.vercel.app`；**不保证**大陆可用性；建议自定义域、减第三方、静态镜像/国内部署（国内需 ICP）；**换 App 壳不改变「内容仍从境外拉」除非换托管** | 【事实】[Vercel KB](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china) |
| F6 | 小程序注册/审核 | 须审核后**手动发布**；主体确认后不可随意变更等规则见官方介绍 | 【事实】[小程序介绍](https://developers.weixin.qq.com/miniprogram/introduction/) |
| F7 | web-view | 承载网页；**个人类型小程序暂不支持**；业务域名须后台配置；iframe 域名也要白名单 | 【事实】[web-view 组件](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html) |
| F8 | downloadFile | 可 HTTPS 下载到本地临时路径，单次最大 200MB | 【事实】[wx.downloadFile](https://developers.weixin.qq.com/miniprogram/dev/api/network/download/wx.downloadFile.html) |
| F9 | openDocument | **仅** doc/docx/xls/xlsx/ppt/pptx/**pdf**；**官方 fileType 列表不含 `.fit` / `.ics` / `.zip`** | 【事实】[wx.openDocument](https://developers.weixin.qq.com/miniprogram/dev/api/file/wx.openDocument.html) |
| F10 | 订阅消息 | 须 `requestSubscribeMessage`；一次性 + 长期订阅（长期受类目限制）；非任意 APNs 式 push | 【事实】[订阅消息指南](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html) |
| F11 | 小程序备案 | 微信侧提供备案流程/入口说明；与工信部 APP 备案体系衔接 | 【事实】[小程序备案操作指引](https://developers.weixin.qq.com/minigame/product/record/guidelines.html)（页面 200） |
| F12 | App 备案 | 工信部要求境内从事互联网信息服务的 APP 履行备案；**含基于开放平台的小程序等**（官方通知及解读） | 【事实】[工信部通知转载/解读](https://www.secrss.com/articles/57561)（原文体系入口 [beian.miit.gov.cn](https://beian.miit.gov.cn/)）；[腾讯云 APP 备案 FAQ](https://cloud.tencent.com/document/product/243/97691) |
| F13 | Capacitor | Web 技术构建跨端；**部署到 App Store 方式与普通原生 App 相同** | 【事实】[Capacitor 文档首页](https://capacitorjs.com/docs)；[Deploying to App Store](https://capacitorjs.com/docs/ios/deploying-to-app-store) |
| F14 | Apple 审核 | 完整 App Review Guidelines；功能不足/纯壳风险自担 | 【事实】[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) |
| F15 | 本产品导出 | Blob 下载路径在仓库可证 | 【事实】`src/utils/export-fit.ts`、`export-ics.ts` |
| F16 | 本产品图标 | 仅 SVG，缺 192/512 | 【事实】`vite.config.ts` vs F4 |
| F17 | 最酷多端 | 服务协议定义产品含 **网页 + App + 公众号 + 小程序 + H5**；主业赛事报名 | 【事实】[zuicool.com/terms](https://zuicool.com/terms) |
| F18 | Runna | 官网主推 iOS/Android App、手表同步、订阅定价；App Store/Play 外链 | 【事实】[runna.com](https://www.runna.com/)；[App Store id1594204443](https://apps.apple.com/us/app/runna-running-plans-coach/id1594204443) |
| F19 | Garmin Connect | App Store 在架（id583446403） | 【事实】[App Store](https://apps.apple.com/us/app/garmin-connect/id583446403) |
| F20 | COROS | App Store 在架（id1277625343，iTunes search 确认名称 COROS / COROS Wearables） | 【事实】[App Store id1277625343](https://apps.apple.com/us/app/coros/id1277625343) |
| F21 | Nike Run Club | App Store 在架（id387771637） | 【事实】[App Store](https://apps.apple.com/us/app/nike-run-club-running-coach/id387771637) |
| F22 | 悦跑圈 | App Store 在架（id881766160，卖家 Joyrun Tech） | 【事实】iTunes Search API + [App Store id881766160](https://apps.apple.com/cn/app/id881766160) |
| F23 | 咕咚 | App Store 在架（id453480684） | 【事实】[App Store](https://apps.apple.com/us/app/id453480684) |
| F24 | 运营规范/类目 | 小程序须符合类目与主体规范；资质虚假可拒 | 【事实】[运营规范](https://developers.weixin.qq.com/miniprogram/product/) |

### 3.1 损坏/降级来源处理（第一轮审计）

| 原表述/链接 | 处理 |
|-------------|------|
| 生产站 marathon-pi-seven | **修复确认**：现场 HTTP 200；报告中统一用完整 `https://marathon-pi-seven.vercel.app`，不使用截断链接 |
| 微信内 H5「官方禁止下载 FIT」 | **删除为事实**：改为【推断】+ 业界踩坑；**无**腾讯官方「禁止 FIT」API 声明 |
| 个人主体类目细节 | 保留原则性事实；**具体类目是否过审【未知】**，以提交时后台为准 |
| iOS 静默 push 细则 | **降级【未知】**：不把二手博客「不支持静默」写成 Apple 法律条文式事实；产品侧仍假设「不能依赖静默后台」 |
| 悦跑圈旧 id554541435 | **替换**为 iTunes 可查的 id881766160 |

### 3.2 推断 / 未知

**推断**

- **I1**：备赛执行场景（手表 + 日历 + 主屏幕工具）≠ 报名支付场景（微信）。
- **I2**：微信会话点开 `.vercel.app` 多停在 WeChat WebView → 安装与下载双劣。
- **I3**：小程序可做发现/订阅提醒；**不能**自然完成「生成 ZIP FIT → 用户导入 Garmin」全链路（F9 硬边界）。
- **I4**：Capacitor 改善「像 App / 商店分发 / 原生推送」，**不能免除**上架与备案，**不能自动**解决大陆托管。

**未知（禁止当事实）**

- 大陆真实 TTFB/失败率（无多省探针面板）。
- 个人/企业主体训练工具类目过审概率。
- 本产品若补齐 192/512 后的真实安装率。
- 竞品是否存在微信小程序：**未在官方页逐一点验「有/无小程序」的，一律写未知**（见第 6 节）。

---

## 4. 最强反方：「现在就应该做小程序 / Capacitor / 原生」

> 本节故意站在反对「继续纯 PWA」的立场，避免稻草人。

### 4.1 最有力证据（反方）

1. **中国获客在微信内**：分享/社群/公众号是低成本分发；系统浏览器是额外摩擦。
2. **iOS PWA 安装路径长**（F2）：无 Chrome 式一键 Install；主屏幕转化天然低。
3. **iOS Push 绑定主屏幕**（F1）：未安装则无可靠 Web Push → 留存靠自觉。
4. **竞品几乎全是原生 App 商店产品**（F18–F23）：用户心智「跑步工具=App」。
5. **订阅消息 / 原生推送** 对「每天开课」有直接叙事优势（F10 vs 无推送 PWA）。
6. **Capacitor 可复用大量 React/Vite UI**（F13）：并非从零写 Swift/Kotlin。
7. **商店信任与更新可见性**：评分、搜索、图标位置可能提升激活后留存（【推断】）。

### 4.2 成立前提（反方要同时成立）

| 前提 | 当前是否满足 |
|------|----------------|
| P1 已有可观微信入口流量，且浏览器导流转化失败 | **未知**（无 M6/转化基线） |
| P2 核心流失可归因于「装不了/没提醒/不在微信」，而非计划质量 | **未知** |
| P3 团队能承受审核/备案/双端证书，且不挤占引擎正确性 | **弱**：CONTEXT 仍有 Worker/ICU 债 |
| P4 小程序或 App 能承载 **FIT/ICS 执行闭环**，或团队接受「执行仍回 PWA」 | 小程序 **硬缺口**（F9）；App 可但成本高 |
| P5 托管可达性已解决或与壳一并解决 | 换壳 **不自动**解决 Vercel 中国问题（F5） |
| P6 愿意引入账号/云同步以避免 localStorage 分裂 | 现架构 **无账号** |

**反方在当前证据下：前提大面积未知或不满足 → 「现在就该做」不成立。**

### 4.3 若强行现在做：迁移路径（对当前仓库）

#### A. 完整小程序（不推荐为本体）

| 步骤 | 内容 | 风险 |
|------|------|------|
| 1 | 企业主体注册 + 类目 + **备案**（F11/F12） | 周期与材料；个人 web-view 不可用（F7） |
| 2 | 用原生小程序重写 UI，或 web-view 套 PWA | web-view 需业务域名；套壳体验/审核风险 |
| 3 | 计划状态：openid + 云存储，**不能**只靠 localStorage | 数据模型重做 |
| 4 | 导出：服务端生成文件 + downloadFile；openDocument **打不开 FIT/ICS** | 用户仍须转发文件到系统/邮箱/浏览器 |
| 5 | ICU：合法域名 request；密钥不能塞前端 | 与现 Worker 类似或更严 |
| 6 | 每次发版审核 | 迭代速度下降 |

**FIT/ICS 工作流自然完成？**
**否。【事实】openDocument 文件类型白名单无 FIT/ICS（F9）。** downloadFile 只能把文件留在微信沙箱；手表导入通常要 Garmin Connect 等 App 的文件导入路径——小程序不是自然终点。

#### B. Capacitor 混合

| 步骤 | 内容 | 风险 |
|------|------|------|
| 1 | `npm i @capacitor/core @capacitor/cli`；`npx cap add ios android` | 构建链膨胀 |
| 2 | 现有 Vite build 产物进 `webDir` | **UI/引擎大量可复用**【事实：Capacitor 定位即 Web native】 |
| 3 | Blob 下载在 WebView 中可能需 Filesystem/Share 插件 | 导出路径回归测 |
| 4 | 推送：Firebase/APNs 插件 + 服务端 | 运维面上升 |
| 5 | **仍须** Apple Developer / Google Play + 审核（F13/F14） | 与原生同等分发 |
| 6 | 若上国内应用商店：**App 备案**（F12） | 额外合规 |
| 7 | 若 App 内仍 load `marathon-pi-seven.vercel.app` | **大陆访问问题原样保留**（F5） |

**数据迁移**：localStorage 不会自动进 App 沙箱；须导出 JSON 备份或上云。**丢失风险：高**（若用户只装 App 不迁移）。

**真实维护成本（量级，非精确报价）**：双端证书与发版、审核驳回循环、插件版本跟进、商店元数据；小团队常见 **每周固定摩擦**，高峰期淹没功能迭代。

#### C. 完整原生

- 计划引擎双实现或嵌入 WebView 半吊子。
- HealthKit/GPS 若做，合规与权限面扩大。
- 对 Marathon 当前价值（非记录轨迹）**投入产出最差**。

### 4.4 反方为何仍不足（结论侧回应）

1. **没有基线指标** → 无法证明瓶颈在载体。
2. **执行闭环文件类型**在微信侧 **官方硬限制**（F9），小程序当本体会制造伪完成。
3. **托管问题与形态正交**（F5）：先镜像/自定义域，再谈壳。
4. **PWA 自身可安装性债未还**（F16）：先修 192/512 再宣称「PWA 装不了所以必须 App」。
5. 团队正确性预算（ICU/Worker/爬虫）优先于第二客户端。

---

## 5. 关键路径 × 载体适配

评分：A 合适 / B 可用 / C 勉强 / D 不适合。

| 路径环节 | 用户要完成的事 | PWA | 微信内 H5 | 小程序 | Capacitor | 原生 | 主推荐 |
|----------|----------------|-----|-----------|--------|-----------|------|--------|
| 发现赛事 | 搜城市/日期/状态 | A | B→C（访问） | B | A | A | **PWA** |
| 收藏/目标 | 我的赛事驱动计划 | A | B | B | A | A | **PWA** |
| 抽签/报名 | 跳转官方/最酷 | B | A | A | B | B | **外链** |
| 生成计划 | 档案 → 计划 | A | B | C | A | A | **PWA** |
| 每天看课表 | 本周/自适应 | A | C | B | A | A | **PWA** |
| 打卡/周报 | 本地 completions | A | C | B（需云身份） | A | A | **PWA** |
| 通知提醒 | 开课/周报 | C→B（须安装+服务端） | D | B（订阅次数/类目） | A | A | **先 ICS** |
| FIT/ICS 下载 | 导入手表/日历 | A（系统浏览器） | **D** | **C/D**（F9） | A | A | **PWA + 出微信** |
| Garmin/COROS/ICU | 执行层 | B（文件/桥） | D | D | B | A（SDK 贵） | **继续桥接** |

**路径结论**：主执行闭环留在 **系统浏览器 PWA**；微信只做 **获客与回流**。

---

## 6. 竞品载体审计（区分官网 / 商店 / 推断 / 未知）

| 产品 | 主载体（已确认） | 确认方式 | 核心原因（已确认 vs 推断） | 微信小程序 |
|------|------------------|----------|---------------------------|------------|
| **Runna** | iOS + Android 原生 App；营销站 + 订阅 | 【官网】App Store/Play 徽章与定价；【商店】id1594204443 | 【官网确认】个性化计划、**手表同步实时配速**、教练品牌；【推断】付费与设备集成驱动原生 | **未知**（官网未以小程序为主 CTA） |
| **Garmin Connect** | 原生 App（硬件生态） | 【商店】id583446403；官网 connect.garmin.com | 【推断/业界常识】硬件绑定、固件、传感器、云同步——必须原生；非「计划网页」竞品同位 | **未知** |
| **COROS** | 原生 App | 【商店】id1277625343 | 同硬件公司逻辑【推断】 | **未知** |
| **Nike Run Club** | 原生 App | 【商店】id387771637；Nike NRC 落地页 | 【推断】GPS、音频教练、品牌社区 | **未知** |
| **悦跑圈** | 原生 App | 【商店】id881766160；官网 thejoyrun.com | 【推断】GPS 轨迹、社交、线上赛沉淀在 App | **未知**（未打开微信搜一搜实机确认） |
| **咕咚** | 原生 App | 【商店】id453480684；关于页 | 【商店文案】运动记录+赛事活动平台 | **未知** |
| **最酷** | **Web + App + 公众号 + 小程序 + H5** | 【官网协议明确列举】zuicool.com/terms | 【协议确认】主业 **报名交易**；微信是支付与触达场景——与 Marathon 工具定位不同 | **有**（协议点名小程序名） |

**对 Marathon 的启示（非抄壳）**

- 学最酷的 **「交易/传播在微信，深度工具可在 Web」** 分工，不学立刻全端矩阵。
- 学 Runna 的 **计划+设备**，但用 **FIT/ICU 桥** 代替原生 SDK（已选路径）。
- 不要学悦跑圈做「又一个跑步记录 App」。

---

## 7. 载体能力缺口表（相对当前代码真实需要）

| 能力 | 当前实现 | 载体缺口（PWA 现状） | **当前是否真需要？** | 说明 |
|------|----------|----------------------|----------------------|------|
| 通知 | 无 | iOS 须主屏幕+权限；Android 较好 | **弱需要** | ICS 已可覆盖日历提醒；无基线证明通知是留存主因 |
| 后台 | 无 SW 业务同步 | iOS 后台弱；勿依赖静默 | **不需要** | 无实时协作/聊天 |
| GPS/HealthKit | 无 | Web 定位弱、HealthKit 无 | **不需要** | 产品不做轨迹记录 |
| 账号云同步 | 无；localStorage | 多端必裂 | **阶段不需要** | 单机计划工具；上第二端才变刚需 |
| 文件下载 | Blob download | 微信 WebView **高风险** | **刚需** | FIT/ICS 是执行闭环；环境问题用「出微信」解 |
| 第三方 API | ICU + Worker | CORS/密钥 | **刚需** | 与是否原生无关 |
| 分享/拉新 | share/剪贴板/OG | 微信内深度分享弱 | **中等** | 文案+链接够用；未证明裂变是 KPI |
| 离线 | SW 预缓存 races + 静态 | 计划在 localStorage，可读 | **中等** | 已部分具备；非换壳理由 |
| 更新 | `registerType: 'autoUpdate'` | PWA 更新较顺 | **已满足** | App 商店审核更慢 |
| 数据丢失 | 清缓存/换机丢 | 无备份入口 | **中等风险** | 优先 **JSON 备份导出**（仍 PWA），非先做 App |
| 可安装性 | 仅 SVG 图标 | **Chrome 192/512 缺口** | **刚需修复** | 形态内修复，非换形态 |

---

## 8. 加权决策矩阵 + 敏感性

### 8.1 权重（当前阶段：验证产品与可达，非做平台）

| 维度 | 权重 | 为什么符合当前阶段 |
|------|------|--------------------|
| W1 开发维护（小团队） | **25%** | 单人/小团队；正确性债优先 |
| W2 激活与主路径完整（生成→导出） | **20%** | 没有闭环就没有产品 |
| W3 中国可达/打开成功 | **15%** | 目标用户中文跑者；托管是现实约束 |
| W4 留存手段（回访） | **10%** | 重要但可用 ICS/习惯，非唯推送 |
| W5 获客（微信/商店） | **10%** | 有流量才谈；当前无量级证明 |
| W6 合规与分发摩擦 | **10%** | 备案/审核是真实日历时间 |
| W7 设备能力（推送/后台/GPS） | **5%** | 当前功能集几乎不用 GPS/后台 |
| W8 可收费性 | **5%** | 尚未到付费验证主线 |

**权重和校验**：25+20+15+10+10+10+5+5 = **100%**【事实：算术】。

**总分** = Σ (分数 1–5 × 权重)。5=最好。**分数是专家判断，不是用户数据。**

| 维度 | A 纯 PWA | B PWA+社交入口 | C PWA+薄小程序 | D Capacitor | E 原生 | 分数与证据对齐说明 |
|------|----------|----------------|----------------|-------------|--------|-------------------|
| W1 维护 25% | 5 | 4 | 2 | 2 | 1 | A=单仓 Vite；C/D/E=审核/双端/重写 |
| W2 激活闭环 20% | 5 | 4 | 3 | 4 | 4 | A 已有 FIT/ICS Blob；C 受 openDocument 限制 |
| W3 可达 15% | 2* | 2* | 3† | 2* | 2* | 仍 Vercel 则壳不自动加分 |
| W4 留存 10% | 3 | 3 | 3 | 4 | 5 | A 有 ICS 路径；尚无 Push 实现 |
| W5 获客 10% | 2 | 4 | 4 | 3 | 3 | B/C 微信入口更强（推断） |
| W6 合规 10% | 4 | 3 | 2 | 1 | 1 | App/小程序备案摩擦 |
| W7 设备 5% | 2 | 2 | 2 | 4 | 5 | 当前产品几乎不需要 GPS |
| W8 收费 5% | 3 | 3 | 4 | 4 | 4 | 未验证；略偏向商店支付 |
| **加权总分（第三轮重算）** | **3.70** | **3.35** | **2.75** | **2.80** | **2.70** | 见下展开 |

**展开（第三轮修正第二轮累加误差）**

| 方案 | 计算 | 第二轮曾写 | 第三轮 |
|------|------|------------|--------|
| A | 5·0.25+5·0.20+2·0.15+3·0.10+2·0.10+4·0.10+2·0.05+3·0.05 | 3.65 | **3.70** |
| B | 4·0.25+4·0.20+2·0.15+3·0.10+4·0.10+3·0.10+2·0.05+3·0.05 | 3.40 | **3.35** |
| C | 2·0.25+3·0.20+3·0.15+3·0.10+4·0.10+2·0.10+2·0.05+4·0.05 | 2.75 | **2.75** |
| D | 2·0.25+4·0.20+2·0.15+4·0.10+3·0.10+1·0.10+4·0.05+4·0.05 | 2.75 | **2.80** |
| E | 1·0.25+4·0.20+2·0.15+5·0.10+3·0.10+1·0.10+5·0.05+4·0.05 | 2.55 | **2.70** |

\* 可达分：若仍用 Vercel 无镜像，壳层不自动加分（F5 / Vercel KB）。
† 薄小程序：若静态/活动页在微信 CDN，**入口**可达更好；**PWA 本体**仍看托管。

**现阶段排序（修正后）**：**A > B ≫ D ≳ C > E**（D 略高于 C，因导出闭环可保留；差距 0.05 在专家噪声内）。

### 8.2 敏感性：什么权重变化会让谁胜出

> **第四轮独立复算**：基线总分 A=3.70 / B=3.35 / C=2.75 / D=2.80 / E=2.70 **正确**。
> 第三轮 S1 写「W5=30%、W1=15%、其余不变」→ 权重和=**110%**（无效）；且 A/B/C 与 D/E 似混用了未归一化/归一化两套数。
> 第三轮 S2 的 B 曾写 3.15、C 曾写 2.85 → 复算应为 **B=3.10、C=2.75**。下表为**修正后**有效权重（和=100%）结果。
> **评分是决策工具，不是用户证据。**

| 情景 | 权重扰动（和=100%） | 重算结果 | 赢家是否改变 |
|------|---------------------|----------|--------------|
| S1 微信获客压倒 | W1=15%、W5=30%；其余六维按原比例缩至合计 55% | A=3.25；**B=3.45**；C=3.07；D=2.89；E=2.87 | **是 → B**（轻社交入口，非完整小程序） |
| S2 通知=留存唯一解 | W1=15,W2=10,W3=10,W4=25,W5=10,W6=10,W7=15,W8=5 | A=3.25；B=3.10；C=2.75；D=3.10；**E=3.35** | **是 → E**（极端；**无用户数据支撑**） |
| S3 合规不可承受 | W6=25%，W1=20%，W2=15%，其余同比例压至 100% | A≈3.68；B≈3.26；C≈2.64；D≈2.49；E≈2.43 | 否，**A 更稳** |
| S4 已有付费+企业主体 | W8=15%，W5=15%，W1=20%；其余同比例压至 100% | A=3.50；B=3.35；C=2.98；D=2.95；E=2.88 | 否，A 仍最高（未改 C 的 W2 闭环分） |
| S5 必须做 GPS 记录 | 产品定义变 | **E**——新产品，非本报告范围 | 是，但越界 |
| S6 微信漏斗已证明失败 | 同 S1 权重；C 的 W2 从 3→4 | A=3.25；**B=3.45**；C=3.23；D=2.89；E=2.87 | 仍 B；C 逼近 A 但未超 B；**须真实 M6/转化** |
| S7 安装债已修 + Push/ICS 双失败 | 同 S2；A/B 的 W4 从 3→2 | A=3.00；B=2.85；C=2.75；D=3.10；**E=3.35** | **D/E 才有 spike 资格**；仍须 WAU |

**关键规则（相对；基线未建前禁止当绝对 KPI）**
- 仅当 **W5 情景被数据证实**（高微信占比 + 浏览器转化失败）才认真排期 **B 强化或 C 薄入口**。
- 仅当 **安装债已修** 且 **ICS + Web Push 实验失败** 且 **产品已被用**，才认真排期 **D**。
- **S2/S7 让 E 胜出不构成开工授权**——缺少用户样本时，高 W4/W7 是假设不是证据。

---

## 9. 三个明确情境（触发 / 最小方案 / 停止）

> 所有绝对人数阈值须先建立基线；下列用 **相对规则与决策公式**。

### 情境 1：保持 PWA（默认）

| 项 | 内容 |
|----|------|
| **触发（保持）** | 默认；或：M1 达标且载体归因投诉 < 阈值 |
| **最小方案** | 修 192/512 图标；微信逃生舱文案；ICS 引导；自定义域评估；中国探针；隐私友好事件（规格见原 9.2，**本报告不写代码**） |
| **停止条件（退出默认）** | 见情境 2/3 触发；或产品方向改为 GPS 社交 |
| **决策公式** | `KeepPWA = ¬TriggerThinMP ∧ ¬TriggerCap` |

### 情境 2：增加薄小程序（仅入口，非第二训练台）

| 项 | 内容 |
|----|------|
| **触发（须同时）** | (1) 连续 ≥4 周有稳定 WAU 基线后，`M6_wechat / M_open ≥ 0.40`；(2) 微信会话→系统浏览器转化 `M_browser_from_wechat / M6 < 0.20`（基线建立后的相对阈值）；(3) 访谈/反馈中 ≥30% 主因是「微信里不能用/打不开」，非计划差；(4) 企业主体+备案可接受 |
| **最小方案** | 3–5 页：介绍 + 生成计划 CTA **外链浏览器** + 订阅消息「提醒去浏览器打开」；**禁止**在小程序内做 FIT 主路径 |
| **停止条件** | 上线 6 周后 `M_browser_from_wechat` 无提升；或审核/备案耗尽迭代；或维护超过 0.5 人周/周且无获客增益 |
| **决策公式** | `ThinMP = (M6_share≥0.4) ∧ (conv_browser<0.2) ∧ (carrier_blame≥0.3) ∧ ready_compliance` |

### 情境 3：转 Capacitor / 原生

| 项 | 内容 |
|----|------|
| **触发（须同时）** | (1) 已修 PWA 安装债后，`M5_standalone` 仍极低（相对：已展示引导的生成用户中 standalone 占比持续低于内部基线的一半，**基线未建前不启动**）；(2) ICS 采用率不足且 Web Push 实验（仅已安装）覆盖核心提醒失败；(3) WAU 已证明产品有人用；(4) 接受商店+备案+双端 |
| **最小方案** | Capacitor 包现有 Web；导出用 Share/Filesystem；**先不要** HealthKit/GPS；国内店另议 |
| **停止条件** | 审核连续失败；或维护挤占引擎；或安装后留存不优于 PWA standalone 用户 |
| **决策公式** | `Cap = product_proven ∧ install_fix_fixed ∧ push_or_ics_failed ∧ team_capacity` |
| **原生** | 仅当产品定义变为硬件级能力时；否则不进入 90 天 |

**中国可达单独公式（优先镜像，不是 App）**
`MirrorFirst = (M1_mainland < 0.95 ∨ P95_load > 5s) lasting ≥14d ∧ custom_domain_tried`
→ 国内静态镜像；**¬** 自动 `Cap`。

---

## 10. 90 天最小可执行方案（三阶段；先内债与测量，再谈壳）

> 原则：**先修 PWA 内债和测量 → 再验证微信导流 → 再做是否换壳决策**。每阶段有明确产物、判断门、停止条件。
> **本研究无真实用户数据；任何「≥X%」触发式数字须先有 ≥4 周基线。**

### 阶段 0（Day 0–30）：PWA 内债 + 测量骨架

| 项 | 内容 |
|----|------|
| **产物** | ① 192×192 + 512×512 PNG（及可选 maskable）清单与实施 PR 标记；② `apple-touch-icon` 清单；③ M1–M8 事件字典（可先手工表）；④ 中国可达探针表格（多出口 URL 状态）；⑤ 微信/分享「用浏览器打开」文案定稿；⑥ ICS 提醒引导定稿；⑦ JSON 备份/恢复规格（可不写代码，但规格必须有） |
| **判断门** | 安装债是否**可修复**已文档化；事件口径是否可复现；是否仍把「装不了」归因于形态而非图标 |
| **停止条件** | 若团队连 192/512 与文案都无法排期 → **停止一切换壳讨论**（优先级失真） |
| **明确不做** | 小程序工程、Capacitor init、Push 服务端 |

### 阶段 1（Day 30–60）：读数 + 微信导流验证

| 项 | 内容 |
|----|------|
| **产物** | ① 4 周 M1/M4/M5/M6/M7 读数（哪怕 n 很小也要标注 n）；② 微信入口文案 A/B 或前后对比笔记；③ 若 M1 差：自定义域/镜像评估一页纸；④ 第 19 节用户研究 ≥6 人分层访谈纪要（可选但强烈建议） |
| **判断门** | `MirrorFirst` 是否触发；`M6 高 ∧ M7 低` 是否成立；计划质量是否才是 M4 主因 |
| **停止条件** | M4 低且访谈主因是计划/可信度 → **停形态讨论，回产品**；M1 极差且拒绝镜像评估 → 不进入壳评估（先托管） |
| **明确不做** | 完整小程序、商店提交 |

### 阶段 2（Day 60–90）：换壳决策门禁

| 项 | 内容 |
|----|------|
| **产物** | 「触发状态」一页纸：套用第 9 节公式；若 ThinMP 或 Cap 触发则最小报价+工期；否则 **锁定再 90 天 PWA** |
| **判断门** | `ThinMP` 四条件同时；或 `Cap` 四条件同时（均要求基线） |
| **停止条件** | 触发后开工 6 周无获客/留存增益；或审核/备案耗尽迭代；或维护 >0.5 人周/周且无增益 |
| **明确不做** | 完整训练小程序、uni-app 重写、原生 GPS、为载体强制登录、微信内 FIT 黑科技当主路径 |

---

## 11. 可观测指标（保留并收紧解读）

| ID | 指标 | 用于 |
|----|------|------|
| M1 | 会话打开成功率 | 托管/中国可达 |
| M2 | 计划生成率 | 激活 |
| M3 | 训练页交互占比 | 核心使用 |
| M4 | D1/D7 回访 | 留存 |
| M5 | standalone 占比 | 安装代理 |
| M6 | 微信 UA 占比 | 入口结构 |
| M7 | 导出意图成功率 | 设备闭环 |
| M8 | 计划「曾有后无」代理 | 存储丢失 |

**解读（防误判）**

- 仅 M4 低 → 先计划价值与提醒，不立刻 App
- M6 高且 M7 低 → 微信容器，先浏览器引导
- M1 差 → 镜像优先
- M5 低但 M4 高 → 安装非留存瓶颈
- M5 低且 M4 低且用户要通知 → Web Push / 再评估壳

隐私友好最小方案规格同第一轮（client_id、自有聚合、可关）；**本报告仍不实施代码**。

---

## 12. 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 大陆访问 Vercel | 获客回访双杀 | 探针 → 自定义域 → 国内镜像 |
| 活在微信 WebView | 导出失败归因产品 | 强引导 + UA 分指标 |
| 过早小程序 | 分叉+审核+FIT 伪完成 | 触发门禁；openDocument 硬限制写进决策 |
| 过早 App | 合规拖死引擎 | 同上 |
| localStorage 丢失 | 信任崩塌 | M8；JSON 备份（PWA 内） |
| 用缺图标解释「PWA 不行」 | 错误换壳 | 先修 F16 |
| 换壳幻想解决托管 | 浪费季度 | F5 正交原则 |

---

## 13. 来源列表（≥24，检索日 2026-07-15）

### 官方 / 平台一手

1. Apple — Sending web push in web apps/browsers: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
2. WebKit — Web Push for Web Apps on iOS/iPadOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
3. web.dev — PWA Installation: https://web.dev/learn/pwa/installation
4. web.dev — Install criteria: https://web.dev/articles/install-criteria
5. Chrome — Installable manifest: https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest
6. Vercel KB — Mainland China: https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china
7. 微信 — 小程序介绍: https://developers.weixin.qq.com/miniprogram/introduction/
8. 微信 — web-view: https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html
9. 微信 — downloadFile: https://developers.weixin.qq.com/miniprogram/dev/api/network/download/wx.downloadFile.html
10. 微信 — openDocument: https://developers.weixin.qq.com/miniprogram/dev/api/file/wx.openDocument.html
11. 微信 — 订阅消息: https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html
12. 微信 — 运营规范: https://developers.weixin.qq.com/miniprogram/product/
13. 微信 — 小程序备案指引: https://developers.weixin.qq.com/minigame/product/record/guidelines.html
14. 工信部备案入口: https://beian.miit.gov.cn/
15. 工信部 APP 备案通知（公开转载/解读）: https://www.secrss.com/articles/57561
16. 腾讯云 — APP 备案 FAQ: https://cloud.tencent.com/document/product/243/97691
17. Capacitor Docs: https://capacitorjs.com/docs
18. Capacitor — iOS App Store: https://capacitorjs.com/docs/ios/deploying-to-app-store
19. Apple — App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/

### 竞品官方 / 商店

20. Runna 官网: https://www.runna.com/
21. Runna App Store: https://apps.apple.com/us/app/runna-running-plans-coach/id1594204443
22. 最酷服务协议（多端）: https://zuicool.com/terms
23. Garmin Connect App Store: https://apps.apple.com/us/app/garmin-connect/id583446403
24. COROS App Store: https://apps.apple.com/us/app/coros/id1277625343
25. Nike Run Club App Store: https://apps.apple.com/us/app/nike-run-club-running-coach/id387771637
26. 悦跑圈 App Store: https://apps.apple.com/cn/app/id881766160
27. 咕咚 App Store: https://apps.apple.com/us/app/id453480684
28. 悦跑圈官网: https://www.thejoyrun.com/
29. 咕咚关于: https://www.codoon.com/h5/codoon-welcome/about.html

### 仓库内证

30. `vite.config.ts`、`src/store/useStore.ts`、`src/utils/export-fit.ts`、`src/utils/export-ics.ts`、`src/utils/intervals-icu.ts`、`CONTEXT.md`、`README.md`
31. 生产现场：`https://marathon-pi-seven.vercel.app`（2026-07-15 HTTP 200）

---

## 14. 附录：仓库能力映射

| 能力 | 形态含义 |
|------|----------|
| VitePWA + races 预缓存 | 离线赛事壳；主屏幕叙事 |
| 仅 SVG icon | **先修再谈「PWA 装不了」** |
| localStorage persist | 第二端必须先同步方案 |
| FIT/ICS Blob | 绑定系统浏览器；小程序 openDocument 不支持 |
| ICU + Worker | Web 调云 API；原生壳不减少 Worker |
| 无账号 | 现阶段正确；上小程序/App 倒逼身份 |

---

## 15. 最终复核清单

| 检查项 | 结果 |
|--------|------|
| 新证据是否推翻主结论？ | **否** |
| 最强反方是否达到开工门槛？ | **否**（第 21–22、24 节） |
| 矩阵算术 | 基线正确；敏感性 S1/S2 第四轮已修；排序未改默认赢家 A |
| 有无真实用户数据？ | **无**；阈值仅相对规则；分数≠用户证据 |
| 绝对化语言 | 「唯一产品」→「90 天唯一执行本体」 |
| CONTEXT 一句结论 | 与第 23/28 节一致 |

**文档有效期**：以 M1/M4/M5/M6 复核为准；触发第 9 节公式前 **不并行** 第二执行客户端。长期形态不在本报告承诺范围。

---

## 16. 外部链接可访问性与主张匹配审计（第三轮）

> 方法：2026-07-15 用脚本对 ≥37 个 URL 发 GET（User-Agent 研究探针），记录 HTTP 状态；对关键页用内容抓取核对标题/主张。
> 标签：**已验证** = 页面打开且内容支持就近主张；**弱支持** = 打开但只能部分支持；**访问受限** = 非 200/超时；**二手** = 非原始监管机关正文；**仅线索** = 需实机/登录后台才能最终确认。

### 16.1 逐条结果（核心 ≥25）

| # | URL / 主题 | HTTP | 主张匹配 | 标签 |
|---|------------|------|----------|------|
| 1 | webkit.org Web Push iOS/iPadOS | 200 | 支持：HSWA 16.4+ Push；须用户手势；Badging；manifest display standalone/fullscreen 才是 web app；第三方浏览器可 Add to Home Screen | **已验证** |
| 2 | Apple — Sending web push in web apps | 200 | 支持 Web Push 官方文档入口 | **已验证** |
| 3 | web.dev learn/pwa/installation | 200 | 支持安装路径与 iOS 差异叙述 | **已验证** |
| 4 | web.dev install-criteria | 200 | 支持：HTTPS、name/short_name、**192+512 icons**、start_url、display 枚举、参与启发式、`beforeinstallprompt` | **已验证** |
| 5 | Chrome Lighthouse installable-manifest | 200 | 支持 192/512 等；并注明 Lighthouse PWA 检测**已弃用**、规则在演进 | **已验证**（需读更新博客） |
| 6 | Chrome blog update-install-criteria | 200 | 支持：SW fetch 要求对菜单安装已移除（M108/M112）；**仍强烈建议** icons 等字段；未来或实验放宽 manifest 字段 | **已验证**（规则变化注意） |
| 7 | Vercel KB Mainland China | 200 | 支持：无大陆节点；GFW；不保证可用；自定义域/镜像/ICP | **已验证** |
| 8 | 微信 小程序介绍 | 200 | 支持审核发布等产品定位 | **已验证** |
| 9 | 微信 web-view | 200 | 支持：**个人类型暂不支持**；业务域名；iframe 白名单 | **已验证** |
| 10 | 微信 downloadFile | 200 | 支持：HTTPS 下到**临时路径**，单次最大 200MB；**不等于**系统文件选择器/手表导入 | **已验证** |
| 11 | 微信 openDocument | 200 | 支持 fileType **仅** doc/docx/xls/xlsx/ppt/pptx/pdf；**无 FIT/ICS/ZIP** | **已验证** |
| 12 | 微信 FileSystemManager.saveFile | 200 | 支持：临时文件→本地用户目录（沙箱内）；旧 `wx.saveFile` 直链 404 | **已验证**（链接已修正） |
| 13 | 微信 wx.saveFileToDisk | 200 | 支持另存能力（版本/场景受限，见官方页） | **弱支持**（未在本产品场景实测） |
| 14 | 微信 订阅消息指南 | 200 | 支持 requestSubscribeMessage；非任意 APNs | **已验证** |
| 15 | 微信 运营规范 | 200 | 支持类目/主体规范原则 | **已验证** |
| 16 | 微信 小程序备案指引 | 200 | 支持备案操作入口说明 | **已验证** |
| 17 | beian.miit.gov.cn | **521** | 工信部备案入口本轮探针失败 | **访问受限**；相关性见 16.2 |
| 18 | miit.gov.cn 门户 | 200 | 部委门户可达，非 APP 备案细则正文 | **弱支持** |
| 19 | secrss 工信部 APP 备案通知转载 | 200 | 转载解读；含 APP/小程序等范围叙述 | **二手**（监管原文以 MIIT 为准） |
| 20 | 腾讯云 APP 备案 FAQ | 200 | 云厂商合规 FAQ，说明何时相关 | **二手/弱支持**（非法律意见） |
| 21 | Capacitor docs 首页 | 200 | Web→原生运行时定位 | **已验证** |
| 22 | Capacitor Deploying to App Store | 200 | 上架路径与原生同等 | **已验证** |
| 23 | Capacitor Filesystem API | 200 | 可写 Documents 等；iOS 需 UIFileSharing 等才出现在「文件」App | **已验证** |
| 24 | Capacitor Push Notifications | 200 | APNs/FCM；**不支持 iOS silent push**（官方写明） | **已验证** |
| 25 | Capacitor Share | 200 | 可分享文件到其他 App——对 FIT 比小程序更自然 | **已验证** |
| 26 | Apple App Review Guidelines | 200 | 审核总则存在 | **已验证**（未逐条诉讼级精读） |
| 27 | Runna 官网 + App Store | 200 | 主推原生 App/订阅 | **已验证** |
| 28 | zuicool.com/terms | 200 | 协议列举 Web+App+公众号+小程序+H5 | **已验证** |
| 29–33 | Garmin/COROS/NRC/悦跑圈/咕咚 App Store | 200 | 在架原生 App | **已验证** |
| 34–35 | 悦跑圈官网 / 咕咚关于 | 200 | 品牌站；**未**在本轮打开微信搜一搜确认小程序 | 小程序有无：**未知/仅线索** |
| 36 | 生产站 + manifest | 200 | 标题与 SVG-only icons 与仓库一致 | **已验证** |
| 37 | 旧链接 `wx.saveFile.html` / 错误 Chrome install 路径 | 404 | 报告内已替换为有效文档 | **已修复** |

### 16.2 MIIT / 备案：何时相关（**不做法律建议**）

| 动作 | 是否可能触及备案/ICP 讨论 | 说明 |
|------|---------------------------|------|
| 仅境外 Vercel 提供工具站 | 以主体与用户触达方式而定 | 本报告**不给法律结论** |
| 国内镜像/国内服务器对公众提供 | 通常进入 ICP/属地合规讨论 | Vercel KB 亦指向 ICP |
| 上架 App 商店（含 Capacitor） | APP 备案体系相关（二手通知+云厂商 FAQ） | 工信部入口本轮 521，**原文以官方为准** |
| 发布微信小程序 | 微信备案指引相关 | 已验证操作指引页 |
| 本报告立场 | 只判断「换壳会引入额外合规日历」 | **非律师意见** |

### 16.3 Markdown 链接修复记录

| 问题 | 处理 |
|------|------|
| `wx.saveFile` 直链 404 | 改为 `FileSystemManager.saveFile` + `saveFileToDisk` |
| Chrome PWA install 错误路径 404 | 改为 `update-install-criteria` + web.dev install-criteria |
| 生产 URL 截断 | 全文统一完整 HTTPS |
| MIIT 入口 521 | 标访问受限，保留 URL，旁注二手转载 |

---

## 17. 当前 PWA 真实技术审计（只读；不改代码）

### 17.1 已实现（【事实】路径）

| 项 | 证据 | 状态 |
|----|------|------|
| manifest 基本字段 | `vite.config.ts` / 生产 `manifest.webmanifest`：name、short_name、start_url `/`、scope `/`、display `standalone`、lang `zh-CN`、theme/background | 已有 |
| SW 注册 | `dist/registerSW.js` → `/sw.js` scope `/`；`registerType: 'autoUpdate'`；`skipWaiting` + `clientsClaim` | 已有 |
| 预缓存 | SW precache：index/html/js/css、favicon.svg、races.json、manifest | 已有 |
| races 运行时缓存 | NetworkFirst，`races-data`，7 天 | 已有 |
| iOS meta | `index.html`：`apple-mobile-web-app-capable=yes`、status-bar、title；`theme-color`；`mobile-web-app-capable` | 部分 |
| 分享 | `CalendarView.tsx`：`navigator.share({title,text})`；失败可剪贴板路径（同文件） | 文本分享，非文件 |
| 文件下载 | `export-fit.ts` / `export-ics.ts`：Blob + `<a download>` + objectURL | 系统浏览器路径 |
| 数据持久化 | `useStore.ts` zustand `persist` name=`marathon-training-storage` v4；partialize 剔除 `icuApiKey` | localStorage |
| ICU 密钥生命周期 | 仅会话内存；merge 强制 `icuApiKey: ''` | 已加固 |

### 17.2 形态问题 vs 实现未做完（必须分开）

| 问题 | 类型 | 证据 | PWA 形态能否解决 | 备注 |
|------|------|------|------------------|------|
| 仅 SVG icon，无 192/512 PNG | **实现内债** | `vite.config.ts` icons；生产 manifest 同 | **能**（补资源即可） | 与 web.dev 现行 criteria 不一致；Chrome 规则在演进但仍强烈建议 icons |
| 无 `apple-touch-icon` link | **实现内债** | `index.html` 无 apple-touch-icon | **能** | WebKit：apple-touch-icon 优先于 manifest icons |
| 无 `og:image` | **实现内债** | `index.html` 仅 og title/desc/type | **能** | 影响微信/社交卡片，非换壳理由 |
| 无安装引导 UI / 未监听 `beforeinstallprompt` | **实现内债** | 源码无匹配 | **能** | 即使图标修好也可能低转化 |
| 无计划 JSON 备份/恢复 | **实现内债** | store 仅 persist；无 export state | **能** | 清缓存/换机高风险 |
| 无 Web Push / 无推送服务端 | **产品未做**（非形态禁止） | 无 SW push 业务逻辑 | **部分能**（须 HSWA + 权限 + 服务端） | iOS 须主屏幕 Web App |
| 无跨设备同步/账号 | **架构选择** | local-first | 壳不自动解决 | 上第二端才变刚需 |
| 微信内 Blob 下载差 | **环境** | 非仓库可控 | PWA **不能在微信内变好** | 应用「出微信」而非换小程序当执行台 |
| Vercel 中国慢 | **托管** | F5 | 换壳不自动解决 | 镜像/自定义域 |
| iOS 无一键 Install | **形态摩擦** | WebKit/web.dev | 部分缓解（引导）不能消灭 | 真要零摩擦才评估壳 |
| SW 更新依赖 autoUpdate | **已做策略** | vite-plugin-pwa | 满足迭代 | 非问题 |
| 离线：静态+races 可；计划靠 localStorage | **部分满足** | SW + store | 形态内可加强备份 | 非换壳 |

### 17.3 数据生命周期（localStorage）

| 事件 | 后果 | 现有缓解 |
|------|------|----------|
| 用户清站点数据 / 浏览器「清除缓存」 | 计划/打卡/收藏丢失 | **无**备份入口 |
| 换机 / 换浏览器 | 不迁移 | **无** |
| 卸载 PWA 后清数据 | 依赖浏览器实现 | **未知**（未实测） |
| persist 版本迁移 | v4 migrate 剥 key、规范化 exportSync | 有 |
| ICU API Key | 不进 localStorage | 有 |
| 会话关闭 | Key 清空；计划仍在 | 符合安全设计 |

---

## 18. 官方来源补充精读（第三轮）

### 18.1 Apple / WebKit（HSWA / Push / Badge / 安装）

【事实·WebKit 2023-02-16 博文】
- iOS/iPadOS **16.4+**：Home Screen web apps 支持 **Web Push**（Push API + Notifications + Service Worker）。
- 权限请求须 **用户直接手势**（如点订阅按钮）。
- 通知进锁屏/通知中心/配对 Apple Watch；与 Focus 集成。
- **Badging API**：`setAppBadge` / `clearAppBadge`；展示权限与通知权限路径一致。
- manifest `display` 为 `standalone` 或 `fullscreen` 时，主屏幕图标以 **web app** 打开；否则更像书签。
- 安装入口：Share → **Add to Home Screen**；16.4 起第三方浏览器亦可提供该入口（需 web-browser entitlement 等）。
- 图标：manifest icons（自 15.4）或 **apple-touch-icon**（后者优先）。

【未知】静默长期后台同步：本轮**未**在 Apple 文档找到「允许不展示通知的 silent push 作为常规能力」的正面承诺 → 产品假设 **不依赖**。

### 18.2 Chrome / web.dev 可安装性（含版本变化）

【事实·web.dev install-criteria，页脚 2024-09-19】
触发 `beforeinstallprompt` / 浏览器安装推广仍列：未安装、参与启发式（点击+约 30s）、HTTPS、manifest 含 name/short_name、**192 与 512 图标**、start_url、display 四选一、prefer_related_applications 非 true。

【事实·Chrome blog update-install-criteria】
- **已移除**「必须有实现 fetch 的 SW」作为**菜单安装**条件（Android Chrome 108 / Desktop 112）。
- 自动安装提示算法一度仍看 fetch handler；Chrome 在实验简化。
- Lighthouse 完整 PWA 类别与安装 criteria 解耦/移除方向。
- **仍强烈建议** icons（含 maskable）、name、start_url、display。

【对 Marathon 的含义】
缺 192/512 **不能**再简单说「Chrome 绝对禁止安装」（规则在松），但：**不能**把「只有 SVG」说成已满足现行 web.dev 文档与最佳实践；DevTools/启发式安装体验仍可能差。**先补图标再宣称 PWA 安装失败。**

### 18.3 微信文件能力：精确区分三层

| 层 | API | 能做什么 | 不能做什么 |
|----|-----|----------|------------|
| L1 下载临时文件 | `wx.downloadFile` | HTTPS → tempFilePath，≤200MB | 不保证用户在系统文件 App 里看到；不保证 Garmin 能读 |
| L2 持久化到微信沙箱 | `FileSystemManager.saveFile` | 临时→本地用户目录 | 仍在微信沙箱；**不是**系统「下载文件夹」的充分条件 |
| L3 打开预览 | `wx.openDocument` | 办公文档 + **pdf** | **无** fit/ics/zip |
| L4 用户自然交给手表/日历 | （无官方一键） | 可能经转发/另存/电脑中转 | **不是**产品默认可依赖路径 |

**禁止错误推断**：从 openDocument 不支持 **不能**推出「downloadFile 不可能」——临时文件**可以**下载；**能**推出的是「小程序内**自然完成** FIT→Garmin / ICS→系统日历」**不成立**。

### 18.4 Capacitor：能解决 / 不能解决

| 能 | 不能 |
|----|------|
| 复用大量 Web UI；商店图标位；原生推送插件（FCM/APNs） | 免除 App Review / 开发者账号 |
| Filesystem + Share 改善文件交给其他 App | 自动解决 Vercel 中国可达（若仍拉境外 URL） |
| 更像「已安装 App」的心智 | 自动迁移 localStorage；自动免备案讨论 |
| | 插件文档写明：**iOS silent push 不支持**（须原生方案） |
| | 不实现 GPS/HealthKit 就不会凭空出现 |

---

## 19. 失败模式反推载体（≥10）

| # | 真实失败 | 更可能根因 | PWA 能否修 | 何时才需换壳 |
|---|----------|------------|------------|--------------|
| 1 | 微信内点「导出 FIT」无文件/打不开 | 微信 WebView 下载/文件行为 | **否**（容器）；**是**（引导出微信+系统浏览器） | 仅当引导后仍大比例失败且流量在微信 → 薄入口或 App 分享文件 |
| 2 | 清浏览器数据后计划消失 | localStorage 无备份 | **是**（JSON 备份/恢复） | 换壳不自动有云同步 |
| 3 | 换机后一切清空 | 无账号/无导出包 | **是**（备份文件）；云同步是架构升级 | 多端成为 KPI 时 |
| 4 | 无法每天提醒开课 | 无 Push；未用 ICS | **部分**（ICS 引导；HSWA+Web Push） | ICS+已安装 Web Push 都失败且留存差 |
| 5 | 国内打开极慢/失败 | Vercel 无大陆节点 | **否（形态）/是（托管镜像）** | **永不**因慢自动选 App；先镜像 |
| 6 | 用户说「装不了 PWA」 | 缺 192/512、无引导、iOS 路径长 | **是**（图标+文案）；iOS 摩擦仅能缓解 | 修债后 standalone 仍极低且产品已验证 |
| 7 | 用户不愿填 Intervals.icu API Key | 信任/摩擦/非刚需 | **是**（可选、说明、会话-only 已做） | 与壳无关 |
| 8 | ICU 同步失败 | Worker/CORS/密钥/网络 | **是**（修 Worker/错误文案） | 壳不减少 API 集成 |
| 9 | Garmin 导入失败 | 错误文件类型/用户路径/表款 | **是**（说明+ZIP/单日）；非小程序 openDocument | 仅当要深度 SDK 级同步 |
| 10 | 分享卡片无图/难看 | 无 og:image | **是** | 否 |
| 11 | 更新后白屏/旧 SW | 缓存策略边缘情况 | **是**（已有 autoUpdate；可加强 reload 提示） | 否 |
| 12 | 小程序重做后仍不能表上训练 | openDocument 无 FIT | **不适用** | **不要**用完整小程序当执行本体 |

---

## 20. 用户研究前置（验证载体痛点，不诱导形态偏好）

> 目标：区分 **产品价值 / 环境摩擦 / 真正的载体天花板**。
> **禁止**首问「你更想要 App 还是小程序」。
> **无真实用户数据前，访谈结论不得写成全量统计。**

### 20.1 样本分层（招募时标记，不现场诱导）

| 层 | 维度 | 用途 |
|----|------|------|
| OS | iOS / Android | 安装路径与下载差异 |
| 入口 | 微信会话打开 / 系统浏览器（Safari/Chrome）直接打开 | M6/M7 解释 |
| 设备 | Garmin / COROS / 无表（仅手机） | 导出闭环是否相关 |
| 每层目标 | 各 ≥2 人，总计 8–12 人起步 | 定性饱和，非定量 |

### 20.2 问题库（8–12，中性）

1. 你最近一次打开这个训练计划工具时，是从什么入口点进来的？（让对方自述）
2. 打开后，你实际完成了哪一步？卡在哪一步？
3. 若打不开或很慢，你当时怎么处理？（放弃/换网络/换浏览器/求链接）
4. 你有没有把某一天的课表弄到手表或日历里？具体怎么操作的？
5. 导出或同步失败时，你认为是「软件坏了」还是「手机环境限制」？依据是什么？
6. 你如何记得第二天有什么课？（闹钟/日历/记忆/别的 App）
7. 换过手机或清过浏览器数据后，训练记录还在吗？你怎么恢复的？
8. 如果必须用微信里的页面完成「导出给手表」，你预期的步骤是怎样的？
9. 你是否把网站加到过主屏幕？过程中哪一步让你停下来？（**勿**先演示「应该添加」）
10. 你愿不愿意把 Intervals.icu 的密钥粘贴进网页？为什么？
11. 过去 7 天你回看课表几次？没回看的主要原因是什么？
12. 还有什么让你觉得「这不像一个可靠的训练工具」？

### 20.3 可观察任务（3 个；看行为不看口号）

| 任务 | 观察指标 | 载体含义 |
|------|----------|----------|
| T1：从你常用的打开方式进入，生成或打开已有计划，找到「今天练什么」 | 是否成功、耗时、是否中途切换 App | 入口/可达/信息架构 |
| T2：导出 ICS 或 FIT（按你真实设备需要选一种）并完成到日历或表厂 App 的下一步 | 是否完成；卡在微信还是系统 | 执行闭环环境 |
| T3：把页面「留在你明天能找到的地方」（不规定主屏幕/收藏/飞书） | 用户自发选择的锚点 | 安装是否真是需求 |

### 20.4 分析规则

- 若 T2 失败且入口=微信 → 优先「出微信」实验，不记「需要小程序」。
- 若 T1 慢/失败且浏览器直接进也失败 → 托管/性能，不记「需要 App」。
- 若 T3 自发主屏幕且回访高 → PWA 安装有价值，先修图标引导。
- 若计划内容不被信任导致不回访 → **产品问题**，暂停形态。

---

## 21. 反结论检查（投资委员会式：支持「立即原生/小程序」）

### 21.1 正方摘要（故意写强）

> 中文跑者生活在微信；竞品全是 App；无推送则无每日习惯；PWA 在 iOS 难装；Vercel 在国内不稳；现在不做小程序/App 就是放弃分发。Capacitor 可复用 Web，90 天可上架。小程序订阅消息可做开课提醒。延迟换壳等于延误窗口。

### 21.2 逐条门槛判决

| 正方主张 | 证据是否达开工门槛 | 判决 |
|----------|--------------------|------|
| 用户主要在微信且浏览器转化失败 | **无** M6/转化基线 | **未达** |
| 竞品都是 App ⇒ 我们也必须 | 竞品护城河=GPS/硬件/交易（已区分） | **未达**（类比不当） |
| 无推送则无留存 | 无 Push 实验；ICS 未测采用率 | **未达** |
| PWA 不可装 | **实现缺 192/512** 未修；规则仍建议 icons | **未达**（先修债） |
| 国内不稳 ⇒ 要 App | 托管正交；Vercel KB 指向镜像/ICP | **未达** |
| 小程序可闭环执行 | openDocument **无** FIT/ICS | **否定** |
| Capacitor 90 天低成本 | 审核+推送基建+备案日历未估；无 WAU | **未达** |
| 延误即失去窗口 | 无增长数据证明窗口存在 | **未知≠紧急** |

**结论**：反方叙事在叙事层有力，在**证据层未达并行第二执行客户端的开工门槛**。主结论维持 **90 天内 PWA 为唯一执行本体**（非永久承诺）。

---

## 22. 第三/四轮总判定

| 项 | 判定 |
|----|------|
| 主形态 | **未来 90 天唯一执行本体 = PWA**（非「永远唯一产品」） |
| 辅助 | 可选极轻社交/公众号导流（方案 B），非完整小程序执行台 |
| 矩阵 | 基线正确；敏感性 S1/S2 第四轮已修；**A=3.70 仍最高**；S1→B，S2/S7→E 仅情景翻盘 |
| 立即小程序/原生 | **不开工** |
| 90 天 | 阶段 0 内债+测量 → 阶段 1 微信导流验证 → 阶段 2 门禁 |
| 用户数据 | **无**；所有阈值先基线；分数≠用户证据 |

---

## 23. CONTEXT 对齐摘要（供 CONTEXT.md 引用）

> 2026-07-15 产品形态研究**第四轮终审**：继续以 **PWA 为未来 90 天唯一执行本体**；获客可用微信导流，不做第二训练台。90 天内不开工完整小程序/Capacitor/原生。首批只修阻塞性内债（192/512、apple-touch-icon、备份导出、微信逃生舱、中国探针/域），建 M1–M8 基线。无真实用户数据前不换壳。矩阵 A=3.70>B=3.35≫D≳C>E；评分是决策工具不是用户证据。

---

## 24. 若继续 PWA：最可能失败的五个原因（创业/运营视角）

> 站在「产品做不起来」而非「技术能不能跑」；每个原因均可在 30 天内低成本验证。
> 【推断】占主导——因**无真实用户数据**；信号定义为**可观察代理**。

| # | 失败原因 | 最早领先信号 | 30 天低成本验证 | 何时宣布 PWA 路线失败 |
|---|----------|--------------|-----------------|------------------------|
| **F-A** 中国打不开/极慢，获客在漏斗外死亡 | 分享链接打开失败、多人反馈「白屏/超时」、探针多省失败 | 固定 3–5 个大陆出口手工探针表（首页+manifest+races.json）；记录 TTFB/是否 200，连续 14 天 | `MirrorFirst` 触发后**仍拒绝**镜像/自定义域，或镜像后 M1 仍 < 内部基线一半且持续 ≥14 天 → **托管路线失败**（先于「形态失败」）；若团队把「必须换 App」当唯一解且拒绝镜像，则 **PWA-on-Vercel 运营失败** |
| **F-B** 流量活在微信 WebView：装不了、导不出 FIT/ICS，用户归因「产品坏了」 | 导出投诉集中在微信会话；M6 高且 M7 低 | 分享文案强制「用浏览器打开」；前后 2 周导出成功反馈对比；5 次真实微信内点导出录像 | 引导后 `conv_browser` 仍极低 **且** 导出失败主因仍是容器 **且** 连续 ≥4 周 WAU 可测 → 宣布 **「纯链接进微信即用」失败**，升级 B/C 薄入口；**不**等于宣布执行本体改小程序 |
| **F-C** 装不上/不愿装 → 无回访锚点，第二天找不到 | 生成用户中无人提到主屏幕；M5≈0；「收藏夹找不到」 | 先修 192/512+apple-touch；加 3 步安装文案；统计「展示引导→尝试添加」手工计数（n 可小） | **安装债已修** ≥14 天后，生成用户 standalone 仍≈0 **且** D1/D7 差 **且** 访谈主因是「找不到入口」→ **PWA 安装叙事失败**，评估 Capacitor spike（仍须产品有人用） |
| **F-D** 无提醒 → 计划生成后不再打开（留存死） | 生成后 7 日零回访；用户靠记忆/别的 App | ICS 一键引导 A/B；问 6–8 人「你怎么记得明天练什么」；不先推 App | ICS 采用失败 **且**（若已装）Web Push 实验失败 **且** M4 差 **且** 访谈主因是提醒而非计划质量 → **「习惯靠主动打开」失败**，才打开 D 讨论 |
| **F-E** 清缓存/换机丢计划 → 信任崩塌，口碑反噬 | 单次「我的计划没了」高严重度反馈；M8 代理上升 | 上线 JSON 备份/恢复（或至少导出说明）；记录恢复成功率 | 有备份入口后仍出现不可恢复丢失占活跃用户可感比例，或用户拒绝 local-first → **local-first 信任失败**（解法是备份/账号，**不是**先做小程序 UI） |

**运营总判**：五个失败里，**F-A/F-B 是环境与入口，F-C/F-D/F-E 是 PWA 内可修或可测**。宣布「整个 PWA 路线失败」的充要条件应是：**内债已修 + 基线已建 + 入口/托管已尝试 + 仍满足第 9 节 `ThinMP` 或 `Cap` 公式**。未修图标就宣称 PWA 失败 = **决策错误**。

---

## 25. PWA 内债优先级（工程负责人；首批只修阻塞项）

| 项 | 类型 | 是否阻塞 | 说明 |
|----|------|----------|------|
| 192×192 + 512×512 PNG（+可选 maskable） | **阻塞安装** | **是** | 与 web.dev 现行 install criteria 不一致；生产 manifest 已核实仅 SVG |
| `apple-touch-icon` | **阻塞 iOS 主屏幕体验** | **是** | WebKit：apple-touch-icon 优先；缺则图标劣质→安装意愿↓ |
| 微信/分享「用系统浏览器打开」逃生舱文案 | **阻塞导出与安装路径** | **是** | 不改代码也能先定文案；降低 F-B 误归因 |
| 计划 JSON 备份/恢复（或最小导出状态包） | **阻塞数据安全/信任** | **是** | 清缓存即丢；换壳不自动解决 |
| 中国可达探针表 + 自定义域/镜像评估一页纸 | **阻塞获客真实性** | **是** | 托管正交；不做则所有留存指标不可解释 |
| 安装引导 UI / `beforeinstallprompt` | 转化优化 | 次优先 | 图标未修前做引导 = 空转 |
| `og:image` | **美化/分享卡片** | 否（非 Day0 必须） | 影响传播观感，不阻塞闭环 |
| Web Push 服务端 | 能力建设 | 否（阶段 0 明确不做） | 须 HSWA+权限；无基线勿建 |
| 账号/云同步 | 架构升级 | 否 | 第二端或 F-E 触发后再做 |
| Capacitor/小程序工程 | 换壳 | **禁止首批** | 见门禁 |

### 第一批只修这 5 项（避免 90 天大重构）

1. **192/512 图标资源 + manifest**
2. **apple-touch-icon**
3. **JSON 备份/恢复规格并实施（最小）**
4. **微信/分享逃生舱文案（含导出前提示）**
5. **中国探针 + 自定义域/镜像评估（运维，非 App）**

并行：**M1–M8 事件字典/手工表**（测量，不是功能膨胀）。
**明确不做进首批**：og:image 可顺手但非门禁；Push；小程序；Capacitor；账号系统；SW 大改。

---

## 26. 三层产品形态：为何「PWA 本体 + 微信导流」不是两个产品

| 层 | 用户要完成的事 | 是否必须同一载体 | Marathon 选择 |
|----|----------------|------------------|---------------|
| **L1 获客入口** | 看到链接/卡片/公众号，点进来 | **否**——入口可异质 | 微信会话、社群、浏览器书签、二维码均可；只负责 **把人送到 L2** |
| **L2 日常执行端** | 看课表、打卡、周报、导出 FIT/ICS、ICU | **应唯一**——多执行端=双倍状态与测试 | **仅 PWA（系统浏览器/主屏幕）** |
| **L3 数据/计划本体** | 计划、打卡、收藏、exportSync 版本 | **必须唯一**——分叉即丢信任 | **同一 localStorage 计划状态**（+未来备份文件）；不在小程序另存一套课表 |

**为什么不是两个产品**

1. **单一状态源**：生成/自适应/指纹/导出过期只在一处计算；微信侧若再存计划，必然出现「两边课表不一致」。
2. **单一执行闭环**：FIT/ICS 依赖系统浏览器下载（仓库 Blob 路径）；微信只做 CTA，不承诺在容器内完成导出。
3. **导流 ≠ 重做**：公众号/薄小程序若只含介绍+「浏览器打开」按钮+订阅提醒，是 **获客管道**，共享同一 URL 与同一 L3，没有第二套 UI 业务树。
4. **何时才变成两个产品（禁止默认）**：在小程序内重新实现训练日历/打卡/FIT 主路径 → 立即变双产品，触发本报告否定的完整小程序本体。

---

## 27. 关键事实证据账本（主张 → 来源 → 强度 → 是否影响决策）

> 规则：禁止用来源**标题**代替**内容**；强度：高=官方/仓库可复现；中=官方但场景未实测；低=二手/推断。

| # | 主张（内容级） | 来源（可核对） | 强度 | 影响决策？ |
|---|---------------|----------------|------|------------|
| E1 | 生产 manifest 的 icons **仅** `/favicon.svg`（sizes any），无 192/512 PNG | 生产 `manifest.webmanifest` 2026-07-15 GET 200 正文；`vite.config.ts` icons | **高**【事实】 | **是**——先修安装债，禁借此开工 App |
| E2 | web.dev 现行 install criteria 仍列 **192 与 512** 图标等字段 | https://web.dev/articles/install-criteria （200） | **高**【事实】 | **是**——与 E1 闭合 |
| E3 | Chrome 已移除「菜单安装必须 SW fetch」等旧条件；规则在演进，仍建议 icons | Chrome update-install-criteria 博文（第三轮 200） | **高**【事实】 | **是**——措辞：非「绝对不能装」，是「未达最佳实践/启发式可能差」 |
| E4 | iOS 主屏幕 Web App 16.4+ 支持 Web Push；须用户手势；标签页≠已安装推送主体 | WebKit 博文 + Apple Sending web push 文档（200） | **高**【事实】 | **是**——Push 不能替代「先装主屏幕」 |
| E5 | Vercel **无**中国大陆 servers/CDN；不保证大陆可用；建议自定义域/镜像/ICP | Vercel KB Mainland China（200） | **高**【事实】 | **是**——慢≠自动做 App；先托管 |
| E6 | `wx.openDocument` fileType **仅** doc/docx/xls/xlsx/ppt/pptx/pdf | 微信官方 openDocument（200） | **高**【事实】 | **是**——否决小程序当 FIT/ICS 执行本体 |
| E7 | `wx.downloadFile` 可下到临时路径 ≤200MB；**≠** 系统文件/手表导入完成 | 微信 downloadFile（200） | **高**【事实】 | **是**——禁止「能下载=能完成手表导入」 |
| E8 | 个人类型小程序 **暂不支持** web-view | 微信 web-view 组件文档（200） | **高**【事实】 | **是**——套壳 PWA 小程序有主体门槛 |
| E9 | 本产品 FIT/ICS 为 Blob + `<a download>` | `src/utils/export-fit.ts` / `export-ics.ts` | **高**【事实】 | **是**——绑定系统浏览器 |
| E10 | 计划状态 zustand persist → localStorage，名 `marathon-training-storage`；ICU key 不持久化 | `src/store/useStore.ts` | **高**【事实】 | **是**——第二端/清缓存风险；备份优先于壳 |
| E11 | Capacitor 上架路径与原生 App 相同（需商店分发） | capacitorjs.com/docs 与 deploying-to-app-store（200） | **高**【事实】 | **是**——无「免费避开审核」 |
| E12 | 最酷产品矩阵含网页+App+公众号+小程序+H5；主业偏报名交易 | zuicool.com/terms（200） | **高**【事实】 | **中**——可学分工，不可抄全端 |
| E13 | Runna 等竞品主推原生 App | runna.com + App Store 链（200） | **高**【事实】 | **低/否**——类比不足以下达 Marathon 开工原生 |
| E14 | 工信部备案入口本轮探针 **521**；APP 备案范围多来自转载/云厂商 FAQ | beian.miit.gov.cn 521；secrss/腾讯云 | **中-低**（入口受限+二手） | **中**——只支持「换壳增加合规日历」，**非法律结论** |
| E15 | 中国大陆真实打开成功率/微信转化/安装率 | **无** | **未知** | **是**——缺则禁止换壳；先 M1–M8 |

**账本状态**：15 条；决策硬依赖以 E1–E11、E15 为主；E12–E13 防错误类比；E14 降级为日历风险非法律意见。

---

## 28. 最终一页（决策卡）

| 项 | 内容 |
|----|------|
| **现在选什么** | **未来 90 天：PWA 为唯一执行本体；微信/社交最多做导流，不重做训练台。** |
| **为什么不是小程序** | **openDocument 无 FIT/ICS，无法自然完成手表/日历执行闭环；做完整小程序=伪完成或双产品。** |
| **为什么不是 App** | **无用户基线证明瓶颈在壳；Capacitor/原生仍要审核备案且不自动解决 Vercel 中国与 localStorage；正确性债优先。** |
| **未来 30 天只做什么** | ① 192/512 图标 ② apple-touch-icon ③ JSON 备份/恢复（最小） ④ 微信逃生舱文案 ⑤ 中国探针+域名/镜像评估 + M1–M8 字典 |
| **30 天后看哪 3 个决策信号** | ① **M1** 大陆打开是否稳定 ② **M6×M7** 是否「微信高入口 + 导出失败」 ③ **M5×M4** 修债后安装与回访是否仍双低 |
| **什么情况下立刻改变结论** | ① 产品改做 GPS/社交/支付报名 ② `ThinMP` 四条件同时（含合规就绪） ③ `Cap` 四条件同时（安装债已修+ICS/Push 失败+产品有人用+团队有容量） ④ 法律/政策强制必须境内 App 形态（须正式意见，非本报告） |

---

## 29. 第四轮审计清单（来源 / 链接 / 标注 / 用户数据 / CONTEXT）

| 检查项 | 结果 |
|--------|------|
| 来源数量 | 第 13 节 **31** 条（官方 19 + 竞品 10 + 仓库/生产 2）；第 16 节审计表 ≥37 URL 探针记录；**≥24 要求满足** |
| 坏链 | **beian.miit.gov.cn → 521**（访问受限，已标注）；其余本轮抽检关键链 **200**（生产、manifest、web.dev install-criteria、openDocument、Vercel KB、WebKit Push、web-view、Capacitor、zuicool terms、Runna、Chrome installable-manifest） |
| 事实/推断/未知 | 文首分级仍有效；第 27 节账本逐条标强度；E14/E15 显式降级 |
| 无真实用户数据声明 | 文首硬声明 + 第 8/9/11/20/28 节重复；**矩阵分≠用户证据** |
| 绝对化语言 | 「纯 PWA 唯一产品本体」→「**未来 90 天唯一执行本体**」；长期不承诺 |
| CONTEXT 一致性 | 第 23 节摘要与 CONTEXT 第四轮段一致 |
| 矩阵 | 基线 A3.70>B3.35>D2.80>C2.75>E2.70；S1/S2 第四轮已修 |
| 代码/配置/数据 | **本轮未改**；仅报告 + CONTEXT 摘要 |

---

## 30. 第四轮终审结论（给决策者）

**维持**：不在 90 天内开工完整小程序 / Capacitor / 原生。
**收紧**：PWA 是 **执行层与数据层** 的默认载体，不是品牌上的「永远唯一产品」；获客层可异质。
**立刻做**：5 项阻塞内债 + 测量，不做大重构。
**翻盘条件**：只认第 9 节公式与第 24 节「宣布失败」门槛，不认竞品都是 App 的叙事。

---

**文档结束（第四轮决策收敛终审版）。**
