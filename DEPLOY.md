# 部署指南 — 马拉松备赛 App

> 面向完全不熟悉部署流程的开发者。每一步都有截图说明在哪里点。

---

## 整体架构

```
你的电脑 (代码) → GitHub (代码仓库) → Vercel (自动部署，海外主)
                     │              → EdgeOne Makers (自动部署，腾讯云)
                     ↑
     GitHub Actions 每天 10:17 (北京) 刷新赛事数据

另外：Cloudflare Worker (可选，用于 intervals.icu 同步功能)
```

**生产地址：**

| 平台 | 地址 | 自动部署 |
|---|---|---|
| Vercel | `https://marathon-pi-seven.vercel.app` | ✓ 每次 push |
| EdgeOne Makers | `https://marathon-gzgm45fm.edgeone.cool` | ✓ 每次 push（GitHub 集成，分支 main） |

每次 push 后两个平台都会自动构建，无需手动操作。注意 EdgeOne 没有 `/api/data` 重写（那是 `vercel.json` 的配置），但前端优先读 `/races.json`，两端数据一致。

---

## 第一部分：GitHub 上传代码

> 当前状态：已完成。仓库地址为 `https://github.com/angusggsimid/marathon-coach`，分支为 `main`。

### 1-1. 安装 Git（已有则跳过）

打开终端，输入：
```bash
git --version
```
如果显示版本号则已安装。否则前往 https://git-scm.com 下载安装。

### 1-2. 注册 GitHub 账号

前往 https://github.com → Sign Up → 填邮箱、密码、用户名。

### 1-3. 创建新仓库

1. 登录 GitHub 后，点击右上角的 **"+"** → **"New repository"**
2. Repository name 填：`marathon`
3. 选择 **Private**（上线前先保持私有更稳）
4. **不要**勾选 "Add a README" 等选项
5. 点击 **"Create repository"**
6. 创建完成后页面会显示一段命令，复制备用

### 1-4. 在终端上传代码

打开终端，进入项目文件夹：
```bash
cd /Users/你的用户名/Desktop/Marathon
```

依次执行：
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/你的用户名/marathon.git
git push -u origin main
```

> 第一次 push 会弹出登录窗口，用 GitHub 账号登录即可。

执行完毕后刷新 GitHub 页面，能看到文件即成功。

---

## 第二部分：Vercel 部署前端

### 2-1. 注册 Vercel

前往 https://vercel.com → Sign Up → 选择 **"Continue with GitHub"** → 授权。

### 2-2. 导入项目

1. 登录后点击 **"Add New… → Project"**
2. 找到 `marathon` 仓库，点击 **"Import"**
3. 配置页面：
   - **Framework Preset**：Vercel 会自动识别为 Vite，无需修改
   - **Root Directory**：留空（保持 `./`）
   - **Build Command**：`npm run build`（默认已填好）
   - **Output Directory**：`dist`（默认已填好）
4. 点击 **"Deploy"**
5. 等待约 1-2 分钟，出现 🎉 表示部署成功
6. 点击生成的域名（如 `marathon-training-xxx.vercel.app`）即可访问

### 2-3. 以后更新代码

本地修改后，只需：
```bash
git add .
git commit -m "更新说明"
git push
```
Vercel 检测到 push 会自动重新部署，约 1 分钟后生效。

---

## 第二部分 B：EdgeOne Makers（腾讯云）

> 当前状态：已完成。项目已关联 GitHub 仓库 `angusggsimid/marathon` 的 `main` 分支，每次 push 自动构建部署，与 Vercel 并行。

- 生产地址：`https://marathon-gzgm45fm.edgeone.cool`
- 项目 ID：`makers-tpxcnymmrsth`（本地 `.edgeone/project.json` 已关联）
- 构建配置：`npm install` → `npm run build` → 输出目录 `dist`，Node 22.11.0
- 控制台：https://console.cloud.tencent.com/edgeone/makers

