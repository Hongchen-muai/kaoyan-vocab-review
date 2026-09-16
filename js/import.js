/* CSV / 纯文本 / PDF 导入 */
(function (global) {
  function parseCSV(text) {
    const rows = [];
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    if (!lines.length) return rows;
    const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const hasHeader = header.includes("word") || header.includes("单词");
    const idx = {
      word: header.findIndex((h) => h === "word" || h === "单词"),
      pos: header.findIndex((h) => h === "pos" || h === "词性"),
      meaning: header.findIndex((h) => h === "meaning" || h === "释义" || h === "中文"),
      note: header.findIndex((h) => h === "note" || h === "备注"),
    };
    const start = hasHeader ? 1 : 0;
    for (let i = start; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = splitCsvLine(line);
      let word, pos, meaning, note;
      if (hasHeader) {
        word = (cols[idx.word] || "").trim();
        pos = (idx.pos >= 0 ? cols[idx.pos] : cols[1] || "").trim();
        meaning = (idx.meaning >= 0 ? cols[idx.meaning] : cols[2] || "").trim();
        note = (idx.note >= 0 ? cols[idx.note] : "").trim();
      } else {
        // 无表头：词,词性,释义 或 词 释义
        word = (cols[0] || "").trim();
        pos = (cols[1] || "").trim();
        meaning = (cols[2] || "").trim();
        note = "";
      }
      // 可能出现 "word,pos,meaning" 或 "word meaning" 混排
      if (!meaning && pos && /[\u4e00-\u9fff]/.test(pos) && !/^[a-z]+\.?$/i.test(pos)) {
        meaning = pos;
        pos = "";
      }
      if (word) rows.push({ word, pos, meaning, note });
    }
    return rows;
  }

  function splitCsvLine(line) {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (c === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  }

  function parsePlain(text) {
    const rows = [];
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      // support: word / pos / meaning  |  word pos meaning  |  word — meaning
      const parts = t.split(/\s{2,}|\t|—|——|:|：|,/).map((s) => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      const word = parts[0];
      let pos = "";
      let meaning = parts.slice(1).join(" ");
      const m = meaning.match(/^(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|phr\.|phr\. v\.|aux\.|num\.|int\.)\s*(.*)$/i);
      if (m) {
        pos = m[1];
        meaning = m[2];
      }
      // also handle "word n. meaning" single-spaced
      const m2 = t.match(/^(\S+)\s+((?:n|v|adj|adv|prep|conj|pron|phr)\.?(?:\s*v\.)?)\s+(.+)$/i);
      if (m2) {
        rows.push({ word: m2[1], pos: m2[2], meaning: m2[3], note: "" });
        continue;
      }
      rows.push({ word, pos, meaning, note: "" });
    }
    return rows;
  }

  /** 极简 PDF 文本抽取：适用于生成脚本产出的文本型 PDF */
  async function extractPdfText(file) {
    // 优先尝试 pdf.js（CDN 动态加载），失败则抛错提示用 CSV
    await ensurePdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let all = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = [];
      let lastY = null;
      let line = [];
      for (const item of content.items) {
        if (!item.str) continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          lines.push(line.join(" ").trim());
          line = [];
        }
        line.push(item.str);
        lastY = y;
      }
      if (line.length) lines.push(line.join(" ").trim());
      all += lines.join("\n") + "\n";
    }
    return parsePdfLines(all);
  }

  function parsePdfLines(text) {
    // 版式：word  pos  meaning（可能拆在同栏）
    const rows = [];
    const lines = String(text || "").split(/\n/);
    for (let line of lines) {
      const t = line.replace(/\s+/g, " ").trim();
      if (!t) continue;
      if (/考研英语词汇/.test(t)) continue;
      if (/^\d+$/.test(t)) continue;
      if (/^第\s*\d+\s*页$/.test(t)) continue;
      // 尝试 word pos meaning
      const m = t.match(
        /^([A-Za-z][A-Za-z'’\- ]{0,40}?)\s+((?:n|v|adj|adv|prep|conj|pron|phr)\.?(?:\s*\/\s*(?:n|v|adj|adv)\.?)*)\s+(.+)$/i
      );
      if (m) {
        rows.push({ word: m[1].trim(), pos: m[2].trim(), meaning: m[3].trim(), note: "" });
        continue;
      }
      // 仅词 + 中文
      const m2 = t.match(/^([A-Za-z][A-Za-z'’\- ]{1,40}?)\s+([\u4e00-\u9fff；;、，,。].*)$/);
      if (m2) {
        rows.push({ word: m2[1].trim(), pos: "", meaning: m2[2].trim(), note: "" });
      }
    }
    return rows;
  }

  function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve();
      };
      script.onerror = () => reject(new Error("PDF 解析库加载失败，请改用 CSV 导入"));
      document.head.appendChild(script);
    });
  }

  function sourceIdFromName(filename, dateStr) {
    const base = filename.replace(/\.[^.]+$/, "");
    const date = dateStr || Store.todayKey();
    const group = (base.match(/第\s*(\d+)\s*组/) || [])[1];
    const label = group ? `第${group}组` : base.slice(0, 24);
    const id = `${date}_${label}`;
    return { id, label, date };
  }

  async function importFile(file) {
    const name = file.name || "import";
    const dateFromName = (name.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || Store.todayKey();
    const meta = sourceIdFromName(name, dateFromName);
    meta.filename = name;

    let entries = [];
    if (/\.csv$/i.test(name)) {
      entries = parseCSV(await file.text());
    } else if (/\.pdf$/i.test(name)) {
      entries = await extractPdfText(file);
    } else if (/\.txt$/i.test(name) || /\.md$/i.test(name)) {
      entries = parsePlain(await file.text());
    } else {
      // try csv
      entries = parseCSV(await file.text());
    }
    if (!entries.length) throw new Error(`${name}：未识别到单词`);
    const result = Store.importEntries(entries, meta);
    return { ...result, name, count: entries.length, meta };
  }

  global.Importer = { parseCSV, parsePlain, importFile, extractPdfText };
})(window);
