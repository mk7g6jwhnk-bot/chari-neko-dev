export const dictionary = {
  "unknownNodeId": "B_UNKNOWN",
  "nodes": [
    {
      "id": "B_IN",
      "label": "1号艇イン1着",
      "support": [
        {
          "source": "result",
          "path": "order.0",
          "op": "eq",
          "value": 1,
          "weight": 3,
          "evidence": "1号艇1着"
        }
      ]
    },
    {
      "id": "B_METHOD",
      "label": "公式決まり手",
      "support": [
        {
          "source": "result",
          "path": "method",
          "op": "exists",
          "value": true,
          "weight": 3,
          "evidence": "公式決まり手あり"
        }
      ]
    },
    {
      "id": "B_START",
      "label": "ST優位",
      "support": [
        {
          "source": "observations",
          "path": "bestStartBoat",
          "op": "eq",
          "value": "$winner",
          "weight": 2,
          "evidence": "ST最上位"
        }
      ]
    },
    {
      "id": "B_MARK",
      "label": "1マーク攻め",
      "support": [
        {
          "source": "result",
          "path": "method",
          "op": "exists",
          "value": true,
          "weight": 1,
          "evidence": "決まり手から大分類可能"
        }
      ],
      "requiresMedia": true
    },
    {
      "id": "B_SECOND",
      "label": "2着残り",
      "support": [
        {
          "source": "observations",
          "path": "topStartBoats",
          "op": "includes",
          "value": "$second",
          "weight": 1,
          "evidence": "ST上位艇が2着"
        }
      ]
    },
    {
      "id": "B_THIRD",
      "label": "3着残り",
      "support": [
        {
          "source": "observations",
          "path": "exhibitionTopBoats",
          "op": "includes",
          "value": "$third",
          "weight": 1,
          "evidence": "展示上位艇が3着"
        }
      ]
    },
    {
      "id": "B_UNKNOWN",
      "label": "その他・未観測"
    }
  ],
  "templates": [
    {
      "id": "BT1",
      "label": "1号艇逃げ→{{second}}号艇2着→{{third}}号艇3着",
      "when": {
        "method": "逃げ"
      },
      "path": [
        "B_IN",
        "B_METHOD",
        "B_SECOND",
        "B_THIRD"
      ]
    },
    {
      "id": "BT2",
      "label": "{{winner}}号艇の攻め→{{second}}号艇残り→{{third}}号艇3着",
      "path": [
        "B_METHOD",
        "B_START",
        "B_MARK",
        "B_SECOND",
        "B_THIRD"
      ]
    }
  ]
};
