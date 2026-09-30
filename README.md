# 정찬민의 홈페이지 · 알고리즘 오락실

기술개발연구프로젝트(2026-2) 개인 홈페이지 과제입니다.

## 1. 목적

직접 만든 자동매매 알고리즘을 오락기 한 대씩 들여놓고, 교수님·수업 동료·자동매매에 관심 있는 사람에게 **각 기계가 어떻게 판단하고 모의투자에서 실제로 어땠는지** 보여 줍니다. 방문자는 구경과 데모 재생만 할 수 있고, 실제 기계는 주인만 돌립니다. 모든 기록은 모의투자 결과이며 투자 조언이 아닙니다.

## 2. 주소

- 공개 홈페이지: https://chandolkarim.github.io/algo-arcade/ [접속 확인 2026-09-30]
- GitHub 저장소: https://github.com/chandolkarim/algo-arcade
- 기존 홈페이지(물류·SCM 주제): https://chandolkarim.github.io/ — 이 과제 이전 버전, 별도 저장소

## 3. 실행·수정 방법

- 파일: `index.html`(입구·소개·관심 분야·이용 수칙·문의), `machines/*.html`(기계별 상세), `assets/`(CSS·JS·글꼴), `data/`(계산 결과)
- 로컬 확인: 저장소를 Clone한 뒤 `index.html`을 브라우저로 연다. 서버로 보려면 `python3 -m http.server 8765` 후 `http://localhost:8765/`
- 계산 다시 하기: 아래 “기계별 설명”의 명령
- 테스트: `python3 -m unittest discover -s <폴더> -p 'test_*.py'` (`foreign-flow`, `rebound`, `records`, `kimchi`)
- 반영: Stage → `git diff --cached` 확인 → Commit → Push → Actions 실행 결과 → 공개 URL 확인
- 자동화: `.github/workflows/site.yml` (아래 “자동화” 참고)

## 4. 현재 상태

- 완료: 기계 4대(1 TRADING FLOOR, 2 REBOUND 25/200, 3 KIMCHI GAUGE, 4 FOREIGN FLOW) 상세 페이지, 1번 브라우저 데모, 1번 플레이 기록(구글 시트 연결), 3번 1시간 기록, Actions 테스트·배포
- 남은 일: 2번 표 두 곳 수정(손익 ▲▼ 표시, 좁은 화면 손익 열) / 동료 사용성 점검
- 최근 확인: 2026-09-30 / macOS · Chrome 계열 브라우저 창을 390px로 맞춰 공개 URL에서 확인(실제 휴대전화 아님) / 아래 “확인 기록”
- 자료·AI 도움: 아래 “자료와 AI 도움”

## 확인 기록

실제로 해 본 것만 적습니다. 해 보지 않은 것은 “미확인”입니다.

