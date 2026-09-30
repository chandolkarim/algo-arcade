# 알고리즘 오락실 · 정찬민 개인 홈페이지

기술개발연구프로젝트(2026-2) 개인 홈페이지 과제입니다.

직접 만든 자동매매 알고리즘을 오락기 한 대씩 들여놓는 사이트입니다. 방문자는 작동 모습과 모의투자 기록을 구경할 수 있고, 실행은 할 수 없습니다.

- 공개 주소: (배포 후 기입)
- 만든 사람: 정찬민 · 한국외국어대학교 아랍어과 · Business AI
- GitHub: https://github.com/chandolkarim

## 실행 방법

설치나 빌드 없이 브라우저로 열 수 있습니다.

1. 저장소를 내려받거나 Clone합니다.
2. `index.html`을 브라우저로 엽니다.
3. 폴더 구조(`assets/`, `machines/`)를 그대로 유지해야 스타일·글꼴·그림이 적용됩니다.

`file://`로 열어도 동작합니다. 로컬 서버로 확인하려면:

```bash
python3 -m http.server 8765
```

그다음 `http://localhost:8765/`를 엽니다.

## 기획 요약

| 질문 | 내 답 |
|---|---|
| 누가 볼까? | 교수님, 수업 동료, 자동매매·AI에 관심 있는 사람 |
| 무엇을 기억했으면 하나? | AI 판단을 코드로 다시 검증하며 자동매매 알고리즘을 만드는 사람 |
| 무엇으로 보여 주나? | 오락기(알고리즘) 목록 · 상세 페이지 · 소개와 관심 분야 · 이용 수칙 · 문의 |
| 방문자가 무엇을 찾으면 성공인가? | 가동 중인 기계와 조립 중인 기계를 구분하고, 기록이 모의투자라는 점을 안다 |

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 입구 — 기계 목록, 이용 수칙, 소개·관심 분야, 문의 |
| `machines/trading-floor.html` | TRADING FLOOR 상세 페이지 (새 기계는 이 파일을 복사해서 만든다) |
| `assets/floor-demo.{js,css}` | TRADING FLOOR 브라우저 데모 — AI 없이 코인 실시간 시세로 5단계 연출 재생. 원본 `server/demo.js`에서 옮김(프롬프트·Claude 호출 코드는 포함하지 않음) |
| `machines/rebound.html` | 2번 REBOUND 25/200 — 관측·백테스트·모의 기록·아이디어 출처 |
| `assets/rebound.css`, `assets/rebound.js` | 2번 전용 스타일·저장 결과 표시 |
| `rebound/` | 2번 Python 계산 엔진·수집기·검증·모의 장부 |
| `data/rebound.json`, `data/rebound-data.js` | 2번 계산 결과와 로컬 파일 열기용 데이터 |
| `assets/style.css` | 두 페이지가 함께 쓰는 스타일 |
| `machines/kimchi-gauge.html` | KIMCHI GAUGE 상세 페이지 — 실시간 김치 프리미엄 게이지 |
| `assets/script.js` | 픽셀 그림(글자 지도 → SVG)과 현재 메뉴 표시. 꺼져도 내용은 모두 읽힘 |
| `assets/kimchi.js` | 업비트·바이낸스·환율 공개 시세로 김프 계산(30초마다, 인증키 없음) |
| `machines/foreign-flow.html`, `assets/foreign-flow.{css,js}` | 4번 FOREIGN FLOW — 외국인 순매수 뒤 코스피 등락 검증 결과 |
| `foreign-flow/` | 4번 계산기(`build.py`), 고정 기준(`config.json`), 테스트. `raw/`(KRX 원본)와 `cache/`는 올리지 않음 |
| `data/foreign-flow.json`, `data/foreign-flow-data.js` | 4번 요약 통계 (원본 일별 값은 포함하지 않음) |
| `assets/fonts/` | 갈무리 픽셀 글꼴과 라이선스(SIL OFL 1.1) — 외부 서버 없이 폴더 안에 포함 |

## 디자인 원칙

