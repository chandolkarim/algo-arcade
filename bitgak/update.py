#!/usr/bin/env python3
"""BITGAK (빗각 · 지연 추세선). python3 bitgak/update.py [--offline] [--previous URL]. Public data only.

알고리즘은 빗각·지연선과 매수 신호만 찾고, 매도는 사람이 정한다. 그래서 손익 대신 신호 뒤 가격의 움직임을
지연선 신호 · 빗각 그대로 신호 · 아무 날과 비교한다.
시세는 5번 BREAKOUT과 같은 공개 일봉을 쓴다(--offline이면 breakout/cache를 읽는다).
"""
import argparse
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from bitgak.engine import WINDOW, Rules, describe, indicators, signal_stats
from urllib.parse import urlencode

from rebound.update import fetch, load_deployed, milliseconds, page_script, stock_data, write_json

HERE = ROOT / "bitgak"
UTC = timezone.utc
CHART_KEYS = ("date", "close", "dn_line", "dn_delay")


def spot_data(asset, now, start):
    """코인 현물 일봉 — data-api.binance.vision(공개 시세 전용 주소).
    선물 주소(fapi)는 GitHub 서버(미국)에서 막혀(451) 자동 갱신이 안 된다. 빗각 신호는 가격만 쓰므로
    내 컴퓨터든 Actions든 항상 같은 현물 일봉을 써서 결과가 오가며 바뀌지 않게 한다."""
    end_ms = int(now.timestamp() * 1000)
    cursor, raw = milliseconds(start), []
    while cursor < end_ms:
        batch = fetch("https://data-api.binance.vision/api/v3/klines?" + urlencode({
            "symbol": asset["symbol"], "interval": "1d", "startTime": cursor, "endTime": end_ms, "limit": 1000}))
        if not isinstance(batch, list):
            raise ValueError("Unexpected Binance kline response")
        if not batch:
            break
        raw.extend(batch)
        following = int(batch[-1][0]) + 86400000
        if following <= cursor:
            raise ValueError("Kline pagination did not advance")
        cursor = following
    bars = [{"date": datetime.fromtimestamp(item[0] / 1000, UTC).date().isoformat(),
             **dict(zip(("open", "high", "low", "close"), map(float, item[1:5])))}
            for item in raw if int(item[6]) < end_ms]   # 아직 안 끝난 오늘 봉은 뺀다
    for left, right in zip(bars, bars[1:]):
        if (datetime.fromisoformat(right["date"]) - datetime.fromisoformat(left["date"])).days != 1:
            raise ValueError("Missing crypto daily candle")
    return bars, "Binance spot · UTC daily (data-api.binance.vision)", "현물 일봉. 빗각 신호는 가격만 쓰므로 펀딩은 쓰지 않음."


