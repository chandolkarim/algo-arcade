window.FOREIGN_FLOW_DATA = {
  "schema": 1,
  "rules": {
    "version": "1.0.0",
    "fixed_at": "2026-09-30",
    "note": "결과를 보기 전에 고정한 기준. 바꾸면 version을 올리고 페이지에 바꾼 이유를 적는다.",
    "window": 60,
    "z_threshold": 2.0,
    "streak_days": 5,
    "streak_horizon": 5,
    "validation_start": "2022-01-01",
    "alpha": 0.05,
    "min_samples": 20
  },
  "generated_at": "2026-09-30T12:44:36+00:00",
  "price_mode": "online",
  "range": {
    "first": "2012-10-02",
    "last": "2026-09-29",
    "days": 3430,
    "first_scored": "2012-12-28",
    "dropped_days": [
      "2017-09-22",
      "2017-12-20",
      "2022-01-03",
      "2022-05-09"
    ]
  },
  "sources": {
    "flows": "KRX 정보데이터시스템 · 투자자별 거래실적(일별추이) · KOSPI · 거래대금 순매수",
    "prices": "Yahoo Finance ^KS11 종가"
  },
  "questions": [
    {
      "id": "same_day",
      "title": "같은 날 (함정 보여 주기)",
      "horizon": 0,
      "signal": "외국인 순매수(+)인 날",
      "measure": "그날 코스피 등락",
      "periods": {
        "design": {
          "signal": {
            "n": 1094,
            "up": 768,
            "up_share": 0.7020109689213894,
            "mean": 0.0036905004282964215
          },
          "base": {
            "n": 2214,
            "up": 1178,
            "up_share": 0.5320686540198736,
            "mean": 0.00022876260762901278
          },
          "p_value": 2.4878336545684253e-30,
          "direction": "up",
          "significant": true
        },
        "validation": {
          "signal": {
            "n": 548,
            "up": 408,
            "up_share": 0.7445255474452555,
            "mean": 0.007334924431481802
          },
          "base": {
            "n": 1156,
            "up": 634,
            "up_share": 0.5484429065743944,
            "mean": 0.0009008824370533912
          },
          "p_value": 3.6253384648334594e-21,
          "direction": "up",
          "significant": true
        }
      },
      "verdict": "effect",
      "verdict_reason": "두 구간 모두 같은 방향으로 유의"
    },
    {
      "id": "big_buy",
      "title": "대량 순매수 다음 날",
      "horizon": 1,
      "signal": "표준화 값 +2 이상",
      "measure": "다음 날 코스피 등락",
      "periods": {
        "design": {
          "signal": {
            "n": 69,
            "up": 40,
            "up_share": 0.5797101449275363,
            "mean": 0.0017583842846373757
          },
          "base": {
            "n": 2214,
            "up": 1178,
            "up_share": 0.5320686540198736,
            "mean": 0.0002283161091731578
          },
          "p_value": 0.47017942276467695,
          "direction": "up",
          "significant": false
        },
        "validation": {
          "signal": {
            "n": 35,
            "up": 18,
            "up_share": 0.5142857142857142,
            "mean": 0.0012253618258842762
          },
          "base": {
            "n": 1155,
            "up": 633,
            "up_share": 0.548051948051948,
            "mean": 0.0008982924124575849
          },
          "p_value": 0.7357353401784695,
          "direction": "down",
          "significant": false
        }
      },
      "verdict": "none",
      "verdict_reason": "두 구간 모두 기준선과 차이가 우연 범위"
    },
    {
      "id": "streak",
      "title": "5일 연속 순매수 뒤",
      "horizon": 5,
      "signal": "5거래일 연속 순매수(+) 첫날",
      "measure": "그 뒤 5거래일 코스피 등락",
      "periods": {
        "design": {
          "signal": {
            "n": 60,
            "up": 34,
            "up_share": 0.5666666666666667,
            "mean": 0.002230637431491343
          },
          "base": {
            "n": 2214,
            "up": 1221,
            "up_share": 0.551490514905149,
            "mean": 0.0011190140898100678
          },
          "p_value": 0.8969386093068672,
          "direction": "up",
          "significant": false
        },
        "validation": {
          "signal": {
            "n": 26,
            "up": 15,
            "up_share": 0.5769230769230769,
            "mean": 0.01072661966060073
          },
          "base": {
            "n": 1151,
            "up": 651,
            "up_share": 0.5655951346655083,
            "mean": 0.004467205130711214
          },
          "p_value": 1.0,
          "direction": "up",
          "significant": false
        }
      },
      "verdict": "none",
      "verdict_reason": "두 구간 모두 기준선과 차이가 우연 범위"
    },
    {
      "id": "big_sell",
      "title": "대량 순매도 다음 날",
      "horizon": 1,
      "signal": "표준화 값 −2 이하",
      "measure": "다음 날 코스피 등락",
      "periods": {
        "design": {
          "signal": {
            "n": 85,
            "up": 48,
            "up_share": 0.5647058823529412,
            "mean": -0.00047463986956976153
          },
          "base": {
            "n": 2214,
            "up": 1178,
            "up_share": 0.5320686540198736,
            "mean": 0.0002283161091731578
          },
          "p_value": 0.58765229079763,
          "direction": "up",
          "significant": false
        },
        "validation": {
          "signal": {
            "n": 44,
            "up": 23,
            "up_share": 0.5227272727272727,
            "mean": -0.0024683577425798704
          },
          "base": {
            "n": 1155,
            "up": 633,
            "up_share": 0.548051948051948,
            "mean": 0.0008982924124575849
          },
          "p_value": 0.7635428669180011,
          "direction": "down",
          "significant": false
        }
      },
      "verdict": "none",
      "verdict_reason": "두 구간 모두 기준선과 차이가 우연 범위"
    }
  ],
  "latest": {
    "date": "2026-09-29",
    "z": -1.05,
    "direction": "sell",
    "streak": 0
  }
};
