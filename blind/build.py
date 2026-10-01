"""BLIND CHART — 상황이 막 생긴 날을 골라 5일 뒤 결과를 세는 계산기.

- 시세: 바이낸스 공개 일봉(인증키 없음) BTC·ETH·SOL·XRP, 상장 이후 전부.
- 상황: 아래 SITUATIONS 52개. 모두 '그날까지의 데이터'만 쓴다(테스트로 검사).
  상황은 '막 생긴 날'만 센다. 어제도 그 상태였으면 세지 않는다.
- 결과: 5일 뒤 로그수익률을 '크게 오름 / 횡보 / 크게 내림'으로 나눈다.
  '크게'의 기준 = band_k × 최근 20일 일간 변동성 × √5 (config.json에 고정).
- 판정: 2023년 전(설계)과 후(검증)를 따로 세어, 두 구간 모두 같은 쪽으로 치우쳐야 '검증됨'.

실행: python3 blind/build.py
"""
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path
import json
import math
import sys
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent
KLINES = "https://data-api.binance.vision/api/v3/klines?symbol={sym}&interval=1d&startTime={start}&limit=1000"
DAY = 86_400_000
CLASSES = ("up", "flat", "down")


# ---------- 시세 ----------

def fetch_daily(symbol):
    """상장 이후 일봉 전부. 아직 닫히지 않은 오늘 봉은 뺀다."""
    out, start = [], 0
    now = int(time.time() * 1000)
    while True:
        req = Request(KLINES.format(sym=symbol, start=start), headers={"User-Agent": "Mozilla/5.0 AlgoArcade/1.0"})
        with urlopen(req, timeout=30) as res:
            rows = json.load(res)
        if not rows:
            break
        for r in rows:
            if int(r[6]) < now:  # close_time이 지난 봉만
                out.append({"t": int(r[0]), "o": float(r[1]), "h": float(r[2]), "l": float(r[3]),
                            "c": float(r[4]), "v": float(r[5])})
        if len(rows) < 1000:
            break
        start = int(rows[-1][0]) + DAY
    return out


# ---------- 지표 (모두 i번째 값은 0..i만 사용) ----------

