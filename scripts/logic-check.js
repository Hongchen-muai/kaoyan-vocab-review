const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      '/Users/hongchenmuai/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const lemmaChecks = await page.evaluate(() => {
    const cases = [
      ['ingested', 'ingest'],
      ['diminishes', 'diminish'],
      ['filtered', 'filter'],
      ['curriculums', 'curriculum'],
      ['liabilities', 'liability'],
      ['misses', 'miss'],
      ['consensus', 'consensus'],
      ['thus', 'thus'],
      ['approval', 'approval'],
      ['sort', 'sort'],
      ['sorting', 'sort'],
      ['illuminate', 'illuminate'],
      ['illuminating', 'illuminate'],
    ];
    return cases.map((pair) => {
      const w = pair[0];
      const exp = pair[1];
      const got = Lemma.lemmaKey(w);
      return { w: w, exp: exp, got: got, ok: got === exp };
    });
  });
  console.log('LEMMA', JSON.stringify(lemmaChecks, null, 2));
  const lemmaFail = lemmaChecks.filter((c) => !c.ok);
  console.log('lemma fails', lemmaFail.length);

  const inherit = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(Store.listWords().find((w) => w.id === 'approval')));
    const st = JSON.parse(localStorage.getItem('kaoyan-vocab-v1'));
    st.words.approval.status = 'mastered';
    st.words.approval.interval = 30;
    st.words.approval.reps = 5;
    st.words.approval.due = '2099-01-01';
    st.words.approval.unknownCount = 5;
    localStorage.setItem('kaoyan-vocab-v1', JSON.stringify(st));
    Store.importProgress(st);
    const mid = Store.listWords().find((w) => w.id === 'approval');
    const r = Store.importEntries(
      [{ word: 'approval', pos: 'n.', meaning: '批准' }],
      { id: '2026-09-16_测试', label: '测试', date: '2026-09-16', filename: 'test.csv' }
    );
    const after = Store.listWords().find((w) => w.id === 'approval');
    const q = Store.buildQueue();
    const inQueue = q.queue.some((x) => x.id === 'approval');
    return {
      beforeUnknown: before.unknownCount,
      midStatus: mid.status,
      afterUnknown: after.unknownCount,
      afterStatus: after.status,
      afterInterval: after.progress.interval,
      relearn: r.relearn,
      inQueue: inQueue,
    };
  });
  console.log('INHERIT', JSON.stringify(inherit, null, 2));
  const okInherit =
    inherit.afterUnknown >= 6 &&
    inherit.afterStatus === 'learning' &&
    inherit.relearn === 1 &&
    inherit.inQueue;
  console.log('inheritOk', okInherit);

  const limit = await page.evaluate(() => {
    Store.updateSettings({ dailyNewLimit: 5, dailyReviewLimit: 5 });
    const q = Store.buildQueue();
    return {
      queueLen: q.queue.length,
      newCount: q.newCount,
      dueReview: q.dueReviewCount,
      learning: q.learningCount,
    };
  });
  console.log('LIMIT', JSON.stringify(limit));

  await browser.close();
  if (lemmaFail.length || !okInherit) process.exit(1);
  console.log('ALL LOGIC TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
