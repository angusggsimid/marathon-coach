/**
 * 2026-07-15 PWA 基础能力浏览器验收
 * 桌面 1280 + 手机 390；普通浏览器 / 微信 UA；备份成功/失败/取消；诊断导出；布局/console/pageerror
 *
 * 用法：node acceptance-2026-07-15-pwa/browser-acceptance.mjs [baseUrl]
 * 前置：vite preview 已启动（默认 http://127.0.0.1:4173）
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
/** 与 main.tsx 门禁一致：仅 loopback + 此 query 才挂载导出测试钩子 */
const EXPORT_TEST_QUERY = 'marathon_export_test';
const SHOT = join(__dirname, 'screenshots');
mkdirSync(SHOT, { recursive: true });

function withExportTestParam(base) {
  const u = new URL(base);
  u.searchParams.set(EXPORT_TEST_QUERY, '1');
  return u.toString();
}

function plainBaseUrl(base) {
  const u = new URL(base);
  u.searchParams.delete(EXPORT_TEST_QUERY);
  return u.toString();
}

const findings = [];
const consoleErrors = [];
const pageErrors = [];

function add(level, msg) {
  findings.push({ level, msg, at: new Date().toISOString() });
  console.log(`[${level}] ${msg}`);
}

function ymd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wirePage(page, tag) {
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ tag, text: msg.text() });
  });
  page.on('pageerror', err => {
    pageErrors.push({ tag, text: String(err?.message || err) });
  });
}

async function seedPlan(page) {
  const race = new Date();
  race.setDate(race.getDate() + 90);
  const raceDate = ymd(race);
  await page.evaluate(({ raceDate }) => {
    const plan = [];
    const start = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isRest = i % 7 === 0;
      plan.push({
        date: `${key}T00:00:00.000`,
        workoutType: isRest ? 'Rest' : 'Easy',
        description: isRest ? 'Rest' : 'Easy seed',
        distanceKm: isRest ? 0 : 8,
        // 至少一条带 details，供恢复后展开冒烟
        ...(isRest ? {} : {
          details: {
            warmup: { name: '热身', durationMins: 5 },
            main: [{ name: '主课', distanceKm: 8, pace: "5'30\"" }],
            cooldown: { name: '放松', durationMins: 5 },
          },
        }),
      });
    }
    const state = {
      state: {
        profile: {
          height: 170, weight: 60,
          pb5k: '22:00', pb10k: '46:00', pbHalf: '1:42:00', pbFull: '',
          lthr: 165, ltPace: '', raceDate, raceType: 'half', goalTime: '',
          intensity: 'moderate', longRunDay: 0,
        },
        plan,
        activeTab: 'profile',
        isPlanGenerated: true,
        planNeedsRegen: false,
        completions: { [plan[1].date.slice(0, 10)]: { status: 'full', rpe: 2 } },
        icuAthleteId: 'keep-local-athlete',
        myRaces: [],
        vacations: [],
        exportSync: {},
      },
      version: 4,
    };
    localStorage.setItem('marathon-training-storage', JSON.stringify(state));
  }, { raceDate });
  await page.reload({ waitUntil: 'networkidle' });
}

