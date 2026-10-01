"""Synthetic edge cases are test fixtures, never published performance."""
import copy
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest

from breakout.engine import Rules, indicators, signal, advance, new_account, summary, backtest
from breakout.update import paper_update


def row(day="2026-01-01", **changes):
    return {"date":day,"open":103.,"high":104.,"low":102.,"close":103.,
            "upper":100.,"lower":80.,"atr":2., **changes}


class BreakoutTests(unittest.TestCase):
    def setUp(self):
        self.rules=replace(Rules(),fee=0,slippage=0,borrow_apr=0)

    def enter(self, side=1, rules=None, market="stock", **changes):
        rules=rules or self.rules
        account=new_account(rules)
        prev=row() if side==1 else row(open=77,close=77,high=78,low=76)
        current=dict(prev,date="2026-01-02",**changes)
        advance(account,current,prev,rules,market)
        return account,current

    def test_twenty_previous_bars_exclude_signal_day(self):
        bars=[row((datetime(2026,1,1)+timedelta(days=i)).date().isoformat(),open=98,high=100,low=90,close=98) for i in range(21)]
        bars[-1].update(high=105,close=103)
        out=indicators(bars)
        self.assertIsNone(out[19]["upper"])
        self.assertEqual(out[20]["upper"],100)
        self.assertEqual(signal(out[20]),1)
        bars.append(row("2026-01-22",high=104,low=100,close=103))
        self.assertEqual(indicators(bars)[21]["upper"],105)

    def test_lower_channel_excludes_current_low(self):
        bars=[row((datetime(2026,1,1)+timedelta(days=i)).date().isoformat(),open=98,high=100,low=90,close=98) for i in range(21)]
        bars[-1].update(open=89,high=90,low=85,close=87)
        self.assertEqual(indicators(bars)[20]["lower"],90)
        self.assertEqual(signal(indicators(bars)[20]),-1)

    def test_signal_equality_and_warmup(self):
        for r in (row(close=100),row(close=80),row(upper=None),row(atr=0),row(atr=None)):
            self.assertEqual(signal(r),0)
        self.assertEqual(signal(row()),1)
        self.assertEqual(signal(row(close=77)),-1)

    def test_wilder_atr_and_indicator_prefix(self):
        bars=[row((datetime(2026,1,1)+timedelta(days=i)).date().isoformat()) for i in range(40)]
        bars[14]["high"]+=14
        out=indicators(bars)
        self.assertEqual(out[13]["atr"],2)
        self.assertEqual(out[14]["atr"],3)
        self.assertEqual(out[15]["atr"],(3*13+2)/14)
        self.assertEqual(out[:25],indicators(bars[:25]))

    def test_bad_and_duplicate_ohlc(self):
        for bars in ([row(),row()],[row(close=float("nan"))],[row(low=200)],[row(open=-1)]):
            with self.assertRaises(ValueError):indicators(bars)

    def test_next_open_fills_with_signal_atr(self):
        a,_=self.enter(open=104,close=104,high=105,atr=9)
        self.assertEqual(a["position"]["entry"],104)
        self.assertEqual(a["position"]["stop"],100)
        self.assertEqual(a["position"]["signal_atr"],2)
        self.assertEqual(a["position"]["signal_date"],"2026-01-01")

    def test_cancel_on_or_inside_boundary(self):
        for side,opening in ((1,100),(1,99),(-1,80),(-1,81)):
            a,_=self.enter(side,open=opening)
            self.assertIsNone(a["position"])
            self.assertEqual(a["cancellations"],1)

    def test_current_close_cannot_trigger_same_day_stop(self):
        a,prev=self.enter(close=110,high=111,low=100)
        self.assertFalse(a["trades"])
        self.assertEqual(a["curve"][-1]["stop_used"],99)
        self.assertEqual(a["position"]["stop"],106)
        advance(a,row("2026-01-03",open=109,low=105,high=110,close=108),prev,self.rules)
        self.assertEqual(a["trades"][0]["exit"],106)
        self.assertEqual(a["trades"][0]["reason"],"trailing_stop")

    def test_short_trailing_stop_is_mirrored(self):
        a,prev=self.enter(-1,close=70,low=69,high=80)
        self.assertFalse(a["trades"])
        self.assertEqual(a["curve"][-1]["stop_used"],81)
        self.assertEqual(a["position"]["stop"],74)
        advance(a,row("2026-01-03",open=71,low=69,high=75,close=72),prev,self.rules)
        self.assertEqual(a["trades"][0]["exit"],74)

    def test_stop_never_loosens_even_if_atr_changes(self):
        a,prev=self.enter(close=110,high=111,low=100)
        advance(a,row("2026-01-03",open=109,close=108,low=107,high=110,atr=30),prev,self.rules)
        self.assertEqual(a["position"]["stop"],106)
        b,prev=self.enter(-1,close=70,low=69,high=80)
        advance(b,row("2026-01-03",open=71,close=72,low=70,high=73,atr=30),prev,self.rules)
        self.assertEqual(b["position"]["stop"],74)

    def test_intraday_high_is_not_trailing_anchor(self):
        a,_=self.enter(high=150,close=103)
        self.assertEqual(a["position"]["stop"],99)

    def test_gap_stop_uses_open(self):
        a,prev=self.enter()
        advance(a,row("2026-01-03",open=90,low=89,high=100,close=95),prev,self.rules)
        self.assertEqual(a["trades"][0]["exit"],90)
        self.assertEqual(a["trades"][0]["reason"],"gap_stop")
        self.assertEqual(a["trades"][0]["bars"],2)
        self.assertEqual(a["curve"][-1]["stop_used"],99)
        self.assertIsNone(a["position"])

    def test_fees_slippage_and_risk(self):
        r=replace(self.rules,fee=.001,slippage=.001)
        a,_=self.enter(rules=r,low=90)
        t=a["trades"][0]
        self.assertAlmostEqual(t["entry"],103*1.001)
        self.assertAlmostEqual(t["exit"],t["stop"]*.999)
        self.assertAlmostEqual(a["balance"],r.initial+t["net"])
        self.assertLessEqual(-t["net"],r.initial*r.risk+.001)

    def test_funding_entry_boundary_and_short_credit(self):
        events=[{"at_open":True,"rate":.001,"mark":100},{"at_open":False,"rate":.001,"mark":100}]
        for side in (1,-1):
            a,_=self.enter(side,market="crypto",funding=events)
            self.assertAlmostEqual(a["position"]["carry"],side*a["position"]["qty"]*.1)

    def test_stop_day_funding_credit_omitted(self):
        a,_=self.enter(market="crypto",low=90,funding=[{"at_open":False,"rate":-.001,"mark":100}])
        self.assertEqual(a["trades"][0]["carry"],0)

    def test_dividend_and_weekend_borrow(self):
        r=replace(self.rules,borrow_apr=.05)
        a,prev=self.enter(-1,rules=r)
        p=a["position"];q=p["qty"]
        advance(a,row("2026-01-05",open=77,high=78,low=76,close=77,dividend=2),prev,r)
        self.assertAlmostEqual(p["carry"],q*77*.05*3/365)
        self.assertEqual(p["dividends"],-2*q)

    def test_exposure_no_pyramiding_and_no_time_limit(self):
        r=replace(self.rules,risk=.9)
        a,prev=self.enter(rules=r)
        q=a["position"]["qty"]
        self.assertLessEqual(q*a["position"]["entry"],r.initial)
        for day in range(3,25):
            current=row(f"2026-01-{day:02d}")
            advance(a,current,prev,r);prev=current
        self.assertEqual(a["position"]["qty"],q)
        self.assertEqual(a["position"]["bars"],23)

    def test_duplicate_processing_rejected(self):
        a,r=self.enter()
        with self.assertRaises(ValueError):advance(a,r,row(),self.rules)

    def test_no_trades_has_no_winrate(self):
        s=summary(new_account())
        for key in ("win_rate","average_win","average_loss","average_bars"):
            self.assertIsNone(s[key])

    def test_backtest_cannot_use_future_prices(self):
        r=replace(self.rules,lookback=3,atr_period=2)
        bars=[]
        for i,c in enumerate([100,100,100,105,107,109,120,90,130]):
            bars.append(row((datetime(2026,1,1)+timedelta(days=i)).date().isoformat(),open=c,high=c+1,low=c-1,close=c))
        full=backtest(indicators(bars,r),r)
        part=backtest(indicators(bars[:7],r),r)
        self.assertEqual(full["curve"][:len(part["curve"])],part["curve"])
        self.assertEqual(part["position"]["entry_date"],"2026-01-05")

    def test_paper_registration_duplicate_and_revision(self):
        asset={"market":"crypto","timezone":"UTC"}
        now=datetime(2026,1,2,12,tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"paper.json"
            paper_update(path,[row()],self.rules,asset,now,False)
            rows=[row(),row("2026-01-02"),row("2026-01-03")]
            out=paper_update(path,rows,self.rules,asset,now+timedelta(days=2),False)
            self.assertEqual(out["position"]["entry_date"],"2026-01-03")
            old=path.read_text()
            paper_update(path,rows,self.rules,asset,now+timedelta(days=2),False)
            self.assertEqual(old,path.read_text())
            revised=copy.deepcopy(rows);revised[-1]["close"]+=1
            with self.assertRaises(ValueError):paper_update(path,revised,self.rules,asset,now+timedelta(days=2),False)
            self.assertEqual(old,path.read_text())
            with self.assertRaises(ValueError):paper_update(path,rows,replace(self.rules,risk=.01),asset,now,False)
            self.assertEqual(old,path.read_text())

    def test_offline_does_not_start_or_advance_paper(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"paper.json";asset={"market":"crypto","timezone":"UTC"};now=datetime.now(timezone.utc)
            self.assertEqual(paper_update(path,[row()],self.rules,asset,now,True)["status"],"not_started")
            self.assertFalse(path.exists())


if __name__ == "__main__":unittest.main()
