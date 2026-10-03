/* BITGAK (빗각 · 지연 추세선). Stored research results only. No quote requests, credentials or order actions. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const data = window.BITGAK_DATA;
  const num = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
  // 한국 관례: 오름(+) 빨강 ▲, 내림(−) 파랑 ▼. 기호를 함께 써서 색만으로 구분하지 않는다.
  const pct = (n) => Number.isFinite(n) ? `${n > 0 ? "▲ +" : n < 0 ? "▼ −" : ""}${num(Math.abs(n))}%` : "—";
  const money = (n, currency) => Number.isFinite(n) ? `${n > 0 ? "▲ +" : n < 0 ? "▼ −" : ""}${num(Math.abs(n))} ${currency}` : "—";
  const tone = (n) => n > 0 ? "bo-positive" : n < 0 ? "bo-negative" : "";
  const share = (n) => n == null ? "—" : `${Math.round(n)}%`;
  const signedPct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
  const reasons = { stop: "안전 손절", gap_stop: "갭 손절", exit_line: "상승 지연선 이탈" };
  const cell = (text, cls) => { const td = document.createElement("td"); td.textContent = text; if (cls) td.className = cls; return td; };
  const tableRow = (values) => { const tr = document.createElement("tr"); values.forEach((v) => tr.append(Array.isArray(v) ? cell(...v) : cell(v))); return tr; };
  const chart = (id, opts) => window.LineChart.draw($(id), opts);

  if (!data || data.schema !== 1 || data.strategy !== "bitgak" || !Array.isArray(data.assets) || !data.assets.length) {
    $("bg-global-status").textContent = "저장된 계산 결과를 불러오지 못했습니다. 위의 규칙과 아래 출처는 그대로 읽을 수 있습니다.";
    $("bg-summary-say").textContent = "계산 결과를 불러오지 못했습니다.";
    return;
  }
  const ok = data.assets.filter((a) => a.backtest && a.backtest_plain);

  // ---------- 01 결론: 6종목 한눈에 ----------
  $("bg-summary").replaceChildren(...ok.map((a) => {
    const d = a.backtest, p = a.backtest_plain;
    return tableRow([a.name, [pct(d.return_pct), tone(d.return_pct)], [pct(p.return_pct), tone(p.return_pct)],
      `${d.count} / ${p.count}`, `${share(d.stop_rate)} / ${share(p.stop_rate)}`]);
  }));
  if (ok.length) {
    const fewer = ok.filter((a) => a.backtest.count < a.backtest_plain.count).length;
    const moreStops = ok.filter((a) => (a.backtest.stop_rate ?? 0) > (a.backtest_plain.stop_rate ?? 0)).length;
    const delayWins = ok.filter((a) => a.backtest.return_pct > a.backtest_plain.return_pct).length;
    const range = (key, f) => { const v = ok.map((a) => f(a[key])).filter(Number.isFinite); return [Math.min(...v), Math.max(...v)]; };
    const [ds0, ds1] = range("backtest", (r) => r.stop_rate), [ps0, ps1] = range("backtest_plain", (r) => r.stop_rate);
    $("bg-summary-say").textContent = `${ok.length}종목 중 ${fewer}개에서 지연선이 거래를 줄였지만, 손절로 끝난 비율은 ${moreStops}개에서 오히려 높았어요` +
      ` (지연선 ${Math.round(ds0)}~${Math.round(ds1)}% vs 그대로 ${Math.round(ps0)}~${Math.round(ps1)}%). ` +
      `‘가짜 돌파를 거른다’는 효과는 이 데이터에선 보이지 않았어요. 수익은 ${delayWins}개 종목에서 지연선이, ${ok.length - delayWins}개에서 빗각 그대로가 더 컸어요.`;
  }
  $("bg-summary-range").textContent = `${data.backtest_start} 이후 · 비용 차감 · 종목별 독립 계좌`;

  // ---------- 02 종목별 ----------
  const generated = new Date(data.generated_at);
  $("bg-global-status").textContent = `마지막 계산: ${generated.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간). ` +
    (data.automatic_refresh ? "GitHub Actions가 하루 한 번 다시 계산하고, 실패한 종목은 이전 결과를 그대로 둡니다." : "내 컴퓨터에서 계산해 올린 결과입니다.");
  const selector = $("bg-asset");
  selector.replaceChildren(...data.assets.map((a) => {
    const o = document.createElement("option");
    o.value = a.symbol;
    o.textContent = `${a.name} · ${a.symbol}${a.status === "error" ? " · 수집 실패" : a.status === "stale" ? " · 이전 결과" : ""}`;
    return o;
  }));
  selector.disabled = false;
  let epIndex = -1;  // 보고 있는 거래(-1 = 가장 최근)

  function render() {
    const a = data.assets.find((x) => x.symbol === selector.value);
    const period = $("bg-period").value;
    const ready = a && a.latest && a[period];
    $("bg-content").hidden = !ready;
    $("bg-results").hidden = !ready;
    const stale = a?.end && Date.now() - new Date(a.end + "T00:00:00Z").getTime() > (a.market === "crypto" ? 3 : 8) * 86400000;
    $("bg-asset-status").hidden = !a || (a.status === "ok" && !stale);
    if (a) $("bg-asset-status").textContent = a.status === "error" ? "시세 수집에 실패했습니다. 이 종목의 결과는 표시하지 않습니다."
      : a.market === "crypto" && a.status === "stale" ? "코인 선물 시세는 GitHub 서버(미국)에서 받을 수 없어, 마지막으로 내 컴퓨터에서 계산한 결과를 보여 줍니다."
      : "갱신되지 않은 이전 결과입니다. 표시된 기준일을 확인해 주세요.";
    if (!ready) return;
    const L = a.latest, cur = a.currency;
    $("bg-symbol-title").textContent = `${a.name} / ${a.symbol}`;
    $("bg-date").textContent = `${L.date} · 종가 ${num(L.close)} ${cur}`;
    $("bg-signal").textContent = L.state === "enter" ? "지연선 돌파" : L.state === "exit" ? "상승 지연선 이탈" : L.state === "watch" ? "지연선 대기" : "하락 빗각 없음";
    $("bg-reason").textContent = L.state === "enter" ? "오늘 종가가 지연선을 넘었습니다. 포지션이 없으면 다음 시가에 삽니다."
      : L.state === "watch" ? `내려가는 빗각이 있어요. 빗각 ${num(L.dn_line)}, 지연선 ${num(L.dn_delay)} — 종가가 지연선을 넘길 기다리는 중이에요.`
      : L.state === "exit" ? "오늘 종가가 상승 지연선을 깼습니다. 보유 중이면 다음 시가에 팝니다."
      : "최근 확정된 두 고점이 내려가고 있지 않아 지금은 그을 하락 빗각이 없어요. 새 고점이 생기면 다시 확인해요.";

    const result = a[period], plain = a[`${period}_plain`], bh = a.buy_hold?.[period];
    const eps = (a.episodes || []).filter((e) => period !== "holdout" || e.entry_date >= data.holdout_start);
    if (epIndex < 0 || epIndex >= eps.length) epIndex = eps.length - 1;
    drawEpisode(a, eps, cur);

    const rowFor = (label, r) => tableRow([label, [pct(r.return_pct), tone(r.return_pct)], `−${num(r.max_drawdown_pct, 1)}%`,
      `${r.count}건`, r.win_rate == null ? "—" : `${Math.round(r.win_rate)}%`, share(r.stop_rate),
      r.average_bars == null ? "—" : `${num(r.average_bars, 0)}일`]);
    $("bg-compare").replaceChildren(rowFor("지연선 (의뢰 규칙)", result), rowFor("빗각 그대로", plain),
      ...(bh ? [tableRow(["그냥 들고 있기", [pct(bh.return_pct), tone(bh.return_pct)], `−${num(bh.max_drawdown_pct, 1)}%`, "—", "—", "—", "—"])] : []));

    const pmap = new Map(plain.curve.map((r) => [r.date, r.equity]));
    const eq = result.curve.map((r) => ({ date: r.date, delay: (r.equity / result.initial - 1) * 100,
      plain: pmap.has(r.date) ? (pmap.get(r.date) / plain.initial - 1) * 100 : null }));
    chart("bg-equity-chart", {
      rows: eq, height: 250, theme: "light", zero: true, yfmt: signedPct, legend: $("bg-equity-legend"),
      label: "지연선 방식과 빗각 그대로 방식의 계좌 누적 수익률(%)",
      series: [{ key: "delay", label: "지연선", color: "#d6336c", width: 3.5 },
               { key: "plain", label: "빗각 그대로", color: "#191f28", width: 2.5, dash: "7 4" }],
    });
    const diff = result.return_pct - plain.return_pct;
    $("bg-equity-say").textContent = `지연선 ${signedPct(result.return_pct)} vs 빗각 그대로 ${signedPct(plain.return_pct)}. ` +
      `지연선은 거래 ${result.count}건 중 손절로 끝난 비율 ${share(result.stop_rate)}, 그대로는 ${plain.count}건 중 ${share(plain.stop_rate)}. ` +
      (Math.abs(diff) < 0.5 ? "수익 차이는 거의 없었어요." : diff > 0 ? "이 종목·구간에선 기다린 쪽이 더 벌었어요." : "이 종목·구간에선 바로 산 쪽이 더 벌었어요.");

    const list = result.trades.slice(-20).reverse();
    $("bg-trades").replaceChildren(...(list.length ? list.map((t) => tableRow([`${t.entry_date} → ${t.exit_date}`,
      [money(t.net, cur), tone(t.net)], `${t.bars}개`, reasons[t.reason] || t.reason, `${num(t.entry)} → ${num(t.exit)}`]))
      : [(() => { const tr = tableRow(["이 구간에는 청산한 거래가 없어요."]); tr.firstChild.colSpan = 5; return tr; })()]));
    $("bg-cost-note").textContent = `${a.cost_note} 편도 수수료 ${num(a.rules.fee * 100)}%, 슬리피지 ${num(a.rules.slippage * 100)}% 가정.` +
      (result.position ? ` 계산 끝 시점에 보유 중: ${result.position.entry_date} 진입, 진입가 ${num(result.position.entry)} ${cur}.` : "");
  }

  // ---------- 거래 하나 뜯어보기: 그 거래에 쓴 선만 그린다 ----------
  const NS = "http://www.w3.org/2000/svg";
  const fmtDate = (d) => d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "";
  const reasonText = { exit_line: "파는 선(상승 지연선)을 종가가 깨서 다음 날 시가에 팔았어요", stop: "안전 손절선에 닿아 팔았어요",
    gap_stop: "시가가 안전 손절선 아래로 갭이 나서 시가에 팔았어요", open: "계산 끝 시점까지 아직 들고 있어요" };
  function drawEpisode(a, eps, cur) {
    const svg = $("bg-ep-chart"), steps = $("bg-ep-steps");
    svg.replaceChildren(); steps.replaceChildren();
    $("bg-ep-prev").disabled = epIndex <= 0;
    $("bg-ep-next").disabled = epIndex >= eps.length - 1;
    if (!eps.length) { $("bg-ep-label").textContent = "이 구간에는 거래가 없어요"; return; }
    const e = eps[epIndex], rows = e.rows;
    $("bg-ep-label").textContent = `${epIndex + 1} / ${eps.length} · ${e.entry_date} 진입 · ${e.net == null ? "보유 중" : pct(e.return_pct)}`;
    const idx = new Map(rows.map((r, i) => [r.date, i]));
    const at = (d) => idx.has(d) ? idx.get(d) : (d < rows[0].date ? -1 : rows.length);
    const lineVal = (L, x) => { const ia = at(L.a[0]), ib = at(L.b[0]); return L.a[1] + (L.b[1] - L.a[1]) / (ib - ia) * (x - ia); };
    const W = Math.max(320, Math.round(svg.getBoundingClientRect().width) || 960), H = 340, left = 62, right = W - 14, top = 18, bottom = H - 34;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const iSig = at(e.signal_date), iEnt = at(e.entry_date), iExit = e.exit_date ? at(e.exit_date) : rows.length - 1;
    const ia = at(e.line.a[0]), ib = at(e.line.b[0]);
    const vals = rows.flatMap((r) => [r.high, r.low]);
    [ia, ib, iSig].forEach((x) => { vals.push(lineVal(e.line, x), lineVal(e.line, x) + e.line.w, lineVal(e.line, x) - e.line.w); });
    vals.push(e.stop);
    let min = Math.min(...vals), max = Math.max(...vals); const pad = (max - min) * 0.06; min -= pad; max += pad;
    const x = (i) => left + (right - left) * (i / Math.max(1, rows.length - 1));
    const y = (v) => bottom - (v - min) / (max - min) * (bottom - top);
    const add = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (text != null) n.textContent = text; svg.append(n); return n; };
    for (let k = 0; k <= 4; k++) {
      const v = min + (max - min) * k / 4;
      add("line", { x1: left, x2: right, y1: y(v), y2: y(v), stroke: "#eef0f3" });
      add("text", { x: left - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "#6b7684" }, num(v, v >= 1000 ? 0 : 2));
    }
    const seg = (from, to, f) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k).map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(f(i)).toFixed(1)}`).join(" ");
    // 채널(빗각 ~ 저점까지 평행 복사) 칠하기: 두 고점 구간
    const lower = Array.from({ length: ib - ia + 1 }, (_, k) => ib - k).map((i) => `L${x(i).toFixed(1)},${y(lineVal(e.line, i) - e.line.w).toFixed(1)}`).join(" ");
    add("path", { d: `${seg(ia, ib, (i) => lineVal(e.line, i))} ${lower} Z`, fill: "#b8a6f0", opacity: .35 });
    add("path", { d: seg(ia, iSig + 2 < rows.length ? iSig + 2 : iSig, (i) => lineVal(e.line, i)), fill: "none", stroke: "#e8590c", "stroke-width": 2.5 });
    add("path", { d: seg(ib, Math.min(rows.length - 1, iSig + 2), (i) => lineVal(e.line, i) + e.line.w), fill: "none", stroke: "#d6336c", "stroke-width": 2.5 });
    if (e.exit_line) {
      const xa = Math.max(0, at(e.exit_line.b[0]));
      add("path", { d: seg(xa, iExit, (i) => lineVal(e.exit_line, i) - e.exit_line.w), fill: "none", stroke: "#1c7ed6", "stroke-width": 2.5, "stroke-dasharray": "7 4" });
    }
    add("path", { d: `M${x(iEnt)},${y(e.stop)} H${x(iExit)}`, stroke: "#868e96", "stroke-width": 1.5, "stroke-dasharray": "4 3" });
    add("path", { d: seg(0, rows.length - 1, (i) => rows[i].close), fill: "none", stroke: "#191f28", "stroke-width": 2 });
    const dot = (i, v, label, color, dy, anchor = "middle") => {
      add("circle", { cx: x(i), cy: y(v), r: 5.5, fill: "#fff", stroke: color, "stroke-width": 2.5 });
      add("text", { x: x(i), y: y(v) + dy, "text-anchor": anchor, "font-size": 12, "font-weight": 700, fill: color }, label);
    };
    dot(ia, e.line.a[1], "고점1", "#e8590c", -10);
    dot(ib, e.line.b[1], "고점2", "#e8590c", -10);
    const iPlain = e.plain_signal ? at(e.plain_signal) : -1;
    if (iPlain >= 0 && iPlain !== iSig) dot(iPlain, rows[iPlain].close, "그대로면 여기서 매수", "#868e96", 20);
    dot(iEnt, e.entry, "매수", "#d6336c", 22);
    if (e.exit_date) dot(iExit, e.exit, "매도", "#1c7ed6", -12);
    [[0, rows[0].date], [rows.length - 1, rows[rows.length - 1].date]].forEach(([i, d], k) =>
      add("text", { x: x(i), y: H - 10, "text-anchor": k ? "end" : "start", "font-size": 11, fill: "#6b7684" }, d));
    svg.setAttribute("aria-label", `${a.name} 거래 ${epIndex + 1}: ${e.line.a[0]}과 ${e.line.b[0]} 고점을 이은 빗각, ${e.entry_date} 매수, ${e.exit_date || "보유 중"}`);

    const li = (html) => { const n = document.createElement("li"); n.innerHTML = html; steps.append(n); };
    const plainDays = iPlain >= 0 ? iSig - iPlain : null;
    li(`<b>빗각</b>: ${fmtDate(e.line.a[0])} 고점 ${num(e.line.a[1], 0)}과 ${fmtDate(e.line.b[0])} 고점 ${num(e.line.b[1], 0)}을 이었어요.`);
    li(`<b>채널 폭</b>: 두 고점 사이 가장 깊은 저점까지 ${num(e.line.w, 0)} ${cur}. 빗각을 이만큼 위로 올린 선이 지연선이에요.`);
    li(`<b>매수</b>: ${fmtDate(e.signal_date)} 종가가 지연선을 넘어서 다음 날(${fmtDate(e.entry_date)}) 시가 ${num(e.entry, 0)}에 샀어요.` +
      (plainDays > 0 ? ` 빗각 그대로였다면 ${plainDays}일 먼저(${fmtDate(e.plain_signal)}) 샀을 자리예요.` : ""));
    li(`<b>매도</b>: ${reasonText[e.reason] || e.reason}${e.exit_date ? ` (${fmtDate(e.exit_date)}, ${num(e.exit, 0)})` : ""}. ` +
      (e.net == null ? "" : `${e.bars}일 보유, 이 거래 수익률 ${pct(e.return_pct)}.`));
  }
  selector.addEventListener("change", () => { epIndex = -1; render(); });
  $("bg-period").addEventListener("change", () => { epIndex = -1; render(); });
  $("bg-ep-prev").addEventListener("click", () => { epIndex--; render(); });
  $("bg-ep-next").addEventListener("click", () => { epIndex++; render(); });
  let frame;
  window.addEventListener("resize", () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); });
  render();
})();
