"""오늘의 한 판 검사. 실행: python3 -m unittest discover -s arena -p 'test_*.py' -v"""
from datetime import datetime, timedelta, timezone
import json
import math
import random
import unittest
from pathlib import Path

import build

CFG = json.loads((Path(__file__).resolve().parent / "config.json").read_text(encoding="utf-8"))


def bars_from(closes, start="2025-01-01"):
    d0 = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    out, prev = [], closes[0]
    for i, c in enumerate(closes):
        o = prev
        out.append({"date": (d0 + timedelta(days=i)).date().isoformat(), "t": int((d0 + timedelta(days=i)).timestamp() * 1000),
                    "open": o, "high": max(o, c) * 1.01, "low": min(o, c) * 0.99, "close": c})
        prev = c
    return out


def walk(n, seed=1):
    rng, p, out = random.Random(seed), 100.0, []
    for _ in range(n):
        p *= math.exp(rng.gauss(0, 0.03))
        out.append(p)
    return out


class NoLookaheadTest(unittest.TestCase):
    def test_picks_use_only_past(self):
        """i일 선택은 i일 뒤의 시세를 바꿔도 같아야 한다."""
        closes = walk(400)
        a = build.machine_picks(bars_from(closes))
        changed = closes[:300] + [c * 3 for c in closes[300:]]
        b = build.machine_picks(bars_from(changed))
        for i in range(299):
            self.assertEqual(a[i], b[i], i)

    def test_band_uses_only_past(self):
        closes = walk(100)
        sd_a = build.sd20(closes)
        sd_b = build.sd20(closes[:60] + [c * 2 for c in closes[60:]])
        self.assertEqual(sd_a[:60], sd_b[:60])


class OutcomeTest(unittest.TestCase):
    def test_classes(self):
        c = [100.0] * 30
        c = [x * (1 + 0.01 * ((i % 2) * 2 - 1)) for i, x in enumerate(c)]
        sd = build.sd20(c)
        band = 0.5 * sd[25]
        for mult, want in ((1 + 3 * band, "up"), (1, "flat"), (1 - 3 * band, "down")):
            cc = c[:26] + [c[25] * mult]
            self.assertEqual(build.outcome(cc, build.sd20(cc), 25, 0.5)[0], want)

    def test_no_answer_before_close(self):
        c = walk(30)
        self.assertIsNone(build.outcome(c, build.sd20(c), 29, 0.5)[0])


class FloorToneTest(unittest.TestCase):
    def test_matches_demo_rule(self):
        # 정배열(+1) · MACD 양수(+1) · RSI 보통 · 이격 보통 → +2 → 매수
        self.assertEqual(build.floor_tone(105, 100, 95, 55, 0.5), "up")
        # 역배열(−1) · MACD 음수(−1) → 매도
        self.assertEqual(build.floor_tone(95, 100, 105, 45, -0.5), "down")
        # 정배열(+1) · MACD 음수(−1) → 관망
        self.assertEqual(build.floor_tone(105, 100, 95, 55, -0.5), "flat")
        self.assertIsNone(build.floor_tone(100, None, 95, 50, 1))


class TimestampTest(unittest.TestCase):
    def test_korean_sheet_format(self):
        at = build.parse_ts("2026. 10. 1 오후 1:05:09", 9)
        self.assertEqual(at, datetime(2026, 10, 1, 4, 5, 9, tzinfo=timezone.utc))
        self.assertEqual(build.parse_ts("2026. 10. 1. 오전 12:00:00", 9), datetime(2026, 9, 30, 15, tzinfo=timezone.utc))

    def test_us_and_iso(self):
        self.assertEqual(build.parse_ts("10/1/2026 13:05:09", 9), datetime(2026, 10, 1, 4, 5, 9, tzinfo=timezone.utc))
        self.assertEqual(build.parse_ts("2026-10-01 13:05:09", 9), datetime(2026, 10, 1, 4, 5, 9, tzinfo=timezone.utc))

    def test_garbage(self):
        self.assertIsNone(build.parse_ts("어제쯤", 9))


def csv_text(rows, extra_cols=()):
    head = ["타임스탬프", "회차", "예측", "닉네임", "방문자", *extra_cols]
    return "\n".join([",".join(head)] + [",".join(r) for r in rows])


