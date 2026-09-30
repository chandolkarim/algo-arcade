"""Deterministic edge cases; synthetic fixtures never enter published results."""
import copy
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from engine import Rules, advance, backtest, indicators, new_account, signal, summary
from update import paper_update, stock_data


def row(day="2026-01-01", **changes):
    return {"date": day, "open": 94.0, "high": 96.0, "low": 93.0, "close": 94.0,
            "sma25": 100.0, "sma200": 80.0, "atr": 3.0, **changes}


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.rules = replace(Rules(), fee=0, slippage=0, borrow_apr=0)

    def enter(self, side=1, market="stock", rules=None, **bar):
        rules = rules or self.rules
        account = new_account(rules)
        prev = row() if side == 1 else row(close=106, open=106, high=107, low=105, sma200=120)
        current = row("2026-01-02", **bar) if side == 1 else row("2026-01-02", open=106, close=106, high=107, low=105, sma200=120, **bar)
        advance(account, current, prev, rules, True, market)
        return account, current

    def test_signal_and_strict_trend_boundary(self):
        self.assertEqual(signal(row()), 1)
        self.assertEqual(signal(row(close=106, sma200=120)), -1)
        self.assertEqual(signal(row(sma200=91)), 0)  # exactly +1 ATR
        self.assertEqual(signal(row(close=106, sma200=109)), 0)
        self.assertEqual(signal(row(atr=0)), 0)
        self.assertEqual(signal(row(close=105)), 0)

    def test_sma_wilder_atr_and_prefix_invariance(self):
        bars = []
        for i in range(240):
            c = 100 + i
            bars.append({"date": (datetime(2025, 1, 1) + timedelta(days=i)).date().isoformat(),
                         "open": c, "high": c + 2, "low": c - 2, "close": c})
        result = indicators(bars)
        self.assertIsNone(result[198]["sma200"])
        self.assertEqual(result[199]["sma200"], 199.5)
        self.assertEqual(result[24]["sma25"], 112)
        self.assertEqual(result[13]["atr"], 4)
        bars[14]["high"] += 14
        changed = indicators(bars)
        self.assertEqual(changed[14]["atr"], 5)
        self.assertEqual(changed[15]["atr"], (5 * 13 + 4) / 14)
        self.assertEqual(changed[:210], indicators(bars[:210]))

    def test_invalid_input_rejected(self):
        for bars in ([row(), row()], [row(low=100)], [row(close=float("nan"))], [row(open=-1)]):
            with self.assertRaises(ValueError):
                indicators(bars)

    def test_next_open_and_frozen_stop(self):
        account, current = self.enter(open=95, close=96, high=97, low=94, atr=9)
        self.assertEqual(account["position"]["entry"], 95)
        self.assertEqual(account["position"]["stop"], 89)
        self.assertEqual(account["position"]["signal_date"], "2026-01-01")
        self.assertEqual(account["position"]["signal_atr"], 3)

    def test_gap_cancels_entry_at_mean_or_filter(self):
        for open_price in (100, 82):
            account, _ = self.enter(open=open_price, high=max(101, open_price), low=min(81, open_price))
            self.assertIsNone(account["position"])
            self.assertEqual(account["cancellations"], 1)

    def test_intraday_stop_and_slippage(self):
        r = replace(self.rules, slippage=0.001, fee=0.001)
        account, _ = self.enter(rules=r, low=80)
        trade = account["trades"][0]
        self.assertEqual(trade["reason"], "stop")
        self.assertAlmostEqual(trade["entry"], 94 * 1.001)
        self.assertAlmostEqual(trade["exit"], trade["stop"] * .999)
        self.assertLess(trade["net"], 0)
        self.assertAlmostEqual(account["balance"], r.initial + trade["net"])
        self.assertLessEqual(-trade["net"], r.initial * r.risk + .001)

    def test_gap_stop_does_not_fill_at_stop(self):
        account, previous = self.enter()
        advance(account, row("2026-01-03", open=70, low=68, high=75, close=72), previous, self.rules)
        trade = account["trades"][0]
        self.assertEqual(trade["exit"], 70)
        self.assertEqual(trade["reason"], "gap_stop")
        self.assertLess(trade["net"], -50)

    def test_short_stop_is_mirrored(self):
        account, previous = self.enter(-1)
        advance(account, row("2026-01-03", open=106, low=104, high=115, close=110, sma200=120), previous, self.rules)
        self.assertEqual(account["trades"][0]["exit"], 112)
        self.assertAlmostEqual(account["trades"][0]["net"], -50)

    def test_mean_exit_waits_for_next_open(self):
        account, previous = self.enter(close=101, high=102)
        self.assertEqual(account["position"]["pending_exit"], "mean")
        self.assertFalse(account["trades"])
        advance(account, row("2026-01-03", open=98, low=97, high=99, close=98), previous, self.rules)
        self.assertEqual(account["trades"][0]["exit"], 98)
        self.assertEqual(account["trades"][0]["reason"], "mean")

    def test_timeout_counts_entry_bar(self):
        account, previous = self.enter()
        for day in range(3, 12):
            current = row(f"2026-01-{day:02d}")
            advance(account, current, previous, self.rules)
            previous = current
        self.assertEqual(account["position"]["bars"], 10)
        self.assertEqual(account["position"]["pending_exit"], "timeout")
        advance(account, row("2026-01-12"), previous, self.rules)
        self.assertEqual(account["trades"][0]["reason"], "timeout")

    def test_trend_exit_and_baseline_difference(self):
        account, previous = self.enter(close=90, low=89, sma200=91)
        self.assertEqual(account["position"]["pending_exit"], "trend")
        base = new_account(self.rules)
        advance(base, previous, row(), self.rules, False)
        self.assertIsNone(base["position"]["pending_exit"])

    def test_exposure_cap_and_no_pyramiding(self):
        r = replace(self.rules, risk=.9)
        account, previous = self.enter(rules=r)
        qty = account["position"]["qty"]
        self.assertLessEqual(qty * account["position"]["entry"], r.initial)
        advance(account, row("2026-01-03"), previous, r)
        self.assertEqual(account["position"]["qty"], qty)

    def test_funding_direction_and_entry_boundary(self):
        events = [{"rate": .001, "mark": 100, "at_open": True}, {"rate": .001, "mark": 100, "at_open": False}]
        long, _ = self.enter(market="crypto", funding=events)
        short, _ = self.enter(-1, market="crypto", funding=events)
        self.assertAlmostEqual(long["position"]["carry"], long["position"]["qty"] * .1)
        self.assertAlmostEqual(short["position"]["carry"], -short["position"]["qty"] * .1)

    def test_stop_day_funding_no_speculative_credit(self):
        account, _ = self.enter(market="crypto", low=80, funding=[{"rate": -.001, "mark": 100, "at_open": False}])
        self.assertEqual(account["trades"][0]["carry"], 0)

    def test_short_borrow_weekend_and_dividend(self):
        r = replace(self.rules, borrow_apr=.05)
        account, previous = self.enter(-1, rules=r)
        p = account["position"]
        qty = p["qty"]
        advance(account, row("2026-01-05", open=106, close=106, high=107, low=105, sma200=120, dividend=2), previous, r)
        self.assertAlmostEqual(p["carry"], qty * 106 * .05 * 3 / 365)
        self.assertEqual(p["dividends"], -qty * 2)

    def test_duplicate_processing_rejected(self):
        account, current = self.enter()
        with self.assertRaises(ValueError):
            advance(account, current, row(), self.rules)

    def test_empty_summary_and_mark_to_market(self):
        self.assertIsNone(summary(new_account())["win_rate"])
        account, _ = self.enter(close=96, high=97)
        self.assertGreater(summary(account)["equity"], 10000)
        self.assertEqual(summary(account)["count"], 0)

    def test_paper_no_backfill_before_registration_and_idempotent(self):
        asset = {"market": "crypto", "timezone": "UTC"}
        now = datetime(2026, 1, 2, 12, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "paper.json"
            first = paper_update(path, [row()], self.rules, asset, now, False)
            self.assertEqual(first["count"], 0)
            rows = [row(), row("2026-01-02"), row("2026-01-03")]
            second = paper_update(path, rows, self.rules, asset, now + timedelta(days=2), False)
            self.assertEqual(second["position"]["entry_date"], "2026-01-03")
            old = path.read_text()
            paper_update(path, rows, self.rules, asset, now + timedelta(days=2), False)
            self.assertEqual(path.read_text(), old)
            revised = copy.deepcopy(rows)
            revised[-1]["close"] += 2
            with self.assertRaises(ValueError):
                paper_update(path, revised, self.rules, asset, now + timedelta(days=2), False)
            self.assertEqual(path.read_text(), old)

    def test_paper_rules_change_preserves_ledger(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / "paper.json"
            now = datetime(2026, 1, 2, tzinfo=timezone.utc)
            asset = {"market": "crypto", "timezone": "UTC"}
            paper_update(p, [row()], self.rules, asset, now, False)
            before = p.read_text()
            with self.assertRaises(ValueError):
                paper_update(p, [row()], replace(self.rules, risk=.01), asset, now, False)
            self.assertEqual(p.read_text(), before)

    def test_stock_today_excluded_and_missing_day_repaired(self):
        days = [datetime(2026, 1, d, tzinfo=timezone.utc).timestamp() for d in (5, 6, 7, 8)]
        payload = {"chart": {"result": [{"timestamp": days, "indicators": {"quote": [{
            "open": [100, None, 100, 100], "high": [102, None, 102, 102],
            "low": [98, None, 98, 98], "close": [100, None, 100, 100]}]}}]}}
        fallback = {f"2026-01-{d:02d}": {"open": 100, "high": 102, "low": 98, "close": 100} for d in (5, 6, 7)}
        asset = {"symbol": "005930.KS", "timezone": "Asia/Seoul"}
        with patch("update.fetch", return_value=payload), patch("update.korean_missing_bars", return_value=fallback):
            bars, source, note = stock_data(asset, datetime(2026, 1, 8, 12, tzinfo=timezone.utc), "2026-01-01")
        self.assertEqual(len(bars), 3)
        self.assertEqual(bars[1]["source"], "NAVER Finance")
        self.assertIn("2026-01-06", note)
        self.assertIn("NAVER", source)
        fallback["2026-01-05"]["close"] = 200
        with patch("update.fetch", return_value=payload), patch("update.korean_missing_bars", return_value=fallback):
            with self.assertRaises(ValueError):
                stock_data(asset, datetime(2026, 1, 8, 12, tzinfo=timezone.utc), "2026-01-01")

    def test_replay_prefix_does_not_use_future_bars(self):
        r = replace(self.rules, fast=3, slow=5, atr_period=2)
        bars = []
        for i, c in enumerate([100, 110, 120, 130, 122, 115, 119, 123, 80, 150]):
            bars.append({"date": f"2026-01-{i+1:02d}", "open": c, "high": c + 1, "low": c - 1, "close": c})
        full = backtest(indicators(bars, r), r, False)
        prefix = backtest(indicators(bars[:8], r), r, False)
        self.assertEqual(full["curve"][:len(prefix["curve"])], prefix["curve"])


if __name__ == "__main__":
    unittest.main()
