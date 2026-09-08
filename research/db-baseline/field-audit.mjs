export const RIDER_DB_FIELD_AUDIT=Object.freeze([
  ["recent_4_months.race_points","official rolling 4 months","ACTIVE","base overall/class-adjusted proxy","first, pair, terminal"],
  ["recent_4_months.official_first_rate","official rolling 4 months","ACTIVE","base first/winning tendency","first, terminal"],
  ["recent_4_months.official_top2_rate","official rolling 4 months","ACTIVE","base second/top2","pair, terminal"],
  ["recent_4_months.official_top3_rate","official rolling 4 months","ACTIVE","base third/tracking","pair, third, terminal"],
  ["recent_4_months.first/second/third/other","official rolling 4 months","WEAKLY_ACTIVE","sample/audit counts","reliability"],
  ["recent_4_months.home/back","official rolling 4 months","ACTIVE","initiative/start proxy","first, pair"],
  ["winning_method_share_among_top2.escape/sprint/pass/mark","official rolling 4 months","ACTIVE","sprint/finish/tracking/initiative","first, pair, third"],
  ["annual_finish_aggregate","official annual","UNUSED","reserved; period mismatch","none"],
  ["school_measurements","official school","UNUSED","not comparable across careers","none"],
  ["declaredStyle","official profile","WEAKLY_ACTIVE","audit/context only","none"],
  ["metadata.sample_size/confidence/missing_fields","collection metadata","ACTIVE","reliability gate","all candidate stages"],
  ["metadata.recent_updated_at/retrieved_at/stale","collection metadata","ACTIVE","freshness/stale gate","all candidate stages"],
  ["participant.recentForm","current official profile","WEAKLY_ACTIVE","bounded today adjustment","first/pair candidate"],
  ["participant.sprintPower/finishPower/trackingSkill/startPower","derived current profile","NEUTRAL","Existing Research only; not treated as DB observed","C0/third unchanged"],
  ["participant.stamina/attackTiming/lineTrust/venueSuitability","neutral defaults","NEUTRAL","UNKNOWN in new DB baseline","not scored"]
].map(([field,source,classification,currentUsage,impact])=>({field,source,sampleCount:field.includes("metadata")?"per rider":field.startsWith("participant")?"current race":"metadata.sample_size",freshness:field.includes("metadata")?"explicit":"metadata-bound",stale:"metadata.stale.any / 30-day shadow rule",classification,currentUsage,currentUsed:field.startsWith("participant"),researchUsed:classification!=="UNUSED",impact})));
