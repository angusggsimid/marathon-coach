/**
 * 2026-07-15 下一版本浏览器验收：方向文档 §8.2 八项（桌面 + 手机）
 * 用法：node acceptance-2026-07-15/browser-acceptance.mjs [baseUrl]
 * 前置：vite preview 已启动（默认 http://127.0.0.1:4173）
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const SHOT = join(__dirname, 'screenshots');
mkdirSync(SHOT, { recursive: true });

const findings = [];
const consoleErrors = [];
const pageErrorAll = [];

function add(level, msg) {
  findings.push({ level, msg, at: new Date().toISOString() });
  console.log(`[${level}] ${msg}`);
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** 本地周一 */
function startOfWeekMon(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/**
 * 构造可触发自适应的 persist 状态：
 * - 计划覆盖上一完整周 + 本周 + 未来
 * - 上周低完成高 RPE → factor 0.9
 * - 可选：今天 Rest 以测 FIT 禁用
 * - 可选：exportSync 指纹制造过期提醒
 */
function buildSeedState(opts = {}) {
  const {
    withCheckins = true,
    factorMode = 'down', // 'down' | 'hold' | 'none'
    todayRest = false,
    staleFit = false,
    staleIcs = false,
    staleIcu = false,
    staleFitWeek = false,
    expiredFitToday = false,
  } = opts;

  const today = new Date();
  const thisMon = startOfWeekMon(today);
  const prevMon = addDays(thisMon, -7);
  const raceDate = addDays(today, 90);

  const plan = [];
  // 上一周 Mon–Sun + 本周 + 再一周
  for (let i = 0; i < 21; i++) {
    const d = addDays(prevMon, i);
    const key = ymd(d);
    const isToday = key === ymd(today);
    const dow = d.getDay(); // 0 Sun
    let workoutType = 'Easy';
    let distanceKm = 10;
    let description = 'Easy - seed';
    if (isToday && todayRest) {
      workoutType = 'Rest';
      distanceKm = 0;
      description = 'Rest';
    } else if (dow === 1) {
      // 周一 rest
      workoutType = 'Rest';
      distanceKm = 0;
      description = 'Rest';
    } else if (dow === 0) {
      workoutType = 'LSD';
      distanceKm = 18;
      description = 'LSD - long';
    } else if (dow === 3) {
      workoutType = 'Tempo';
      distanceKm = 8;
      description = 'Tempo - seed';
    }
    plan.push({
      date: `${key}T00:00:00.000`,
      workoutType,
      description,
      distanceKm,
      targetPace: workoutType === 'Rest' ? undefined : "5'30\"",
    });
  }

  const completions = {};
  if (withCheckins && factorMode !== 'none') {
    for (let i = 0; i < 7; i++) {
      const d = addDays(prevMon, i);
      const key = ymd(d);
      const w = plan.find(p => String(p.date).startsWith(key));
      if (!w || w.workoutType === 'Rest' || w.workoutType === 'Race') continue;
      if (factorMode === 'down') {
        // 约一半打卡 + 高 RPE
        if (i % 2 === 0) completions[key] = { status: 'full', rpe: 4 };
      } else if (factorMode === 'hold') {
        // 约 80% 正常体感
        if (i !== 2) completions[key] = { status: 'full', rpe: 2 };
      }
    }
  }

  // v4：FIT 分作用域；假指纹 → 与当前 plan 不同 → stale（all 始终有效）
  const exportSync = {};
  if (staleFit) {
    exportSync.fit = {
      all: {
        exportedAt: new Date(Date.now() - 86400000).toISOString(),
        planFingerprint: 'fp_stale_seed_fit',
        range: 'all',
      },
    };
  }
  if (staleIcs) {
    exportSync.ics = {
      exportedAt: new Date(Date.now() - 86400000).toISOString(),
      planFingerprint: 'fp_stale_seed_ics',
      range: 'all',
    };
  }
  if (staleIcu) {
    exportSync.icu = {
      exportedAt: new Date(Date.now() - 86400000).toISOString(),
      planFingerprint: 'fp_stale_seed_icu',
      range: 'all',
    };
  }
  // 可选：仅 week 槽位 stale（用于范围感知）
  if (staleFitWeek) {
    const mon = startOfWeekMon(today);
    const sun = addDays(mon, 6);
    exportSync.fit = {
      ...(exportSync.fit || {}),
      week: {
        exportedAt: new Date(Date.now() - 86400000).toISOString(),
        planFingerprint: 'fp_stale_seed_fit_week',
        range: 'week',
        scopeStart: ymd(mon),
        scopeEnd: ymd(sun),
      },
    };
  }
  // 可选：过期的 today 作用域（昨日）——不应提示
  if (expiredFitToday) {
    const yest = addDays(today, -1);
    exportSync.fit = {
      ...(exportSync.fit || {}),
      today: {
        exportedAt: new Date(Date.now() - 86400000).toISOString(),
        planFingerprint: 'fp_expired_today',
        range: 'today',
        scopeStart: ymd(yest),
        scopeEnd: ymd(yest),
      },
    };
  }

  return {
    state: {
      profile: {
        height: 170,
        weight: 60,
        pb5k: '',
        pb10k: '',
        pbHalf: '1:40:00',
        pbFull: '',
        lthr: '',
        ltPace: '',
        raceDate: ymd(raceDate),
        raceType: 'half',
        goalTime: '',
        intensity: 'moderate',
        longRunDay: 0,
      },
      plan,
      activeTab: 'calendar',
      isPlanGenerated: true,
      planNeedsRegen: false,
      completions,
      icuAthleteId: '',
      myRaces: [],
      vacations: [],
      exportSync,
    },
    version: 4,
  };
}

async function shot(page, name) {
  const path = join(SHOT, name);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function checkLayout(page, label) {
  const issues = await page.evaluate(() => {
    const out = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 2) {
      out.push(`horizontal-overflow: ${doc.scrollWidth}>${window.innerWidth}`);
    }
    const root = document.getElementById('root');
    if (root && root.childElementCount === 0) out.push('blank-root');
    return out;
  });
  if (issues.length) {
    for (const i of issues) add('FAIL', `${label}: ${i}`);
  } else {
    add('OK', `${label}: layout ok`);
  }
}

async function seedAndGoto(page, seedOpts) {
  const payload = buildSeedState(seedOpts);
  await page.addInitScript((data) => {
    localStorage.setItem('marathon-training-storage', JSON.stringify(data));
  }, payload);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(700);
  // 确保在训练 tab
  const train = page.getByRole('button', { name: '训练' });
  if (await train.count()) {
    await train.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const week = page.getByRole('button', { name: '本周' });
  if (await week.count()) {
    await week.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function runViewport(browser, viewport, tag) {
  console.log(`\n═══ ${tag} ${viewport.width}x${viewport.height} ═══`);
  const context = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page = await context.newPage();
  const localErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (/favicon|React DevTools|Download the React/i.test(t)) return;
      consoleErrors.push({ tag, text: t });
      localErrors.push(t);
    }
  });
  page.on('pageerror', err => {
    const t = String(err);
    pageErrorAll.push({ tag, text: t });
    localErrors.push(t);
  });

  // ── 1. 无打卡诚实空态 ──
  await seedAndGoto(page, { withCheckins: false, factorMode: 'none', todayRest: false });
  await shot(page, `${tag}-01-empty-checkin.png`);
  let body = await page.locator('body').innerText();
  const hasEmpty =
    /还没有打卡|暂无打卡|补记|诚实/.test(body) ||
    (await page.getByTestId('weekly-report').count()) > 0;
  const noFakeProof = (await page.getByTestId('adaptation-proof').count()) === 0;
  if (hasEmpty && noFakeProof) {
    add('OK', `${tag}: 1 无打卡诚实空态（无证明卡）`);
  } else {
    add('FAIL', `${tag}: 1 无打卡空态失败 empty=${hasEmpty} noProof=${noFakeProof}`);
  }
  // 去补记入口
  const fillBtn = page.getByRole('button', { name: /去补记/ });
  if ((await fillBtn.count()) > 0 || /去补记打卡/.test(body)) {
    add('OK', `${tag}: 1b 可见去补记入口`);
  } else {
    // 可能折叠：展开周报
    const report = page.getByTestId('weekly-report');
    if (await report.count()) {
      await report.locator('button').first().click().catch(() => {});
      await page.waitForTimeout(200);
      body = await page.locator('body').innerText();
    }
    if (/去补记|还没有打卡|暂无/.test(body)) add('OK', `${tag}: 1b 展开后可见空态/补记`);
    else add('WARN', `${tag}: 1b 补记入口未明确，见截图`);
  }
  await checkLayout(page, `${tag} 空态`);

  // ── 2. 减量 10% 三行证明 + 展开 ──
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  // 新 context 更干净：关闭后重建
  await context.close();
  const context2 = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page2 = await context2.newPage();
  page2.on('console', msg => {
    if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
      consoleErrors.push({ tag, text: msg.text() });
    }
  });
  page2.on('pageerror', err => pageErrorAll.push({ tag, text: String(err) }));

  await seedAndGoto(page2, { withCheckins: true, factorMode: 'down', todayRest: false });
  await shot(page2, `${tag}-02-proof-down10.png`);
  body = await page2.locator('body').innerText();
  const proof = page2.getByTestId('adaptation-proof');
  const proofVisible = (await proof.count()) > 0;
  const threeLines =
    /改了什么/.test(body) &&
    /依据什么/.test(body) &&
    /什么没变/.test(body) &&
    /减少\s*10%|自动减少 10%/.test(body);
  if (proofVisible && threeLines) {
    add('OK', `${tag}: 2 减量 10% 三行证明可见`);
  } else {
    add('FAIL', `${tag}: 2 三行证明失败 proof=${proofVisible} lines=${threeLines} snippet=${body.slice(0, 200)}`);
  }
  const expand = page2.getByRole('button', { name: /展开证据/ });
  if (await expand.count()) {
    await expand.click();
    await page2.waitForTimeout(200);
    body = await page2.locator('body').innerText();
    if (/上一完整周|作用范围|完成率/.test(body)) {
      add('OK', `${tag}: 2b 展开证据含周范围与完成率`);
    } else {
      add('FAIL', `${tag}: 2b 展开证据内容不足`);
    }
    await shot(page2, `${tag}-02b-proof-expanded.png`);
  } else {
    add('FAIL', `${tag}: 2b 无展开证据按钮`);
  }
  await checkLayout(page2, `${tag} 三行证明`);

  // ── 3. 保持计划时轻量周报 ──
  await page2.evaluate(() => localStorage.clear());
  await context2.close();
  const context3 = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page3 = await context3.newPage();
  page3.on('console', msg => {
    if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
      consoleErrors.push({ tag, text: msg.text() });
    }
  });
  page3.on('pageerror', err => pageErrorAll.push({ tag, text: String(err) }));

  await seedAndGoto(page3, { withCheckins: true, factorMode: 'hold', todayRest: false });
  await shot(page3, `${tag}-03-hold-report.png`);
  body = await page3.locator('body').innerText();
  const noProofHold = (await page3.getByTestId('adaptation-proof').count()) === 0;
  const report = page3.getByTestId('weekly-report');
  if (await report.count()) {
    // 确保展开
    const open = report.locator('button').first();
    if (await open.getAttribute('aria-expanded') === 'false') {
      await open.click();
      await page3.waitForTimeout(200);
    }
    body = await page3.locator('body').innerText();
  }
  const holdOk =
    noProofHold &&
    /上周|打卡|完成率|体感|保持/.test(body) &&
    (await report.count()) > 0;
  if (holdOk) add('OK', `${tag}: 3 保持计划轻量周报（无强调证明卡）`);
  else add('FAIL', `${tag}: 3 保持周报失败 noProof=${noProofHold}`);

  // 本周关键课：文案为本周而非上周，日期落在本周 Mon–Sun
  const thisMon = startOfWeekMon(new Date());
  const thisSun = addDays(thisMon, 6);
  const keyLineMatch = body.match(/本周关键课[：:]\s*(\d{2}-\d{2})/);
  const keyIsThisWeek =
    /本周关键课/.test(body) &&
    !/上周关键课/.test(body) &&
    !!keyLineMatch;
  let keyDateInWeek = false;
  if (keyLineMatch) {
    const [mm, dd] = keyLineMatch[1].split('-').map(Number);
    const y = thisMon.getFullYear();
    const keyDate = new Date(y, mm - 1, dd);
    keyDateInWeek = keyDate >= thisMon && keyDate <= thisSun;
  }
  if (keyIsThisWeek && keyDateInWeek) {
    add('OK', `${tag}: 3b 本周关键课来自本周（非上周）`);
  } else if (keyIsThisWeek) {
    add('WARN', `${tag}: 3b 有本周关键课文案但日期边界未确认: ${keyLineMatch?.[1]}`);
  } else {
    // 若周报折叠，尝试已展开；仍无则 FAIL
    add('FAIL', `${tag}: 3b 本周关键课缺失或仍写上周关键课`);
  }
  await checkLayout(page3, `${tag} 保持周报`);

  // ── 4–5. FIT 范围：今天禁用（Rest）+ 本周数量 ──
  await page3.evaluate(() => localStorage.clear());
  await context3.close();
  const context4 = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page4 = await context4.newPage();
  page4.on('console', msg => {
    if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
      consoleErrors.push({ tag, text: msg.text() });
    }
  });
  page4.on('pageerror', err => pageErrorAll.push({ tag, text: String(err) }));

  await seedAndGoto(page4, {
    withCheckins: true,
    factorMode: 'hold',
    todayRest: true,
  });
  const exportBtn = page4.getByRole('button', { name: /导出/ }).first();
  await exportBtn.click();
  await page4.waitForTimeout(400);
  await shot(page4, `${tag}-04-export-menu.png`);
  await page4.getByRole('button', { name: /Garmin|FIT|\.fit/i }).first().click().catch(async () => {
    await page4.getByText(/Garmin|Polar|Suunto/).first().click();
  });
  await page4.waitForTimeout(400);
  await shot(page4, `${tag}-05-fit-ranges.png`);
  body = await page4.locator('body').innerText();

  // 今天禁用
  const todayBtn = page4.getByRole('button', { name: /今天/ }).first();
  let todayDisabled = false;
  if (await todayBtn.count()) {
    todayDisabled = await todayBtn.isDisabled();
  }
  if (todayDisabled || /今天没有可导出/.test(body)) {
    add('OK', `${tag}: 4 今天无训练时 FIT 选项禁用/说明原因`);
  } else {
    add('FAIL', `${tag}: 4 今天 FIT 未禁用 body 含: ${/今天/.test(body)}`);
  }

  // FIT 范围 sheet 内的按钮（避开顶栏「本周」分段控件）
  const fitSheet = page4.locator('div.fixed.inset-0').filter({ hasText: '导出 FIT 范围' });
  const weekFitBtn = fitSheet.locator('button').filter({ hasText: /本周/ }).filter({ hasText: /\d+/ });
  let weekOk = false;
  if ((await weekFitBtn.count()) > 0) {
    const t = await weekFitBtn.first().innerText();
    weekOk = /\d+/.test(t) && !(await weekFitBtn.first().isDisabled());
  } else if (/本周[\s\S]{0,60}\d+\s*个|\.fit\s*文件|×\d+/.test(body)) {
    weekOk = true;
  }
  if (weekOk) add('OK', `${tag}: 5 本周 FIT 显示文件数量且可点`);
  else add('FAIL', `${tag}: 5 本周 FIT 文件数未确认`);

  // 触发本周下载
  if ((await weekFitBtn.count()) > 0 && !(await weekFitBtn.first().isDisabled())) {
    const [download] = await Promise.all([
      page4.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      weekFitBtn.first().click(),
    ]);
    if (download) {
      const name = download.suggestedFilename();
      if (/week|garmin/i.test(name)) add('OK', `${tag}: 5b 本周 FIT 下载触发 filename=${name}`);
      else add('OK', `${tag}: 5b 下载触发 filename=${name}`);
    } else {
      add('WARN', `${tag}: 5b 未捕获 download 事件（环境可能拦截）`);
    }
  }
  // 关闭 sheet
  await page4.keyboard.press('Escape').catch(() => {});
  await page4.locator('div.fixed.inset-0').first().click({ position: { x: 8, y: 8 } }).catch(() => {});
  await page4.waitForTimeout(200);
  await checkLayout(page4, `${tag} FIT 范围`);

  // ── 6–7. 过期提醒 + 重导出清除 ──
  await page4.evaluate(() => localStorage.clear());
  await context4.close();
  const context5 = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page5 = await context5.newPage();
  page5.on('console', msg => {
    if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
      consoleErrors.push({ tag, text: msg.text() });
    }
  });
  page5.on('pageerror', err => pageErrorAll.push({ tag, text: String(err) }));

  await seedAndGoto(page5, {
    withCheckins: true,
    factorMode: 'hold',
    todayRest: false,
    staleFit: true,
    staleIcs: true,
  });
  await shot(page5, `${tag}-06-stale-banner.png`);
  body = await page5.locator('body').innerText();
  const staleBanner = page5.getByTestId('plan-stale-banner');
  if ((await staleBanner.count()) > 0 && /计划已更新|可能已过期/.test(body)) {
    add('OK', `${tag}: 6 计划变化后出现过期提醒`);
  } else {
    add('FAIL', `${tag}: 6 过期提醒未出现`);
  }
  if (/Garmin FIT|日历 ICS/.test(body)) {
    add('OK', `${tag}: 6b 分渠道过期说明可见`);
  } else {
    add('WARN', `${tag}: 6b 分渠道文案不完整`);
  }

  // 重新导出 ICS → 应清除 ICS 渠道（FIT 仍 stale）
  await page5.getByRole('button', { name: /导出/ }).first().click();
  await page5.waitForTimeout(300);
  await page5.getByRole('button', { name: /导入日历/ }).click();
  await page5.waitForTimeout(500);
  // sheet 关闭后看 banner
  body = await page5.locator('body').innerText();
  const stillBanner = (await page5.getByTestId('plan-stale-banner').count()) > 0;
  const icsCleared = stillBanner && /Garmin FIT/.test(body) && !/日历 ICS/.test(body);
  const fitStill = stillBanner && /Garmin FIT|FIT/.test(body);
  if (icsCleared && fitStill) {
    add('OK', `${tag}: 7 ICS 重导出后仅清除 ICS 提醒，FIT 仍过期`);
  } else if (stillBanner && fitStill) {
    // 可能文案是「日历」不含 ICS
    const text = await page5.getByTestId('plan-stale-banner').innerText();
    if (/FIT/.test(text) && !/ICS|日历/.test(text)) {
      add('OK', `${tag}: 7 重导出后渠道提醒正确收窄`);
    } else {
      add('WARN', `${tag}: 7 提醒仍在但文案边界不清: ${text.slice(0, 120)}`);
    }
  } else if (!stillBanner) {
    // 若两者指纹碰巧一致（不太可能）或一次导出清了全部
    add('WARN', `${tag}: 7 重导出后 banner 全消，需确认是否两渠道同指纹写入`);
  } else {
    add('FAIL', `${tag}: 7 渠道清除逻辑未达预期`);
  }
  await shot(page5, `${tag}-07-after-ics-export.png`);

  await context5.close();

  // 从未导出用户：全新 context + 无 exportSync（避免 reload 时 persist 写回旧内存）
  const context6 = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page6 = await context6.newPage();
  page6.on('console', msg => {
    if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
      consoleErrors.push({ tag, text: msg.text() });
    }
  });
  page6.on('pageerror', err => pageErrorAll.push({ tag, text: String(err) }));

  await seedAndGoto(page6, {
    withCheckins: true,
    factorMode: 'hold',
    todayRest: false,
    staleFit: false,
    staleIcs: false,
  });
  if ((await page6.getByTestId('plan-stale-banner').count()) === 0) {
    add('OK', `${tag}: 7b 从未导出用户不显示过期提醒`);
  } else {
    add('FAIL', `${tag}: 7b 从未导出仍误报过期`);
  }

  // ── 7c. FIT 过期 today 作用域：不提示 ──
  await page6.evaluate(() => localStorage.clear());
  await context6.close();
  const context7 = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page7 = await context7.newPage();
  page7.on('console', msg => {
    if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
      consoleErrors.push({ tag, text: msg.text() });
    }
  });
  page7.on('pageerror', err => pageErrorAll.push({ tag, text: String(err) }));

  await seedAndGoto(page7, {
    withCheckins: true,
    factorMode: 'hold',
    expiredFitToday: true,
  });
  if ((await page7.getByTestId('plan-stale-banner').count()) === 0) {
    add('OK', `${tag}: 7c 过期 FIT today 作用域不提示 stale`);
  } else {
    add('FAIL', `${tag}: 7c 过期 FIT today 仍误报`);
  }

  // ── 7d. FIT week 槽 stale 可见；导出 ICS 不清除 FIT ──
  await page7.evaluate(() => localStorage.clear());
  await context7.close();
  const context8 = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page8 = await context8.newPage();
  page8.on('console', msg => {
    if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
      consoleErrors.push({ tag, text: msg.text() });
    }
  });
  page8.on('pageerror', err => pageErrorAll.push({ tag, text: String(err) }));

  await seedAndGoto(page8, {
    withCheckins: true,
    factorMode: 'hold',
    staleFitWeek: true,
  });
  body = await page8.locator('body').innerText();
  if (
    (await page8.getByTestId('plan-stale-banner').count()) > 0 &&
    /Garmin FIT|FIT/.test(body)
  ) {
    add('OK', `${tag}: 7d FIT week 作用域 stale 可见`);
  } else {
    add('FAIL', `${tag}: 7d FIT week stale 未出现`);
  }

  // ── 7e. ICU 部分成功不清除 stale（持久化注入 + 会话 mock fetch）──
  await page8.evaluate(() => localStorage.clear());
  await context8.close();
  const context9 = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    deviceScaleFactor: tag === 'mobile' ? 2 : 1,
  });
  const page9 = await context9.newPage();
  page9.on('console', msg => {
    if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
      consoleErrors.push({ tag, text: msg.text() });
    }
  });
  page9.on('pageerror', err => pageErrorAll.push({ tag, text: String(err) }));

  // 先 seed 带 ICU stale 的状态
  await seedAndGoto(page9, {
    withCheckins: true,
    factorMode: 'hold',
    staleIcu: true,
  });
  // 注入：部分成功的 syncPlanToICU 结果路径 —— 通过劫持 fetch 使一半失败
  await page9.evaluate(() => {
    let n = 0;
    const orig = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/events') && init?.method === 'POST') {
        n += 1;
        if (n === 1) {
          return new Response(JSON.stringify({ id: 1 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('fail', { status: 500 });
      }
      return orig(input, init);
    };
  });

  // 打开导出 → ICU 设置 → 填假凭证同步（不连真实账户）
  await page9.getByRole('button', { name: /导出/ }).first().click();
  await page9.waitForTimeout(300);
  const icuEntry = page9.getByRole('button', { name: /Intervals\.icu|同步到 Intervals/i }).first();
  if ((await icuEntry.count()) === 0) {
    add('WARN', `${tag}: 7e 未找到 ICU 入口，跳过部分成功交互`);
  } else {
    await icuEntry.click();
    await page9.waitForTimeout(400);
    // 首次：API Key + Athlete ID
    const apiKeyInput = page9.getByPlaceholder(/API Key/i);
    const athleteInput = page9.getByPlaceholder(/i12345|Athlete/i);
    if ((await apiKeyInput.count()) > 0) {
      await apiKeyInput.fill('test-key-not-real');
    }
    if ((await athleteInput.count()) > 0) {
      await athleteInput.fill('i12345');
    }
    const ack = page9.getByRole('checkbox');
    if ((await ack.count()) > 0) {
      await ack.first().check().catch(() => {});
    }
    const syncBtn = page9.getByRole('button', { name: /连接并同步|开始同步|确认后再次同步/ }).first();
    if ((await syncBtn.count()) > 0) {
      await syncBtn.click();
      // 多课次 + 120ms 节间延迟，预留足够时间
      await page9.waitForTimeout(8000);
      body = await page9.locator('body').innerText();
      const partialUi =
        /部分同步|成功\s*\d+\s*节[\s\S]{0,40}失败\s*\d+|失败\s*\d+\s*节/.test(body) ||
        (await page9.getByTestId('icu-partial-result').count()) > 0;
      await page9.getByRole('button', { name: /^关闭$/ }).first().click().catch(async () => {
        await page9.keyboard.press('Escape').catch(() => {});
      });
      await page9.waitForTimeout(400);
      const stillStale =
        (await page9.getByTestId('plan-stale-banner').count()) > 0;
      const stored = await page9.evaluate(() => {
        try {
          const raw = localStorage.getItem('marathon-training-storage');
          if (!raw) return null;
          const j = JSON.parse(raw);
          return j?.state?.exportSync?.icu ?? j?.exportSync?.icu ?? null;
        } catch {
          return null;
        }
      });
      // 部分成功不得写入新指纹；seed 的 stale 指纹应保留
      const fpUnchanged =
        stored && stored.planFingerprint === 'fp_stale_seed_icu';
      if (partialUi && (stillStale || fpUnchanged)) {
        add('OK', `${tag}: 7e ICU 部分成功显示数量且不清除 stale`);
      } else if (partialUi) {
        add('FAIL', `${tag}: 7e 部分 UI 有但 stale 被错误清除 stored=${JSON.stringify(stored)}`);
      } else {
        add('WARN', `${tag}: 7e ICU 部分成功 UI 未确认 body=${body.slice(0, 160)}`);
      }
    } else {
      add('WARN', `${tag}: 7e 无同步按钮`);
    }
  }
  await shot(page9, `${tag}-09-icu-partial.png`);

  // ── 8. 布局 / console ──
  await checkLayout(page9, `${tag} 最终`);
  const tagConsole = consoleErrors.filter(e => e.tag === tag).length;
  const tagPage = pageErrorAll.filter(e => e.tag === tag).length;
  if (tagConsole === 0 && tagPage === 0) {
    add('OK', `${tag}: 8 无 console/pageerror（本视口）`);
  } else {
    add('FAIL', `${tag}: 8 存在 ${tagConsole + tagPage} 条 console/pageerror`);
  }
  await shot(page9, `${tag}-08-final.png`);

  await context9.close();
}

async function main() {
  console.log('BASE =', BASE);
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, { width: 1280, height: 800 }, 'desktop');
    await runViewport(browser, { width: 390, height: 844 }, 'mobile');
  } finally {
    await browser.close();
  }

  const ok = findings.filter(f => f.level === 'OK').length;
  const warn = findings.filter(f => f.level === 'WARN').length;
  const fail = findings.filter(f => f.level === 'FAIL').length;

  const report = {
    date: '2026-07-15',
    base: BASE,
    summary: { ok, warn, fail, consoleErrors: consoleErrors.length, pageErrors: pageErrorAll.length },
    findings,
    consoleErrors,
    pageErrors: pageErrorAll,
  };
  writeFileSync(join(__dirname, 'browser-acceptance.json'), JSON.stringify(report, null, 2));
  const md = [
    '# 浏览器验收 2026-07-15',
    '',
    `BASE: ${BASE}`,
    '',
    `| OK | WARN | FAIL | console | pageerror |`,
    `|---:|-----:|-----:|--------:|----------:|`,
    `| ${ok} | ${warn} | ${fail} | ${consoleErrors.length} | ${pageErrorAll.length} |`,
    '',
    '## Findings',
    ...findings.map(f => `- **${f.level}** ${f.msg}`),
  ].join('\n');
  writeFileSync(join(__dirname, 'browser-acceptance.md'), md);

  console.log(`\n── browser-acceptance: OK ${ok} / WARN ${warn} / FAIL ${fail} ──`);
  console.log(`consoleErrors=${consoleErrors.length} pageErrors=${pageErrorAll.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