def rolling_mean(xs, n):
    out, s = [None] * len(xs), 0.0
    for i, x in enumerate(xs):
        s += x
        if i >= n:
            s -= xs[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def ema(xs, n, start=0):
    """start부터 유효한 xs에 대한 EMA. 첫 값은 SMA로 시작."""
    out = [None] * len(xs)
    if len(xs) - start < n:
        return out
    k = 2 / (n + 1)
    prev = sum(xs[start:start + n]) / n
    out[start + n - 1] = prev
    for i in range(start + n, len(xs)):
        prev = xs[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def series(candles):
    o = [x["o"] for x in candles]
    h = [x["h"] for x in candles]
    l = [x["l"] for x in candles]
    c = [x["c"] for x in candles]
    v = [x["v"] for x in candles]
    n = len(c)
    S = {"o": o, "h": h, "l": l, "c": c, "v": v, "t": [x["t"] for x in candles], "n": n}
    for p in (5, 20, 25, 60, 200):
        S[f"ma{p}"] = rolling_mean(c, p)
    S["ret"] = [None] + [math.log(c[i] / c[i - 1]) for i in range(1, n)]

    # Wilder RSI(14)
    rsi = [None] * n
    if n > 14:
        g = sum(max(c[i] - c[i - 1], 0) for i in range(1, 15)) / 14
        d = sum(max(c[i - 1] - c[i], 0) for i in range(1, 15)) / 14
        for i in range(14, n):
            if i > 14:
                ch = c[i] - c[i - 1]
                g = (g * 13 + max(ch, 0)) / 14
                d = (d * 13 + max(-ch, 0)) / 14
            rsi[i] = 50.0 if g == 0 and d == 0 else 100.0 if d == 0 else 100 - 100 / (1 + g / d)
    S["rsi"] = rsi

    # 스토캐스틱 %K(14)
    stoch = [None] * n
    for i in range(13, n):
        hi, lo = max(h[i - 13:i + 1]), min(l[i - 13:i + 1])
        stoch[i] = 50.0 if hi == lo else (c[i] - lo) / (hi - lo) * 100
    S["stoch"] = stoch

    # 볼린저밴드(20, 2)
    up, lo_, bw = [None] * n, [None] * n, [None] * n
    for i in range(19, n):
        w = c[i - 19:i + 1]
        m = sum(w) / 20
        sd = math.sqrt(sum((x - m) ** 2 for x in w) / 19)
        up[i], lo_[i] = m + 2 * sd, m - 2 * sd
        bw[i] = 4 * sd / m if m else None
    S["bb_up"], S["bb_lo"], S["bb_w"] = up, lo_, bw

    # MACD(12, 26, 9)
    e12, e26 = ema(c, 12), ema(c, 26)
    line = [a - b if a is not None and b is not None else None for a, b in zip(e12, e26)]
    first = next((i for i, x in enumerate(line) if x is not None), n)
    filled = [x if x is not None else 0.0 for x in line]
    sig = ema(filled, 9, start=first)
    S["macd"] = line
    S["macd_sig"] = sig
    S["macd_hist"] = [a - b if a is not None and b is not None else None for a, b in zip(line, sig)]

    # ATR(14) 비율
    atr = [None] * n
    if n > 14:
        trs = [None] + [max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])) for i in range(1, n)]
        a = sum(trs[1:15]) / 14
        atr[14] = a
        for i in range(15, n):
            a = (a * 13 + trs[i]) / 14
            atr[i] = a
    S["atr"] = atr
    S["atrp"] = [a / c[i] if a is not None else None for i, a in enumerate(atr)]

    # 거래량 비율(어제까지 20일 평균 대비)
    vr = [None] * n
    for i in range(20, n):
        m = sum(v[i - 20:i]) / 20
        vr[i] = v[i] / m if m > 0 else None
    S["vol_ratio"] = vr

    # 연속 상승·하락 일수
    us, ds = [0] * n, [0] * n
    for i in range(1, n):
        us[i] = us[i - 1] + 1 if c[i] > c[i - 1] else 0
        ds[i] = ds[i - 1] + 1 if c[i] < c[i - 1] else 0
    S["up_streak"], S["down_streak"] = us, ds

    # 최근 20일 일간 변동성(결과 기준선용)
    sd20 = [None] * n
    r = S["ret"]
    for i in range(20, n):
        w = r[i - 19:i + 1]
        m = sum(w) / 20
        sd20[i] = math.sqrt(sum((x - m) ** 2 for x in w) / 19)
    S["sd20"] = sd20
    return S


# ---------- 상황 52개 ----------

def _ok(*xs):
    return all(x is not None for x in xs)


def cross_up(a, b):
    return lambda S, i: (a(S, i) > b(S, i)) if _ok(a(S, i), b(S, i)) else None


def prior_max(S, key, i, n):
    return max(S[key][i - n:i]) if i >= n else None


def prior_min(S, key, i, n):
    return min(S[key][i - n:i]) if i >= n else None


def ser(name):
    return lambda S, i: S[name][i]


def const(x):
    return lambda S, i: x


def ratio_from(key, n):
    return lambda S, i: S["c"][i] / S["c"][i - n] - 1 if i >= n else None


def wick(kind):
    def f(S, i):
        o, h, l, c, a = S["o"][i], S["h"][i], S["l"][i], S["c"][i], S["atr"][i]
        if a is None:
            return None
        body = abs(c - o)
        tail = (min(o, c) - l) if kind == "low" else (h - max(o, c))
        return (h - l) >= a and tail >= 2 * body and tail >= 0.6 * (h - l)
    return f


def gt(f, x):
    return lambda S, i: (f(S, i) > x) if f(S, i) is not None else None


def ge(f, x):
    return lambda S, i: (f(S, i) >= x) if f(S, i) is not None else None


def lt(f, x):
    return lambda S, i: (f(S, i) < x) if f(S, i) is not None else None


def le(f, x):
    return lambda S, i: (f(S, i) <= x) if f(S, i) is not None else None


def break_high(n):
    return lambda S, i: (S["c"][i] > prior_max(S, "h", i, n)) if i >= n else None


def break_low(n):
    return lambda S, i: (S["c"][i] < prior_min(S, "l", i, n)) if i >= n else None


def above_prior_max(key, n):
    return lambda S, i: (S[key][i] > prior_max(S, key, i, n)) if i >= n and _ok(S[key][i], *S[key][i - n:i]) else None


