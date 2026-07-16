/**
 * 一次性：用 header 同款绿色底 + 黑色跑者 path 生成 PWA PNG。
 * 不引入图片库依赖；依赖 devDependency playwright。
 *
 * node scripts/generate-pwa-icons.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const ACCENT = '#32D74B';
const RUNNER =
  'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z';

function svgFor(size, { maskable = false } = {}) {
  // maskable：整底品牌绿，跑者缩到安全区（中心 ~66%）
  const pad = maskable ? size * 0.17 : size * 0.12;
  const inner = size - pad * 2;
  const rx = maskable ? 0 : Math.round(size * 0.18);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${ACCENT}"/>
  <g transform="translate(${pad} ${pad}) scale(${inner / 24})">
    <path fill="#000000" d="${RUNNER}"/>
  </g>
</svg>`;
}

async function rasterize(browser, svg, size, outPath) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">
      <img id="i" width="${size}" height="${size}" src="${dataUrl}" />
    </body></html>`,
    { waitUntil: 'load' },
  );
  await page.waitForSelector('#i');
  // wait decode
  await page.evaluate(() => new Promise(r => {
    const img = document.getElementById('i');
    if (img.complete) r();
    else img.onload = () => r();
  }));
  const buf = await page.locator('#i').screenshot({ type: 'png', omitBackground: false });
  writeFileSync(outPath, buf);
  await page.close();
  return outPath;
}

async function main() {
  // keep favicon.svg already written by hand; regenerate for consistency
  writeFileSync(join(publicDir, 'favicon.svg'), svgFor(32).replace(/width="32" height="32"/, 'width="32" height="32"'));

  const browser = await chromium.launch({ headless: true });
  const jobs = [
    [192, join(publicDir, 'pwa-192x192.png'), false],
    [512, join(publicDir, 'pwa-512x512.png'), false],
    [512, join(publicDir, 'pwa-512x512-maskable.png'), true],
    [180, join(publicDir, 'apple-touch-icon.png'), false],
  ];
  for (const [size, path, maskable] of jobs) {
    await rasterize(browser, svgFor(size, { maskable }), size, path);
    console.log('wrote', path);
  }
  await browser.close();

  // pixel proof via reading PNG signature + sample via playwright canvas
  const browser2 = await chromium.launch({ headless: true });
  const page = await browser2.newPage();
  for (const [size, path] of [
    [192, join(publicDir, 'pwa-192x192.png')],
    [512, join(publicDir, 'pwa-512x512.png')],
    [512, join(publicDir, 'pwa-512x512-maskable.png')],
    [180, join(publicDir, 'apple-touch-icon.png')],
  ]) {
    const b64 = readFileSync(path).toString('base64');
    const sample = await page.evaluate(async ({ b64, size }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await new Promise((r, j) => { img.onload = r; img.onerror = j; });
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const pts = [
        [2, 2],
        [size / 2, size / 2],
        [size * 0.25, size * 0.25],
      ];
      return {
        w: img.naturalWidth,
        h: img.naturalHeight,
        samples: pts.map(([x, y]) => {
          const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
          return { x: Math.floor(x), y: Math.floor(y), r: d[0], g: d[1], b: d[2] };
        }),
      };
    }, { b64, size });
    console.log(path.split('/').pop(), sample);
    // 角点可能因圆角露出透明底；品牌绿采样点应为 #32D74B≈(50,215,75)，不得为紫
    const brand = sample.samples[2];
    const isGreen = brand.g > 180 && brand.g > brand.r && brand.g > brand.b && brand.b < 120;
    const isPurple = brand.b > 150 && brand.r > 100 && brand.g < brand.b;
    if (!isGreen || isPurple) {
      console.error('FAIL brand: expected accent green, got', brand);
      process.exitCode = 1;
    } else {
      console.log('brand green ok', brand);
    }
    if (sample.w !== size || sample.h !== size) {
      console.error('FAIL size', sample);
      process.exitCode = 1;
    }
  }
  await browser2.close();
  console.log('done');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
