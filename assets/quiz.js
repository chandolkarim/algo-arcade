/* 기계마다 '먼저 맞혀 보기' — 결과를 보기 전에 방문자가 직감을 고르고, 기계의 실제 기록과 비교한다.
   <section data-quiz="종류"> 안에 그린다. 자료는 그 페이지가 이미 불러온 window.*_DATA만 쓴다.
   점수는 이 브라우저에만 저장한다(localStorage, 실패해도 동작). */
(() => {
  const root = document.querySelector("[data-quiz]");
  if (!root) return;
  const box = root.querySelector(".qz-body");

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } },
  };
  const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
  const num = (n, d = 2) => Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  // 한국 관례: 오름 빨강 ▲, 내림 파랑 ▼
  const signed = (v, unit = "%", d = 2) => {
    const t = Math.abs(v).toFixed(d);
    if (Number(t) === 0) return el("span", "", `0${unit}`);
    return v > 0 ? el("span", "up", `▲ +${t}${unit}`) : el("span", "down", `▼ −${t}${unit}`);
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* 문제 하나를 그리고, 고르면 정답과 설명을 보여 준다.
     q = { context?: Node, text, options: [{key, label, cls?}], answer, explain(picked): Node } */
  function play(key, nextQuestion, opts = {}) {
    const score = store.get(`quiz-${key}`, { n: 0, ok: 0 });
    const scoreEl = el("p", "qz-score");
    const showScore = () => { scoreEl.textContent = score.n ? `이 브라우저 기록: ${score.n}문제 중 ${score.ok}개 맞힘` : ""; };
    let count = 0;

    function ask() {
      const q = nextQuestion(count);
      box.textContent = "";
      if (!q) { box.append(el("p", "qz-text", opts.done || "준비된 문제를 모두 풀었어요."), scoreEl); showScore(); return; }
      count += 1;
      if (q.context) box.append(q.context);
      box.append(el("p", "qz-text", q.text));
      const row = el("div", "qz-options");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "보기");
      const result = el("div", "qz-result");
      result.setAttribute("role", "status");
      q.options.forEach((o) => {
        const b = el("button", `qz-option ${o.cls || ""}`, o.label);
        b.type = "button";
        b.addEventListener("click", () => {
          if (row.dataset.done) return;
          row.dataset.done = "1";
          const ok = o.key === q.answer;
          score.n += 1; score.ok += ok ? 1 : 0;
          store.set(`quiz-${key}`, score);
          [...row.children].forEach((x, i) => {
            x.disabled = true;
            x.classList.toggle("is-picked", q.options[i].key === o.key);
            x.classList.toggle("is-answer", q.options[i].key === q.answer);
          });
          result.append(el("p", ok ? "qz-ok" : "qz-miss", ok ? "맞았어요!" : `아쉬워요. 정답은 “${q.options.find((x) => x.key === q.answer).label}”`));
          result.append(q.explain(o.key));
          if (opts.onAnswer) opts.onAnswer();
          const more = nextQuestion(count, true);
          if (more !== false) {
            const next = el("button", "btn btn-ghost qz-next", opts.nextLabel || "다음 문제");
            next.type = "button";
            next.addEventListener("click", ask);
            result.append(next);
            next.focus({ preventScroll: true });
          } else if (opts.done) {
            result.append(el("p", "qz-text", opts.done));
          }
          showScore();
        });
        row.append(b);
      });
      box.append(row, result, scoreEl);
      showScore();
    }
    ask();
  }

  const KINDS = {
    /* 4번: 속설 퀴즈 세 문제 */
    foreign() {
      const D = window.FOREIGN_FLOW_DATA;
      if (!D) return;
      const qs = D.questions.filter((q) => q.id !== "same_day");
      const ASK = {
        big_buy: "외국인이 평소보다 아주 많이 산 날(대량 순매수), 다음 날 코스피는 평소(아무 날)와 비교하면?",
        streak: "외국인이 5거래일 연속 순매수한 뒤, 그다음 5거래일 코스피는 평소와 비교하면?",
        big_sell: "외국인이 평소보다 아주 많이 판 날(대량 순매도), 다음 날 코스피는 평소와 비교하면?",
      };
      const ANS = (q) => (q.verdict === "effect" ? (q.periods.design.direction === "up" ? "up" : "down") : "same");
      play("foreign", (i, peek) => {
        if (peek) return i < qs.length ? true : false;
        const q = qs[i];
        if (!q) return null;
        return {
          context: el("p", "qz-kicker", `${i + 1} / ${qs.length} · ${q.title}`),
          text: ASK[q.id] || `${q.signal} → ${q.measure}, 평소(아무 날)와 비교하면?`,
          options: [{ key: "up", label: "▲ 더 자주 오른다", cls: "is-up" }, { key: "same", label: "평소와 같다" }, { key: "down", label: "▼ 더 자주 내린다", cls: "is-down" }],
          answer: ANS(q),
          explain() {
            const p = el("p", "qz-explain");
            const d = q.periods.design, v = q.periods.validation;
            p.append(`2021년까지: 오른 비율 ${pct1(d.signal.up_share)} (평소 ${pct1(d.base.up_share)}, ${d.signal.n}번) · `,
              `2022년부터: ${pct1(v.signal.up_share)} (평소 ${pct1(v.base.up_share)}, ${v.signal.n}번). `,
              q.verdict === "effect" ? "두 구간 모두 같은 쪽으로 뚜렷했습니다." : "두 구간 모두에서 확인된 차이는 없었습니다.");
            return p;
          },
        };
      }, { done: "세 문제 끝! 아래 결과 카드에서 숫자를 자세히 볼 수 있어요." });
    },

    /* 7번: 지금 이 시간, 그리고 가장 출렁이는 시간 */
    clock() {
      const D = window.CLOCK_DATA;
      if (!D) return;
      const W = D.weekdays, base = D.base.all.swing;
      const cell = (w, h) => D.cells[w * 24 + h];
      const label = (c) => `${W[c.w]}요일 ${String(c.h).padStart(2, "0")}시`;
      const now = new Date(Date.now() + 9 * 3600000);
      const cur = cell((now.getUTCDay() + 6) % 7, now.getUTCHours());
      const sorted = [...D.cells].sort((a, b) => b.all.swing - a.all.swing);
      const top = sorted[0];
      const decoys = [sorted[sorted.length - 1], sorted[Math.floor(sorted.length / 2)], sorted[20]].filter((c) => c !== top);
      const choices4 = [top, ...decoys.slice(0, 3)].sort((a, b) => a.w * 24 + a.h - (b.w * 24 + b.h));
      const qs = [
        {
          text: `지금은 한국 시간 ${label(cur)}. 이 시간 비트코인 1시간봉은 평소보다?`,
          options: [{ key: "more", label: "더 출렁인다" }, { key: "same", label: "비슷하다" }, { key: "less", label: "더 조용하다" }],
          answer: cur.verdict.swing === "verified" ? (cur.sign.swing > 0 ? "more" : "less") : "same",
          explain() {
            const p = el("p", "qz-explain");
            p.append(`이 시간 출렁임은 평소의 ${(cur.all.swing / base).toFixed(2)}배. `,
              cur.verdict.swing === "verified" ? "2022년까지와 2023년 이후 모두 같은 쪽으로 뚜렷했습니다." : "두 구간 모두에서 뚜렷한 차이는 확인되지 않았습니다.");
            return p;
          },
        },
        {
          text: "일주일 168시간 중 비트코인이 가장 크게 출렁이는 시간은? (한국 시간)",
          options: choices4.map((c) => ({ key: `${c.w}-${c.h}`, label: label(c) })),
          answer: `${top.w}-${top.h}`,
          explain() {
            const p = el("p", "qz-explain");
            p.append(`${label(top)} — 평소의 ${(top.all.swing / base).toFixed(2)}배. 미국 주식시장이 열리는 무렵입니다. 가장 조용한 시간은 ${label(sorted[sorted.length - 1])}(${(sorted[sorted.length - 1].all.swing / base).toFixed(2)}배).`);
            return p;
          },
        },
      ];
      play("clock", (i, peek) => (peek ? i < qs.length : qs[i] || null), { done: "두 문제 끝! 아래 지도에서 168칸을 직접 눌러 보세요." });
    },

    /* 1번: 실제 AI 판정, 24시간 뒤 맞았을까 */
    floor() {
      const D = window.RECORDS_DATA;
      if (!D) return;
      const pool = D.records.filter((r) => ["hit", "miss", "small"].includes(r.status));
      const seen = new Set();
      play("floor", (i, peek) => {
        const left = pool.filter((r) => !seen.has(r.at + r.symbol));
        if (peek) return left.length > 0;
        if (!left.length) return null;
        const r = pick(left);
        seen.add(r.at + r.symbol);
        const ctx = el("div", "qz-card");
        ctx.append(el("p", "qz-kicker", `${r.at} (한국 시각) · ${r.symbol}`),
          el("p", "qz-big", `${r.mode} 모드 판정: “${r.verdict}” · 확신도 ${r.confidence}%`),
          el("p", "qz-small", `판정가 $${num(r.price, r.price < 10 ? 4 : 2)} · 실제 AI 13명이 토론해서 낸 판정입니다`));
        return {
          context: ctx,
          text: "24시간 뒤, 이 판정은?",
          options: [{ key: "hit", label: "맞았다" }, { key: "small", label: "움직임이 작았다" }, { key: "miss", label: "빗나갔다" }],
          answer: r.status,
          explain() {
            const p = el("p", "qz-explain");
            p.append("24시간 뒤 ", signed(r.change), ` → ${r.label}. 규칙: ±1% 안이면 '움직임 작음', 관망은 움직임이 작아야 맞음.`);
            return p;
          },
        };
      }, { done: "공개된 판정을 모두 풀었어요. 아래 플레이 기록에서 전체를 볼 수 있어요." });
    },

    /* 2·5번: 실제 백테스트 거래 하나, 벌었을까 */
    trade(kind) {
      const D = kind === "rebound" ? window.REBOUND_DATA : window.BREAKOUT_DATA;
      if (!D || !D.assets) return;
      const assets = D.assets.filter((a) => a.backtest && a.backtest.trades && a.backtest.trades.length);
      if (!assets.length) return;
      const why = kind === "rebound"
        ? (t) => (t.side === 1 ? "200일선 위(상승 흐름)인데 25일선보다 2 ATR 넘게 떨어져서, 되돌아오길 기대하고 롱" : "200일선 아래(하락 흐름)인데 25일선보다 2 ATR 넘게 올라서, 되돌아오길 기대하고 숏")
        : (t) => (t.side === 1 ? "종가가 어제까지 20일 최고가를 넘어서, 오르는 흐름을 따라 롱" : "종가가 어제까지 20일 최저가 아래로 빠져서, 내리는 흐름을 따라 숏");
      const REASON = { mean: "25일선 복귀", trend: "200일선 이탈", timeout: "10개 봉 경과", stop: "손절", gap_stop: "갭 손절", trailing_stop: "추적 손절" };
      play(kind, (i, peek) => {
        if (peek) return true;
        const a = pick(assets), t = pick(a.backtest.trades);
        const ctx = el("div", "qz-card");
        ctx.append(el("p", "qz-kicker", `${a.name} · ${t.signal_date} 종가에 신호 → ${t.entry_date} 시가에 진입`),
          el("p", "qz-big", `${t.side === 1 ? "롱(오르면 이득)" : "숏(내리면 이득)"} · 진입가 ${num(t.entry)} ${a.currency}`),
          el("p", "qz-small", `왜? ${why(t)}`));
        return {
          context: ctx,
          text: "수수료·비용을 빼고, 이 거래는?",
          options: [{ key: "win", label: "벌었다" }, { key: "lose", label: "잃었다" }],
          answer: t.net > 0 ? "win" : "lose",
          explain() {
            const p = el("p", "qz-explain");
            const s = a.backtest;
            p.append(`${t.exit_date} ${REASON[t.reason] || t.reason}로 청산 (${t.bars}개 봉) · 순손익 `, signed(t.net, ` ${a.currency}`),
              `. 이 기계는 ${a.name}에서 ${s.count}번 중 ${s.win_rate == null ? "-" : num(s.win_rate, 1) + "%"} 벌었습니다.`);
            return p;
          },
        };
      }, { nextLabel: "다른 거래" });
    },
    rebound() { KINDS.trade("rebound"); },
    breakout() { KINDS.trade("breakout"); },

    /* 3번: 게이지를 가리고, 지금 김프 맞히기 */
    kimchi() {
      const panel = document.querySelector(".gauge-panel");
      let revealed = false;
      try { revealed = sessionStorage.getItem("quiz-kimchi-seen") === "1"; } catch { /* */ }
      const reveal = () => {
        revealed = true;
        if (panel) panel.classList.remove("is-masked");
        try { sessionStorage.setItem("quiz-kimchi-seen", "1"); } catch { /* */ }
      };
      if (!revealed && panel) panel.classList.add("is-masked");

      const start = (live) => {
        if (revealed) { box.textContent = ""; box.append(el("p", "qz-text", "이번 방문에서는 이미 봤어요. 새로 열면 다시 맞혀 볼 수 있어요.")); return; }
        const v = live.premium;
        const skip = el("button", "qz-skip", "맞히지 않고 바로 보기");
        skip.type = "button";
        skip.addEventListener("click", () => { reveal(); box.textContent = ""; box.append(el("p", "qz-text", "게이지를 열었어요.")); });
        play("kimchi", (i, peek) => (peek ? false : i === 0 ? {
          text: "업비트 비트코인은 지금 바이낸스보다 비쌀까, 쌀까? (환율 반영, ±0.5% 안이면 '거의 같다')",
          options: [{ key: "up", label: "▲ 비싸다", cls: "is-up" }, { key: "zero", label: "거의 같다" }, { key: "down", label: "▼ 싸다", cls: "is-down" }],
          answer: v > 0.5 ? "up" : v < -0.5 ? "down" : "zero",
          explain() {
            const p = el("p", "qz-explain");
            p.append("지금 김치 프리미엄 ", signed(v), ". 아래 게이지를 열었어요.");
            return p;
          },
        } : null), { onAnswer: () => { reveal(); skip.remove(); } });
        box.append(skip);
      };
      if (window.KIMCHI_LIVE) start(window.KIMCHI_LIVE);
      else {
        box.textContent = "";
        box.append(el("p", "qz-text", "지금 시세를 받는 중…"));
        document.addEventListener("kimchi:update", (e) => { if (!box.dataset.started) { box.dataset.started = "1"; start(e.detail); } }, { once: true });
        setTimeout(() => { if (!window.KIMCHI_LIVE) { reveal(); box.textContent = ""; box.append(el("p", "qz-text", "시세를 받지 못해 문제를 낼 수 없어요. 게이지를 확인해 주세요.")); } }, 15000);
      }
    },
  };

  const kind = root.dataset.quiz;
  if (KINDS[kind]) KINDS[kind]();
})();
