const path = require('node:path');
const { chromium } = require('playwright');

const auditDir = '/Users/agg/Desktop/Marathon/product-audit-2026-06-03';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
  await page.screenshot({ path: path.join(auditDir, '01-mobile-first-profile.png'), fullPage: true });

  await page.getByRole('button', { name: '档案', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(auditDir, '02-mobile-profile-empty.png'), fullPage: true });

  await page.getByPlaceholder('22:57').fill('2257');
  await page.getByText('生成训练计划').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(auditDir, '03-mobile-week-after-generate.png'), fullPage: true });

  await page.getByRole('button', { name: '分享计划' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(auditDir, '04-mobile-share-sheet.png'), fullPage: true });
  await page.mouse.click(354, 424);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(auditDir, '05-mobile-week-view.png'), fullPage: true });

  await page.getByRole('button', { name: '赛事', exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByPlaceholder('搜索赛事名称或城市…').fill('上海');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(auditDir, '06-mobile-race-search-shanghai.png'), fullPage: true });
  await mobile.close();

  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const dpage = await desktop.newPage();
  await dpage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await dpage.screenshot({ path: path.join(auditDir, '07-desktop-app-shell.png'), fullPage: true });
  await desktop.close();

  await browser.close();
  console.log(`saved screenshots to ${auditDir}`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
