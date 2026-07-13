# 赛事数据结构化比较 2026-07-13

- comparedAt: 2026-07-13T08:39:32.973Z
- public generatedAt: 2026-06-03T07:16:22.701Z

## 总量
| 指标 | public | new crawl | Δ |
|---|---:|---:|---:|
| 总数 | 1341 | 1253 | -88 |
| 未来 | 328 | 325 | -3 |
| 报名中 open | 808 | 72 | -736 |
| 多源确认 | - | 391 | - |
| 新增 ID | - | 51 | - |
| 删除 ID | - | 139 | - |

## 主来源分布（new）
```
{
  "zuicool": 1136,
  "chinarun": 2,
  "nowrun": 104,
  "marathonbm": 11
}
```

## 确认来源分布（new sources[]）
```
{
  "zuicool": 1136,
  "chinarun": 2,
  "nowrun": 486,
  "marathonbm": 38
}
```

## 质量检查
- 重复 ID: 0
- 必填/非法字段错误: 0
- 明显过期仍 open: 0
- 同城同日疑似重复（未来）: 29
- status 变化（kept）: 846

## 发布建议
结构质量门通过（0 重复 ID、0 必填错误）；可考虑发布新赛事数据，但本次验收不自动覆盖 public/races.json

## 抽查新增（未来优先）
```json
[
  {
    "id": "mb-6201",
    "date": "2026-07-13",
    "name": "2026兴化马拉松",
    "city": "泰州",
    "status": "open",
    "_source": "marathonbm",
    "sources": [
      "marathonbm"
    ]
  },
  {
    "id": "zc-66074",
    "date": "2026-07-19",
    "name": "2026『忠沃·文冠果』白银平川半程马拉松",
    "city": "白银",
    "status": "open",
    "_source": "zuicool-events",
    "sources": [
      "nowrun",
      "zuicool"
    ]
  },
  {
    "id": "zc-73761",
    "date": "2026-07-26",
    "name": "2026西藏林芝南迦巴瓦高原体育大会 奇正藏药林芝半程马拉松",
    "city": "林芝",
    "status": "open",
    "_source": "zuicool-events",
    "sources": [
      "zuicool"
    ]
  },
  {
    "id": "mb-6190",
    "date": "2026-07-31",
    "name": "2026呼伦贝尔草原马拉松",
    "city": "呼伦贝尔",
    "status": "open",
    "_source": "marathonbm",
    "sources": [
      "marathonbm"
    ]
  },
  {
    "id": "zc-93656",
    "date": "2026-08-09",
    "name": "2026康保草原马拉松",
    "city": "张家口",
    "status": "open",
    "_source": "zuicool",
    "sources": [
      "nowrun",
      "zuicool"
    ]
  },
  {
    "id": "zc-55367",
    "date": "2026-08-09",
    "name": "2026马尔康半程马拉松",
    "city": "阿坝藏族羌族",
    "status": "open",
    "_source": "zuicool",
    "sources": [
      "marathonbm",
      "zuicool"
    ]
  },
  {
    "id": "nr-386",
    "date": "2026-08-09",
    "name": "2026马尔康市半程马拉松",
    "city": "阿坝州马尔康",
    "status": "upcoming",
    "_source": "nowrun",
    "sources": [
      "nowrun"
    ]
  },
  {
    "id": "zc-93028",
    "date": "2026-08-16",
    "name": "2026吉木萨尔天山马拉松",
    "city": "昌吉",
    "status": "open",
    "_source": "zuicool",
    "sources": [
      "nowrun",
      "zuicool"
    ]
  },
  {
    "id": "zc-29487",
    "date": "2026-08-16",
    "name": "2026鹤庆半程马拉松",
    "city": "大理",
    "status": "open",
    "_source": "zuicool",
    "sources": [
      "nowrun",
      "zuicool"
    ]
  },
  {
    "id": "zc-95700",
    "date": "2026-08-23",
    "name": "2026呼伦贝尔草原马拉松",
    "city": "呼伦贝尔",
    "status": "open",
    "_source": "zuicool",
    "sources": [
      "nowrun",
      "zuicool"
    ]
  },
  {
    "id": "zc-16254",
    "date": "2026-08-23",
    "name": "2026多彩贵州半程马拉松超级联赛（第三站）暨一道长通新能源威宁半程马拉松",
    "city": "毕节",
    "status": "open",
    "_source": "zuicool",
    "sources": [
      "zuicool"
    ]
  },
  {
    "id": "zc-84857",
    "date": "2026-08-23",
    "name": "2026拉萨半程马拉松",
    "city": "拉萨",
    "status": "open",
    "_source": "zuicool-events",
    "sources": [
      "marathonbm",
      "nowrun",
      "zuicool"
    ]
  },
  {
    "id": "mb-6044",
    "date": "2026-08-23",
    "name": "2026威宁半程马拉松",
    "city": "毕节",
    "status": "open",
    "_source": "marathonbm",
    "sources": [
      "marathonbm"
    ]
  },
  {
    "id": "nr-84",
    "date": "2026-08-31",
    "name": "2026鹤岗森林半程马拉松",
    "city": "鹤岗",
    "status": "upcoming",
    "_source": "nowrun",
    "sources": [
      "nowrun"
    ]
  },
  {
    "id": "zc-16346",
    "date": "2026-09-06",
    "name": "2026金昌半程马拉松",
    "city": "金昌",
    "status": "open",
    "_source": "zuicool",
    "sources": [
      "marathonbm",
      "nowrun",
      "zuicool"
    ]
  }
]
```

