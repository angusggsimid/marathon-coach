import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setFitDownloadOverrideForTest } from './utils/fit-export-range'
import { setIcsDownloadOverrideForTest } from './utils/export-ics'
import { isExportTestOverrideAllowed } from './utils/export-test-gate'

/**
 * 验收注入点：仅用于 browser acceptance 模拟 FIT/ICS 失败。
 * 门禁：loopback 主机 + 显式 query `marathon_export_test=1` 同时满足才挂载。
 * 生产 / 普通本地页面默认不暴露任何可改导出实现的 window 接口。
 * setter 本身在 export-ics / fit-export-range 内二次门禁，避免绕过 window 污染生产行为。
 */
declare global {
  interface Window {
    __MARATHON_EXPORT_TEST__?: {
      setFitDownloadOverride: typeof setFitDownloadOverrideForTest
      setIcsDownloadOverride: typeof setIcsDownloadOverrideForTest
    }
  }
}

// isExportTestOverrideAllowed 在 Node 为 true；此处仅浏览器入口，生产域名为 false
if (typeof window !== 'undefined' && isExportTestOverrideAllowed()) {
  window.__MARATHON_EXPORT_TEST__ = {
    setFitDownloadOverride: setFitDownloadOverrideForTest,
    setIcsDownloadOverride: setIcsDownloadOverrideForTest,
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
