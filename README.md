# 考研词汇复习

从阅读材料整理的考研英语生词，按「不认识次数」优先复习。支持遗忘曲线、发音、每日计划，以及新 CSV/PDF 自动并入。

## 功能

- **词形归并**：忽略时态/屈折（如 `ingested` → `ingest`，`curriculums` → `curriculum`）
- **权重优先**：按历史「不认识」次数从多到少复习；网页里标「不认识」继续累加
- **权重继承**：已在网页里认识，但新 PDF/CSV 中再次出现 → 继承全部历史不认识权重，并回到优先复习队列
- **遗忘曲线**：SM-2 变体间隔重复 + 保持率曲线
- **发音**：浏览器 Web Speech API
- **每日计划**：可设置每日新词/复习上限
- **导入**：CSV / PDF / 粘贴文本；进度可导出备份

## 使用

直接打开 `index.html`，或本地起服务：

```bash
python3 -m http.server 8765
# 访问 http://127.0.0.1:8765
```

## 更新词库（新 CSV）

1. 将新的 `考研英语词汇_*.csv` 放到上级目录（与旧 CSV 同级）
2. 重新生成内置词库：

```bash
python3 scripts/build_words.py
```

3. 刷新网页；或在「设置 → 导入 CSV」直接导入，无需改仓库

## 数据说明

- 内置词库：`data/words.json`（由全部 CSV 生成，每次出现计 1 次阅读不认识）
- 复习进度：浏览器 `localStorage`，键名 `kaoyan-vocab-v1`
- 在设置页可导出/导入进度 JSON

## 线上

已发布：**https://hongchen-muai.github.io/kaoyan-vocab-review/**

仓库：https://github.com/Hongchen-muai/kaoyan-vocab-review

进度保存在浏览器本地，换设备请先在设置页导出/导入进度 JSON。
