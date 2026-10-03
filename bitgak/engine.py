"""BITGAK (빗각 · 지연 추세선). Pure daily-bar research engine; no order API.

아이디어: 커뮤니티에 정리된 '인범 빗각'·'지연 추세선' 글의 생각을 일봉 규칙으로 고정했다.
- 고점 두 개를 이은 하락 빗각과, 그 선을 저점까지 평행 복사한 채널을 만든다.
- 지연선 = 빗각을 채널 폭만큼 위로 한 번 더 복사한 선. 종가가 이 선을 위로 넘으면 매수 신호(다음 시가).
- 매도는 사람이 정한다. 빗각은 오래 기다려야 하는 자리라서, 알고리즘은 자리만 알려 주고
  신호 뒤 가격이 어떻게 움직였는지(5·20·60일 뒤, 60일 안 최고·최저)만 잰다.
- 비교: 같은 빗각을 지연 없이 넘은 날(빗각 그대로), 그리고 아무 날.

미래 정보 금지: 고점·저점은 좌우 PIVOT개 봉 중 가장 높은(낮은) 봉이며, 오른쪽 PIVOT개 봉이
지나 확정된 뒤에만 선에 쓴다. 신호는 그날 종가로 판단하고, 기준 가격은 다음 봉 시가다.
"""
from dataclasses import dataclass

from breakout.engine import validate_bars


@dataclass(frozen=True)
class Rules:
    version: str = "2.0.0"    # 2.0: 매도 규칙을 빼고 신호 뒤 움직임만 잰다
    pivot: int = 5            # 좌우 몇 개 봉 중 가장 높은(낮은) 봉을 고점(저점)으로 볼지
    atr_period: int = 14


def _line(a, b):
    """두 점 (index, price)을 지나는 직선. 반환: x에서의 값."""
    slope = (b[1] - a[1]) / (b[0] - a[0])
    return lambda x: a[1] + slope * (x - a[0])


def indicators(bars, rules=Rules()):
    """각 봉에 그날 종가 시점까지 알 수 있는 빗각 값과 신호를 붙인다."""
    validate_bars(bars)
    k = rules.pivot
    rows, trs, highs = [], [], []   # highs: 확정된 고점 (index, price)
    atr = None
    down = None   # 현재 쓰는 하락 빗각: (선 함수, 채널 폭, 정의)
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
            hs = [b["high"] for b in window]
            if bars[i]["high"] == max(hs) and hs.index(max(hs)) == k:
                highs.append((i, bars[i]["high"]))
                if len(highs) >= 2 and highs[-1][1] < highs[-2][1]:
                    a, b = highs[-2], highs[-1]
                    f = _line(a, b)
                    # 고점-고점 선을 두 고점 사이 가장 깊은 저점까지 평행 복사 → 채널 폭
                    width = max(f(x) - bars[x]["low"] for x in range(a[0], b[0] + 1))
                    down = (f, max(width, 0.0), {"a": [bars[a[0]]["date"], a[1]], "b": [bars[b[0]]["date"], b[1]], "w": max(width, 0.0)})
                else:
                    down = None   # 최근 두 고점이 내려가지 않으면 하락 빗각 없음

        row = dict(bar, atr=atr, dn_line=None, dn_delay=None, dn_def=None, enter_delay=False, enter_plain=False)
        if t and down:
            f, w, row["dn_def"] = down
            row.update(dn_line=f(t), dn_delay=f(t) + w)
            # 같은 선으로 어제와 오늘을 비교해야 선이 바뀌는 날 가짜 교차가 생기지 않는다
            row["enter_plain"] = bar["close"] > f(t) and prev <= f(t - 1)
            row["enter_delay"] = bar["close"] > f(t) + w and prev <= f(t - 1) + w
        rows.append(row)
    return rows


def describe(row, rules=Rules()):
    state = "enter" if row["enter_delay"] else "watch" if row["dn_delay"] is not None else "none"
    out = {k: row[k] for k in ("date", "close", "atr", "dn_line", "dn_delay", "dn_def")} | {"state": state}
    out["to_delay_pct"] = (row["dn_delay"] / row["close"] - 1) * 100 if row["dn_delay"] is not None else None
    return out


# ---------- 매도는 사람이: 신호 뒤에 가격이 어떻게 움직였는지만 잰다 ----------
HORIZONS = (5, 20, 60)
WINDOW = 60


def after_signal(rows, i, window=WINDOW):
    """i번째 봉 종가에서 신호 → 다음 봉 시가에 샀다고 보고, 그 뒤 가격의 움직임."""
    entry = rows[i + 1]["open"]
    ahead = rows[i + 1:i + 1 + window]
    hi = max(range(len(ahead)), key=lambda k: ahead[k]["high"])
    lo = min(range(len(ahead)), key=lambda k: ahead[k]["low"])
    out = {"signal_date": rows[i]["date"], "entry_date": rows[i + 1]["date"], "entry": entry,
           "complete": len(ahead) == window,
           "best": (ahead[hi]["high"] / entry - 1) * 100, "best_day": hi + 1,
           "worst": (ahead[lo]["low"] / entry - 1) * 100, "worst_day": lo + 1}
    for h in HORIZONS:
        out[f"r{h}"] = (rows[i + h]["close"] / entry - 1) * 100 if i + h < len(rows) else None
    return out


def _mean(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def signal_stats(rows, key, start_date=None):
    """key 신호(enter_delay / enter_plain / None = 아무 날)의 신호 뒤 성적표."""
    picks = [i for i in range(1, len(rows) - 1)
             if (not start_date or rows[i]["date"] >= start_date) and (key is None or rows[i][key])]
    events = [after_signal(rows, i) for i in picks]
    done = [e for e in events if e["complete"]]
    summary = {"count": len(events), "complete": len(done),
               "best": _mean(e["best"] for e in done), "worst": _mean(e["worst"] for e in done)}
    for h in HORIZONS:
        rs = [e[f"r{h}"] for e in events if e[f"r{h}"] is not None]
        summary[f"r{h}"] = _mean(rs)
        summary[f"up{h}"] = sum(r > 0 for r in rs) / len(rs) * 100 if rs else None
    return summary, events
