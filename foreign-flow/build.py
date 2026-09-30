"""FOREIGN FLOW. 외국인 순매수 다음에 코스피가 어떻게 움직였는지 세는 계산기.

- 외국인 순매수: KRX 정보데이터시스템 '투자자별 거래실적(일별추이, KOSPI, 거래대금, 순매수)' CSV.
  로그인해서 내려받은 원본은 foreign-flow/raw/에 두고 저장소에는 올리지 않는다.
- 코스피 종가: 야후 파이낸스 ^KS11 공개 차트(인증키 없음).
- 공개하는 것은 요약 통계(data/foreign-flow.json)뿐이다. 일별 원본 값은 내보내지 않는다.

실행: python3 foreign-flow/build.py
"""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import csv
import json
import math
import sys
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent
RAW_DIR = ROOT / "raw"
CACHE = ROOT / "cache" / "kospi.json"
KST = timezone(timedelta(hours=9))
YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?period1={start}&period2={end}&interval=1d"


# ---------- 읽기 ----------

def load_krx(raw_dir):
    """여러 CSV를 합쳐 {날짜: 외국인 순매수(백만원)}를 돌려준다. 겹친 날 값이 다르면 멈춘다."""
    flows = {}
    files = sorted(Path(raw_dir).glob("*.csv"))
    if not files:
        raise SystemExit(f"KRX CSV가 없습니다: {raw_dir}")
    for path in files:
        with open(path, encoding="cp949") as fh:
            reader = csv.reader(fh)
            header = next(reader)
            if header[:5] != ["일자", "기관 합계", "기타법인", "개인", "외국인 합계"]:
                raise SystemExit(f"{path.name}: 열 이름이 예상과 다릅니다: {header}")
            for line, row in enumerate(reader, start=2):
                day = row[0].replace("/", "-")
                inst, corp, indiv, foreign = (float(x) for x in row[1:5])
                if abs(inst + corp + indiv + foreign) > 1:
                    raise SystemExit(f"{path.name} {line}행: 네 주체 순매수 합이 0이 아닙니다.")
                if day in flows and flows[day] != foreign:
                    raise SystemExit(f"{day}: 파일마다 외국인 값이 다릅니다.")
                flows[day] = foreign
    return flows


def load_kospi(first_day):
    """{날짜: 종가}. 받기에 실패하면 지난번 캐시를 쓴다."""
    start = int(datetime.fromisoformat(first_day).replace(tzinfo=KST).timestamp()) - 86400 * 10
    end = int(datetime.now(KST).timestamp()) + 86400
    try:
        req = Request(YAHOO.format(start=start, end=end), headers={"User-Agent": "Mozilla/5.0 AlgoArcadeResearch/1.0"})
        with urlopen(req, timeout=30) as res:
            chart = json.load(res)["chart"]["result"][0]
        closes = {}
        for ts, close in zip(chart["timestamp"], chart["indicators"]["quote"][0]["close"]):
            if close:
                closes[datetime.fromtimestamp(ts, KST).date().isoformat()] = close
        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps(closes), encoding="utf-8")
        return closes, "online"
    except Exception as err:  # 네트워크 실패 시 캐시로 계속한다
        if not CACHE.exists():
            raise SystemExit(f"코스피 시세를 받지 못했고 캐시도 없습니다: {err}")
        print(f"경고: 코스피 시세 받기 실패({err}). 캐시를 씁니다.", file=sys.stderr)
        return json.loads(CACHE.read_text(encoding="utf-8")), "cache"


# ---------- 계산 (순수 함수: 테스트 대상) ----------

def align(flows, closes):
    """두 자료에 모두 있는 날만 날짜순으로 맞춘다."""
    days = sorted(set(flows) & set(closes))
    return days, [flows[d] for d in days], [closes[d] for d in days]