def below_prior_min(key, n):
    return lambda S, i: (S[key][i] < prior_min(S, key, i, n)) if i >= n and _ok(S[key][i], *S[key][i - n:i]) else None


def hist_run(direction):
    def f(S, i):
        hs = S["macd_hist"][i - 3:i + 1] if i >= 3 else []
        if len(hs) < 4 or not _ok(*hs):
            return None
        pairs = list(zip(hs, hs[1:]))
        return all(b > a for a, b in pairs) if direction > 0 else all(b < a for a, b in pairs)
    return f


def aligned(sign):
    def f(S, i):
        a, b, c = S["ma5"][i], S["ma20"][i], S["ma60"][i]
        if not _ok(a, b, c):
            return None
        return a > b > c if sign > 0 else a < b < c
    return f


def drawdown_1y(S, i):
    if i < 364:
        return None
    return S["c"][i] / max(S["h"][i - 364:i + 1]) - 1


def gap25(S, i):
    m = S["ma25"][i]
    return S["c"][i] / m - 1 if m else None


ret1 = ratio_from("c", 1)
ret3 = ratio_from("c", 3)

# (id, 분류, 이름, 설명, 상태 함수). 상태가 False→True로 바뀐 날이 '막 생긴 날'이다.
SITUATIONS = [
    ("gc_5_20", "추세", "5일선이 20일선 위로", "짧은 평균이 긴 평균을 뚫고 올라감(골든크로스). 최근 흐름이 위로 바뀌었다는 신호로 흔히 읽는다.", cross_up(ser("ma5"), ser("ma20"))),
    ("dc_5_20", "추세", "5일선이 20일선 아래로", "짧은 평균이 긴 평균 아래로 내려감(데드크로스).", cross_up(ser("ma20"), ser("ma5"))),
    ("gc_20_60", "추세", "20일선이 60일선 위로", "한 달 평균이 석 달 평균을 넘어섬. 중기 흐름 전환.", cross_up(ser("ma20"), ser("ma60"))),
    ("dc_20_60", "추세", "20일선이 60일선 아래로", "한 달 평균이 석 달 평균 아래로 내려감.", cross_up(ser("ma60"), ser("ma20"))),
    ("above_200", "추세", "200일선 위로 올라섬", "종가가 200일 평균을 넘어섬. 장기 추세 경계선.", cross_up(ser("c"), ser("ma200"))),
    ("below_200", "추세", "200일선 아래로 내려감", "종가가 200일 평균 아래로 떨어짐.", cross_up(ser("ma200"), ser("c"))),
    ("align_up", "추세", "정배열 시작", "5일 > 20일 > 60일 평균 순서가 막 갖춰짐.", aligned(1)),
    ("align_down", "추세", "역배열 시작", "5일 < 20일 < 60일 평균 순서가 막 갖춰짐.", aligned(-1)),
    ("rsi_70", "과열·침체", "RSI 70 돌파", "최근 오른 힘이 과하게 몰린 상태(과열)에 들어섬.", gt(ser("rsi"), 70)),
    ("rsi_30", "과열·침체", "RSI 30 이탈", "최근 내린 힘이 과하게 몰린 상태(침체)에 들어섬.", lt(ser("rsi"), 30)),
    ("rsi_80", "과열·침체", "RSI 80 돌파", "강한 과열.", gt(ser("rsi"), 80)),
    ("rsi_20", "과열·침체", "RSI 20 이탈", "강한 침체.", lt(ser("rsi"), 20)),
    ("rsi_off70", "과열·침체", "RSI 70 아래로 꺾임", "과열 구간에 있다가 빠져나옴.", lambda S, i: le(ser("rsi"), 70)(S, i) if i and S["rsi"][i - 1] is not None and S["rsi"][i - 1] > 70 else (False if S["rsi"][i] is not None else None)),
    ("rsi_off30", "과열·침체", "RSI 30 위로 회복", "침체 구간에 있다가 빠져나옴.", lambda S, i: ge(ser("rsi"), 30)(S, i) if i and S["rsi"][i - 1] is not None and S["rsi"][i - 1] < 30 else (False if S["rsi"][i] is not None else None)),
    ("stoch_80", "과열·침체", "스토캐스틱 80 돌파", "최근 14일 범위의 맨 위쪽에서 마감.", gt(ser("stoch"), 80)),
    ("stoch_20", "과열·침체", "스토캐스틱 20 이탈", "최근 14일 범위의 맨 아래쪽에서 마감.", lt(ser("stoch"), 20)),
    ("bb_over", "과열·침체", "볼린저밴드 위로 마감", "평소 변동 범위(20일 평균 ±2표준편차) 위로 튀어나감.", cross_up(ser("c"), ser("bb_up"))),
    ("bb_under", "과열·침체", "볼린저밴드 아래로 마감", "평소 변동 범위 아래로 떨어짐.", cross_up(ser("bb_lo"), ser("c"))),
    ("bb_squeeze", "과열·침체", "밴드 폭 6개월 최저", "변동 범위가 반년 중 가장 좁아짐. 큰 움직임 직전이라는 속설이 있다.", below_prior_min("bb_w", 120)),
    ("macd_up", "모멘텀", "MACD 시그널 상향 돌파", "단기 모멘텀이 신호선을 위로 넘음.", cross_up(ser("macd"), ser("macd_sig"))),
    ("macd_down", "모멘텀", "MACD 시그널 하향 돌파", "단기 모멘텀이 신호선 아래로 내려감.", cross_up(ser("macd_sig"), ser("macd"))),
    ("macd_zero_up", "모멘텀", "MACD 0선 위로", "12일·26일 평균의 차이가 플러스로 바뀜.", gt(ser("macd"), 0)),
    ("macd_zero_down", "모멘텀", "MACD 0선 아래로", "12일·26일 평균의 차이가 마이너스로 바뀜.", lt(ser("macd"), 0)),
    ("hist_rise3", "모멘텀", "히스토그램 3일 연속 증가", "모멘텀이 사흘째 강해짐.", hist_run(1)),
    ("hist_fall3", "모멘텀", "히스토그램 3일 연속 감소", "모멘텀이 사흘째 약해짐.", hist_run(-1)),
    ("high_20", "가격 위치", "20일 최고가 돌파", "종가가 지난 20일 고가를 넘음.", break_high(20)),
    ("low_20", "가격 위치", "20일 최저가 이탈", "종가가 지난 20일 저가 아래.", break_low(20)),
    ("high_60", "가격 위치", "60일 최고가 돌파", "종가가 지난 석 달 고가를 넘음.", break_high(60)),
    ("low_60", "가격 위치", "60일 최저가 이탈", "종가가 지난 석 달 저가 아래.", break_low(60)),
    ("high_365", "가격 위치", "1년 최고가 돌파", "종가가 지난 1년 고가를 넘음.", break_high(365)),
    ("low_365", "가격 위치", "1년 최저가 이탈", "종가가 지난 1년 저가 아래.", break_low(365)),
    ("dd_50", "가격 위치", "1년 고점 대비 반토막", "1년 최고가에서 50% 넘게 빠짐.", le(drawdown_1y, -0.5)),
    ("gap25_up", "가격 위치", "25일선 위로 15% 이격", "가격이 25일 평균보다 15% 넘게 위. 2번 REBOUND가 보는 이격.", ge(gap25, 0.15)),
    ("gap25_down", "가격 위치", "25일선 아래로 15% 이격", "가격이 25일 평균보다 15% 넘게 아래.", le(gap25, -0.15)),
    ("up3", "연속", "3일 연속 상승", "사흘 내리 올랐다.", ge(ser("up_streak"), 3)),
    ("down3", "연속", "3일 연속 하락", "사흘 내리 내렸다.", ge(ser("down_streak"), 3)),
    ("up5", "연속", "5일 연속 상승", "닷새 내리 올랐다.", ge(ser("up_streak"), 5)),
    ("down5", "연속", "5일 연속 하락", "닷새 내리 내렸다.", ge(ser("down_streak"), 5)),
    ("up7", "연속", "7일 연속 상승", "이레 내리 올랐다.", ge(ser("up_streak"), 7)),
    ("down7", "연속", "7일 연속 하락", "이레 내리 내렸다.", ge(ser("down_streak"), 7)),
    ("jump5", "급변", "하루 5% 넘게 상승", "하루에 5% 이상 뛰었다.", ge(ret1, 0.05)),
    ("drop5", "급변", "하루 5% 넘게 하락", "하루에 5% 이상 빠졌다.", le(ret1, -0.05)),
    ("jump10", "급변", "하루 10% 넘게 상승", "하루에 10% 이상 뛰었다.", ge(ret1, 0.10)),
    ("drop10", "급변", "하루 10% 넘게 하락", "하루에 10% 이상 빠졌다.", le(ret1, -0.10)),
    ("jump3d15", "급변", "3일 15% 넘게 상승", "사흘 만에 15% 이상 올랐다.", ge(ret3, 0.15)),
    ("drop3d15", "급변", "3일 15% 넘게 하락", "사흘 만에 15% 이상 빠졌다.", le(ret3, -0.15)),
    ("tail_low", "급변", "긴 아래꼬리", "장중에 크게 빠졌다가 회복해 마감(아래꼬리가 몸통의 2배 이상).", wick("low")),
    ("tail_high", "급변", "긴 위꼬리", "장중에 크게 올랐다가 밀려 마감(위꼬리가 몸통의 2배 이상).", wick("high")),
    ("vol_x3", "변동성·거래량", "거래량 3배 폭증", "거래량이 지난 20일 평균의 3배 이상.", ge(ser("vol_ratio"), 3)),
    ("vol_dry", "변동성·거래량", "거래량 반토막", "거래량이 지난 20일 평균의 절반 이하.", le(ser("vol_ratio"), 0.5)),
    ("atr_hi", "변동성·거래량", "변동성 60일 최고", "하루 평균 움직임 폭(ATR)이 석 달 중 가장 큼.", above_prior_max("atrp", 60)),
    ("atr_lo", "변동성·거래량", "변동성 60일 최저", "하루 평균 움직임 폭(ATR)이 석 달 중 가장 작음.", below_prior_min("atrp", 60)),
]


