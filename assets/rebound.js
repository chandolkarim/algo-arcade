/* Stored research results only. No quote requests, credentials or order actions. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const data = window.REBOUND_DATA;
  const num = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
  // 한국 관례: 오름(+) 빨강 ▲, 내림(−) 파랑 ▼. 기호를 함께 써서 색만으로 구분하지 않는다.
  const pct = (n) => Number.isFinite(n) ? `${n > 0 ? "▲ +" : n < 0 ? "▼ −" : ""}${num(Math.abs(n))}%` : "—";
  const money = (n, currency) => Number.isFinite(n) ? `${n > 0 ? "▲ +" : n < 0 ? "▼ −" : ""}${num(Math.abs(n))} ${currency}` : "—";
  const tone = (n) => n > 0 ? "rb-positive" : n < 0 ? "rb-negative" : "";
  const reasons = { mean: "25일선 복귀", trend: "200일선 이탈", timeout: "10개 봉 경과", stop: "손절", gap_stop: "갭 손절" };
  const sideLabel = (side) => side === 1 ? "롱" : "숏";
  const svgNS = "http://www.w3.org/2000/svg";
  const svgel = (tag, attrs, text) => {
    const el = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const cell = (text) => { const td = document.createElement("td"); td.textContent = text; return td; };
  const tableRow = (values) => { const tr = document.createElement("tr"); values.forEach((v) => tr.append(cell(v))); return tr; };
  const signed = (id, value) => {
    $(id).textContent = pct(value);
    $(id).className = tone(value);
  };
  function chart(id, rows, series, height, light, label) {
    const svg = $(id);
    svg.replaceChildren();
    svg.setAttribute("aria-labelledby", `${id}-title`);
    svg.append(svgel("title", { id: `${id}-title` }, label));
    if (!rows.length) { svg.append(svgel("text", { x: 40, y: 100 }, "표시할 기록이 없습니다.")); return; }
    const width = Math.max(280, Math.min(960, Math.floor(svg.getBoundingClientRect().width)));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const left = 72, right = width - 18, top = 20, bottom = height - 38;
    const values = rows.flatMap((r) => series.map((s) => r[s.key])).filter(Number.isFinite);
    let min = Math.min(...values), max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    const pad = (max - min) * .08 || Math.max(Math.abs(max) * .01, 1);
    min -= pad; max += pad;
    const x = (i) => left + i / Math.max(rows.length - 1, 1) * (right - left);
    const y = (v) => bottom - (v - min) / (max - min) * (bottom - top);
    const ink = light ? "#4a4270" : "#bfb5ea";
    for (let i = 0; i < 4; i++) {
      const val = min + (max - min) * i / 3, py = y(val);
      svg.append(svgel("line", { x1: left, y1: py, x2: right, y2: py, stroke: light ? "#d1c7e7" : "#302449", "stroke-width": 1 }));
      svg.append(svgel("text", { x: left - 10, y: py + 4, fill: ink, "text-anchor": "end", "font-size": 12 }, num(val, max > 1000 ? 0 : 2)));
    }
    const ticks = width < 600 ? [0, rows.length - 1] : [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
    for (const i of [...new Set(ticks)]) {
      svg.append(svgel("text", { x: x(i), y: height - 10, fill: ink, "text-anchor": i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle", "font-size": 12 }, rows[i].date));
    }
    for (const seriesItem of series) {
      let d = "", active = false;
      rows.forEach((r, i) => {
        if (!Number.isFinite(r[seriesItem.key])) { active = false; return; }
        d += `${active ? "L" : "M"}${x(i).toFixed(2)},${y(r[seriesItem.key]).toFixed(2)} `;
        active = true;
      });
      svg.append(svgel("path", { d, fill: "none", stroke: seriesItem.color, "stroke-width": 2.5, "stroke-dasharray": seriesItem.dash || "none", "stroke-linejoin": "round" }));
    }
  }
  if (!data || data.schema !== 1 || !Array.isArray(data.assets)) {
    $("rb-global-status").textContent = "관측 데이터를 불러오지 못했습니다. 결과 파일이 준비되지 않았거나 함께 복사되지 않았습니다. 아래 규칙과 출처를 확인할 수 있습니다.";
    return;
  }
  const generated = new Date(data.generated_at);
  const oldSnapshot = (Date.now() - generated.getTime()) > 72 * 3600000;
  const updateDate = Number.isFinite(generated.getTime()) ? generated.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "시각 확인 불가";
  $("rb-global-status").textContent = `${oldSnapshot ? "오래된 저장 결과입니다. " : ""}마지막 계산: ${updateDate} (한국 시간). ${data.mode === "offline" ? "저장된 원본으로 재계산했습니다. " : ""}${data.automatic_refresh ? "GitHub Actions가 하루 한 번 다시 계산하고, 실패한 종목은 이전 결과를 그대로 둡니다." : "내 컴퓨터에서 계산해 올린 결과입니다."} 현재 시세와 다를 수 있습니다.`;
  const selector = $("rb-asset");
  selector.replaceChildren();
  for (const asset of data.assets) {
    const option = document.createElement("option");
    option.value = asset.symbol;
    option.textContent = `${asset.name} · ${asset.symbol}${asset.status === "error" ? " · 수집 실패" : asset.status === "stale" ? " · 이전 결과" : ""}`;
    selector.append(option);
  }
  selector.disabled = !data.assets.length;
  const assetNow = () => data.assets.find((a) => a.symbol === selector.value);

  function renderResults() {
    const asset = assetNow();
    const period = $("rb-period").value;
    const result = asset && asset[period];
    $("rb-result-content").hidden = !result || (period === "paper" && result.status !== "tracking");
    if (!result || (period === "paper" && result.status !== "tracking")) {
      $("rb-result-note").textContent = result ? `모의 기록 확인 필요: ${result.note}` : "해당 종목의 계산 결과가 없습니다.";
      return;
    }
    const currency = asset.currency;
    $("rb-cost-note").textContent = `${asset.cost_note} 편도 수수료 ${num(asset.rules.fee * 100)}%, 슬리피지 ${num(asset.rules.slippage * 100)}% 가정. 계좌들은 합산하지 않습니다.`;
    if (period === "paper") {
      $("rb-result-note").textContent = `등록: ${new Date(result.started_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간) · 마지막 처리: ${result.last_date}. ${result.note} 청산 기록이 없으면 승률은 표시하지 않습니다.`;
    } else {
      $("rb-result-note").textContent = `${period === "holdout" ? data.holdout_start : data.backtest_start} ~ ${asset.end} · 과거 일봉 재생 · 초기 ${num(result.initial, 0)} ${currency}. ${period === "holdout" ? "해당 구간 시작에 빈 계좌로 새로 계산했습니다." : "전체 기간의 실제 가격 데이터를 사용했습니다."}`;
    }
    signed("rb-return", result.return_pct);
    $("rb-dd").textContent = `${num(result.max_drawdown_pct)}%`;
    $("rb-count").textContent = `${result.count}건`;
    $("rb-win").textContent = result.win_rate === null ? "표본 없음" : `${num(result.win_rate, 1)}%`;
    const p = result.position;
    $("rb-position").textContent = p ? `미청산 ${sideLabel(p.side)} · ${p.entry_date} 진입 · 진입가 ${num(p.entry)} / 손절가 ${num(p.stop)} ${currency} · ${p.bars}개 봉 보유${p.pending_exit ? ` · 다음 시가 청산 대기 (${reasons[p.pending_exit]})` : ""}` : "보유 포지션 없음 · 다음 조건을 기다립니다.";
    $("rb-comparison").hidden = period === "paper";
    if (period !== "paper") {
      const base = asset[period === "holdout" ? "holdout_baseline" : "baseline"];
      $("rb-compare-body").replaceChildren(
        tableRow(["200일선 적용", pct(result.return_pct), `${num(result.max_drawdown_pct)}%`, `${result.count}건`]),
        tableRow(["200일선 미적용", pct(base.return_pct), `${num(base.max_drawdown_pct)}%`, `${base.count}건`])
      );
      const baseMap = new Map(base.curve.map((r) => [r.date, r.equity]));
      const points = result.curve.map((r) => ({ date: r.date, filtered: (r.equity / result.initial - 1) * 100,
        baseline: (baseMap.get(r.date) / base.initial - 1) * 100 }));
      chart("rb-equity-chart", points, [{ key: "filtered", color: "#804c86" }, { key: "baseline", color: "#4a4270", dash: "5 5" }], 230, true, "200일선 적용 여부에 따른 계좌 누적 수익률 (%)");
    }
    $("rb-sides").replaceChildren(...["long", "short"].map((side) => {
      const s = result.sides[side];
      const tr = tableRow([side === "long" ? "롱" : "숏", `${s.count}건`, s.win_rate === null ? "표본 없음" : `${num(s.win_rate, 1)}%`, money(s.net, currency)]);
      tr.lastChild.className = tone(s.net);
      return tr;
    }));
    const trades = result.trades.slice(-20).reverse();
    $("rb-trades").replaceChildren();
    if (!trades.length) {
      const tr = tableRow(["아직 청산한 거래가 없습니다."]);
      tr.firstChild.colSpan = 5; $("rb-trades").append(tr);
    }
    for (const t of trades) {
      // 좁은 화면에서도 손익이 먼저 보이게 순손익을 두 번째 열에 둔다
      const tr = tableRow([`${t.entry_date} → ${t.exit_date}`, money(t.net, currency), sideLabel(t.side), reasons[t.reason] || t.reason, `${num(t.entry)} → ${num(t.exit)}`]);
      tr.children[1].className = tone(t.net);
      $("rb-trades").append(tr);
    }
  }

  function renderAsset() {
    const asset = assetNow();
    $("rb-monitor-content").hidden = !asset || !asset.latest;
    $("rb-cost-note").textContent = "";
    if (!asset) return;
    $("rb-market").textContent = `${asset.market === "crypto" ? "코인 무기한 선물" : "주식 · 공매도 가정 포함"} / ${asset.currency}`;
    const status = $("rb-asset-status");
    const stale = asset.end && (Date.now() - new Date(asset.end + "T00:00:00Z").getTime()) > (asset.market === "crypto" ? 3 : 8) * 86400000;
    status.hidden = asset.status === "ok" && !stale;
    status.textContent = asset.status === "error" ? "시세 수집에 실패했습니다. 이 종목의 결과는 표시하지 않습니다." : (asset.market === "crypto" && asset.status === "stale" ? "코인 선물 시세는 GitHub 서버(미국)에서 받을 수 없어, 마지막으로 내 컴퓨터에서 계산한 결과를 보여 줍니다. 표시된 기준일을 확인해 주세요." : "갱신되지 않은 이전 결과입니다. 표시된 기준일을 확인해 주세요.");
    if (!asset.latest) { renderResults(); return; }
    const r = asset.latest;
    $("rb-symbol-title").textContent = `${asset.name} / ${asset.symbol}`;
    $("rb-date").textContent = `${r.date} · ${asset.timezone}`;
    $("rb-signal").textContent = r.signal === "long" ? "롱 후보" : r.signal === "short" ? "숏 후보" : "대기";
    $("rb-price").textContent = `${num(r.close)} ${asset.currency}`;
    $("rb-distance").textContent = `${num(r.deviation_atr)} ATR`;
    $("rb-trend").textContent = r.trend === "long" ? "롱만 허용" : r.trend === "short" ? "숏만 허용" : "대기 구간";
    $("rb-atr").textContent = `${num(r.atr)} ${asset.currency}`;
    const trendText = r.trend === "long" ? "200일선 + 1 ATR 위에 있습니다." : r.trend === "short" ? "200일선 − 1 ATR 아래에 있습니다." : "200일선 주변 ±1 ATR 구간이어서 신규 진입하지 않습니다.";
    $("rb-reason").textContent = `${trendText} ${r.signal !== "wait" ? "25일선과 2 ATR 이상 벌어져 진입 후보 조건을 충족했습니다." : r.trend !== "neutral" ? "허용 방향의 25일선 괴리 조건을 아직 충족하지 않았습니다." : ""} (괴리율 ${num(r.deviation_pct)}%)`;
    chart("rb-price-chart", asset.chart, [
      { key: "close", color: "#f3eeff" }, { key: "sma25", color: "#ff85c0", dash: "8 4" }, { key: "sma200", color: "#ffd23f", dash: "2 5" }
    ], 300, false, `${asset.name}, ${asset.chart[0].date}부터 ${asset.end}까지 종가와 25·200일 이동평균선, ${asset.currency} 기준`);
    $("rb-chart-range").textContent = `최근 ${asset.chart.length}개 봉 · ${asset.chart[0].date} ~ ${asset.end} · 출처: ${asset.source}`;
    $("rb-values").replaceChildren(...asset.chart.slice(-10).reverse().map((v) => tableRow([v.date, num(v.close), num(v.sma25), num(v.sma200)])));
    renderResults();
  }
  selector.addEventListener("change", renderAsset);
  $("rb-period").addEventListener("change", renderResults);
  let resizeFrame;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(renderAsset);
  });
  renderAsset();
})();
