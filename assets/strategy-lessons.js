/* Fictional teaching examples only; data is checked by lessons/build.py. */
(() => {
  const ns = 'http://www.w3.org/2000/svg';
  const n = value => Number(value).toFixed(2);
  const svgEl = (tag, attrs, text) => {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
    if (text !== undefined) el.textContent = text;
    return el;
  };
  document.querySelectorAll('[data-strategy-lesson]').forEach(root => {
    const kind = root.dataset.strategyLesson;
    const data = window.STRATEGY_LESSONS?.[kind];
    if (!data) return;
    root.querySelector('.lesson-interactive').hidden = false;
    root.querySelector('.lesson-fallback').hidden = true;
    let outcome = 'win', step = 0;
    const chart = root.querySelector('.lesson-chart');
    const prev = root.querySelector('[data-action="prev"]');
    const next = root.querySelector('[data-action="next"]');
    const caseButtons = [...root.querySelectorAll('[data-outcome]')];
    function copy(d) {
      const sig = d.rows[20], before = d.rows[19], last = d.rows.at(-1);
      if (kind === 'breakout') return [
        ['어제까지의 벽을 그려요', `직전 20개 봉의 최고가는 ${n(sig.upper)}, 최저가는 ${n(sig.lower)}입니다. 오늘 봉은 아직 기준에 넣지 않습니다.`],
        ['마감 뒤 돌파를 확인해요', `오늘 종가(${n(sig.close)})가 상단(${n(sig.upper)})을 넘었습니다. 오늘 고가(${n(sig.high)})로 기준을 바꾸지 않고, 다음 봉 시가를 기다립니다.`],
        ['다음 시가에 들어가요', `다음 시가 ${n(d.entry)}도 신호일 상단 ${n(sig.upper)}보다 높아 롱 진입합니다. 최초 손절은 ${n(d.entry)} − 2 × 신호일 ATR ${n(d.atr)} = ${n(d.initialStop)}입니다.`],
        outcome === 'win'
          ? ['종가를 따라 손절선을 올려요', `최고 종가가 ${n(d.rows.at(-2).close)}까지 올라, 다음 봉 손절선은 ${n(d.rows.at(-2).nextStop)}이 됩니다. 새 손절선은 다음 봉부터 적용하고, 거리는 진입 때 쓴 ATR로 고정합니다.`]
          : ['가격이 떨어져도 손절선은 내리지 않아요', `종가가 ${n(d.rows.at(-2).close)}까지 내려왔지만 손절선은 ${n(d.initialStop)}에 남습니다. 더 오래 버티려고 손절 폭을 넓히지 않습니다.`],
        outcome === 'win'
          ? ['추적 손절선에 닿으면 청산해요', `마지막 봉의 저가(${n(last.low)})가 적용 중인 손절선 ${n(d.exit)}에 닿아 청산합니다. 진입 ${n(d.entry)} → 청산 ${n(d.exit)}. 고정 익절가 없이 흐름을 따라간 사례입니다.`]
          : ['돌파가 실패하면 손실로 끝나요', `마지막 봉의 저가(${n(last.low)})가 최초 손절선 ${n(d.exit)}에 닿아 청산합니다. 진입 ${n(d.entry)} → 청산 ${n(d.exit)}. 범위를 넘었다고 상승이 계속되는 것은 아닙니다.`],
      ];
      return [
        ['200일선으로 방향을 확인해요', `종가(${n(before.close)})가 200일선 ${n(before.slow)} + 1 ATR ${n(before.atr)}보다 높아 롱만 검토합니다. 200일선 주변의 1 ATR 구간에서는 쉬어요.`],
        ['25일선에서 충분히 떨어졌나요?', `종가(${n(sig.close)})가 25일선 ${n(sig.fast)}보다 ${n(sig.fast-sig.close)} 낮습니다. 2 ATR ${n(2*d.atr)} 이상 떨어졌고, 200일선 + 1 ATR 위여서 롱 후보입니다.`],
        ['다음 시가를 다시 확인해요', `시가(${n(d.entry)})가 신호일 25일선 아래이면서 200일선 + 1 ATR 위라 진입합니다. 최초 손절은 진입가 − 2 ATR = ${n(d.initialStop)}입니다.`],
        outcome === 'win'
          ? ['25일선 복귀를 종가로 확인해요', `종가(${n(d.rows.at(-2).close)})가 그날의 25일선 ${n(d.rows.at(-2).fast)} 이상으로 돌아왔습니다. 이 종가에 즉시 팔지 않고 다음 봉 시가 청산을 예약합니다.`]
          : ['평균으로 돌아오지 않을 수도 있어요', `종가(${n(d.rows.at(-2).close)})는 아직 25일선 아래입니다. 복귀 신호를 기다리되, 장중 손절선 ${n(d.initialStop)}은 계속 적용합니다.`],
        outcome === 'win'
          ? ['다음 시가에 수익을 확정해요', `다음 봉 시가 ${n(d.exit)}에 청산합니다. 진입 ${n(d.entry)} → 청산 ${n(d.exit)}. 평균 복귀를 확인한 날과 실제 청산한 날이 다릅니다.`]
          : ['손절에 닿으면 복귀를 기다리지 않아요', `마지막 봉 저가(${n(last.low)})가 손절선 ${n(d.exit)}에 닿아 장중 청산합니다. 진입 ${n(d.entry)} → 청산 ${n(d.exit)}. 평균 복귀는 보장되지 않습니다.`],
      ];
    }
    function draw(d, end) {
      chart.replaceChildren();
      const width = Math.max(320, Math.round(chart.getBoundingClientRect().width));
      const height = 300, left = 44, right = width-14, top = 25, bottom = 261;
      chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const rows = d.rows;
      const all = rows.flatMap(r=>[r.high,r.low,kind==='rebound'?r.slow:r.lower,kind==='rebound'?r.fast:r.upper]).filter(Number.isFinite);
      const min = Math.min(...all)-1, max = Math.max(...all)+1;
      const slot = (right-left)/rows.length;
      const x = i=>left+slot*(i+.5), y=v=>bottom-(v-min)/(max-min)*(bottom-top);
      chart.setAttribute('aria-label', `${kind==='rebound'?'REBOUND':'BREAKOUT'} 설명용 가상 일봉. ${step+1}/5단계: ${copy(d)[step][0]}. 빨강은 상승 봉, 파랑은 하락 봉.`);
      const append=(tag,attrs,text)=>chart.append(svgEl(tag,attrs,text));
      for(let i=0;i<4;i++) {
        const v=min+(max-min)*i/3;
        append('line',{x1:left,y1:y(v),x2:right,y2:y(v),stroke:'#e5e7eb'});
        append('text',{x:left-6,y:y(v)+4,'text-anchor':'end',fill:'#566170','font-size':11},n(v));
      }
      if(end<rows.length-1) {
        append('rect',{x:x(end)+slot/2,y:top,width:right-x(end)-slot/2,height:bottom-top,fill:'#f0f2f5'});
        append('text',{x:right-4,y:top+12,'text-anchor':'end',fill:'#596579','font-size':10},'다음 단계');
      }
      append('rect',{x:x(end)-slot/2,y:top,width:slot,height:bottom-top,fill:'#ffd23f',opacity:.3});
      const line=(key,color,dash) => {
        const path=rows.slice(0,end+1).map((r,i)=>`${i?'L':'M'}${x(i)},${y(kind==='breakout' && i>20 ? rows[20][key] : r[key])}`).join(' ');
        append('path',{d:path,fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':dash||'none'});
      };
      if(kind==='rebound') {line('fast','#6b46c1');line('slow','#087f5b','5 3');}
      else {line('upper','#087f5b','5 3');line('lower','#087f5b','2 3');}
      rows.slice(0,end+1).forEach((r,i)=>{
        const color=r.close>=r.open?'#dc3545':'#2166d1';
        append('line',{x1:x(i),y1:y(r.high),x2:x(i),y2:y(r.low),stroke:color,'stroke-width':1.5});
        append('rect',{x:x(i)-slot*.28,y:y(Math.max(r.open,r.close)),width:slot*.56,height:Math.max(2,Math.abs(y(r.open)-y(r.close))),fill:color});
        if(r.stop!==null) append('line',{x1:x(i)-slot/2,y1:y(r.stop),x2:x(i)+slot/2,y2:y(r.stop),stroke:'#b54708','stroke-width':2.5,'stroke-dasharray':'4 2'});
      });
      [[0,'20봉 전'],[19,'어제'],[20,'신호일'],[rows.length-1,'이후']].forEach(([i,t],idx)=>{
        if(width<500 && (idx===1 || idx===3)) return;
        append('text',{x:x(i),y:286,'text-anchor':i===0?'start':(i===rows.length-1 || (width<500 && i===20))?'end':'middle',fill:'#566170','font-size':11},t);
      });
      // 신호는 왼쪽 위, 진입은 오른쪽 아래에 적어 좁은 화면에서도 글자가 겹치지 않게 한다
      const mark=(i,v,label,color,offset,side='left')=>{
        append('circle',{cx:x(i),cy:y(v),r:5,fill:'#fff',stroke:color,'stroke-width':2.5});
        append('text',{x:x(i)+(side==='left'?-8:8),y:y(v)+offset,'text-anchor':side==='left'?'end':'start',fill:color,'font-size':12,'font-weight':700},label);
      };
      if(step>=1) mark(20,rows[20].close,'신호','#6b46c1',-10);
      if(step>=2) mark(21,d.entry,'진입','#1b1438',20,'right');
      if(step===4) mark(rows.length-1,d.exit,'청산','#b54708',-12);
    }
    function render() {
      const d=data[outcome], [title,text]=copy(d)[step];
      root.querySelector('.lesson-progress').textContent=`${step+1} / 5단계`;
      root.querySelector('.lesson-step-title').textContent=title;
      root.querySelector('.lesson-explanation').textContent=text;
      root.querySelector('.lesson-day').textContent=step===0?'직전 20개 봉':`신호일${d.rows[d.ends[step]].day ? ` + ${d.rows[d.ends[step]].day}봉` : ' 마감'}`;
      prev.disabled=step===0; next.disabled=step===4;
      caseButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.outcome===outcome)));
      draw(d,d.ends[step]);
    }
    prev.addEventListener('click',()=>{if(step>0) {step--;render();}});
    next.addEventListener('click',()=>{if(step<4) {step++;render();}});
    root.querySelector('[data-action="restart"]').addEventListener('click',()=>{step=0;render();});
    caseButtons.forEach(b=>b.addEventListener('click',()=>{outcome=b.dataset.outcome;step=0;render();}));
    let frame;
    window.addEventListener('resize',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(render);});
    render();
  });
})();
