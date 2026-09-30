/* KIMCHI GAUGE — 거래소 공개 시세로 김치 프리미엄을 계산한다.
   인증키는 쓰지 않는다. 모든 주소는 방문자의 브라우저가 직접 호출한다. */
(() => {
  const URLS = {
    upbit: "https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-USDT",
    binance: "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
    fx: "https://open.er-api.com/v6/latest/USD",
  };
  const REFRESH_MS = 30000;
  const TIMEOUT_MS = 8000;
  const RANGE = 5; // 게이지 양 끝: ±5%

  const $ = (id) => document.getElementById(id);
  const el = {
    value: $("kp-value"), needle: $("kp-needle"), status: $("kp-status"),
    upbit: $("kp-upbit"), binance: $("kp-binance"), fx: $("kp-fx"), tether: $("kp-tether"),
  };
  if (!el.value) return;

  const won = (n) => `${Math.round(n).toLocaleString("ko-KR")}원`;
  const usd = (n) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  const kst = (d) => d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

  // 한국 관례: 오름(+) 빨강 ▲, 내림(-) 파랑 ▼. 기호를 함께 써서 색만으로 구분하지 않는다.
  const signed = (pct) => {
    const fixed = Math.abs(pct).toFixed(2);
    if (fixed === "0.00") return { text: "0.00%", dir: "none" };
    return pct > 0 ? { text: `▲ +${fixed}%`, dir: "up" } : { text: `▼ -${fixed}%`, dir: "down" };
  };

  const getJSON = async (url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  // 환율은 하루 한 번만 바뀌므로 페이지를 열 때 한 번 받고, 실패했을 때만 다시 시도한다.
  let fx = null;
  const loadFx = async () => {
    const data = await getJSON(URLS.fx);
    const rate = data && data.rates && data.rates.KRW;
    if (!(rate > 0)) throw new Error("환율 값 없음");
    fx = { rate, updated: new Date(data.time_last_update_unix * 1000) };
  };

  const setStatus = (text, isError = false) => {
    el.status.textContent = text;
    el.status.classList.toggle("is-error", isError);
  };

  let lastOk = null;

  const update = async () => {
    try {
      if (!fx) await loadFx();
      const [upbit, binance] = await Promise.all([getJSON(URLS.upbit), getJSON(URLS.binance)]);
      const krwBtc = upbit.find((t) => t.market === "KRW-BTC").trade_price;
      const krwUsdt = upbit.find((t) => t.market === "KRW-USDT").trade_price;
      const usdtBtc = parseFloat(binance.price);
      if (!(krwBtc > 0 && krwUsdt > 0 && usdtBtc > 0)) throw new Error("시세 값 이상");

      const premium = (krwBtc / (usdtBtc * fx.rate) - 1) * 100;
      const tether = (krwUsdt / fx.rate - 1) * 100;

      const p = signed(premium);
      el.value.textContent = p.text;
      el.value.dataset.dir = p.dir;
      const clamped = Math.max(-RANGE, Math.min(RANGE, premium));
      el.needle.style.left = `${((clamped + RANGE) / (RANGE * 2)) * 100}%`;

      el.upbit.textContent = won(krwBtc);
      el.binance.textContent = usd(usdtBtc);
      el.fx.textContent = `${fx.rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
      const t = signed(tether);
      el.tether.textContent = t.text;
      el.tether.dataset.dir = t.dir;

      lastOk = new Date();
      const fxDate = fx.updated.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
      setStatus(`마지막 갱신 ${kst(lastOk)} (한국 시각) · 30초마다 갱신 · 환율 기준일 ${fxDate}`);
    } catch (err) {
      const kept = lastOk ? `${kst(lastOk)} 값을 그대로 보여 줍니다.` : "잠시 후 다시 시도합니다.";
      setStatus(`시세를 불러오지 못했습니다. ${kept}`, true);
    }
  };

  // 탭을 보고 있을 때만 갱신한다.
  let timer = null;
  const start = () => {
    if (timer) return;
    update();
    timer = setInterval(update, REFRESH_MS);
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  start();
})();