def states(S):
    """상황별 상태 목록. True/False/None(자료 부족)."""
    return {sid: [fn(S, i) for i in range(S["n"])] for sid, _g, _n, _d, fn in SITUATIONS}


def onsets(state):
    """어제 False였고 오늘 True인 날만 '막 생긴 날'. 어제가 자료 부족(None)이면 세지 않는다."""
    return [i for i in range(1, len(state)) if state[i] is True and state[i - 1] is False]


def outcome(S, i, cfg):
    """i일 종가 대비 horizon일 뒤 결과. 기준선은 i일까지의 변동성으로만 정한다."""
    h = cfg["horizon"]
    if i + h >= S["n"] or S["sd20"][i] is None or S["sd20"][i] == 0:
        return None
    band = cfg["band_k"] * S["sd20"][i] * math.sqrt(h)
    r = math.log(S["c"][i + h] / S["c"][i])
    return "up" if r > band else "down" if r < -band else "flat"


# ---------- 통계 ----------

def binom_two_sided(k, n, p):
    """정확 이항검정 양측 p값 (foreign-flow/build.py와 같은 방식, 로그 공간)."""
    if n == 0:
        return 1.0
    if p <= 0 or p >= 1:
        return 1.0 if k == round(p * n) else 0.0
    lp, lq = math.log(p), math.log(1 - p)
    logs = [math.lgamma(n + 1) - math.lgamma(i + 1) - math.lgamma(n - i + 1) + i * lp + (n - i) * lq for i in range(n + 1)]
    cut = logs[k] + 1e-9
    return min(1.0, sum(math.exp(x) for x in logs if x <= cut))


