# Behavior state model design

## Scope and decision boundary

This design is `RESEARCH_ONLY`. It does not import from, write to, or register with production prediction, purchase, UI, rider-profile priority, or promotion code. All generated probabilities are uncalibrated shadow weights. Missing observations remain `UNKNOWN`.

## Existing graph audit

The current research graph is:

`INITIATIVE -> ATTACK_OUTCOME -> LINE_TRACKING -> OTHER_LINE_SURVIVAL -> FOURTH_CORNER_POSITION -> conditional finish terminals`

The following structural gaps were confirmed in `research/state-engine/state-engine.mjs`:

1. `ATTACK_OUTCOME` immediately follows initiative selection. It uses the initiative rider's start/sprint/finish ability axes and labels the method `LEAD_OR_MAKURI_UNRESOLVED`. Lead pressure, duration, energy expenditure, and bante action are absent.
2. `LINE_TRACKING` is evaluated only after attack success/failure. A bante self-launch, support action, switch, or separation therefore cannot condition the attack outcome.
3. A successful attack places the initiative line ahead at fourth corner; failure reverses initiative and other lines. This is a short circuit, not an independently observed fourth-corner transition.
4. `LEADER_HOLD`, `BANTE_SASHI`, and `MAKURI_SUCCESS` are production branch semantics, but the existing research attack node does not independently represent those outcomes.
5. The production explanation text states that the selected rider takes initiative and then holds the lead. Although it describes a scenario rather than a causal score, the missing intermediate states make initiative appear as a direct winning reason.

The resulting risk is not merely a coefficient issue. The causal graph lacks the states that could lower a leader after initiative: contested pressure, depletion, bante self-launch, switching, and separation.

## Rider-layer separation

The schema keeps three namespaces:

- `abilityLayer`: existing official profile and ability evidence; owned by the current system and never rewritten here.
- `behaviorLayer`: repeated action preference/tendency observations.
- `conditionalPerformanceLayer`: outcome rates conditioned on an independently observed situation.

Every behavior and conditional metric has `value`, `confidence`, `evidenceCount`, `evidenceWindow`, `sourceType`, and `status` (`verified`, `research_only`, or `unknown`). Zero evidence, an absent window, or an invalid value produces an unknown measurement. Forum, note, and SNS material cannot produce `verified` status.

The full schema and validation are implemented in `conditional-rider-performance-schema.mjs`.

## Data availability

| Event / field | Present classification | Reason |
|---|---|---|
| official finish order | DIRECT | official result, usable only for post-identity scoring |
| declared pre-race line | DIRECT | official/published line input when sealed |
| rolling home/back count | DIRECT as count | does not directly identify exact initiative acquisition |
| winning-method aggregate | DIRECT as aggregate | does not identify the race-specific action sequence |
| initiative acquisition | WEAK_PROXY | back count may correlate but does not prove control of the race |
| lead battle / 踏み合い | UNOBSERVABLE | needs video, lap telemetry, or independently tagged action |
| long lead / 長駆け | UNOBSERVABLE | back count lacks lead-start time and duration |
| bante support / 番手援護 | UNOBSERVABLE | finish and method do not reveal block/support action |
| bante self-launch / 自分踏み | WEAK_PROXY | pass wins can suggest it, but cannot establish the action |
| overtaken by makuri / 捲られ | UNOBSERVABLE | result alone cannot distinguish race process |
| line tracking success | WEAK_PROXY | mark aggregate is not a race-specific attachment observation |
| line separation | UNOBSERVABLE | requires positional/video evidence |
| switching | UNOBSERVABLE | requires positional/video evidence |
| solo rise | WEAK_PROXY | result/line composition alone does not prove the transition |

`DIRECT` is intentionally not assigned to a latent state merely because a correlated official aggregate exists. A proxy may populate a `research_only` trait candidate, never a verified race state.

## Proposed state order

`INITIATIVE -> LEAD_PRESSURE -> ENERGY_STATE -> BANTE_RESPONSE -> LINE_TRACKING -> ATTACK_OUTCOME -> OTHER_LINE_SURVIVAL -> FOURTH_CORNER_POSITION -> FINISH`

- `LEAD_PRESSURE`: `CLEAN_LEAD`, `CONTESTED_LEAD`, `LONG_LEAD`, `UNKNOWN`
- `ENERGY_STATE`: `RESERVED`, `NORMAL`, `DEPLETED`, `UNKNOWN`
- `BANTE_RESPONSE`: `SUPPORT_FRONT`, `HOLD_POSITION`, `SELF_LAUNCH`, `SWITCH`, `SEPARATED`, `UNKNOWN`

These race-specific states accept only independently observed sources: official video tags, validated manual observations, or official race telemetry. Rider tendencies alone do not assert a realized state.

## Conditional transition rules

The first shadow implementation makes the causal direction explicit:

- initiative alone has multiplier 1 and never raises a first-place candidate.
- clean lead + reserved energy + supporting/holding bante raises `LEADER_HOLD` modestly.
- contested or long lead, or depleted energy, lowers `LEADER_HOLD` and raises `BANTE_SASHI`, `MAKURI_SUCCESS`, and `LEAD_BATTLE` alternatives.
- bante self-launch separately lowers `LEADER_HOLD` and raises `BANTE_SASHI`.
- switch or separation raises line-separation/other-line alternatives.
- if any required intermediate state is unknown, every branch multiplier remains 1.

The values are fixed structural shadow constants, not learned/calibrated probabilities or production thresholds. They exist to test graph behavior. No result was used to select them.

## Integrity constraints

- Identity/state generation does not read finish, payout, hit, odds, or third-place data.
- Result access occurs only in the comparator after state generation and terminal weighting.
- Records numbered 403 through 502 are rejected before result access.
- Input prediction objects are copied; mutation tests enforce byte-equivalent serialized source.
- Directory evaluation reads one JSON record at a time and retains scalar summaries only.
- `productionWriteAllowed=false`, `autoPromotion=false`, and `purchaseConnected=false` are emitted in audits.

## Data required to proceed

Before judging model benefit, create a prospectively sealed, non-final-test cohort with independent action annotations:

- minimum 300 races overall;
- at least 60 independently observed examples each for contested lead, long lead, bante self-launch, separation, and switch;
- at least 20 observations per rider before promoting any individual behavior trait above `research_only`;
- at least 50 denominator events for each conditional-performance cell used in a transition;
- two-source agreement or dual-review adjudication for video-derived tags;
- sealed split assignment before outcome evaluation, with records 403-502 remaining untouched.

Required tags are lead acquisition rider/line, lead-start point, overlap/contest interval, bante support/block/self-launch/switch, line attachment/separation at defined checkpoints, makuri overtake event, and fourth-corner order. Finish alone must never backfill these tags.
