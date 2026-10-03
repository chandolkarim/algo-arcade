"""BITGAK (빗각 · 지연 추세선). Pure daily-bar research engine; no order API.

아이디어: 커뮤니티에 정리된 '인범 빗각'·'지연 추세선' 글의 생각을 일봉 규칙으로 고정했다.
- 고점 두 개를 이은 하락 빗각과, 그 선을 저점까지 평행 복사한 채널을 만든다.
- 지연선 = 빗각을 채널 폭만큼 위로 한 번 더 복사한 선. 종가가 이 선을 위로 넘으면 다음 시가에 산다.
- 청산은 반대로: 저점 두 개를 이은 상승 빗각을 채널 폭만큼 아래로 복사한 선을 종가가 깨면 다음 시가에 판다.
- 비교군(plain)은 같은 빗각을 지연 없이 쓴다: 빗각 자체를 넘으면 사고, 상승 빗각 자체를 깨면 판다.

미래 정보 금지: 고점·저점은 좌우 PIVOT개 봉 중 가장 높은(낮은) 봉이며, 오른쪽 PIVOT개 봉이
지나 확정된 뒤에만 선에 쓴다. 신호는 그날 종가로 판단하고 체결은 다음 봉 시가다.
롱만 한다(원문이 하락 추세를 끝내고 올라탈 자리를 찾는 방법이라서).
"""
from dataclasses import dataclass

from breakout.engine import summary as _summary
from breakout.engine import validate_bars


@dataclass(frozen=True)
class Rules:
    version: str = "1.0.0"
    pivot: int = 5            # 좌우 몇 개 봉 중 가장 높은(낮은) 봉을 고점(저점)으로 볼지
    atr_period: int = 14
    stop_atr: float = 2.0     # 안전 손절: 진입가 − 신호일 ATR × 2 (원문에 없어 위험 크기를 정하려고 둔다)
    risk: float = 0.005
    initial: float = 10000.0
    fee: float = 0.001
    slippage: float = 0.0005
    variant: str = "delay"    # "delay" = 지연 추세선(의뢰 규칙), "plain" = 빗각 그대로(비교군)


def _line(a, b):
    """두 점 (index, price)을 지나는 직선. 반환: x에서의 값."""
    slope = (b[1] - a[1]) / (b[0] - a[0])
    return lambda x: a[1] + slope * (x - a[0])


def indicators(bars, rules=Rules()):
    """각 봉에 그날 종가 시점까지 알 수 있는 빗각 값과 신호를 붙인다."""
    validate_bars(bars)
    k = rules.pivot
    rows, trs, highs, lows = [], [], [], []   # highs/lows: 확정된 고점·저점 (index, price)
    atr = None
    down = up = None   # 현재 쓰는 하락·상승 빗각: (선 함수, 채널 폭)
    for t, bar in enumerate(bars):
        prev = bars[t-1]["close"] if t else bar["close"]
        trs.append(max(bar["high"] - bar["low"], abs(bar["high"] - prev), abs(bar["low"] - prev)))
        if t == rules.atr_period - 1:
            atr = sum(trs) / rules.atr_period
        elif t >= rules.atr_period:
            atr = (atr * (rules.atr_period - 1) + trs[-1]) / rules.atr_period

        # t번째 봉이 끝나야 i = t-k 봉이 고점·저점인지 확정된다(오른쪽 k개 봉 필요)
        i = t - k
        if i >= k:
            window = bars[i-k:t+1]
            hs, ls = [b["high"] for b in window], [b["low"] for b in window]
            if bars[i]["high"] == max(hs) and hs.index(max(hs)) == k:
                highs.append((i, bars[i]["high"]))
                if len(highs) >= 2 and highs[-1][1] < highs[-2][1]:
                    a, b = highs[-2], highs[-1]
                    f = _line(a, b)
                    # 고점-고점 선을 두 고점 사이 가장 깊은 저점까지 평행 복사 → 채널 폭
                    width = max(f(x) - bars[x]["low"] for x in range(a[0], b[0] + 1))
                    down = (f, max(width, 0.0))
                else:
                    down = None   # 최근 두 고점이 내려가지 않으면 하락 빗각 없음
            if bars[i]["low"] == min(ls) and ls.index(min(ls)) == k:
                lows.append((i, bars[i]["low"]))
                if len(lows) >= 2 and lows[-1][1] > lows[-2][1]:
                    a, b = lows[-2], lows[-1]
                    f = _line(a, b)
                    width = max(bars[x]["high"] - f(x) for x in range(a[0], b[0] + 1))
                    up = (f, max(width, 0.0))
                else:
                    up = None

        row = dict(bar, atr=atr, dn_line=None, dn_delay=None, up_line=None, up_delay=None,
                   enter_delay=False, enter_plain=False, exit_delay=False, exit_plain=False)
        if t and down:
            f, w = down
            row.update(dn_line=f(t), dn_delay=f(t) + w)
            # 같은 선으로 어제와 오늘을 비교해야 선이 바뀌는 날 가짜 교차가 생기지 않는다
            row["enter_plain"] = bar["close"] > f(t) and prev <= f(t - 1)
            row["enter_delay"] = bar["close"] > f(t) + w and prev <= f(t - 1) + w
        if t and up:
            f, w = up
            row.update(up_line=f(t), up_delay=f(t) - w)
            row["exit_plain"] = bar["close"] < f(t) and prev >= f(t - 1)
            row["exit_delay"] = bar["close"] < f(t) - w and prev >= f(t - 1) - w
        rows.append(row)
    return rows


