/* Stored research results only. No quote requests, credentials or order actions. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const data = window.BREAKOUT_DATA;
  const num = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
  // 한국 관례: 오름(+) 빨강 ▲, 내림(−) 파랑 ▼. 기호를 함께 써서 색만으로 구분하지 않는다.
  const pct = (n) => Number.isFinite(n) ? `${n > 0 ? "▲ +" : n < 0 ? "▼ −" : ""}${num(Math.abs(n))}%` : "—";
  const money = (n, currency) => Number.isFinite(n) ? `${n > 0 ? "▲ +" : n < 0 ? "▼ −" : ""}${num(Math.abs(n))} ${currency}` : "—";
  const tone = (n) => n > 0 ? "bo-positive" : n < 0 ? "bo-negative" : "";
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
    $(id).className = tone(value);
  };
  // 공용 선 차트(assets/linechart.js)로 그린다
  const chart = (id, opts) => window.LineChart.draw($(id), opts);
  const signedPct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
  let days = 90;  // 가격 차트 기간: 3개월 / 1년
  document.querySelectorAll("#bo-range button").forEach((b) => b.addEventListener("click", () => {
    days = Number(b.dataset.days);
    document.querySelectorAll("#bo-range button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderResults();
  }));

  if (!data || data.schema !== 1 || data.strategy !== "breakout" || !Array.isArray(data.assets) || !data.assets.length) {
    $("bo-global-status").textContent = "저장된 관측 데이터를 불러오지 못했습니다. 아래에서 전략 규칙과 출처를 확인할 수 있습니다.";
    return;
  }
  const generated = new Date(data.generated_at);
  const staleSnapshot = Date.now() - generated.getTime() > 72*3600000;
  $("bo-global-status").textContent = `${staleSnapshot ? "오래된 저장 결과입니다. " : ""}마지막 계산: ${generated.toLocaleString("ko-KR", {timeZone:"Asia/Seoul"})} (한국 시간). ${data.mode === "offline" ? "저장된 원본으로 재계산했습니다. " : ""}${data.automatic_refresh ? "GitHub Actions가 하루 한 번 다시 계산하고, 실패한 종목은 이전 결과를 그대로 둡니다." : "내 컴퓨터에서 계산해 올린 결과입니다."} 현재 시세와 다를 수 있습니다.`;
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
    const shown = points.slice(-days);
    chart("bo-price-chart", {
      rows: shown, height: 300, theme: "dark", legend: $("bo-price-legend"), markers: events, segmentKey: "segment",
      label: `${asset.name} 최근 ${shown.length}일 종가와 당일 봉을 뺀 20일 범위, 선택한 기록의 모의 체결과 손절선`,
      band: { lo: "lower", hi: "upper", color: "#12b886", label: "20일 범위(벽)" },
      series: [{ key: "close", label: "종가", color: "#191f28", width: 3 },
               { key: "stop", label: "손절선", color: "#d6336c", width: 2.5, dash: "6 4", segmented: true }],
    });
    const L = asset.latest;
    $("bo-price-say").textContent = L.signal === "long" ? "종가가 어제까지의 20일 최고가(벽 위쪽)를 넘었습니다. 다음 시가가 여전히 위면 롱 진입." :
      L.signal === "short" ? "종가가 어제까지의 20일 최저가(벽 아래쪽) 밑으로 빠졌습니다. 다음 시가가 여전히 아래면 숏 진입." :
      `종가가 20일 범위(초록 띠) 안에 있어 기다리는 중. 위 벽까지 ${L.to_upper_pct.toFixed(1)}%, 아래 벽까지 ${L.to_lower_pct.toFixed(1)}%.`;
    const periodText = $("bo-period").selectedOptions[0].textContent;
    $("bo-chart-range").textContent = `${shown[0].date} ~ ${asset.end} · ${asset.currency} · 거래 표시: ${periodText} · 차트를 짚으면 그날 값 · ${asset.source}`;
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
    // 비교 기준: 같은 기간 그냥 사서 들고 있었다면
    const bh = period !== "paper" && asset.buy_hold && asset.buy_hold[period];
    $("bo-bh-box").hidden = !bh;
    if (bh) {
      signed("bo-bh-strategy", result.return_pct);
      signed("bo-bh", bh.return_pct);
      $("bo-bh-strategy-dd").textContent = `가장 크게 빠졌을 때 −${result.max_drawdown_pct.toFixed(1)}%`;
      $("bo-bh-dd").textContent = `가장 크게 빠졌을 때 −${bh.max_drawdown_pct.toFixed(1)}%`;
      $("bo-bh-note").textContent = `${bh.start}에 ${asset.name} 매수 후 그대로 들고 있었다면 ${bh.return_pct >= 0 ? "+" : "−"}${Math.abs(bh.return_pct).toFixed(1)}%. ` +
        `이 전략은 한 번 거래에 계좌의 0.5%만 손실 위험으로 걸도록 정해서, 버는 것도 잃는 것도 작아요. 수익만 보면 그냥 들고 있는 쪽이 ${bh.return_pct > result.return_pct ? "더 컸고" : "더 작았고"}, 대신 중간에 빠지는 폭은 전략이 훨씬 작았어요.`;
    }
    $("bo-dd").textContent = `${num(result.max_drawdown_pct)}%`;
    $("bo-count").textContent = `${result.count}건`;
    $("bo-win").textContent = result.win_rate === null ? "표본 없음" : `${num(result.win_rate,1)}%`;
    $("bo-average-win").textContent = result.average_win === null ? "표본 없음" : money(result.average_win, currency);
    $("bo-average-loss").textContent = result.average_loss === null ? "표본 없음" : money(result.average_loss, currency);
    $("bo-average-bars").textContent = result.average_bars === null ? "표본 없음" : `${num(result.average_bars,1)}개 봉`;
    $("bo-position").textContent = `${period === "paper" ? "모의 장부" : "백테스트 종료 시점"}: ${positionText(result.position,currency)} · 진입 취소 ${result.cancellations}건`;
    const equity = result.curve.map(r=>({date:r.date,return_pct:(r.equity/result.initial-1)*100}));
    chart("bo-equity-chart", {
      rows: equity, height: 250, theme: "light", zero: true, yfmt: signedPct, legend: $("bo-equity-legend"),
      label: "선택 구간 계좌 누적 수익률(%)",
      series: [{ key: "return_pct", label: "계좌", color: "#191f28", width: 3.5 }],
    });
    $("bo-equity-say").textContent = `이 구간 계좌는 ${signedPct(result.return_pct)}, 가장 깊이 빠졌을 때 고점 대비 −${result.max_drawdown_pct.toFixed(1)}%. ` +
      (result.win_rate != null && result.win_rate < 50 && result.return_pct > 0
        ? `${result.count}번 중 ${result.win_rate.toFixed(0)}%만 벌었는데도 남은 건, 번 거래가 잃은 거래보다 크게 벌었기 때문입니다.`
        : `${result.count}번 중 ${result.win_rate == null ? "-" : result.win_rate.toFixed(0) + "%"}가 이익이었습니다.`);
    $("bo-sides").replaceChildren(...["long","short"].map(side=>{
      const s = result.sides[side];
      const tr = tableRow([side === "long" ? "롱" : "숏",`${s.count}건`,s.win_rate === null ? "표본 없음" : `${num(s.win_rate,1)}%`,money(s.net, currency)]);
      tr.lastChild.className = tone(s.net);
      return tr;
    }));
    const trades = result.trades.slice(-20).reverse();
    $("bo-trades").replaceChildren();
    if (!trades.length) {const tr=tableRow(["아직 청산한 거래가 없습니다."]);tr.firstChild.colSpan=6;$("bo-trades").append(tr);}
    for (const t of trades) {
      // 좁은 화면에서도 손익이 먼저 보이게 순손익을 두 번째 열에 둔다
      const tr=tableRow([`${t.entry_date} → ${t.exit_date}`,money(t.net, currency),sideLabel(t.side),`${t.bars}개`,reasons[t.reason] || t.reason,`${num(t.entry)} → ${num(t.exit)}`]);
      tr.children[1].className=tone(t.net);
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
    $("bo-asset-status").textContent=a.status === "error" ? "시세 수집에 실패했습니다. 해당 종목의 결과는 표시하지 않습니다." : (a.market === "crypto" && a.status === "stale" ? "코인 선물 시세는 GitHub 서버(미국)에서 받을 수 없어, 마지막으로 내 컴퓨터에서 계산한 결과를 보여 줍니다. 표시된 기준일을 확인해 주세요." : "갱신되지 않은 이전 결과입니다. 표시된 기준일을 확인해 주세요.");
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