| 항목 | 조건 | 결과 |
|---|---|---|
| 가로 넘침 | 로컬, 브라우저 창 390px, 전 페이지 | 넘침 없음 |
| Tab 이동 위치 | 로컬, 키보드 Tab | 어두운 바탕 노란 테두리, 밝은 판넬 진한 테두리 보임 |
| 메뉴 링크 | 로컬, 각 페이지 메뉴의 이동 대상 존재 여부 | 모두 존재 |
| 1번 데모 재생 | 로컬, BTC·ETH 실시간 시세 / 네트워크 차단 시 | 끝까지 재생 / 합성 데이터로 재생하며 실패 안내 |
| 3번 게이지 | 로컬, 실시간 / 네트워크 차단 시 | 값 표시 / 마지막 값 유지하며 실패 안내 |
| 1번 플레이 기록 | 로컬, 저장소 CSV 24행 | 코인 19건 자동 대조, 주식 5건 대조 안 함, 모드 필터·결과 수 작동 |
| 테스트 | 로컬 | foreign-flow 13 · rebound 21 · records 9 · kimchi 5 통과 |
| 공개 URL 접속 | 2026-09-30, 공개 URL 5개 페이지 + 데이터 파일 | 모두 200, 배포 커밋 `584477e` 확인 |
| 공개 URL 화면 | 2026-09-30, 브라우저 창 390px, 5개 페이지 | 가로 넘침 없음, 메뉴 이동 대상 모두 존재, 콘솔 오류 없음, Tab 테두리 보임 |
| 공개 URL 기능 | 2026-09-30 | 1번 데모 끝까지 재생(BTC 실시간), 플레이 기록 24건, 3번 게이지 실시간 값, 4번 결과 카드 4개 |
| Actions 첫 실행 | 2026-09-30 push, run 36720928936 | test·build·deploy 성공. 테스트 48개 통과. Actions 서버(미국)에서 업비트·바이낸스·환율 수집 성공 |
| 구글 시트 연결 | 2026-09-30, Variables `SHEET_CSV_URL` 설정 후 Run workflow (run 36722120945) | 시트 24행 검사 통과, 공개 `data/records.json`의 출처가 “구글 시트”로 바뀜. 브라우저 캐시 때문에 최대 10분 늦게 보일 수 있음 |
| Actions 예약 실행 | 매시 7분 | 미확인 (첫 예약 실행 전) |
| 실제 휴대전화 | — | 미확인 |
| 동료 사용성 점검 | — | 미확인 |

## 기계별 설명

### 1번 TRADING FLOOR
AI 에이전트 13명이 분석·토론·심사해 판정을 내는 기계입니다. 실제 기계는 로컬에서만 돌고, 코드와 프롬프트는 공개하지 않습니다.

- **브라우저 데모** (`assets/floor-demo.js`): 원본 `server/demo.js`의 지표·대사·순서를 옮겼습니다. AI를 부르지 않고 코인 실시간 시세로 5단계를 연출 재생합니다. 판정에 의미가 없습니다.
- **플레이 기록** (`records/`): 기계가 낸 실제 판정을 적은 목록입니다. 코인 기록은 판정 24시간 뒤 바이낸스 현물 가격으로 등락을 계산해 원본 `report.js`의 `judge()`와 같은 규칙(±1% 미만은 “움직임 작음”)으로 판정합니다.

```bash
python3 records/build.py                       # 시트 또는 records/records.csv → data/records.json
python3 -m unittest discover -s records -p 'test_*.py' -v
```

#### 플레이 기록 시트 연결 (5주차 방식)

| 열 | 필수 | 내용 |
|---|---|---|
| 일시 | 필수 | `2026-08-24 22:06` (한국 시각) |
| 모드 | 필수 | 알고리즘 / 스캘핑 / 공격 |
| 종목 | 필수 | BTC, SOL, 삼성전자 … |
| 판정 | 필수 | 알고리즘: 매수·매도·관망 / 스캘핑: 롱·숏·패스 / 공격: 롱·숏 |
| 확신도 | 필수 | 0~100 정수 |
| 판정가 | 필수 | 0보다 큰 숫자 |
| 통화 | 필수 | USD / KRW |
| 메모 | 선택 | 한 줄 |
| 공개 | 필수 | Y인 행만 웹에 표시 |

1. 새 스프레드시트 → 파일 → 가져오기 → `records/records.csv`
2. 파일 → 공유 → 웹에 게시 → 시트1 · 쉼표로 구분된 값(.csv) → 게시 (주소가 `output=csv`로 끝나야 함)
3. 저장소 Settings → Secrets and variables → Actions → **Variables** → `SHEET_CSV_URL` = 게시 주소
4. Actions → Site → Run workflow (또는 1시간 안의 예약 실행)
5. 잘못된 행이 있으면 build가 행 번호와 이유를 출력하고 멈춥니다. 이전 화면이 그대로 남습니다.

시트에는 공개해도 되는 기록만 적습니다. 연락처·계좌 정보는 넣지 않습니다.

