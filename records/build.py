"""TRADING FLOOR 플레이 기록 — 구글 시트(또는 저장소 CSV)를 읽어 검사하고 24시간 뒤 결과를 붙인다.

- 데이터 입구: 환경 변수 SHEET_CSV_URL(구글 시트 '웹에 게시' CSV 주소). 없으면 records/records.csv.
- 잘못된 행이 하나라도 있으면 이유와 행 번호를 출력하고 멈춘다(배포하지 않는다).
- 코인 기록은 판정 24시간 뒤 바이낸스 현물 가격으로 등락을 계산해 원본 기계와 같은 규칙으로 판정한다.
  주식 기록은 자동 대조하지 않는다.
- 공개=Y인 행만 내보낸다. 비공개 행은 개수만 남긴다.

실행: python3 records/build.py            (시트 주소는 SHEET_CSV_URL 또는 --csv 로)
      python3 records/build.py --offline  (가격 조회 없이 검사만)
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import argparse
import csv
import io
import json
import os
import sys
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent
KST = timezone(timedelta(hours=9))
HORIZON = timedelta(hours=24)
FLAT = 1.0  # 원본 report.js judge()와 같은 기준: ±1% 미만은 '움직임 작음'
BINANCE = "https://data-api.binance.vision/api/v3/klines?symbol={pair}&interval=1m&startTime={ms}&limit=1"

REQUIRED = ["일시", "모드", "종목", "판정", "확신도", "판정가", "통화", "공개"]
VERDICTS = {"알고리즘": {"매수", "매도", "관망"}, "스캘핑": {"롱", "숏", "패스"}, "공격": {"롱", "숏"}}
DIRECTION = {"매수": "BUY", "롱": "BUY", "매도": "SELL", "숏": "SELL", "관망": "HOLD", "패스": "HOLD"}
COINS = {"BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT"}


class DataError(Exception):
    pass


# ---------- 읽기 ----------

def read_source(csv_arg):
    url = os.environ.get("SHEET_CSV_URL", "").strip()
    if csv_arg:
        return Path(csv_arg).read_text(encoding="utf-8-sig"), f"CSV 파일({Path(csv_arg).name})"
    if url:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0 AlgoArcade/1.0"})
        with urlopen(req, timeout=30) as res:
            text = res.read().decode("utf-8-sig")
        if text.lstrip().lower().startswith(("<!doctype", "<html")):
            raise DataError("CSV 대신 웹페이지가 왔습니다. 편집 주소가 아니라 '웹에 게시'한 CSV 주소(output=csv)인지 확인하세요.")
        return text, "구글 시트(웹에 게시한 CSV)"
    return (ROOT / "records.csv").read_text(encoding="utf-8-sig"), "저장소 CSV(records/records.csv)"


# ---------- 검사 (순수 함수) ----------

def parse(text):
    """CSV 글자를 검사해 행 목록을 돌려준다. 문제가 있으면 모두 모아 DataError로 멈춘다."""
    reader = csv.DictReader(io.StringIO(text))
    header = [h.strip() for h in (reader.fieldnames or [])]
    missing = [h for h in REQUIRED if h not in header]
    if missing:
        raise DataError(f"필수 열이 없습니다: {', '.join(missing)} / 현재 열: {', '.join(header)}")

    rows, errors = [], []
    for line, raw in enumerate(reader, start=2):  # 1행은 열 이름
        r = {k.strip(): (v or "").strip() for k, v in raw.items() if k}
        if not any(r.values()):
            continue  # 완전히 빈 행은 건너뛴다
        problems = []
        try:
            at = datetime.strptime(r["일시"], "%Y-%m-%d %H:%M").replace(tzinfo=KST)
        except ValueError:
            problems.append("일시는 2026-08-24 22:06 형식이어야 합니다")
            at = None
        mode, verdict = r["모드"], r["판정"]
        if mode not in VERDICTS:
            problems.append(f"모드는 {'/'.join(VERDICTS)} 중 하나여야 합니다")
        elif verdict not in VERDICTS[mode]:
            problems.append(f"{mode} 모드의 판정은 {'/'.join(sorted(VERDICTS[mode]))} 중 하나여야 합니다")
        try:
            conf = int(r["확신도"])
            if not 0 <= conf <= 100:
                raise ValueError
        except ValueError:
            problems.append("확신도는 0~100 사이 정수여야 합니다")
            conf = None
        try:
            price = float(r["판정가"].replace(",", ""))
            if price <= 0:
                raise ValueError
        except ValueError:
            problems.append("판정가는 0보다 큰 숫자여야 합니다")
            price = None
        if r["통화"] not in ("USD", "KRW"):
            problems.append("통화는 USD 또는 KRW여야 합니다")
        if r["공개"] not in ("Y", "N"):
            problems.append("공개는 Y 또는 N이어야 합니다")
        if not r["종목"]:
            problems.append("종목이 비어 있습니다")
        if problems:
            errors.append(f"{line}행: " + " · ".join(problems))
            continue
        rows.append({"at": at, "mode": mode, "symbol": r["종목"], "verdict": verdict, "confidence": conf,
                     "price": price, "currency": r["통화"], "memo": r.get("메모", ""), "public": r["공개"] == "Y"})
    if errors:
        raise DataError("잘못된 행이 있습니다.\n" + "\n".join(errors))
    if not any(r["public"] for r in rows):
        raise DataError("공개 열이 Y인 행이 없습니다.")
    return rows


def judge(direction, change):
    """원본 trading-floor/server/report.js judge()와 같은 규칙. (분류, 문장)을 돌려준다."""
    flat = abs(change) < FLAT
    if direction == "HOLD":
        return ("hit", "관망이 적중") if flat else ("miss", "관망하는 사이 움직임이 있었음")
    if flat:
        return "small", "방향을 잡기엔 움직임이 작았음"
    right = (change > 0) == (direction == "BUY")
    return ("hit", "방향이 맞았음") if right else ("miss", "방향이 틀렸음")


# ---------- 24시간 뒤 가격 ----------

def price_after(symbol, at):
    ms = int((at + HORIZON).timestamp() * 1000)
    req = Request(BINANCE.format(pair=f"{symbol}USDT", ms=ms), headers={"User-Agent": "Mozilla/5.0 AlgoArcade/1.0"})
    with urlopen(req, timeout=20) as res:
        rows = json.load(res)
    if not rows:
        raise ValueError("캔들 없음")
    return float(rows[0][1])  # 24시간 뒤 1분봉 시가


def outcome(row, now, offline):
    if row["symbol"] not in COINS or row["currency"] != "USD":
        return {"status": "unsupported", "label": "자동 대조 안 함(주식)"}
    if now < row["at"] + HORIZON:
        return {"status": "pending", "label": "24시간 대기 중"}
    if offline:
        return {"status": "failed", "label": "가격 조회 안 함(오프라인)"}
    try:
        after = price_after(row["symbol"], row["at"])
    except Exception as err:  # 조회 실패는 기록만 하고 계속한다
        print(f"경고: {row['symbol']} {row['at']:%m-%d %H:%M} 24시간 뒤 가격 조회 실패({err})", file=sys.stderr)
        return {"status": "failed", "label": "가격 조회 실패"}
    change = (after - row["price"]) / row["price"] * 100
    kind, label = judge(DIRECTION[row["verdict"]], change)
    return {"status": kind, "label": label, "change": round(change, 2), "price_after": after}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="시트 대신 읽을 CSV 파일")
    ap.add_argument("--offline", action="store_true", help="24시간 뒤 가격을 조회하지 않음")
    args = ap.parse_args()
    try:
        text, source = read_source(args.csv)
        rows = parse(text)
    except DataError as err:
        print(f"멈춤: {err}", file=sys.stderr)
        sys.exit(1)

    now = datetime.now(KST)
    public = [r for r in rows if r["public"]]
    records = []
    for r in sorted(public, key=lambda r: r["at"], reverse=True):
        records.append({"at": r["at"].strftime("%Y-%m-%d %H:%M"), "mode": r["mode"], "symbol": r["symbol"],
                        "verdict": r["verdict"], "confidence": r["confidence"], "price": r["price"],
                        "currency": r["currency"], "memo": r["memo"]} | outcome(r, now, args.offline))
    summary = {}
    for rec in records:
        summary[rec["status"]] = summary.get(rec["status"], 0) + 1

    out = {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "counts": {"public": len(public), "hidden": len(rows) - len(public)},
        "rule": {"horizon_hours": 24, "flat_percent": FLAT, "price": "바이낸스 현물 USDT 1분봉 시가"},
        "summary": summary,
        "records": records,
    }
    text = json.dumps(out, ensure_ascii=False, indent=2, allow_nan=False)
    (SITE / "data").mkdir(exist_ok=True)
    (SITE / "data" / "records.json").write_text(text + "\n", encoding="utf-8")
    (SITE / "data" / "records-data.js").write_text(f"window.RECORDS_DATA = {text};\n", encoding="utf-8")
    print(f"데이터: {source} · 공개 {len(public)}개 · 비공개 {len(rows) - len(public)}개 · 결과 {summary}")


if __name__ == "__main__":
    main()
