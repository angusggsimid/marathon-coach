/**
 * 导出验收注入门禁：与 main.tsx window 挂载条件一致。
 * - Node（无 window）：允许，供 selftest-core 使用
 * - 浏览器：仅 loopback + marathon_export_test=1
 * 生产域名即使被注入也不得改写导出实现。
 */
export const EXPORT_TEST_QUERY = 'marathon_export_test'

export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}

/** 是否允许安装/使用导出测试 override */
export function isExportTestOverrideAllowed(): boolean {
  if (typeof window === 'undefined') return true
  if (!isLoopbackHostname(window.location.hostname)) return false
  try {
    return new URLSearchParams(window.location.search).get(EXPORT_TEST_QUERY) === '1'
  } catch {
    return false
  }
}
