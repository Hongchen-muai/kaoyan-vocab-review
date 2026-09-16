/* 词形归并：忽略时态/屈折变形 */
(function (global) {
  const IRREGULAR = {
    ingested: "ingest",
    erupted: "erupt",
    impelled: "impel",
    infested: "infest",
    informed: "inform",
    survived: "survive",
    misses: "miss",
    missed: "miss",
    conspiring: "conspire",
    counteracting: "counteract",
    fulfilling: "fulfill",
    hacking: "hack",
    humiliating: "humiliate",
    illuminating: "illuminate",
    sorting: "sort",
    stating: "state",
    refereeing: "referee",
    remodeling: "remodel",
    commercialised: "commercialise",
    commercialized: "commercialize",
    liberalising: "liberalise",
    polarised: "polarise",
    curriculums: "curriculum",
    liabilities: "liability",
    diminishes: "diminish",
    filtered: "filter",
    emerging: "emerge",
    embarrassing: "embarrass",
    unsettling: "unsettle",
    unfunded: "unfund",
    unmentioned: "unmention",
    unsurpassed: "unsurpass",
    upended: "upend",
    upsetting: "upset",
    outdated: "outdate",
    puzzlement: "puzzle",
    concerned: "concern",
    infuriating: "infuriate",
    impoverished: "impoverish",
    processed: "process",
    scattered: "scatter",
    belated: "belate",
    arising: "arise",
    arose: "arise",
    better: "good",
    // 完整词保护，避免规则误伤
    consensus: "consensus",
    indeed: "indeed",
    sacred: "sacred",
    succeed: "succeed",
    thus: "thus",
    everlasting: "everlasting",
    lasting: "lasting",
    emphasis: "emphasis",
    address: "address",
    assess: "assess",
    class: "class",
    conscious: "conscious",
    dismiss: "dismiss",
    eagerness: "eagerness",
    fairness: "fairness",
    generous: "generous",
    groundless: "groundless",
    holiness: "holiness",
    stress: "stress",
    vicious: "vicious",
    witness: "witness",
    contemptuous: "contemptuous",
    preliminary: "preliminary",
  };

  const S_KEEP = /(sis|ous|ness|less|ism|ist|ics|ews|ius|mus|tum|ium|ess|ss)$/;

  function normalizeDisplay(word) {
    let w = String(word || "").trim();
    if (!w) return "";
    w = w.replace(/\|/g, " ");
    w = w.replace(/\s+/g, " ").trim();
    return w;
  }

  function lemmaKey(word) {
    const display = normalizeDisplay(word).toLowerCase().replace(/’/g, "'");
    if (!display) return "";
    if (display.includes(" ") || display.includes("-")) {
      return display.replace(/[ .,;:!?]+$/g, "");
    }
    if (IRREGULAR[display]) return IRREGULAR[display];
    const w = display;
    if (w.length <= 3) return w;
    if (S_KEEP.test(w)) return w;
    if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
    if (w.endsWith("ing") && w.length > 5) {
      let stem = w.slice(0, -3);
      if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2] && !"aeiou".includes(stem[stem.length - 1])) {
        stem = stem.slice(0, -1);
      }
      return stem;
    }
    if (w.endsWith("ed") && w.length > 4) {
      let stem = w.slice(0, -2);
      if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2] && !"aeiou".includes(stem[stem.length - 1])) {
        stem = stem.slice(0, -1);
      }
      if (stem.endsWith("i")) return stem.slice(0, -1) + "y";
      return stem;
    }
    if (w.endsWith("es") && w.length > 4) {
      const stem = w.slice(0, -2);
      if (/(s|x|z|ch|sh)$/.test(stem)) return stem;
      return w.slice(0, -1);
    }
    if (w.endsWith("s") && w.length > 3 && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  }

  global.Lemma = { lemmaKey, normalizeDisplay, IRREGULAR };
})(window);