- 4px 픽셀 단위로 테두리·그림자·간격을 맞춘다.
- 시세 색은 한국 관례를 따른다: 상승 빨강, 하락 파랑. 색만으로 구분하지 않도록 ▲▼ 기호를 함께 쓴다.
- 빨강·파랑은 시세에만 쓴다. 강조·주의 표시는 노랑을 쓴다.
- 픽셀 글꼴은 제목·버튼·라벨에만, 긴 문장은 시스템 글꼴로 읽기 쉽게.
- `prefers-reduced-motion`을 켠 사용자에게는 전광판과 캐릭터 움직임을 멈춘다.
- Tab 이동 위치가 항상 보이게: 어두운 바탕은 노란 테두리, 밝은 판넬은 진한 테두리.

## 확인 기록

| 항목 | 방법 | 결과 |
|---|---|---|
| 390px 가로 넘침 (두 페이지) | 브라우저 창 390px로 문서 폭 측정 | 넘침 없음 (로컬) |
| Tab 이동 위치 표시 | 키보드 Tab으로 이동하며 화면 확인 | 모든 링크·버튼에 테두리 보임 (로컬) |
| 메뉴 링크 이동 | 메뉴 클릭 후 도착 위치 확인 | 미확인 (배포 후 확인 예정) |
| 공개 주소 접속 | 다른 기기에서 공개 URL 열기 | 미확인 |
| 실제 휴대전화 | 휴대전화로 공개 URL 열기 | 미확인 |

## 새 기계 추가하는 법

1. `machines/trading-floor.html`을 복사해 `machines/새이름.html`로 만든다.
2. 제목, 설명, 진행 순서, 기록을 바꾼다. 확인하지 않은 수치는 넣지 않는다.
3. `index.html`에서 해당 기계의 `<div class="cabinet">`을 `<a class="cabinet" href="machines/새이름.html">`로 바꾸고 상태를 `모의투자 가동 중`으로 고친다.

## 이용 수칙

모든 기록은 모의투자 결과이며 투자 조언이 아닙니다. 실제 주문은 발생하지 않습니다.


## 2번 기계 · REBOUND 25/200

BNF의 25일선 괴리율 매매에서 착안했습니다. 정찬민이 제안한 200일선 방향 필터에 ATR 진입·손절과 보유 기간을 더한 독립적인 연구 전략입니다. BNF 본인의 매매 재현이나 성과 인증이 아닙니다. 페이지의 아이디어 출처에 참고 링크와 차이를 적었습니다.

- 기존처럼 `index.html`을 더블클릭한 뒤 2번 기계를 열면 됩니다. 저장된 데이터로 동작합니다.
- 실제 가격으로 계산한 과거 백테스트와 등록 이후 모의 장부를 구분합니다.
- BTC·ETH 무기한 선물, AAPL·SPY·삼성전자·SK하이닉스를 예시 종목으로 관찰합니다.
- 각 종목은 독립 모의계좌이며 합산 포트폴리오 수익률이 아닙니다.
- 자동 갱신·공개 배포·실제 주문은 연결하지 않았습니다. 갱신하려면 Python 3.9 이상에서 아래 명령을 실행합니다.

```bash
python3 rebound/update.py
python3 -m unittest discover -s rebound -p 'test_*.py' -v
```

규칙, 데이터 출처, 비용 가정, 실행·검증 방법은 `rebound/README.md`를 참고하세요. `rebound/paper/`는 등록 이후 장부이므로 보존해야 합니다.

## 4번 기계 · FOREIGN FLOW

외국인이 코스피를 많이 사면 다음 날 오르는지 KRX 투자자별 매매 기록(2012-10 ~ 2026-09)으로 셉니다. 기준(`foreign-flow/config.json`)은 결과를 보기 전에 고정했습니다.

- KRX 원본 CSV는 로그인해서 내려받아 `foreign-flow/raw/`에 둡니다. 재배포 조건 확인 전이라 Git에 올리지 않습니다.
- 공개하는 것은 요약 통계(`data/foreign-flow.json`)뿐입니다.

```bash
python3 foreign-flow/build.py
python3 -m unittest discover -s foreign-flow -p 'test_*.py' -v
```
