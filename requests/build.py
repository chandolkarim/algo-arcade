"""전략 의뢰 현황 — requests/requests.csv를 검사해 공개할 줄만 data/requests.json으로 만든다.

- 의뢰는 메일로 받는다. 받은 의뢰를 이 CSV에 한 줄씩 직접 적는다(연락처는 적지 않는다).
- 공개=Y인 줄만 사이트에 나간다. 상태는 접수 / 진행 중 / 완료 / 보류.
- 잘못된 줄이 있으면 행 번호와 이유를 출력하고 멈춘다(주인이 쓰는 자료라 배포 전에 바로잡는다).

실행: python3 requests/build.py
"""
from datetime import date, datetime, timezone
from pathlib import Path
import csv
import io
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent
COLUMNS = ["접수일", "전략", "의뢰자", "상태", "결과", "공개"]
STATUS = ["접수", "진행 중", "완료", "보류"]


class DataError(Exception):
    pass


def parse(text):
    reader = csv.DictReader(io.StringIO(text))
    header = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in COLUMNS if c not in header]
    if missing:
        raise DataError(f"필수 열이 없습니다: {', '.join(missing)}")
    rows, errors = [], []
    for line, raw in enumerate(reader, start=2):
        r = {k.strip(): (v or "").strip() for k, v in raw.items() if k}
        if not any(r.values()):
            continue
        problems = []
        try:
            date.fromisoformat(r["접수일"])
        except ValueError:
            problems.append("접수일은 2026-10-01 형식")
        if not r["전략"] or len(r["전략"]) > 60:
            problems.append("전략 이름은 1~60자")
        if len(r["의뢰자"]) > 20 or "@" in r["의뢰자"] or re.search(r"\d{3,}", r["의뢰자"]):
            problems.append("의뢰자는 20자 이내 닉네임만(메일·전화번호 금지)")
        if r["상태"] not in STATUS:
            problems.append(f"상태는 {'/'.join(STATUS)} 중 하나")
        if r["결과"] and not re.match(r"^(machines/[\w-]+\.html|https://)", r["결과"]):
            problems.append("결과는 machines/이름.html 또는 https:// 주소")
        if r["상태"] == "완료" and not r["결과"]:
            problems.append("완료면 결과 주소가 있어야 함")
        if r["공개"] not in ("Y", "N"):
            problems.append("공개는 Y 또는 N")
        if problems:
            errors.append(f"{line}행: " + " · ".join(problems))
            continue
        rows.append({"date": r["접수일"], "title": r["전략"], "by": r["의뢰자"] or "익명",
                     "status": r["상태"], "link": r["결과"], "public": r["공개"] == "Y"})
    if errors:
        raise DataError("잘못된 줄이 있습니다.\n" + "\n".join(errors))
    return rows


def build(rows):
    public = sorted((r for r in rows if r["public"]), key=lambda r: r["date"], reverse=True)
    counts = {s: sum(1 for r in rows if r["status"] == s) for s in STATUS}
    return {"schema": 1, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "counts": counts, "total": len(rows),
            "items": [{k: r[k] for k in ("date", "title", "by", "status", "link")} for r in public]}


def main():
    try:
        rows = parse((ROOT / "requests.csv").read_text(encoding="utf-8-sig"))
    except DataError as err:
        print(f"멈춤: {err}", file=sys.stderr)
        sys.exit(1)
    out = build(rows)
    text = json.dumps(out, ensure_ascii=False, indent=2)
    (SITE / "data").mkdir(exist_ok=True)
    (SITE / "data" / "requests.json").write_text(text + "\n", encoding="utf-8")
    (SITE / "data" / "requests-data.js").write_text(f"window.REQUESTS_DATA = {text};\n", encoding="utf-8")
    print(f"의뢰 {out['total']}건 · 공개 {len(out['items'])}건 · {out['counts']}")


if __name__ == "__main__":
    main()
