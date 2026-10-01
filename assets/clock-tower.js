/* CLOCK TOWER — clock/build.py가 만든 168칸 요약(window.CLOCK_DATA)을 지도로 그린다. */
(() => {
  const D = window.CLOCK_DATA;
  const $ = (id) => document.getElementById(id);
  const head = $("ct-headline");
  if (!head) return;
  if (!D) { head.textContent = "계산 결과 파일을 찾지 못했습니다. clock/build.py를 먼저 실행하세요."; return; }

  const W = D.weekdays;
  const base = D.base.all;
  const cell = (w, h) => D.cells[w * 24 + h];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const VERDICT = { verified: "검증됨", maybe_luck: "우연일 수 있음", none: "평소와 차이 없음" };
  const hh = (h) => `${String(h).padStart(2, "0")}시`;
  const label = (c) => `${W[c.w]}요일 ${hh(c.h)}`;
  // 한국 관례: 오름 빨강 ▲, 내림 파랑 ▼
  const move = (v) => {
    const t = Math.abs(v).toFixed(3);
    if (Number(t) === 0) return el("span", "", "0.000%");
    return v > 0 ? el("span", "up", `▲ +${t}%`) : el("span", "down", `▼ −${t}%`);
  };

  // 지금(한국 시간) 칸. 페이지를 열어 둔 채 정시를 넘기면 1분 안에 옮겨 간다.
  let nowW, nowH;
  const readNow = () => {
    const now = new Date(Date.now() + 9 * 3600000);
    const w = (now.getUTCDay() + 6) % 7, h = now.getUTCHours();
    const changed = w !== nowW || h !== nowH;
    nowW = w; nowH = h;
    return changed;
  };
  readNow();
  let followNow = true;  // 방문자가 직접 칸을 고르기 전까지는 상세도 '지금'을 따라간다

  // 색: 출렁임은 노랑 농도(시세색 아님), 등락·오른 비율은 오름 빨강 / 내림 파랑
  const mix = (a, b, t) => {
    const p = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t)))).join(",")})`;
  };
  // 출렁임은 연속 농도 대신 또렷한 5단계로 (휴대폰에서 칸이 작아도 구분되게)
  const BINS = [
    { max: 0.8, color: "#f3f0ff", label: "0.8배 미만" },
    { max: 0.95, color: "#d0bfff", label: "0.8~0.95배" },
    { max: 1.05, color: "#9775fa", label: "평소(±5%)" },
    { max: 1.25, color: "#6741d9", label: "1.05~1.25배" },
    { max: Infinity, color: "#3b1f9e", label: "1.25배 이상" },
  ];
  const binOf = (r) => BINS.find((b) => r < b.max);
  const SCALE = {
    swing: { val: (c) => c.all.swing / base.swing, color: (r) => binOf(r).color,
      legend: "출렁임(평소 대비): 옅을수록 조용, 진한 보라일수록 많이 출렁임" },
    move: { val: (c) => c.all.move, color: (v, max) => (v >= 0 ? mix("#f2f4f6", "#f04452", v / max) : mix("#f2f4f6", "#3182f6", -v / max)),
      legend: "빨강 ▲ = 평균적으로 오른 시간, 파랑 ▼ = 내린 시간 (진할수록 큼)" },
    up: { val: (c) => c.all.up - base.up, color: (v, max) => (v >= 0 ? mix("#f2f4f6", "#f04452", v / max) : mix("#f2f4f6", "#3182f6", -v / max)),
      legend: "빨강 = 평소보다 오른 비율이 높은 시간, 파랑 = 낮은 시간" },
  };

  // ── 요일별 24시간 막대그래프(휴대폰에서 먼저 보는 그림)
  let barDay = nowW;
  const dayBox = $("ct-days");
  W.forEach((d, i) => {
    const b = el("button", "", d);
    b.type = "button";
    b.dataset.w = i;
    b.addEventListener("click", () => { barDay = i; drawBars(); });
    dayBox.append(b);
  });
  function drawBars() {
    [...dayBox.children].forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.w === barDay)));
    const cs = Array.from({ length: 24 }, (_, h) => cell(barDay, h));
    const rs = cs.map((c) => c.all.swing / base.swing);
    const peak = rs.indexOf(Math.max(...rs)), low = rs.indexOf(Math.min(...rs));
    const isToday = barDay === nowW;
    $("ct-day-title").textContent = `${W[barDay]}요일${isToday ? "(오늘)" : ""} 24시간 출렁임`;
    $("ct-day-say").textContent = `${W[barDay]}요일에 가장 출렁이는 때는 ${hh(peak)}(평소의 ${rs[peak].toFixed(2)}배), 가장 조용한 때는 ${hh(low)}(${rs[low].toFixed(2)}배).` +
      (isToday ? ` 지금 ${hh(nowH)}은 ${rs[nowH].toFixed(2)}배.` : "");
    const Wd = 360, H = 220, L = 40, R = 354, T = 26, B = 186;
    const top = Math.max(1.75, Math.ceil(Math.max(...rs) * 4) / 4);
    const y = (v) => B - (v / top) * (B - T);
    const slot = (R - L) / 24, bw = slot * 0.74;
    const tx = (x, yy, s, fill, size = 12, anchor = "middle", weight = 400) =>
      `<text x="${x}" y="${yy}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${s}</text>`;
    let s = "";
    [0.5, 1, 1.5].filter((v) => v <= top).forEach((v) => {
      s += `<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 1 ? "#191f28" : "#e5e8eb"}" stroke-width="${v === 1 ? 1.5 : 1}" ${v === 1 ? 'stroke-dasharray="4 3"' : ""}/>`;
      s += tx(L - 6, y(v) + 4, `${v}배`, v === 1 ? "#191f28" : "#8b95a1", 12, "end", v === 1 ? 700 : 400);
    });
    cs.forEach((c, h) => {
      const x = L + h * slot + (slot - bw) / 2;
      const now = isToday && h === nowH;
      s += `<rect class="ct-bar" data-h="${h}" x="${x.toFixed(1)}" y="${y(rs[h]).toFixed(1)}" width="${bw.toFixed(1)}" height="${(B - y(rs[h])).toFixed(1)}" fill="${binOf(rs[h]).color}"${now ? ' stroke="#191f28" stroke-width="2"' : ""}><title>${hh(h)} · 평소의 ${rs[h].toFixed(2)}배</title></rect>`;
      if (h % 3 === 0) s += tx(L + h * slot + slot / 2, B + 16, String(h), "#8b95a1", 12);
      if (now) s += tx(L + h * slot + slot / 2, y(rs[h]) - 18, "지금", "#191f28", 12, "middle", 700);
    });
    const px = L + peak * slot + slot / 2;
    s += tx(Math.min(R - 22, Math.max(L + 22, px)), y(rs[peak]) - 6, `${rs[peak].toFixed(2)}배`, "#6b4eff", 12, "middle", 700);
    s += tx(R, H - 4, "시(한국)", "#8b95a1", 11, "end");
    const fig = $("ct-bars");
    fig.innerHTML = `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${W[barDay]}요일 시간별 출렁임 막대그래프. ${$("ct-day-say").textContent}">${s}</svg>`;
    fig.querySelectorAll(".ct-bar").forEach((r) => r.addEventListener("click", () => {
      daySel.value = barDay; hourSel.value = r.dataset.h; followNow = false; showDetail();
    }));
    let cap = fig.querySelector("figcaption");
    if (!cap) { cap = el("figcaption"); fig.append(cap); }
    cap.textContent = "막대 높이 = 평소(점선 1배) 대비 출렁임 · 막대를 누르면 아래에 자세한 값";
  }

  const grid = $("ct-grid");
  let metric = "swing";
  function drawGrid() {
    grid.textContent = "";
    const s = SCALE[metric];
    const max = Math.max(...D.cells.map((c) => Math.abs(s.val(c))));
    grid.append(el("span", "ct-corner"));
    for (let h = 0; h < 24; h++) grid.append(el("span", "ct-hlabel", h % 6 === 0 ? String(h) : ""));
    for (let w = 0; w < 7; w++) {
      grid.append(el("span", "ct-wlabel", W[w]));
      for (let h = 0; h < 24; h++) {
        const c = cell(w, h);
        const b = el("span", "ct-cell");
        b.style.background = s.color(s.val(c), max);
        if (c.verdict[metric] === "verified") b.classList.add("is-verified");
        if (w === nowW && h === nowH) b.classList.add("is-now");
        if (w === +daySel.value && h === +hourSel.value) b.classList.add("is-picked");
        b.dataset.w = w; b.dataset.h = h;
        grid.append(b);
      }
    }
    const lg = $("ct-legend");
    lg.textContent = s.legend;
    if (metric === "swing") {
      const row = el("span", "ct-bins");
      BINS.forEach((b) => { const k = el("span", "ct-bin", b.label); const sw = el("i"); sw.style.background = b.color; k.prepend(sw); row.append(k); });
      lg.append(row);
    }
  }

  grid.addEventListener("click", (e) => {
    const t = e.target.closest(".ct-cell");
    if (!t) return;
    daySel.value = t.dataset.w; hourSel.value = t.dataset.h;
    followNow = false;
    showDetail();
  });

  // 선택 상자: 키보드·화면낭독기로도 칸을 읽을 수 있게
  const daySel = $("ct-day"), hourSel = $("ct-hour");
  W.forEach((d, i) => daySel.append(new Option(`${d}요일`, i)));
  for (let h = 0; h < 24; h++) hourSel.append(new Option(`${hh(h)} (${hh(h)}~${hh((h + 1) % 24)})`, h));
  daySel.value = nowW; hourSel.value = nowH;
  [daySel, hourSel].forEach((s) => s.addEventListener("change", () => { followNow = false; showDetail(); }));

  function showDetail() {
    const c = cell(+daySel.value, +hourSel.value);
    const box = $("ct-detail");
    box.textContent = "";
    const isNow = c.w === nowW && c.h === nowH;
    box.append(el("p", "ct-detail-title", `${label(c)}${isNow ? " · 지금" : ""} — 과거 ${c.all.n.toLocaleString("ko-KR")}시간`));
    const dl = el("dl");
    const add = (k, v, verdictKey) => {
      dl.append(el("dt", "", k));
      const dd = el("dd");
      dd.append(v, " ", el("span", `ct-chip is-${c.verdict[verdictKey]}`, VERDICT[c.verdict[verdictKey]]));
      dl.append(dd);
    };
    add("출렁임", `${c.all.swing.toFixed(3)}% (평소의 ${(c.all.swing / base.swing).toFixed(2)}배)`, "swing");
    const m = el("span"); m.append(move(c.all.move), ` (평소 ${base.move >= 0 ? "+" : ""}${base.move.toFixed(4)}%)`);
    add("평균 등락", m, "move");
    add("오른 비율", `${(c.all.up * 100).toFixed(1)}% (평소 ${(base.up * 100).toFixed(1)}%)`, "up");
    box.append(dl);
    box.append(el("p", "ct-split", `구간별 출렁임: 2022년까지 ${c.design.swing.toFixed(3)}% · 2023년 이후 ${c.validation.swing.toFixed(3)}%`));
    drawGrid();
  }

  $("ct-metrics").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    metric = b.dataset.m;
    $("ct-metrics").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    drawGrid();
  });

  // 순위
  const bySwing = [...D.cells].sort((a, b) => b.all.swing - a.all.swing);
  const rankItem = (c) => {
    const li = el("li");
    li.append(`${label(c)} — ${c.all.swing.toFixed(3)}% (평소의 ${(c.all.swing / base.swing).toFixed(2)}배) `,
      el("span", `ct-chip is-${c.verdict.swing}`, VERDICT[c.verdict.swing]));
    return li;
  };
  bySwing.slice(0, 5).forEach((c) => $("ct-top").append(rankItem(c)));
  bySwing.slice(-5).reverse().forEach((c) => $("ct-bottom").append(rankItem(c)));

  const vc = D.verdict_counts;
  const v = (m) => (vc[m] && vc[m].verified) || 0;
  const upCells = D.cells.filter((c) => c.verdict.up === "verified").map((c) => `${label(c)}(${c.sign.up > 0 ? "더 자주 오름" : "덜 오름"})`);
  $("ct-direction").textContent =
    `168칸 중 검증됨: 출렁임 ${v("swing")}칸, 평균 등락 ${v("move")}칸, 오른 비율 ${v("up")}칸` +
    (upCells.length ? `(${upCells.join(", ")})` : "") +
    `. 언제 크게 움직이는지는 꽤 뚜렷하지만, 어느 쪽으로 움직일지는 시간만으로 거의 알 수 없습니다. 168칸을 셌으니 한두 칸은 우연일 수 있습니다.`;

  const top = bySwing[0];
  head.textContent = `가장 많이 출렁이는 시간은 ${label(top)}, 평소의 ${(top.all.swing / base.swing).toFixed(1)}배. 가장 조용한 시간은 ${label(bySwing[bySwing.length - 1])}.`;
  $("ct-range-tag").textContent = `${D.range.first.slice(0, 4)}–${D.range.last.slice(0, 4)} · ${D.range.hours.toLocaleString("ko-KR")}시간`;
  showDetail();
  drawBars();

  setInterval(() => {
    const prevDay = nowW;
    if (!readNow()) return;
    if (barDay === prevDay) barDay = nowW;
    drawBars();
    if (followNow) { daySel.value = nowW; hourSel.value = nowH; }
    showDetail();
  }, 60000);
})();
