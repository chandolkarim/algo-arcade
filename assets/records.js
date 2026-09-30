/* TRADING FLOOR 플레이 기록 — records/build.py가 만든 window.RECORDS_DATA를 목록으로 그린다. */
(() => {
  const data = window.RECORDS_DATA;
  const $ = (id) => document.getElementById(id);
  const summaryEl = $("rc-summary");
  if (!summaryEl) return;
  if (!data) {
    summaryEl.textContent = "기록 파일을 찾지 못했습니다. records/build.py를 먼저 실행하세요.";
    return;
  }

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  // 한국 관례: 오름 빨강 ▲, 내림 파랑 ▼
  const move = (v) => {
    const t = Math.abs(v).toFixed(2);
    if (t === "0.00") return el("span", "", "0.00%");
    return v > 0 ? el("span", "up", `▲ +${t}%`) : el("span", "down", `▼ −${t}%`);
  };
  const money = (v, cur) => (cur === "KRW" ? `${Math.round(v).toLocaleString("ko-KR")}원`
    : `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 4 : 2 })}`);

  const GROUP = { hit: "맞음", miss: "빗나감", small: "움직임 작음", pending: "대기", unsupported: "대조 안 함", failed: "확인 실패" };
  const s = data.summary;
  const judged = (s.hit || 0) + (s.miss || 0) + (s.small || 0);
  summaryEl.textContent =
    `공개 기록 ${data.counts.public}건 중 자동 대조 ${judged}건: 맞음 ${s.hit || 0} · 빗나감 ${s.miss || 0} · 움직임 작음 ${s.small || 0}` +
    (s.unsupported ? ` / 주식 ${s.unsupported}건은 대조하지 않음` : "") +
    (s.pending ? ` / 24시간 대기 ${s.pending}건` : "") +
    (s.failed ? ` / 가격 확인 실패 ${s.failed}건` : "") + ". 표본이 작아 적중률로 해석하지 않습니다.";

  const list = $("rc-list");
  const count = $("rc-count");
  const render = (mode) => {
    list.textContent = "";
    const rows = data.records.filter((r) => !mode || r.mode === mode);
    count.textContent = rows.length ? `${mode || "전체"} ${rows.length}건` : "";
    if (!rows.length) {
      list.append(el("li", "rc-empty", `${mode} 모드의 공개 기록이 없습니다.`));
      return;
    }
    rows.forEach((r) => {
      const li = el("li", "rc-item");
      const head = el("p", "rc-head");
      head.append(el("span", "rc-date", r.at), el("b", "", r.symbol), el("span", "", `${r.mode} · ${r.verdict} · 확신도 ${r.confidence}%`));
      const body = el("p", "rc-body");
      body.append(el("span", "", `판정가 ${money(r.price, r.currency)}`));
      if (r.change != null) {
        const after = el("span", "");
        after.append("24시간 뒤 ", move(r.change));
        body.append(after);
      }
      body.append(el("span", `rc-chip is-${r.status}`, `${GROUP[r.status]} · ${r.label}`));
      li.append(head, body);
      if (r.memo) li.append(el("p", "rc-memo", r.memo));
      list.append(li);
    });
  };

  const filter = $("rc-filter");
  filter.hidden = false;
  filter.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    filter.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    render(btn.dataset.mode);
  });
  render("");

  const made = new Date(data.generated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
  $("rc-meta").textContent =
    `데이터: ${data.source} · 공개 ${data.counts.public}개, 비공개 ${data.counts.hidden}개 제외 · ` +
    `24시간 뒤 가격: ${data.rule.price} · 생성 ${made} (한국 시각)`;
})();