class VotesTest(unittest.TestCase):
    # 회차 2026-09-30의 투표 시간: 한국 10/1 09:00 ~ 10/2 09:00
    def test_window_and_first_vote_only(self):
        text = csv_text([
            ["2026. 10. 1 오전 10:00:00", "2026-09-30", "up", "찬민", "abcdefgh1"],
            ["2026. 10. 1 오전 11:00:00", "2026-09-30", "down", "찬민", "abcdefgh1"],   # 두 번째 표 → 무시
            ["2026. 10. 1 오전 8:59:00", "2026-09-30", "up", "일찍", "zzzzzzzz2"],      # 열리기 전
            ["2026. 10. 2 오전 9:00:00", "2026-09-30", "up", "늦게", "yyyyyyyy3"],      # 닫힌 뒤
            ["2026. 10. 1 오후 3:00:00", "2026-09-30", "sideways", "x", "xxxxxxxx4"],  # 없는 선택지
        ])
        votes, hidden, skipped = build.read_votes(text, CFG)
        self.assertEqual([(v["visitor"], v["choice"]) for v in votes], [("abcdefgh1", "up")])
        self.assertEqual(skipped, 3)

    def test_nickname_cleaning(self):
        n = CFG["nickname"]
        self.assertEqual(build.clean_nickname("  찬  민 ", n), "찬 민")
        self.assertIsNone(build.clean_nickname("http://spam", n))
        self.assertIsNone(build.clean_nickname("<script>", n))
        self.assertIsNone(build.clean_nickname("가" * 13, n))

    def test_hidden_column(self):
        text = csv_text([["2026. 10. 1 오전 10:00:00", "2026-09-30", "up", "나쁜말", "abcdefgh1", "Y"]], ["숨김"])
        _votes, hidden, _ = build.read_votes(text, CFG)
        self.assertEqual(hidden, {"abcdefgh1"})

    def test_wrong_columns(self):
        with self.assertRaises(ValueError):
            build.read_votes("a,b\n1,2", CFG)


class BuildTest(unittest.TestCase):
    def test_board_and_privacy(self):
        closes = walk(320, seed=7)
        bars = bars_from(closes, start="2025-11-01")
        cfg = {**CFG, "start": bars[300]["date"],
               "form": {"action": "", "entries": {"round": "", "choice": "", "nickname": "", "visitor": ""}}}
        votes = []
        for i in range(300, 319):
            rid = bars[i]["date"]
            opens, _ = build.round_window(rid)
            for vid, nick in (("visitor0001", "찬민"), ("visitor0002", None)):
                votes.append({"visitor": vid, "round": rid, "choice": "flat", "at": opens + timedelta(hours=1),
                              "nickname": nick})
        out = build.build(bars, votes, set(), cfg, now=datetime(2026, 9, 1, tzinfo=timezone.utc))
        self.assertEqual(len(out["rounds"]), 20)
        self.assertIsNone(out["rounds"][-1]["answer"])          # 마지막 회차는 아직 열려 있음
        self.assertEqual([b["name"] for b in out["board"]], ["찬민"])   # 닉네임 없는 사람은 순위에 없음
        text = json.dumps(out, ensure_ascii=False)
        self.assertNotIn("visitor0001", text)                   # 방문자 번호는 공개하지 않음
        flat = next(p for p in out["players"] if p["key"] == "flat")
        self.assertEqual(out["board"][0]["hit"], flat["hit"])   # 늘 횡보를 고른 사람 = 늘 횡보 기계
        self.assertIsNone(out["form"])                          # 폼 연결 전

    def test_form_only_when_complete(self):
        bars = bars_from(walk(260))
        full = {"action": "https://docs.google.com/forms/d/e/x/formResponse",
                "entries": {"round": "entry.1", "choice": "entry.2", "nickname": "entry.3", "visitor": "entry.4"}}
        out = build.build(bars, [], set(), {**CFG, "form": full})
        self.assertEqual(out["form"]["entries"]["visitor"], "entry.4")
        half = {**full, "entries": {**full["entries"], "visitor": ""}}
        self.assertIsNone(build.build(bars, [], set(), {**CFG, "form": half})["form"])


if __name__ == "__main__":
    unittest.main()
