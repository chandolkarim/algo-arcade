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

  // 최근 7일 막대 그래프: 0% 기준선 위는 김프, 아래는 역프
  const week = points.filter((p) => new Date(p.t) >= new Date(Date.now() - 7 * 86400000));
  const shown = week.length ? week : points.slice(-1);
  const W = 336, H = 96, mid = H / 2;
  const max = Math.max(0.5, ...shown.map((p) => Math.abs(p.kp)));
  const bw = Math.max(1, Math.floor(W / Math.max(shown.length, 24)));
  let bars = `<rect x="0" y="${mid}" width="${W}" height="1" fill="currentColor" opacity=".35"/>`;
  shown.forEach((p, i) => {
    const h = Math.max(1, Math.round((Math.abs(p.kp) / max) * (mid - 4)));
    const y = p.kp >= 0 ? mid - h : mid + 1;
    bars += `<rect x="${i * bw}" y="${y}" width="${Math.max(1, bw - 1)}" height="${h}" fill="${p.kp >= 0 ? "#c8163f" : "#1360c4"}"/>`;
  });
  const fig = el("figure", "kh-chart");
  fig.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 7일 1시간 간격 김치 프리미엄 막대 그래프, ${shown.length}개 기록" preserveAspectRatio="none">${bars}</svg>`;
  fig.append(el("figcaption", "", `최근 7일 · ${shown.length}개 기록 · 위(빨강 ▲)는 김프, 아래(파랑 ▼)는 역프 · 세로 끝 ±${max.toFixed(2)}%`));
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
