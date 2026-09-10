export function buildRaceReviewViewModel(reviewCase, checkpoint = null) {
  const startIndex = checkpoint?.status === "IN_PROGRESS" ? Math.min(reviewCase.questions.length - 1, checkpoint.questionIndex) : 0;
  return Object.freeze({
    version: "ACTION_TAG_REVIEW_UI_V1", researchOnly: true, productionUi: false,
    header: Object.freeze({ raceKey: reviewCase.raceKey, venue: reviewCase.preRace.venue, raceNo: reviewCase.preRace.raceNo }),
    lineup: reviewCase.lineup, initiativeCandidate: reviewCase.initiativeCandidate, banteCandidate: reviewCase.banteCandidate,
    candidateChips: reviewCase.automaticCandidates.map(row => Object.freeze({ label: `${row.stateType}: ${row.stateValue}`, confidence: row.confidence, selected: false })),
    evidence: reviewCase.evidence.map(row => Object.freeze({ ...row, openable: Boolean(row.link) })),
    controls: reviewCase.questions.map((question, index) => Object.freeze({ ...question, index, active: index === startIndex, oneClickValues: question.values.map(value => Object.freeze({ value, label: value })) })),
    submit: Object.freeze({ label: "レビュー保存", oneClick: true }), estimatedClicks: reviewCase.questions.length + 1, resumeQuestionIndex: startIndex,
    noteOptional: true, autoCandidateRequiresExplicitApproval: true
  });
}