def new_account(rules=Rules()):
    return {"balance": rules.initial, "position": None, "trades": [], "curve": [],
            "last_date": None, "cancellations": 0}


def advance(account, row, previous, rules=Rules(), market="stock"):
    """확정된 봉 하나를 한 번만 처리한다(롱 전용). 계좌 dict를 바꾼다."""
    if account["last_date"] and row["date"] <= account["last_date"]:
        raise ValueError("Already processed bar")
    enter_key, exit_key = f"enter_{rules.variant}", f"exit_{rules.variant}"
    p = account["position"]
    exited = False

    def charge(amount, category):
        account["balance"] -= amount
        p[category] += amount

    def close(raw_price, reason):
        nonlocal p, exited
        fill = raw_price * (1 - rules.slippage)
        gross = p["qty"] * (fill - p["entry"])
        fee = fill * p["qty"] * rules.fee
        account["balance"] += gross - fee
        p["fees"] += fee
        net = gross - p["fees"] - p["carry"] + p["dividends"]
        account["trades"].append({**p, "exit_date": row["date"], "exit": fill, "reason": reason,
                                  "gross": gross, "net": net,
                                  "return_pct": net / (p["entry"] * p["qty"]) * 100})
        account["position"] = None
        p, exited = None, True

    if p:
        p["bars"] += 1
        if market == "stock":
            dividend = p["qty"] * row.get("dividend", 0)
            account["balance"] += dividend
            p["dividends"] += dividend
        else:
            for event in row.get("funding", []):
                if event["at_open"]:
                    charge(p["qty"] * event["rate"] * event["mark"], "carry")
        if row["open"] <= p["stop"]:
            close(row["open"], "gap_stop")          # 손절선을 건너뛴 갭은 시가에
        elif previous[exit_key]:
            close(row["open"], "exit_line")         # 어제 종가로 이탈 확인 → 오늘 시가

    if not p and not exited and account["balance"] > 0 and previous[enter_key] and previous["atr"]:
        fill = row["open"] * (1 + rules.slippage)
        distance = rules.stop_atr * previous["atr"]
        if fill - distance > 0:
            # 손절까지 잃을 돈(수수료·미끄러짐 포함)이 계좌의 risk가 되게 수량을 정한다
            stop = fill - distance
            loss_per_unit = distance + rules.fee * (fill + stop) + rules.slippage * stop
            qty = min(account["balance"] * rules.risk / loss_per_unit,
                      account["balance"] / (fill * (1 + rules.fee)))
            fee = qty * fill * rules.fee
            account["balance"] -= fee
            p = {"side": 1, "signal_date": previous["date"], "entry_date": row["date"], "entry": fill,
                 "qty": qty, "stop": stop, "initial_stop": stop, "signal_atr": previous["atr"], "bars": 1,
                 "fees": fee, "carry": 0.0, "dividends": 0.0}
            account["position"] = p
        else:
            account["cancellations"] += 1

    stop_used = p["stop"] if p else None
    if p:
        if market == "crypto":
            stopped = row["low"] <= p["stop"]
            for event in row.get("funding", []):
                if not event["at_open"]:
                    amount = p["qty"] * event["rate"] * event["mark"]
                    charge(max(0, amount) if stopped else amount, "carry")
        if row["low"] <= p["stop"]:
            close(p["stop"], "stop")

    equity = account["balance"] + (p["qty"] * (row["close"] - p["entry"]) if p else 0)
    account["last_date"] = row["date"]
    account["curve"].append({"date": row["date"], "equity": equity, "stop_used": stop_used})


def summary(account, rules=Rules()):
    out = _summary(account, rules)
    trades = account["trades"]
    # '가짜 돌파' 지표: 이탈선이 아니라 손절로 끝난 거래의 비율
    out["stop_rate"] = (sum(t["reason"] in ("stop", "gap_stop") for t in trades) / len(trades) * 100) if trades else None
    return out


def backtest(rows, rules=Rules(), market="stock", start_date=None):
    account = new_account(rules)
    start = max(rules.pivot * 2 + 1, rules.atr_period)
    for i in range(start, len(rows)):
        if start_date and rows[i]["date"] < start_date:
            continue
        if not account["curve"]:
            account["curve"].append({"date": rows[i-1]["date"], "equity": rules.initial})
        advance(account, rows[i], rows[i-1], rules, market)
    return {**summary(account, rules), "trades": account["trades"], "curve": account["curve"]}


def describe(row, rules=Rules()):
    state = ("enter" if row["enter_delay"] else "exit" if row["exit_delay"] else
             "watch" if row["dn_delay"] is not None else "none")
    return {k: row[k] for k in ("date", "close", "atr", "dn_line", "dn_delay", "up_line", "up_delay")} | {"state": state}
