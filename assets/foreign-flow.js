/* FOREIGN FLOW — foreign-flow/build.py가 만든 요약 통계(window.FOREIGN_FLOW_DATA)를 카드로 그린다. */
(() => {
  const data = window.FOREIGN_FLOW_DATA;
  const $ = (id) => document.getElementById(id);
  if (!data) {
    $("ff-summary").textContent = "계산 결과 파일을 찾지 못했습니다. foreign-flow/build.py를 먼저 실행하세요.";
    return;
  }

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  // 한국 관례: 오름 빨강 ▲, 내림 파랑 ▼. 기호를 함께 써서 색만으로 구분하지 않는다.
  const move = (x) => {
    const v = (x * 100).toFixed(2);
    if (v === "0.00" || v === "-0.00") return el("span", "", "0.00%");
    return x > 0 ? el("span", "up", `▲ +${v}%`) : el("span", "down", `▼ ${v.replace("-", "−")}%`);
  };
  const pval = (p) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

  const VERDICT = {
    effect: { label: "효과 있음", cls: "is-effect" },
    none: { label: "효과 미확인", cls: "is-none" },
    uncertain: { label: "불확실", cls: "is-uncertain" },
  };
  const split = data.rules.validation_start.slice(0, 4);
  const PERIODS = [
    ["design", `설계 구간 · ${data.range.first.slice(0, 4)}–${Number(split) - 1}`],
    ["validation", `검증 구간 · ${split}–${data.range.last.slice(0, 4)}`],
  ];

  const row = (dl, term, value) => {
    dl.append(el("dt", "", term));
    const dd = el("dd");
    dd.append(typeof value === "string" ? document.createTextNode(value) : value);
    dl.append(dd);
  };

  const card = (q) => {
    const sameDay = q.id === "same_day";
    const v = VERDICT[q.verdict];
    const box = el("article", `ff-card px-box${sameDay ? " is-trap" : ""}`);
    const head = el("div", "ff-card-head");
    head.append(el("h3", "", q.title));
    head.append(el("span", `ff-badge ${sameDay ? "is-trap" : v.cls}`, sameDay ? "동시 움직임 · 예측 아님" : v.label));
    box.append(head);
    box.append(el("p", "ff-rule", `신호: ${q.signal} → ${q.measure}`));

    const grid = el("div", "ff-periods");
    PERIODS.forEach(([key, label]) => {
      const p = q.periods[key];
      const part = el("div", "ff-period");
      part.append(el("h4", "", label));
      // 한눈에: 신호 뒤 오른 비율 vs 평소 오른 비율 (50% 눈금 포함)
      const bars = el("div", "ff-bars");
      [["신호 뒤", p.signal.up_share, "is-signal"], ["평소", p.base.up_share, "is-base"]].forEach(([name, v, cls]) => {
        const row = el("div", "ff-bar");
        const track = el("span", "ff-track");
        const fill = el("span", `ff-fill ${cls}`);
        fill.style.width = `${(v || 0) * 100}%`;
        track.append(fill, el("span", "ff-half"));
        row.append(el("span", "ff-bar-name", name), track, el("span", "ff-bar-val", pct(v)));
        bars.append(row);
      });
      part.append(bars);
      const dl = el("dl");
      row(dl, "신호 건수", `${p.signal.n.toLocaleString("ko-KR")}건`);
      row(dl, "오른 비율", pct(p.signal.up_share));
      row(dl, "기준선", pct(p.base.up_share));
      row(dl, "평균 등락", move(p.signal.mean));
      row(dl, "기준 평균", move(p.base.mean));
      row(dl, "p값", pval(p.p_value));
      part.append(dl);
      grid.append(part);
    });
    box.append(grid);
    box.append(el("p", "ff-reason", sameDay
      ? "같은 날에는 외국인 매수가 지수를 밀어 올린 결과가 그대로 잡혀 크게 나옵니다. 장이 끝난 뒤에야 알 수 있으니 예측에는 쓸 수 없습니다."
      : `판정 이유: ${q.verdict_reason}`));
    return box;
  };

  const list = $("ff-questions");
  data.questions.forEach((q) => list.append(card(q)));

  const predictive = data.questions.filter((q) => q.id !== "same_day");
  const effects = predictive.filter((q) => q.verdict === "effect").length;
  const sameDay = data.questions.find((q) => q.id === "same_day");
  const sd = sameDay && sameDay.periods.validation;
  $("ff-summary").textContent =
    `${data.range.first} ~ ${data.range.last}, ${data.range.days.toLocaleString("ko-KR")}거래일. ` +
    (sd ? `외국인이 순매수한 날은 그날 코스피가 ${pct(sd.signal.up_share)} 올랐지만(기준 ${pct(sd.base.up_share)}), ` : "") +
    `다음 날을 맞히는 질문 ${predictive.length}개 중 두 구간 모두에서 효과가 확인된 것은 ${effects}개입니다.`;
  $("ff-range-tag").textContent = `${data.range.first.slice(0, 4)}–${data.range.last.slice(0, 4)} · ${data.range.days.toLocaleString("ko-KR")}거래일`;

  const t = data.latest;
  const today = $("ff-today");
  today.textContent = "";
  const dl = el("dl", "ff-today");
  row(dl, "날짜", t.date);
  row(dl, "외국인", t.direction === "buy" ? "순매수" : t.direction === "sell" ? "순매도" : "변화 없음");
  row(dl, "표준화 값", t.z === null ? "-" : `${t.z > 0 ? "+" : ""}${t.z.toFixed(2)}`);
  row(dl, "연속 순매수", `${t.streak}일`);
  today.append(dl);
  const z = data.rules.z_threshold;
  const active = t.z !== null && Math.abs(t.z) >= z ? (t.z > 0 ? "대량 순매수" : "대량 순매도")
    : t.streak === data.rules.streak_days ? `${data.rules.streak_days}일 연속 순매수` : null;
  const ago = Math.floor((Date.now() - new Date(`${t.date}T15:30:00+09:00`).getTime()) / 86400000);
  const when = ago <= 1 ? "이날은" : `${ago}일 전인 이날은`;
  today.append(el("p", "ff-reason", active
    ? `${when} “${active}” 신호가 난 날입니다. 다만 위 결과처럼 과거에는 다음 날을 맞히는 힘이 확인되지 않았습니다.`
    : `${when} 신호(표준화 값 ±${z} 이상, ${data.rules.streak_days}일 연속 순매수)가 없는 날입니다.`));
})();
