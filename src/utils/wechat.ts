/**
 * 微信内置浏览器检测与逃生舱文案。
 * 浏览器无法强制跳出微信；仅提供诚实指引 + 复制链接。
 */

export const WECHAT_UA_RE = /MicroMessenger/i;

export function isWeChatUA(ua: string): boolean {
  return WECHAT_UA_RE.test(ua || '');
}

export function isIOSUA(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua || '') ||
    // iPadOS 13+ 可能伪装成 Mac
    (/Macintosh/i.test(ua || '') && /Mobile/i.test(ua || ''));
}

export function isAndroidUA(ua: string): boolean {
  return /Android/i.test(ua || '');
}

/** sessionStorage：关闭后本会话内隐藏，下次打开可再出现 */
export const WECHAT_DISMISS_SESSION_KEY = 'marathon-wechat-escape-dismissed';

export function isWeChatBannerDismissed(
  getItem: (k: string) => string | null = k => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
): boolean {
  return getItem(WECHAT_DISMISS_SESSION_KEY) === '1';
}

export function dismissWeChatBanner(
  setItem: (k: string, v: string) => void = (k, v) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
): void {
  setItem(WECHAT_DISMISS_SESSION_KEY, '1');
}

export function shouldShowWeChatEscape(
  ua: string,
  dismissed = false,
): boolean {
  return isWeChatUA(ua) && !dismissed;
}

export type WeChatPlatformHint = 'ios' | 'android' | 'other';

export function wechatPlatformHint(ua: string): WeChatPlatformHint {
  if (isIOSUA(ua)) return 'ios';
  if (isAndroidUA(ua)) return 'android';
  return 'other';
}

/** 右上角菜单操作说明（符合微信事实，不假装能强制跳出） */
export function wechatMenuInstructions(platform: WeChatPlatformHint): string {
  if (platform === 'ios') {
    return '点右上角「…」→「在 Safari 中打开」';
  }
  if (platform === 'android') {
    return '点右上角「…」→「在浏览器打开」';
  }
  return '点右上角「…」→ 选择用系统浏览器打开';
}

export const WECHAT_ESCAPE_TITLE = '微信内功能受限';
export const WECHAT_ESCAPE_BODY =
  '导出 FIT / 日历 / ZIP 请在系统浏览器中打开本页。无法一键跳出微信，请手动操作。';

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function currentPageUrl(): string {
  if (typeof window === 'undefined') return '';
  // 不含 hash 查询中的敏感参数时仍用 origin+pathname；query 可能含敏感信息时由调用方决定
  try {
    const u = new URL(window.location.href);
    // 诊断/分享用干净链接：去掉常见追踪参数，保留 path
    return `${u.origin}${u.pathname}`;
  } catch {
    return window.location.href.split('#')[0] || '';
  }
}
