export const dictionary = {
  "unknownNodeId": "A_UNKNOWN",
  "nodes": [
    {
      "id": "A_FRONT",
      "label": "前ハン残り",
      "support": [
        {
          "source": "observations",
          "path": "frontHandicapCars",
          "op": "includes",
          "value": "$winner",
          "weight": 2,
          "evidence": "前ハン車1着"
        }
      ]
    },
    {
      "id": "A_REAR",
      "label": "後ろハン追い上げ",
      "support": [
        {
          "source": "observations",
          "path": "rearHandicapCars",
          "op": "includes",
          "value": "$winner",
          "weight": 2,
          "evidence": "後ろハン車1着"
        }
      ]
    },
    {
      "id": "A_TRIAL",
      "label": "試走優位",
      "support": [
        {
          "source": "observations",
          "path": "topTrialCars",
          "op": "includes",
          "value": "$winner",
          "weight": 2,
          "evidence": "試走上位"
        }
      ]
    },
    {
      "id": "A_START",
      "label": "スタート先行",
      "support": [
        {
          "source": "observations",
          "path": "startTopCars",
          "op": "includes",
          "value": "$winner",
          "weight": 1,
          "evidence": "スタート上位"
        }
      ],
      "requiresMedia": true
    },
    {
      "id": "A_PASS",
      "label": "捌き浮上",
      "support": [
        {
          "source": "observations",
          "path": "rearHandicapCars",
          "op": "includes",
          "value": "$winner",
          "weight": 1,
          "evidence": "後ろハンから上位"
        }
      ],
      "requiresMedia": true
    },
    {
      "id": "A_STABLE",
      "label": "安定型残り",
      "support": [
        {
          "source": "observations",
          "path": "stableCars",
          "op": "includes",
          "value": "$second",
          "weight": 1,
          "evidence": "2着安定型"
        },
        {
          "source": "observations",
          "path": "stableCars",
          "op": "includes",
          "value": "$third",
          "weight": 1,
          "evidence": "3着安定型"
        }
      ]
    },
    {
      "id": "A_WET",
      "label": "湿走路適性",
      "support": [
        {
          "source": "observations",
          "path": "surface",
          "op": "eq",
          "value": "wet",
          "weight": 1,
          "evidence": "湿走路"
        }
      ]
    },
    {
      "id": "A_UNKNOWN",
      "label": "その他・未観測"
    }
  ],
  "templates": [
    {
      "id": "AT1",
      "label": "{{winner}}号車前ハン逃げ→{{second}}・{{third}}残り",
      "path": [
        "A_FRONT",
        "A_START",
        "A_STABLE"
      ]
    },
    {
      "id": "AT2",
      "label": "{{winner}}号車追い上げ→捌き→{{second}}・{{third}}残り",
      "path": [
        "A_REAR",
        "A_TRIAL",
        "A_PASS",
        "A_STABLE"
      ]
    },
    {
      "id": "AT3",
      "label": "湿走路適性から{{winner}}号車浮上",
      "when": {
        "surface": "wet"
      },
      "path": [
        "A_WET",
        "A_REAR",
        "A_STABLE"
      ]
    }
  ]
};