async function runViewport(browser, name, viewport, userAgent) {
  const context = await browser.newContext({
    viewport,
    userAgent: userAgent || undefined,
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  wirePage(page, name);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await seedPlan(page);

  // ── 布局：底栏可见、主内容不溢出严重 ──
  const nav = page.locator('nav.fixed.bottom-0');
  const navBox = await nav.boundingBox();
  if (navBox) add('OK', `${name}: bottom nav present y=${Math.round(navBox.y)}`);
  else add('FAIL', `${name}: bottom nav missing`);

  // ── 微信 UA ──
  const isWx = /MicroMessenger/i.test(userAgent || '');
  const banner = page.locator('[data-testid="wechat-escape-banner"]');
  const bannerCount = await banner.count();
  if (isWx) {
    if (bannerCount === 1) {
      add('OK', `${name}: wechat banner visible`);
      const text = await banner.innerText();
      if (text.includes('FIT') || text.includes('系统浏览器')) add('OK', `${name}: wechat banner text ok`);
      else add('WARN', `${name}: wechat banner text incomplete: ${text.slice(0, 80)}`);
      // 不遮挡底栏：banner 在文档流中，底栏 fixed
      const bBox = await banner.boundingBox();
      if (bBox && navBox && bBox.y + bBox.height < navBox.y - 4) {
        add('OK', `${name}: wechat banner above bottom nav`);
      } else if (bBox && navBox) {
        // 可能页面短，只要 banner 不是 fixed bottom 即可
        const pos = await banner.evaluate(el => getComputedStyle(el).position);
        if (pos !== 'fixed') add('OK', `${name}: wechat banner not fixed overlay (pos=${pos})`);
        else add('FAIL', `${name}: wechat banner may cover nav`);
      }
      await page.screenshot({ path: join(SHOT, `${name}-wechat-banner.png`), fullPage: false });
    } else {
      add('FAIL', `${name}: expected wechat banner, count=${bannerCount}`);
    }
  } else {
    if (bannerCount === 0) add('OK', `${name}: no wechat banner in normal browser`);
    else add('FAIL', `${name}: wechat banner leaked to normal browser`);
  }

  // ── 数据与备份卡片 ──
  const card = page.locator('[data-testid="data-backup-card"]');
  await card.scrollIntoViewIfNeeded();
  if (await card.count()) add('OK', `${name}: data-backup-card visible`);
  else add('FAIL', `${name}: data-backup-card missing`);

  // 导出备份
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.locator('[data-testid="backup-export"]').click(),
  ]);
  if (download) {
    const fname = download.suggestedFilename();
    if (/marathon-backup-\d{4}-\d{2}-\d{2}\.json/.test(fname)) {
      add('OK', `${name}: backup export filename ${fname}`);
    } else {
      add('WARN', `${name}: backup filename unexpected ${fname}`);
    }
    const path = await download.path();
    if (path) {
      const raw = readFileSync(path, 'utf8');
      const obj = JSON.parse(raw);
      if (obj.schema === 'marathon-backup' && obj.app === 'marathon-training' && obj.data) {
        add('OK', `${name}: backup payload schema ok`);
      } else add('FAIL', `${name}: backup payload invalid`);
      if (/icuApiKey|apiKey/i.test(raw)) add('FAIL', `${name}: backup leaked api key`);
      else add('OK', `${name}: backup no api key`);
    }
  } else {
    add('FAIL', `${name}: backup download not triggered`);
  }

  // 诊断导出
  const [diagDl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.locator('[data-testid="diag-export"]').click(),
  ]);
  if (diagDl) {
    const raw = readFileSync(await diagDl.path(), 'utf8');
    const obj = JSON.parse(raw);
    if (obj.schema === 'marathon-trial-diagnostic') add('OK', `${name}: diagnostic schema`);
    else add('FAIL', `${name}: diagnostic schema bad`);
    if (/pb5k|icuApiKey|athleteId|myRaces|"plan"/i.test(raw)) add('FAIL', `${name}: diagnostic sensitive leak`);
    else add('OK', `${name}: diagnostic privacy clean`);
  } else {
    add('FAIL', `${name}: diagnostic download missing`);
  }

  // 备份失败：恶意 JSON
  await page.evaluate(() => {
    const input = document.querySelector('[data-testid="backup-file-input"]');
    if (!input) return;
    const file = new File(['{"evil":true}'], 'bad.json', { type: 'application/json' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const errText = await page.locator('[data-testid="backup-feedback"]').textContent().catch(() => '');
  if (errText && (errText.includes('不') || errText.includes('合法') || errText.includes('格式'))) {
    add('OK', `${name}: backup reject bad json feedback`);
  } else {
    const anyErr = await page.locator('[data-testid="backup-feedback"]').count();
    if (anyErr) add('OK', `${name}: backup error feedback shown: ${errText}`);
    else add('FAIL', `${name}: no error feedback for bad json`);
  }

  // 损坏 details：main 非数组
  await page.evaluate(() => {
    const raw = localStorage.getItem('marathon-training-storage');
    const st = JSON.parse(raw).state || JSON.parse(raw);
    const payload = {
      schema: 'marathon-backup',
      version: 1,
      app: 'marathon-training',
      exportedAt: new Date().toISOString(),
      data: {
        profile: st.profile,
        plan: [{
          date: st.plan[0]?.date || '2026-07-01T00:00:00.000Z',
          workoutType: 'Easy',
          description: 'x',
          details: { main: 'broken' },
        }],
        completions: {},
        myRaces: [],
        vacations: [],
        isPlanGenerated: true,
        planNeedsRegen: false,
        exportSync: {},
      },
    };
    const input = document.querySelector('[data-testid="backup-file-input"]');
    const file = new File([JSON.stringify(payload)], 'bad-details.json', { type: 'application/json' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const badDetailsFb = await page.locator('[data-testid="backup-feedback"]').textContent().catch(() => '');
  if (badDetailsFb && /不合法|结构|格式/.test(badDetailsFb)) {
    add('OK', `${name}: reject damaged details`);
  } else {
    add('FAIL', `${name}: damaged details not rejected: ${badDetailsFb}`);
  }

  // 备份成功路径：构造合法备份（含 activeTab=calendar 以验证不跳走）
  const goodBackup = await page.evaluate(() => {
    const raw = localStorage.getItem('marathon-training-storage');
    const parsed = JSON.parse(raw || '{}');
    const st = parsed.state || parsed;
    return {
      schema: 'marathon-backup',
      version: 1,
      app: 'marathon-training',
      exportedAt: new Date().toISOString(),
      data: {
        profile: st.profile,
        plan: st.plan,
        completions: { '2099-01-01': { status: 'full', rpe: 1 } },
        myRaces: st.myRaces || [],
        vacations: st.vacations || [],
        isPlanGenerated: true,
        planNeedsRegen: false,
        exportSync: st.exportSync || {},
        activeTab: 'calendar',
      },
    };
  });

  await page.evaluate((payload) => {
    const input = document.querySelector('[data-testid="backup-file-input"]');
    const file = new File([JSON.stringify(payload)], 'good.json', { type: 'application/json' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, goodBackup);
  await page.waitForTimeout(500);
  const confirm = page.locator('[data-testid="backup-confirm"]');
  if (await confirm.count()) add('OK', `${name}: restore confirm dialog`);
  else add('FAIL', `${name}: restore confirm missing`);
  const overwriteText = await confirm.innerText().catch(() => '');
  if (overwriteText.includes('标签')) add('FAIL', `${name}: confirm lists activeTab`);
  else add('OK', `${name}: confirm fields omit activeTab`);

  // 取消
  await page.locator('[data-testid="backup-confirm-no"]').click();
  await page.waitForTimeout(300);
  const afterCancel = await page.evaluate(() => {
    const raw = localStorage.getItem('marathon-training-storage');
    const st = JSON.parse(raw).state || JSON.parse(raw);
    return st.completions?.['2099-01-01'] || null;
  });
  if (!afterCancel) add('OK', `${name}: cancel did not write state`);
  else add('FAIL', `${name}: cancel wrote completions`);

  // 再次选择并确认
  await page.evaluate((payload) => {
    const input = document.querySelector('[data-testid="backup-file-input"]');
    const file = new File([JSON.stringify(payload)], 'good2.json', { type: 'application/json' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, goodBackup);
  await page.waitForTimeout(400);
  await page.locator('[data-testid="backup-confirm-yes"]').click();
  await page.waitForTimeout(500);
  const afterOk = await page.evaluate(() => {
    const raw = localStorage.getItem('marathon-training-storage');
    const st = JSON.parse(raw).state || JSON.parse(raw);
    return {
      has: !!st.completions?.['2099-01-01'],
      tab: st.activeTab,
      athleteId: st.icuAthleteId || '',
    };
  });
  const memKey = await page.evaluate(() => {
    const raw = localStorage.getItem('marathon-training-storage') || '';
    return /icuApiKey/.test(raw);
  });
  if (afterOk.has) add('OK', `${name}: restore wrote completions`);
  else add('FAIL', `${name}: restore did not apply`);
  if (!memKey) add('OK', `${name}: persist storage has no icuApiKey field`);
  else add('FAIL', `${name}: icuApiKey in localStorage`);
  if (afterOk.tab === 'profile') add('OK', `${name}: restore stays on profile tab`);
  else add('FAIL', `${name}: restore jumped tab=${afterOk.tab}`);
  if (afterOk.athleteId === 'keep-local-athlete') add('OK', `${name}: athlete id preserved locally`);
  else add('FAIL', `${name}: athlete id not preserved: ${afterOk.athleteId}`);
  const successFb = await page.locator('[data-testid="backup-feedback"]').textContent().catch(() => '');
  if (successFb && successFb.includes('恢复成功')) add('OK', `${name}: restore success feedback visible`);
  else add('FAIL', `${name}: restore success feedback missing: ${successFb}`);

  // 恢复后进入训练页并展开带 details 的训练（不崩）
  await page.locator('nav.fixed.bottom-0 button').filter({ hasText: '训练' }).click().catch(async () => {
    // 底栏可能是图标+文案
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('nav.fixed.bottom-0 button')];
      const t = buttons.find(b => /训练|日历/.test(b.textContent || ''));
      t?.click();
    });
  });
  await page.waitForTimeout(500);
  // 点击第一条非休息课
  const workoutBtn = page.locator('button, [role="button"]').filter({ hasText: /Easy|主课|热身|Easy seed/ }).first();
  if (await workoutBtn.count()) {
    await workoutBtn.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  // 尝试展开 details（文案可能含热身/主课）
  const detailHit = await page.evaluate(() => {
    const text = document.body.innerText || '';
    return /热身|主课|放松|Easy seed/.test(text);
  });
  if (detailHit) add('OK', `${name}: calendar open after restore, details text present`);
  else add('WARN', `${name}: calendar content after restore not clearly expanded`);

  // 回到档案页
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('nav.fixed.bottom-0 button')];
    const t = buttons.find(b => /档案|我的/.test(b.textContent || ''));
    t?.click();
  });
  await page.waitForTimeout(300);

  // 微信关闭可再测 session（仅 wechat）
  if (isWx && bannerCount === 1) {
    await page.locator('[data-testid="wechat-dismiss"]').click().catch(() => {});
    await page.waitForTimeout(200);
    const afterDismiss = await page.locator('[data-testid="wechat-escape-banner"]').count();
    if (afterDismiss === 0) add('OK', `${name}: wechat dismiss hides banner`);
    else add('FAIL', `${name}: wechat dismiss failed`);
  }

  await page.screenshot({ path: join(SHOT, `${name}-final.png`), fullPage: true });
  await context.close();
}

/**
 * 普通页面（无验收 query）不得暴露导出测试钩子。
 */
async function assertNoExportHooksOnPlainPage(browser) {
  const name = 'export-hooks-plain';
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  wirePage(page, name);
  const plain = plainBaseUrl(BASE);
  await page.goto(plain, { waitUntil: 'networkidle' });
  const exposed = await page.evaluate(() => {
    if (!Object.prototype.hasOwnProperty.call(window, '__MARATHON_EXPORT_TEST__')) {
      return { exposed: false, value: undefined };
    }
    return { exposed: true, value: window.__MARATHON_EXPORT_TEST__ };
  });
  if (!exposed.exposed && exposed.value == null) {
    add('OK', `${name}: plain page has no __MARATHON_EXPORT_TEST__`);
  } else {
    add('FAIL', `${name}: plain page exposed export test hooks`);
  }
  await context.close();
}

/**
 * 导出 sheet 失败可见性：真实注入 FIT/ICS 抛错，断言 sheet 内错误、清理与重试。
 * 仅在 loopback + marathon_export_test=1 时 main.tsx 才挂载 hooks。
 */
async function checkExportSheetErrors(browser) {
  const name = 'export-sheet-errors';
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  wirePage(page, name);
  const testUrl = withExportTestParam(BASE);
  await page.goto(testUrl, { waitUntil: 'networkidle' });
  await seedPlan(page);
  // seedPlan reload 会丢掉 query：reload 后必须再带验收参数
  await page.goto(testUrl, { waitUntil: 'networkidle' });

  const hooksOk = await page.evaluate(() => {
    const h = window.__MARATHON_EXPORT_TEST__;
    return !!(h && typeof h.setFitDownloadOverride === 'function' && typeof h.setIcsDownloadOverride === 'function');
  });
  if (!hooksOk) {
    add('FAIL', `${name}: __MARATHON_EXPORT_TEST__ hooks missing on acceptance URL`);
    await context.close();
    return;
  }
  add('OK', `${name}: export test hooks present on acceptance URL`);

  // 进入训练页并打开导出 sheet
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('nav.fixed.bottom-0 button')];
    const t = buttons.find(b => /训练|日历/.test(b.textContent || ''));
    t?.click();
  });
  await page.waitForTimeout(400);
  const openBtn = page.locator('[data-testid="export-open"]');
  if (!(await openBtn.count())) {
    add('FAIL', `${name}: export-open missing`);
    await context.close();
    return;
  }
  await openBtn.click();
  await page.waitForTimeout(300);

  // ── FIT：注入抛错 → sheet 内可见中文 reason，不关闭 ──
  await page.evaluate(() => {
    window.__MARATHON_EXPORT_TEST__.setFitDownloadOverride(() => {
      throw new Error('encode boom');
    });
  });
  await page.locator('[data-testid="export-fit-open"]').click();
  await page.waitForTimeout(200);
  const fitAll = page.locator('[data-testid="export-fit-all"]');
  if (await fitAll.isDisabled()) {
    add('FAIL', `${name}: export-fit-all disabled, cannot simulate fail`);
  } else {
    await fitAll.click();
    await page.waitForTimeout(300);
    const fitErr = page.locator('[data-testid="export-error"]');
    const fitErrText = ((await fitErr.textContent().catch(() => '')) || '').trim();
    const stillOnRange = await page.locator('[data-testid="export-fit-range"]').count();
    if (stillOnRange && fitErrText && /失败|导出|重试/.test(fitErrText)) {
      add('OK', `${name}: FIT fail shows sheet error: ${fitErrText}`);
    } else {
      add('FAIL', `${name}: FIT fail error not visible (text=${fitErrText}, range=${stillOnRange})`);
    }

    // 返回菜单 → 错误清理
    await page.locator('[data-testid="export-fit-back"]').click();
    await page.waitForTimeout(200);
    const afterBack = await page.locator('[data-testid="export-error"]').count();
    if (afterBack === 0) add('OK', `${name}: FIT error cleared on back to menu`);
    else add('FAIL', `${name}: FIT error residual after back`);
  }

  // ── ICS：注入抛错 → 菜单视图内可见中文错误 ──
  await page.evaluate(() => {
    window.__MARATHON_EXPORT_TEST__.setIcsDownloadOverride(() => {
      throw new Error('ics boom');
    });
  });
  await page.locator('[data-testid="export-ics"]').click();
  await page.waitForTimeout(300);
  const icsErrText = ((await page.locator('[data-testid="export-error"]').textContent().catch(() => '')) || '').trim();
  if (icsErrText && /日历|导出|失败|重试/.test(icsErrText)) {
    add('OK', `${name}: ICS fail shows sheet error: ${icsErrText}`);
  } else {
    add('FAIL', `${name}: ICS fail error not visible: ${icsErrText}`);
  }

  // 切换到 FIT 范围 → 错误清理
  await page.locator('[data-testid="export-fit-open"]').click();
  await page.waitForTimeout(200);
  const afterSwitch = await page.locator('[data-testid="export-error"]').count();
  if (afterSwitch === 0) add('OK', `${name}: ICS error cleared when open FIT range`);
  else add('FAIL', `${name}: ICS error residual after view switch`);

  // 返回菜单再关闭 sheet → 重开无残留
  await page.locator('[data-testid="export-fit-back"]').click();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    // 点遮罩关闭（sheet 外层 fixed 容器）
    const sheets = [...document.querySelectorAll('.fixed.inset-0')];
    const exportSheet = sheets.find(el => el.textContent && el.textContent.includes('导出训练计划'));
    if (exportSheet) exportSheet.click();
  });
  await page.waitForTimeout(400);
  await openBtn.click();
  await page.waitForTimeout(250);
  const afterReopen = await page.locator('[data-testid="export-error"]').count();
  if (afterReopen === 0) add('OK', `${name}: no residual error after close+reopen`);
  else add('FAIL', `${name}: residual export error after reopen`);

  // ── FIT 重试成功：清除 override 为 no-op 成功，错误先被清、sheet 关闭 ──
  await page.evaluate(() => {
    window.__MARATHON_EXPORT_TEST__.setFitDownloadOverride(() => {
      throw new Error('still boom');
    });
  });
  await page.locator('[data-testid="export-fit-open"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-testid="export-fit-all"]').click();
  await page.waitForTimeout(250);
  const beforeRetry = await page.locator('[data-testid="export-error"]').count();
  if (!beforeRetry) add('FAIL', `${name}: setup fail before retry missing`);
  else {
    await page.evaluate(() => {
      window.__MARATHON_EXPORT_TEST__.setFitDownloadOverride(() => {
        /* no-op success: download triggered */
      });
    });
    await page.locator('[data-testid="export-fit-all"]').click();
    await page.waitForTimeout(400);
    const rangeGone = (await page.locator('[data-testid="export-fit-range"]').count()) === 0;
    const errGone = (await page.locator('[data-testid="export-error"]').count()) === 0;
    if (rangeGone && errGone) add('OK', `${name}: FIT retry success closes sheet, clears error`);
    else add('FAIL', `${name}: FIT retry success path broken rangeGone=${rangeGone} errGone=${errGone}`);
  }

  // 清理注入，避免污染后续
  await page.evaluate(() => {
    window.__MARATHON_EXPORT_TEST__.setFitDownloadOverride(null);
    window.__MARATHON_EXPORT_TEST__.setIcsDownloadOverride(null);
  });

  await page.screenshot({ path: join(SHOT, `${name}.png`), fullPage: false });
  await context.close();
}

async function checkStaticAssets() {
  const urls = [
    '/manifest.webmanifest',
    '/pwa-192x192.png',
    '/pwa-512x512.png',
    '/pwa-512x512-maskable.png',
    '/apple-touch-icon.png',
    '/favicon.svg',
  ];
  for (const u of urls) {
    try {
      const res = await fetch(BASE + u);
      if (res.ok) add('OK', `static ${u} → ${res.status}`);
      else add('FAIL', `static ${u} → ${res.status}`);
    } catch (e) {
      add('FAIL', `static ${u} error ${e.message}`);
    }
  }
  try {
    const res = await fetch(BASE + '/manifest.webmanifest');
    const m = await res.json();
    const pngs = (m.icons || []).filter(i => i.type === 'image/png');
    if (pngs.length >= 2) add('OK', `manifest has ${pngs.length} png icons`);
    else add('FAIL', `manifest png icons insufficient: ${pngs.length}`);
    const maskable = (m.icons || []).some(i => String(i.purpose || '').includes('maskable'));
    if (maskable) add('OK', 'manifest has maskable purpose');
    else add('FAIL', 'manifest missing maskable');
  } catch (e) {
    add('FAIL', `manifest parse ${e.message}`);
  }

  // 品牌色：PNG 采样应为绿色 #32D74B，不得为紫蓝
  try {
    const { chromium: cr } = await import('playwright');
    const b = await cr.launch({ headless: true });
    const p = await b.newPage();
    for (const [path, size] of [
      ['/pwa-192x192.png', 192],
      ['/pwa-512x512.png', 512],
      ['/apple-touch-icon.png', 180],
      ['/pwa-512x512-maskable.png', 512],
    ]) {
      const res = await fetch(BASE + path);
      const buf = Buffer.from(await res.arrayBuffer());
      const b64 = buf.toString('base64');
      const sample = await p.evaluate(async ({ b64, size }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await new Promise((r, j) => { img.onload = r; img.onerror = j; });
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const x = Math.floor(size * 0.25);
        const y = Math.floor(size * 0.25);
        const d = ctx.getImageData(x, y, 1, 1).data;
        return { w: img.naturalWidth, h: img.naturalHeight, r: d[0], g: d[1], b: d[2] };
      }, { b64, size });
      const green = sample.g > 180 && sample.g > sample.r && sample.g > sample.b && sample.b < 120;
      const purple = sample.b > 150 && sample.r > 100 && sample.g < sample.b;
      if (sample.w === size && sample.h === size && green && !purple) {
        add('OK', `icon brand ${path} ${size}x${size} green rgb(${sample.r},${sample.g},${sample.b})`);
      } else {
        add('FAIL', `icon brand ${path} bad size/color ${JSON.stringify(sample)}`);
      }
    }
    // favicon.svg 文本不得含旧紫
    const fav = await (await fetch(BASE + '/favicon.svg')).text();
    if (/#863bff|#7e14ff|purple/i.test(fav)) add('FAIL', 'favicon.svg still purple palette');
    else if (/#32D74B/i.test(fav) && /13\.49 5\.48/.test(fav)) add('OK', 'favicon.svg brand green + runner path');
    else add('FAIL', 'favicon.svg missing brand markers');
    await b.close();
  } catch (e) {
    add('FAIL', `icon brand check error ${e.message}`);
  }
}

async function main() {
  add('OK', `base ${BASE}`);
  await checkStaticAssets();

  const browser = await chromium.launch({ headless: true });
  const WECHAT_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002831) NetType/WIFI Language/zh_CN';

  // 普通本地 URL（无 query）不得暴露可改导出实现的 window 接口
  await assertNoExportHooksOnPlainPage(browser);

  await runViewport(browser, 'desktop-1280', { width: 1280, height: 800 }, null);
  await runViewport(browser, 'mobile-390', { width: 390, height: 844 }, null);
  await runViewport(browser, 'mobile-wechat-390', { width: 390, height: 844 }, WECHAT_UA);
  await runViewport(browser, 'desktop-wechat', { width: 1280, height: 800 }, WECHAT_UA);

  // FIT/ICS 导出失败 UI：须打开带 marathon_export_test=1 的 loopback URL
  await checkExportSheetErrors(browser);

  await browser.close();

  const ok = findings.filter(f => f.level === 'OK').length;
  const warn = findings.filter(f => f.level === 'WARN').length;
  const fail = findings.filter(f => f.level === 'FAIL').length;

  const report = {
    base: BASE,
    at: new Date().toISOString(),
    summary: { ok, warn, fail, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length },
    findings,
    consoleErrors,
    pageErrors,
  };

  writeFileSync(join(__dirname, 'browser-acceptance.json'), JSON.stringify(report, null, 2));
  const md = [
    '# PWA Foundation Browser Acceptance',
    '',
    `- base: ${BASE}`,
    `- at: ${report.at}`,
    `- OK ${ok} / WARN ${warn} / FAIL ${fail}`,
    `- consoleErrors ${consoleErrors.length}`,
    `- pageErrors ${pageErrors.length}`,
    '',
    '## Findings',
    ...findings.map(f => `- **${f.level}** ${f.msg}`),
    '',
  ].join('\n');
  writeFileSync(join(__dirname, 'browser-acceptance.md'), md);

  console.log(`\n── summary OK ${ok} / WARN ${warn} / FAIL ${fail} ──`);
  console.log(`consoleErrors ${consoleErrors.length} pageErrors ${pageErrors.length}`);
  if (fail > 0 || consoleErrors.length || pageErrors.length) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
