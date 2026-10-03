/* BITGAK (의뢰 1호). Stored research results only. No quote requests, credentials or order actions. */
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
  let days = 180;
  document.querySelectorAll("#bg-range button").forEach((b) => b.addEventListener("click", () => {
    days = Number(b.dataset.days);
    document.querySelectorAll("#bg-range button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  }));

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
    const trades = [...result.trades, ...(result.position ? [result.position] : [])];
    const events = trades.flatMap((t) => [{ date: t.entry_date, price: t.entry, side: 1, kind: "entry" },
      ...(t.exit_date ? [{ date: t.exit_date, price: t.exit, side: 1, kind: "exit" }] : [])]);
    const shown = a.chart.slice(-days);
    chart("bg-price-chart", {
      rows: shown, height: 300, theme: "dark", legend: $("bg-price-legend"), markers: events,
      label: `${a.name} 최근 ${shown.length}일 종가, 하락 빗각과 지연선, 상승 지연선`,
      series: [{ key: "close", label: "종가", color: "#191f28", width: 3 },
               { key: "dn_line", label: "하락 빗각", color: "#f59f00", width: 2, dash: "3 4" },
               { key: "dn_delay", label: "지연선(사는 선)", color: "#d6336c", width: 2.5 },
               { key: "up_delay", label: "상승 지연선(파는 선)", color: "#1c7ed6", width: 2.5, dash: "7 4" }],
    });
    $("bg-chart-range").textContent = `${shown[0].date} ~ ${a.end} · ${cur} · 차트를 짚으면 그날 값 · ${a.source}`;

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
  selector.addEventListener("change", render);
  $("bg-period").addEventListener("change", render);
  let frame;
  window.addEventListener("resize", () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); });
  render();
})();
