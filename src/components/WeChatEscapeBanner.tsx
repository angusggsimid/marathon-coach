/**
 * 微信内置浏览器逃生舱：克制、非阻塞、可关闭（session），不遮挡底栏。
 */
import { useState } from 'react';
import { Copy, X, ExternalLink } from 'lucide-react';
import {
  copyTextToClipboard,
  currentPageUrl,
  dismissWeChatBanner,
  isWeChatBannerDismissed,
  shouldShowWeChatEscape,
  wechatMenuInstructions,
  wechatPlatformHint,
  WECHAT_ESCAPE_BODY,
  WECHAT_ESCAPE_TITLE,
} from '../utils/wechat';
import { mutateMetrics, recordWechatCopy, recordWechatDismiss } from '../utils/local-metrics';
import { cn } from '../utils/cn';

function readWeChatBannerState(): { visible: boolean; hint: string } {
  if (typeof navigator === 'undefined') {
    return { visible: false, hint: '' };
  }
  const ua = navigator.userAgent;
  const dismissed = isWeChatBannerDismissed();
  return {
    visible: shouldShowWeChatEscape(ua, dismissed),
    hint: wechatMenuInstructions(wechatPlatformHint(ua)),
  };
}

export function WeChatEscapeBanner() {
  const [banner, setBanner] = useState(readWeChatBannerState);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');

  if (!banner.visible) return null;

  const onCopy = async () => {
    const url = currentPageUrl();
    const ok = await copyTextToClipboard(url);
    setCopyState(ok ? 'ok' : 'fail');
    if (ok) mutateMetrics(s => recordWechatCopy(s));
    setTimeout(() => setCopyState('idle'), 2200);
  };

  const onDismiss = () => {
    dismissWeChatBanner();
    mutateMetrics(s => recordWechatDismiss(s));
    setBanner(prev => ({ ...prev, visible: false }));
  };

  return (
    <div
      data-testid="wechat-escape-banner"
      role="status"
      className="mb-3 rounded-2xl border border-[var(--color-orange)]/30 bg-[var(--color-orange)]/10 px-3.5 py-3"
    >
      <div className="flex items-start gap-2">
        <ExternalLink className="w-4 h-4 text-[var(--color-orange)] flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--color-orange)] leading-snug">
            {WECHAT_ESCAPE_TITLE}
          </p>
          <p className="text-[12px] text-[var(--color-label-2)] mt-1 leading-relaxed break-words">
            {WECHAT_ESCAPE_BODY}
          </p>
          <p className="text-[12px] text-white mt-1.5 leading-relaxed break-words">
            {banner.hint}
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <button
              type="button"
              data-testid="wechat-copy-link"
              onClick={onCopy}
              className={cn(
                'inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-xl',
                'bg-[var(--color-surface-2)] text-white active:opacity-70',
              )}
            >
              <Copy className="w-3.5 h-3.5" />
              {copyState === 'ok' ? '已复制' : copyState === 'fail' ? '复制失败' : '复制链接'}
            </button>
            <button
              type="button"
              data-testid="wechat-dismiss"
              onClick={onDismiss}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--color-label-3)] px-2 py-1.5"
            >
              <X className="w-3.5 h-3.5" />
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
