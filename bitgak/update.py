#!/usr/bin/env python3
"""BITGAK (의뢰 1호). python3 bitgak/update.py [--offline] [--previous URL]. Public data only.

지연 추세선(의뢰 규칙)과 빗각 그대로(비교군)를 같은 종목·같은 비용으로 계산한다.
시세는 5번 BREAKOUT과 같은 공개 일봉을 쓴다(--offline이면 breakout/cache를 읽는다).
"""
import argparse
from dataclasses import asdict, replace
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from bitgak.engine import Rules, backtest, describe, indicators
from rebound.engine import buy_and_hold
from rebound.update import crypto_data, load_deployed, page_script, stock_data, write_json

HERE = ROOT / "bitgak"
UTC = timezone.utc
CHART_KEYS = ("date", "close", "dn_line", "dn_delay", "up_line", "up_delay")


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
                "rules": asdict(Rules()), "assets": []}
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
                loader = crypto_data if asset["market"] == "crypto" else stock_data
                bars, source, note = loader(asset, now, warmup)
                stored = {"fetched_at": now.isoformat(), "source": source, "note": note, "bars": bars}
            base = replace(Rules(), fee=asset["fee"], initial=10000000.0 if asset["currency"] == "KRW" else 10000.0)
            delay, plain = base, replace(base, variant="plain")
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
            for period, start in (("backtest", config["backtest_start"]), ("holdout", config["holdout_start"])):
                item[period] = backtest(rows, delay, asset["market"], start)
                item[f"{period}_plain"] = backtest(rows, plain, asset["market"], start)
            item["buy_hold"] = {"backtest": buy_and_hold(rows, config["backtest_start"]),
                                "holdout": buy_and_hold(rows, config["holdout_start"])}
            print(f"{symbol}: {len(rows)} bars, delay {item['backtest']['count']} / plain {item['backtest_plain']['count']} trades", flush=True)
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