def empty():
    return {"n": 0, "up": 0, "flat": 0, "down": 0}


def lean_and_verdict(st, base, cfg):
    """설계 구간에서 기준선보다 가장 많이 늘어난 결과를 '치우침'으로 보고, 검증 구간에서도 확인한다."""
    d, v = st["design"], st["validation"]
    if d["n"] < cfg["min_samples"]:
        return None, "too_few", None, None
    share = lambda s, k: s[k] / s["n"] if s["n"] else 0
    lean = max(CLASSES, key=lambda k: share(d, k) - share(base["design"], k))
    pd = binom_two_sided(d[lean], d["n"], share(base["design"], lean))
    if not (pd < cfg["alpha"] and share(d, lean) > share(base["design"], lean)):
        return lean, "no_lean", pd, None
    if v["n"] < cfg["min_samples"]:
        return lean, "too_few", pd, None
    pv = binom_two_sided(v[lean], v["n"], share(base["validation"], lean))
    if pv < cfg["alpha"] and share(v, lean) > share(base["validation"], lean):
        return lean, "verified", pd, pv
    return lean, "maybe_luck", pd, pv


def main():
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    split = int(datetime.fromisoformat(cfg["validation_start"]).replace(tzinfo=timezone.utc).timestamp() * 1000)
    ids = [s[0] for s in SITUATIONS]

    base = {"design": empty(), "validation": empty()}
    stats = {}                      # 상황 키 → 구간별 결과 수
    instances = []                  # (코인 번호, 날짜 번호, [상황 id])
    today = []
    first_day = {}

    for ci, sym in enumerate(cfg["coins"]):
        try:
            candles = fetch_daily(sym)
        except Exception as err:
            print(f"멈춤: {sym} 일봉을 받지 못했습니다({err})", file=sys.stderr)
            sys.exit(1)
        S = series(candles)
        st = states(S)
        on = {sid: set(onsets(st[sid])) for sid in ids}
        first_day[sym] = S["t"][0] // DAY
        print(f"{sym}: {S['n']}일 ({datetime.fromtimestamp(S['t'][0] / 1000, timezone.utc):%Y-%m-%d} ~)")

        for i in range(cfg["window"] - 1, S["n"]):
            hit = sorted(sid for sid in ids if i in on[sid])
            res = outcome(S, i, cfg)
            if i == S["n"] - 1:
                today.append({"coin": ci, "day": S["t"][i] // DAY, "situations": hit})
            if res is None:
                continue
            period = "validation" if S["t"][i] >= split else "design"
            base[period]["n"] += 1
            base[period][res] += 1
            if not hit:
                continue
            instances.append((ci, S["t"][i] // DAY, hit))
            keys = list(hit) + ["+".join(p) for p in combinations(hit, 2)]
            for key in keys:
                s = stats.setdefault(key, {"design": empty(), "validation": empty()})
                s[period]["n"] += 1
                s[period][res] += 1

    meta = {sid: (g, name, desc) for sid, g, name, desc, _f in SITUATIONS}
    kept = []
    for key, st in stats.items():
        total = st["design"]["n"] + st["validation"]["n"]
        if total < cfg["min_samples"]:
            continue
        parts = key.split("+")
        lean, verdict, pd, pv = lean_and_verdict(st, base, cfg)
        kept.append({
            "key": key,
            "parts": parts,
            "group": meta[parts[0]][0] if len(parts) == 1 else "조합",
            "name": " + ".join(meta[p][1] for p in parts),
            "desc": meta[parts[0]][2] if len(parts) == 1 else "두 상황이 같은 날 함께 생겼다.",
            "design": st["design"], "validation": st["validation"],
            "lean": lean, "verdict": verdict,
            "p_design": round(pd, 4) if pd is not None else None,
            "p_validation": round(pv, 4) if pv is not None else None,
        })
    kept.sort(key=lambda s: (len(s["parts"]), ids.index(s["parts"][0]), s["key"]))
    kept_base = {s["key"] for s in kept if len(s["parts"]) == 1}

    pool = []
    for ci, day, hit in instances:
        hit = [h for h in hit if h in kept_base]
        if hit:
            pool.append([ci, day, [ids.index(h) for h in hit]])
    for t in today:
        t["situations"] = [ids.index(h) for h in t["situations"] if h in kept_base]

    counts = {}
    for s in kept:
        counts[s["verdict"]] = counts.get(s["verdict"], 0) + 1
    out = {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rules": cfg,
        "ids": ids,
        "first_day": first_day,
        "base": base,
        "situations": kept,
        "verdict_counts": counts,
        "pool": pool,
        "today": today,
    }
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    (SITE / "data").mkdir(exist_ok=True)
    (SITE / "data" / "blind.json").write_text(text + "\n", encoding="utf-8")
    (SITE / "data" / "blind-data.js").write_text(f"window.BLIND_DATA = {text};\n", encoding="utf-8")
    nb = sum(1 for s in kept if len(s["parts"]) == 1)
    print(f"기준선: 설계 {base['design']} / 검증 {base['validation']}")
    print(f"상황 {nb}개 + 조합 {len(kept) - nb}개 (표본 {cfg['min_samples']}번 이상) · 판정 {counts} · 문제 {len(pool)}개 · {len(text) // 1024}KB")


if __name__ == "__main__":
    main()
