# v212 Start-power audit parameter summary

- Move `raceCategory / priorStrength / startsQuality` out of each rider's normal start-power row and into the start-power audit parameter section.
- Audit common parameter consistency per race.
- Current baseline v1 expects one category per race (`standard` for normal keirin, `girls` for girls races) and `priorStrength=15` for all riders.
- Mixed categories or a prior other than 15 are shown as audit warnings.
- Prediction logic, purchase classification and funding are unchanged.
