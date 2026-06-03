const path = require('node:path');
const { chromium } = require('playwright');

const auditDir = '/Users/agg/Desktop/Marathon/product-audit-2026-06-03-recheck';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function save(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(auditDir, name), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await mobile.newPage();
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await save(page, '01-first-profile.png');

  await page.getByPlaceholder('22:57').fill('2257');
  await save(page, '02-profile-filled.png');

  await page.getByText('生成训练计划').click();
  await page.waitForTimeout(900);
  await save(page, '03-week-after-generate.png');

  await page.getByRole('button', { name: '分享计划' }).click();
  await save(page, '04-share-sheet.png');
  await page.mouse.click(354, 424);

  await page.getByRole('button', { name: '月历' }).click();
  await save(page, '05-month-calendar.png');

  await page.getByRole('button', { name: '指标', exact: true }).click();
  await save(page, '06-stats.png');

  await page.getByRole('button', { name: '赛事', exact: true }).click();
  await page.waitForTimeout(1200);
  await save(page, '07-races-home.png');

  await page.getByPlaceholder('搜索赛事名称或城市…').fill('上海');
  await page.waitForTimeout(600);
  await save(page, '08-race-search-shanghai.png');

  await page.getByText('2026上海马拉松').first().click();
  await save(page, '09-race-detail.png');
  await mobile.close();

  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const dpage = await desktop.newPage();
  await dpage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await dpage.evaluate(() => localStorage.clear());
  await dpage.reload({ waitUntil: 'networkidle' });
  await save(dpage, '10-desktop-first-profile.png');
  await desktop.close();

  await browser.close();
  console.log(`saved screenshots to ${auditDir}`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
