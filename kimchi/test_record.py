"""김프 기록 검사. 실행: python3 -m unittest discover -s kimchi -p 'test_*.py' -v"""
from datetime import datetime, timedelta
import unittest

import record


class PremiumTest(unittest.TestCase):
    def test_formula(self):
        kp, tp = record.premiums(141_000_000, 1_420, 100_000, 1_400)
        self.assertAlmostEqual(kp, 0.7142857, places=5)   # 1억4100만 ÷ (10만 × 1400) − 1
        self.assertAlmostEqual(tp, 1.4285714, places=5)

    def test_rejects_empty_price(self):
        with self.assertRaises(ValueError):
            record.premiums(None, 1_420, 100_000, 1_400)
        with self.assertRaises(ValueError):
            record.premiums(141_000_000, 1_420, 0, 1_400)


class AddPointTest(unittest.TestCase):
    now = datetime(2026, 9, 30, 21, 7, tzinfo=record.KST)

    def pt(self, when, kp=0.1):
        return {"t": when.isoformat(timespec="minutes"), "kp": kp, "tp": 0.0}

    def test_same_hour_is_replaced(self):
        old = [self.pt(self.now - timedelta(minutes=5), kp=0.1)]
        out = record.add_point(old, self.pt(self.now, kp=0.9), self.now)
        self.assertEqual([p["kp"] for p in out], [0.9])

    def test_old_points_are_dropped(self):
        old = [self.pt(self.now - timedelta(days=31)), self.pt(self.now - timedelta(days=2))]
        out = record.add_point(old, self.pt(self.now), self.now)
        self.assertEqual(len(out), 2)

    def test_sorted_by_time(self):
        old = [self.pt(self.now - timedelta(hours=1)), self.pt(self.now - timedelta(hours=3))]
        out = record.add_point(old, self.pt(self.now), self.now)
        self.assertEqual(out, sorted(out, key=lambda p: p["t"]))


if __name__ == "__main__":
    unittest.main()
