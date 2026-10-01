"""오늘의 한 판 — 비트코인 내일 이 시간을 사람·군중·기계가 함께 맞히는 판.

- 시세: 바이낸스 공개 BTC 일봉(인증키 없음). 닫힌 봉만 쓴다.
- 회차: 마지막으로 닫힌 UTC 일봉 날짜 d. d 종가(한국 d+1일 09:00)와 d+1 종가(한국 d+2일 09:00)를 비교해
  크게 오름(up) / 횡보(flat) / 크게 내림(down)으로 나눈다. '크게' = band_k × 최근 20일 변동성 × √horizon.
- 기계 선수: 5번·2번 엔진을 그대로 불러 쓰고, 1번 데모의 논조 점수를 같은 규칙으로 옮겼다.
  모두 d일까지의 자료만 쓴다(테스트로 검사).
- 사람 투표: 구글 폼 → 시트 '웹에 게시' CSV(환경 변수 ARENA_CSV_URL). 방문자가 쓴 값이라 믿지 않는다.
  잘못된 행은 건너뛰고(배포는 멈추지 않는다), 방문자 한 명당 회차마다 처음 한 표만 센다.
  공개 파일에는 방문자 번호를 내보내지 않는다.

실행: python3 arena/build.py
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import csv
import hashlib
import io
import json
import math
import os
import re
import sys
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent
sys.path.insert(0, str(SITE))
from breakout.engine import indicators as bo_indicators, signal as bo_signal  # noqa: E402
from rebound.engine import indicators as rb_indicators, signal as rb_signal  # noqa: E402

KLINES = "https://data-api.binance.vision/api/v3/klines?symbol={sym}&interval=1d&startTime={start}&limit=1000"
DAY = 86_400_000
CHOICES = ("up", "flat", "down")
SIDE = {1: "up", -1: "down", 0: "flat"}


# ---------- 시세 ----------

def get(url, timeout=30):
    with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0 AlgoArcade/1.0"}), timeout=timeout) as res:
        return res.read()


def fetch_daily(symbol):
    """상장 이후 닫힌 일봉 전부 → [{date, t, open, high, low, close}]"""
    out, start, now = [], 0, int(time.time() * 1000)
    while True:
        rows = json.loads(get(KLINES.format(sym=symbol, start=start)))
        if not rows:
            break
        for r in rows:
            if int(r[6]) < now:
                t = int(r[0])
                out.append({"date": datetime.fromtimestamp(t / 1000, timezone.utc).date().isoformat(), "t": t,
                            "open": float(r[1]), "high": float(r[2]), "low": float(r[3]), "close": float(r[4])})
        if len(rows) < 1000:
            break
        start = int(rows[-1][0]) + DAY
    return out


# ---------- 지표 (i번째 값은 0..i만 사용) ----------

def sma(xs, n):
    out, s = [None] * len(xs), 0.0
    for i, x in enumerate(xs):
        s += x
        if i >= n:
            s -= xs[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def ema(xs, n, start=0):
    out = [None] * len(xs)
    if len(xs) - start < n:
        return out
    k, prev = 2 / (n + 1), sum(xs[start:start + n]) / n
    out[start + n - 1] = prev
    for i in range(start + n, len(xs)):
        prev = xs[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(c, p=14):
    out = [None] * len(c)
    if len(c) <= p:
        return out
    g = sum(max(c[i] - c[i - 1], 0) for i in range(1, p + 1)) / p
    d = sum(max(c[i - 1] - c[i], 0) for i in range(1, p + 1)) / p
    for i in range(p, len(c)):
        if i > p:
            ch = c[i] - c[i - 1]
            g = (g * (p - 1) + max(ch, 0)) / p
            d = (d * (p - 1) + max(-ch, 0)) / p
        out[i] = 50.0 if g == 0 and d == 0 else 100.0 if d == 0 else 100 - 100 / (1 + g / d)
    return out


def sd20(c):
    """i일까지 20개 일간 로그수익률의 표준편차."""
    r = [None] + [math.log(c[i] / c[i - 1]) for i in range(1, len(c))]
    out = [None] * len(c)
    for i in range(20, len(c)):
        w = r[i - 19:i + 1]
        m = sum(w) / 20
        out[i] = math.sqrt(sum((x - m) ** 2 for x in w) / 19)
    return out


def floor_tone(close, ma20, ma50, rsi14, hist):
    """1번 데모 readTone()과 같은 점수. 자료가 모자라면 None."""
    if None in (ma20, ma50, rsi14, hist):
        return None
    gap = (close / ma20 - 1) * 100
    score = 0
    score += -1 if rsi14 > 70 else 1 if rsi14 < 30 else 0
    score += 1 if ma20 > ma50 else -1 if ma20 < ma50 else 0
    score += 1 if hist > 0 else -1 if hist < 0 else 0
    score += -1 if gap > 12 else 1 if gap < -12 else 0
    return "up" if score >= 2 else "down" if score <= -2 else "flat"


def monkey(round_id):
    return CHOICES[int(hashlib.sha256(round_id.encode()).hexdigest(), 16) % 3]


def machine_picks(bars):
    """날짜별 기계 선택 [{key: choice or None}]. i번째는 bars[0..i]만으로 정해진다."""
    c = [b["close"] for b in bars]
    bo = bo_indicators([{k: b[k] for k in ("date", "open", "high", "low", "close")} for b in bars])
    rb = rb_indicators([{k: b[k] for k in ("date", "open", "high", "low", "close")} for b in bars])
    ma20, ma50, r14 = sma(c, 20), sma(c, 50), rsi(c)
    e12, e26 = ema(c, 12), ema(c, 26)
    line = [a - b if a is not None and b is not None else None for a, b in zip(e12, e26)]
    first = next((i for i, x in enumerate(line) if x is not None), len(c))
    sig = ema([x if x is not None else 0.0 for x in line], 9, start=first)
    hist = [a - b if a is not None and b is not None else None for a, b in zip(line, sig)]
    out = []
    for i, b in enumerate(bars):
        ready_bo = bo[i]["upper"] is not None and bo[i]["atr"]
        ready_rb = rb[i]["sma200"] is not None and rb[i]["atr"]
        out.append({
            "breakout": SIDE[bo_signal(bo[i])] if ready_bo else None,
            "rebound": SIDE[rb_signal(rb[i])] if ready_rb else None,
            "floor": floor_tone(c[i], ma20[i], ma50[i], r14[i], hist[i]),
            "flat": "flat",
            "monkey": monkey(b["date"]),
        })
    return out


def outcome(c, sd, i, k, horizon=1):
    """i일 종가 대비 horizon일 뒤. 기준선은 i일까지의 변동성으로만."""
    if i + horizon >= len(c) or sd[i] is None or sd[i] == 0:
        return None, None, None
    band = k * sd[i] * math.sqrt(horizon)
    r = math.log(c[i + horizon] / c[i])
    return ("up" if r > band else "down" if r < -band else "flat"), r, band


# ---------- 투표 ----------

TS_PATTERNS = [
    (re.compile(r"^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s+(오전|오후)\s+(\d{1,2}):(\d{2}):(\d{2})$"), "ko"),
    (re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$"), "us"),
    (re.compile(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$"), "iso"),
]


def parse_ts(text, tz_hours):
    """구글 시트 타임스탬프(한국어·미국식·ISO) → UTC datetime. 모르면 None."""
    s = text.strip()
    for pat, kind in TS_PATTERNS:
        m = pat.match(s)
        if not m:
            continue
        g = m.groups()
        if kind == "ko":
            y, mo, d, ap, h, mi, se = int(g[0]), int(g[1]), int(g[2]), g[3], int(g[4]), int(g[5]), int(g[6])
            h = (h % 12) + (12 if ap == "오후" else 0)
        elif kind == "us":
            mo, d, y, h, mi, se = map(int, g)
        else:
            y, mo, d, h, mi, se = map(int, g)
        try:
            local = datetime(y, mo, d, h, mi, se, tzinfo=timezone(timedelta(hours=tz_hours)))
        except ValueError:
            return None
        return local.astimezone(timezone.utc)
    return None


def round_window(round_id):
    """회차 d의 투표 시간: d+1일 00:00 UTC 이상, d+2일 00:00 UTC 미만."""
    d = datetime.fromisoformat(round_id).replace(tzinfo=timezone.utc)
    return d + timedelta(days=1), d + timedelta(days=2)


def clean_nickname(raw, cfg):
    s = " ".join((raw or "").split())
    if not s or len(s) > cfg["max_length"] or "http" in s.lower() or "www" in s.lower():
        return None
    return s if re.match(cfg["pattern"], s) else None


def read_votes(text, cfg):
    """CSV → (유효 표 목록, 숨긴 방문자 집합, 건너뛴 행 수). 방문자·회차마다 가장 이른 한 표만."""
    reader = csv.DictReader(io.StringIO(text))
    col = {(h or "").strip(): h for h in (reader.fieldnames or [])}
    ts_key = col.get("타임스탬프") or col.get("Timestamp")
    need = ["회차", "예측", "방문자"]
    if not ts_key or any(k not in col for k in need):
        raise ValueError(f"열 이름이 다릅니다. 필요: 타임스탬프, {', '.join(need)}, 닉네임 / 현재: {', '.join(col)}")
    votes, hidden, skipped = {}, set(), 0
    for raw in reader:
        g = lambda k: (raw.get(col[k]) or "").strip() if k in col else ""
        visitor, round_id, choice = g("방문자").lower(), g("회차"), g("예측").lower()
        if g("숨김").upper() in ("Y", "예", "숨김") and re.match(r"^[a-z0-9]{8,32}$", visitor):
            hidden.add(visitor)
        at = parse_ts(raw.get(ts_key) or "", cfg["sheet_timezone_hours"])
        ok = (re.match(r"^[a-z0-9]{8,32}$", visitor) and re.match(r"^\d{4}-\d{2}-\d{2}$", round_id)
              and choice in CHOICES and at is not None)
        if ok:
            try:
                opens, closes = round_window(round_id)
            except ValueError:
                ok = False
            else:
                ok = opens <= at < closes
        if not ok:
            skipped += 1
            continue
        key = (visitor, round_id)
        if key in votes and votes[key]["at"] <= at:
            continue
        votes[key] = {"visitor": visitor, "round": round_id, "choice": choice, "at": at,
                      "nickname": clean_nickname(g("닉네임"), cfg["nickname"])}
    return list(votes.values()), hidden, skipped


def tag(visitor):
    """같은 닉네임을 구분하는 짧은 표시. 방문자 번호 자체는 내보내지 않는다."""
    return hashlib.sha256(("arena:" + visitor).encode()).hexdigest()[:4]


# ---------- 모으기 ----------

def build(bars, votes, hidden, cfg, now=None):
    now = now or datetime.now(timezone.utc)
    c = [b["close"] for b in bars]
    sd = sd20(c)
    picks = machine_picks(bars)
    keys = [p["key"] for p in cfg["players"]]

    # 기계 선수의 긴 기록: 모든 기계가 판단할 수 있는 첫날부터
    long_run = {k: {"n": 0, "hit": 0} for k in keys}
    first = next((i for i, p in enumerate(picks) if all(p[k] for k in keys)), len(bars))
    for i in range(first, len(bars)):
        ans, _r, _b = outcome(c, sd, i, cfg["band_k"], cfg["horizon_days"])
        if ans is None:
            continue
        for k in keys:
            long_run[k]["n"] += 1
            long_run[k]["hit"] += picks[i][k] == ans

    # 회차: 시작일부터 마지막 닫힌 봉까지
    by_round = {}
    for v in votes:
        by_round.setdefault(v["round"], []).append(v)
    rounds = []
    # 시작 회차 = 공개한 날 투표할 수 있던 회차(그 전날 일봉)
    start = max(next((i for i, b in enumerate(bars) if b["date"] >= cfg["start"]), len(bars)), first)
    for i in range(start, len(bars)):
        rid = bars[i]["date"]
        ans, r, band = outcome(c, sd, i, cfg["band_k"], cfg["horizon_days"])
        vs = by_round.get(rid, [])
        crowd = {k: sum(1 for v in vs if v["choice"] == k) for k in CHOICES}
        top = max(CHOICES, key=lambda k: crowd[k])
        crowd_pick = top if vs and sum(1 for k in CHOICES if crowd[k] == crowd[top]) == 1 else None
        opens, closes = round_window(rid)
        if band is None:
            band = cfg["band_k"] * sd[i] * math.sqrt(cfg["horizon_days"]) if sd[i] else None
        rounds.append({"id": rid, "opens": opens.isoformat(), "closes": closes.isoformat(),
                       "close": c[i], "band": band, "answer": ans,
                       "move": r, "next_close": c[i + 1] if i + 1 < len(c) else None,
                       "picks": picks[i], "crowd": {**crowd, "n": len(vs), "pick": crowd_pick}})

    # 선수 성적(시작일 이후): 기계 + 군중 + 사람
    resolved = [r for r in rounds if r["answer"]]
    table = []
    for p in cfg["players"]:
        n = sum(1 for r in resolved if r["picks"][p["key"]])
        hit = sum(1 for r in resolved if r["picks"][p["key"]] == r["answer"])
        lr = long_run[p["key"]]
        table.append({**p, "kind": "machine", "n": n, "hit": hit,
                      "long_n": lr["n"], "long_hit": lr["hit"]})
    cn = sum(1 for r in resolved if r["crowd"]["pick"])
    ch = sum(1 for r in resolved if r["crowd"]["pick"] == r["answer"])
    table.append({"key": "crowd", "name": "방문자 군중(다수결)", "href": None, "kind": "crowd",
                  "rule": "그 회차에 가장 많이 고른 답. 동점이면 빠진다", "n": cn, "hit": ch})

    answers = {r["id"]: r["answer"] for r in resolved}
    people = {}
    for v in votes:
        if v["round"] not in answers:
            continue
        p = people.setdefault(v["visitor"], {"n": 0, "hit": 0, "nickname": None, "last": None})
        p["n"] += 1
        p["hit"] += v["choice"] == answers[v["round"]]
        if v["nickname"] and (p["last"] is None or v["at"] > p["last"]):
            p["nickname"], p["last"] = v["nickname"], v["at"]
    board = [{"name": p["nickname"], "tag": tag(vid), "n": p["n"], "hit": p["hit"]}
             for vid, p in people.items()
             if p["nickname"] and vid not in hidden and p["n"] >= cfg["min_rounds_for_board"]]
    board.sort(key=lambda b: (-b["hit"] / b["n"], -b["n"], b["name"]))

    form = cfg["form"]
    form_ready = bool(form["action"]) and all(form["entries"].values())
    return {
        "schema": 1,
        "generated_at": now.isoformat(timespec="seconds"),
        "rules": {k: cfg[k] for k in ("version", "fixed_at", "symbol", "horizon_days", "band_k", "band_note",
                                      "round_note", "start", "min_rounds_for_board")},
        "form": {"action": form["action"], "entries": form["entries"]} if form_ready else None,
        "players": table,
        "board": board[:cfg["board_size"]],
        "people": {"visitors": len({v["visitor"] for v in votes}), "votes": len(votes)},
        "rounds": rounds[-30:],
        "chart": [{k: b[k] for k in ("t", "open", "high", "low", "close")} for b in bars[-60:]],
    }


def main():
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    try:
        bars = fetch_daily(cfg["symbol"])
    except Exception as err:
        print(f"멈춤: 일봉을 받지 못했습니다({err})", file=sys.stderr)
        sys.exit(1)

    votes, hidden, skipped, source = [], set(), 0, "없음(폼 연결 전)"
    url = os.environ.get("ARENA_CSV_URL", "").strip()
    if url:
        try:
            text = get(url).decode("utf-8-sig")
            votes, hidden, skipped = read_votes(text, cfg)
            source = "구글 시트(웹에 게시한 CSV)"
        except Exception as err:  # 방문자 표를 못 읽어도 판 자체는 계속 연다
            print(f"경고: 투표 시트를 읽지 못함({err})", file=sys.stderr)
            source = "시트 읽기 실패 — 이번 집계에서 빠짐"
    out = build(bars, votes, hidden, cfg)
    out["votes_source"] = source
    out["votes_skipped"] = skipped
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    (SITE / "data").mkdir(exist_ok=True)
    (SITE / "data" / "arena.json").write_text(text + "\n", encoding="utf-8")
    (SITE / "data" / "arena-data.js").write_text(f"window.ARENA_DATA = {text};\n", encoding="utf-8")
    last = out["rounds"][-1] if out["rounds"] else None
    print(f"일봉 {len(bars)}개 · 회차 {len(out['rounds'])}개 · 표 {len(votes)}개(건너뜀 {skipped}) · 투표 출처 {source}")
    for p in out["players"]:
        lr = f" · 긴 기록 {p['long_hit']}/{p['long_n']}" if p.get("long_n") else ""
        print(f"  {p['name']}: {p['hit']}/{p['n']}{lr}")
    if last:
        print(f"  오늘 회차 {last['id']} 기계 선택 {last['picks']}")


if __name__ == "__main__":
    main()
