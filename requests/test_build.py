"""의뢰 현황 검사. 실행: python3 -m unittest discover -s requests -p 'test_*.py' -v"""
import unittest

import build

HEAD = "접수일,전략,의뢰자,상태,결과,공개,메모\n"


class ParseTest(unittest.TestCase):
    def test_public_only(self):
        rows = build.parse(HEAD + "2026-10-02,RSI 30 반등,민수,접수,,Y,\n2026-10-03,비공개 전략,,진행 중,,N,메모\n")
        out = build.build(rows)
        self.assertEqual([i["title"] for i in out["items"]], ["RSI 30 반등"])
        self.assertEqual(out["total"], 2)
        self.assertEqual(out["counts"]["진행 중"], 1)

    def test_no_contact_in_name(self):
        with self.assertRaises(build.DataError):
            build.parse(HEAD + "2026-10-02,전략,me@mail.com,접수,,Y,\n")
        with self.assertRaises(build.DataError):
            build.parse(HEAD + "2026-10-02,전략,01012345678,접수,,Y,\n")

    def test_done_needs_link(self):
        with self.assertRaises(build.DataError):
            build.parse(HEAD + "2026-10-02,전략,민수,완료,,Y,\n")
        rows = build.parse(HEAD + "2026-10-02,전략,민수,완료,machines/rebound.html,Y,\n")
        self.assertEqual(rows[0]["link"], "machines/rebound.html")

    def test_bad_status_and_date(self):
        with self.assertRaises(build.DataError) as cm:
            build.parse(HEAD + "10/2,전략,민수,끝,,Y,\n")
        self.assertIn("2행", str(cm.exception))

    def test_memo_not_published(self):
        out = build.build(build.parse(HEAD + "2026-10-02,전략,민수,접수,,Y,비밀 메모\n"))
        self.assertNotIn("비밀", str(out))

    def test_empty_is_fine(self):
        self.assertEqual(build.build(build.parse(HEAD))["items"], [])


if __name__ == "__main__":
    unittest.main()
