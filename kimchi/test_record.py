"""김프 기록 검사. 실행: python3 -m unittest discover -s kimchi -p 'test_*.py' -v"""
from datetime import datetime, timedelta
from urllib.error import HTTPError
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


class LoadPreviousTest(unittest.TestCase):
    """배포된 기록을 못 읽으면 빈 기록으로 덮어쓰지 않아야 한다."""

    def test_reads_deployed_points(self):
        pts = record.load_previous("https://x/h.json", fetch=lambda u: {"points": [{"t": "a"}]}, wait=0)
        self.assertEqual(pts, [{"t": "a"}])

    def test_network_error_stops(self):
        def fail(u):
            raise OSError("timeout")
        with self.assertRaises(record.PreviousUnavailable):
            record.load_previous("https://x/h.json", fetch=fail, wait=0)

    def test_broken_file_stops(self):
        with self.assertRaises(record.PreviousUnavailable):
            record.load_previous("https://x/h.json", fetch=lambda u: {"oops": 1}, wait=0)

    def test_retry_then_success(self):
        calls = []
        def flaky(u):
            calls.append(u)
            if len(calls) < 2:
                raise OSError("blip")
            return {"points": []}
        self.assertEqual(record.load_previous("https://x/h.json", fetch=flaky, wait=0), [])
        self.assertEqual(len(calls), 2)

    def test_404_starts_fresh(self):
        def missing(u):
            raise HTTPError(u, 404, "Not Found", {}, None)
        self.assertIsInstance(record.load_previous("https://x/h.json", fetch=missing, wait=0), list)

    def test_cache_busting(self):
        seen = []
        record.load_previous("https://x/h.json", fetch=lambda u: seen.append(u) or {"points": []}, wait=0)
        self.assertRegex(seen[0], r"\?t=\d+$")


if __name__ == "__main__":
    unittest.main()