### 2번 REBOUND 25/200
BNF의 25일선 괴리율 매매에서 착안했습니다. 정찬민이 제안한 200일선 방향 필터에 ATR 진입·손절과 보유 기간을 더한 독립적인 연구 전략입니다. BNF 본인의 매매 재현이나 성과 인증이 아닙니다. 페이지의 아이디어 출처에 참고 링크와 차이를 적었습니다.

- 실제 가격으로 계산한 과거 백테스트와 등록 이후 모의 장부를 구분합니다.
- BTC·ETH 무기한 선물, AAPL·SPY·삼성전자·SK하이닉스를 예시 종목으로 관찰합니다. 각 종목은 독립 모의계좌입니다.
- 자동 갱신은 연결하지 않았습니다. 바이낸스 선물 주소는 미국 IP(Actions 서버)에서 막힐 수 있어 로컬에서 갱신합니다.

```bash
python3 rebound/update.py
python3 -m unittest discover -s rebound -p 'test_*.py' -v
```

규칙, 데이터 출처, 비용 가정은 `rebound/README.md`를 참고하세요. `rebound/paper/`는 등록 이후 장부이므로 보존합니다.

### 3번 KIMCHI GAUGE
업비트와 바이낸스의 비트코인 가격 차이(김치 프리미엄)를 잽니다.

- 실시간 게이지 (`assets/kimchi.js`): 방문자 브라우저가 30초마다 공개 시세를 받습니다. 인증키 없음.
- 지난 기록 (`kimchi/record.py`): Actions가 1시간마다 한 건을 더해 최근 30일을 남깁니다. 기록은 저장소에 커밋하지 않고, 배포된 기록을 이어 받아 다시 배포합니다. 시세를 못 받으면 기존 기록을 두고 실패만 표시합니다.

```bash
python3 kimchi/record.py
python3 -m unittest discover -s kimchi -p 'test_*.py' -v
```

### 4번 FOREIGN FLOW
외국인이 코스피를 많이 사면 다음 날 오르는지 KRX 투자자별 매매 기록(2012-10 ~ 2026-09)으로 셉니다. 기준(`foreign-flow/config.json`)은 결과를 보기 전에 고정했습니다. 결과: 같은 날은 크게 움직이지만, 다음 날을 맞히는 효과는 두 구간 모두에서 확인되지 않았습니다.

- KRX 원본 CSV는 로그인해서 내려받아 `foreign-flow/raw/`에 둡니다. 재배포 조건 확인 전이라 Git에 올리지 않고, 요약 통계만 공개합니다.

```bash
python3 foreign-flow/build.py
python3 -m unittest discover -s foreign-flow -p 'test_*.py' -v
```

## 자동화

`.github/workflows/site.yml` — Pages Source는 **GitHub Actions**입니다.

| 작업 | 하는 일 |
|---|---|
| test | 네 폴더의 파이썬 테스트, 화면 스크립트 문법 검사. 실패하면 배포하지 않음 |
| build | 플레이 기록 생성(시트 검사 포함), 김프 기록 1건 추가, 공개 파일만 `_site`로 모음 |
| deploy | GitHub Pages에 게시 |

| 실행 조건 | 언제 |
|---|---|
| push | main에 Push할 때 |
| schedule | `cron: "7 * * * *"` — 매시 7분(UTC). 한국도 매시 7분. 정확한 시각은 보장되지 않음 |
| workflow_dispatch | Actions 화면의 Run workflow (시트를 고친 뒤) |

인증키는 쓰지 않습니다. 시트 주소는 공개돼도 되는 값이라 Variables에 둡니다.

## 자료와 AI 도움

