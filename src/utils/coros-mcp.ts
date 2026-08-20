// COROS MCP 客户端：OAuth PKCE + token 管理 + MCP Streamable HTTP 调用。
// 纪律：
// - token 只存本机 localStorage（与全部产品数据同一信任模型），只用于 mcpus.coros.com
// - 401 自动用 refresh_token 刷新重试一次
// - 服务端无 session 头（实测无状态），保持兼容有 session 的情况
const MCP_BASE = 'https://mcpus.coros.com';
const REGISTER_URL = `${MCP_BASE}/connect/register`;
const AUTH_URL = `${MCP_BASE}/oauth2/authorize`;
const TOKEN_URL = `${MCP_BASE}/oauth2/token`;
const MCP_URL = `${MCP_BASE}/mcp`;
const SCOPE = 'mcp.tools offline_access';

const AUTH_KEY = 'marathon-coros-auth';
const PKCE_KEY = 'marathon-coros-pkce';

export interface CorosTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface CorosAuth {
  clientId: string;
  tokens: CorosTokens;
  connectedAt: string;
}

export function loadCorosAuth(): CorosAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CorosAuth;
    if (!parsed?.clientId || !parsed?.tokens?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCorosAuth(auth: CorosAuth | null): void {
  try {
    if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_KEY);
  } catch { /* 存储异常不阻断流程 */ }
}

// ── PKCE ─────────────────────────────────────────────────────────────────────

function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const rand = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(rand);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

// ── OAuth 流程 ───────────────────────────────────────────────────────────────

export function redirectUri(): string {
  return `${location.origin}/`;
}

async function registerClient(): Promise<string> {
  const res = await fetch(REGISTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: '马拉松备赛 · AI 训练计划',
      redirect_uris: [redirectUri()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`COROS 客户端注册失败（HTTP ${res.status}）`);
  const data = await res.json();
  if (!data.client_id) throw new Error('COROS 客户端注册未返回 client_id');
  return data.client_id as string;
}

/** 发起授权：注册客户端（复用已有）→ 生成 PKCE → 跳转 COROS 登录 */
export async function startCorosConnect(existingClientId?: string): Promise<void> {
  const clientId = existingClientId ?? (await registerClient());
  const { verifier, challenge } = await pkcePair();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, clientId }));
  const url = new URL(AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  location.href = url.toString();
}

/** 处理授权回调：校验 state → 交换 token → 返回 CorosAuth（调用方负责保存与清理 URL） */
export async function handleCorosCallback(code: string, state: string): Promise<CorosAuth> {
  const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null') as
    | { verifier: string; state: string; clientId: string }
    | null;
  sessionStorage.removeItem(PKCE_KEY);
  if (!saved) throw new Error('授权会话已失效，请重新连接');
  if (saved.state !== state) throw new Error('授权 state 不匹配，请重新连接');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: saved.verifier,
    client_id: saved.clientId,
    redirect_uri: redirectUri(),
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`COROS token 交换失败（HTTP ${res.status}）`);
  const data = await res.json();
  if (!data.access_token) throw new Error('COROS 未返回 access_token');
  return {
    clientId: saved.clientId,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    },
    connectedAt: new Date().toISOString(),
  };
}

async function refreshAuth(auth: CorosAuth): Promise<CorosAuth> {
  if (!auth.tokens.refreshToken) throw new Error('COROS 授权已过期，请重新连接');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: auth.tokens.refreshToken,
    client_id: auth.clientId,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('COROS 授权已过期，请重新连接');
  const data = await res.json();
  if (!data.access_token) throw new Error('COROS 刷新未返回 access_token');
  return {
    ...auth,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? auth.tokens.refreshToken,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    },
  };
}

// ── MCP 调用 ─────────────────────────────────────────────────────────────────

let rpcId = 0;
let initialized = false;

async function mcpPost(auth: CorosAuth, payload: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.tokens.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(payload),
  });
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  let json: unknown = null;
  if (ct.includes('text/event-stream')) {
    const events = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
    const last = events[events.length - 1];
    if (last) json = JSON.parse(last);
  } else if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: res.status, json };
}

async function ensureInit(auth: CorosAuth): Promise<void> {
  if (initialized) return;
  rpcId += 1;
  const resp = await mcpPost(auth, {
    jsonrpc: '2.0', id: rpcId, method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'marathon-training-pwa', version: '1.0.0' },
    },
  });
  if (resp.status !== 200) throw new Error(`COROS MCP 握手失败（HTTP ${resp.status}）`);
  await mcpPost(auth, { jsonrpc: '2.0', method: 'notifications/initialized' });
  initialized = true;
}

/**
 * 调用 COROS MCP 工具，返回 content[0].text 解包后的字符串。
 * 401 自动刷新 token 重试一次；刷新成功后回写存储（由 onRefreshed 回调）。
 */
export async function callCorosTool(
  auth: CorosAuth,
  tool: string,
  args: Record<string, unknown>,
  onRefreshed?: (next: CorosAuth) => void,
): Promise<string> {
  await ensureInit(auth);
  rpcId += 1;
  let resp = await mcpPost(auth, { jsonrpc: '2.0', id: rpcId, method: 'tools/call', params: { name: tool, arguments: args } });
  if (resp.status === 401 && auth.tokens.refreshToken) {
    const next = await refreshAuth(auth);
    onRefreshed?.(next);
    resp = await mcpPost(next, { jsonrpc: '2.0', id: rpcId, method: 'tools/call', params: { name: tool, arguments: args } });
  }
  if (resp.status >= 400) throw new Error(`COROS ${tool} 失败（HTTP ${resp.status}）`);
  const r = resp.json as { result?: { content?: Array<{ text?: string }>; isError?: boolean }; error?: { message?: string } };
  if (r?.error) throw new Error(`COROS ${tool} 错误：${r.error.message ?? '未知'}`);
  const text = r?.result?.content?.[0]?.text ?? '';
  // 服务端返回的 text 是 JSON 编码的字符串（双层），解包一次
  try {
    const unwrapped = JSON.parse(text);
    if (typeof unwrapped === 'string') return unwrapped;
  } catch { /* 非双层编码，原文返回 */ }
  return text;
}

/** 断开连接（清除本机凭据） */
export function disconnectCoros(): void {
  saveCorosAuth(null);
  initialized = false;
}

/**
 * 仅开发环境：复用本机 OpenCode 已完成的 COROS 授权（dev server 的 /__dev/coros-auth 端点），
 * 避免调试反复走 OAuth。生产构建中 import.meta.env.DEV 为 false，永不触发。
 */
export async function tryImportDevAuth(): Promise<CorosAuth | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const res = await fetch('/__dev/coros-auth');
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.clientId || !data?.tokens?.accessToken) return null;
    return {
      clientId: data.clientId,
      tokens: {
        accessToken: data.tokens.accessToken,
        refreshToken: data.tokens.refreshToken,
        expiresAt: data.tokens.expiresAt,
      },
      connectedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
