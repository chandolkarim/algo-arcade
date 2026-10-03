/* 알고리즘 오락실 — 픽셀 그림을 글자 지도로 그린다.
   그림은 모두 장식(aria-hidden)이라 JavaScript가 꺼져 있어도 내용은 그대로 읽힌다. */
(() => {
  const NS = "http://www.w3.org/2000/svg";

  const INK = "#1b1438";
  const SKIN = "#ffd2b0";

  // 글자 하나 = 픽셀 하나. "." 은 투명.
  const SPRITES = {
    trader: [
      "..hhhh..",
      ".hhhhhh.",
      ".hsssss.",
      ".skssks.",
      ".ssssss.",
      "..cccc..",
      ".cwccwc.",
      "sccccccs",
      ".cccccc.",
      ".kk..kk.",
    ],
    boss: [
      "..hhhh..",
      ".hhhhhh.",
      ".hsssss.",
      ".skssks.",
      ".ssssss.",
      "..cwwc..",
      ".ccwtcc.",
      "sccctccs",
      ".cccccc.",
      ".kk..kk.",
    ],
    coin: [
      "..yyyy..",
      ".yooooy.",
      "yoyyyyoy",
      "yoyooyoy",
      "yoyooyoy",
      "yoyyyyoy",
      ".yooooy.",
      "..yyyy..",
    ],
  };

  const rectsFor = (map, palette, ox = 0, oy = 0) => {
    let out = "";
    map.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        if (ch === ".") { x += 1; continue; }
        let run = 1;
        while (row[x + run] === ch) run += 1;
        const fill = palette[ch] || INK;
        out += `<rect x="${ox + x}" y="${oy + y}" width="${run}" height="1" fill="${fill}"/>`;
        x += run;
      }
    });
    return out;
  };

  const svg = (w, h, inner) =>
    `<svg xmlns="${NS}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${inner}</svg>`;

  const person = (hair, shirt, x, y, kind = "trader", tie = "#ff4d6d") =>
    rectsFor(SPRITES[kind], { h: hair, s: SKIN, k: INK, c: shirt, w: "#ffffff", t: tie }, x, y);

  // 양봉·음봉. 한국 관례대로 오름은 빨강, 내림은 파랑.
  const candles = (x0, baseY, list, gap = 3) => {
    let out = "";
    list.forEach(([open, close, hi, lo], i) => {
      const x = x0 + i * gap;
      const up = close >= open;
      const color = up ? "#ff4d6d" : "#3ea1ff";
      const top = baseY - Math.max(open, close);
      const h = Math.max(1, Math.abs(close - open));
      out += `<rect x="${x + 0.5}" y="${baseY - hi}" width="1" height="${hi - lo}" fill="${color}" opacity=".7"/>`;
      out += `<rect x="${x}" y="${top}" width="2" height="${h}" fill="${color}"/>`;
    });
    return out;
  };

  const CHART = [
    [4, 6, 7, 3], [6, 5, 7, 4], [5, 8, 9, 5], [8, 10, 11, 7], [10, 9, 11, 8],
    [9, 7, 10, 6], [7, 9, 10, 6], [9, 12, 13, 8], [12, 11, 14, 10], [11, 14, 15, 11],
    [14, 13, 15, 12], [13, 15, 17, 12],
  ];

  // 기계 화면: 시세판 아래 책상에 트레이더 셋
  const miniFloor = () => {
    let s = `<rect width="64" height="48" fill="#0f0b24"/>`;
    for (let y = 4; y < 26; y += 4) s += `<rect x="4" y="${y}" width="56" height="1" fill="#231c4a"/>`;
    s += candles(8, 25, CHART.slice(0, 11), 4.4);
    s += `<g class="bob">${person("#6b3b1f", "#3ce0a8", 10, 30)}</g>`;
    s += `<g class="bob bob-late">${person("#1b1438", "#ffd23f", 28, 30, "boss")}</g>`;
    s += `<g class="bob">${person("#ff85c0", "#3ea1ff", 46, 30)}</g>`;
    s += `<rect x="0" y="38" width="64" height="10" fill="#8a5a3c"/><rect x="0" y="38" width="64" height="1" fill="#b27a52"/>`;
    s += `<rect x="14" y="36" width="6" height="3" fill="#3ea1ff"/><rect x="32" y="36" width="6" height="3" fill="#ff4d6d"/><rect x="50" y="36" width="6" height="3" fill="#3ce0a8"/>`;
    return svg(64, 48, s);
  };

  // 김프 게이지 화면: 원화 동전과 달러 동전 사이의 눈금과 바늘
  const miniGauge = () => {
    let s = `<rect width="64" height="48" fill="#0f0b24"/>`;
    const segs = ["#1f5fa8", "#3ea1ff", "#3a3170", "#ff4d6d", "#b3163c"];
    segs.forEach((c, i) => { s += `<rect x="${7 + i * 10}" y="12" width="10" height="6" fill="${c}"/>`; });
    s += `<rect x="6" y="11" width="52" height="1" fill="${INK}"/><rect x="6" y="18" width="52" height="1" fill="${INK}"/>`;
    s += `<g class="bob"><rect x="35" y="8" width="3" height="14" fill="#ffd23f"/></g>`;
    // 양쪽 거래소의 동전 더미. 빨강·파랑은 시세 방향에만 쓰므로 동전은 노랑.
    const gold = { y: "#ffd23f", o: "#e09a1a" };
    s += rectsFor(SPRITES.coin, gold, 8, 28);
    s += rectsFor(SPRITES.coin, gold, 8, 32);
    s += rectsFor(SPRITES.coin, gold, 48, 32);
    s += `<rect x="24" y="36" width="16" height="2" fill="#bfb5ea"/><rect x="24" y="36" width="2" height="2" fill="#ffd23f"/><rect x="38" y="36" width="2" height="2" fill="#ffd23f"/>`;
    return svg(64, 48, s);
  };

  // 외국인 매매 화면: 하루하루 순매수 막대와 "다음 날은?" 물음표
  const miniFlow = () => {
    let s = `<rect width="64" height="48" fill="#0f0b24"/>`;
    s += `<rect x="4" y="22" width="44" height="1" fill="#bfb5ea"/>`;
    // 빨강·파랑은 시세 방향에만 쓰므로 매수는 민트, 매도는 연보라
    [6, -3, 9, 4, -7, 11, -2, 5].forEach((h, i) => {
      const x = 6 + i * 5;
      s += h > 0
        ? `<rect x="${x}" y="${22 - h}" width="3" height="${h}" fill="#3ce0a8"/>`
        : `<rect x="${x}" y="23" width="3" height="${-h}" fill="#bfb5ea"/>`;
    });
    s += rectsFor(["yyy.", "...y", "..y.", "....", "..y."], { y: "#ffd23f" }, 52, 16);
    s += `<g class="bob">${person("#1b1438", "#ff85c0", 28, 34)}</g>`;
    return svg(64, 48, s);
  };

  // 상세 페이지 큰 화면: 전광판과 책상 한 줄
  const bigFloor = () => {
    const W = 160, H = 70;
    let s = `<rect width="${W}" height="${H}" fill="#0f0b24"/>`;
    s += `<rect x="8" y="4" width="144" height="30" fill="#161036"/><rect x="8" y="4" width="144" height="1" fill="#3a2f78"/>`;
    for (let y = 9; y < 32; y += 5) s += `<rect x="10" y="${y}" width="140" height="1" fill="#211a48"/>`;
    s += candles(14, 31, [...CHART, ...CHART.slice(3, 11)].map(([o, c, h, l], i) => [o + (i > 11 ? 3 : 0), c + (i > 11 ? 3 : 0), h + (i > 11 ? 3 : 0), l + (i > 11 ? 3 : 0)]), 6.6);
    const crew = [
      ["#6b3b1f", "#3ce0a8"], ["#ffd23f", "#ff85c0"], ["#1b1438", "#3ea1ff"],
      ["#c0c0d8", "#ffd23f", "boss"], ["#ff85c0", "#3ce0a8"], ["#6b3b1f", "#ff4d6d"], ["#3ea1ff", "#f3eeff"],
    ];
    crew.forEach(([hair, shirt, kind], i) => {
      const x = 10 + i * 21;
      s += `<g class="bob${i % 2 ? " bob-late" : ""}">${person(hair, shirt, x, 42, kind || "trader")}</g>`;
    });
    s += `<rect x="0" y="50" width="${W}" height="20" fill="#8a5a3c"/><rect x="0" y="50" width="${W}" height="1" fill="#b27a52"/>`;
    for (let i = 0; i < 7; i += 1) {
      const x = 10 + i * 21;
      s += `<rect x="${x - 1}" y="47" width="10" height="4" fill="#2a2256"/><rect x="${x}" y="48" width="8" height="2" fill="${["#3ce0a8", "#ff4d6d", "#3ea1ff"][i % 3]}"/>`;
    }
    return svg(W, H, s);
  };

  const crewSprite = (hair, shirt, kind) => svg(8, 10, person(hair, shirt, 0, 0, kind || "trader"));

  // 그리기
  document.querySelectorAll("[data-scene]").forEach((el) => {
    const scene = el.dataset.scene;
    if (scene === "mini-floor") el.innerHTML = miniFloor();
    if (scene === "big-floor") el.innerHTML = bigFloor();
    if (scene === "mini-gauge") el.innerHTML = miniGauge();
    if (scene === "mini-flow") el.innerHTML = miniFlow();
    if (scene === "coin") el.innerHTML = svg(8, 8, rectsFor(SPRITES.coin, { y: "#ffd23f", o: "#e09a1a" }));
    if (scene === "maker") el.innerHTML = svg(8, 10, person("#1b1438", "#ff85c0", 0, 0));
    if (scene === "crew") el.innerHTML = crewSprite(el.dataset.hair, el.dataset.shirt, el.dataset.kind);
  });

  // 현재 보고 있는 영역을 메뉴에 표시
  const navLinks = [...document.querySelectorAll(".site-nav a[href^='#']")];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!hit) return;
      navLinks.forEach((a) => {
        if (a.getAttribute("href") === `#${hit.target.id}`) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    }, { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25] });
    sections.forEach((s) => io.observe(s));
  }
  // 결과 페이지 머리: "마지막 계산" 날짜를 같은 자리에 (데이터 스크립트가 다 읽힌 뒤)
  // 데이터를 나중에 새로 받은 페이지(3번 김프 기록)도 다시 부를 수 있게 이름을 붙여 둔다
  window.showUpdated = () => {
    document.querySelectorAll("[data-updated]").forEach((el) => {
      const at = window[el.dataset.updated]?.generated_at;
      if (!at) { el.hidden = true; return; }
      const t = new Date(at);
      const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(t);
      const days = Math.floor((Date.now() - t.getTime()) / 86400000);
      // 갱신 방식 안내는 둘째 줄로: 좁은 화면에서 '·'가 줄 맨 앞에 오지 않게
      el.replaceChildren(`마지막 계산 ${when} (한국 시간)${days >= 1 ? ` · ${days}일 전` : ""}`,
        ...(el.dataset.note ? [document.createElement("br"), el.dataset.note] : []));
    });
  };
  document.addEventListener("DOMContentLoaded", window.showUpdated);
})();
