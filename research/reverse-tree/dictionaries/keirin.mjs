export const dictionary = {
  "unknownNodeId": "K_UNKNOWN",
  "nodes": [
    {
      "id": "K_SELF",
      "label": "勝者の自力浮上",
      "support": [
        {
          "source": "result",
          "path": "method",
          "op": "includes",
          "value": "まくり",
          "weight": 3,
          "evidence": "公式まくり"
        },
        {
          "source": "result",
          "path": "method",
          "op": "includes",
          "value": "逃げ",
          "weight": 3,
          "evidence": "公式逃げ"
        }
      ]
    },
    {
      "id": "K_MAKURI",
      "label": "まくり",
      "support": [
        {
          "source": "result",
          "path": "method",
          "op": "includes",
          "value": "まくり",
          "weight": 3,
          "evidence": "公式決まり手まくり"
        }
      ],
      "contradict": [
        {
          "source": "result",
          "path": "method",
          "op": "includes",
          "value": "逃げ",
          "weight": 3,
          "reason": "公式逃げと矛盾"
        }
      ]
    },
    {
      "id": "K_TRACK",
      "label": "追走残り",
      "support": [
        {
          "source": "observations",
          "path": "sameLineTop2",
          "op": "eq",
          "value": true,
          "weight": 2,
          "evidence": "上位同ライン"
        }
      ],
      "requiresMedia": true
    },
    {
      "id": "K_FRONT",
      "label": "前残り",
      "support": [
        {
          "source": "observations",
          "path": "frontRunners",
          "op": "includes",
          "value": "$third",
          "weight": 1,
          "evidence": "先行候補が3着"
        }
      ],
      "requiresMedia": true
    },
    {
      "id": "K_BREAK",
      "label": "ライン分断",
      "support": [
        {
          "source": "observations",
          "path": "sameLineTop2",
          "op": "eq",
          "value": false,
          "weight": 1,
          "evidence": "上位別ライン"
        }
      ],
      "requiresMedia": true
    },
    {
      "id": "K_POWER",
      "label": "脚力差",
      "support": [
        {
          "source": "observations",
          "path": "winnerPreRaceRank",
          "op": "lte",
          "value": 3,
          "weight": 1,
          "evidence": "事前評価上位"
        }
      ]
    },
    {
      "id": "K_UNKNOWN",
      "label": "その他・未観測"
    }
  ],
  "templates": [
    {
      "id": "KT1",
      "label": "{{winner}}番まくり→{{second}}番追走→{{third}}番残り",
      "when": {
        "method": "まくり"
      },
      "path": [
        "K_SELF",
        "K_MAKURI",
        "K_TRACK",
        "K_FRONT",
        "K_POWER"
      ]
    },
    {
      "id": "KT2",
      "label": "ライン分断から{{winner}}-{{second}}-{{third}}",
      "path": [
        "K_BREAK",
        "K_POWER"
      ]
    }
  ]
};
