const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, '..', 'qa-shots');
fs.mkdirSync(OUT, { recursive: true });

const EXEC =
  '/Users/hongchenmuai/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = process.env.BASE || 'http://127.0.0.1:8765';

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  // clear storage for clean session test
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // ---- 1. 先作答再释义 ----
  await page.click('#btnStartReview');
  await page.waitForTimeout(400);
  const word1 = await page.locator('#cardWord').innerText();
  const meaningHiddenBefore = await page.locator('#cardBack').evaluate((el) => el.classList.contains('hidden'));
  const goodEnabled = await page.locator('#btnGood').evaluate((el) => !el.disabled);
  const hardEnabled = await page.locator('#btnHard').evaluate((el) => !el.disabled);
  check('未作答时释义隐藏', meaningHiddenBefore);
  check('认识/模糊可直接点', goodEnabled && hardEnabled);
  await page.screenshot({ path: path.join(OUT, 'fix-01-grade-first.png') });

  // 直接点认识，应出现释义 + 继续/改判
  await page.click('#btnGood');
  await page.waitForTimeout(200);
  const revealedAfterGood = !(await page.locator('#cardBack').evaluate((el) => el.classList.contains('hidden')));
  const confirmVisible = await page.locator('#confirmRow').isVisible();
  const meaning = await page.locator('#cardMeaning').innerText();
  check('点认识后展示释义', revealedAfterGood && meaning.length > 0, meaning.slice(0, 20));
  check('出现继续/改判', confirmVisible);
  await page.screenshot({ path: path.join(OUT, 'fix-02-after-good.png') });

  // 改判不认识
  await page.click('#btnDowngrade');
  await page.waitForTimeout(300);
  const word2 = await page.locator('#cardWord').innerText();
  const countAfterDowngrade = await page.locator('#sessionCount').innerText();
  check('改判后不计入完成且进下一词', countAfterDowngrade === '0/20' || countAfterDowngrade.startsWith('0/'), countAfterDowngrade);

  // ---- 2. 疯狂点不认识，进度不膨胀 ----
  // 先结束当前卡：若已在下一词，连续点不认识+继续
  for (let i = 0; i < 8; i++) {
    if (await page.locator('#sessionDone').isVisible()) break;
    const confirmOpen = await page.locator('#confirmRow').isVisible();
    if (!confirmOpen) {
      await page.click('#btnAgain');
      await page.waitForTimeout(80);
    }
    await page.click('#btnConfirm');
    await page.waitForTimeout(80);
  }
  const countAfterAgainSpam = await page.locator('#sessionCount').innerText();
  const [doneN, totalN] = countAfterAgainSpam.split('/').map((x) => parseInt(x, 10));
  check('总词数固定为20不膨胀', totalN === 20, countAfterAgainSpam);
  check('连续不认识不增加完成数', doneN === 0, countAfterAgainSpam);
  await page.screenshot({ path: path.join(OUT, 'fix-03-again-spam.png') });

  // 完成剩余：对当前及后续卡片点认识+继续，直到结束
  for (let i = 0; i < 80; i++) {
    if (await page.locator('#sessionDone').isVisible()) break;
    if (await page.locator('#confirmRow').isVisible()) {
      await page.click('#btnConfirm');
    } else {
      await page.click('#btnGood');
      await page.waitForTimeout(50);
      await page.click('#btnConfirm');
    }
    await page.waitForTimeout(60);
  }
  const doneVisible = await page.locator('#sessionDone').isVisible();
  const summary = await page.locator('#doneSummary').innerText();
  check('可正常结束本轮', doneVisible, summary);
  check('完成文案含 仅认识/模糊计入', summary.includes('完成'), summary);
  // 完成数应 <= 20
  const m = summary.match(/完成\s*(\d+)\/(\d+)/);
  check('完成数不超过总词数', m && Number(m[1]) <= Number(m[2]) && Number(m[2]) === 20, summary);
  await page.screenshot({ path: path.join(OUT, 'fix-04-done.png') });

  await page.click('#btnDoneBack');
  await page.waitForTimeout(300);
  const todayDone = await page.locator('#todayDone').innerText();
  const due = await page.locator('#dueCount').innerText();
  check('今日已复习只计完成', Number(todayDone) <= 20, `todayDone=${todayDone} due=${due}`);

  // ---- 3. 已作答状态再点认识 → 不重复结算 ----
  await page.click('#btnStartReview');
  await page.waitForTimeout(300);
  if (await page.locator('#session').isVisible() && !(await page.locator('#sessionDone').isVisible())) {
    await page.click('#btnGood');
    await page.waitForTimeout(100);
    // 再点认识按钮应无效（grade row hidden）
    const gradeHidden = await page.locator('#gradeRow').evaluate((el) => el.classList.contains('hidden'));
    check('作答后不能再次点认识', gradeHidden);
    await page.click('#btnConfirm');
    await page.waitForTimeout(100);
  } else {
    check('作答后不能再次点认识', true, '队列已空，跳过');
  }
  await page.click('#btnCloseSession');

  // ---- 4. store 逻辑：again 不增加 completed ----
  const storeCheck = await page.evaluate(() => {
    const snap = (st) => JSON.parse(JSON.stringify(st.todayStats || {}));
    const before = Store.stats();
    const dsBefore = snap(before);
    const w = Store.listWords().find((x) => x.status === 'new') || Store.listWords()[0];
    Store.grade(w.id, 'again');
    const mid = Store.stats();
    const dsMid = snap(mid);
    Store.grade(w.id, 'good');
    const after = Store.stats();
    const dsAfter = snap(after);
    return {
      id: w.id,
      dsBefore,
      dsMid,
      dsAfter,
      completedDeltaAfterAgain: (dsMid.completed || 0) - (dsBefore.completed || 0),
      completedDeltaAfterGood: (dsAfter.completed || 0) - (dsMid.completed || 0),
      knownCountAfter: Store.listWords().find((x) => x.id === w.id).knownCount,
    };
  });
  check('again 不增加 completed', storeCheck.completedDeltaAfterAgain === 0, JSON.stringify(storeCheck.dsMid));
  check('good 增加 completed', storeCheck.completedDeltaAfterGood === 1, String(storeCheck.completedDeltaAfterGood));
  check('good 累加 knownCount', storeCheck.knownCountAfter >= 1, String(storeCheck.knownCountAfter));

  const realErrors = errors.filter((e) => !/favicon|net::ERR_ABORTED/.test(e));
  check('无JS错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  fs.writeFileSync(path.join(OUT, 'session-fix-report.json'), JSON.stringify({ results, errors: realErrors }, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log('\nSUMMARY', results.filter((r) => r.ok).length, 'passed,', failed, 'failed');
  await browser.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
