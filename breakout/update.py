#!/usr/bin/env python3
"""Machine 05. python3 breakout/update.py [--offline]. Public data only."""
import argparse
from dataclasses import asdict, replace
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from breakout.engine import Rules, advance, backtest, describe, indicators, new_account, summary
from rebound.update import crypto_data, stock_data, write_json

HERE = ROOT / "breakout"
UTC = timezone.utc

def paper_update(path, rows, rules, asset, now, offline):
    signature = hashlib.sha256(json.dumps(asdict(rules), sort_keys=True).encode()).hexdigest()
    if path.exists():
        state = json.loads(path.read_text(encoding="utf-8"))
        if state["rules_hash"] != signature:
            raise ValueError("Paper rules changed: preserve the existing ledger and start a new version")
    elif offline:
        return {"status": "not_started", "note": "온라인 데이터 확인 후 모의 기록 시작"}
    else:
        last = rows[-1]
        first_trade = (now.astimezone(ZoneInfo(asset["timezone"])).date() + timedelta(days=1)).isoformat()
        state = {"started_at": now.isoformat(), "first_trade_date": first_trade,
                 "anchor_date": last["date"], "rules_hash": signature,
                 "last_row": last, "account": new_account(rules), "observations": []}
        state["account"]["last_date"] = last["date"]
        state["account"]["curve"] = [{"date": last["date"], "equity": rules.initial}]
    if not offline:
        old = state["last_row"]
        matching = next((r for r in rows if r["date"] == old["date"]), None)
        if not matching:
            raise ValueError("Paper anchor no longer in source history")
        # Corporate actions/vendor revisions require review; never silently rewrite a live ledger.
        for key in ("open", "high", "low", "close", "upper", "lower", "atr"):
            if abs(matching[key] - old[key]) > max(0.000001, abs(old[key]) * 0.00001):
                raise ValueError("Source history changed (split or revision); paper ledger preserved for review")
        for row in rows:
            if row["date"] > state["last_row"]["date"]:
                previous = state["last_row"]
                first_trade = state.get("first_trade_date") or (datetime.fromisoformat(state["started_at"]).astimezone(ZoneInfo(asset["timezone"])).date() + timedelta(days=1)).isoformat()
                if row["date"] >= first_trade:
                    advance(state["account"], row, previous, rules, asset["market"])
                else:
                    # Registration must never fill at an opening price already in the past.
                    state["account"]["last_date"] = row["date"]
                    state["account"]["curve"].append({"date": row["date"], "equity": rules.initial})
                state["observations"].append({"observed_at": now.isoformat(), "bar": row})
                state["last_row"] = row
        write_json(path, state)
    account = state["account"]
    return {"status": "tracking", "started_at": state["started_at"], "anchor_date": state["anchor_date"],
            "last_date": state["last_row"]["date"], **summary(account, rules),
            "trades": account["trades"], "curve": account["curve"],
            "note": "등록 다음 현지 날짜부터 진입 가능. 이후 확정 일봉을 순서대로 처리한 모의 체결이며 장중 실시간 주문은 없음."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Rebuild from saved public data without advancing paper accounts")
    args = parser.parse_args()
    now = datetime.now(UTC)
    config = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
    snapshot = {"schema": 1, "strategy": "breakout", "version": Rules().version, "generated_at": now.isoformat(),
                "mode": "offline" if args.offline else "online", "automatic_refresh": False,
                "backtest_start": config["backtest_start"], "holdout_start": config["holdout_start"],
                "rules": asdict(Rules()), "assets": []}
    previous_path = ROOT / "data" / "breakout.json"
    previous = json.loads(previous_path.read_text(encoding="utf-8")) if previous_path.exists() else {"assets": []}
    failures = []
    warmup = (datetime.fromisoformat(config["backtest_start"]) - timedelta(days=400)).date().isoformat()
    for asset in config["assets"]:
        symbol = asset["symbol"]
        print(f"{symbol}: {'cache' if args.offline else 'fetch'}", flush=True)
        item = dict(asset, status="ok")
        cache = HERE / "cache" / (symbol + ".json")
        try:
            if args.offline:
                stored = json.loads(cache.read_text(encoding="utf-8"))
            else:
                loader = crypto_data if asset["market"] == "crypto" else stock_data
                bars, source, note = loader(asset, now, warmup)
                stored = {"fetched_at": now.isoformat(), "source": source, "note": note, "bars": bars}
            rules = replace(Rules(), fee=asset["fee"], initial=10000000.0 if asset["currency"] == "KRW" else 10000.0)
            rows = indicators(stored["bars"], rules)
            if len(rows) < rules.lookback + 2:
                raise ValueError("Not enough valid daily bars for breakout")
            stale_days = (now.date() - datetime.fromisoformat(rows[-1]["date"]).date()).days
            if stale_days > (2 if asset["market"] == "crypto" else 7):
                raise ValueError(f"Source data is stale ({stale_days} calendar days)")
            if not args.offline:
                write_json(cache, stored)
            item.update({"fetched_at": stored["fetched_at"], "source": stored["source"], "cost_note": stored["note"],
                         "rules": asdict(rules), "latest": describe(rows[-1], rules), "start": rows[0]["date"],
                         "end": rows[-1]["date"], "bar_count": len(rows),
                         "input_sha256": hashlib.sha256(json.dumps(stored["bars"],sort_keys=True).encode()).hexdigest(),
                         "chart": [{k: r[k] for k in ("date", "close", "upper", "lower")} for r in rows[-365:]]})
            item["backtest"] = backtest(rows, rules, asset["market"], config["backtest_start"])
            item["holdout"] = backtest(rows, rules, asset["market"], config["holdout_start"])
            try:
                item["paper"] = paper_update(HERE / "paper" / (symbol + ".json"), rows, rules, asset, now, args.offline)
            except Exception as exc:
                item["paper"] = {"status": "error", "note": str(exc)}
                failures.append(f"{symbol} paper: {exc}")
            print(f"{symbol}: {len(rows)} bars, {item['backtest']['count']} closed trades", flush=True)
        except Exception as exc:
            failures.append(f"{symbol}: {exc}")
            old = next((a for a in previous["assets"] if a["symbol"] == symbol), None)
            if old and old.get("latest"):
                item = {**old, "status": "stale", "error": str(exc), "failed_at": now.isoformat()}
            else:
                item.update(status="error", error=str(exc))
            print(f"{symbol}: ERROR {exc}", file=sys.stderr, flush=True)
        snapshot["assets"].append(item)
    write_json(previous_path, snapshot)
    # A generated script permits double-click/file:// use without fetch/CORS failures.
    text = "window.BREAKOUT_DATA = " + json.dumps(snapshot, ensure_ascii=False, allow_nan=False).replace("<", "\\u003c") + ";\n"
    js = ROOT / "data" / "breakout-data.js"
    temp = js.with_suffix(".tmp")
    temp.write_text(text, encoding="utf-8")
    temp.replace(js)
    print(f"Saved {previous_path}; errors: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
