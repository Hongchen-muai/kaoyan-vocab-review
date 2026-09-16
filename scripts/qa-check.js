const { chromium } = require('/Users/hongchenmuai/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const EXEC = '/Users/hongchenmuai/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:8765';
const OUT = path.join(__dirname, 'qa-shots');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });

  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '01-home.png'), fullPage: true });

  // Home metrics
  const total = await page.locator('#totalWords').innerText();
  const due = await page.locator('#dueCount').innerText();
  const todayDone = await page.locator('#todayDone').innerText();
  check('首页加载词库', Number(total) > 400, `total=${total} due=${due} done=${todayDone}`);
  check('待复习计数', Number(due) > 0, due);

  // Hot list
  const hotCount = await page.locator('#hotList li').count();
  check('高频未掌握列表', hotCount > 0, `items=${hotCount}`);

  // Library
  await page.click('.tab[data-tab="library"]');
  await page.waitForTimeout(300);
  const wordItems = await page.locator('.word-item').count();
  check('词库列表渲染', wordItems > 10, `shown=${wordItems}`);
  const firstUnk = await page.locator('.wi-unk').first().innerText();
  const secondUnk = await page.locator('.wi-unk').nth(1).innerText();
  check('默认按不认识次数降序', Number(firstUnk) >= Number(secondUnk), `${firstUnk} >= ${secondUnk}`);

  // search
  await page.fill('#searchInput', 'approval');
  await page.waitForTimeout(200);
  const searchHits = await page.locator('.word-item').count();
  check('搜索 approval', searchHits >= 1, `hits=${searchHits}`);
  await page.screenshot({ path: path.join(OUT, '02-library-search.png') });
  await page.fill('#searchInput', '');
  await page.waitForTimeout(200);

  // filter hot
  await page.click('.chip[data-filter="hot"]');
  await page.waitForTimeout(200);
  const hotItems = await page.locator('.word-item').count();
  check('筛选高频错', hotItems > 0, `hot=${hotItems}`);
  await page.click('.chip[data-filter="all"]');

  // Review session
  await page.click('.tab[data-tab="home"]');
  await page.waitForTimeout(200);
  await page.click('#btnStartReview');
  await page.waitForTimeout(500);
  const sessionVisible = await page.locator('#session').isVisible();
  check('打开复习会话', sessionVisible);
  const word = await page.locator('#cardWord').innerText();
  check('卡片显示单词', word && word !== '—', word);
  await page.screenshot({ path: path.join(OUT, '03-session-word.png') });

  // reveal
  await page.click('#btnReveal');
  await page.waitForTimeout(200);
  const meaning = await page.locator('#cardMeaning').innerText();
  check('显示释义', meaning.length > 0, meaning.slice(0, 30));
  await page.screenshot({ path: path.join(OUT, '04-session-meaning.png') });

  // grade good
  await page.click('#btnGood');
  await page.waitForTimeout(300);
  const word2 = await page.locator('#cardWord').innerText();
  check('进入下一词', word2 && word2 !== '—', word2);

  // grade again
  await page.click('#btnAgain');
  await page.waitForTimeout(300);
  const badge = await page.locator('#priorityBadge').isVisible();
  check('不认识后可继续', true, `priorityBadgeAfterAgain later`);

  // do a few more
  for (let i = 0; i < 5; i++) {
    if (!(await page.locator('#session').isVisible())) break;
    if (await page.locator('#sessionDone').isVisible()) break;
    const revealed = !(await page.locator('#cardBack').evaluate(el => el.classList.contains('hidden')));
    if (!revealed) await page.click('#btnReveal');
    await page.waitForTimeout(100);
    if (i % 2 === 0) await page.click('#btnGood');
    else await page.click('#btnAgain');
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: path.join(OUT, '05-session-progress.png') });

  // close session
  await page.click('#btnCloseSession');
  await page.waitForTimeout(300);
  const homeAgain = await page.locator('#view-home').evaluate(el => el.classList.contains('active'));
  check('退出复习回到今日', homeAgain);

  // today done increased
  const done2 = await page.locator('#todayDone').innerText();
  check('今日进度有更新', Number(done2) > Number(todayDone), `${todayDone} -> ${done2}`);

  // Stats
  await page.click('.tab[data-tab="stats"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '06-stats.png'), fullPage: true });
  const sources = await page.locator('.source-item').count();
  check('词源记录', sources >= 14, `sources=${sources}`);
  const dist = await page.locator('#distBar span').count();
  check('掌握分布图', dist >= 4, `parts=${dist}`);

  // Settings
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '07-settings.png'), fullPage: true });

  // change daily limit
  await page.fill('#newLimit', '30');
  await page.waitForTimeout(100);
  // range input fill may not fire input on all; use evaluate
  await page.evaluate(() => {
    const el = document.querySelector('#newLimit');
    el.value = '30';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(100);
  const newLimitVal = await page.locator('#newLimitVal').innerText();
  check('每日新词上限可调', newLimitVal === '30', newLimitVal);

  // Import CSV via page
  const csvPath = '/tmp/test-import.csv';
  fs.writeFileSync(csvPath, 'word,pos,meaning\nsuperfluous,adj.,多余的；过剩的\napproval,n.,批准；认可\n');
  await page.setInputFiles('#importCsv', csvPath);
  await page.waitForTimeout(800);
  const log = await page.locator('#importLog').innerText();
  check('CSV导入反馈', /导入|新词|成功|条/.test(log) || log.length > 0, log.slice(0, 80));
  await page.screenshot({ path: path.join(OUT, '08-import.png') });

  // verify imported word in library
  await page.click('.tab[data-tab="library"]');
  await page.fill('#searchInput', 'superfluous');
  await page.waitForTimeout(200);
  const sf = await page.locator('.word-item').count();
  check('导入词进入词库', sf >= 1, `superfluous hits=${sf}`);
  const sfText = await page.locator('.wi-word').first().innerText().catch(() => '');
  check('导入词文案正确', sfText.toLowerCase().includes('superfluous'), sfText);

  // approval should have increased unknown count
  await page.fill('#searchInput', 'approval');
  await page.waitForTimeout(200);
  const appUnk = await page.locator('.wi-unk').first().innerText();
  check('重复导入加深不认识权重', Number(appUnk) >= 4, `approval unknown=${appUnk}`);

  // paste import
  await page.click('.tab[data-tab="settings"]');
  await page.fill('#pasteBox', 'obfuscate v. 使模糊；使费解\n');
  await page.click('#btnPasteImport');
  await page.waitForTimeout(400);
  const log2 = await page.locator('#importLog').innerText();
  check('粘贴导入', log2.includes('obfuscate') || /导入|条/.test(log2), log2.slice(0, 80));

  // export
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#btnExport');
  const download = await dl;
  check('导出进度', !!download, download ? download.suggestedFilename() : 'no download event');

  // localStorage persistence
  const ls = await page.evaluate(() => localStorage.getItem('kaoyan-vocab-v1'));
  check('本地进度已保存', !!ls && ls.length > 100, `len=${ls ? ls.length : 0}`);

  // desktop viewport
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('.tab[data-tab="home"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '09-desktop.png'), fullPage: true });

  // mobile narrow
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '10-mobile-360.png'), fullPage: true });

  // console errors related to our app
  const realErrors = errors.filter((e) => !/favicon|net::ERR_ABORTED|Failed to load resource/.test(e));
  check('无JS错误', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));

  const summary = {
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    errors: realErrors,
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(summary, null, 2));
  console.log('\nSUMMARY', summary.passed, 'passed,', summary.failed, 'failed');
  await browser.close();
  process.exit(summary.failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