| 부분 | 만든 방법 |
|---|---|
| 기획·콘셉트·기계 선정, 결과 검토 | 정찬민 |
| 사이트 구조·디자인, 3번·4번 기계, 1번 데모 이식, 플레이 기록·Actions | Claude Code(Anthropic Claude)에 요청해 작성, 정찬민이 확인 |
| 2번 REBOUND 25/200 코드 | ChatGPT와 작업 |
| 1번 TRADING FLOOR 원본 | 정찬민의 로컬 프로젝트(비공개) |
| KRX 투자자별 매매 CSV | 정찬민이 KRX 정보데이터시스템에서 직접 내려받음 |
| 내가 직접 고친 코드 | [직접 적어 주세요 — 없으면 “없음”] |
| 글꼴 | 갈무리(Galmuri), SIL Open Font License 1.1 — `assets/fonts/LICENSE.txt` |
| 시세 | 업비트·바이낸스 공개 시세, alternative.me 공포·탐욕 지수, ExchangeRate-API, Yahoo Finance |

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 입구 — 기계 목록, 이용 수칙, 소개·관심 분야, 문의 |
| `machines/trading-floor.html` | 1번 상세 — 진행 순서, 모드, 플레이 기록, 데모 |
| `assets/floor-demo.{js,css}` | 1번 브라우저 데모 (프롬프트·Claude 호출 코드는 포함하지 않음) |
| `records/`, `assets/records.{js,css}`, `data/records*` | 1번 플레이 기록 — 검사·24시간 뒤 대조·목록 |
| `machines/rebound.html`, `assets/rebound.{js,css}`, `rebound/`, `data/rebound*` | 2번 — 계산 엔진·수집기·모의 장부·결과 |
| `machines/kimchi-gauge.html`, `assets/kimchi.js`, `assets/kimchi-history.js`, `kimchi/`, `data/kimchi-history*` | 3번 — 실시간 게이지·1시간 기록 |
| `machines/foreign-flow.html`, `assets/foreign-flow.{js,css}`, `foreign-flow/`, `data/foreign-flow*` | 4번 — 계산기·고정 기준·요약 통계 |
| `assets/style.css`, `assets/script.js` | 공통 스타일, 픽셀 그림(글자 지도 → SVG)과 현재 메뉴 표시 |
| `assets/fonts/` | 갈무리 픽셀 글꼴과 라이선스 |
| `.github/workflows/site.yml` | 테스트·빌드·배포 |

## 기획 요약

| 질문 | 내 답 |
|---|---|
| 누가 볼까? | 교수님, 수업 동료, 자동매매·AI에 관심 있는 사람 |
| 무엇을 기억했으면 하나? | AI 판단을 코드로 다시 검증하며 자동매매 알고리즘을 만드는 사람 |
| 무엇으로 보여 주나? | 오락기(알고리즘) 목록 · 상세 페이지 · 소개와 관심 분야 · 이용 수칙 · 문의 |
| 방문자가 무엇을 찾으면 성공인가? | 기계별 상태(가동·검증 완료 등)를 구분하고, 기록이 모의투자라는 점을 안다 |

## 디자인 원칙

- 4px 픽셀 단위로 테두리·그림자·간격을 맞춘다.
- 시세 색은 한국 관례를 따른다: 상승 빨강, 하락 파랑. 색만으로 구분하지 않도록 ▲▼ 기호를 함께 쓴다.
- 빨강·파랑은 시세에만 쓴다. 판정·강조 표시는 노랑·민트·연보라를 쓴다.
- 픽셀 글꼴은 제목·버튼·라벨에만, 긴 문장은 시스템 글꼴로.
- `prefers-reduced-motion`을 켠 사용자에게는 움직임을 멈춘다.
- Tab 이동 위치가 항상 보이게: 어두운 바탕은 노란 테두리, 밝은 판넬은 진한 테두리.

## 새 기계 추가하는 법

1. `machines/trading-floor.html`을 복사해 `machines/새이름.html`로 만든다.
2. 제목, 설명, 진행 순서, 기록을 바꾼다. 확인하지 않은 수치는 넣지 않는다.
3. `index.html`에서 빈자리 `<div class="cabinet">`을 `<a class="cabinet" href="machines/새이름.html">`로 바꾸고 상태를 고친다.
