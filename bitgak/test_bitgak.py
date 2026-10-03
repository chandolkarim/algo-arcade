"""Synthetic edge cases are test fixtures, never published performance."""
from dataclasses import replace
from datetime import date, timedelta
import unittest

from bitgak.engine import Rules, advance, backtest, indicators, new_account


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
        self.rules = replace(Rules(), pivot=2, atr_period=3, fee=0, slippage=0)

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


def row(i, **kw):
    base = {"date": day(i), "open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0, "atr": 2.0,
            "enter_delay": False, "enter_plain": False, "exit_delay": False, "exit_plain": False}
    return {**base, **kw}


class TradingTests(unittest.TestCase):
    def setUp(self):
        self.rules = replace(Rules(), fee=0, slippage=0)

    def test_entry_at_next_open_with_atr_stop(self):
        acc = new_account(self.rules)
        advance(acc, row(1, open=102), row(0, enter_delay=True), self.rules)
        p = acc["position"]
        self.assertEqual(p["entry"], 102)
        self.assertEqual(p["stop"], 98)
        self.assertEqual(p["signal_date"], day(0))
        # 위험: 손절까지 잃는 돈이 계좌의 0.5%
        self.assertAlmostEqual(p["qty"] * (102 - 98), 10000 * 0.005)

    def test_variant_uses_its_own_signal(self):
        acc = new_account(self.rules)
        advance(acc, row(1), row(0, enter_plain=True), self.rules)
        self.assertIsNone(acc["position"])
        plain = replace(self.rules, variant="plain")
        acc = new_account(plain)
        advance(acc, row(1), row(0, enter_plain=True), plain)
        self.assertIsNotNone(acc["position"])

    def test_exit_line_closes_at_next_open(self):
        acc = new_account(self.rules)
        advance(acc, row(1, open=100), row(0, enter_delay=True), self.rules)
        advance(acc, row(2, close=103, exit_delay=True), row(1), self.rules)
        self.assertIsNotNone(acc["position"])   # 신호 당일 종가에는 팔지 않는다
        advance(acc, row(3, open=104), row(2, exit_delay=True), self.rules)
        t = acc["trades"][0]
        self.assertEqual((t["exit"], t["reason"], t["exit_date"]), (104, "exit_line", day(3)))

    def test_intraday_stop_and_gap_stop(self):
        acc = new_account(self.rules)
        advance(acc, row(1, open=100, low=95), row(0, enter_delay=True), self.rules)
        self.assertEqual((acc["trades"][0]["exit"], acc["trades"][0]["reason"]), (96, "stop"))
        acc = new_account(self.rules)
        advance(acc, row(1, open=100), row(0, enter_delay=True), self.rules)
        advance(acc, row(2, open=90, low=89), row(1), self.rules)
        self.assertEqual((acc["trades"][0]["exit"], acc["trades"][0]["reason"]), (90, "gap_stop"))

    def test_same_bar_cannot_be_processed_twice(self):
        acc = new_account(self.rules)
        advance(acc, row(1), row(0), self.rules)
        with self.assertRaises(ValueError):
            advance(acc, row(1), row(0), self.rules)

    def test_costs_reduce_net(self):
        rules = replace(Rules(), fee=0.001, slippage=0.0005)
        acc = new_account(rules)
        advance(acc, row(1, open=100), row(0, enter_delay=True), rules)
        advance(acc, row(2, open=100), row(1, exit_delay=True), rules)
        self.assertLess(acc["trades"][0]["net"], 0)

    def test_backtest_on_synthetic_series(self):
        rules = replace(Rules(), pivot=2, atr_period=3, fee=0, slippage=0)
        out = backtest(indicators(falling_then_rising(), rules), rules)
        self.assertIn("stop_rate", out)
        self.assertEqual(out["curve"][-1]["date"], day(34))


if __name__ == "__main__":
    unittest.main()
