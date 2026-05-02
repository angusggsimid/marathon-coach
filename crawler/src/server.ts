/**
 * server.ts — Crawler validation dashboard
 *
 * Run: npm run serve
 * Open: http://localhost:3333
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT    = join(__dirname, '..');
const OUTPUT  = join(ROOT, 'output');
const PUBLIC  = join(ROOT, 'public');
const PORT    = 3333;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return fallback; }
}

function send(res: ServerResponse, status: number, body: string, ct = 'text/plain') {
  res.writeHead(status, { 'Content-Type': ct });
  res.end(body);
}

function sendJson(res: ServerResponse, data: unknown) {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function sseStream(res: ServerResponse, cmd: string, args: string[]) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const emit = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const proc = spawn(cmd, args, { cwd: ROOT, shell: process.platform === 'win32' });

  proc.stdout.on('data', (buf: Buffer) => emit({ type: 'out', text: buf.toString() }));
  proc.stderr.on('data', (buf: Buffer) => emit({ type: 'err', text: buf.toString() }));
  proc.on('close', (code) => { emit({ type: 'done', code }); res.end(); });
  proc.on('error', (err) => { emit({ type: 'err', text: String(err) }); res.end(); });

  res.on('close', () => proc.kill());
}

// ─── Route handlers ───────────────────────────────────────────────────────────

function handleData(res: ServerResponse) {
  const races    = readJson<unknown[]>(join(OUTPUT, 'scraped-races.json'), []);
  const mergeData = readJson<unknown>(join(OUTPUT, 'merge-data.json'), null);

  const scrapedPath = join(OUTPUT, 'scraped-races.json');
  const lastScraped = existsSync(scrapedPath)
    ? statSync(scrapedPath).mtime.toISOString()
    : null;

  // Per-source counts
  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const r of races as Array<{ _source: string; status: string }>) {
    bySource[r._source] = (bySource[r._source] ?? 0) + 1;
    byStatus[r.status]  = (byStatus[r.status]  ?? 0) + 1;
  }

  sendJson(res, { races, mergeData, lastScraped, stats: { total: races.length, bySource, byStatus } });
}

// ─── Main router ──────────────────────────────────────────────────────────────

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    const htmlPath = join(PUBLIC, 'index.html');
    if (!existsSync(htmlPath)) { send(res, 404, 'index.html not found'); return; }
    send(res, 200, readFileSync(htmlPath, 'utf8'), 'text/html; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/data') {
    handleData(res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/scrape') {
    sseStream(res, 'npm', ['run', 'scrape']);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/merge') {
    sseStream(res, 'npm', ['run', 'merge']);
    return;
  }

  send(res, 404, 'Not found');
});

server.listen(PORT, () => {
  console.log(`\n  🔍  爬虫验证面板  →  http://localhost:${PORT}\n`);
});
