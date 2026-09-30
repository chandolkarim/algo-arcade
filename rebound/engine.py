"""REBOUND 25/200. Pure, daily-bar research engine; no order API.

Only yesterday's indicators may trigger an opening fill. Intraday stop
execution uses OHLC; on a stop day funding debits are charged conservatively
and funding credits are omitted because the stop time is unknown.
"""
from dataclasses import asdict, dataclass
from datetime import date
import math


@dataclass(frozen=True)
class Rules:
    version: str = "1.0.0"
    fast: int = 25
    slow: int = 200
    atr_period: int = 14
    entry_atr: float = 2.0
    buffer_atr: float = 1.0
    stop_atr: float = 2.0
    max_bars: int = 10
    risk: float = 0.005
    initial: float = 10000.0
    fee: float = 0.001
    slippage: float = 0.0005
    borrow_apr: float = 0.05


def validate_bars(bars):
    previous = ""
    for b in bars:
        date.fromisoformat(b["date"])
        if b["date"] <= previous:
            raise ValueError("Duplicate or unordered daily bars")
        previous = b["date"]
        values = [b[k] for k in ("open", "high", "low", "close")]
        if not all(math.isfinite(v) and v > 0 for v in values):
            raise ValueError("OHLC must be finite and positive")
        if b["low"] > min(b["open"], b["close"]) or b["high"] < max(b["open"], b["close"]) or b["low"] > b["high"]:
            raise ValueError("Invalid OHLC range")
        if not math.isfinite(b.get("dividend", 0)) or b.get("dividend", 0) < 0:
            raise ValueError("Invalid dividend")
        for f in b.get("funding", []):
            if not math.isfinite(f["rate"]) or not math.isfinite(f["mark"]) or f["mark"] <= 0:
                raise ValueError("Invalid funding event")


def indicators(bars, rules=Rules()):
    validate_bars(bars)
    rows, closes, trs = [], [], []
    atr = None
    for i, bar in enumerate(bars):
        prev = closes[-1] if closes else bar["close"]
        closes.append(bar["close"])
        trs.append(max(bar["high"] - bar["low"], abs(bar["high"] - prev), abs(bar["low"] - prev)))
        if i == rules.atr_period - 1:
            atr = sum(trs) / rules.atr_period
        elif i >= rules.atr_period:
            atr = (atr * (rules.atr_period - 1) + trs[-1]) / rules.atr_period
        rows.append(dict(bar, sma25=sum(closes[-rules.fast:]) / rules.fast if len(closes) >= rules.fast else None,
                         sma200=sum(closes[-rules.slow:]) / rules.slow if len(closes) >= rules.slow else None, atr=atr))
    return rows


def signal(row, rules=Rules(), filtered=True):
    a, fast, slow = row["atr"], row["sma25"], row["sma200"]
    if a is None or a <= 0 or fast is None or slow is None:
        return 0
    c = row["close"]
    if c <= fast - rules.entry_atr * a and (not filtered or c > slow + rules.buffer_atr * a):
        return 1
    if c >= fast + rules.entry_atr * a and (not filtered or c < slow - rules.buffer_atr * a):
        return -1
    return 0


def entry_allowed(open_price, previous, side, rules, filtered):
    # A smaller remaining deviation is allowed, but a recovered mean cancels.
    if side * (open_price - previous["sma25"]) >= 0:
        return False
    return not filtered or side * (open_price - previous["sma200"]) > rules.buffer_atr * previous["atr"]


def exit_signal(row, position, rules, filtered):
    side = position["side"]
    if filtered and side * (row["close"] - row["sma200"]) < 0:
        return "trend"
    if side * (row["close"] - row["sma25"]) >= 0:
        return "mean"
    if position["bars"] >= rules.max_bars:
        return "timeout"
    return None


def new_account(rules=Rules()):
    return {"balance": rules.initial, "position": None, "trades": [], "curve": [],
            "last_date": None, "cancellations": 0}


