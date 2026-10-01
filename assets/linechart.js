/* 공용 선 차트 — 2·5번에서 쓴다. 휴대폰에서 읽히게: 큰 글씨, 굵은 주선, 범례에 최신 값,
   짚으면(손가락·마우스·방향키) 그날 값을 보여 준다.
   LineChart.draw(svg, {
     rows, series: [{key, label, color, width, dash, fmt}], band: {lo, hi, color, label},
     markers: [{date, price, kind, side, title}], segmentKey, height, theme: "dark"|"light",
     label, yfmt, zero, legend: Element
   }) */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text != null) n.textContent = text;
    return n;
  };
  const THEME = {
    dark: { grid: "#302449", ink: "#bfb5ea", strong: "#f3eeff", tipBg: "#1b1438", tipInk: "#f3eeff", zero: "#8f86c0" },
    light: { grid: "#d1c7e7", ink: "#4a4270", strong: "#1b1438", tipBg: "#1b1438", tipInk: "#f3eeff", zero: "#1b1438" },
  };
  const lastOf = (rows, key) => { for (let i = rows.length - 1; i >= 0; i--) if (Number.isFinite(rows[i][key])) return rows[i][key]; return null; };

  function draw(svg, o) {
    const T = THEME[o.theme || "dark"];
    const rows = o.rows || [];
    const yfmt = o.yfmt || ((v) => v.toLocaleString("ko-KR", { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }));
    svg.replaceChildren();
    const titleId = `${svg.id}-title`;
    svg.setAttribute("aria-labelledby", titleId);
    svg.append(mk("title", { id: titleId }, o.label || ""));
    if (o.legend) renderLegend(o.legend, o, rows, yfmt);
    if (!rows.length) { svg.setAttribute("viewBox", "0 0 320 80"); svg.append(mk("text", { x: 16, y: 44, fill: T.ink, "font-size": 14 }, "표시할 기록이 없습니다.")); return; }

    const W = Math.max(300, Math.min(960, Math.floor(svg.getBoundingClientRect().width) || 360));
    const H = o.height || 260;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const vals = [];
    rows.forEach((r) => {
      o.series.forEach((s) => Number.isFinite(r[s.key]) && vals.push(r[s.key]));
      if (o.band) [o.band.lo, o.band.hi].forEach((k) => Number.isFinite(r[k]) && vals.push(r[k]));
    });
    const inView = new Set(rows.map((r) => r.date));
    const markers = (o.markers || []).filter((m) => inView.has(m.date));
    markers.forEach((m) => Number.isFinite(m.price) && vals.push(m.price));
    if (o.zero) vals.push(0);
    if (!vals.length) return;
    let min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.08 || Math.max(Math.abs(max) * 0.02, 1);
    min -= pad; max += pad;

    // 눈금은 딱 떨어지는 값(1·2·2.5·5 × 10ⁿ)으로 4~6개
    const raw = (max - min) / 4, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    min = Math.floor(min / step) * step; max = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
    const labelW = Math.max(...ticks.map((v) => yfmt(v).length)) * 7.4 + 10;
    const left = Math.round(labelW), right = W - 10, top = 14, bottom = H - 30;
    const x = (i) => left + (rows.length > 1 ? i / (rows.length - 1) : 0.5) * (right - left);
    const y = (v) => bottom - (v - min) / (max - min) * (bottom - top);

    ticks.forEach((v) => {
      svg.append(mk("line", { x1: left, x2: right, y1: y(v), y2: y(v), stroke: T.grid, "stroke-width": 1 }));
      svg.append(mk("text", { x: left - 8, y: y(v) + 4, fill: T.ink, "font-size": 13, "text-anchor": "end" }, yfmt(v)));
    });
    if (o.zero && min < 0 && max > 0) {
      svg.append(mk("line", { x1: left, x2: right, y1: y(0), y2: y(0), stroke: T.zero, "stroke-width": 2 }));
      svg.append(mk("text", { x: right - 2, y: y(0) - 5, fill: T.zero, "font-size": 12, "text-anchor": "end", "font-weight": 700 }, "0% 본전"));
    }
    const xt = W < 600 ? [0, rows.length - 1] : [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
    [...new Set(xt)].forEach((i) => svg.append(mk("text", {
      x: x(i), y: H - 9, fill: T.ink, "font-size": 13, "text-anchor": i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle",
    }, rows[i].date)));

    // 띠(예: 20일 범위): 위·아래 선 사이를 칠한다
    if (o.band) {
      let seg = [];
      const flush = () => {
        if (seg.length > 1) {
          const up = seg.map((i) => `${x(i).toFixed(1)},${y(rows[i][o.band.hi]).toFixed(1)}`);
          const dn = seg.slice().reverse().map((i) => `${x(i).toFixed(1)},${y(rows[i][o.band.lo]).toFixed(1)}`);
          svg.append(mk("polygon", { points: [...up, ...dn].join(" "), fill: o.band.color, opacity: 0.2 }));
          [o.band.hi, o.band.lo].forEach((k) => svg.append(mk("polyline", {
            points: seg.map((i) => `${x(i).toFixed(1)},${y(rows[i][k]).toFixed(1)}`).join(" "),
            fill: "none", stroke: o.band.color, "stroke-width": 1.5, opacity: 0.85,
          })));
        }
        seg = [];
      };
      rows.forEach((r, i) => (Number.isFinite(r[o.band.lo]) && Number.isFinite(r[o.band.hi]) ? seg.push(i) : flush()));
      flush();
    }

    o.series.forEach((s) => {
      let d = "", on = false, prevSeg;
      rows.forEach((r, i) => {
        if (!Number.isFinite(r[s.key])) { on = false; return; }
        if (o.segmentKey && s.segmented && r[o.segmentKey] !== prevSeg) on = false;
        prevSeg = r[o.segmentKey];
        d += `${on ? "L" : "M"}${x(i).toFixed(1)},${y(r[s.key]).toFixed(1)} `;
        on = true;
      });
      svg.append(mk("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2.5, "stroke-dasharray": s.dash || "none", "stroke-linejoin": "round", "stroke-linecap": "round" }));
    });

    const idx = new Map(rows.map((r, i) => [r.date, i]));
    markers.forEach((m) => {
      const px = x(idx.get(m.date)), py = y(m.price), s = 7;
      const pts = m.kind === "exit" ? `${px},${py - s} ${px + s},${py} ${px},${py + s} ${px - s},${py}`
        : m.side === 1 ? `${px},${py - s - 1} ${px + s},${py + s - 1} ${px - s},${py + s - 1}` : `${px},${py + s + 1} ${px + s},${py - s + 1} ${px - s},${py - s + 1}`;
      const p = mk("polygon", { points: pts, fill: m.kind === "exit" ? "#0f0b24" : "#ffd23f", stroke: "#ffd23f", "stroke-width": 2 });
      p.append(mk("title", {}, m.title || ""));
      svg.append(p);
    });

    // 짚으면 값 보기
    const tip = mk("g", { "pointer-events": "none", visibility: "hidden" });
    const vline = mk("line", { y1: top, y2: bottom, stroke: T.strong, "stroke-width": 1, "stroke-dasharray": "3 3" });
    const dots = o.series.map((s) => mk("circle", { r: 4.5, fill: s.color, stroke: T.tipBg, "stroke-width": 2 }));
    const box = mk("rect", { rx: 0, fill: T.tipBg, stroke: "#ffd23f", "stroke-width": 2 });
    const lines = [mk("text", { "font-size": 13, "font-weight": 700, fill: "#ffd23f" })]
      .concat(o.series.map(() => mk("text", { "font-size": 13, fill: T.tipInk })));
    tip.append(vline, ...dots, box, ...lines);
    svg.append(tip);
    const hit = mk("rect", { x: left, y: top, width: right - left, height: bottom - top, fill: "transparent", style: "cursor:crosshair;touch-action:pan-y" });
    svg.append(hit);
    let cur = rows.length - 1;
    const show = (i) => {
      cur = Math.max(0, Math.min(rows.length - 1, i));
      const r = rows[cur], px = x(cur);
      vline.setAttribute("x1", px); vline.setAttribute("x2", px);
      const texts = [r.date, ...o.series.map((s) => `${s.label} ${Number.isFinite(r[s.key]) ? (s.fmt || yfmt)(r[s.key]) : "—"}`)];
      lines.forEach((t, k) => { t.textContent = texts[k]; });
      o.series.forEach((s, k) => {
        const ok = Number.isFinite(r[s.key]);
        dots[k].setAttribute("visibility", ok ? "visible" : "hidden");
        if (ok) { dots[k].setAttribute("cx", px); dots[k].setAttribute("cy", y(r[s.key])); }
      });
      const bw = Math.max(...texts.map((t) => t.length)) * 8.2 + 16, bh = texts.length * 18 + 10;
      const bx = px + 12 + bw > right ? px - 12 - bw : px + 12;
      box.setAttribute("x", bx); box.setAttribute("y", top + 2); box.setAttribute("width", bw); box.setAttribute("height", bh);
      lines.forEach((t, k) => { t.setAttribute("x", bx + 8); t.setAttribute("y", top + 20 + k * 18); });
      tip.setAttribute("visibility", "visible");
    };
    const at = (ev) => {
      const r = svg.getBoundingClientRect();
      const sx = (ev.clientX - r.left) * (W / r.width);
      return Math.round((sx - left) / ((right - left) / Math.max(1, rows.length - 1)));
    };
    hit.addEventListener("pointermove", (ev) => show(at(ev)));
    hit.addEventListener("pointerdown", (ev) => show(at(ev)));
    hit.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") tip.setAttribute("visibility", "hidden"); });
    svg.setAttribute("tabindex", "0");
    svg.onkeydown = (ev) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, Home: -rows.length, End: rows.length }[ev.key];
      if (step) { ev.preventDefault(); show(cur + step); }
      if (ev.key === "Escape") tip.setAttribute("visibility", "hidden");
    };
    svg.onfocus = () => show(cur);
    svg.onblur = () => tip.setAttribute("visibility", "hidden");
  }

  function renderLegend(el, o, rows, yfmt) {
    el.replaceChildren();
    o.series.forEach((s) => {
      const chip = document.createElement("span");
      chip.className = "lc-chip";
      const sw = document.createElement("i");
      sw.style.background = s.dash ? `repeating-linear-gradient(90deg, ${s.color} 0 6px, transparent 6px 9px)` : s.color;
      const v = lastOf(rows, s.key);
      chip.append(sw, `${s.label}${v == null ? "" : ` ${(s.fmt || yfmt)(v)}`}`);
      el.append(chip);
    });
    if (o.band) {
      const chip = document.createElement("span");
      chip.className = "lc-chip";
      const sw = document.createElement("i");
      sw.style.background = o.band.color; sw.style.opacity = ".5"; sw.style.height = "10px";
      chip.append(sw, o.band.label || "범위");
      el.append(chip);
    }
  }

  window.LineChart = { draw };
})();
