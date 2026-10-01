/* 오늘의 한 판 — arena/build.py가 만든 window.ARENA_DATA로 판을 열고, 방문자 예측을 받는다.
   기계의 선택은 방문자가 고른 뒤에만 보여 준다. 투표는 구글 폼으로 보내고(연결돼 있을 때),
   이 브라우저에도 저장한다. 방문자 번호는 무작위 글자이며 개인 정보가 아니다. */
(() => {
  const $ = (id) => document.getElementById(id);
  const qEl = $("ar-question");
  if (!qEl) return;
  const D = window.ARENA_DATA;
  if (!D) { qEl.textContent = "판 자료를 찾지 못했습니다. arena/build.py를 먼저 실행하세요."; return; }

  const DAY = 86400000;
  const R = D.rules;
  const LABEL = { up: "▲ 크게 오름", flat: "━ 횡보", down: "▼ 크게 내림" };
  const SHORT = { up: "▲", flat: "━", down: "▼" };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const usd = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
  const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
  const kstDate = (ms) => new Date(ms).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  const kstTime = (iso) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const roundNo = (id) => Math.round((Date.parse(id) - Date.parse(R.start)) / DAY) + 1;
  // 한국 관례: 오름 빨강 ▲, 내림 파랑 ▼
  const move = (r) => {
    const v = ((Math.exp(r) - 1) * 100).toFixed(2);
    if (Number(v) === 0) return el("span", "", "0.00%");
    return r > 0 ? el("span", "up", `▲ +${v}%`) : el("span", "down", `▼ −${Math.abs(v).toFixed(2)}%`);
  };

  // ── 저장소: 실패해도 판은 돌아간다
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } },
  };
  let visitor = store.get("arena-id", "");
  if (!/^[a-z0-9]{8,32}$/.test(visitor)) {
    visitor = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("");
    store.set("arena-id", visitor);
  }
  const votes = store.get("arena-votes", {});
  const nick = $("ar-nick");
  nick.value = store.get("arena-nick", "");

  // ── 지금 열려 있는 회차 = 마지막으로 닫힌 UTC 일봉
  const curId = new Date(Math.floor(Date.now() / DAY) * DAY - DAY).toISOString().slice(0, 10);
  const closesAt = Date.parse(curId) + 2 * DAY;
  let round = D.rounds.find((r) => r.id === curId) || null;
  let candles = D.chart;

  async function ensureRound() {
    const last = candles[candles.length - 1];
    if (round && last && new Date(last.t).toISOString().slice(0, 10) === curId) return;
    // 집계가 늦었으면 시세만 직접 받는다(기계 선택은 다음 집계 때)
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${R.symbol}&interval=1d&limit=62`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()).map((r) => ({ t: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], closeTime: r[6] }));
    const closed = rows.filter((r) => r.closeTime < Date.now());
    const i = closed.findIndex((r) => new Date(r.t).toISOString().slice(0, 10) === curId);
    if (i < 20) throw new Error("오늘 회차 일봉이 아직 없음");
    const c = closed.map((r) => r.close);
    const rets = [];
    for (let k = i - 19; k <= i; k++) rets.push(Math.log(c[k] / c[k - 1]));
    const m = rets.reduce((a, b) => a + b, 0) / 20;
    const sd = Math.sqrt(rets.reduce((a, x) => a + (x - m) ** 2, 0) / 19);
    candles = closed.slice(Math.max(0, i - 59), i + 1);
    round = round || { id: curId, close: c[i], band: R.band_k * sd * Math.sqrt(R.horizon_days), picks: null, crowd: null };
  }

  // ── 차트: 왼쪽은 최근 60일, 오른쪽은 '내일 구역 확대'(오늘 종가 ±3배 기준 폭을 따로 키운 칸)
  //    ±1% 남짓한 구역을 60일 가격 폭에 그대로 그리면 실선 한 줄로 뭉개져서 따로 확대한다.
  function drawChart() {
    const W = 360, H = 230, PW = 250, top = 12, bottom = H - 18;
    const t = (x, yy, text, fill, size = 12, anchor = "middle", weight = "400") =>
      `<text x="${x}" y="${yy}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" font-family="Galmuri11, monospace">${text}</text>`;
    const hi = Math.max(...candles.map((x) => x.high)), lo = Math.min(...candles.map((x) => x.low));
    const y = (p) => top + (hi - p) / (hi - lo || 1) * (bottom - top);
    const slot = PW / candles.length;
    let s = `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
    candles.forEach((x, i) => {
      const col = x.close >= x.open ? "#f04452" : "#3182f6";
      const cx = i * slot + slot / 2, bw = Math.max(1.5, slot * 0.62);
      const a = y(Math.max(x.open, x.close)), b = y(Math.min(x.open, x.close));
      s += `<rect x="${(cx - 0.5).toFixed(2)}" y="${y(x.high).toFixed(1)}" width="1" height="${Math.max(1, y(x.low) - y(x.high)).toFixed(1)}" fill="${col}"/>`;
      s += `<rect x="${(cx - bw / 2).toFixed(2)}" y="${a.toFixed(1)}" width="${bw.toFixed(2)}" height="${Math.max(1, b - a).toFixed(1)}" fill="${col}"/>`;
    });
    const yc = y(round.close);
    s += `<rect x="0" y="${yc.toFixed(1)}" width="${PW}" height="1" fill="#6b4eff" opacity=".6"/>`;
    s += t(4, yc < top + 20 ? yc + 16 : yc - 6, `오늘 ${usd(round.close)}`, "#6b4eff", 12, "start", "700");

    // 확대 칸: 위·가운데·아래가 같은 높이(±3배 기준 폭)
    const zx = PW + 22, zw = W - zx - 2, zt = top + 16, zb = bottom, zh = zb - zt;
    const third = zh / 3;
    s += `<rect x="${zx}" y="${zt}" width="${zw}" height="${third}" fill="#f04452" opacity=".28"/>`;
    s += `<rect x="${zx}" y="${zt + third}" width="${zw}" height="${third}" fill="#8b95a1" opacity=".18"/>`;
    s += `<rect x="${zx}" y="${zt + 2 * third}" width="${zw}" height="${third}" fill="#3182f6" opacity=".28"/>`;
    s += `<rect x="${zx}" y="${zt}" width="${zw}" height="${zh}" fill="none" stroke="#6b4eff" stroke-width="2"/>`;
    const zc = zt + zh / 2;
    // 오늘 종가에서 확대 칸 가운데로 잇는 점선
    s += `<path d="M${PW} ${yc.toFixed(1)} L${zx} ${zc.toFixed(1)}" stroke="#6b4eff" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/>`;
    s += `<rect x="${zx}" y="${zc}" width="${zw}" height="1" fill="#6b4eff"/>`;
    const upP = ((Math.exp(round.band) - 1) * 100).toFixed(1), dnP = ((1 - Math.exp(-round.band)) * 100).toFixed(1);
    const mid = zx + zw / 2;
    s += t(mid, zt + third / 2 + 1, "▲ 크게", "#e42939", 13, "middle", "700") + t(mid, zt + third / 2 + 16, `+${upP}% 넘게`, "#191f28", 10);
    s += t(mid, zc - 6, "━ 횡보", "#191f28", 13, "middle", "700") + t(mid, zc + 15, "그 사이", "#8b95a1", 10);
    s += t(mid, zt + 2.5 * third + 1, "▼ 크게", "#1b64da", 13, "middle", "700") + t(mid, zt + 2.5 * third + 16, `−${dnP}% 넘게`, "#191f28", 10);
    s += t(mid, zt - 5, "내일 9시", "#6b4eff", 11, "middle", "700");
    s += t(PW / 2, H - 4, `최근 ${candles.length}일`, "#8b95a1", 11);

    const first = candles[0].close, chg = ((round.close / first - 1) * 100).toFixed(1);
    const label = `비트코인 최근 ${candles.length}일 일봉, 60일 전보다 ${chg}%. 오늘 오전 9시 종가 ${usd(round.close)}. ` +
      `오른쪽 확대 칸: 내일 오전 9시 종가가 +${upP}% 넘게 오르면 크게 오름, −${dnP}% 넘게 내리면 크게 내림, 그 사이면 횡보.`;
    const fig = $("ar-chart");
    fig.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${s}</svg>`;
    fig.append(el("figcaption", "", "왼쪽: 최근 60일 일봉(빨강 오름, 파랑 내림) · 오른쪽: 내일 결과 구역을 크게 키운 칸"));
  }

  function writeQuestion() {
    const upP = ((Math.exp(round.band) - 1) * 100).toFixed(1), dnP = ((1 - Math.exp(-round.band)) * 100).toFixed(1);
    qEl.textContent = "";
    qEl.append("오늘 오전 9시 종가 ", el("b", "", usd(round.close)), ". 내일 오전 9시까지 ",
      el("span", "up", `▲ +${upP}%`), " 넘게 오르면 크게 오름, ", el("span", "down", `▼ −${dnP}%`),
      " 넘게 내리면 크게 내림, 그 사이면 횡보.");
    $("ar-round").textContent = `${roundNo(curId)}회차 · ${kstDate(closesAt)} 오전 9시 마감`;
  }

  // ── 고르기
  const choices = [...document.querySelectorAll(".ar-choice")];
  function lockChoices(picked) {
    choices.forEach((b) => {
      b.disabled = Boolean(picked);
      b.classList.toggle("is-picked", b.dataset.choice === picked);
      b.setAttribute("aria-pressed", String(b.dataset.choice === picked));
    });
  }

  async function send(choice, name) {
    if (!D.form) return "local";
    const e = D.form.entries, body = new URLSearchParams();
    body.set(e.round, curId); body.set(e.choice, choice); body.set(e.visitor, visitor);
    if (name) body.set(e.nickname, name);
    // 구글 폼은 다른 사이트의 응답 내용을 읽을 수 없게 막는다(no-cors). 보낸 것까지만 확인한다.
    await fetch(D.form.action, { method: "POST", mode: "no-cors", body });
    return "sent";
  }

  choices.forEach((btn) => btn.addEventListener("click", async () => {
    if (votes[curId] || Date.now() >= closesAt) return;
    const choice = btn.dataset.choice;
    const name = nick.value.trim().slice(0, 12);
    votes[curId] = { choice, at: new Date().toISOString() };
    store.set("arena-votes", votes);
    store.set("arena-nick", name);
    lockChoices(choice);
    showAfter();
    const status = $("ar-status");
    status.textContent = "보내는 중…";
    try {
      const how = await send(choice, name);
      status.textContent = "";
      status.append("내 선택 ", el("b", "", LABEL[choice]), how === "sent"
        ? " — 냈어요! 결과는 내일 오전 9시. 방문자 집계와 순위는 몇 시간 안에 반영돼요."
        : " — 이 브라우저에 저장했어요(방문자 집계는 아직 연결 전). 결과는 내일 오전 9시.");
    } catch {
      status.textContent = "집계 서버로 보내지 못했어요. 내 기록에는 남았어요.";
    }
    renderBoard();
  }));

  // ── 고른 뒤: 다른 선수들의 선택
  function showAfter() {
    const mine = votes[curId];
    if (!mine) return;
    $("ar-after").hidden = false;
    const list = $("ar-picks");
    list.textContent = "";
    const me = el("li", "is-me");
    me.append(el("span", "who", "나"), el("span", `pick ${mine.choice}`, LABEL[mine.choice]));
    list.append(me);
    D.players.filter((p) => p.kind === "machine").forEach((p) => {
      const li = el("li");
      const pick = round.picks ? round.picks[p.key] : null;
      const who = p.href ? el("a", "who", p.name) : el("span", "who", p.name);
      if (p.href) who.href = p.href;
      li.append(who, pick ? el("span", `pick ${pick}`, LABEL[pick]) : el("span", "pick", "집계 후 공개"));
      const rate = el("span", "rate", `${p.short} · 연습 경기 적중률 ${pct1(p.long_hit / p.long_n)}`);
      rate.title = p.rule;
      li.append(rate);
      list.append(li);
    });
    const crowd = $("ar-crowd");
    crowd.textContent = "";
    const cr = round.crowd;
    if (cr && cr.n) {
      crowd.append(`지금까지 방문자 ${cr.n}명: `, el("span", "", `▲ ${pct1(cr.up / cr.n)} · ━ ${pct1(cr.flat / cr.n)} · ▼ ${pct1(cr.down / cr.n)}`),
        ` (집계 ${kstTime(D.generated_at)} 기준)`);
      const bar = el("div", "ar-bar");
      ["up", "flat", "down"].forEach((k) => { const s = el("span", k); s.style.width = `${(cr[k] / cr.n) * 100}%`; bar.append(s); });
      crowd.append(bar);
    } else {
      crowd.textContent = "이번 회차에 집계된 방문자 표는 아직 없어요. 집계는 몇 시간마다 갱신돼요.";
    }
  }

  // ── 지난 회차와 순위
  function renderBoard() {
    const resolved = D.rounds.filter((r) => r.answer);
    const box = $("ar-last");
    box.textContent = "";
    const lr = resolved[resolved.length - 1];
    if (!lr) {
      box.append(el("p", "empty-note", `첫 결과는 ${kstDate(Date.parse(R.start) + 2 * DAY)} 오전 9시에 나와요. 집계는 그 뒤 몇 시간 안에 올라와요.`));
    } else {
      const wrap = el("div", "ar-last");
      const head = el("p", "big");
      head.append(`${roundNo(lr.id)}회차 정답 `, el("span", lr.answer === "flat" ? "" : lr.answer, LABEL[lr.answer]));
      wrap.append(head);
      const line = el("p");
      line.append(`${usd(lr.close)} → ${usd(lr.next_close)} (`, move(lr.move), `, 기준 ±${((Math.exp(lr.band) - 1) * 100).toFixed(1)}%)`);
      wrap.append(line);
      const marks = el("ul", "ar-marks");
      const mark = (name, pick, me) => {
        if (!pick) return;
        const li = el("li", `${pick === lr.answer ? "hit" : "miss"}${me ? " is-me" : ""}`, `${name} ${SHORT[pick]} ${pick === lr.answer ? "맞음" : "틀림"}`);
        marks.append(li);
      };
      if (votes[lr.id]) mark("나", votes[lr.id].choice, true);
      if (lr.crowd.pick) mark(`군중(${lr.crowd.n}명)`, lr.crowd.pick);
      D.players.filter((p) => p.kind === "machine").forEach((p) => mark(p.name, lr.picks[p.key]));
      wrap.append(marks);
      box.append(wrap);
    }

    // 순위표: 기계 + 군중 + 닉네임 + 나
    const rows = D.players.map((p) => ({ name: p.name, kind: p.kind, n: p.n, hit: p.hit }));
    D.board.forEach((b) => rows.push({ name: b.name, tag: b.tag, kind: "person", n: b.n, hit: b.hit }));
    const mine = resolved.filter((r) => votes[r.id]);
    if (mine.length) rows.push({ name: "나(이 브라우저)", kind: "person", n: mine.length, hit: mine.filter((r) => votes[r.id].choice === r.answer).length, me: true });
    // 결과가 나온 회차를 기준(min_rounds_for_board)만큼 채운 선수가 먼저, 그 안에서 적중률 순
    const enough = (r) => (r.n >= R.min_rounds_for_board ? 0 : 1);
    rows.sort((a, b) => enough(a) - enough(b) || (b.n ? b.hit / b.n : -1) - (a.n ? a.hit / a.n : -1) || b.n - a.n);
    const KIND = { machine: "기계", crowd: "군중", person: "사람" };
    const tbody = $("ar-table");
    tbody.textContent = "";
    rows.forEach((r) => {
      const tr = el("tr", r.me ? "is-me" : "");
      const name = el("td");
      name.append(el("span", `kind ${r.kind}`, KIND[r.kind]), r.name);
      if (r.tag) name.append(" ", el("span", "tag", `#${r.tag}`));
      tr.append(name, el("td", "", r.n ? `${r.hit}/${r.n}` : "-"), el("td", "", r.n ? pct1(r.hit / r.n) : "-"));
      tbody.append(tr);
    });
    $("ar-min").textContent = R.min_rounds_for_board;
    $("ar-board-note").textContent =
      `결과가 나온 회차 ${resolved.length}개 · 방문자 ${D.people.visitors}명이 낸 ${D.people.votes}표 · 집계 ${kstTime(D.generated_at)} · 투표 ${D.votes_source || "-"}`;
  }

  // ── 연습 경기(긴 기록)
  function renderLong() {
    const list = $("ar-long");
    const ms = D.players.filter((p) => p.long_n);
    const best = Math.max(...ms.map((p) => p.long_hit / p.long_n));
    ms.forEach((p) => {
      const rate = p.long_hit / p.long_n;
      const li = el("li");
      const name = el("span", "name");
      name.append(el("b", "", p.name));
      if (rate === best) name.append(el("span", "boss", "보스"));
      const track = el("span", "track");
      const fill = el("span", "fill"); fill.style.width = `${rate * 100}%`;
      const coin = el("span", "coin"); coin.style.left = `${100 / 3}%`; coin.title = "아무거나 찍으면 33%";
      track.append(fill, coin);
      li.append(name, track, el("span", "val", pct1(rate)));
      list.append(li);
    });
    const days = ms[0] ? ms[0].long_n.toLocaleString("ko-KR") : "-";
    list.before(el("p", "ar-note", `기계들이 같은 문제를 ${days}일 동안 매일 풀었다면의 적중률입니다. 세로 막대 = 아무거나 찍었을 때(33%). “늘 횡보”를 이기기가 생각보다 어렵습니다.`));
  }

  // ── 시작
  renderLong();
  renderBoard();
  ensureRound().then(() => {
    writeQuestion();
    drawChart();
    const mine = votes[curId];
    if (mine) {
      lockChoices(mine.choice);
      showAfter();
      $("ar-status").textContent = "";
      $("ar-status").append("이번 회차 내 선택 ", el("b", "", LABEL[mine.choice]), " — 결과는 내일 오전 9시. 내일 다시 와서 확인해 보세요.");
    } else {
      lockChoices(null);
    }
  }).catch((err) => {
    qEl.textContent = `오늘 판을 열지 못했어요(${err.message}). 잠시 뒤 새로고침해 주세요.`;
  });
})();
