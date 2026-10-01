/* KIMCHI GAUGE 지난 기록 — kimchi/record.py가 쌓은 window.KIMCHI_HISTORY를 그린다. */
(() => {
  const box = document.getElementById("kh-body");
  if (!box) return;
  const data = window.KIMCHI_HISTORY;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const kst = (iso) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  // 한국 관례: 김프(+) 빨강 ▲, 역프(−) 파랑 ▼
  const signed = (v) => {
    const t = Math.abs(v).toFixed(2);
    if (t === "0.00") return el("span", "", "0.00%");
    return v > 0 ? el("span", "up", `▲ +${t}%`) : el("span", "down", `▼ −${t}%`);
  };

  box.textContent = "";
  const points = (data && data.points) || [];
  if (!points.length) {
    box.append(el("p", "empty-note", "아직 기록이 없습니다. 사이트가 배포되면 1시간 안에 첫 기록이 생깁니다."));
    return;
  }

  // 최근 7일 막대 그래프: 가로축은 실제 시각(1칸 = 1시간). 기록이 빠진 시간은 비워 둔다.
  // 0% 기준선 위는 김프, 아래는 역프
  const HOUR = 3600000, SPAN = 7 * 24;
  const end = Math.max(Date.now(), new Date(points[points.length - 1].t).getTime());
  const start = end - SPAN * HOUR;
  const week = points.filter((p) => new Date(p.t).getTime() >= start);
  const shown = week.length ? week : points.slice(-1);
  const W = 336, H = 96, mid = H / 2, slot = W / SPAN;
  const max = Math.max(0.5, ...shown.map((p) => Math.abs(p.kp)));
  let bars = `<rect x="0" y="${mid}" width="${W}" height="1" fill="currentColor" opacity=".35"/>`;
  for (let d = 1; d < 7; d++) bars += `<rect x="${(d * 24 * slot).toFixed(2)}" y="0" width="1" height="${H}" fill="currentColor" opacity=".12"/>`;
  shown.forEach((p) => {
    const x = Math.max(0, Math.min(W - slot, ((new Date(p.t).getTime() - start) / HOUR) * slot));
    const h = Math.max(1, Math.round((Math.abs(p.kp) / max) * (mid - 4)));
    const y = p.kp >= 0 ? mid - h : mid + 1;
    bars += `<rect x="${x.toFixed(2)}" y="${y}" width="${Math.max(1, slot).toFixed(2)}" height="${h}" fill="${p.kp >= 0 ? "#c8163f" : "#1360c4"}"/>`;
  });
  const hours = shown.length;
  const fig = el("figure", "kh-chart");
  fig.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 7일 김치 프리미엄 막대 그래프. 168시간 중 ${hours}시간에 기록이 있습니다." preserveAspectRatio="none">${bars}</svg>`;
  fig.append(el("figcaption", "", `최근 7일(가로 = 시각, 세로 점선 = 하루) · 168시간 중 ${hours}시간 기록 · 빈 곳은 예약 실행이 빠진 시간 · 위(빨강 ▲) 김프, 아래(파랑 ▼) 역프 · 세로 끝 ±${max.toFixed(2)}%`));
  box.append(fig);

  const kps = points.map((p) => p.kp);
  const last = points[points.length - 1];
  const dl = el("dl", "kh-stats");
  const add = (k, v) => { dl.append(el("dt", "", k)); const dd = el("dd"); dd.append(v); dl.append(dd); };
  add("기록", document.createTextNode(`${points.length}개 (${kst(points[0].t)} ~ ${kst(last.t)})`));
  add("마지막 기록", signed(last.kp));
  add("30일 최고", signed(Math.max(...kps)));
  add("30일 최저", signed(Math.min(...kps)));
  add("30일 평균", signed(kps.reduce((a, b) => a + b, 0) / kps.length));
  box.append(dl);

  const made = new Date(data.generated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
  box.append(el("p", "kh-meta", `생성 ${made} (한국 시각)`));
  if (data.last_error) box.append(el("p", "kh-meta kh-error", `최근 실행 실패: ${data.last_error}. 기존 기록은 그대로 둡니다.`));
})();
