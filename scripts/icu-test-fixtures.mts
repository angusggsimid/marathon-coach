/**
 * ICU 同步测试 fixture（不进入生产 bundle）。
 * 模拟非幂等服务端：每次 POST 都新建事件 id。
 */

export function createNonIdempotentMockFetch(): {
  fetchImpl: typeof fetch;
  createdExternalIds: string[];
  getPostCount: () => number;
} {
  const createdExternalIds: string[] = [];
  let postCount = 0;
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    postCount++;
    const body = init?.body
      ? (JSON.parse(String(init.body)) as { external_id?: string })
      : {};
    if (body.external_id) createdExternalIds.push(body.external_id);
    return new Response(
      JSON.stringify({ id: postCount, external_id: body.external_id }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch;
  return {
    fetchImpl,
    createdExternalIds,
    getPostCount: () => postCount,
  };
}

/**
 * 可控部分成功 mock：前 okCount 次 200，其余 500。
 * 用于验证 allSucceeded / markExportSuccess 门槛。
 */
export function createPartialSuccessMockFetch(okCount: number): {
  fetchImpl: typeof fetch;
  getPostCount: () => number;
} {
  let postCount = 0;
  const fetchImpl = (async () => {
    postCount++;
    if (postCount <= okCount) {
      return new Response(JSON.stringify({ id: postCount }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('server error', { status: 500 });
  }) as typeof fetch;
  return { fetchImpl, getPostCount: () => postCount };
}
