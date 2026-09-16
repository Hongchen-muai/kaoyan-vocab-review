/* 状态、SRS（SM-2 变体）、导入合并、每日计划 */
(function (global) {
  const STORAGE_KEY = "kaoyan-vocab-v1";
  const DAY = 24 * 60 * 60 * 1000;

  let bank = { words: [], sources: [] }; // 内置词库 words.json
  let state = null;

  function todayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseDay(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function defaultState() {
    return {
      version: 1,
      settings: {
        dailyNewLimit: 20,
        dailyReviewLimit: 100,
        autoSpeak: true,
        speakRate: 0.9,
      },
      words: {},
      importedSources: [],
      extraWords: {},
      dailyStats: {},
      updatedAt: Date.now(),
    };
  }

  function defaultProgress() {
    return {
      unknownCount: 0,
      knownCount: 0,
      lapses: 0,
      ease: 2.5,
      interval: 0,
      reps: 0,
      due: null,
      lastReview: null,
      status: "new", // new | learning | review | mastered
      reviewsToday: 0,
      reviewDay: null,
    };
  }

  function persist() {
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("save failed", e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) return parsed;
      }
    } catch (e) { /* ignore */ }
    return defaultState();
  }

  function allBankWords() {
    const map = new Map();
    for (const w of bank.words || []) map.set(w.id, w);
    for (const w of Object.values(state.extraWords || {})) map.set(w.id, w);
    return Array.from(map.values());
  }

  function ensureProgress(id) {
    if (!state.words[id]) state.words[id] = defaultProgress();
    return state.words[id];
  }

  /** 初始化：内置词库首次出现次数 = 阅读不认识次数 */
  function seedFromBank() {
    const seeded = state.seededAt;
    if (seeded) return;
    for (const w of bank.words || []) {
      const p = ensureProgress(w.id);
      if (p.unknownCount === 0 && p.knownCount === 0 && p.status === "new") {
        p.unknownCount = Math.max(1, w.sourceCount || 1);
      }
    }
    for (const s of bank.sources || []) {
      if (!state.importedSources.find((x) => x.id === s.id)) {
        state.importedSources.push({ ...s, kind: "builtin" });
      }
    }
    state.seededAt = Date.now();
    persist();
  }

  async function init(bankJson) {
    bank = bankJson || { words: [], sources: [] };
    state = loadState();
    seedFromBank();
    // 合并内置词库更新（新词）
    for (const w of bank.words || []) {
      if (!state.words[w.id] && !state.extraWords[w.id]) {
        const p = ensureProgress(w.id);
        p.unknownCount = Math.max(1, w.sourceCount || 1);
      }
    }
    return state;
  }

  function getSettings() {
    return { ...state.settings };
  }

  function updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    persist();
  }

  function resetProgress() {
    const settings = state.settings;
    const extraWords = state.extraWords;
    const importedSources = state.importedSources.filter((s) => s.kind === "builtin");
    state = defaultState();
    state.settings = settings;
    state.extraWords = extraWords;
    state.importedSources = importedSources;
    seedFromBank();
    persist();
  }

  function exportProgress() {
    return JSON.stringify(
      {
        app: "kaoyan-vocab",
        exportedAt: new Date().toISOString(),
        state,
      },
      null,
      2
    );
  }

  function importProgress(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    const s = data.state || data;
    if (!s || s.version !== 1 || !s.words) throw new Error("无效的进度文件");
    state = { ...defaultState(), ...s };
    seedFromBank();
    persist();
  }

  function daysBetween(aKey, bKey) {
    return Math.round((parseDay(bKey) - parseDay(aKey)) / DAY);
  }

  function isDue(progress, dayKey = todayKey()) {
    if (!progress.due) return false;
    return progress.due <= dayKey;
  }

  function statusOf(p) {
    if (p.status === "mastered") return "mastered";
    if (p.status === "learning" || (p.interval > 0 && p.interval < 1)) return "learning";
    if (p.reps > 0 && p.interval >= 21) return "mastered";
    if (p.reps > 0) return "review";
    return "new";
  }

  function listWords() {
    const words = allBankWords();
    return words.map((w) => {
      const p = state.words[w.id] || defaultProgress();
      return {
        ...w,
        progress: { ...p },
        status: statusOf(p),
        priority: p.unknownCount,
        unknownCount: p.unknownCount,
        knownCount: p.knownCount || 0,
        due: isDue(p),
        display: (w.forms && w.forms[0]) || w.lemma,
      };
    });
  }

  function stats() {
    const items = listWords();
    const today = todayKey();
    const ds = state.dailyStats[today] || { new: 0, review: 0, known: 0, unknown: 0, completed: 0 };
    const due = items.filter((x) => x.due || x.status === "learning");
    const newWords = items.filter((x) => x.status === "new");
    const mastered = items.filter((x) => x.status === "mastered");
    const learning = items.filter((x) => x.status === "learning" || x.status === "review");
    const hot = items.filter((x) => x.unknownCount >= 2).sort((a, b) => b.unknownCount - a.unknownCount);
    return {
      total: items.length,
      dueCount: due.length,
      newAvailable: newWords.length,
      mastered: mastered.length,
      learning: learning.length,
      hotCount: hot.length,
      // 今日完成 = 认识/模糊 的完成次数，不含「不认识」重练
      todayDone: ds.completed || 0,
      todayStats: ds,
      items,
      hot,
    };
  }

  /** 今日复习队列：学习中优先 → 到期 → 新词，组内按不认识次数降序 */
  function buildQueue() {
    const s = stats();
    const { dailyNewLimit, dailyReviewLimit } = state.settings;
    const today = todayKey();

    const learning = s.items
      .filter((x) => x.status === "learning" || (x.due && x.progress.interval <= 0))
      .sort((a, b) => b.unknownCount - a.unknownCount);

    const dueReview = s.items
      .filter((x) => x.due && x.status !== "learning" && x.status !== "new")
      .sort((a, b) => b.unknownCount - a.unknownCount || (a.progress.due || "").localeCompare(b.progress.due || ""));

    const fresh = s.items
      .filter((x) => x.status === "new")
      .sort((a, b) => b.unknownCount - a.unknownCount || a.lemma.localeCompare(b.lemma));

    const ds = state.dailyStats[today] || { new: 0, review: 0 };
    const reviewRoom = Math.max(0, dailyReviewLimit - (ds.review || 0));
    const newRoom = Math.max(0, dailyNewLimit - (ds.new || 0));

    const queue = [];
    for (const w of learning.slice(0, dailyReviewLimit)) queue.push({ ...w, kind: "relearn" });
    for (const w of dueReview.slice(0, Math.max(0, reviewRoom - queue.length))) queue.push({ ...w, kind: "review" });
    for (const w of fresh.slice(0, newRoom)) queue.push({ ...w, kind: "new" });

    return {
      queue,
      learningCount: learning.length,
      dueReviewCount: dueReview.length,
      newCount: Math.min(fresh.length, newRoom),
      reviewRoom,
      newRoom,
    };
  }

  function bumpDaily(today, key, n = 1) {
    if (!state.dailyStats[today]) {
      state.dailyStats[today] = { new: 0, review: 0, known: 0, unknown: 0, completed: 0 };
    }
    state.dailyStats[today][key] = (state.dailyStats[today][key] || 0) + n;
  }

  /**
   * 评分
   * again: 不认识 — 累加历史不认识权重，重置间隔；不计入「完成」
   * hard: 模糊 — 完成本轮
   * good: 认识 — 完成本轮
   */
  function grade(id, rating) {
    const p = ensureProgress(id);
    const today = todayKey();
    const isNew = p.reps === 0 && p.status === "new";

    if (p.reviewDay !== today) {
      p.reviewsToday = 0;
      p.reviewDay = today;
    }

    if (rating === "again") {
      p.unknownCount += 1;
      p.lapses += 1;
      p.ease = Math.max(1.3, p.ease - 0.2);
      p.interval = 0;
      p.reps = Math.max(1, p.reps);
      p.status = "learning";
      p.due = today;
      p.lastReview = today;
      p.reviewsToday += 1;
      bumpDaily(today, "unknown", 1);
      // 新词只要被作答过就占用当日新词额度，避免一直引入新词
      if (isNew) bumpDaily(today, "new", 1);
    } else if (rating === "hard") {
      p.ease = Math.max(1.3, p.ease - 0.15);
      p.interval = p.interval <= 0 ? 1 : Math.max(1, Math.round(p.interval * 1.2));
      p.reps += 1;
      p.knownCount = (p.knownCount || 0) + 1;
      p.status = p.interval >= 21 ? "mastered" : p.interval >= 1 ? "review" : "learning";
      const due = new Date();
      due.setDate(due.getDate() + p.interval);
      p.due = todayKey(due);
      p.lastReview = today;
      p.reviewsToday += 1;
      bumpDaily(today, "known", 1);
      bumpDaily(today, "completed", 1);
      if (isNew) bumpDaily(today, "new", 1);
      else bumpDaily(today, "review", 1);
    } else {
      // good
      p.ease = Math.min(3.0, p.ease + 0.1);
      if (p.interval <= 0) p.interval = 1;
      else if (p.interval === 1) p.interval = 3;
      else p.interval = Math.round(p.interval * p.ease);
      p.reps += 1;
      p.knownCount = (p.knownCount || 0) + 1;
      p.status = p.interval >= 21 ? "mastered" : "review";
      const due = new Date();
      due.setDate(due.getDate() + p.interval);
      p.due = todayKey(due);
      p.lastReview = today;
      p.reviewsToday += 1;
      bumpDaily(today, "known", 1);
      bumpDaily(today, "completed", 1);
      if (isNew) bumpDaily(today, "new", 1);
      else bumpDaily(today, "review", 1);
    }

    persist();
    return p;
  }

  /** 导入词表：每次出现 +1 阅读不认识；已掌握词重入则重置调度并继承总权重 */
  function importEntries(entries, sourceMeta) {
    const sourceId = sourceMeta.id;
    let added = 0;
    let bumped = 0;
    let relearn = 0;

    for (const e of entries) {
      const display = Lemma.normalizeDisplay(e.word);
      if (!display) continue;
      const id = Lemma.lemmaKey(display);
      if (!id) continue;

      let base = allBankWords().find((w) => w.id === id);
      if (!base) {
        state.extraWords[id] = state.extraWords[id] || {
          id,
          lemma: id,
          forms: [],
          pos: e.pos || "",
          meaning: e.meaning || "",
          note: e.note || "",
          sourceCount: 0,
          sources: [],
          occurrences: [],
          imported: true,
        };
        base = state.extraWords[id];
        added += 1;
      }
      if (display && !base.forms.includes(display)) base.forms.push(display);
      if (e.meaning && (!base.meaning || e.meaning.length > base.meaning.length)) {
        base.meaning = e.meaning;
      }
      if (e.pos && !String(base.pos || "").includes(e.pos)) {
        base.pos = base.pos ? `${base.pos} / ${e.pos}` : e.pos;
      }
      base.sourceCount = (base.sourceCount || 0) + 1;
      if (!base.sources.includes(sourceId)) base.sources.push(sourceId);
      base.occurrences = base.occurrences || [];
      base.occurrences.push({ source: sourceId, date: sourceMeta.date, raw: display });

      const p = ensureProgress(id);
      p.unknownCount += 1;
      bumped += 1;

      // 若此前已掌握，在新文档再次出现 → 立刻回到学习队列，且保留全部历史权重
      if (p.status === "mastered" || (p.interval >= 21 && p.reps > 0)) {
        p.status = "learning";
        p.interval = 0;
        p.ease = Math.max(1.3, p.ease - 0.15);
        p.due = todayKey();
        relearn += 1;
      } else if (p.reps > 0 && !isDue(p)) {
        // 学过但新语境又遇到：稍微提前
        p.due = todayKey();
        if (p.status !== "learning") p.status = p.interval <= 1 ? "learning" : "review";
      }
    }

    if (sourceId && !state.importedSources.find((s) => s.id === sourceId)) {
      state.importedSources.push({
        id: sourceId,
        label: sourceMeta.label || sourceId,
        date: sourceMeta.date || todayKey(),
        filename: sourceMeta.filename || "",
        kind: "import",
        count: entries.length,
      });
    } else if (sourceId) {
      const s = state.importedSources.find((x) => x.id === sourceId);
      if (s && s.kind === "import") s.count = (s.count || 0) + entries.length;
    }

    persist();
    return { added, bumped, relearn, sourceId };
  }

  /** 遗忘曲线：R = e^(-t/S)，S 与 interval 相关 */
  function retention(progress, hours) {
    const intervalDays = Math.max(0.15, progress.interval || 0.5);
    const stabilityHours = intervalDays * 24 * (progress.ease || 2.5) * 0.45;
    return Math.exp(-hours / stabilityHours);
  }

  function curveSeries(progress, days = 14, steps = 28) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = (days * i) / steps;
      pts.push({ t, r: retention(progress, t * 24), rScheduled: null });
    }
    // 假设在到期时复习一次，S 放大
    const boost = { ...progress, ease: (progress.ease || 2.5) + 0.1, interval: Math.max(1, (progress.interval || 1) * 2) };
    for (let i = 0; i <= steps; i++) {
      const t = (days * i) / steps;
      pts[i].rScheduled = retention(boost, t * 24);
    }
    return pts;
  }

  function forecast(days = 14) {
    const items = listWords();
    const out = [];
    const start = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = todayKey(d);
      let n = 0;
      for (const w of items) {
        if (w.status === "new" && i < state.settings.dailyNewLimit) {
          // 仅示意新词节奏，不精确
          if (i < Math.ceil(items.filter((x) => x.status === "new").length / Math.max(1, state.settings.dailyNewLimit))) {
            n += Math.min(state.settings.dailyNewLimit, items.filter((x) => x.status === "new").length);
          }
          break;
        }
        if (w.progress.due && w.progress.due === key) n += 1;
      }
      out.push({ date: key, count: n });
    }
    // 重新计算：只统计 due == key
    return out.map((row, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      const key = todayKey(d);
      return {
        date: key,
        count: items.filter((w) => w.progress.due === key && w.status !== "new").length,
      };
    });
  }

  global.Store = {
    init,
    getSettings,
    updateSettings,
    listWords,
    stats,
    buildQueue,
    grade,
    importEntries,
    curveSeries,
    retention,
    forecast,
    exportProgress,
    importProgress,
    resetProgress,
    todayKey,
    persist,
    allBankWords,
    get state() { return state; },
  };
})(window);
