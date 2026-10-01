/* Stored research results only. No quote requests, credentials or order actions. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const data = window.BREAKOUT_DATA;
  const num = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
  const pct = (n) => Number.isFinite(n) ? `${n > 0 ? "▲ +" : n < 0 ? "▼ " : ""}${num(n)}%` : "—";
  const reasons = { stop: "최초 손절", trailing_stop: "추적 손절", gap_stop: "갭 손절" };
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
    $(id).className = value > 0 ? "bo-positive" : value < 0 ? "bo-negative" : "";
  };
  function chart(id, rows, series, height, light, label, events = []) {
    const svg = $(id);
    svg.replaceChildren();
    svg.setAttribute("aria-labelledby", `${id}-title`);
    svg.append(svgel("title", { id: `${id}-title` }, label));
    if (!rows.length) { svg.append(svgel("text", { x: 40, y: 100 }, "표시할 기록이 없습니다.")); return; }
    const width = Math.max(280, Math.min(960, Math.floor(svg.getBoundingClientRect().width)));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const left = 72, right = width - 18, top = 20, bottom = height - 38;
    const dates = new Map(rows.map((r,i)=>[r.date,i]));
    const marks = events.filter(e=>dates.has(e.date));
    const values = rows.flatMap((r) => series.map((s) => r[s.key])).concat(marks.map(e=>e.price)).filter(Number.isFinite);
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
      let d = "", active = false, previousSegment;
      rows.forEach((r, i) => {
        if (!Number.isFinite(r[seriesItem.key])) { active = false; return; }
        if (seriesItem.key === "stop" && r.segment !== previousSegment) active = false;
        previousSegment = r.segment;
        d += `${active ? "L" : "M"}${x(i).toFixed(2)},${y(r[seriesItem.key]).toFixed(2)} `;
        active = true;
      });
      svg.append(svgel("path", { d, fill: "none", stroke: seriesItem.color, "stroke-width": 2.5, "stroke-dasharray": seriesItem.dash || "none", "stroke-linejoin": "round" }));
      if (rows.length === 1 && Number.isFinite(rows[0][seriesItem.key])) {
        svg.append(svgel("circle", { cx: x(0), cy: y(rows[0][seriesItem.key]), r: 4, fill: seriesItem.color }));
      }
    }
    for (const e of marks) {
      const px = x(dates.get(e.date)), py = y(e.price);
      const points = e.kind === "exit" ? `${px},${py-5} ${px+5},${py} ${px},${py+5} ${px-5},${py}` : e.side === 1 ? `${px},${py-6} ${px+5},${py+4} ${px-5},${py+4}` : `${px},${py+6} ${px+5},${py-4} ${px-5},${py-4}`;
      const mark = svgel("polygon", {points, fill: e.kind === "exit" ? "#0f0b24" : "#ffd23f", stroke: "#ffd23f", "stroke-width":1.5});
      mark.append(svgel("title",{},`${e.date} ${e.kind === "exit" ? "청산" : sideLabel(e.side)+" 진입"} ${num(e.price)}`));
      svg.append(mark);
    }
  }
  if (!data || data.schema !== 1 || data.strategy !== "breakout" || !Array.isArray(data.assets) || !data.assets.length) {
    $("bo-global-status").textContent = "저장된 관측 데이터를 불러오지 못했습니다. 아래에서 전략 규칙과 출처를 확인할 수 있습니다.";
    return;
  }
  const generated = new Date(data.generated_at);
  const staleSnapshot = Date.now() - generated.getTime() > 72*3600000;
  $("bo-global-status").textContent = `${staleSnapshot ? "오래된 저장 결과입니다. " : ""}마지막 계산: ${generated.toLocaleString("ko-KR", {timeZone:"Asia/Seoul"})} (한국 시간). ${data.mode === "offline" ? "저장 원본으로 재계산. " : ""}자동 갱신은 아직 연결되지 않았습니다. 현재 시세와 다를 수 있습니다.`;
  const selector = $("bo-asset");
  selector.replaceChildren();
  for (const a of data.assets) {
    const option = document.createElement("option"); option.value = a.symbol;
    option.textContent = `${a.name} · ${a.symbol}${a.status === "error" ? " · 수집 실패" : a.status === "stale" ? " · 이전 결과" : ""}`;
    selector.append(option);
  }
  selector.disabled = false;
  const assetNow = () => data.assets.find(a=>a.symbol === selector.value);
  function positionText(p, currency) {
    return p ? `${sideLabel(p.side)} 보유 · ${p.entry_date} 진입 · ${p.bars}개 봉 보유 · 진입가 ${num(p.entry)} / 다음 봉 손절선 ${num(p.stop)} ${currency}` : "보유 포지션 없음";
  }
  function renderPrice(asset, result) {
    if (!asset.latest) return;
    const curves = new Map((result?.curve || []).map(r=>[r.date,r]));
    const positions = [...(result?.trades || []), ...(result?.position ? [result.position] : [])];
    const points = asset.chart.map(r=>{
      const p = positions.find(p=>p.entry_date <= r.date && (!p.exit_date || p.exit_date >= r.date));
      return {...r, stop:curves.get(r.date)?.stop_used ?? null, segment:p?.entry_date};
    });
    const events = positions.flatMap(t=>[
      {date:t.entry_date,price:t.entry,side:t.side,kind:"entry"},
      ...(t.exit_date ? [{date:t.exit_date,price:t.exit,side:t.side,kind:"exit"}] : [])
    ]);
    chart("bo-price-chart",points,[
      {key:"close",color:"#f3eeff"},{key:"upper",color:"#3ce0a8",dash:"8 4"},
      {key:"lower",color:"#ffd23f",dash:"2 5"},{key:"stop",color:"#ff85c0",dash:"5 3"}
    ],320,false,`${asset.name} 종가와 당일 봉을 제외한 20일 범위, 선택한 기록의 모의 체결과 손절선`,events);
    const periodText = $("bo-period").selectedOptions[0].textContent;
    $("bo-chart-range").textContent = `${asset.chart[0].date} ~ ${asset.end} · ${asset.currency} · 거래 표시: ${periodText} · ${asset.source}`;
  }
  function renderResults() {
    const asset = assetNow(), period = $("bo-period").value;
    const result = asset?.[period];
    const ready = result && (period !== "paper" || result.status === "tracking");
    $("bo-result-content").hidden = !ready;
    if (!ready) {
      $("bo-result-note").textContent = result ? `모의 기록 확인 필요: ${result.note}` : "이 종목의 계산 결과가 없습니다.";
      if (asset) renderPrice(asset,null);
      return;
    }
    const currency = asset.currency;
    $("bo-cost-note").textContent = `${asset.cost_note} 편도 수수료 ${num(asset.rules.fee*100)}%, 슬리피지 ${num(asset.rules.slippage*100)}% 가정. 종목별 계좌는 합산하지 않습니다.`;
    $("bo-result-note").textContent = period === "paper"
      ? `등록: ${new Date(result.started_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} (한국 시간) · 마지막 처리: ${result.last_date}. ${result.note}`
      : `${period === "holdout" ? data.holdout_start : data.backtest_start} ~ ${asset.end} · 과거 확정 일봉 재생 · 초기 ${num(result.initial,0)} ${currency}. ${period === "holdout" ? "이 구간의 시작에 빈 계좌로 새로 계산했습니다." : "손실 거래도 포함한 전체 기록입니다."}`;
    signed("bo-return",result.return_pct);
    $("bo-dd").textContent = `${num(result.max_drawdown_pct)}%`;
    $("bo-count").textContent = `${result.count}건`;
    $("bo-win").textContent = result.win_rate === null ? "표본 없음" : `${num(result.win_rate,1)}%`;
    $("bo-average-win").textContent = result.average_win === null ? "표본 없음" : `${num(result.average_win)} ${currency}`;
    $("bo-average-loss").textContent = result.average_loss === null ? "표본 없음" : `${num(result.average_loss)} ${currency}`;
    $("bo-average-bars").textContent = result.average_bars === null ? "표본 없음" : `${num(result.average_bars,1)}개 봉`;
    $("bo-position").textContent = `${period === "paper" ? "모의 장부" : "백테스트 종료 시점"}: ${positionText(result.position,currency)} · 진입 취소 ${result.cancellations}건`;
    const equity = result.curve.map(r=>({date:r.date,return_pct:(r.equity/result.initial-1)*100}));
    chart("bo-equity-chart",equity,[{key:"return_pct",color:"#22644f"}],230,true,"선택 구간 계좌 누적 수익률 (%)");
    $("bo-sides").replaceChildren(...["long","short"].map(side=>{
      const s = result.sides[side];
      return tableRow([side === "long" ? "롱" : "숏",`${s.count}건`,s.win_rate === null ? "표본 없음" : `${num(s.win_rate,1)}%`,`${num(s.net)} ${currency}`]);
    }));
    const trades = result.trades.slice(-20).reverse();
    $("bo-trades").replaceChildren();
    if (!trades.length) {const tr=tableRow(["아직 청산한 거래가 없습니다."]);tr.firstChild.colSpan=6;$("bo-trades").append(tr);}
    for (const t of trades) {
      const tr=tableRow([`${t.entry_date} → ${t.exit_date}`,sideLabel(t.side),`${num(t.entry)} → ${num(t.exit)}`,`${t.bars}개`,reasons[t.reason] || t.reason,`${t.net > 0 ? "▲ +" : t.net < 0 ? "▼ " : ""}${num(t.net)} ${currency}`]);
      tr.lastChild.className=t.net>0 ? "bo-positive" : t.net<0 ? "bo-negative" : "";
      $("bo-trades").append(tr);
    }
    renderPrice(asset,result);
  }
  function renderAsset() {
    const a=assetNow();
    $("bo-monitor-content").hidden = !a?.latest;
    $("bo-cost-note").textContent="";
    if (!a) return;
    $("bo-market").textContent=`${a.market === "crypto" ? "코인 무기한 선물" : "주식 · 공매도 가정 포함"} / ${a.currency}`;
    const stale=a.end && Date.now()-new Date(a.end+"T00:00:00Z").getTime() > (a.market === "crypto" ? 3:8)*86400000;
    $("bo-asset-status").hidden=a.status === "ok" && !stale;
    $("bo-asset-status").textContent=a.status === "error" ? "시세 수집에 실패했습니다. 해당 종목의 결과는 표시하지 않습니다." : "갱신되지 않은 이전 결과입니다. 표시된 기준일을 확인해 주세요.";
    if (!a.latest) {renderResults();return;}
    const r=a.latest;
    $("bo-symbol-title").textContent=`${a.name} / ${a.symbol}`;
    $("bo-date").textContent=`${r.date} · ${a.timezone}`;
    $("bo-price").textContent=`${num(r.close)} ${a.currency}`;
    $("bo-upper").textContent=num(r.upper);$("bo-lower").textContent=num(r.lower);$("bo-atr").textContent=num(r.atr);
    $("bo-signal").textContent=r.signal === "long" ? "상단 돌파" : r.signal === "short" ? "하단 돌파" : "돌파 대기";
    $("bo-reason").textContent=r.signal === "long" ? "종가가 어제까지의 20일 최고가를 넘었습니다. 다음 시가가 기준선 위이고 포지션이 없으면 롱 진입 후보입니다." : r.signal === "short" ? "종가가 어제까지의 20일 최저가 아래입니다. 다음 시가가 기준선 아래이고 포지션이 없으면 숏 진입 후보입니다." : `종가가 직전 20일 범위 안에 있습니다. 상단까지 ${num(r.to_upper_pct)}%, 하단까지 ${num(r.to_lower_pct)}% 거리입니다.`;
    $("bo-live-position").textContent=a.paper?.status === "tracking" ? `등록 이후 모의 장부: ${positionText(a.paper.position,a.currency)}` : "등록 이후 모의 장부: 준비 또는 확인 필요";
    $("bo-values").replaceChildren(...a.chart.slice(-10).reverse().map(r=>tableRow([r.date,num(r.close),num(r.upper),num(r.lower)])));
    renderResults();
  }
  selector.addEventListener("change",renderAsset);
  $("bo-period").addEventListener("change",renderResults);
  let resizeFrame;
  window.addEventListener("resize",()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(renderAsset);});
  renderAsset();
})();
