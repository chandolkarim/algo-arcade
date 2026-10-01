"""CLOCK TOWER 계산 검사. 실행: python3 -m unittest discover -s clock -p 'test_*.py' -v"""
from datetime import datetime, timezone
import math
import random
import unittest

import build

CFG = {"utc_offset_hours": 9, "validation_start": "2023-01-01", "alpha": 0.05}


def ms(y, mo, d, h):
    return int(datetime(y, mo, d, h, tzinfo=timezone.utc).timestamp() * 1000)


class CellTest(unittest.TestCase):
    def test_kst_shift_crosses_day(self):
        # UTC 일요일 15시 = 한국 월요일 0시
        self.assertEqual(build.cell_of(ms(2026, 9, 27, 15), 9), (0, 0))

    def test_kst_same_day(self):
        # UTC 수요일 13시 = 한국 수요일 22시 (미국장 개장 무렵)
        self.assertEqual(build.cell_of(ms(2026, 9, 30, 13), 9), (2, 22))


class AccTest(unittest.TestCase):
    def test_mean_sd(self):
        a = build.Acc()
        for x in (1, 2, 3, 4):
            a.add(x)
        self.assertAlmostEqual(a.mean, 2.5)
        self.assertAlmostEqual(a.sd, math.sqrt(5 / 3))


class TestTests(unittest.TestCase):
    def test_share_no_difference(self):
        self.assertEqual(build.share_test(500, 1000, 0.5), (0, 1.0))

    def test_share_difference(self):
        sign, p = build.share_test(600, 1000, 0.5)
        self.assertEqual(sign, 1)
        self.assertLess(p, 0.001)

    def test_verdict(self):
        self.assertEqual(build.verdict((1, 0.01), (1, 0.02), 0.05), "verified")
        self.assertEqual(build.verdict((1, 0.01), (-1, 0.02), 0.05), "maybe_luck")
        self.assertEqual(build.verdict((1, 0.01), (1, 0.30), 0.05), "maybe_luck")
        self.assertEqual(build.verdict((1, 0.20), (1, 0.01), 0.05), "none")


class SummarizeTest(unittest.TestCase):
    def test_finds_planted_swing_hour(self):
        """한국 시간 22시만 출렁임을 4배로 심으면 그 칸만 검증됨이 나와야 한다."""
        rng = random.Random(3)
        candles = []
        t = ms(2020, 1, 6, 0)
        while t < ms(2025, 1, 6, 0):
            _w, h = build.cell_of(t, 9)
            r = rng.gauss(0, 0.004 if h == 22 else 0.001)
            o = 100.0
            candles.append((t, o, o * math.exp(r)))
            t += build.HOUR
        cells, base = build.summarize(candles, CFG)
        swing_verified = {(c["w"], c["h"]) for c in cells if c["verdict"]["swing"] == "verified" and c["sign"]["swing"] > 0}
        self.assertEqual({h for _w, h in swing_verified}, {22})
        self.assertEqual(len(swing_verified), 7)
        self.assertEqual(len(cells), 168)
        self.assertGreater(base["design"]["n"], 0)


if __name__ == "__main__":
    unittest.main()
