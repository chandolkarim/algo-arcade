/* TRADING FLOOR 브라우저 데모 — 클로드를 부르지 않고 전 과정 연출을 재생한다.
   원본: trading-floor/server/demo.js · indicators.js · agents.js(숫자 포맷)에서 옮겨 왔다.
   서버 없이 돌도록 바꾼 점만 다르다.
   - 시세는 방문자의 브라우저가 바이낸스 공개 시세(인증키 없음)를 직접 받는다. 실패하면 합성 캔들.
   - 뉴스(구글 RSS)는 브라우저에서 호출할 수 없어 받지 않는다. NOVA 대사만 그에 맞게 바꿨다.
   - 과거 판정 회고와 리포트 저장은 서버 파일이 필요해 뺐다.
   이건 분석이 아니라 연출이다. 판정에 아무 의미가 없다. */
(() => {
  const root = document.getElementById("fd-demo");
  if (!root) return;

  // ─────────────────────────── 숫자 포맷 (agents.js)
  const num = (v, digits = 2) => (v == null || Number.isNaN(v) ? "자료없음"
    : Number(v).toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  const pct = (v, digits = 2) => (v == null || Number.isNaN(v) ? "자료없음"
    : `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(digits)}%`);
  const money = (v) => (v == null || Number.isNaN(v) ? "자료없음" : `$${num(v, v < 10 ? 4 : 2)}`);

  // ─────────────────────────── 지표 (indicators.js 그대로)
  const maxOf = (a) => { if (!a.length) return null; let m = a[0]; for (const v of a) if (v > m) m = v; return m; };
  const minOf = (a) => { if (!a.length) return null; let m = a[0]; for (const v of a) if (v < m) m = v; return m; };
  const sma = (v, p) => { if (v.length < p) return null; let s = 0; for (let i = v.length - p; i < v.length; i++) s += v[i]; return s / p; };
  const emaSeries = (v, p) => {
    if (v.length < p) return [];
    const k = 2 / (p + 1);
    let prev = v.slice(0, p).reduce((a, b) => a + b, 0) / p;
    const out = [prev];
    for (let i = p; i < v.length; i++) { prev = v[i] * k + prev * (1 - k); out.push(prev); }
    return out;
  };
  const rsi = (c, p = 14) => {
    if (c.length < p + 1) return null;
    let gain = 0, loss = 0;
    for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d >= 0) gain += d; else loss -= d; }
    gain /= p; loss /= p;
    for (let i = p + 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      gain = (gain * (p - 1) + (d > 0 ? d : 0)) / p;
      loss = (loss * (p - 1) + (d < 0 ? -d : 0)) / p;
    }
    if (gain === 0 && loss === 0) return 50;
    if (loss === 0) return 100;
    return 100 - 100 / (1 + gain / loss);
  };
  const macd = (c, fast = 12, slow = 26, signal = 9) => {
    if (c.length < slow + signal - 1) return null;
    const ef = emaSeries(c, fast), es = emaSeries(c, slow);
    const n = Math.min(ef.length, es.length);
    const line = [];
    for (let i = 0; i < n; i++) line.push(ef[ef.length - n + i] - es[es.length - n + i]);
    const sig = emaSeries(line, signal);
    if (!sig.length) return null;
    const m = line[line.length - 1], s = sig[sig.length - 1];
    return { macd: m, signal: s, histogram: m - s };
  };
  const atr = (h, l, c, p = 14) => {
    if (c.length < p + 1) return null;
    const trs = [];
    for (let i = 1; i < c.length; i++) trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    let a = trs.slice(0, p).reduce((x, y) => x + y, 0) / p;
    for (let i = p; i < trs.length; i++) a = (a * (p - 1) + trs[i]) / p;
    return a;
  };
  const volatility = (c, p = 20) => {
    if (c.length < p + 1) return null;
    const r = [];
    for (let i = c.length - p; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    return Math.sqrt(r.reduce((a, x) => a + (x - mean) ** 2, 0) / (r.length - 1)) * 100;
  };
  const crossOf = (f, s) => (f == null || s == null ? null : f > s ? "golden" : f < s ? "dead" : "flat");
  const distance = (p, ref) => (ref == null || !Number.isFinite(ref) || ref === 0 ? null : ((p - ref) / ref) * 100);

  function compute(candles) {
    if (!candles.length) throw new Error("캔들이 비어 있어 지표를 계산할 수 없습니다");
    const closes = candles.map((c) => c.close), highs = candles.map((c) => c.high), lows = candles.map((c) => c.low);
    const last = closes[closes.length - 1];
    const recent = candles.slice(-20);
    const ma20 = sma(closes, 20), ma50 = sma(closes, 50), atr14 = atr(highs, lows, closes, 14);
    return {
      price: last, ma20, ma50,
      ma20Distance: distance(last, ma20), ma50Distance: distance(last, ma50),
      maCross: crossOf(ma20, ma50), rsi14: rsi(closes, 14), macd: macd(closes),
      atr14, atrPercent: atr14 == null ? null : distance(last + atr14, last),
      volatility20: volatility(closes, 20),
      high20: maxOf(recent.map((c) => c.high)), low20: minOf(recent.map((c) => c.low)),
      rangeHigh: maxOf(highs), rangeLow: minOf(lows), barsAnalyzed: candles.length,
    };
  }

  // ─────────────────────────── 시세 (market.js의 코인 부분)
  // api.binance.com은 일부 국가 IP를 막으므로 공개 시세 전용 주소를 쓴다.
  const BINANCE = "https://data-api.binance.vision/api/v3";
  const getJSON = async (url, signal) => {
    const res = await fetch(url, { signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  async function collect(asset, log, signal) {
    log(`Binance ${asset.pair} 일봉 200개 · 24시간 티커 요청`);
    const [rows, t] = await Promise.all([
      getJSON(`${BINANCE}/klines?symbol=${asset.pair}&interval=1d&limit=200`, signal),
      getJSON(`${BINANCE}/ticker/24hr?symbol=${asset.pair}`, signal),
    ]);
    if (!Array.isArray(rows) || !rows.length) throw new Error(`${asset.pair} 캔들이 비어 있습니다`);
    const candles = rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
    log(`지표 계산 — MA/RSI/MACD/ATR/변동성 (${candles.length}봉)`);
    const tech = compute(candles);
    let fearGreed = null;
    try {
      const d = await getJSON("https://api.alternative.me/fng/?limit=2", signal);
      const [today, yesterday] = d.data || [];
      if (today) fearGreed = { value: +today.value, label: today.value_classification, previous: yesterday ? +yesterday.value : null };
    } catch (err) {
      if (signal.aborted) throw err;
      log("공포탐욕지수 수집 실패 — 없이 진행");
    }
    return {
      asset, tech, candles, fearGreed, fundamentals: {}, news: [],
      quote: { price: +t.lastPrice, changePercent: +t.priceChangePercent },
      synthetic: false,
    };
  }

  function syntheticData(asset) {
    const candles = [];
    let p = 100;
    const day = 86400000, t0 = Date.now() - 200 * day;
    for (let i = 0; i < 200; i++) {
      p *= 1 + Math.sin(i / 9) * 0.012 + Math.sin(i / 31) * 0.006;
      candles.push({ time: t0 + i * day, open: p, high: p * 1.012, low: p * 0.988, close: p, volume: 1e6 });
    }
    const tech = compute(candles);
    const prev = candles[candles.length - 2].close;
    return {
      asset, tech, candles, fundamentals: {}, news: [],
      fearGreed: { value: 58, label: "Greed", previous: 54 },
      quote: { price: tech.price, changePercent: ((tech.price - prev) / prev) * 100 },
      synthetic: true,
    };
  }

  // ─────────────────────────── 논조와 대사 (demo.js)
  function readTone(d) {
    const t = d.tech;
    const r = t.rsi14 == null ? 50 : t.rsi14;
    const hist = t.macd ? t.macd.histogram : 0;
    const gap = t.ma20Distance == null ? 0 : t.ma20Distance;
    let score = 0;
    if (r > 70) score -= 1; else if (r < 30) score += 1;
    if (t.maCross === "golden") score += 1; else if (t.maCross === "dead") score -= 1;
    if (hist > 0) score += 1; else if (hist < 0) score -= 1;
    if (gap > 12) score -= 1; else if (gap < -12) score += 1;
    return {
      rsi: r, cross: t.maCross, hist, gap, overbought: r > 70, oversold: r < 30, score,
      action: score >= 2 ? "BUY" : score <= -2 ? "SELL" : "HOLD",
      stance: score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral",
    };
  }
  const crossLabel = (c) => (c === "golden" ? "정배열" : c === "dead" ? "역배열" : "이동평균 동률");

  function analystScript(id, d, tone) {
    const t = d.tech, sym = d.asset.display;
    const table = {
      TARO: {
        bubble: `${sym} RSI ${num(tone.rsi, 1)}, ${crossLabel(tone.cross)} — ${tone.overbought ? "과열 구간" : tone.oversold ? "침체 구간" : "중립 구간"}`,
        briefing:
          `RSI(14)는 ${num(tone.rsi, 1)}이고 MA20 ${money(t.ma20)} 대비 이격은 ${pct(t.ma20Distance)}, ` +
          `MACD 히스토그램은 ${num(tone.hist, 4)}입니다. ` +
          `${crossLabel(tone.cross)} 상태에서 ${tone.hist > 0 ? "모멘텀은 아직 위를 향해" : "모멘텀은 아래로 꺾여"} 있습니다. ` +
          `${tone.overbought ? "다만 RSI가 70을 넘겨 되돌림 없이 추세가 이어지기는 어려운 구간입니다."
            : tone.oversold ? "다만 RSI가 30을 밑돌아 반등이 나와도 이상하지 않은 구간입니다."
              : "지표들이 한 방향을 가리키지 않아 방향성 베팅의 근거는 약합니다."} ` +
          `반대 시나리오는 ATR ${pct(t.atrPercent)} 수준의 변동이 하루에 소화되면서 현재 해석이 통째로 뒤집히는 경우입니다. ` +
          `판단이 바뀌는 트리거는 최근 20봉 고점 ${money(t.high20)} 돌파 또는 저점 ${money(t.low20)} 이탈입니다.`,
        stance: tone.stance, confidence: 50 + Math.min(20, Math.abs(tone.score) * 6),
      },
      DIANA: {
        bubble: `${sym} 조회구간 고점 대비 ${pct(((t.price - t.rangeHigh) / t.rangeHigh) * 100)} 위치`,
        briefing:
          `현재가 ${money(t.price)}는 조회구간(${t.barsAnalyzed}봉) 최고 ${money(t.rangeHigh)} 대비 ` +
          `${pct(((t.price - t.rangeHigh) / t.rangeHigh) * 100)}, 최저 ${money(t.rangeLow)} 대비 ` +
          `${pct(((t.price - t.rangeLow) / t.rangeLow) * 100)} 지점입니다. ` +
          "이 자산은 현금흐름이 없어 전통적 밸류에이션이 성립하지 않습니다. " +
          "가격 위치만으로는 저평가·고평가를 단정할 수 없고, 유동성이 받쳐주는지가 실질적 판단 근거입니다. " +
          "반대 시나리오는 구간 고저가 최근 급등락으로 왜곡돼 위치 해석 자체가 무의미한 경우입니다. " +
          "판단이 바뀌는 트리거는 거래대금이 평소 대비 절반 아래로 마르는 시점입니다.",
        stance: "neutral", confidence: 48,
      },
      // 브라우저 데모는 뉴스를 받지 않는다 — 원본의 "헤드라인 n건" 대신 그 사실을 말한다
      NOVA: {
        bubble: `${sym} 헤드라인 없음 — 데모에서는 뉴스를 받지 않아 가격 반영도만 봅니다`,
        briefing:
          "브라우저 데모에서는 뉴스를 수집하지 않습니다. 대신 재료가 이미 가격에 반영됐는지를 봅니다. " +
          `현재가가 MA20 대비 ${pct(t.ma20Distance)} 벌어져 있다는 건 ` +
          `${tone.gap > 0 ? "상당 부분 선반영됐을 가능성" : "아직 반영되지 않았거나 시장이 재료를 신뢰하지 않을 가능성"}을 시사합니다. ` +
          "반대 시나리오는 헤드라인이 표면적일 뿐 실제 수급은 반대로 움직이는 경우입니다. " +
          "판단이 바뀌는 트리거는 같은 재료로 이틀 연속 갭이 발생하는지 여부입니다.",
        stance: tone.score >= 1 ? "bullish" : tone.score <= -1 ? "bearish" : "neutral", confidence: 55,
      },
      VIBE: {
        bubble: `${sym} 공포탐욕 ${d.fearGreed ? d.fearGreed.value : "자료없음"} — 심리와 가격의 괴리 ${tone.overbought ? "확대" : "보통"}`,
        briefing:
          (d.fearGreed
            ? `공포·탐욕 지수는 ${d.fearGreed.value}(${d.fearGreed.label})이고 ` +
              (d.fearGreed.previous != null ? `전일 ${d.fearGreed.previous}에서 ${d.fearGreed.value - d.fearGreed.previous > 0 ? "올랐" : "내렸"}습니다. ` : "")
            : "공포·탐욕 지수를 받지 못했습니다. ") +
          `여기에 RSI ${num(tone.rsi, 1)}를 겹쳐 보면 ` +
          `${tone.overbought ? "군중이 이미 낙관 쪽으로 쏠려 있어, 추가 상승보다 되돌림에서 손실이 커지기 쉬운 위치입니다."
            : tone.oversold ? "군중이 비관에 쏠려 있어 나쁜 뉴스에 대한 추가 반응이 둔해질 수 있는 위치입니다."
              : "심리가 어느 쪽으로도 극단에 있지 않아 역발상 근거가 약합니다."} ` +
          "반대 시나리오는 심리 지표가 가격을 따라가는 후행 지표에 불과해 아무 정보도 주지 않는 경우입니다. " +
          "판단이 바뀌는 트리거는 지수가 20 아래 또는 80 위로 이동하는 시점입니다.",
        stance: tone.overbought ? "bearish" : tone.oversold ? "bullish" : "neutral", confidence: 52,
      },
    };
    return table[id];
  }

  function debateScript(side, turn, d, tone) {
    const t = d.tech;
    if (side === "BULL") {
      return turn === 1
        ? {
          bubble: tone.hist > 0 ? `${crossLabel(tone.cross)} + MACD 양수 — 추세는 아직 살아 있다` : `${crossLabel(tone.cross)} — MACD는 음수지만 반등 여지를 본다`,
          argument:
            "애널리스트 리포트에서 상승 근거를 뽑으면 세 가지입니다. " +
            `첫째 ${crossLabel(tone.cross)} 구조이고, 둘째 MACD 히스토그램이 ${num(tone.hist, 4)}${tone.hist > 0 ? "로 위를 향하며" : "로 아직 아래지만 음수 폭이 줄면 반전 신호가 되고"}, ` +
            `셋째 현재가가 최근 20봉 저점 ${money(t.low20)}에서 충분히 이격돼 있습니다. ` +
            "추세를 부정할 근거가 나오기 전까지 방향은 위쪽으로 봅니다.",
        }
        : {
          bubble: `RSI ${num(tone.rsi, 1)}는 과열이 아니라 추세 강도의 증거다`,
          argument:
            `BEAR는 RSI ${num(tone.rsi, 1)}를 과열 신호로 읽었지만, 강한 추세장에서 RSI는 오래 높게 머뭅니다. ` +
            "과열만으로 방향을 뒤집는 건 조기 판단입니다. " +
            `ATR ${pct(t.atrPercent)}를 감안하면 지금 이격도는 하루치 변동으로 해소되는 범위입니다. ` +
            `무효화 레벨을 ${money(t.low20)}로 두고 추세를 따라가는 편이 기대값이 높습니다.`,
        };
    }
    return turn === 2
      ? {
        bubble: `RSI ${num(tone.rsi, 1)}, MA20 이격 ${pct(t.ma20Distance)} — 되돌림 압력`,
        argument:
          "BULL은 추세가 살아 있다고 했지만, 그 추세가 만든 이격이 문제입니다. " +
          `현재가는 MA20 대비 ${pct(t.ma20Distance)} 벌어져 있고 RSI는 ${num(tone.rsi, 1)}입니다. ` +
          `${tone.overbought ? "두 지표가 동시에 과열을 가리킬 때는 되돌림이 먼저 오는 경우가 많습니다. " : "지표가 방향을 확정해주지 않는 구간입니다. "}` +
          "상승 논거는 이미 가격에 반영된 재료에 기대고 있습니다.",
      }
      : {
        bubble: "무효화 레벨이 ATR 한 배 안 — 손절이 먼저 걸린다",
        argument:
          `BULL이 제시한 무효화 레벨 ${money(t.low20)}는 현재가에서 ${pct(((t.low20 - t.price) / t.price) * 100)} 떨어져 있습니다. ` +
          `ATR가 ${pct(t.atrPercent)}인 자산에서 이 폭은 정상 변동에도 닿을 수 있습니다. ` +
          "즉 방향이 맞아도 손절이 먼저 걸리는 계획이라는 뜻입니다. 진입을 서두를 이유가 없습니다.",
      };
  }

  // 판정 방향에 맞춰 손절·목표·트리거를 고른다. 매도면 위가 손절, 아래가 목표.
  function levels(t, action) {
    const short = action === "SELL";
    return {
      short,
      stop: short ? t.high20 : t.low20,
      trigger: short ? t.low20 : t.high20,
      target2: short ? t.rangeLow : t.rangeHigh,
      triggerText: short ? "저점 이탈" : "고점 돌파",
    };
  }

  function aceScript(d, tone) {
    const t = d.tech, L = levels(t, tone.action);
    return {
      bubble: `${tone.action} — ${tone.action === "HOLD" ? "트리거 확인 전 관망" : "추세 방향으로 분할 접근"}`,
      action: tone.action,
      confidence: tone.action === "HOLD" ? 56 : 62,
      entry: tone.action === "HOLD"
        ? `최근 20봉 고점 ${money(t.high20)} 돌파 확인 후 (확인 전 진입 금지)`
        : `현재가 ${money(t.price)} 부근 절반, 나머지는 ${L.short ? "반등" : "되돌림"} 시`,
      stop: `무효화 ${money(L.stop)} — ATR ${pct(t.atrPercent)} 기준 한 배 밖`,
      target: `1차 ${money(L.trigger)} / 2차 ${money(L.target2)}`,
      briefing:
        "애널리스트 4명과 토론 4턴을 종합하면 방향 근거와 되돌림 근거가 팽팽합니다. " +
        `BULL의 ${crossLabel(tone.cross)} 논거는 유효하지만, BEAR가 지적한 MA20 이격 ${pct(t.ma20Distance)}와 무효화 폭 문제가 더 구체적입니다. ` +
        `특히 손절을 ${money(L.stop)}에 두면 ATR ${pct(t.atrPercent)} 자산에서 정상 변동에도 닿을 수 있다는 지적은 실행 관점에서 무시하기 어렵습니다. ` +
        `${tone.action === "HOLD" ? "그래서 진입을 트리거 확인 뒤로 미룹니다. 지금은 관망이 정직한 답이고, 고점 돌파가 확인되면 그때 방향을 잡습니다."
          : `그래서 ${L.short ? "매도" : "매수"} 방향은 유지하되 분할로 접근하고, 첫 진입은 절반만 싣습니다.`}`,
    };
  }

  function riskScript(id, d, tone, ace) {
    const t = d.tech, L = levels(t, ace.action);
    return {
      RISKY: {
        bubble: "기회비용도 리스크 — 손절만 지키면 비중을 더 실을 근거는 충분",
        briefing:
          `ACE의 ${ace.action} 판정은 지나치게 방어적입니다. ${crossLabel(tone.cross)} 구조가 유지되는 동안 방향을 포기할 이유가 없습니다. ` +
          `손절 ${money(L.stop)}이 지켜진다는 전제에서는 계좌 리스크 2% 안에서 비중을 더 실을 수 있습니다. ` +
          "놓친 추세도 손실이라는 점을 계산에 넣어야 합니다. " +
          "다만 무모함을 옹호하는 건 아니고, 지정가 손절이 실제로 걸려 있어야 한다는 조건은 동일합니다.",
      },
      SAFE: {
        bubble: "최악의 시나리오가 계산 안 된 계획 — 비중 축소가 먼저",
        briefing:
          `ATR가 ${pct(t.atrPercent)}인 자산에서 손절 ${money(L.stop)}까지의 거리는 ${pct(Math.abs((L.stop - t.price) / t.price) * 100)}입니다. ` +
          "정상 변동 한 번에 닿을 수 있는 폭이라는 뜻입니다. " +
          `20일 변동성 ${pct(t.volatility20)}를 감안하면 하루에 이 폭이 두 번 왕복해도 이상하지 않습니다. ` +
          "꼬리위험까지 넣으면 계좌 리스크 2% 룰에서 명목 비중은 절반으로 줄여야 계산이 맞습니다. " +
          "손절을 넓히든 비중을 줄이든 둘 중 하나는 반드시 해야 합니다.",
      },
      NEUTRAL: {
        bubble: "양측 다 일부만 맞다 — 조건부 승인, 트리거 확인 후 절반 비중",
        briefing:
          "RISKY의 기회비용 지적과 SAFE의 손절폭 지적은 서로 배타적이지 않습니다. " +
          "SAFE가 지적한 손절 거리 문제는 사실이고 반드시 반영해야 합니다. " +
          "동시에 RISKY 말대로 트리거를 무한정 기다리는 것도 비용입니다. " +
          "절충안은 이렇습니다. 손절을 무효화 레벨보다 한 단계 밖으로 옮겨 정상 변동을 흡수하고, " +
          `비중은 산출값의 절반으로 시작하며, 트리거 ${money(L.trigger)} ${L.triggerText} 확인 시 나머지를 채웁니다. ` +
          "이 조건이 지켜지면 조건부 승인, 하나라도 어기면 기각 의견입니다.",
      },
    }[id];
  }

  function pmScript(d, ace) {
    const t = d.tech, L = levels(t, ace.action);
    return {
      bubble: "수정 승인 — 방향은 유지하되 비중과 손절을 조여서 통과",
      decision: "AMEND", action: ace.action, confidence: ace.confidence + 6,
      entry: `${money(L.trigger)} ${L.triggerText} 확인 후에만 진입 (확인 전 진입 금지)`,
      stop: `${money(L.stop)}보다 한 단계 ${L.short ? "위" : "아래"} — ATR ${pct(t.atrPercent)} 기준 1.5배`,
      target: `1차 ${money(L.trigger)} 유지, 절반 도달 시 분할 익절`,
      briefing:
        "트레이더 계획과 리스크 위원회 3인의 의견을 종합해 수정 승인(AMEND)합니다. " +
        "방향과 논거는 데이터에 부합하므로 기각할 이유가 없습니다. " +
        "다만 원안대로 실행하기에는 보수적 심사자가 지적한 두 가지가 실재합니다. " +
        `첫째, 손절 ${money(L.stop)}은 ATR ${pct(t.atrPercent)} 대비 여유가 없어 정상 변동에 걸립니다. ` +
        "둘째, 진입이 트리거 확인 전이었습니다. " +
        "그래서 세 가지를 수정합니다 — 손절을 한 단계 밖으로 옮기고, 진입을 트리거 확인 이후로 미루고, 비중을 절반으로 시작합니다. " +
        "공격적 심사자의 선진입 주장은 손절 문제가 해소되지 않은 상태에서는 받지 않습니다. " +
        "이 조건이 지켜지는 한 실행을 승인합니다.",
    };
  }

  const ROLE = {
    TARO: "기술적 분석", DIANA: "기본적 분석", NOVA: "뉴스 분석", VIBE: "센티먼트",
    BULL: "매수 논거", BEAR: "매도 논거", ACE: "수석 트레이더",
    RISKY: "공격적 리스크", SAFE: "보수적 리스크", NEUTRAL: "중립적 리스크", PM: "포트폴리오 매니저",
  };
  const STANCE = { bullish: "강세", bearish: "약세", neutral: "중립" };
  const ACTION = { BUY: "매수", SELL: "매도", HOLD: "관망" };

  // ─────────────────────────── 재생 (runDemo와 같은 순서)
  let speed = 1;
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("취소", "AbortError"));
    const t = setTimeout(resolve, ms / speed);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("취소", "AbortError")); }, { once: true });
  });

  async function runDemo(asset, emit, signal) {
    const log = (text) => emit("log", { text });
    const wait = (ms) => sleep(ms, signal);
    emit("stage", { id: "data", label: "시장 데이터 수집" });
    log("데모 모드 — 클로드를 호출하지 않고 연출을 재생합니다");
    let data;
    try {
      data = await collect(asset, log, signal);
    } catch (err) {
      if (signal.aborted) throw err;
      log(`실시간 시세 실패 (${err.message}) — 합성 데이터로 재생합니다`);
      data = syntheticData(asset);
    }
    const tone = readTone(data);
    emit("market", data);
    await wait(600);

    emit("stage", { id: "analysts", label: "① 애널리스트 팀" });
    for (const id of ["TARO", "DIANA", "NOVA", "VIBE"]) {
      await wait(700);
      emit("agent", { agent: id, ...analystScript(id, data, tone) });
    }
    emit("stage", { id: "research", label: "② 강세·약세 토론" });
    for (let turn = 1; turn <= 4; turn++) {
      await wait(1100);
      const side = turn % 2 === 1 ? "BULL" : "BEAR";
      const s = debateScript(side, turn, data, tone);
      emit("agent", { agent: side, turn, bubble: s.bubble, briefing: s.argument });
    }
    emit("stage", { id: "trader", label: "③ ACE 1차 판정" });
    await wait(1200);
    const ace = aceScript(data, tone);
    emit("plan", { agent: "ACE", ...ace });
    emit("stage", { id: "risk", label: "④ 리스크 위원회" });
    for (const id of ["RISKY", "SAFE", "NEUTRAL"]) {
      await wait(900);
      emit("agent", { agent: id, ...riskScript(id, data, tone, ace) });
    }
    emit("stage", { id: "pm", label: "⑤ PM 최종 승인" });
    await wait(1200);
    emit("verdict", { agent: "PM", ...pmScript(data, ace) });
    emit("done", {});
  }

  // ─────────────────────────── 화면
  const $ = (sel) => root.querySelector(sel);
  const feed = $("#fd-feed"), status = $("#fd-status"), stages = [...root.querySelectorAll("[data-stage]")];
  const playBtn = $("#fd-play"), skipBtn = $("#fd-skip"), select = $("#fd-symbol");
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  // 한국 관례: 오름 빨강 ▲, 내림 파랑 ▼
  const move = (v) => (v > 0 ? el("span", "up", `▲ ${pct(v)}`) : v < 0 ? el("span", "down", `▼ ${pct(v).replace("-", "−")}`) : el("span", "", pct(v)));

  function card(agent, bubble, briefing, extra) {
    const box = el("article", "fd-card");
    const head = el("p", "fd-who");
    head.append(el("b", "", agent), el("span", "", ROLE[agent] || ""));
    if (extra) head.append(el("span", "fd-chip", extra));
    box.append(head, el("p", "fd-bubble", bubble));
    if (briefing) {
      const more = el("details");
      more.append(el("summary", "", "자세히"), el("p", "", briefing));
      box.append(more);
    }
    return box;
  }

  function planList(p) {
    const dl = el("dl", "fd-plan");
    [["진입", p.entry], ["손절", p.stop], ["목표", p.target]].forEach(([k, v]) => dl.append(el("dt", "", k), el("dd", "", v)));
    return dl;
  }

  function handle(type, p) {
    if (type === "stage") {
      let reached = false;
      stages.forEach((s) => {
        const here = s.dataset.stage === p.id;
        if (here) reached = true;
        s.classList.toggle("is-now", here);
        s.classList.toggle("is-done", !reached);
      });
      status.textContent = `${p.label} 중…`;
    } else if (type === "log") {
      if (/실패/.test(p.text)) feed.append(el("p", "fd-warn", p.text));
    } else if (type === "market") {
      const box = el("article", "fd-card fd-market");
      box.append(el("p", "fd-who", `${p.asset.display} · ${p.synthetic ? "합성 데이터(시세 수신 실패)" : "바이낸스 실시간 시세"}`));
      const dl = el("dl", "fd-plan");
      const add = (k, v) => { dl.append(el("dt", "", k)); const dd = el("dd"); dd.append(v); dl.append(dd); };
      add("현재가", document.createTextNode(money(p.quote.price)));
      add("24시간", move(p.quote.changePercent));
      add("RSI(14)", document.createTextNode(num(p.tech.rsi14, 1)));
      add("이동평균", document.createTextNode(crossLabel(p.tech.maCross)));
      add("공포·탐욕", document.createTextNode(p.fearGreed ? `${p.fearGreed.value} (${p.fearGreed.label})` : "자료없음"));
      box.append(dl);
      feed.append(box);
    } else if (type === "agent") {
      feed.append(card(p.agent, p.bubble, p.briefing, p.stance ? `${STANCE[p.stance]} ${p.confidence}%` : p.turn ? `${p.turn}턴` : null));
    } else if (type === "plan") {
      const c = card("ACE", p.bubble, p.briefing, `${ACTION[p.action]} ${p.confidence}%`);
      c.insertBefore(planList(p), c.querySelector("details"));
      feed.append(c);
    } else if (type === "verdict") {
      const c = card("PM", p.bubble, p.briefing, `수정 승인 · ${ACTION[p.action]} ${p.confidence}%`);
      c.classList.add("fd-verdict");
      c.insertBefore(planList(p), c.querySelector("details"));
      feed.append(c);
    } else if (type === "done") {
      stages.forEach((s) => { s.classList.remove("is-now"); s.classList.add("is-done"); });
      status.textContent = "재생 끝 — 연출일 뿐, 이 판정은 아무 의미가 없습니다.";
      if (skipping && feed.lastElementChild) feed.lastElementChild.scrollIntoView({ block: "nearest" });
    }
    const last = feed.lastElementChild;
    if (last && type !== "stage" && type !== "log" && !skipping) last.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  let controller = null;
  let skipping = false;
  async function play() {
    if (controller) controller.abort();
    controller = new AbortController();
    const ctrl = controller;
    speed = 1; skipping = false;
    feed.textContent = "";
    stages.forEach((s) => s.classList.remove("is-now", "is-done"));
    const [pair, display] = select.value.split("|");
    playBtn.textContent = "다시 재생";
    skipBtn.disabled = false;
    try {
      await runDemo({ pair, display }, handle, ctrl.signal);
    } catch (err) {
      if (err.name !== "AbortError") status.textContent = `재생 중 오류: ${err.message}`;
    } finally {
      if (controller === ctrl) skipBtn.disabled = true;
    }
  }

  playBtn.addEventListener("click", play);
  skipBtn.addEventListener("click", () => { speed = 1000; skipping = true; });
  root.hidden = false;
  const fallback = document.getElementById("fd-noscript");
  if (fallback) fallback.hidden = true;
})();
