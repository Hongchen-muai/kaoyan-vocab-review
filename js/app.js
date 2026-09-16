/* 主应用 UI */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let queue = [];
  let qIndex = 0;
  let revealed = false;
  let sessionStats = { again: 0, hard: 0, good: 0 };
  let currentFilter = "all";
  let currentSort = "unknown";
  let searchQ = "";

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  function goto(tab) {
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === tab));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    if (tab === "home") renderHome();
    if (tab === "library") renderLibrary();
    if (tab === "stats") renderStats();
  }

  function renderHome() {
    const st = Store.stats();
    const plan = Store.buildQueue();
    const { dailyNewLimit, dailyReviewLimit } = Store.getSettings();
    const target = Math.min(dailyReviewLimit, plan.queue.length + st.todayDone);
    const done = st.todayDone;
    const ratio = target > 0 ? done / Math.max(target, done) : 0;

    $("#todayDone").textContent = done;
    $("#dueCount").textContent = plan.queue.length;
    $("#newCount").textContent = Math.min(plan.newCount, dailyNewLimit);
    $("#totalWords").textContent = st.total;
    Charts.setRing($("#todayRing"), Math.min(1, done / Math.max(1, dailyReviewLimit)));

    const btn = $("#btnStartReview");
    if (plan.queue.length === 0) {
      btn.textContent = done > 0 ? "今日任务已完成" : "暂无待复习";
      btn.disabled = done > 0;
      $("#homeHint").textContent =
        done > 0 ? "可以去词库浏览高频词，或在设置中调整每日上限。" : "词库为空或全部已掌握，请先导入单词。";
    } else {
      btn.textContent = `开始复习（${plan.queue.length}）`;
      btn.disabled = false;
      $("#homeHint").textContent = `按「不认识次数」优先 · 学习中 ${plan.learningCount} · 到期 ${plan.dueReviewCount} · 新词 ${plan.newCount}`;
    }

    const hot = st.hot.slice(0, 8);
    const ol = $("#hotList");
    ol.innerHTML = "";
    if (!hot.length) {
      ol.innerHTML = `<li><div class="muted small">暂无高频错词，复习时标记「不认识」会提升优先级。</div></li>`;
    } else {
      hot.forEach((w, i) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="hot-rank">${String(i + 1).padStart(2, "0")}</div>
          <div>
            <div class="hot-word">${escapeHtml(w.display)}</div>
            <div class="hot-mean">${escapeHtml(w.meaning || "")}</div>
          </div>
          <div class="hot-count">${w.unknownCount} 次</div>`;
        li.addEventListener("click", () => {
          currentFilter = "hot";
          searchQ = w.display;
          $("#searchInput").value = w.display;
          $$("#filterChips .chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === "hot"));
          goto("library");
        });
        ol.appendChild(li);
      });
    }

    // 用代表性单词（不认识最多的）画曲线
    const rep = hot[0] || st.items.sort((a, b) => b.unknownCount - a.unknownCount)[0];
    if (rep) {
      Charts.drawForgetting($("#curveHome"), Store.curveSeries(rep.progress, 14, 28));
      $("#curveCaption").textContent = `示例：${rep.display}（不认识 ${rep.unknownCount} 次）`;
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderLibrary() {
    let items = Store.listWords();
    if (searchQ) {
      const q = searchQ.toLowerCase();
      items = items.filter(
        (w) =>
          w.display.toLowerCase().includes(q) ||
          w.lemma.toLowerCase().includes(q) ||
          (w.meaning || "").includes(searchQ) ||
          (w.forms || []).some((f) => f.toLowerCase().includes(q))
      );
    }
    if (currentFilter === "hot") items = items.filter((w) => w.unknownCount >= 2);
    if (currentFilter === "learning") items = items.filter((w) => w.status === "learning" || w.status === "review");
    if (currentFilter === "mastered") items = items.filter((w) => w.status === "mastered");
    if (currentFilter === "new") items = items.filter((w) => w.status === "new");

    items.sort((a, b) => {
      if (currentSort === "unknown") return b.unknownCount - a.unknownCount || a.lemma.localeCompare(b.lemma);
      if (currentSort === "unknown-asc") return a.unknownCount - b.unknownCount || a.lemma.localeCompare(b.lemma);
      if (currentSort === "alpha") return a.display.localeCompare(b.display);
      if (currentSort === "recent") {
        return (b.progress.lastReview || "").localeCompare(a.progress.lastReview || "");
      }
      return 0;
    });

    const box = $("#wordList");
    box.innerHTML = "";
    if (!items.length) {
      box.innerHTML = `<div class="muted small" style="padding:16px;color:var(--haze)">没有匹配的单词</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    // 避免过长列表卡顿，显示前 300，滚动可搜
    const show = items.slice(0, 300);
    for (const w of show) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "word-item";
      const forms = (w.forms || []).filter((f) => f.toLowerCase() !== w.display.toLowerCase());
      btn.innerHTML = `
        <div>
          <div class="wi-word">${escapeHtml(w.display)}</div>
          ${forms.length ? `<div class="wi-forms">也出现：${escapeHtml(forms.slice(0, 4).join(", "))}</div>` : ""}
          <div class="wi-mean">${escapeHtml(w.meaning || "")}</div>
          <div class="wi-tags">
            ${w.unknownCount >= 2 ? `<span class="tag hot">高频错</span>` : ""}
            ${w.status === "mastered" ? `<span class="tag ok">已掌握</span>` : ""}
            ${w.due ? `<span class="tag due">待复习</span>` : ""}
            ${w.pos ? `<span class="tag">${escapeHtml(w.pos)}</span>` : ""}
          </div>
        </div>
        <div class="wi-right">
          <div class="wi-unk ${w.unknownCount ? "" : "zero"}">${w.unknownCount}</div>
          <div class="wi-unk-label">不认识</div>
        </div>`;
      btn.addEventListener("click", () => {
        if (Store.getSettings().autoSpeak) TTS.speak(w.display);
        else TTS.speak(w.display);
      });
      frag.appendChild(btn);
    }
    box.appendChild(frag);
    if (items.length > 300) {
      const more = document.createElement("div");
      more.style.cssText = "padding:12px 16px;color:var(--haze);font-size:12px;text-align:center";
      more.textContent = `共 ${items.length} 条，已显示前 300 条，可用搜索缩小范围`;
      box.appendChild(more);
    }
  }

  function renderStats() {
    const st = Store.stats();
    const total = Math.max(1, st.total);
    const parts = [
      { k: "新词", v: st.items.filter((x) => x.status === "new").length, c: "#B8C5C1" },
      { k: "学习中", v: st.items.filter((x) => x.status === "learning").length, c: "#C45C26" },
      { k: "复习中", v: st.items.filter((x) => x.status === "review").length, c: "#2F8F6B" },
      { k: "已掌握", v: st.mastered, c: "#173C38" },
    ];
    const bar = $("#distBar");
    bar.innerHTML = parts
      .map((p) => `<span style="width:${(p.v / total) * 100}%;background:${p.c}" title="${p.k} ${p.v}"></span>`)
      .join("");
    $("#distLegend").innerHTML = parts
      .map(
        (p) => `<div class="k"><i style="background:${p.c}"></i>${p.k}</div><div class="v">${p.v}</div>`
      )
      .join("");

    Charts.drawForecast($("#dueForecast"), Store.forecast(14));

    const box = $("#sourceList");
    const sources = (Store.state.importedSources || []).slice().reverse();
    box.innerHTML = sources
      .map(
        (s) => `<div class="source-item">
          <div>
            <div class="name">${escapeHtml(s.label || s.id)}</div>
            <div class="meta">${escapeHtml(s.date || "")} ${escapeHtml(s.filename || "")}</div>
          </div>
          <div class="kind">${s.kind === "builtin" ? "内置" : "导入"}</div>
        </div>`
      )
      .join("");
  }

  /* ---------- 复习会话 ---------- */
  function startSession() {
    const plan = Store.buildQueue();
    queue = plan.queue;
    qIndex = 0;
    revealed = false;
    sessionStats = { again: 0, hard: 0, good: 0 };
    if (!queue.length) {
      toast("当前没有可复习的单词");
      return;
    }
    $("#session").classList.remove("hidden");
    $("#sessionDone").classList.add("hidden");
    $("#sessionBody") && $("#sessionBody").classList.remove("hidden");
    $(".session-body").classList.remove("hidden");
    $(".session-top").classList.remove("hidden");
    showCard();
  }

  function endSession() {
    $("#session").classList.add("hidden");
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    renderHome();
  }

  function showCard() {
    if (qIndex >= queue.length) {
      finishSession();
      return;
    }
    const w = queue[qIndex];
    revealed = false;
    $("#cardWord").textContent = w.display;
    const forms = (w.forms || []).filter((f) => f.toLowerCase() !== w.display.toLowerCase());
    $("#cardForms").textContent = forms.length ? `文中形式：${forms.join(" · ")}` : "";
    $("#cardPos").textContent = w.pos || "";
    $("#cardMeaning").textContent = w.meaning || "（暂无释义）";
    $("#cardNote").textContent = w.note || "";
    $("#cardSources").textContent = (w.sources || []).length ? `来源：${(w.sources || []).join("、")}` : "";
    $("#cardMeta").textContent = `历史不认识 ${w.unknownCount} 次 · 已认识 ${w.progress.knownCount || 0} 次`;
    $("#cardBack").classList.add("hidden");
    $("#btnReveal").classList.remove("hidden");
    $("#btnHard").disabled = true;
    $("#btnGood").disabled = true;

    const hot = w.unknownCount >= 2 || w.kind === "relearn";
    $("#priorityBadge").classList.toggle("hidden", !hot);
    $("#priorityBadge").textContent = w.kind === "relearn" ? "新文档再次出现 · 继承历史权重" : "高频重点";

    $("#sessionCount").textContent = `${qIndex + 1}/${queue.length}`;
    $("#sessionBar").style.width = `${(qIndex / queue.length) * 100}%`;

    if (Store.getSettings().autoSpeak) {
      setTimeout(() => speakCurrent(), 120);
    }
  }

  function speakCurrent() {
    const w = queue[qIndex];
    if (!w) return;
    const btn = $("#btnSpeak");
    btn.classList.add("playing");
    TTS.speak(w.display, () => btn.classList.remove("playing"));
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    $("#cardBack").classList.remove("hidden");
    $("#btnReveal").classList.add("hidden");
    $("#btnHard").disabled = false;
    $("#btnGood").disabled = false;
  }

  function gradeCurrent(rating) {
    const w = queue[qIndex];
    if (!w) return;
    if (rating !== "again" && !revealed) return;
    Store.grade(w.id, rating);
    sessionStats[rating] += 1;
    // again：当天会再入队一次（简化：立刻插回末尾一次）
    if (rating === "again") {
      queue.push({ ...w, kind: "relearn" });
    }
    qIndex += 1;
    showCard();
  }

  function finishSession() {
    $(".session-body").classList.add("hidden");
    $(".session-top").classList.add("hidden");
    $("#sessionDone").classList.remove("hidden");
    $("#sessionBar").style.width = "100%";
    $("#doneSummary").textContent = `认识 ${sessionStats.good} · 模糊 ${sessionStats.hard} · 不认识 ${sessionStats.again}`;
  }

  /* ---------- 设置与导入 ---------- */
  function bindSettings() {
    const s = Store.getSettings();
    $("#newLimit").value = s.dailyNewLimit;
    $("#newLimitVal").textContent = s.dailyNewLimit;
    $("#reviewLimit").value = s.dailyReviewLimit;
    $("#reviewLimitVal").textContent = s.dailyReviewLimit;
    $("#autoSpeak").checked = !!s.autoSpeak;
    $("#speakRate").value = s.speakRate;
    $("#rateVal").textContent = `${Number(s.speakRate).toFixed(1)}×`;
    TTS.setRate(s.speakRate);

    $("#newLimit").addEventListener("input", (e) => {
      const v = Number(e.target.value);
      $("#newLimitVal").textContent = v;
      Store.updateSettings({ dailyNewLimit: v });
      renderHome();
    });
    $("#reviewLimit").addEventListener("input", (e) => {
      const v = Number(e.target.value);
      $("#reviewLimitVal").textContent = v;
      Store.updateSettings({ dailyReviewLimit: v });
      renderHome();
    });
    $("#autoSpeak").addEventListener("change", (e) => {
      Store.updateSettings({ autoSpeak: e.target.checked });
    });
    $("#speakRate").addEventListener("input", (e) => {
      const v = Number(e.target.value);
      $("#rateVal").textContent = `${v.toFixed(1)}×`;
      Store.updateSettings({ speakRate: v });
      TTS.setRate(v);
    });

    $("#importCsv").addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      await handleImportFiles(files);
      e.target.value = "";
    });
    $("#importPdf").addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      await handleImportFiles(files);
      e.target.value = "";
    });
    $("#btnPasteImport").addEventListener("click", () => {
      const text = $("#pasteBox").value.trim();
      if (!text) return toast("请先粘贴内容");
      const entries = Importer.parsePlain(text);
      if (!entries.length) return toast("未解析到单词");
      const meta = {
        id: `${Store.todayKey()}_粘贴导入`,
        label: "粘贴导入",
        date: Store.todayKey(),
        filename: "paste",
      };
      const r = Store.importEntries(entries, meta);
      $("#importLog").innerHTML = `<div class="ok">已导入 ${entries.length} 条，新增词 ${r.added}，累计加深 ${r.bumped}，重学 ${r.relearn}</div>`;
      toast("导入完成");
      renderHome();
    });

    $("#btnExport").addEventListener("click", () => {
      const blob = new Blob([Store.exportProgress()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `考研词汇进度_${Store.todayKey()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("进度已导出");
    });
    $("#importProgress").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        Store.importProgress(await file.text());
        toast("进度已恢复");
        renderHome();
      } catch (err) {
        toast(err.message || "导入失败");
      }
      e.target.value = "";
    });
    $("#btnReset").addEventListener("click", () => {
      if (!confirm("确定重置全部复习进度？词库内容保留。")) return;
      Store.resetProgress();
      toast("已重置");
      renderHome();
    });

    $("#aboutText").textContent = `内置词库 ${Store.state.importedSources.filter((s) => s.kind === "builtin").length} 组 · ${
      Store.listWords().length
    } 词。进度保存在浏览器 localStorage。新 PDF/CSV 导入后自动并入，阅读中再次出现按「不认识」累计权重。`;
  }

  async function handleImportFiles(files) {
    if (!files.length) return;
    const logs = [];
    for (const f of files) {
      try {
        const r = await Importer.importFile(f);
        logs.push(
          `<div class="ok">${escapeHtml(f.name)}：解析 ${r.count} 条，新词 ${r.added}，加深 ${r.bumped}，重学 ${r.relearn}</div>`
        );
      } catch (err) {
        logs.push(`<div class="err">${escapeHtml(f.name)}：${escapeHtml(err.message || "失败")}</div>`);
      }
    }
    $("#importLog").innerHTML = logs.join("");
    renderHome();
  }

  function bindChrome() {
    $$(".tab").forEach((t) => t.addEventListener("click", () => goto(t.dataset.tab)));
    $$("[data-goto]").forEach((t) => t.addEventListener("click", () => goto(t.dataset.goto)));
    $("#btnStartReview").addEventListener("click", startSession);
    $("#btnCloseSession").addEventListener("click", endSession);
    $("#btnDoneBack").addEventListener("click", () => {
      endSession();
      goto("home");
    });
    $("#btnReveal").addEventListener("click", reveal);
    $("#wordCard").addEventListener("click", (e) => {
      if (e.target.closest(".speak-btn")) return;
      reveal();
    });
    $("#btnSpeak").addEventListener("click", speakCurrent);
    $("#btnAgain").addEventListener("click", () => gradeCurrent("again"));
    $("#btnHard").addEventListener("click", () => gradeCurrent("hard"));
    $("#btnGood").addEventListener("click", () => gradeCurrent("good"));

    // 键盘
    document.addEventListener("keydown", (e) => {
      if ($("#session").classList.contains("hidden")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed) reveal();
        else gradeCurrent("good");
      }
      if (e.key === "1") gradeCurrent("again");
      if (e.key === "2" && revealed) gradeCurrent("hard");
      if (e.key === "3" && revealed) gradeCurrent("good");
      if (e.key === "Escape") endSession();
    });

    $("#searchInput").addEventListener("input", (e) => {
      searchQ = e.target.value.trim();
      renderLibrary();
    });
    $$("#filterChips .chip").forEach((c) => {
      c.addEventListener("click", () => {
        currentFilter = c.dataset.filter;
        $$("#filterChips .chip").forEach((x) => x.classList.toggle("active", x === c));
        renderLibrary();
      });
    });
    $("#sortSelect").addEventListener("change", (e) => {
      currentSort = e.target.value;
      renderLibrary();
    });

    window.addEventListener("resize", () => {
      if ($("#view-home").classList.contains("active")) renderHome();
      if ($("#view-stats").classList.contains("active")) renderStats();
    });
  }

  async function boot() {
    TTS.init();
    let bank = { words: [], sources: [] };
    try {
      const res = await fetch("data/words.json");
      bank = await res.json();
    } catch (e) {
      console.error("词库加载失败", e);
    }
    await Store.init(bank);
    bindChrome();
    bindSettings();
    renderHome();
    $("#brandSub").textContent = `阅读生词 ${Store.listWords().length} · 间隔复习`;
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
