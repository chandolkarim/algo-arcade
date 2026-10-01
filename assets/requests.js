/* 의뢰 현황(window.REQUESTS_DATA)과 의뢰 양식 복사 버튼 */
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  const D = window.REQUESTS_DATA;
  const list = $("rq-list"), summary = $("rq-summary");
  if (list && summary) {
    if (!D) {
      summary.textContent = "의뢰 현황 파일을 찾지 못했습니다.";
    } else {
      const c = D.counts;
      summary.textContent = D.total
        ? `지금까지 ${D.total}건 · 접수 ${c["접수"]} · 진행 중 ${c["진행 중"]} · 완료 ${c["완료"]}. 공개에 동의한 의뢰만 보여요.`
        : "아직 받은 의뢰가 없어요. 첫 의뢰를 보내 주시면 여기에 올라가요.";
      const KIND = { "접수": "s-new", "진행 중": "s-doing", "완료": "s-done", "보류": "s-hold" };
      D.items.forEach((r) => {
        const li = el("li", "rq-item");
        li.append(el("span", `rq-status ${KIND[r.status] || ""}`, r.status));
        const main = el("div", "rq-main");
        main.append(el("strong", "", r.title), el("span", "rq-meta", `${r.date} · ${r.by}`));
        li.append(main);
        if (r.link) { const a = el("a", "rq-link", "결과 보기 →"); a.href = r.link; li.append(a); }
        list.append(li);
      });
      if (!D.items.length) {
        const li = el("li", "rq-item rq-empty");
        const a = el("a", "rq-link", "첫 의뢰 보내기 →"); a.href = "#request";
        li.append(el("span", "rq-status s-new", "대기"), el("div", "rq-main", "여기에 의뢰 전략이 올라와요"), a);
        list.append(li);
      }
    }
  }

  const btn = $("rq-copy"), tpl = $("rq-template"), msg = $("rq-copied");
  if (btn && tpl) {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(tpl.textContent);
        msg.textContent = "양식을 복사했어요. 메일에 붙여 넣어 wjdcksals24@hufs.ac.kr로 보내 주세요.";
      } catch {
        const range = document.createRange(); range.selectNodeContents(tpl);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        msg.textContent = "복사가 막혀 있어 양식을 선택해 두었어요. 직접 복사해 주세요.";
      }
    });
  }
})();
