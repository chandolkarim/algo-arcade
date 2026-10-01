"""KIMCHI GAUGE 기록 — 실행할 때마다 김치 프리미엄 한 건을 기록에 더한다(GitHub Actions가 1시간마다 실행).

기록은 저장소에 커밋하지 않는다. 이미 배포된 사이트의 기록 파일을 읽어 와 한 건을 붙이고,
새 사이트와 함께 다시 배포한다. 그래서 매시간 봇 커밋이 쌓이지 않는다.
시세를 받지 못하면 기존 기록을 그대로 두고 실패 사실만 남긴다(사이트 배포는 막지 않는다).
배포된 기록을 읽지 못하면(404 = 아직 배포 전 제외) 멈춘다. 빈 기록으로 배포하면 쌓인 기록이 지워지기 때문이다.

실행: python3 kimchi/record.py [--previous 배포된_기록_URL]
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import argparse
import json
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

SITE = Path(__file__).resolve().parent.parent
OUT = SITE / "data" / "kimchi-history.json"
KST = timezone(timedelta(hours=9))
KEEP = timedelta(days=30)
URLS = {
    "upbit": "https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-USDT",
    "binance": "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
    "fx": "https://open.er-api.com/v6/latest/USD",
}


def get_json(url):
    with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0 AlgoArcade/1.0"}), timeout=20) as res:
        return json.load(res)


# ---------- 계산 (순수 함수: 테스트 대상) ----------

def premiums(krw_btc, krw_usdt, usdt_btc, usdkrw):
    """김프 = 업비트 BTC ÷ (바이낸스 BTC × 환율) − 1. 테더 프리미엄 = 업비트 USDT ÷ 환율 − 1. 단위 %."""
    for v in (krw_btc, krw_usdt, usdt_btc, usdkrw):
        if not (isinstance(v, (int, float)) and v > 0):
            raise ValueError("시세 값이 비었거나 0 이하입니다")
    return (krw_btc / (usdt_btc * usdkrw) - 1) * 100, (krw_usdt / usdkrw - 1) * 100


def add_point(points, point, now):
    """같은 시각(한국 시각 기준 같은 시간대)의 기록은 새 값으로 바꾸고, 30일보다 오래된 기록은 버린다."""
    hour = point["t"][:13]
    kept = [p for p in points if p["t"][:13] != hour and datetime.fromisoformat(p["t"]) >= now - KEEP]
    kept.append(point)
    kept.sort(key=lambda p: p["t"])
    return kept


# ---------- 읽기·쓰기 ----------

class PreviousUnavailable(Exception):
    pass


def load_previous(url, fetch=get_json, tries=3, wait=5):
    """배포된 기록을 이어 받는다. 404(아직 배포 전)일 때만 로컬 파일로 시작한다.
    그 밖의 실패는 PreviousUnavailable — 빈 기록으로 덮어쓰지 않도록 호출한 쪽이 멈춘다."""
    if url:
        # 배포 서버 캐시(최대 10분)를 피하려고 주소 뒤에 시각을 붙인다
        busted = f"{url}{'&' if '?' in url else '?'}t={int(time.time())}"
        for attempt in range(tries):
            try:
                data = fetch(busted)
                points = data["points"]
                print(f"배포된 기록 {len(points)}건을 이어 받음")
                return points
            except HTTPError as err:
                if err.code == 404:
                    print("배포된 기록이 아직 없음(404). 로컬 파일로 시작합니다.")
                    break
                last = err
            except Exception as err:  # 네트워크 끊김·시간 초과·깨진 파일
                last = err
            if attempt < tries - 1:
                time.sleep(wait * (attempt + 1))
        else:
            raise PreviousUnavailable(f"배포된 기록을 {tries}번 모두 읽지 못함({last})")
    if OUT.exists():
        return json.loads(OUT.read_text(encoding="utf-8")).get("points", [])
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--previous", help="이미 배포된 kimchi-history.json 주소")
    args = ap.parse_args()

    now = datetime.now(KST)
    try:
        points = load_previous(args.previous)
    except PreviousUnavailable as err:
        print(f"멈춤: {err}. 이번에는 배포하지 않아 지금 공개된 기록을 그대로 둡니다.", file=sys.stderr)
        sys.exit(1)
    error = None
    try:
        upbit = {t["market"]: t["trade_price"] for t in get_json(URLS["upbit"])}
        usdt_btc = float(get_json(URLS["binance"])["price"])
        usdkrw = get_json(URLS["fx"])["rates"]["KRW"]
        kp, tp = premiums(upbit.get("KRW-BTC"), upbit.get("KRW-USDT"), usdt_btc, usdkrw)
        points = add_point(points, {"t": now.isoformat(timespec="minutes"), "kp": round(kp, 3), "tp": round(tp, 3)}, now)
        print(f"기록 추가: 김프 {kp:+.2f}% · 테더 {tp:+.2f}% · 누적 {len(points)}건")
    except Exception as err:  # 한 번 실패해도 사이트 배포는 계속한다
        error = f"{now.isoformat(timespec='minutes')} 시세 수집 실패: {err}"
        print(f"경고: {error}", file=sys.stderr)

    out = {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "keep_days": KEEP.days,
        "last_error": error,
        "points": points,
    }
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(text + "\n", encoding="utf-8")
    (SITE / "data" / "kimchi-history-data.js").write_text(f"window.KIMCHI_HISTORY = {text};\n", encoding="utf-8")


if __name__ == "__main__":
    main()
