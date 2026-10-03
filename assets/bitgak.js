/* BITGAK 빗각 알리미. Stored research results only. No quote requests, credentials or order actions.
   알고리즘은 사는 자리(지연선 신호)만 알려 주고, 매도는 사람이 정한다. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const data = window.BITGAK_DATA;
  const num = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
  // 한국 관례: 오름(+) 빨강 ▲, 내림(−) 파랑 ▼. 기호를 함께 써서 색만으로 구분하지 않는다.
  const pct = (n, d = 1) => Number.isFinite(n) ? `${n > 0 ? "▲ +" : n < 0 ? "▼ −" : ""}${num(Math.abs(n), d)}%` : "—";
  const price = (n) => num(n, n >= 1000 ? 0 : 2);
  const fmtDate = (d) => d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "";
  const cell = (v) => { const td = document.createElement("td"); if (Array.isArray(v)) { td.textContent = v[0]; if (v[1]) td.className = v[1]; } else td.textContent = v; return td; };
  const tableRow = (values) => { const tr = document.createElement("tr"); values.forEach((v) => tr.append(cell(v))); return tr; };

  if (!data || data.schema !== 1 || data.strategy !== "bitgak" || !Array.isArray(data.assets) || !data.assets.length) {
    $("bg-global-status").textContent = "저장된 계산 결과를 불러오지 못했습니다. 위의 규칙과 아래 출처는 그대로 읽을 수 있습니다.";
    $("bg-summary-say").textContent = "계산 결과를 불러오지 못했습니다.";
    return;
  }
  const generated = new Date(data.generated_at);
  $("bg-global-status").textContent = `마지막 계산: ${generated.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간). ` +
    (data.automatic_refresh ? "GitHub Actions가 하루 한 번 다시 계산하고, 실패한 종목은 이전 결과를 그대로 둡니다." : "내 컴퓨터에서 계산해 올린 결과입니다.");
  const ok = data.assets.filter((a) => a.latest && a.backtest);

  // ---------- 01 알리미: 지금 빗각 현황 ----------
  const STATE = { enter: ["지연선 신호!", "bg-state-enter"], watch: ["지연선 대기", "bg-state-watch"], none: ["하락 빗각 없음", "bg-state-none"] };
  $("bg-now").replaceChildren(...data.assets.map((a) => {
    const L = a.latest;
    if (!L) return tableRow([a.name, "수집 실패", "—", "—", "—"]);
    const [label, cls] = STATE[L.state];
    return tableRow([`${a.name}${a.status === "stale" ? " (이전 결과)" : ""}`, [label, cls], price(L.close),
      L.dn_delay == null ? "—" : price(L.dn_delay),
      L.to_delay_pct == null ? "—" : L.state === "enter" ? "넘음" : `+${num(L.to_delay_pct, 1)}% 남음`]);
  }));
  const ends = ok.map((a) => a.latest.date).sort();
  if (ends.length) $("bg-now-date").textContent = `마지막 확정 일봉 ${ends[0] === ends.at(-1) ? ends[0] : `${ends[0]} ~ ${ends.at(-1)}`} 기준`;

  // ---------- 02 성적표 ----------
  function renderSummary() {
    const period = $("bg-period").value;
    $("bg-summary").replaceChildren(...ok.map((a) => {
      const { delay: d, plain: p, any: x } = a[period];
      return tableRow([a.name, `${d.count}`, `${pct(d.r20)} / ${pct(x.r20)}`, `${pct(d.r60)} / ${pct(x.r60)}`,
        d.complete ? `${pct(d.best)} · ${pct(d.worst)}` : "—", pct(p.r60)]);
    }));
    const v20 = ok.filter((a) => a[period].delay.r20 != null);
    const beat20 = v20.filter((a) => a[period].delay.r20 > a[period].any.r20).length;
    const v60 = ok.filter((a) => a[period].delay.r60 != null);
    const beat60 = v60.filter((a) => a[period].delay.r60 > a[period].any.r60).length;
    const after60 = beat60 === 0 ? `60일 뒤에는 ${v60.length}종목 모두 아무 날보다 낮았어요` : `60일 뒤에는 ${v60.length}종목 중 ${beat60}개만 아무 날보다 높았어요`;
    const say = `지연선 신호 뒤 20일 수익률은 ${v20.length}종목 중 ${beat20}개에서 아무 날보다 높았지만, ${after60}. `;
    $("bg-summary-say").textContent = say + (beat20 > beat60 ? "신호 뒤 한동안은 힘이 있지만, 오래 들고 있으면 평범해졌어요. 언제 팔지가 결과를 갈라요." : "신호 뒤 움직임이 아무 날과 크게 다르지 않았어요.");
    if (period === "backtest") $("bg-hero-span").textContent = `2022년 이후 ${v20.length}종목: 지연선 신호 뒤 20일은 ${beat20}개 종목에서 아무 날보다 많이 올랐지만, ${after60}. 그래서 매도는 사람이 판단해요.`;
  }
  $("bg-period").addEventListener("change", renderSummary);
  renderSummary();

  // ---------- 03 신호 하나 뜯어보기 ----------
  const selector = $("bg-asset");
  selector.replaceChildren(...data.assets.map((a) => {
    const o = document.createElement("option");
    o.value = a.symbol;
    o.textContent = `${a.name} · ${a.symbol}${a.status === "error" ? " · 수집 실패" : a.status === "stale" ? " · 이전 결과" : ""}`;
    return o;
  }));
  selector.disabled = false;
  let epIndex = -1;  // 보고 있는 신호(-1 = 가장 최근)
  const NS = "http://www.w3.org/2000/svg";

  function render() {
    const a = data.assets.find((x) => x.symbol === selector.value);
    const ready = a && a.episodes;
    $("bg-content").hidden = !ready;
    $("bg-asset-status").hidden = !a || a.status === "ok";
    if (a) $("bg-asset-status").textContent = a.status === "error" ? "시세 수집에 실패했습니다."
      : "코인 선물 시세는 GitHub 서버(미국)에서 받을 수 없어, 마지막으로 내 컴퓨터에서 계산한 결과를 보여 줍니다.";
    if (!ready) return;
    $("bg-symbol-title").textContent = `${a.name} / ${a.symbol}`;
    const eps = a.episodes;
    if (epIndex < 0 || epIndex >= eps.length) epIndex = eps.length - 1;
    draw(a, eps);
  }

  function draw(a, eps) {
    const svg = $("bg-ep-chart"), steps = $("bg-ep-steps"), cur = a.currency;
    svg.replaceChildren(); steps.replaceChildren();
    $("bg-ep-prev").disabled = epIndex <= 0;
    $("bg-ep-next").disabled = epIndex >= eps.length - 1;
    if (!eps.length) { $("bg-ep-label").textContent = "2022년 이후 신호가 없어요"; return; }
    const e = eps[epIndex], rows = e.rows;
    $("bg-ep-label").textContent = `${epIndex + 1} / ${eps.length} · ${e.signal_date} 신호`;
    const idx = new Map(rows.map((r, i) => [r.date, i]));
    const at = (d) => idx.get(d);
    const lineVal = (L, x) => { const ia = at(L.a[0]), ib = at(L.b[0]); return L.a[1] + (L.b[1] - L.a[1]) / (ib - ia) * (x - ia); };
    const W = Math.max(320, Math.round(svg.getBoundingClientRect().width) || 960), H = 340, left = 62, right = W - 14, top = 18, bottom = H - 34;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const ia = at(e.line.a[0]), ib = at(e.line.b[0]), iSig = at(e.signal_date), iEnt = at(e.entry_date);
    const iEnd = Math.min(rows.length - 1, iEnt + 59);
    const vals = rows.flatMap((r) => [r.high, r.low]);
    [ia, ib, iSig].forEach((x) => vals.push(lineVal(e.line, x) + e.line.w, lineVal(e.line, x) - e.line.w));
    let min = Math.min(...vals), max = Math.max(...vals); const pad = (max - min) * 0.06; min -= pad; max += pad;
    const x = (i) => left + (right - left) * (i / Math.max(1, rows.length - 1));
    const y = (v) => bottom - (v - min) / (max - min) * (bottom - top);
    const add = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (text != null) n.textContent = text; svg.append(n); return n; };
    // 신호 뒤 60일 구간
    add("rect", { x: x(iEnt), y: top, width: Math.max(1, x(iEnd) - x(iEnt)), height: bottom - top, fill: "#ffd23f", opacity: .16 });
    for (let k = 0; k <= 4; k++) {
      const v = min + (max - min) * k / 4;
      add("line", { x1: left, x2: right, y1: y(v), y2: y(v), stroke: "#eef0f3" });
      add("text", { x: left - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "#6b7684" }, price(v));
    }
    const seg = (from, to, f) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k).map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(f(i)).toFixed(1)}`).join(" ");
    const lower = Array.from({ length: ib - ia + 1 }, (_, k) => ib - k).map((i) => `L${x(i).toFixed(1)},${y(lineVal(e.line, i) - e.line.w).toFixed(1)}`).join(" ");
    add("path", { d: `${seg(ia, ib, (i) => lineVal(e.line, i))} ${lower} Z`, fill: "#b8a6f0", opacity: .35 });
    add("path", { d: seg(ia, Math.min(rows.length - 1, iSig + 2), (i) => lineVal(e.line, i)), fill: "none", stroke: "#e8590c", "stroke-width": 2.5 });
    add("path", { d: seg(ib, Math.min(rows.length - 1, iSig + 2), (i) => lineVal(e.line, i) + e.line.w), fill: "none", stroke: "#d6336c", "stroke-width": 2.5 });
    add("path", { d: `M${x(iEnt)},${y(e.entry)} H${x(iEnd)}`, stroke: "#868e96", "stroke-width": 1.5, "stroke-dasharray": "4 3" });
    add("path", { d: seg(0, rows.length - 1, (i) => rows[i].close), fill: "none", stroke: "#191f28", "stroke-width": 2 });
    const dot = (i, v, label, color, dy) => {
      add("circle", { cx: x(i), cy: y(v), r: 5.5, fill: "#fff", stroke: color, "stroke-width": 2.5 });
      const anchor = i > rows.length * 0.85 ? "end" : i < rows.length * 0.1 ? "start" : "middle";
      add("text", { x: x(i), y: y(v) + dy, "text-anchor": anchor, "font-size": 12, "font-weight": 700, fill: color }, label);
    };
    dot(ia, e.line.a[1], "고점1", "#e8590c", -10);
    dot(ib, e.line.b[1], "고점2", "#e8590c", -10);
    dot(iEnt, e.entry, "신호 → 매수 자리", "#d6336c", 22);
    if (e.complete) {
      dot(iEnt + e.best_day - 1, e.entry * (1 + e.best / 100), `60일 안 최고 ${pct(e.best)}`, "#c8163f", -10);
      dot(iEnt + e.worst_day - 1, e.entry * (1 + e.worst / 100), `최저 ${pct(e.worst)}`, "#1360c4", 20);
    }
    [[0, rows[0].date], [rows.length - 1, rows.at(-1).date]].forEach(([i, d], k) =>
      add("text", { x: x(i), y: H - 10, "text-anchor": k ? "end" : "start", "font-size": 11, fill: "#6b7684" }, d));
    svg.setAttribute("aria-label", `${a.name} 신호 ${epIndex + 1}: ${e.line.a[0]}과 ${e.line.b[0]} 고점을 이은 빗각, ${e.signal_date} 지연선 돌파, 이후 60일 최고 ${num(e.best, 1)}%, 최저 ${num(e.worst, 1)}%`);

    const li = (html) => { const n = document.createElement("li"); n.innerHTML = html; steps.append(n); };
    const iPlain = e.plain_signal ? at(e.plain_signal) : null;
    li(`<b>빗각</b>: ${fmtDate(e.line.a[0])} 고점 ${price(e.line.a[1])}과 ${fmtDate(e.line.b[0])} 고점 ${price(e.line.b[1])}을 이었어요.`);
    li(`<b>채널 폭</b>: 두 고점 사이 가장 깊은 저점까지 ${price(e.line.w)} ${cur}. 빗각을 이만큼 위로 올린 선이 지연선이에요.`);
    li(`<b>신호</b>: ${fmtDate(e.signal_date)} 종가가 지연선을 넘었어요. 다음 날(${fmtDate(e.entry_date)}) 시가 ${price(e.entry)}이 기준 가격이에요.` +
      (iPlain != null && iPlain < iSig ? ` 빗각 그대로였다면 ${iSig - iPlain}일 먼저(${fmtDate(e.plain_signal)}) 신호가 났을 자리예요.` : ""));
    li(e.complete
      ? `<b>그 뒤 60일</b>: ${e.best_day}일째 최고 ${pct(e.best)}, ${e.worst_day}일째 최저 ${pct(e.worst)}. 20일 뒤 ${pct(e.r20)}, 60일 뒤 ${pct(e.r60)}. 언제 팔았느냐에 따라 결과가 이만큼 달라져요.`
      : `<b>그 뒤</b>: 아직 60일이 지나지 않았어요.${e.r20 != null ? ` 20일 뒤 ${pct(e.r20)}.` : ""}`);
  }
  selector.addEventListener("change", () => { epIndex = -1; render(); });
  $("bg-ep-prev").addEventListener("click", () => { epIndex--; render(); });
  $("bg-ep-next").addEventListener("click", () => { epIndex++; render(); });
  let frame;
  window.addEventListener("resize", () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); });
  render();
})();