def zscores(values, window):
    """i번째 값을 '그 전 window일'의 평균·표준편차로 표준화한다. 그날과 이후 값은 쓰지 않는다."""
    out = [None] * len(values)
    for i in range(window, len(values)):
        past = values[i - window:i]
        mean = sum(past) / window
        sd = math.sqrt(sum((x - mean) ** 2 for x in past) / (window - 1))
        out[i] = (values[i] - mean) / sd if sd > 0 else None
    return out


def forward_return(closes, i, horizon):
    j = i + horizon
    return closes[j] / closes[i] - 1 if j < len(closes) else None


def streak_starts(values, days_needed):
    """순매수가 days_needed일째 이어진 '첫날'만 고른다. 6일, 7일째는 겹치므로 세지 않는다."""
    hits = []
    run = 0
    for i, v in enumerate(values):
        run = run + 1 if v > 0 else 0
        if run == days_needed:
            hits.append(i)
    return hits


def binom_two_sided(k, n, p):
    """정확 이항검정 양측 p값: 관측값보다 일어나기 어려운 경우의 확률 합."""
    if n == 0:
        return 1.0
    if p <= 0 or p >= 1:
        return 1.0 if k == round(p * n) else 0.0
    # 표본이 수천 개면 조합 수가 float 범위를 넘으므로 로그로 계산한다.
    lp, lq = math.log(p), math.log(1 - p)
    logs = [math.lgamma(n + 1) - math.lgamma(i + 1) - math.lgamma(n - i + 1) + i * lp + (n - i) * lq
            for i in range(n + 1)]
    cut = logs[k] + 1e-9
    return min(1.0, sum(math.exp(x) for x in logs if x <= cut))


def summarize(rets):
    n = len(rets)
    up = sum(1 for r in rets if r > 0)
    return {"n": n, "up": up, "up_share": up / n if n else None, "mean": sum(rets) / n if n else None}


def compare(signal_rets, base_rets, cfg):
    s, b = summarize(signal_rets), summarize(base_rets)
    p = binom_two_sided(s["up"], s["n"], b["up_share"]) if s["n"] and b["n"] else None
    direction = None
    if s["n"] and b["n"]:
        diff = s["up_share"] - b["up_share"]
        direction = "up" if diff > 0 else "down" if diff < 0 else "none"
    return {"signal": s, "base": b, "p_value": p, "direction": direction,
            "significant": p is not None and p < cfg["alpha"] and s["n"] >= cfg["min_samples"]}


def verdict(design, validation, cfg):
    """config에 고정한 판정 규칙."""
    if design["signal"]["n"] < cfg["min_samples"] or validation["signal"]["n"] < cfg["min_samples"]:
        return "uncertain", "표본 부족"
    same_dir = design["direction"] == validation["direction"] and design["direction"] in ("up", "down")
    if design["significant"] and validation["significant"] and same_dir:
        return "effect", "두 구간 모두 같은 방향으로 유의"
    if not design["significant"] and not validation["significant"]:
        return "none", "두 구간 모두 기준선과 차이가 우연 범위"
    return "uncertain", "한 구간에서만 유의하거나 방향이 엇갈림"


# ---------- 질문 ----------

