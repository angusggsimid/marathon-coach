/**
 * Marathon 上线前浏览器验收：桌面 + 手机视口
 * 用法：node acceptance-2026-07-13/browser-acceptance.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const SHOT = join(__dirname, 'screenshots');
mkdirSync(SHOT, { recursive: true });

const findings = [];
const consoleErrors = [];

function addFinding(level, msg) {
  findings.push({ level, msg, at: new Date().toISOString() });
  console.log(`[${level}] ${msg}`);
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function shot(page, name) {
  const path = join(SHOT, name);
  await page.screenshot({ path, fullPage: true });
  console.log('  📷', name);
  return path;
}

async function checkLayout(page, label) {
  const issues = await page.evaluate(() => {
    const out = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 2) {
      out.push(`horizontal-overflow: scrollWidth=${doc.scrollWidth} > innerWidth=${window.innerWidth}`);
    }
    // blank root?
    const root = document.getElementById('root');
    if (root && root.childElementCount === 0) out.push('blank-root');
    if (document.body.innerText.trim().length < 20) out.push('near-blank-body');
    return out;
  });
  for (const i of issues) addFinding('WARN', `${label}: ${i}`);
  if (!issues.length) addFinding('OK', `${label}: layout ok`);
}

async function fillProfile(page, { raceType, raceDate, pbFull, pbHalf, pb5k }) {
  // race type buttons
  const typeLabel = raceType === 'full' ? '全马' : '半马';
  await page.getByRole('button', { name: new RegExp(typeLabel) }).click();

  await page.locator('input[name="raceDate"]').fill(raceDate);

  // clear and fill performances
  if (pb5k) {
    await page.locator('input[name="pb5k"]').fill(pb5k);
  }
  // advanced for half/full PB
  if (pbHalf || pbFull) {
    const adv = page.getByRole('button', { name: '高级设置' });
    if (await adv.isVisible()) await adv.click();
    if (pbHalf) await page.locator('input[name="pbHalf"]').fill(pbHalf);
    if (pbFull) await page.locator('input[name="pbFull"]').fill(pbFull);
  }
}

async function generatePlan(page) {
  await page.getByRole('button', { name: /生成训练计划|重新生成/ }).click();
  // plan should switch to calendar
  await page.waitForTimeout(800);
}

async function runViewport(browser, viewport, tag) {
  console.log(`\n═══ ${tag} ${viewport.width}x${viewport.height} ═══`);
  const context = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // filter noisy expected
      if (/favicon|Download the React DevTools/i.test(t)) return;
      consoleErrors.push({ tag, text: t });
      pageErrors.push(t);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push({ tag, text: String(err) });
    pageErrors.push(String(err));
  });

  // 1. First load → profile
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(500);
  await shot(page, `${tag}-01-profile-first.png`);
  await checkLayout(page, `${tag} 首次档案页`);

  const bodyText = await page.locator('body').innerText();
  if (/三步开始|填写目标与成绩|档案/.test(bodyText)) {
    addFinding('OK', `${tag}: 首次进入档案页文案可见`);
  } else {
    addFinding('FAIL', `${tag}: 首次档案页未看到引导/标题文案`);
  }

  // 2. Full marathon only (pbFull only) — long enough window
  await fillProfile(page, {
    raceType: 'full',
    raceDate: futureDate(90),
    pbFull: '03:45:00',
  });
  // clear 5k if any default
  await page.locator('input[name="pb5k"]').fill('');
  await shot(page, `${tag}-02-full-only-form.png`);
  await generatePlan(page);
  await page.waitForTimeout(600);
  await shot(page, `${tag}-03-full-only-week.png`);

  let afterGen = await page.locator('body').innerText();
  if (/本周|训练|课/.test(afterGen)) {
    addFinding('OK', `${tag}: 仅全马成绩可生成计划并进入训练视图`);
  } else if (/无法生成|周期太短|至少填写/.test(afterGen)) {
    addFinding('FAIL', `${tag}: 仅全马成绩未能生成计划`);
  } else {
    addFinding('WARN', `${tag}: 仅全马生成后页面文案不明，需人工看截图`);
  }
  await checkLayout(page, `${tag} 全马计划本周`);

  // Adaptation banner (may or may not show without prior checkins)
  if (/自适应/.test(afterGen)) {
    addFinding('OK', `${tag}: 可见自适应相关文案`);
  } else {
    addFinding('OK', `${tag}: 无自适应横幅（无上周打卡时属预期）`);
  }

  // 3. Half marathon plan — go back to profile
  await page.getByRole('button', { name: '档案' }).click();
  await page.waitForTimeout(300);
  await fillProfile(page, {
    raceType: 'half',
    raceDate: futureDate(60),
    pbHalf: '01:45:00',
  });
  await page.locator('input[name="pb5k"]').fill('');
  await page.locator('input[name="pbFull"]').fill('').catch(() => {});
  await generatePlan(page);
  await page.waitForTimeout(600);
  await shot(page, `${tag}-04-half-week.png`);
  afterGen = await page.locator('body').innerText();
  if (/本周|训练/.test(afterGen)) {
    addFinding('OK', `${tag}: 半马计划生成进入训练页`);
  } else {
    addFinding('FAIL', `${tag}: 半马计划生成后未进入训练页`);
  }
  await checkLayout(page, `${tag} 半马本周`);

  // 4. Week view controls + month
  const weekBtn = page.getByRole('button', { name: '本周' });
  const monthBtn = page.getByRole('button', { name: '月历' });
  if (await weekBtn.count()) {
    await weekBtn.click();
    await page.waitForTimeout(200);
    await shot(page, `${tag}-05-week-view.png`);
    addFinding('OK', `${tag}: 本周视图可点`);
  } else {
    addFinding('WARN', `${tag}: 未找到「本周」按钮（可能已在本周）`);
  }
  if (await monthBtn.count()) {
    await monthBtn.click();
    await page.waitForTimeout(300);
    await shot(page, `${tag}-06-month-view.png`);
    await checkLayout(page, `${tag} 月历`);
    addFinding('OK', `${tag}: 月历视图可点`);
  } else {
    addFinding('FAIL', `${tag}: 未找到「月历」按钮`);
  }

  // 5. Training stats
  await page.getByRole('button', { name: '指标' }).click();
  await page.waitForTimeout(400);
  await shot(page, `${tag}-07-stats.png`);
  const statsText = await page.locator('body').innerText();
  if (/Zone|配速|区间|小白|EvoLab|Intervals/i.test(statsText)) {
    addFinding('OK', `${tag}: 训练指标页有区间/说明文案`);
  } else {
    addFinding('FAIL', `${tag}: 指标页内容缺失`);
  }
  await checkLayout(page, `${tag} 指标`);

  // 6. Races search + detail
  await page.getByRole('button', { name: '赛事' }).click();
  await page.waitForTimeout(1200); // load races.json
  await shot(page, `${tag}-08-races.png`);
  const raceText = await page.locator('body').innerText();
  if (/赛事|搜索|马拉松|报名|更新/.test(raceText)) {
    addFinding('OK', `${tag}: 赛事页加载`);
  } else {
    addFinding('FAIL', `${tag}: 赛事页空白或异常`);
  }
  await checkLayout(page, `${tag} 赛事列表`);

  // try search
  const search = page.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="赛事"]').first();
  if (await search.count()) {
    await search.fill('上海');
    await page.waitForTimeout(500);
    await shot(page, `${tag}-09-races-search.png`);
    addFinding('OK', `${tag}: 赛事搜索可输入`);
  } else {
    addFinding('WARN', `${tag}: 未找到赛事搜索框`);
  }

  // 赛事列表卡：w-full + flex + gap-3；排除筛选/分区头（justify-between 或无 gap-3）
  const raceRow = page
    .locator('button.w-full.flex.items-center.gap-3')
    .filter({ hasText: /马拉松|公路跑|越野/ })
    .first();
  let openedDetail = false;
  if ((await raceRow.count()) > 0) {
    await raceRow.scrollIntoViewIfNeeded();
    await raceRow.click();
    await page.waitForTimeout(700);
    openedDetail = true;
  }
  if (openedDetail) {
    await shot(page, `${tag}-10-race-detail.png`);
    // 可验证 sheet：固定遮罩层 z-[70] + 底部面板 + 动作按钮
    const sheetRoot = page.locator('div.fixed.inset-0').filter({
      has: page.locator('div.rounded-t-3xl'),
    });
    const sheetPanel = sheetRoot.locator('div.rounded-t-3xl').first();
    const actionBtn = sheetRoot.getByRole('button', {
      name: /加入我的赛事|更新目标|设为目标/,
    });
    const sheetVisible =
      (await sheetRoot.count()) > 0 &&
      (await sheetRoot.first().isVisible()) &&
      (await sheetPanel.isVisible()) &&
      (await actionBtn.count()) > 0 &&
      (await actionBtn.first().isVisible());
    const detail = (await sheetPanel.innerText().catch(() => '')) || '';
    const hasFields = /日期|城市|赛道|数据来源|多源确认|参赛目标|报名/.test(detail);
    if (sheetVisible && hasFields) {
      addFinding('OK', `${tag}: 赛事详情 sheet 可见（遮罩+面板+动作按钮+字段）`);
    } else if (sheetVisible) {
      addFinding('WARN', `${tag}: 详情 sheet 打开但字段文案不足，见截图`);
    } else {
      addFinding(
        'FAIL',
        `${tag}: 点击赛事行后详情 sheet 未打开（root=${await sheetRoot.count()} action=${await actionBtn.count()}）`,
      );
    }
    await checkLayout(page, `${tag} 赛事详情`);
    // 关闭：点遮罩或 Escape（关闭钮是 X icon，无可靠文案）
    await page.keyboard.press('Escape').catch(() => {});
    if (await sheetRoot.count()) {
      await sheetRoot.first().click({ position: { x: 10, y: 10 } }).catch(() => {});
    }
    await page.waitForTimeout(200);
  } else {
    addFinding('WARN', `${tag}: 未点到赛事条目（button.w-full.flex.gap-3）`);
  }

  // 7. Intervals.icu settings via export on calendar
  await page.getByRole('button', { name: '训练' }).click();
  await page.waitForTimeout(400);
  const exportBtn = page.getByRole('button', { name: /导出/ });
  if (await exportBtn.count()) {
    await exportBtn.first().click();
    await page.waitForTimeout(400);
    await shot(page, `${tag}-11-export-menu.png`);
    const icuBtn = page.getByText(/Intervals\.icu|同步到 Intervals/i);
    if (await icuBtn.count()) {
      await icuBtn.first().click();
      await page.waitForTimeout(400);
      await shot(page, `${tag}-12-intervals-setup.png`);
      const icuText = await page.locator('body').innerText();
      if (/API Key|Athlete|会话|不会写入本地/.test(icuText)) {
        addFinding('OK', `${tag}: Intervals.icu 设置页可见安全提示与字段`);
      } else {
        addFinding('FAIL', `${tag}: Intervals.icu 设置页缺少预期文案`);
      }
      await checkLayout(page, `${tag} Intervals 设置`);
    } else {
      addFinding('FAIL', `${tag}: 导出菜单无 Intervals.icu 入口`);
    }
  } else {
    addFinding('FAIL', `${tag}: 训练页无导出按钮`);
  }

  if (pageErrors.length) {
    addFinding('FAIL', `${tag}: 控制台错误 ${pageErrors.length} 条 — ${pageErrors.slice(0, 3).join(' | ')}`);
  } else {
    addFinding('OK', `${tag}: 无 pageerror / console.error`);
  }

  await context.close();
}

async function main() {
  console.log('Base URL:', BASE);
  // wait for server
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok || r.status === 200) break;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
    if (i === 39) throw new Error('Server not ready: ' + BASE);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, { width: 1280, height: 800 }, 'desktop');
    await runViewport(browser, { width: 390, height: 844 }, 'mobile');
  } finally {
    await browser.close();
  }

  const report = {
    base: BASE,
    finishedAt: new Date().toISOString(),
    findings,
    consoleErrors,
    summary: {
      ok: findings.filter(f => f.level === 'OK').length,
      warn: findings.filter(f => f.level === 'WARN').length,
      fail: findings.filter(f => f.level === 'FAIL').length,
    },
  };
  const out = join(__dirname, 'browser-acceptance.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  const md = [
    '# 浏览器验收报告',
    '',
    `- base: ${BASE}`,
    `- finishedAt: ${report.finishedAt}`,
    `- OK: ${report.summary.ok}  WARN: ${report.summary.warn}  FAIL: ${report.summary.fail}`,
    `- consoleErrors: ${consoleErrors.length}`,
    '',
    '## Findings',
    ...findings.map(f => `- **${f.level}** ${f.msg}`),
    '',
    '## Console errors',
    ...(consoleErrors.length ? consoleErrors.map(e => `- [${e.tag}] ${e.text}`) : ['- (none)']),
  ].join('\n');
  writeFileSync(join(__dirname, 'browser-acceptance.md'), md);
  console.log('\n' + md);
  console.log('\nWrote', out);
  if (report.summary.fail > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
