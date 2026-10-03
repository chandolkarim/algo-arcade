"""Build fictional teaching examples using the production indicator/trading engines.
Run from the repository root: python3 lessons/build.py
These examples never enter historical results or paper ledgers.
"""
import json
import sys
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from rebound import engine as rebound
from breakout import engine as breakout


def build(kind, outcome):
    engine = rebound if kind == 'rebound' else breakout
    rules = engine.Rules(fee=0, slippage=0, borrow_apr=0)
    bars = []
    def add(o, h, l, c):
        bars.append(dict(date=(date(2020, 1, 1) + timedelta(days=len(bars))).isoformat(),
                         open=o, high=h, low=l, close=c))
    if kind == 'breakout':
        for _ in range(40): add(100, 101, 99, 100)
        signal_index = len(bars)
        add(100, 103.5, 99.5, 103)
        add(104, 104.5, 103.5, 104)
        if outcome == 'win':
            add(104, 110.5, 103.5, 110)
            add(110, 113.5, 109, 113)
            add(112, 112.5, 107, 109)
        else:
            add(104, 104.5, 100, 101)
            add(101, 102, 98, 100)
    else:
        for i in range(220):
            c = 90 + i * .12
            add(c - .12, c + .3, c - .3, c)
        signal_index = len(bars)
        add(bars[-1]['close'], 116.5, 110.7, 111)
        add(111.5, 112.4, 111, 112)
        if outcome == 'win':
            add(112, 114.4, 111.7, 114)
            add(114, 117.4, 113.7, 117)
            add(117.2, 117.5, 116.5, 117)
        else:
            add(112, 112.4, 110.5, 111)
            add(111, 111.4, 108, 109)
    rows = engine.indicators(bars, rules)
    assert engine.signal(rows[signal_index], rules) == 1
    account = engine.new_account(rules)
    states = {}
    for i in range(signal_index + 1, len(rows)):
        engine.advance(account, rows[i], rows[i-1], rules, market='crypto')
        states[i] = deepcopy(account)
    assert len(account['trades']) == 1
    trade = account['trades'][0]
    assert trade['entry_date'] == rows[signal_index+1]['date']
    assert trade['exit_date'] == rows[-1]['date']
    assert (trade['net'] > 0) == (outcome == 'win')
    assert trade['reason'] == ('mean' if kind == 'rebound' and outcome == 'win' else 'trailing_stop' if kind == 'breakout' and outcome == 'win' else 'stop')
    start = signal_index - 20
    view = []
    for i in range(start, len(rows)):
        r = rows[i]
        state = states.get(i)
        prev = states.get(i-1)
        stop = None
        if prev and prev['position']: stop = prev['position']['stop']
        elif state and state['position']: stop = state['position']['stop']
        view.append({**{k: r[k] for k in ['open','high','low','close','atr']},
                     'day': i-signal_index,
                     'fast': r.get('sma25'), 'slow': r.get('sma200'),
                     'upper': r.get('upper'), 'lower': r.get('lower'),
                     'stop': stop, 'nextStop': state['position']['stop'] if state and state['position'] else None})
    return dict(rows=view, ends=[19,20,21,len(view)-2,len(view)-1],
                entry=trade['entry'], exit=trade['exit'], reason=trade['reason'],
                atr=rows[signal_index]['atr'], initialStop=trade['entry']-2*rows[signal_index]['atr'])


if __name__ == '__main__':
    data = {k: {o: build(k,o) for o in ['win','loss']} for k in ['rebound','breakout']}
    (ROOT/'data/strategy-lessons.js').write_text('window.STRATEGY_LESSONS = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
    print('Built and checked 4 fictional lessons with production engines (costs disabled).')
