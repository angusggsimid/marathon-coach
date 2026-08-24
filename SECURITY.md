# 安全策略 Security Policy

## 数据与隐私

- **所有用户数据仅存于本地浏览器**（localStorage / IndexedDB），不经过任何第三方服务器
- COROS 授权凭证仅存于本地设备，永不上传；备份文件不含任何凭据（含历史字段防御性校验）
- 训练数据备份由用户自行导出/导入，项目方无法接触

## 上报漏洞

如发现安全问题，请通过 GitHub [Security Advisories](../../security/advisories/new) 私密上报，**请勿直接开 public issue**。

会在 7 天内响应确认，修复后随版本发布致谢（可选）。

## 范围

- 主应用（本仓库 `src/`）
- PWA 清单与 Service Worker
- 赛事爬虫（`crawler/`，只读公开赛事数据）

## 已知设计取舍

- 无服务端、无账号体系——攻击面天然受限
- OAuth 凭据仅用于读取 COROS 数据，作用域见 COROS 开放平台说明