CLI（验证部署状态用）：`~/.local/bin/edgeone`（登录态在 `~/.edgeone/`）。
注意：该项目是 GitHub 集成类型，**不能**用 `edgeone makers deploy` 手动推送（该命令仅限"直接上传"类型项目）；更新一律走 git push。

---

## 第三部分：赛事数据自动刷新（GitHub Actions）

`.github/workflows/crawl.yml` 已配置好，每天北京时间 10:17 自动运行爬虫并更新数据。

**首次需要手动触发一次：**

1. 打开 GitHub 仓库页面
2. 点击顶部 **"Actions"** 标签
3. 左侧选择 **"Refresh Race Data"**
4. 点击右侧 **"Run workflow"** → **"Run workflow"**（绿色按钮）
5. 等待约 2-3 分钟，完成后 `public/races.json` 会自动更新并触发 Vercel 重新部署

之后每天自动运行，无需手动操作。数据提交会同时触发 Vercel 和 EdgeOne 重新部署。

---

## 第四部分：intervals.icu 同步（当前未启用）

> 2026-08-18 清理：Cloudflare Worker 代理（`cloudflare-worker.js`）从未部署且未使用，已移除。
> intervals.icu 导出通道仍保留在应用内（可选），但因 CORS 限制浏览器直连可能失败；
> 如将来需要，可从 git 历史恢复 worker 并按_intervals.icu 官方文档_自行部署代理。

---

## 第五部分：PWA — 手机"添加到主屏幕"

PWA（渐进式网页应用）已在代码中配置好，部署到 Vercel 后**自动生效**，无需额外操作。

**用户使用方式：**

| 设备 | 操作 |
|------|------|
| iPhone / Safari | 点击底部分享按钮 → "添加到主屏幕" |
| Android / Chrome | 点击右上角菜单 → "添加到主屏幕" 或 "安装应用" |

添加后图标会出现在桌面，全屏打开，体验与原生 App 一致。

> **提示**：如需为 PWA 添加专属 PNG 图标（Android 安装提示更完整），在 `public/` 目录下放置：
> - `icon-192.png`（192×192 px）
> - `icon-512.png`（512×512 px）
>
> 然后在 `vite.config.ts` 的 `icons` 数组中添加对应配置。

---

## 第六部分：自定义域名（可选）

> 如果想用 `yourname.com` 而不是 `xxx.vercel.app`

1. 在阿里云 / 腾讯云购买域名（约 60-100 元/年）
2. Vercel 项目 → **"Settings"** → **"Domains"** → 输入你的域名 → **"Add"**
3. Vercel 显示 DNS 配置：复制 `CNAME` 值
4. 回到域名服务商控制台，添加一条 CNAME 记录，指向 Vercel 提供的值
5. 等待约 10-30 分钟，域名生效

---

## 常见问题

**Q: 打开 App 显示空白**  
A: 检查 Vercel 构建日志（项目主页 → "Deployments" → 点击最新一次 → "View Logs"）

**Q: 赛事页面没有数据**  
A: 手动触发一次 GitHub Actions（见第三部分），或检查 `public/races.json` 是否存在

**Q: 手机无法"添加到主屏幕"**  
A: 确保用 HTTPS 访问（Vercel 自动提供），Safari/Chrome 才有此选项

**Q: intervals.icu 同步失败**  
A: 确认 `VITE_ICU_PROXY` 环境变量已设置，且 Cloudflare Worker 已部署

---

## 部署检查清单

- [ ] 代码已 push 到 GitHub
- [ ] Vercel 部署成功，能访问到网站
- [ ] 手机 Safari/Chrome 可以"添加到主屏幕"
- [ ] 赛事页面显示数据（或 seed 数据）
- [ ] GitHub Actions 已成功运行一次
- [ ] （可选）Cloudflare Worker 配置完成
- [ ] （可选）自定义域名生效
