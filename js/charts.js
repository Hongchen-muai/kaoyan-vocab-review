/* Canvas 图表：遗忘曲线 + 到期预测 */
(function (global) {
  function dprCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(280, rect.width || canvas.clientWidth || 640);
    const h = canvas.height; // attribute height as CSS design height
    canvas.style.height = h + "px";
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function drawForgetting(canvas, series) {
    const { ctx, w, h } = dprCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const pad = { t: 16, r: 12, b: 28, l: 36 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;

    // grid
    ctx.strokeStyle = "#E4ECE9";
    ctx.fillStyle = "#6A7472";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ih * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      const label = Math.round((1 - i / 4) * 100) + "%";
      ctx.fillText(label, 4, y + 3);
    }

    if (!series || !series.length) return;

    function xOf(i) {
      return pad.l + (iw * i) / (series.length - 1);
    }
    function yOf(r) {
      return pad.t + ih * (1 - Math.max(0, Math.min(1, r)));
    }

    // scheduled curve
    ctx.beginPath();
    series.forEach((p, i) => {
      const x = xOf(i);
      const y = yOf(p.rScheduled);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#2F8F6B";
    ctx.lineWidth = 2;
    ctx.stroke();

    // current curve fill
    ctx.beginPath();
    series.forEach((p, i) => {
      const x = xOf(i);
      const y = yOf(p.r);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#C45C26";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.lineTo(xOf(series.length - 1), pad.t + ih);
    ctx.lineTo(xOf(0), pad.t + ih);
    ctx.closePath();
    ctx.fillStyle = "rgba(196, 92, 38, 0.08)";
    ctx.fill();

    // x labels
    ctx.fillStyle = "#6A7472";
    const maxT = series[series.length - 1].t;
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
      const i = Math.round(f * (series.length - 1));
      const label = f === 0 ? "今天" : `${Math.round(series[i].t)}天`;
      ctx.fillText(label, xOf(i) - (f === 0 ? 0 : 10), h - 8);
    });
  }

  function drawForecast(canvas, rows) {
    const { ctx, w, h } = dprCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const pad = { t: 16, r: 10, b: 28, l: 28 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const max = Math.max(5, ...rows.map((r) => r.count));
    const n = rows.length;
    const gap = 6;
    const bw = Math.max(6, iw / n - gap);

    ctx.fillStyle = "#6A7472";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.strokeStyle = "#E4ECE9";
    for (let i = 0; i <= 2; i++) {
      const y = pad.t + (ih * i) / 2;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillText(String(Math.round((1 - i / 2) * max)), 6, y + 3);
    }

    rows.forEach((r, i) => {
      const bh = Math.max(2, (r.count / max) * ih);
      const x = pad.l + (iw / n) * i + gap / 2;
      const y = pad.t + ih - bh;
      ctx.fillStyle = i === 0 ? "#173C38" : "#2F8F6B";
      ctx.fillRect(x, y, bw, bh);
      if (i % 3 === 0) {
        ctx.fillStyle = "#6A7472";
        const day = r.date.slice(5);
        ctx.fillText(day, x - 2, h - 8);
      }
    });
  }

  function setRing(ringEl, ratio) {
    const C = 2 * Math.PI * 52;
    const r = Math.max(0, Math.min(1, ratio));
    ringEl.style.strokeDasharray = String(C);
    ringEl.style.strokeDashoffset = String(C * (1 - r));
  }

  global.Charts = { drawForgetting, drawForecast, setRing };
})(window);
