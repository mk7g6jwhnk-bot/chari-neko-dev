# v214 Relative-condition probability separation

- Existing branch / 1st / 2nd / 3rd probability differences remain the primary signal.
- At each stage the highest conditional-probability candidate is the zero-differential-condition baseline.
- Any lower candidate gets one differential condition, even when the gap is microscopic.
- The differential burden is deliberately light: about 0.8% at a near tie, smoothly increasing with the gap, capped at 3% per stage.
- Branch, FIRST, SECOND and THIRD burdens accumulate multiplicatively, then terminal probabilities are normalized.
- Added relativeConditionCount / relativeConditionPenalty / relativeConditionTrace / probabilitySeparationPolicy.
- Added relativeConditionAudit and UI detail output.
- No fixed ticket-count cap was introduced.
