/* BLIND CHART — 이름·날짜를 가린 차트로 5일 뒤를 맞히는 게임.
   문제 목록과 상황 통계는 blind/build.py가 만든 window.BLIND_DATA, 차트는 방문자 브라우저가 바이낸스 공개 일봉을 직접 받는다.
   점수와 푼 문제는 이 브라우저의 localStorage에만 저장한다. */
(() => {
  const D = window.BLIND_DATA;
  const $ = (id) => document.getElementById(id);
  const roundEl = $("bc-round");
  if (!roundEl) return;
  if (!D) {
    roundEl.textContent = "계산 결과 파일을 찾지 못했습니다. blind/build.py를 먼저 실행하세요.";
    return;
  }

  const DAY = 86400000;
  const R = D.rules;
  const COIN_NAME = { BTCUSDT: "비트코인 BTC", ETHUSDT: "이더리움 ETH", SOLUSDT: "솔라나 SOL", XRPUSDT: "리플 XRP" };
  const LABEL = { up: "▲ 크게 오름", flat: "━ 횡보", down: "▼ 크게 내림" };
  const VERDICT = { verified: "검증됨", maybe_luck: "우연일 수 있음", no_lean: "치우침 없음", too_few: "판단할 표본 부족" };
  const byKey = Object.fromEntries(D.situations.map((s) => [s.key, s]));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const pct = (x) => `${(x * 100).toFixed(0)}%`;
  const dateOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
  // 한국 관례: 오름 빨강 ▲, 내림 파랑 ▼
  const move = (r) => {
    const v = ((Math.exp(r) - 1) * 100).toFixed(1);
    if (v === "0.0" || v === "-0.0") return el("span", "", "0.0%");
    return r > 0 ? el("span", "up", `▲ +${v}%`) : el("span", "down", `▼ ${v.replace("-", "−")}%`);
  };

  // 로그 수익률의 대칭 경계를 실제 가격 등락률로 바꾸면 상승·하락 폭은 다르다.
  const bandPercent = (band) => ({
    up: ((Math.exp(band) - 1) * 100).toFixed(1),
    down: ((1 - Math.exp(-band)) * 100).toFixed(1),
  });
  const bandText = (band) => {
    const { up, down } = bandPercent(band);
    return `상승 +${up}% / 하락 −${down}%`;
  };

  // ── 저장소: 실패해도 게임은 돌아간다
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 브라우저 */ } },
  };

  // ── 시세
  const fetchCandles = async (symbol, startDay, limit) => {
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startDay * DAY}&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).map((r) => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }));
  };

  // build.py outcome()과 같은 계산: 기준선은 그날까지 20일 변동성만으로
  const bandAt = (cs, i) => {
    const r = [];
    for (let k = i - 19; k <= i; k++) r.push(Math.log(cs[k].c / cs[k - 1].c));
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1));
    return R.band_k * sd * Math.sqrt(R.horizon);
  };
  const classify = (r, band) => (r > band ? "up" : r < -band ? "down" : "flat");

  // ── 차트: 왼쪽은 60일(+공개 뒤 5일), 오른쪽은 '5일 뒤 구역 확대' 칸.
  //    세로 눈금은 보이는 60일로만 정한다(미래 캔들로 정하면 정답이 새어 나간다).
  function drawChart(fig, cs, shown, reveal, band) {
    const W = 360, H = 250, PW = 252, top = 14, VH = 30, bottom = H - VH - 22;
    const n = shown + (reveal ? R.horizon : 0);
    const slot = PW / (shown + R.horizon);
    const scaleSet = cs.slice(0, reveal ? n : shown);
    const hi = Math.max(...scaleSet.map((x) => x.h)), lo = Math.min(...scaleSet.map((x) => x.l));
    const y = (p) => top + (hi - p) / (hi - lo || 1) * (bottom - top);
    const vmax = Math.max(...cs.slice(0, shown).map((x) => x.v));
    const t = (x, yy, s, fill, size = 12, anchor = "middle", weight = 400) =>
      `<text x="${x}" y="${yy}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" font-family="Galmuri11, monospace">${s}</text>`;
    let s = `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
    // 가려진(또는 공개된) 5일 자리
    s += `<rect x="${shown * slot}" y="0" width="${R.horizon * slot}" height="${H - 18}" fill="#f2f4f6"/>`;
    if (!reveal) s += t(shown * slot + (R.horizon * slot) / 2, (top + bottom) / 2, "?", "#6b4eff", 18, "middle", 700);
    for (let i = 0; i < n; i++) {
      const x = cs[i], col = x.c >= x.o ? "#f04452" : "#3182f6";
      const cx = i * slot + slot / 2, bw = Math.max(1.5, slot * 0.64);
      const a = y(Math.max(x.o, x.c)), b = y(Math.min(x.o, x.c));
      s += `<rect x="${(cx - 0.5).toFixed(2)}" y="${y(x.h).toFixed(1)}" width="1" height="${Math.max(1, y(x.l) - y(x.h)).toFixed(1)}" fill="${col}"/>`;
      s += `<rect x="${(cx - bw / 2).toFixed(2)}" y="${a.toFixed(1)}" width="${bw.toFixed(2)}" height="${Math.max(1, b - a).toFixed(1)}" fill="${col}"/>`;
      const vh = Math.max(1, Math.min(VH, (x.v / vmax) * VH));
      s += `<rect x="${(cx - bw / 2).toFixed(2)}" y="${H - 18 - vh}" width="${bw.toFixed(2)}" height="${vh}" fill="#8b95a1" opacity="${i >= shown ? ".35" : ".5"}"/>`;
    }
    const c0 = cs[shown - 1].c, yc = y(c0);
    s += `<rect x="0" y="${yc.toFixed(1)}" width="${PW}" height="1" fill="#6b4eff" opacity=".7"/>`;
    s += `<rect x="${shown * slot - 1}" y="0" width="2" height="${H - 18}" fill="#6b4eff"/>`;
    s += t(4, yc < top + 18 ? yc + 15 : yc - 5, "마지막 종가", "#6b4eff", 11, "start", 700);
    s += t(shown * slot / 2, H - 4, `${shown}일 · 아래 막대는 거래량`, "#8b95a1", 11);
    s += t(shown * slot + (R.horizon * slot) / 2, H - 4, "5일", "#8b95a1", 11);

    // 확대 칸: ±3배 기준 폭을 같은 높이 세 칸으로
    if (band) {
      const zx = PW + 14, zw = W - zx - 2, zt = top + 14, zb = bottom, zh = zb - zt, third = zh / 3, zc = zt + zh / 2;
      s += `<rect x="${zx}" y="${zt}" width="${zw}" height="${third}" fill="#f04452" opacity=".28"/>`;
      s += `<rect x="${zx}" y="${zt + third}" width="${zw}" height="${third}" fill="#8b95a1" opacity=".18"/>`;
      s += `<rect x="${zx}" y="${zt + 2 * third}" width="${zw}" height="${third}" fill="#3182f6" opacity=".28"/>`;
      s += `<rect x="${zx}" y="${zt}" width="${zw}" height="${zh}" fill="none" stroke="#6b4eff" stroke-width="2"/>`;
      s += `<path d="M${PW} ${yc.toFixed(1)} L${zx} ${zc.toFixed(1)}" stroke="#6b4eff" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/>`;
      const { up: upP, down: dnP } = bandPercent(band), mid = zx + zw / 2;
      s += t(mid, zt - 4, "5일 뒤", "#6b4eff", 11, "middle", 700);
      s += t(mid, zt + third / 2 + 1, "▲ 크게", "#e42939", 12, "middle", 700) + t(mid, zt + third / 2 + 15, `+${upP}%↑`, "#191f28", 10);
      s += t(mid, zc + 4, "━ 횡보", "#191f28", 12, "middle", 700);
      s += t(mid, zt + 2.5 * third + 1, "▼ 크게", "#1b64da", 12, "middle", 700) + t(mid, zt + 2.5 * third + 15, `−${dnP}%↓`, "#191f28", 10);
      if (reveal) {
        // 실제로 끝난 곳: 확대 칸 범위(±3배)를 넘으면 끝에 붙이고 화살표
        const r = Math.log(cs[shown - 1 + R.horizon].c / c0);
        const k = Math.max(-1, Math.min(1, r / (3 * band)));
        const ym = zc - k * (zh / 2);
        s += `<rect x="${zx - 6}" y="${(ym - 2).toFixed(1)}" width="18" height="4" fill="#191f28"/>`;
        s += `<polygon points="${zx + 12},${ym - 6} ${zx + 20},${ym} ${zx + 12},${ym + 6}" fill="#191f28"/>`;
        if (Math.abs(r) > 3 * band) s += t(zx + 4, r > 0 ? ym + 16 : ym - 8, r > 0 ? "↑ 더" : "↓ 더", "#191f28", 10, "start", 700);
      }
    }
    const first = cs[0].c, last = c0;
    const summary = `최근 ${shown}일 일봉 차트. 처음 대비 마지막 종가 ${((last / first - 1) * 100).toFixed(1)}%, 마지막 5일 ${((last / cs[shown - 6].c - 1) * 100).toFixed(1)}%.` +
      (reveal ? " 노란 선 오른쪽은 공개된 5일, 확대 칸 왼쪽의 흰 화살표가 실제로 끝난 위치." : " 오른쪽 확대 칸은 5일 뒤 결과 구역.");
    fig.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${summary}">${s}</svg>`;
    fig.append(el("figcaption", "", reveal ? "흰 화살표 = 5일 뒤 실제로 끝난 곳 · 노란 선 오른쪽 = 공개된 5일" : "노란 선 = 마지막 종가 · 오른쪽 칸 = 5일 뒤 종가가 떨어질 구역"));
  }

  // ── 상황 힌트
  const statLine = (s) => {
    const all = { n: s.design.n + s.validation.n };
    ["up", "flat", "down"].forEach((k) => { all[k] = s.design[k] + s.validation[k]; });
    const p = el("p", "bc-stat");
    p.append(`과거 ${all.n}번(겹치지 않게 셈): `, el("span", "up", `▲ ${pct(all.up / all.n)}`), " · ", `━ ${pct(all.flat / all.n)}`, " · ",
      el("span", "down", `▼ ${pct(all.down / all.n)}`), " ");
    p.append(el("span", `bc-chip is-${s.verdict}`, VERDICT[s.verdict]));
    return p;
  };

  function renderTags(box, ids, onOpen) {
    if (!box) return;  // 힌트 칸은 2026-10-02 게임 단순화로 뺐다
    box.textContent = "";
    const keys = ids.map((i) => D.ids[i]);
    const combos = [];
    for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
      // build.py는 상황 id를 글자순으로 정렬해 "a+b" 키를 만든다
      const k = [keys[a], keys[b]].sort().join("+");
      if (byKey[k]) combos.push(k);
    }
    if (!keys.length) { box.append(el("p", "bc-note", "이 날은 표시할 만한 상황이 없었습니다.")); return; }
    box.append(el("p", "bc-tags-title", "이 날 막 생긴 일 — 눌러서 힌트 보기"));
    [...keys, ...combos].forEach((k) => {
      const s = byKey[k];
      if (!s) return;
      const item = el("div", "bc-tag");
      const btn = el("button", "", s.name);
      btn.type = "button";
      btn.setAttribute("aria-expanded", "false");
      const body = el("div", "bc-tag-body");
      body.hidden = true;
      body.append(el("p", "bc-desc", s.desc), statLine(s));
      btn.addEventListener("click", () => {
        const open = body.hidden;
        body.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        if (open) onOpen();
      });
      item.append(btn, body);
      box.append(item);
    });
  }

  // ── 점수
  const blank = () => ({ n: 0, ok: 0, hint: { n: 0, ok: 0 }, plain: { n: 0, ok: 0 } });
  let score = store.get("bc-score", blank());
  const rate = (o) => (o.n ? `${o.ok}/${o.n} (${pct(o.ok / o.n)})` : "-");
  function renderScore() {
    const dl = $("bc-score-list");
    dl.textContent = "";
    [["맞힌 문제", score]].forEach(([k, o]) => {
      dl.append(el("dt", "", k), el("dd", "", rate(o)));
    });
  }
  const bd = D.base.design, bv = D.base.validation, bn = bd.n + bv.n;
  $("bc-base-up").textContent = pct((bd.up + bv.up) / bn);
  $("bc-base-flat").textContent = pct((bd.flat + bv.flat) / bn);
  $("bc-base-down").textContent = pct((bd.down + bv.down) / bn);
  $("bc-reset").addEventListener("click", () => { score = blank(); store.set("bc-score", score); renderScore(); });
  renderScore();

  // ── 과거 문제
  const choices = [...document.querySelectorAll(".bc-choice")];
  let current = null;

  async function nextQuestion(tries = 0) {
    const seen = new Set(store.get("bc-seen", []));
    let left = D.pool.filter(([c, d]) => !seen.has(`${c}-${d}`));
    if (!left.length) { store.set("bc-seen", []); left = D.pool; }
    const [ci, day, sit] = left[Math.floor(Math.random() * left.length)];
    const symbol = R.coins[ci];
    choices.forEach((b) => { b.disabled = true; b.classList.remove("is-picked", "is-answer"); });
    $("bc-result").textContent = "";
    $("bc-next").hidden = true;
    roundEl.textContent = "차트를 불러오는 중…";
    let cs;
    try {
      cs = await fetchCandles(symbol, day - (R.window - 1), R.window + R.horizon);
    } catch (err) {
      roundEl.textContent = `차트를 불러오지 못했습니다(${err.message}). `;
      const retry = el("button", "btn btn-ghost", "다시 시도");
      retry.type = "button";
      retry.addEventListener("click", () => nextQuestion());
      roundEl.append(retry);
      return;
    }
    const i = R.window - 1;
    if (cs.length < R.window + R.horizon || cs[i].t !== day * DAY) {
      if (tries < 3) return nextQuestion(tries + 1);  // 자료가 어긋난 문제는 건너뛴다
      roundEl.textContent = "문제 자료가 맞지 않아 멈췄습니다. 새로고침해 주세요.";
      return;
    }
    const band = bandAt(cs, i);
    const r = Math.log(cs[i + R.horizon].c / cs[i].c);
    current = { ci, day, symbol, cs, band, r, answer: classify(r, band), hint: false, sit };
    const solved = score.n + 1;
    roundEl.textContent = `${solved}번째 문제 · 어떤 코인인지, 언제인지는 정답 뒤에 공개`;
    renderTags($("bc-tags"), sit, () => { if (current) current.hint = true; });
    drawChart($("bc-chart"), cs, R.window, false, band);
    $("bc-question").textContent = `5일 뒤 종가는? 이 차트의 평소 변동 폭으로 정한 기준 ${bandText(band)} — 넘게 오르면 크게 오름, 넘게 내리면 크게 내림, 그 사이는 횡보`;
    choices.forEach((btn) => { btn.disabled = false; });
    choices[0].focus({ preventScroll: true });
  }

  function answer(choice) {
    if (!current || choices[0].disabled) return;
    const q = current;
    choices.forEach((btn) => {
      btn.disabled = true;
      btn.classList.toggle("is-picked", btn.dataset.choice === choice);
      btn.classList.toggle("is-answer", btn.dataset.choice === q.answer);
    });
    const ok = choice === q.answer;
    score.n += 1; score.ok += ok ? 1 : 0;
    const bucket = q.hint ? score.hint : score.plain;
    bucket.n += 1; bucket.ok += ok ? 1 : 0;
    store.set("bc-score", score);
    const seen = store.get("bc-seen", []);
    seen.push(`${q.ci}-${q.day}`);
    store.set("bc-seen", seen.slice(-5000));
    renderScore();

    drawChart($("bc-chart"), q.cs, R.window, true, q.band);
    const box = $("bc-result");
    box.textContent = "";
    box.append(el("p", ok ? "bc-ok" : "bc-miss", ok ? "맞았어요!" : `아쉬워요. 정답은 ${LABEL[q.answer]}`));
    const line = el("p", "");
    line.append(`5일 동안 `, move(q.r), ` (기준 ${bandText(q.band)})`);
    box.append(line);
    const d0 = q.cs[R.window - 1], d5 = q.cs[R.window - 1 + R.horizon];
    box.append(el("p", "bc-reveal", `${COIN_NAME[q.symbol]} · ${dateOf(q.day)} 종가 $${d0.c.toLocaleString("en-US")} → ${dateOf(q.day + R.horizon)} $${d5.c.toLocaleString("en-US")}`));
    $("bc-next").hidden = false;
    $("bc-next").focus({ preventScroll: true });
    current = null;
  }

  choices.forEach((btn) => btn.addEventListener("click", () => answer(btn.dataset.choice)));
  $("bc-next").addEventListener("click", () => nextQuestion());
  nextQuestion();

  // ── 오늘의 차트
  async function renderToday() {
    const box = $("bc-today");
    if (!box) return;
    const latest = Math.max(...D.today.map((t) => t.day));
    const cands = D.today.filter((t) => t.day === latest);
    const withSit = cands.filter((t) => t.situations.length);
    const pickFrom = withSit.length ? withSit : cands;
    const t = pickFrom[latest % pickFrom.length];  // 날짜로 정해서 모두에게 같은 문제
    const symbol = R.coins[t.coin];
    box.textContent = "";
    const head = el("p", "bc-note", `${dateOf(t.day)} 마감 기준 · 코인 이름은 답한 뒤 공개`);
    const tags = el("div", "bc-tags");
    const fig = el("figure", "bc-chart");
    const q = el("p", "bc-question");
    const row = el("div", "bc-choices");
    const status = el("p", "bc-today-status");
    status.setAttribute("role", "status");
    box.append(head, tags, fig, q, row, status);
    let cs;
    try {
      cs = await fetchCandles(symbol, t.day - (R.window - 1), R.window);
    } catch (err) {
      status.textContent = `차트를 불러오지 못했습니다(${err.message}).`;
      return;
    }
    if (cs.length < R.window || cs[R.window - 1].t !== t.day * DAY) { status.textContent = "오늘 차트 자료가 아직 준비되지 않았습니다."; return; }
    renderTags(tags, t.situations, () => {});
    const band = bandAt(cs, R.window - 1);
    drawChart(fig, cs, R.window, false, band);
    q.textContent = `${dateOf(t.day + R.horizon)} 종가는? 기준 ${bandText(band)}`;
    const mine = store.get("bc-today", []);
    const already = mine.find((g) => g.day === t.day);
    ["up", "flat", "down"].forEach((k) => {
      const b = el("button", "bc-choice", LABEL[k]);
      b.type = "button";
      b.disabled = Boolean(already);
      if (already && already.choice === k) b.classList.add("is-picked");
      b.addEventListener("click", () => {
        const list = store.get("bc-today", []);
        if (list.some((g) => g.day === t.day)) return;
        list.push({ day: t.day, coin: t.coin, choice: k, close: cs[R.window - 1].c, band });
        store.set("bc-today", list);
        renderToday();
        renderHistory();
      });
      row.append(b);
    });
    status.textContent = already
      ? `${COIN_NAME[symbol]}에 ${LABEL[already.choice]}로 답했어요. 결과는 ${dateOf(t.day + R.horizon)} 마감 뒤에 나옵니다.`
      : "하나를 고르면 저장됩니다. 5일 뒤 다시 들러 주세요.";
  }

  // 결과를 받아 오는 동안 다시 불리면 앞선 호출은 그리기를 멈춘다(같은 날짜가 두 번 붙지 않게)
  let historyRun = 0;
  async function renderHistory() {
    const run = ++historyRun;
    const list = $("bc-history");
    if (!list) return;
    const mine = store.get("bc-today", []).sort((a, b) => b.day - a.day);
    const items = [];
    for (const g of mine) {
      const li = el("li", "");
      li.append(el("span", "bc-date", dateOf(g.day)), ` ${COIN_NAME[R.coins[g.coin]]} · 내 답 ${LABEL[g.choice]} · `);
      const latest = Math.max(...D.today.map((t) => t.day));
      if (g.day + R.horizon > latest) {
        li.append(el("span", "bc-chip is-too_few", `결과 대기(${dateOf(g.day + R.horizon)})`));
      } else {
        try {
          const [x] = await fetchCandles(R.coins[g.coin], g.day + R.horizon, 1);
          const r = Math.log(x.c / g.close);
          const ans = classify(r, g.band);
          li.append(move(r), " ", el("span", `bc-chip ${ans === g.choice ? "is-verified" : "is-no_lean"}`, ans === g.choice ? "맞음" : `틀림 · 정답 ${LABEL[ans]}`));
        } catch {
          li.append(el("span", "bc-chip is-maybe_luck", "결과 확인 실패"));
        }
      }
      if (run !== historyRun) return;
      items.push(li);
    }
    if (run === historyRun) list.replaceChildren(...items);
  }
  renderToday();
  renderHistory();

})();
