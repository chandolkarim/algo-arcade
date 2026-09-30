"""FOREIGN FLOW 계산 검증. 실행: python3 -m unittest discover -s foreign-flow -p 'test_*.py' -v"""
import math
import unittest

import build


class ZScoreTest(unittest.TestCase):
    def test_uses_only_past_values(self):
        values = [float(i % 7) for i in range(100)]
        before = build.zscores(values, 60)
        changed = values[:80] + [999.0] * 20  # 80번째 이후를 바꿔도
        after = build.zscores(changed, 60)
        self.assertEqual(before[:80], after[:80])  # 그 전 날짜의 값은 그대로여야 한다

    def test_first_window_is_empty(self):
        z = build.zscores([1.0, 2.0, 3.0, 4.0, 5.0], 3)
        self.assertEqual(z[:3], [None, None, None])
        # 4번째 값 4는 과거 [1,2,3] (평균 2, 표준편차 1) 기준으로 +2
        self.assertAlmostEqual(z[3], 2.0)

    def test_flat_history_gives_none(self):
        self.assertIsNone(build.zscores([5.0] * 4 + [9.0], 4)[4])


class StreakTest(unittest.TestCase):
    def test_counts_only_first_day_of_streak(self):
        values = [1, 1, 1, 1, 1, 1, 1, -1, 1, 1, 1, 1, 1]
        self.assertEqual(build.streak_starts(values, 5), [4, 12])

    def test_zero_breaks_streak(self):
        self.assertEqual(build.streak_starts([1, 1, 0, 1, 1, 1], 3), [5])


class AlignTest(unittest.TestCase):
    def test_keeps_only_common_days_in_order(self):
        flows = {"2024-01-03": 3.0, "2024-01-02": 2.0, "2024-01-05": 5.0}
        closes = {"2024-01-02": 100.0, "2024-01-03": 101.0, "2024-01-04": 99.0}
        days, f, c = build.align(flows, closes)
        self.assertEqual(days, ["2024-01-02", "2024-01-03"])
        self.assertEqual(f, [2.0, 3.0])
        self.assertEqual(c, [100.0, 101.0])

    def test_forward_return_stops_at_end(self):
        closes = [100.0, 110.0, 99.0]
        self.assertAlmostEqual(build.forward_return(closes, 0, 1), 0.1)
        self.assertIsNone(build.forward_return(closes, 2, 1))


class BinomTest(unittest.TestCase):
    def test_fair_coin_small(self):
        # 10번 중 8번 앞면: 양측 p = 112/1024
        self.assertAlmostEqual(build.binom_two_sided(8, 10, 0.5), 112 / 1024, places=9)

    def test_expected_value_is_not_significant(self):
        self.assertAlmostEqual(build.binom_two_sided(50, 100, 0.5), 1.0, places=6)

    def test_large_sample_does_not_overflow(self):
        p = build.binom_two_sided(1500, 3000, 0.52)
        self.assertTrue(0 <= p <= 1 and math.isfinite(p))


class VerdictTest(unittest.TestCase):
    cfg = {"alpha": 0.05, "min_samples": 20}

    def period(self, n, direction, significant):
        return {"signal": {"n": n}, "direction": direction, "significant": significant}

    def test_effect_needs_both_periods_same_direction(self):
        self.assertEqual(build.verdict(self.period(50, "up", True), self.period(30, "up", True), self.cfg)[0], "effect")
        self.assertEqual(build.verdict(self.period(50, "up", True), self.period(30, "down", True), self.cfg)[0], "uncertain")

    def test_none_when_neither_significant(self):
        self.assertEqual(build.verdict(self.period(50, "up", False), self.period(30, "up", False), self.cfg)[0], "none")

    def test_small_sample_is_uncertain(self):
        self.assertEqual(build.verdict(self.period(50, "up", True), self.period(10, "up", True), self.cfg)[0], "uncertain")


if __name__ == "__main__":
    unittest.main()
