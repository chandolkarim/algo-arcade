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

  // ── 차트: 세로 눈금은 보이는 60일로만 정한다(미래 캔들로 정하면 정답이 새어 나간다)
  function drawChart(fig, cs, shown, reveal) {
    const W = 360, PH = 150, VH = 36, H = PH + VH + 6, n = shown + (reveal ? R.horizon : 0);
    const slot = W / (shown + R.horizon);
    const scaleSet = cs.slice(0, reveal ? n : shown);
    const hi = Math.max(...scaleSet.map((x) => x.h)), lo = Math.min(...scaleSet.map((x) => x.l));
    const y = (p) => 4 + (hi - p) / (hi - lo || 1) * (PH - 8);
    const vmax = Math.max(...cs.slice(0, shown).map((x) => x.v));
    let s = `<rect width="${W}" height="${H}" fill="#0f0b24"/>`;
    s += `<rect x="${shown * slot}" y="0" width="${R.horizon * slot}" height="${H}" fill="#1b1438"/>`;
    s += `<rect x="${shown * slot - 1}" y="0" width="1" height="${H}" fill="#ffd23f" opacity=".8"/>`;
    for (let i = 0; i < n; i++) {
      const x = cs[i], up = x.c >= x.o, col = up ? "#ff4d6d" : "#3ea1ff";
      const cx = i * slot + slot / 2, bw = Math.max(1.5, slot * 0.6);
      const top = y(Math.max(x.o, x.c)), bot = y(Math.min(x.o, x.c));
      const fade = i >= shown ? ' opacity=".85"' : "";
      s += `<rect x="${cx - 0.5}" y="${y(x.h)}" width="1" height="${Math.max(1, y(x.l) - y(x.h))}" fill="${col}"${fade}/>`;
      s += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, bot - top)}" fill="${col}"${fade}/>`;
      const vh = Math.max(1, Math.min(VH, (x.v / vmax) * VH));
      s += `<rect x="${cx - bw / 2}" y="${H - vh}" width="${bw}" height="${vh}" fill="#bfb5ea" opacity="${i >= shown ? ".35" : ".55"}"/>`;
    }
    const first = cs[0].c, last = cs[shown - 1].c;
    const summary = `최근 ${shown}일 일봉 차트. 처음 대비 마지막 종가 ${((last / first - 1) * 100).toFixed(1)}%, 마지막 5일 ${((last / cs[shown - 6].c - 1) * 100).toFixed(1)}%.` +
      (reveal ? ` 노란 선 오른쪽은 공개된 5일.` : " 노란 선 오른쪽 5일은 가려져 있음.");
    fig.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${summary}">${s}</svg>`;
    const cap = el("figcaption", "", reveal ? "노란 선 오른쪽 = 공개된 5일" : "노란 선 오른쪽 5일이 문제입니다 · 아래 막대는 거래량");
    fig.append(cap);
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
    [["전체", score], ["힌트를 연 문제", score.hint], ["힌트 없이 푼 문제", score.plain]].forEach(([k, o]) => {
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
    drawChart($("bc-chart"), cs, R.window, false);
    const b = ((Math.exp(band) - 1) * 100).toFixed(1);
    $("bc-question").textContent = `5일 뒤 종가는? 이 차트의 평소 변동 폭으로 정한 기준 ±${b}% — 넘게 오르면 크게 오름, 넘게 내리면 크게 내림, 그 사이는 횡보`;
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

    drawChart($("bc-chart"), q.cs, R.window, true);
    const box = $("bc-result");
    box.textContent = "";
    box.append(el("p", ok ? "bc-ok" : "bc-miss", ok ? "맞았어요!" : `아쉬워요. 정답은 ${LABEL[q.answer]}`));
    const line = el("p", "");
    line.append(`5일 동안 `, move(q.r), ` (기준 ±${((Math.exp(q.band) - 1) * 100).toFixed(1)}%)`);
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
    drawChart(fig, cs, R.window, false);
    const band = bandAt(cs, R.window - 1);
    q.textContent = `${dateOf(t.day + R.horizon)} 종가는? 기준 ±${((Math.exp(band) - 1) * 100).toFixed(1)}%`;
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

  // ── 상황표
  const vc = D.verdict_counts;
  const baseN = D.situations.filter((s) => s.parts.length === 1).length;
  $("bc-table-summary").textContent =
    `상황 ${baseN}개와 조합 ${D.situations.length - baseN}개(겹치지 않게 세어 ${R.min_samples}번 이상 나온 것) 중` +
    `검증됨 ${vc.verified || 0} · 우연일 수 있음 ${vc.maybe_luck || 0} · 치우침 없음 ${vc.no_lean || 0} · 표본 부족 ${vc.too_few || 0}. ` +
    `문제 ${D.pool.length.toLocaleString("ko-KR")}개.`;
  const table = $("bc-table");
  const renderTable = (v) => {
    table.textContent = "";
    const rows = D.situations.filter((s) => (v ? s.verdict === v : s.parts.length === 1 || s.verdict === "verified" || s.verdict === "maybe_luck"));
    rows.forEach((s) => {
      const li = el("li", "bc-row");
      li.append(el("p", "bc-row-name", `${s.group} · ${s.name}`), statLine(s));
      table.append(li);
    });
    if (!rows.length) table.append(el("li", "empty-note", "해당하는 상황이 없습니다."));
  };
  const filter = $("bc-filter");
  filter.hidden = false;
  filter.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    filter.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    renderTable(btn.dataset.v);
  });
  renderTable("");
})();
