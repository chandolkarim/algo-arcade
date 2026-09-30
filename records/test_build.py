"""플레이 기록 검사. 실행: python3 -m unittest discover -s records -p 'test_*.py' -v"""
from datetime import datetime, timedelta
import unittest

import build

HEADER = "일시,모드,종목,판정,확신도,판정가,통화,메모,공개\n"


class ParseTest(unittest.TestCase):
    def test_valid_rows(self):
        rows = build.parse(HEADER + "2026-08-24 22:06,공격,BTC,롱,44,78758.9,USD,,Y\n2026-08-25 01:00,알고리즘,SOL,관망,60,100,USD,메모,N\n")
        self.assertEqual(len(rows), 2)
        self.assertTrue(rows[0]["public"])
        self.assertFalse(rows[1]["public"])

    def test_missing_column_stops(self):
        with self.assertRaisesRegex(build.DataError, "필수 열이 없습니다: 판정"):
            build.parse("일시,모드,종목,확신도,판정가,통화,공개\n")

    def test_bad_rows_report_line_numbers(self):
        text = HEADER + "2026-08-24 22:06,공격,BTC,관망,44,1,USD,,Y\n2026/08/24,스캘핑,BTC,롱,120,-5,EUR,,X\n"
        with self.assertRaises(build.DataError) as ctx:
            build.parse(text)
        msg = str(ctx.exception)
        self.assertIn("2행: 공격 모드의 판정은", msg)       # 공격 모드는 관망 불가
        self.assertIn("3행: 일시는", msg)
        self.assertIn("확신도는 0~100", msg)
        self.assertIn("판정가는 0보다", msg)
        self.assertIn("통화는 USD 또는 KRW", msg)
        self.assertIn("공개는 Y 또는 N", msg)

    def test_no_public_rows_stops(self):
        with self.assertRaisesRegex(build.DataError, "공개 열이 Y인 행이 없습니다"):
            build.parse(HEADER + "2026-08-24 22:06,공격,BTC,롱,44,1,USD,,N\n")

    def test_blank_lines_are_skipped(self):
        rows = build.parse(HEADER + ",,,,,,,,\n2026-08-24 22:06,공격,BTC,롱,44,1,USD,,Y\n")
        self.assertEqual(len(rows), 1)


class JudgeTest(unittest.TestCase):
    """원본 report.js judge()와 같은 결과여야 한다."""

    def test_hold(self):
        self.assertEqual(build.judge("HOLD", 0.5)[1], "관망이 적중")
        self.assertEqual(build.judge("HOLD", -2.0)[1], "관망하는 사이 움직임이 있었음")

    def test_direction(self):
        self.assertEqual(build.judge("BUY", 1.5)[1], "방향이 맞았음")
        self.assertEqual(build.judge("BUY", -1.5)[1], "방향이 틀렸음")
        self.assertEqual(build.judge("SELL", -1.5)[1], "방향이 맞았음")
        self.assertEqual(build.judge("SELL", 0.9)[1], "방향을 잡기엔 움직임이 작았음")


class OutcomeTest(unittest.TestCase):
    def row(self, symbol="BTC", currency="USD", hours_ago=48):
        return {"symbol": symbol, "currency": currency, "at": datetime.now(build.KST) - timedelta(hours=hours_ago),
                "verdict": "롱", "price": 100.0}

    def test_stock_is_not_auto_judged(self):
        self.assertEqual(build.outcome(self.row("삼성전자", "KRW"), datetime.now(build.KST), True)["status"], "unsupported")

    def test_recent_record_waits(self):
        self.assertEqual(build.outcome(self.row(hours_ago=3), datetime.now(build.KST), True)["status"], "pending")


if __name__ == "__main__":
    unittest.main()
