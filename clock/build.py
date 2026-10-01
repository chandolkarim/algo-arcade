"""CLOCK TOWER — 비트코인이 한국 시간 몇 시, 무슨 요일에 많이 움직이는지 세는 계산기.

- 시세: 바이낸스 공개 1시간봉(인증키 없음), 상장 이후 전부.
- 칸: 한국 시간 요일(7) × 시각(24) = 168칸. 칸마다 그 시간 1시간봉의
  평균 등락(move), 오른 비율(up), 출렁임(swing = |등락| 평균)을 센다.
- 검증: 2023년 전(설계)·후(검증)를 따로 세어, 두 구간 모두 평소와 같은 쪽으로 다르면 '검증됨'.
- 공개 파일에는 168칸 요약만 담는다. 1시간봉 원본은 내보내지 않는다.
- 하루 한 번이면 충분하다. --previous로 배포된 결과가 오늘(UTC) 것이면 다시 받지 않는다.

실행: python3 clock/build.py [--previous 배포된_clock.json_URL]
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import argparse
import json
import math
import sys
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent
OUT = SITE / "data" / "clock.json"
KLINES = "https://data-api.binance.vision/api/v3/klines?symbol={sym}&interval=1h&startTime={start}&limit=1000"
HOUR = 3_600_000
WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]


def get_json(url):
    with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0 AlgoArcade/1.0"}), timeout=30) as res:
        return json.load(res)


def fetch_hourly(symbol):
    """상장 이후 1시간봉 전부. 아직 닫히지 않은 봉은 뺀다."""
    out, start = [], 0
    now = int(time.time() * 1000)
    while True:
        rows = get_json(KLINES.format(sym=symbol, start=start))
        if not rows:
            break
        out.extend((int(r[0]), float(r[1]), float(r[4])) for r in rows if int(r[6]) < now and float(r[1]) > 0 and float(r[4]) > 0)
        if len(rows) < 1000:
            break
        start = int(rows[-1][0]) + HOUR
    return out


# ---------- 계산 (순수 함수: 테스트 대상) ----------

def cell_of(open_ms, offset_hours):
    """봉 시작 시각(UTC ms) → (요일 0=월, 시각 0~23) 한국 시간 기준."""
    t = datetime.fromtimestamp(open_ms / 1000, timezone.utc) + timedelta(hours=offset_hours)
    return t.weekday(), t.hour


class Acc:
    """평균·표준편차를 한 번에 쌓는 누적기."""

    def __init__(self):
        self.n = 0
        self.s = 0.0
        self.ss = 0.0

    def add(self, x):
        self.n += 1
        self.s += x
        self.ss += x * x

    @property
    def mean(self):
        return self.s / self.n if self.n else None

    @property
    def sd(self):
        if self.n < 2:
            return None
        var = (self.ss - self.s * self.s / self.n) / (self.n - 1)
        return math.sqrt(max(var, 0.0))


def z_p(z):
    """정규분포 양측 p값."""
    return math.erfc(abs(z) / math.sqrt(2))


def mean_test(cell, base_mean):
    """칸 평균이 평소 평균과 다른지 (z 검정). (차이 부호, p)를 돌려준다."""
    if cell.n < 2 or not cell.sd:
        return 0, 1.0
    z = (cell.mean - base_mean) / (cell.sd / math.sqrt(cell.n))
    return (1 if z > 0 else -1 if z < 0 else 0), z_p(z)


def share_test(k, n, p0):
    """오른 비율이 평소 비율과 다른지 (정규 근사, n이 수백 이상)."""
    if n == 0 or p0 <= 0 or p0 >= 1:
        return 0, 1.0
    z = (k / n - p0) / math.sqrt(p0 * (1 - p0) / n)
    return (1 if z > 0 else -1 if z < 0 else 0), z_p(z)


def verdict(design, validation, alpha):
    """(부호, p) 두 개로 판정. 두 구간 모두 같은 쪽으로 유의해야 검증됨."""
    (sd, pd), (sv, pv) = design, validation
    if pd < alpha and pv < alpha and sd == sv and sd != 0:
        return "verified"
    if pd < alpha:
        return "maybe_luck"
    return "none"


def summarize(candles, cfg):
    split = int(datetime.fromisoformat(cfg["validation_start"]).replace(tzinfo=timezone.utc).timestamp() * 1000)
    periods = ("design", "validation")
    cells = {(w, h): {p: {"move": Acc(), "swing": Acc(), "up": 0} for p in periods} for w in range(7) for h in range(24)}
    base = {p: {"move": Acc(), "swing": Acc(), "up": 0} for p in periods}
    for t, o, c in candles:
        r = math.log(c / o)
        p = "validation" if t >= split else "design"
        w, h = cell_of(t, cfg["utc_offset_hours"])
        for target in (cells[(w, h)][p], base[p]):
            target["move"].add(r)
            target["swing"].add(abs(r))
            target["up"] += 1 if c > o else 0

    out = []
    for (w, h), per in cells.items():
        row = {"w": w, "h": h}
        tests = {"move": {}, "up": {}, "swing": {}}
        for p in periods:
            cell, b = per[p], base[p]
            n = cell["move"].n
            row[p] = {"n": n,
                      "move": round(cell["move"].mean * 100, 5) if n else None,
                      "up": round(cell["up"] / n, 4) if n else None,
                      "swing": round(cell["swing"].mean * 100, 4) if n else None}
            tests["move"][p] = mean_test(cell["move"], b["move"].mean)
            tests["swing"][p] = mean_test(cell["swing"], b["swing"].mean)
            tests["up"][p] = share_test(cell["up"], n, b["up"] / b["move"].n if b["move"].n else 0)
        row["verdict"] = {m: verdict(tests[m]["design"], tests[m]["validation"], cfg["alpha"]) for m in tests}
        row["sign"] = {m: tests[m]["design"][0] for m in tests}
        n_all = row["design"]["n"] + row["validation"]["n"]
        row["all"] = {"n": n_all}
        for m in ("move", "up", "swing"):
            vals = [(row[p][m], row[p]["n"]) for p in periods if row[p][m] is not None]
            row["all"][m] = round(sum(v * n for v, n in vals) / n_all, 5) if n_all else None
        out.append(row)
    out.sort(key=lambda r: (r["w"], r["h"]))

    base_out = {}
    for p in periods:
        b = base[p]
        base_out[p] = {"n": b["move"].n,
                       "move": round(b["move"].mean * 100, 5) if b["move"].n else None,
                       "up": round(b["up"] / b["move"].n, 4) if b["move"].n else None,
                       "swing": round(b["swing"].mean * 100, 4) if b["move"].n else None}
    n_all = base_out["design"]["n"] + base_out["validation"]["n"]
    base_out["all"] = {"n": n_all, **{m: round(sum(base_out[p][m] * base_out[p]["n"] for p in periods) / n_all, 5)
                                      for m in ("move", "up", "swing")}}
    return out, base_out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--previous", help="배포된 clock.json 주소. 오늘(UTC) 만든 것이면 다시 계산하지 않는다")
    args = ap.parse_args()
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    today = datetime.now(timezone.utc).date().isoformat()

    if args.previous:
        try:
            prev = get_json(args.previous)
            if prev.get("generated_at", "")[:10] == today and prev.get("rules", {}).get("version") == cfg["version"]:
                text = json.dumps(prev, ensure_ascii=False, separators=(",", ":"))
                OUT.write_text(text + "\n", encoding="utf-8")
                (SITE / "data" / "clock-data.js").write_text(f"window.CLOCK_DATA = {text};\n", encoding="utf-8")
                print(f"오늘 이미 계산한 결과를 그대로 씀 ({prev['generated_at']})")
                return
        except Exception as err:
            print(f"경고: 배포된 결과를 읽지 못함({err}). 새로 계산합니다.", file=sys.stderr)

    try:
        candles = fetch_hourly(cfg["symbol"])
    except Exception as err:
        print(f"멈춤: 1시간봉을 받지 못했습니다({err})", file=sys.stderr)
        sys.exit(1)
    cells, base = summarize(candles, cfg)
    counts = {}
    for c in cells:
        for m, v in c["verdict"].items():
            counts.setdefault(m, {}).setdefault(v, 0)
            counts[m][v] += 1
    out = {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rules": cfg,
        "range": {"first": datetime.fromtimestamp(candles[0][0] / 1000, timezone.utc).isoformat(timespec="minutes"),
                  "last": datetime.fromtimestamp(candles[-1][0] / 1000, timezone.utc).isoformat(timespec="minutes"),
                  "hours": len(candles)},
        "weekdays": WEEKDAYS,
        "base": base,
        "verdict_counts": counts,
        "cells": cells,
    }
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(text + "\n", encoding="utf-8")
    (SITE / "data" / "clock-data.js").write_text(f"window.CLOCK_DATA = {text};\n", encoding="utf-8")
    print(f"1시간봉 {len(candles)}개 · 판정 {counts} · {len(text) // 1024}KB")


if __name__ == "__main__":
    main()
