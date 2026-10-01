"""BLIND CHART 계산 검사. 실행: python3 -m unittest discover -s blind -p 'test_*.py' -v"""
import math
import random
import unittest

import build

CFG = {"window": 60, "horizon": 5, "band_k": 0.5, "alpha": 0.05, "min_samples": 30}


def candles(n, seed=7):
    """결정론적 무작위 걸음 일봉."""
    rng = random.Random(seed)
    out, p = [], 100.0
    for i in range(n):
        o = p
        p = max(1.0, p * math.exp(rng.gauss(0, 0.04)))
        hi, lo = max(o, p) * (1 + rng.random() * 0.03), min(o, p) * (1 - rng.random() * 0.03)
        out.append({"t": i * build.DAY, "o": o, "h": hi, "l": lo, "c": p, "v": 1000 + rng.random() * 3000})
    return out


class NoLookaheadTest(unittest.TestCase):
    def test_situations_use_only_past(self):
        full = candles(500)
        cut = 420
        changed = full[:cut + 1] + candles(500, seed=99)[cut + 1:]  # cut 이후만 다른 미래
        a, b = build.states(build.series(full)), build.states(build.series(changed))
        for sid in a:
            self.assertEqual(a[sid][:cut + 1], b[sid][:cut + 1], f"{sid}가 미래 데이터를 씀")

    def test_outcome_band_uses_only_past(self):
        full = candles(300)
        S1 = build.series(full)
        changed = [dict(x) for x in full]
        for x in changed[201:205]:  # i=200의 5일 뒤(205)는 그대로 두고 그 사이만 바꾼다
            x["c"] *= 3
        S2 = build.series(changed)
        self.assertEqual(build.outcome(S1, 200, CFG), build.outcome(S2, 200, CFG))


class OutcomeTest(unittest.TestCase):
    def test_classes(self):
        S = build.series(candles(120))
        i = 80
        band = 0.5 * S["sd20"][i] * math.sqrt(5)
        r = math.log(S["c"][i + 5] / S["c"][i])
        expected = "up" if r > band else "down" if r < -band else "flat"
        self.assertEqual(build.outcome(S, i, CFG), expected)

    def test_no_future_no_answer(self):
        S = build.series(candles(100))
        self.assertIsNone(build.outcome(S, 96, CFG))


class OnsetTest(unittest.TestCase):
    def test_only_first_day_counts(self):
        self.assertEqual(build.onsets([None, False, True, True, False, True]), [2, 5])

    def test_unknown_yesterday_is_not_onset(self):
        self.assertEqual(build.onsets([None, True, True]), [])


class IndicatorTest(unittest.TestCase):
    def test_rolling_mean(self):
        self.assertEqual(build.rolling_mean([1, 2, 3, 4], 2), [None, 1.5, 2.5, 3.5])

    def test_flat_rsi_is_neutral(self):
        S = build.series([{"t": i, "o": 10, "h": 10, "l": 10, "c": 10, "v": 1} for i in range(30)])
        self.assertEqual(S["rsi"][20], 50.0)

    def test_all_situations_have_unique_ids(self):
        ids = [s[0] for s in build.SITUATIONS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(ids), 52)


class VerdictTest(unittest.TestCase):
    base = {"design": {"n": 1000, "up": 300, "flat": 400, "down": 300},
            "validation": {"n": 500, "up": 150, "flat": 200, "down": 150}}

    def test_verified_needs_both_periods(self):
        st = {"design": {"n": 200, "up": 120, "flat": 50, "down": 30},
              "validation": {"n": 100, "up": 60, "flat": 25, "down": 15}}
        lean, verdict, _pd, _pv = build.lean_and_verdict(st, self.base, CFG)
        self.assertEqual((lean, verdict), ("up", "verified"))

    def test_luck_when_validation_fails(self):
        st = {"design": {"n": 200, "up": 120, "flat": 50, "down": 30},
              "validation": {"n": 100, "up": 30, "flat": 40, "down": 30}}
        self.assertEqual(build.lean_and_verdict(st, self.base, CFG)[1], "maybe_luck")

    def test_no_lean_when_like_base(self):
        st = {"design": {"n": 200, "up": 62, "flat": 78, "down": 60},
              "validation": {"n": 100, "up": 30, "flat": 40, "down": 30}}
        self.assertEqual(build.lean_and_verdict(st, self.base, CFG)[1], "no_lean")

    def test_too_few(self):
        st = {"design": {"n": 10, "up": 9, "flat": 1, "down": 0}, "validation": {"n": 0, "up": 0, "flat": 0, "down": 0}}
        self.assertEqual(build.lean_and_verdict(st, self.base, CFG)[1], "too_few")


if __name__ == "__main__":
    unittest.main()
