#!/usr/bin/env python3
"""Fetch public daily data, run research, append forward-paper observations.

Run from the repository root: python3 rebound/update.py
Only public GET requests are made. No credentials, brokerage or order calls.
"""
import argparse
from dataclasses import asdict, replace
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
import time
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET

if __package__:
    from .engine import Rules, advance, backtest, buy_and_hold, describe, indicators, new_account, summary
else:
    from engine import Rules, advance, backtest, buy_and_hold, describe, indicators, new_account, summary

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / "rebound"
UTC = timezone.utc


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temp.replace(path)


def fetch(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0 AlgoArcadeResearch/1.0"}), timeout=25) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


# 페이지용 스크립트에는 화면에 쓰는 칸만 남기고 숫자를 6자리로 줄인다(원본 JSON은 그대로).
PAGE_TRADE_KEYS = ("side", "entry_date", "exit_date", "entry", "exit", "net", "reason", "bars", "stop", "pending_exit", "return_pct")
PAGE_CURVE_KEYS = ("date", "equity", "stop_used")


def _short(value):
    if isinstance(value, float):
        return float(f"{value:.6g}")
    if isinstance(value, dict):
        return {k: _short(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_short(v) for v in value]
    return value


def _page_result(result, keep_trades=True):
    if not isinstance(result, dict):
        return result
    out = dict(result)
    if "trades" in out:
        out["trades"] = [{k: t[k] for k in PAGE_TRADE_KEYS if k in t} for t in out["trades"]] if keep_trades else []
    if "curve" in out:
        out["curve"] = [{k: r[k] for k in PAGE_CURVE_KEYS if k in r} for r in out["curve"]]
    return out


def page_payload(snapshot):
    assets = []
    for a in snapshot.get("assets", []):
        a = dict(a)
        for key in ("backtest", "holdout", "paper", "backtest_plain", "holdout_plain"):
            if key in a:
                a[key] = _page_result(a[key])
        for key in ("baseline", "holdout_baseline"):  # 비교 곡선과 합계만 쓴다
            if key in a:
                a[key] = _page_result(a[key], keep_trades=False)
        assets.append(a)
    return _short({**snapshot, "assets": assets})


def page_script(var, snapshot):
    """A generated script permits double-click/file:// use without fetch/CORS failures."""
    body = json.dumps(page_payload(snapshot), ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    return f"window.{var} = " + body.replace("<", "\\u003c") + ";\n"


def load_deployed(url, version, out_json, out_js, var):
    """--previous: 배포된 결과와 저장소 결과 중 더 최근에 계산한 것을 고른다.
    오늘(UTC) 같은 버전으로 이미 계산했으면 그대로 써서 True. 고른 결과는 실패한 종목의 이전 값으로도 쓴다.
    (로컬에서 새로 계산해 커밋한 결과가 어제 배포본보다 최신일 수 있다.)"""
    candidates = []
    try:
        candidates.append(fetch(f"{url}?t={int(time.time())}"))
    except Exception as exc:
        print(f"warning: deployed snapshot unavailable ({exc})", file=sys.stderr)
    if out_json.exists():
        candidates.append(json.loads(out_json.read_text(encoding="utf-8")))
    candidates = [c for c in candidates if c.get("schema") == 1 and c.get("assets")]
    if not candidates:
        return None, False
    prev = max(candidates, key=lambda c: c.get("generated_at", ""))
    # 종목별로는 시세를 가장 최근에 받은 결과를 이전 값으로 쓴다
    newest = {}
    for c in candidates:
        for a in c["assets"]:
            if a.get("latest") and a.get("fetched_at", "") > newest.get(a["symbol"], {}).get("fetched_at", ""):
                newest[a["symbol"]] = a
    behind = any(newest.get(a["symbol"], a).get("fetched_at", "") > a.get("fetched_at", "") for a in prev["assets"])
    merged = {**prev, "assets": [newest.get(a["symbol"], a) for a in prev["assets"]]}
    today = datetime.now(UTC).date().isoformat()
    if behind:
        return merged, False
    if prev.get("generated_at", "")[:10] == today and prev.get("version") == version and prev.get("assets"):
        write_json(out_json, prev)
        out_js.write_text(page_script(var, prev), encoding="utf-8")
        print(f"오늘 이미 계산한 결과를 그대로 씀 ({prev['generated_at']})")
        return prev, True
    return merged, False


def milliseconds(day):
    return int(datetime.fromisoformat(day).replace(tzinfo=UTC).timestamp() * 1000)


def crypto_data(asset, now, start):
    end_ms = int(now.timestamp() * 1000)
    cursor, raw = milliseconds(start), []
    while cursor < end_ms:
        batch = fetch("https://fapi.binance.com/fapi/v1/klines?" + urlencode({
            "symbol": asset["symbol"], "interval": "1d", "startTime": cursor,
            "endTime": end_ms, "limit": 1000}))
        if not isinstance(batch, list):
            raise ValueError("Unexpected Binance kline response")
        if not batch:
            break
        raw.extend(batch)
        following = int(batch[-1][0]) + 86400000
        if following <= cursor:
            raise ValueError("Kline pagination did not advance")
        cursor = following
    bars = []
    for item in raw:
        if int(item[6]) >= end_ms:
            continue
        bars.append({"date": datetime.fromtimestamp(item[0] / 1000, UTC).date().isoformat(),
                     **dict(zip(("open", "high", "low", "close"), map(float, item[1:5]))), "funding": []})
    by_date = {b["date"]: b for b in bars}
    cursor = milliseconds(start)
    while cursor < end_ms:
        batch = fetch("https://fapi.binance.com/fapi/v1/fundingRate?" + urlencode({
            "symbol": asset["symbol"], "startTime": cursor, "endTime": end_ms, "limit": 1000}))
        if not isinstance(batch, list):
            raise ValueError("Unexpected funding response")
        if not batch:
            break
        for item in batch:
            stamp = int(item["fundingTime"])
            day = datetime.fromtimestamp(stamp / 1000, UTC).date().isoformat()
            if day in by_date:
                mark = item.get("markPrice")
                # Older Binance records omit mark prices. Daily open is a disclosed proxy.
                proxy = not mark or float(mark) <= 0
                by_date[day]["funding"].append({"rate": float(item["fundingRate"]),
                    "mark": by_date[day]["open"] if proxy else float(mark),
                    "mark_proxy": proxy, "at_open": stamp % 86400000 < 60000})
        following = int(batch[-1]["fundingTime"]) + 1
        if following <= cursor:
            raise ValueError("Funding pagination did not advance")
        cursor = following
    for left, right in zip(bars, bars[1:]):
        if (datetime.fromisoformat(right["date"]) - datetime.fromisoformat(left["date"])).days != 1:
            raise ValueError("Missing crypto daily candle")
    if any(not b["funding"] for b in bars):
        raise ValueError("Funding history is incomplete")
    return bars, "Binance USDⓈ-M perpetual · UTC daily", "실제 선물 일봉·펀딩 이력. 과거 mark 가격 누락 시 당일 시가로 추정. 손절일은 시각을 몰라 당일 펀딩 지출만 보수적으로 반영."


def korean_missing_bars(symbol):
    """Fallback only for holes, with provenance retained on every patched bar."""
    url = "https://fchart.stock.naver.com/sise.nhn?" + urlencode({
        "symbol": symbol.split(".")[0], "timeframe": "day", "count": 2000, "requestType": 0})
    with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=25) as response:
        xml = response.read().decode("euc-kr")
    bars = {}
    for item in ET.fromstring(xml).iter("item"):
        parts = item.attrib["data"].split("|")
        day = datetime.strptime(parts[0], "%Y%m%d").date().isoformat()
        bars[day] = dict(zip(("open", "high", "low", "close"), map(float, parts[1:5])))
    return bars


def stock_data(asset, now, start):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/" + quote(asset["symbol"], safe="") + "?" + urlencode({
        "period1": milliseconds(start) // 1000, "period2": int(now.timestamp()),
        "interval": "1d", "events": "div,splits"})
    payload = fetch(url)
    if payload["chart"].get("error"):
        raise ValueError(str(payload["chart"]["error"]))
    result = payload["chart"]["result"][0]
    tz = ZoneInfo(asset["timezone"])
    current = now.astimezone(tz)
    quotes = result["indicators"]["quote"][0]
    dividends = {}
    for event in result.get("events", {}).get("dividends", {}).values():
        day = datetime.fromtimestamp(event["date"], tz).date().isoformat()
        dividends[day] = float(event["amount"])
    bars, fallback, patched = [], None, []
    for i, stamp in enumerate(result.get("timestamp", [])):
        local = datetime.fromtimestamp(stamp, tz)
        # Use only prior local dates: conservative, also handles early-close holidays.
        if local.date() >= current.date():
            continue
        values = [quotes[k][i] for k in ("open", "high", "low", "close")]
        day = local.date().isoformat()
        missing = any(v is None for v in values)
        invalid = not missing and (values[2] > min(values[0], values[3]) or values[1] < max(values[0], values[3]))
        if missing or invalid:
            if not asset["symbol"].endswith((".KS", ".KQ")):
                raise ValueError("Missing stock OHLC; refusing to bridge a missing bar")
            if fallback is None:
                fallback = korean_missing_bars(asset["symbol"])
            if day not in fallback:
                raise ValueError("Missing stock OHLC also absent from NAVER")
            # Confirm nearby price scales before mixing adjusted vendor histories.
            checks = 0
            for j in range(max(0, i - 2), min(len(result["timestamp"]), i + 3)):
                if j == i:
                    continue
                neighbor = datetime.fromtimestamp(result["timestamp"][j], tz).date().isoformat()
                price = quotes["close"][j]
                if price is not None and neighbor in fallback:
                    if abs(fallback[neighbor]["close"] / price - 1) > .01:
                        raise ValueError("NAVER/Yahoo price scales disagree near missing date")
                    checks += 1
            if checks < 2:
                raise ValueError("Not enough adjacent vendor quotes to verify missing date")
            values = [fallback[day][k] for k in ("open", "high", "low", "close")]
            patched.append(day)
        bars.append({"date": day, **dict(zip(("open", "high", "low", "close"), map(float, values))),
                     "dividend": dividends.get(day, 0), "source": "NAVER Finance" if day in patched else "Yahoo Finance"})
    note = "분할 반영 OHLC·배당 현금 반영. 공매도는 차입 가능 가정, 차입료 연 5% 추정. 세금·차입 제한·리콜·최소 주문 단위 미반영."
    if patched:
        note += " Yahoo 누락·OHLC 오류를 NAVER 실제 일봉으로 보완: " + ", ".join(patched) + "."
    return bars, "Yahoo Finance" + (" + NAVER" if patched else "") + " · exchange daily", note


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
        for key in ("open", "high", "low", "close", "sma25", "sma200", "atr"):
            if abs(matching[key] - old[key]) > max(0.000001, abs(old[key]) * 0.00001):
                raise ValueError("Source history changed (split or revision); paper ledger preserved for review")
        for row in rows:
            if row["date"] > state["last_row"]["date"]:
                previous = state["last_row"]
                first_trade = state.get("first_trade_date") or (datetime.fromisoformat(state["started_at"]).astimezone(ZoneInfo(asset["timezone"])).date() + timedelta(days=1)).isoformat()
                if row["date"] >= first_trade:
                    advance(state["account"], row, previous, rules, True, asset["market"])
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
    parser.add_argument("--previous", help="Deployed rebound.json URL (Actions): reuse today's result, keep it for failed assets")
    args = parser.parse_args()
    now = datetime.now(UTC)
    config = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
    deployed = None
    if args.previous:
        deployed, done = load_deployed(args.previous, Rules().version, ROOT / "data" / "rebound.json",
                                       ROOT / "data" / "rebound-data.js", "REBOUND_DATA")
        if done:
            return 0
    snapshot = {"schema": 1, "version": Rules().version, "generated_at": now.isoformat(),
                "mode": "offline" if args.offline else "online", "automatic_refresh": bool(args.previous),
                "backtest_start": config["backtest_start"], "holdout_start": config["holdout_start"],
                "rules": asdict(Rules()), "assets": []}
    previous_path = ROOT / "data" / "rebound.json"
    previous = deployed or (json.loads(previous_path.read_text(encoding="utf-8")) if previous_path.exists() else {"assets": []})
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
            if len(rows) < 220:
                raise ValueError("At least 220 valid daily bars required")
            stale_days = (now.date() - datetime.fromisoformat(rows[-1]["date"]).date()).days
            if stale_days > (2 if asset["market"] == "crypto" else 7):
                raise ValueError(f"Source data is stale ({stale_days} calendar days)")
            if not args.offline:
                write_json(cache, stored)
            item.update({"fetched_at": stored["fetched_at"], "source": stored["source"], "cost_note": stored["note"],
                         "rules": asdict(rules), "latest": describe(rows[-1], rules), "start": rows[0]["date"],
                         "end": rows[-1]["date"], "bar_count": len(rows),
                         "chart": [{k: r[k] for k in ("date", "close", "sma25", "sma200")} for r in rows[-365:]]})
            item["backtest"] = backtest(rows, rules, True, asset["market"], config["backtest_start"])
            item["baseline"] = backtest(rows, rules, False, asset["market"], config["backtest_start"])
            item["holdout"] = backtest(rows, rules, True, asset["market"], config["holdout_start"])
            # 비교 기준: 같은 기간 그냥 사서 들고 있었다면(비용 없음)
            item["buy_hold"] = {"backtest": buy_and_hold(rows, config["backtest_start"]),
                                "holdout": buy_and_hold(rows, config["holdout_start"])}
            item["holdout_baseline"] = backtest(rows, rules, False, asset["market"], config["holdout_start"])
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
                item = {**old, "status": "stale", "error": str(exc), "failed_at": now.isoformat(),
                        "stale_since": old.get("stale_since") or old.get("fetched_at")}
            else:
                item.update(status="error", error=str(exc))
            print(f"{symbol}: ERROR {exc}", file=sys.stderr, flush=True)
        snapshot["assets"].append(item)
    write_json(previous_path, snapshot)
    text = page_script("REBOUND_DATA", snapshot)
    js = ROOT / "data" / "rebound-data.js"
    temp = js.with_suffix(".tmp")
    temp.write_text(text, encoding="utf-8")
    temp.replace(js)
    print(f"Saved {previous_path}; errors: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
