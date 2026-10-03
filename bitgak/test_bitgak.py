"""Synthetic edge cases are test fixtures, never published performance."""
from dataclasses import replace
from datetime import date, timedelta
import unittest

from bitgak.engine import Rules, after_signal, describe, indicators, signal_stats


def day(i):
    return (date(2026, 1, 1) + timedelta(days=i)).isoformat()


def bars_from(closes, spread=0.5):
    return [{"date": day(i), "open": c, "high": c + spread, "low": c - spread, "close": c}
            for i, c in enumerate(closes)]


def falling_then_rising():
    # 고점 두 개(110 → 106)가 내려가는 하락 구간, 이후 반등
    closes = [100, 103, 106, 108, 110, 108, 105, 102, 100, 98, 99, 101, 103, 105, 106, 104, 101,
              99, 97, 95, 96, 97, 98, 99, 100, 101, 102, 104, 106, 108, 110, 112, 114, 116, 118]
    return bars_from(closes)


class PivotAndLineTests(unittest.TestCase):
    def setUp(self):
        self.rules = replace(Rules(), pivot=2, atr_period=3)

    def test_no_lookahead_prefix_is_stable(self):
        bars = falling_then_rising()
        full = indicators(bars, self.rules)
        for n in range(8, len(bars)):
            self.assertEqual(indicators(bars[:n], self.rules), full[:n])

    def test_pivot_used_only_after_right_side_closes(self):
        bars = falling_then_rising()
        rows = indicators(bars, self.rules)
        # 두 번째 고점(index 14, 106.5)은 index 16 봉이 끝나야 확정 → 그 전엔 하락 빗각이 없다
        self.assertIsNone(rows[15]["dn_line"])
        self.assertIsNotNone(rows[17]["dn_line"])

    def test_down_line_and_channel_width(self):
        rows = indicators(falling_then_rising(), self.rules)
        # 고점 (4, 110.5)과 (14, 106.5)를 잇는 선: 기울기 −0.4
        self.assertAlmostEqual(rows[20]["dn_line"], 110.5 - 0.4 * 16)
        # 두 고점 사이 가장 깊은 저점(index 9, 97.5)까지의 거리 = 채널 폭
        width = (110.5 - 0.4 * 5) - 97.5
        self.assertAlmostEqual(rows[20]["dn_delay"] - rows[20]["dn_line"], width)

    def test_delay_needs_channel_width_more_than_plain(self):
        rows = indicators(falling_then_rising(), self.rules)
        plain = next(i for i, r in enumerate(rows) if r["enter_plain"])
        delay = next(i for i, r in enumerate(rows) if r["enter_delay"])
        self.assertLess(plain, delay)
        self.assertGreater(rows[delay]["close"], rows[delay]["dn_delay"])
        self.assertLessEqual(rows[delay - 1]["close"], rows[delay]["dn_delay"] + 0.4 + 1e-9)

    def test_rising_highs_give_no_down_line(self):
        rows = indicators(bars_from([100 + i for i in range(30)]), self.rules)
        self.assertTrue(all(r["dn_line"] is None for r in rows))


class AfterSignalTests(unittest.TestCase):
    def rows(self):
        out = []
        for i in range(80):
            out.append({"date": day(i), "open": 100.0 + i, "high": 101.0 + i, "low": 99.0 + i, "close": 100.0 + i,
                        "enter_delay": i == 10, "enter_plain": i in (5, 10)})
        out[30]["high"] = 200.0   # 신호 뒤 20번째 봉에서 최고
        out[15]["low"] = 50.0     # 신호 뒤 5번째 봉에서 최저
        return out

    def test_entry_is_next_open_and_horizons_use_closes(self):
        e = after_signal(self.rows(), 10)
        self.assertEqual((e["signal_date"], e["entry_date"], e["entry"]), (day(10), day(11), 111.0))
        self.assertAlmostEqual(e["r5"], (115 / 111 - 1) * 100)
        self.assertAlmostEqual(e["r60"], (170 / 111 - 1) * 100)

    def test_best_and_worst_within_window(self):
        e = after_signal(self.rows(), 10)
        self.assertAlmostEqual(e["best"], (200 / 111 - 1) * 100)
        self.assertEqual(e["best_day"], 20)
        self.assertAlmostEqual(e["worst"], (50 / 111 - 1) * 100)
        self.assertEqual(e["worst_day"], 5)
        self.assertTrue(e["complete"])

    def test_signal_near_the_end_is_marked_incomplete(self):
        e = after_signal(self.rows(), 70)
        self.assertFalse(e["complete"])
        self.assertIsNone(e["r20"])

    def test_stats_count_signals_and_any_day(self):
        rows = self.rows()
        delay, events = signal_stats(rows, "enter_delay")
        self.assertEqual((delay["count"], len(events)), (1, 1))
        self.assertEqual(signal_stats(rows, "enter_plain")[0]["count"], 2)
        self.assertEqual(signal_stats(rows, None)[0]["count"], 78)
        self.assertEqual(signal_stats(rows, "enter_delay", start_date=day(11))[0]["count"], 0)

    def test_describe_reports_distance_to_delay_line(self):
        rules = replace(Rules(), pivot=2, atr_period=3)
        rows = indicators(falling_then_rising(), rules)
        r = next(r for r in rows if r["dn_delay"] is not None and not r["enter_delay"])
        d = describe(r)
        self.assertEqual(d["state"], "watch")
        self.assertAlmostEqual(d["to_delay_pct"], (r["dn_delay"] / r["close"] - 1) * 100)

if __name__ == "__main__":
    unittest.main()
