#!/usr/bin/env python3
"""从上级目录的考研英语词汇 CSV 生成 data/words.json。"""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT.parent
OUT = ROOT / "data" / "words.json"

# 常见不规则词形 → 词元
IRREGULAR = {
    "ingested": "ingest",
    "erupted": "erupt",
    "impelled": "impel",
    "infested": "infest",
    "informed": "inform",
    "survived": "survive",
    "misses": "miss",
    "missed": "miss",
    "conspiring": "conspire",
    "counteracting": "counteract",
    "fulfilling": "fulfill",
    "hacking": "hack",
    "humiliating": "humiliate",
    "illuminating": "illuminate",
    "sorting": "sort",
    "stating": "state",
    "refereeing": "referee",
    "remodeling": "remodel",
    "commercialised": "commercialise",
    "commercialized": "commercialize",
    "liberalising": "liberalise",
    "polarised": "polarise",
    "curriculums": "curriculum",
    "liabilities": "liability",
    "diminishes": "diminish",
    "filtered": "filter",
    "emerging": "emerge",
    "embarrassing": "embarrass",
    "unsettling": "unsettle",
    "unfunded": "unfund",
    "unmentioned": "unmention",
    "unsurpassed": "unsurpass",
    "upended": "upend",
    "upsetting": "upset",
    "outdated": "outdate",
    "puzzlement": "puzzle",
    "concerned": "concern",
    "infuriating": "infuriate",
    "impoverished": "impoverish",
    "processed": "process",
    "scattered": "scatter",
    "belated": "belate",
    # 本身完整，禁止规则误伤
    "consensus": "consensus",
    "indeed": "indeed",
    "sacred": "sacred",
    "succeed": "succeed",
    "thus": "thus",
    "everlasting": "everlasting",
    "lasting": "lasting",
    "emphasis": "emphasis",
    "address": "address",
    "assess": "assess",
    "class": "class",
    "conscious": "conscious",
    "dismiss": "dismiss",
    "eagerness": "eagerness",
    "fairness": "fairness",
    "generous": "generous",
    "groundless": "groundless",
    "holiness": "holiness",
    "stress": "stress",
    "vicious": "vicious",
    "witness": "witness",
    "contemptuous": "contemptuous",
    "embarrassing": "embarrass",
    "preliminary": "preliminary",
}

PHRASE_FIX = {
    "collective|acceptance": "collective acceptance",
}


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def normalize_display(word: str) -> str:
    w = word.strip()
    w = PHRASE_FIX.get(w.lower(), w)
    w = PHRASE_FIX.get(w, w)
    if "|" in w:
        w = w.replace("|", " ")
    w = re.sub(r"\s+", " ", w).strip()
    return w


# 后缀保护：这些词本身以 s 结尾，不是复数
S_SUFFIX_KEEP = re.compile(
    r"(sis|sis|ous|ness|less|ism|ist|ics|ews|ius|mus|tum|ium|ess|ss)$"
)


def lemma_key(word: str) -> str:
    """生成用于去重/计数的词元键。短语与专有名词原样小写。"""
    w = normalize_display(word).lower().replace("’", "'")
    if " " in w or "-" in w:
        return w.strip(" .,;:!?")
    if w in IRREGULAR:
        return IRREGULAR[w]
    if len(w) <= 3:
        return w
    if S_SUFFIX_KEEP.search(w):
        return w
    # 规则屈折（保守）
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("ing") and len(w) > 5:
        stem = w[:-3]
        if len(stem) >= 2 and stem[-1] == stem[-2] and stem[-1] not in "aeiou":
            return stem[:-1]
        return stem
    if w.endswith("ed") and len(w) > 4:
        stem = w[:-2]
        if len(stem) >= 2 and stem[-1] == stem[-2] and stem[-1] not in "aeiou":
            return stem[:-1]
        if stem.endswith("i"):
            return stem[:-1] + "y"
        return stem
    if w.endswith("es") and len(w) > 4:
        stem = w[:-2]
        if stem.endswith(("s", "x", "z", "ch", "sh")):
            return stem
        return w[:-1]
    if w.endswith("s") and len(w) > 3 and not w.endswith("ss"):
        return w[:-1]
    return w


def load_sources() -> list[dict]:
    files = sorted(SOURCE_DIR.glob("考研英语词汇_*.csv"))
    sources = []
    for f in files:
        m = re.search(r"(\d{4}-\d{2}-\d{2}).*?(第\d+组)", f.name)
        if not m:
            continue
        sources.append({"file": f, "date": m.group(1), "group": m.group(2)})
    return sources


def build() -> dict:
    sources = load_sources()
    entries: dict[str, dict] = {}
    source_list = []

    for src in sources:
        f = src["file"]
        source_id = f"{src['date']}_{src['group']}"
        source_list.append(
            {
                "id": source_id,
                "label": src["group"],
                "date": src["date"],
                "filename": f.name,
            }
        )
        with f.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                raw = (row.get("word") or "").strip()
                if not raw:
                    continue
                display = normalize_display(raw)
                key = lemma_key(display)
                pos = re.sub(r"\s+", " ", (row.get("pos") or "").strip())
                meaning = re.sub(r"\s+", " ", (row.get("meaning") or "").strip())
                note = re.sub(r"\s+", " ", (row.get("note") or "").strip())

                if key not in entries:
                    entries[key] = {
                        "id": key,
                        "lemma": key,
                        "forms": [],
                        "pos": pos,
                        "meaning": meaning,
                        "note": note,
                        "sourceCount": 0,
                        "sources": [],
                        "occurrences": [],
                    }
                e = entries[key]
                if display not in e["forms"]:
                    e["forms"].append(display)
                # 保留更长/更完整的释义
                if meaning and (not e["meaning"] or len(meaning) > len(e["meaning"])):
                    e["meaning"] = meaning
                if pos and pos not in e["pos"]:
                    e["pos"] = f"{e['pos']} / {pos}" if e["pos"] else pos
                if note and not e["note"]:
                    e["note"] = note
                e["sourceCount"] += 1
                if source_id not in e["sources"]:
                    e["sources"].append(source_id)
                e["occurrences"].append(
                    {
                        "source": source_id,
                        "date": src["date"],
                        "raw": display,
                    }
                )

    words = sorted(entries.values(), key=lambda e: (-e["sourceCount"], e["lemma"]))
    return {
        "generatedAt": date.today().isoformat(),
        "sourceCount": len(source_list),
        "wordCount": len(words),
        "totalOccurrences": sum(w["sourceCount"] for w in words),
        "sources": source_list,
        "words": words,
    }


def main() -> None:
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"sources={data['sourceCount']} words={data['wordCount']} occ={data['totalOccurrences']}")
    multi = [w for w in data["words"] if w["sourceCount"] > 1]
    print(f"multi-source words={len(multi)}")
    for w in multi[:15]:
        print(f"  {w['sourceCount']}  {w['lemma']}  forms={w['forms']}")

    # 校验可疑词形归并
    suspicious = [
        w
        for w in data["words"]
        if any(x in w["lemma"] for x in ("ing", "ed", "es", "ly"))
        and len(w["lemma"]) > 6
        and w["lemma"] not in ("bargain", "concern")
    ]
    print("check lemmas sample:", [w["lemma"] for w in data["words"] if w["lemma"] in ("ingest", "diminish", "filter", "curriculum", "liability", "miss", "erupt")])

    if OUT.exists():
        print("wrote", OUT)


if __name__ == "__main__":
    main()
