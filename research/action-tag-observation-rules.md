# Action tag observation rules

## Evidence classes and lanes

| Class | Meaning | Lane / maximum automatic status |
|---|---|---|
| `DIRECT` | the action is explicitly present in official telemetry or a timestamped official video tag | `AUTO_DIRECT`; `CONFIRMED` only after source validation |
| `STRONG_PROXY` | a validated signal closely identifies the action but is not the action itself | `AUTO_CANDIDATE`; at most `POSSIBLE` automatically |
| `WEAK_PROXY` | aggregate or indirect signal is correlated with several possible actions | `AUTO_CANDIDATE`; `POSSIBLE` or `UNKNOWN` |
| `MANUAL_REVIEW_REQUIRED` | visible action and timing must be judged from independent evidence | `MANUAL_REVIEW`; starts `PENDING` |
| `UNOBSERVABLE` | saved evidence cannot distinguish the state | no positive tag; retain `UNKNOWN` |

An automatic candidate can never become `CONFIRMED` or `STRONGLY_SUPPORTED` without an independent manual review. Result order, payout, and hit are not action evidence.

## State rules

| State | Availability from current saved data | Required evidence | Supporting evidence | Contradiction | UNKNOWN condition |
|---|---|---|---|---|---|
| `INITIATIVE:ACQUIRED` | `WEAK_PROXY` only | telemetry/video showing the rider or line establishes the front at a defined checkpoint | official back frequency; declared line leader | another rider visibly controls that checkpoint | only aggregate back/home counts or no checkpoint evidence |
| `CLEAN_LEAD` | `MANUAL_REVIEW_REQUIRED` | uninterrupted front control with no overlapping sustained challenge in the defined interval | lead acquisition and positional gap | simultaneous/alternating challenge | no video/telemetry interval |
| `CONTESTED_LEAD` | `MANUAL_REVIEW_REQUIRED` | timestamped overlapping or repeated challenge for front control | multiple early movers | merely poor finish or high pace | finish order only, or challenge duration unclear |
| `LONG_LEAD` | `MANUAL_REVIEW_REQUIRED` | lead-start timestamp plus duration beyond the protocol boundary | back count | lead acquired only near final phase | no lead-start time |
| `RESERVED` | `MANUAL_REVIEW_REQUIRED` | independently tagged energy/effort indicators under a fixed protocol | clean short lead, stable cadence | repeated maximal effort | positional/result evidence only |
| `NORMAL` | `MANUAL_REVIEW_REQUIRED` | reviewer observes neither reserved nor depleted criteria | normal lead duration | evidence meets reserved/depleted rule | insufficient visual/telemetry quality |
| `DEPLETED` | `MANUAL_REVIEW_REQUIRED` | repeated loss of cadence/response after documented effort, using fixed video/telemetry criteria | contested/long lead | tactical easing or obstruction | slowdown or bad result alone |
| `SUPPORT_FRONT` | `MANUAL_REVIEW_REQUIRED` | bante visibly protects/supports the front rider during a defined event | block tendency candidate | bante launches for self or separates | only final pair/order is known |
| `HOLD_POSITION` | `MANUAL_REVIEW_REQUIRED` | bante remains attached without a qualifying support/self-launch action | tracking proxy | switch, separation, self-launch | no positional sequence |
| `SELF_LAUNCH` | `MANUAL_REVIEW_REQUIRED` | timestamped independent acceleration by bante before finish phase | pass-method aggregate | front rider simply slows while bante remains passive | bante win/pass result alone |
| `SWITCH` | `MANUAL_REVIEW_REQUIRED` | bante visibly leaves its original wheel/line and attaches to another target | switch tendency candidate | continuous original tracking | final position/order only |
| `SEPARATED` | `MANUAL_REVIEW_REQUIRED` | positional gap beyond protocol boundary while original front remains identifiable | low tracking proxy | continuous attachment | single still frame or finish gap only |
| `LINE_TRACKING:SUCCESS` | `STRONG_PROXY` with checkpoint telemetry; otherwise review | attachment at every required checkpoint | official mark aggregate | separation/switch before checkpoint | finish pairing alone |
| `LINE_TRACKING:FAILURE` | `STRONG_PROXY` with checkpoint telemetry; otherwise review | independently observed loss of original line | separation tag | continuous attachment | missing checkpoint |
| `MAKURI_SUCCESS` | `DIRECT` only with pass event | rider overtakes established front from behind before the defined finish phase | official winning-method aggregate | rider was already established front | method aggregate or finish order only |
| `OVERTAKEN_BY_MAKURI` | `MANUAL_REVIEW_REQUIRED` | established leader is overtaken by a verified makuri event | makuri-success counterpart tag | pass mechanism is different/unclear | leader loses without mechanism evidence |
| `LINE_STATE:COLLAPSED` | `MANUAL_REVIEW_REQUIRED` | defined line loses required attachment/order at checkpoint | separation/switch tags | line remains attached | final order only |

## Timing and review protocol

- `observationTime` is the evidence event/review time, never silently replaced with race start.
- If observation occurs after `resultObservedAt`, the schema marks `POST_RESULT_OBSERVATION` and makes it ineligible for pre-result training.
- A post-seal observation is not injected into that sealed prediction.
- Review UI/CLI shows only pending tags, grouped by race and state, with evidence link/source and timestamp.
- Reviewer may select `CONFIRMED`, `POSSIBLE`, `UNKNOWN`, or `CONTRADICTED`; a confirmed tag requires direct evidence and a non-UNKNOWN state.
- Reviewer notes are optional; reviewer identity and evidence hash are mandatory.
- Conflicting independent tags remain separate evidence and may be resolved to `CONTRADICTED`; records are append-only rather than overwritten historically.