def episodes(rows, events):
    """신호 하나씩 그림으로 보여 주기 위한 묶음: 그 신호에 쓴 빗각·채널·지연선과, 신호 뒤 60일 가격."""
    index = {r["date"]: i for i, r in enumerate(rows)}
    value = lambda d, x: d["a"][1] + (d["b"][1] - d["a"][1]) / (index[d["b"][0]] - index[d["a"][0]]) * (x - index[d["a"][0]])
    out = []
    for e in events:
        i = index[e["signal_date"]]
        line = rows[i]["dn_def"]
        lo, hi = max(0, index[line["a"][0]] - 3), min(len(rows) - 1, i + 1 + WINDOW)
        # 빗각 그대로였다면: 같은 선을 종가가 처음 넘은 날(지연선보다 먼저)
        plain = next((rows[k]["date"] for k in range(index[line["b"][0]] + 1, i + 1)
                      if rows[k]["close"] > value(line, k) and rows[k-1]["close"] <= value(line, k-1)), None)
        out.append({**e, "line": line, "plain_signal": plain,
                    "rows": [{k: rows[n][k] for k in ("date", "high", "low", "close")} for n in range(lo, hi + 1)]})
    return out

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Rebuild from saved public data (breakout/cache)")
    parser.add_argument("--previous", help="Deployed bitgak.json URL (Actions): reuse today's result, keep it for failed assets")
    args = parser.parse_args()
    now = datetime.now(UTC)
    config = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
    out_json, out_js = ROOT / "data" / "bitgak.json", ROOT / "data" / "bitgak-data.js"
    deployed = None
    if args.previous:
        deployed, done = load_deployed(args.previous, Rules().version, out_json, out_js, "BITGAK_DATA")
        if done:
            return 0
    snapshot = {"schema": 1, "strategy": "bitgak", "version": Rules().version, "generated_at": now.isoformat(),
                "mode": "offline" if args.offline else "online", "automatic_refresh": bool(args.previous),
                "backtest_start": config["backtest_start"], "holdout_start": config["holdout_start"],
                "rules": asdict(Rules()), "window": WINDOW, "assets": []}
    previous = deployed or (json.loads(out_json.read_text(encoding="utf-8")) if out_json.exists() else {"assets": []})
    failures = []
    warmup = (datetime.fromisoformat(config["backtest_start"]) - timedelta(days=400)).date().isoformat()
    for asset in config["assets"]:
        symbol = asset["symbol"]
        print(f"{symbol}: {'cache' if args.offline else 'fetch'}", flush=True)
        item = dict(asset, status="ok")
        try:
            if args.offline:
                stored = json.loads((ROOT / "breakout" / "cache" / (symbol + ".json")).read_text(encoding="utf-8"))
            else:
                loader = spot_data if asset["market"] == "crypto" else stock_data
                bars, source, note = loader(asset, now, warmup)
                stored = {"fetched_at": now.isoformat(), "source": source, "note": note, "bars": bars}
            base = Rules()
            rows = indicators(stored["bars"], base)   # 두 방식의 선·신호는 같은 표에 함께 들어 있다
            if len(rows) < base.pivot * 2 + 2:
                raise ValueError("Not enough valid daily bars")
            stale_days = (now.date() - datetime.fromisoformat(rows[-1]["date"]).date()).days
            if stale_days > (2 if asset["market"] == "crypto" else 7):
                raise ValueError(f"Source data is stale ({stale_days} calendar days)")
            item.update({"fetched_at": stored["fetched_at"], "source": stored["source"], "cost_note": stored["note"],
                         "rules": asdict(base), "latest": describe(rows[-1], base), "start": rows[0]["date"],
                         "end": rows[-1]["date"], "bar_count": len(rows),
                         "input_sha256": hashlib.sha256(json.dumps(stored["bars"], sort_keys=True).encode()).hexdigest(),
                         "chart": [{k: r[k] for k in CHART_KEYS} for r in rows[-365:]]})
            # 매도는 사람이 정한다: 손익 대신 신호 뒤 5·20·60일과 60일 안 최고·최저를 잰다
            for period, start in (("backtest", config["backtest_start"]), ("holdout", config["holdout_start"])):
                delay, events = signal_stats(rows, "enter_delay", start)
                item[period] = {"delay": delay, "plain": signal_stats(rows, "enter_plain", start)[0],
                                "any": signal_stats(rows, None, start)[0]}
                if period == "backtest":
                    item["episodes"] = episodes(rows, events)
            print(f"{symbol}: {len(rows)} bars, signals delay {item['backtest']['delay']['count']} / plain {item['backtest']['plain']['count']}", flush=True)
        except Exception as exc:
            failures.append(f"{symbol}: {exc}")
            old = next((a for a in previous["assets"] if a["symbol"] == symbol), None)
            if old and old.get("latest"):
                item = {**old, "status": "stale", "error": str(exc), "failed_at": now.isoformat(),
                        "stale_since": old.get("stale_since") or old.get("fetched_at")}
            else:
                item.update(status="error", error=str(exc))
            print(f"{symbol}: ERROR {exc}", file=sys.stderr, flush=True)
        snapshot["assets"].append(item)
    write_json(out_json, snapshot)
    temp = out_js.with_suffix(".tmp")
    temp.write_text(page_script("BITGAK_DATA", snapshot), encoding="utf-8")
    temp.replace(out_js)
    print(f"Saved {out_json}; errors: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