## 抽查删除（未来优先）
```json
[
  {
    "id": "zc-15779",
    "date": "2026-07-19",
    "name": "2026『忠沃·文冠果』白银平川半程马拉松",
    "city": "白银",
    "status": "open",
    "_source": "zuicool"
  },
  {
    "id": "nr-460",
    "date": "2026-07-19",
    "name": "2026白银平川半程马拉松",
    "city": "白银",
    "status": "upcoming",
    "_source": "nowrun"
  },
  {
    "id": "nr-410",
    "date": "2026-07-19",
    "name": "2026多彩贵州马拉松超级联赛（第四站）暨六盘水马拉松",
    "city": "六盘水",
    "status": "upcoming",
    "_source": "nowrun"
  },
  {
    "id": "zc-16208",
    "date": "2026-07-26",
    "name": "2026西藏林芝南迦巴瓦高原体育大会 奇正藏药林芝半程马拉松",
    "city": "林芝",
    "status": "open",
    "_source": "zuicool"
  },
  {
    "id": "nr-467",
    "date": "2026-07-31",
    "name": "2026大美青海高原马拉松",
    "city": "西宁",
    "status": "upcoming",
    "_source": "nowrun"
  },
  {
    "id": "zc-84776",
    "date": "2026-08-01",
    "name": "2026马尔康市半程马拉松",
    "city": "阿坝藏族羌族",
    "status": "upcoming",
    "_source": "zuicool-events"
  },
  {
    "id": "zc-81174",
    "date": "2026-08-01",
    "name": "2026鹤庆半程马拉松",
    "city": "大理白族",
    "status": "upcoming",
    "_source": "zuicool-events"
  },
  {
    "id": "zc-31903",
    "date": "2026-08-01",
    "name": "2026康保草原马拉松",
    "city": "张家口",
    "status": "upcoming",
    "_source": "zuicool-events"
  },
  {
    "id": "zc-70165",
    "date": "2026-08-01",
    "name": "2026吉木萨尔天山马拉松",
    "city": "昌吉回族",
    "status": "upcoming",
    "_source": "zuicool-events"
  },
  {
    "id": "zc-19068",
    "date": "2026-08-23",
    "name": "2026拉萨半程马拉松",
    "city": "拉萨",
    "status": "open",
    "_source": "zuicool"
  },
  {
    "id": "zc-92415",
    "date": "2026-08-23",
    "name": "2026多彩贵州半程马拉松超级联赛（第三站）暨一道长通新能源威宁半程马拉松",
    "city": "毕节",
    "status": "upcoming",
    "_source": "zuicool-events"
  },
  {
    "id": "zc-12764",
    "date": "2026-08-23",
    "name": "2026呼伦贝尔草原马拉松",
    "city": "呼伦贝尔",
    "status": "upcoming",
    "_source": "zuicool-events"
  },
  {
    "id": "nr-472",
    "date": "2026-08-30",
    "name": "2026星星故乡宁夏沙坡头半程马拉松",
    "city": "中卫",
    "status": "upcoming",
    "_source": "nowrun"
  },
  {
    "id": "mb-6025",
    "date": "2026-08-30",
    "name": "2026星星故乡·宁夏沙坡头半程马拉松",
    "city": "中卫",
    "status": "open",
    "_source": "marathonbm"
  },
  {
    "id": "nr-85",
    "date": "2026-08-31",
    "name": "2026哈尔滨马拉松",
    "city": "哈尔滨",
    "status": "upcoming",
    "_source": "nowrun"
  }
]
```