def advance(account, row, previous, rules=Rules(), filtered=True, market="stock"):
    """Apply one CLOSED bar exactly once; mutates a serializable account."""
    if account["last_date"] and row["date"] <= account["last_date"]:
        raise ValueError("Already processed bar")
    p = account["position"]
    exited = False

    def charge(amount, category):
        account["balance"] -= amount
        p[category] += amount

    def close(raw_price, reason):
        nonlocal p, exited
        fill = raw_price * (1 - p["side"] * rules.slippage)
        gross = p["side"] * p["qty"] * (fill - p["entry"])
        fee = abs(fill * p["qty"]) * rules.fee
        account["balance"] += gross - fee
        p["fees"] += fee
        net = gross - p["fees"] - p["carry"] + p["dividends"]
        account["trades"].append({**p, "exit_date": row["date"], "exit": fill,
                                  "reason": reason, "gross": gross, "net": net,
                                  "return_pct": net / (p["entry"] * p["qty"]) * 100})
        account["position"] = None
        p, exited = None, True

    if p:
        days = (date.fromisoformat(row["date"]) - date.fromisoformat(account["last_date"])).days
        if market == "stock":
            if p["side"] == -1:
                charge(p["qty"] * previous["close"] * rules.borrow_apr * days / 365, "carry")
            dividend = p["side"] * p["qty"] * row.get("dividend", 0)
            account["balance"] += dividend
            p["dividends"] += dividend
        else:
            for event in row.get("funding", []):
                if event["at_open"]:
                    charge(p["side"] * p["qty"] * event["rate"] * event["mark"], "carry")
        # Gaps through a stop fill at the open, never at an unavailable stop.
        if p["side"] * (row["open"] - p["stop"]) <= 0:
            close(row["open"], "gap_stop")
        elif p["pending_exit"]:
            close(row["open"], p["pending_exit"])

    if not p and not exited and account["balance"] > 0:
        side = signal(previous, rules, filtered)
        if side:
            fill = row["open"] * (1 + side * rules.slippage)
            distance = rules.stop_atr * previous["atr"]
            if entry_allowed(row["open"], previous, side, rules, filtered) and fill - side * distance > 0:
                # Size includes fees and estimated stop slippage in the risk budget.
                loss_per_unit = distance + rules.fee * (fill + abs(fill - side * distance)) + rules.slippage * abs(fill - side * distance)
                qty = min(account["balance"] * rules.risk / loss_per_unit,
                          account["balance"] / (fill * (1 + rules.fee)))
                fee = qty * fill * rules.fee
                account["balance"] -= fee
                p = {"side": side, "signal_date": previous["date"], "entry_date": row["date"],
                     "entry": fill, "qty": qty, "stop": fill - side * distance,
                     "signal_atr": previous["atr"], "bars": 0, "pending_exit": None,
                     "fees": fee, "carry": 0.0, "dividends": 0.0}
                account["position"] = p
            else:
                account["cancellations"] += 1

    if p:
        p["bars"] += 1
        stopped = row["low"] <= p["stop"] if p["side"] == 1 else row["high"] >= p["stop"]
        if market == "crypto":
            for event in row.get("funding", []):
                if not event["at_open"]:
                    amount = p["side"] * p["qty"] * event["rate"] * event["mark"]
                    # OHLC cannot reveal whether the stop preceded a funding event.
                    charge(max(0, amount) if stopped else amount, "carry")
        if stopped:
            close(p["stop"], "stop")
        else:
            p["pending_exit"] = exit_signal(row, p, rules, filtered)

    equity = account["balance"]
    if p:
        equity += p["side"] * p["qty"] * (row["close"] - p["entry"])
    account["last_date"] = row["date"]
    account["curve"].append({"date": row["date"], "equity": equity})


def summary(account, rules=Rules()):
    trades = account["trades"]
    equity = account["curve"][-1]["equity"] if account["curve"] else rules.initial
    peak, drawdown = rules.initial, 0.0
    for point in account["curve"]:
        peak = max(peak, point["equity"])
        drawdown = max(drawdown, (peak - point["equity"]) / peak)
    sides = {}
    for side, label in ((1, "long"), (-1, "short")):
        selected = [t for t in trades if t["side"] == side]
        sides[label] = {"count": len(selected), "net": sum(t["net"] for t in selected),
                        "win_rate": sum(t["net"] > 0 for t in selected) / len(selected) * 100 if selected else None}
    return {"initial": rules.initial, "equity": equity, "return_pct": (equity / rules.initial - 1) * 100,
            "max_drawdown_pct": drawdown * 100, "count": len(trades),
            "win_rate": sum(t["net"] > 0 for t in trades) / len(trades) * 100 if trades else None,
            "sides": sides, "position": account["position"], "cancellations": account["cancellations"]}


def backtest(rows, rules=Rules(), filtered=True, market="stock", start_date=None):
    account = new_account(rules)
    start = max(rules.slow, rules.atr_period)
    for i in range(start, len(rows)):
        if start_date and rows[i]["date"] < start_date:
            continue
        if not account["curve"]:
            account["curve"].append({"date": rows[i-1]["date"], "equity": rules.initial})
        advance(account, rows[i], rows[i-1], rules, filtered, market)
    return {**summary(account, rules), "trades": account["trades"], "curve": account["curve"]}


def describe(row, rules=Rules()):
    a = row["atr"]
    side = signal(row, rules)
    trend = "long" if row["close"] > row["sma200"] + a else "short" if row["close"] < row["sma200"] - a else "neutral"
    return {"date": row["date"], "close": row["close"], "sma25": row["sma25"],
            "sma200": row["sma200"], "atr": a, "deviation_pct": (row["close"] / row["sma25"] - 1) * 100,
            "deviation_atr": (row["close"] - row["sma25"]) / a if a else None,
            "trend": trend, "signal": "long" if side == 1 else "short" if side == -1 else "wait"}