def questions(days, flows, closes, cfg):
    z = zscores(flows, cfg["window"])
    first = cfg["window"]  # 표준화가 가능한 첫날부터 기준선도 같이 센다
    split = cfg["validation_start"]
    h5 = cfg["streak_horizon"]
    streak_set = set(streak_starts(flows, cfg["streak_days"]))

    def period(i):
        return "validation" if days[i] >= split else "design"

    specs = [
        {"id": "same_day", "title": "같은 날 (함정 보여 주기)", "horizon": 0,
         "signal": "외국인 순매수(+)인 날", "measure": "그날 코스피 등락",
         "is_signal": lambda i: flows[i] > 0,
         "ret": lambda i: closes[i] / closes[i - 1] - 1 if i > 0 else None},
        {"id": "big_buy", "title": "대량 순매수 다음 날", "horizon": 1,
         "signal": f"표준화 값 +{cfg['z_threshold']:g} 이상", "measure": "다음 날 코스피 등락",
         "is_signal": lambda i: z[i] is not None and z[i] >= cfg["z_threshold"],
         "ret": lambda i: forward_return(closes, i, 1)},
        {"id": "streak", "title": f"{cfg['streak_days']}일 연속 순매수 뒤", "horizon": h5,
         "signal": f"{cfg['streak_days']}거래일 연속 순매수(+) 첫날", "measure": f"그 뒤 {h5}거래일 코스피 등락",
         "is_signal": lambda i: i in streak_set,
         "ret": lambda i: forward_return(closes, i, h5)},
        {"id": "big_sell", "title": "대량 순매도 다음 날", "horizon": 1,
         "signal": f"표준화 값 −{cfg['z_threshold']:g} 이하", "measure": "다음 날 코스피 등락",
         "is_signal": lambda i: z[i] is not None and z[i] <= -cfg["z_threshold"],
         "ret": lambda i: forward_return(closes, i, 1)},
    ]

    results = []
    for q in specs:
        buckets = {"design": ([], []), "validation": ([], [])}
        for i in range(first, len(days)):
            r = q["ret"](i)
            if r is None:
                continue
            sig, base = buckets[period(i)]
            base.append(r)
            if q["is_signal"](i):
                sig.append(r)
        periods = {name: compare(sig, base, cfg) for name, (sig, base) in buckets.items()}
        code, reason = verdict(periods["design"], periods["validation"], cfg)
        results.append({k: q[k] for k in ("id", "title", "horizon", "signal", "measure")}
                       | {"periods": periods, "verdict": code, "verdict_reason": reason})

    latest = len(days) - 1
    today = {"date": days[latest], "z": round(z[latest], 2) if z[latest] is not None else None,
             "direction": "buy" if flows[latest] > 0 else "sell" if flows[latest] < 0 else "flat",
             "streak": 0}
    for v in reversed(flows):
        if v > 0:
            today["streak"] += 1
        else:
            break
    return results, today


def main():
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    flows_by_day = load_krx(RAW_DIR)
    closes_by_day, mode = load_kospi(min(flows_by_day))
    days, flows, closes = align(flows_by_day, closes_by_day)
    dropped = sorted(set(flows_by_day) - set(days))
    results, today = questions(days, flows, closes, cfg)

    out = {
        "schema": 1,
        "rules": cfg,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "price_mode": mode,
        "range": {"first": days[0], "last": days[-1], "days": len(days),
                  "first_scored": days[cfg["window"]], "dropped_days": dropped},
        "sources": {
            "flows": "KRX 정보데이터시스템 · 투자자별 거래실적(일별추이) · KOSPI · 거래대금 순매수",
            "prices": "Yahoo Finance ^KS11 종가",
        },
        "questions": results,
        "latest": today,
    }
    text = json.dumps(out, ensure_ascii=False, indent=2, allow_nan=False)
    (SITE / "data").mkdir(exist_ok=True)
    (SITE / "data" / "foreign-flow.json").write_text(text + "\n", encoding="utf-8")
    (SITE / "data" / "foreign-flow-data.js").write_text(f"window.FOREIGN_FLOW_DATA = {text};\n", encoding="utf-8")
    print(f"기간 {days[0]} ~ {days[-1]} · {len(days)}일 · 시세 {mode} · 제외 {len(dropped)}일")
    for q in results:
        d, v = q["periods"]["design"], q["periods"]["validation"]
        print(f"- {q['title']}: 설계 {d['signal']['n']}건 {d['signal']['up_share']:.1%} (기준 {d['base']['up_share']:.1%}, p={d['p_value']:.3f})"
              f" | 검증 {v['signal']['n']}건 {v['signal']['up_share']:.1%} (기준 {v['base']['up_share']:.1%}, p={v['p_value']:.3f}) → {q['verdict']}")


if __name__ == "__main__":
    main()