## open-but-past sample
```json
[]
```

## 同城同日疑似重复 sample
```json
[
  {
    "key": "白银|2026-07-19",
    "races": [
      {
        "id": "zc-66074",
        "name": "2026『忠沃·文冠果』白银平川半程马拉松",
        "sources": [
          "nowrun",
          "zuicool"
        ]
      },
      {
        "id": "mb-5962",
        "name": "2026忠沃·文冠果白银平川半程马拉松",
        "sources": [
          "marathonbm"
        ]
      }
    ]
  },
  {
    "key": "林芝|2026-07-26",
    "races": [
      {
        "id": "zc-73761",
        "name": "2026西藏林芝南迦巴瓦高原体育大会 奇正藏药林芝半程马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-437",
        "name": "2026林芝半程马拉松",
        "sources": [
          "marathonbm",
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "毕节|2026-08-23",
    "races": [
      {
        "id": "zc-16254",
        "name": "2026多彩贵州半程马拉松超级联赛（第三站）暨一道长通新能源威宁半程马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-411",
        "name": "2026多彩贵州半程马拉松超级联赛（第二站）暨威宁半程马拉松",
        "sources": [
          "nowrun"
        ]
      },
      {
        "id": "mb-6044",
        "name": "2026威宁半程马拉松",
        "sources": [
          "marathonbm"
        ]
      }
    ]
  },
  {
    "key": "沈阳|2026-08-23",
    "races": [
      {
        "id": "zc-79200",
        "name": "2026沈阳·康平卧龙湖半程马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-61",
        "name": "2026沈阳·康平卧龙湖马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "锦州|2026-09-01",
    "races": [
      {
        "id": "zc-89026",
        "name": "2026锦州黑山半程马拉松",
        "sources": [
          "nowrun",
          "zuicool"
        ]
      },
      {
        "id": "zc-72786",
        "name": "2026锦州马拉松",
        "sources": [
          "nowrun",
          "zuicool"
        ]
      }
    ]
  },
  {
    "key": "长春|2026-09-06",
    "races": [
      {
        "id": "zc-22179",
        "name": "2026天定山·山里院子长春莲花山半程马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-76",
        "name": "2026长春莲花山半程马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "大连|2026-09-13",
    "races": [
      {
        "id": "zc-74470",
        "name": "2026大连长山岛马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "zc-40655",
        "name": "2026大连长兴岛半程马拉松",
        "sources": [
          "nowrun",
          "zuicool"
        ]
      }
    ]
  },
  {
    "key": "东营|2026-09-27",
    "races": [
      {
        "id": "zc-94552",
        "name": "金宇轮胎·2026广饶孙武湖半程马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "zc-19030",
        "name": "2026广饶孙武湖半程马拉松",
        "sources": [
          "nowrun",
          "zuicool"
        ]
      }
    ]
  },
  {
    "key": "长治|2026-10-01",
    "races": [
      {
        "id": "zc-77876",
        "name": "2026襄垣半程马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "zc-40257",
        "name": "2026襄垣马拉松",
        "sources": [
          "nowrun",
          "zuicool"
        ]
      },
      {
        "id": "zc-67052",
        "name": "2026潞城半程马拉松",
        "sources": [
          "zuicool"
        ]
      }
    ]
  },
  {
    "key": "武清|2026-10-06",
    "races": [
      {
        "id": "zc-31881",
        "name": "澳康达·2026天津武清半程马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-23",
        "name": "2026天津武清半程马拉松",
        "sources": [
          "marathonbm",
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "烟台|2026-10-18",
    "races": [
      {
        "id": "zc-31836-20261018",
        "name": "青创杯·2026龙口马拉松暨山东省马拉松联赛（龙口站）",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-245",
        "name": "2026龙口马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "泰州|2026-10-18",
    "races": [
      {
        "id": "zc-53158",
        "name": "德胜湖大闸蟹·兴化农商银行2026兴化马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "zc-97254",
        "name": "2026泰州马拉松",
        "sources": [
          "nowrun",
          "zuicool"
        ]
      },
      {
        "id": "nr-119",
        "name": "2026兴化马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "日照|2026-10-18",
    "races": [
      {
        "id": "zc-93306",
        "name": "“好运山东”2026日照银行·日照马拉松暨山东省马拉松联赛（日照站）",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-248",
        "name": "2026日照马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "东营|2026-10-18",
    "races": [
      {
        "id": "zc-14392",
        "name": "2026中国万达·黄河口（东营）马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-240",
        "name": "2026黄河口（东营）马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "威海|2026-10-25",
    "races": [
      {
        "id": "zc-33648",
        "name": "“好运山东”2026威海半程马拉松暨山东省马拉松联赛（威海站）",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-243",
        "name": "2026威海马拉松",
        "sources": [
          "nowrun"
        ]
      },
      {
        "id": "mb-6166",
        "name": "2026威海半程马拉松",
        "sources": [
          "marathonbm"
        ]
      }
    ]
  },
  {
    "key": "三明|2026-10-25",
    "races": [
      {
        "id": "zc-11837",
        "name": "”霞路相逢 双世泰马”·2026泰宁半程马拉松暨福建省马拉松联赛（泰宁站）",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-194",
        "name": "2026泰宁半程马拉松",
        "sources": [
          "nowrun"
        ]
      },
      {
        "id": "mb-6077",
        "name": "FHFN·2026泰宁半程马拉松",
        "sources": [
          "marathonbm"
        ]
      }
    ]
  },
  {
    "key": "济宁|2026-10-25",
    "races": [
      {
        "id": "zc-68310",
        "name": "山推杯·2026济宁太白湖半程马拉松",
        "sources": [
          "marathonbm",
          "zuicool"
        ]
      },
      {
        "id": "nr-231",
        "name": "2026济宁太白湖半程马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "贺州|2026-10-25",
    "races": [
      {
        "id": "zc-81278",
        "name": "2026贺州马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-336",
        "name": "2026贺州半程马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "成都|2026-10-25",
    "races": [
      {
        "id": "zc-67025",
        "name": "2026极氪汽车成都马拉松",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-389",
        "name": "2026成都马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  },
  {
    "key": "临沂|2026-11-01",
    "races": [
      {
        "id": "zc-19022",
        "name": "“好运山东”2026临沂马拉松暨山东省马拉松联赛（临沂站）",
        "sources": [
          "zuicool"
        ]
      },
      {
        "id": "nr-247",
        "name": "2026临沂马拉松",
        "sources": [
          "nowrun"
        ]
      }
    ]
  }
]
```