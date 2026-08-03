import * as cheerio from "cheerio";
import { normalizeText } from "./utils.mjs";

/**
 * BOAT RACE公式出走表から6艇を抽出する。
 *
 * 0.1.2:
 * - table行単位だけでなく、ページ全体を登録番号基準で走査
 * - rowspan / div分割 / PC・スマホ別DOMでも候補を回収
 * - 登録番号前後の近傍テキストから氏名・級別・成績を結合
 * - 艇番は明示値を優先し、不足分のみ公式掲載順で補完
 */
export function parseRaceListHtml(html, context = {}) {
  const $ = cheerio.load(html);
  const allText = normalizeBoatText($.root().text());
  const candidates = [];

  collectFromTableRows($, candidates);
  collectFromRegistrationElements($, candidates);
  collectFromGlobalText(allText, candidates);

  const mergedByRegistration = mergeByRegistration(candidates);
  const ordered = [...mergedByRegistration.values()]
    .sort((a, b) => a.sourceOrder - b.sourceOrder);

  assignMissingLanes(ordered);

  const byLane = new Map();
  const duplicateLanes = [];

  for (const candidate of ordered) {
    if (!isLane(candidate.number)) continue;

    if (byLane.has(candidate.number)) {
      duplicateLanes.push(candidate.number);
      byLane.set(
        candidate.number,
        preferRicherParticipant(byLane.get(candidate.number), candidate)
      );
    } else {
      byLane.set(candidate.number, candidate);
    }
  }

  const participants = [...byLane.values()]
    .sort((a, b) => a.number - b.number)
    .slice(0, 6)
    .map(stripInternalFields);

  const numbers = participants.map(x => x.number);
  const missingLanes = [1, 2, 3, 4, 5, 6].filter(x => !numbers.includes(x));
  const duplicateRegistrations = findDuplicates(
    participants.map(x => x.registration)
  );

  const ok =
    participants.length === 6 &&
    missingLanes.length === 0 &&
    duplicateRegistrations.length === 0;

  return {
    ok,
    participants,
    diagnostics: {
      participantCount: participants.length,
      rawCandidateCount: candidates.length,
      uniqueRegistrationCount: mergedByRegistration.size,
      detectedNumbers: numbers,
      missingLanes,
      duplicateLanes: [...new Set(duplicateLanes)],
      duplicateRegistrations,
      sources: countSources(candidates),
      usedSequenceFallback: ordered.some(x => x.laneSource === "sequence"),
      context
    }
  };
}

function collectFromTableRows($, candidates) {
  $("table tr").each((index, row) => {
    const cells = $(row)
      .find("th,td")
      .toArray()
      .map(cell => normalizeBoatText($(cell).text()))
      .filter(Boolean);

    if (!cells.length) return;
    const text = cells.join(" | ");

    for (const registration of findRegistrations(text)) {
      candidates.push(
        buildParticipantCandidate({
          text,
          cells,
          registration,
          explicitLane: detectExplicitLane(cells, text),
          source: "table-row",
          sourceOrder: index
        })
      );
    }
  });
}

function collectFromRegistrationElements($, candidates) {
  let sourceOrder = 10000;

  $("body *").each((_, element) => {
    const ownText = normalizeBoatText($(element).clone().children().remove().end().text());
    if (!ownText || !/\d{4}/.test(ownText)) return;

    for (const registration of findRegistrations(ownText)) {
      const container = findUsefulContainer($, element, registration);
      const text = normalizeBoatText(container.text());

      candidates.push(
        buildParticipantCandidate({
          text,
          cells: container
            .find("th,td,div,span,p")
            .toArray()
            .slice(0, 40)
            .map(node => normalizeBoatText($(node).text()))
            .filter(Boolean),
          registration,
          explicitLane: detectLaneNearElement($, element, container),
          source: "registration-element",
          sourceOrder: sourceOrder++
        })
      );
    }
  });
}

function collectFromGlobalText(allText, candidates) {
  const matches = [...allText.matchAll(/(?:^|\D)(\d{4})(?!\d)/g)];
  let sourceOrder = 20000;

  for (let index = 0; index < matches.length; index += 1) {
    const registration = matches[index][1];

    const start = Math.max(0, matches[index].index - 120);
    const nextIndex = matches[index + 1]?.index ?? allText.length;
    const end = Math.min(allText.length, Math.max(nextIndex, matches[index].index + 280));
    const text = allText.slice(start, end);

    candidates.push(
      buildParticipantCandidate({
        text,
        cells: [text],
        registration,
        explicitLane: detectLaneFromWindow(text, registration),
        source: "global-text",
        sourceOrder: sourceOrder++
      })
    );
  }
}

function findUsefulContainer($, element, registration) {
  let current = $(element);

  for (let depth = 0; depth < 7; depth += 1) {
    const parent = current.parent();
    if (!parent.length) break;

    const text = normalizeBoatText(parent.text());
    const registrationCount = findRegistrations(text).length;

    if (
      text.includes(registration) &&
      text.length >= 20 &&
      text.length <= 1500 &&
      registrationCount <= 2
    ) {
      current = parent;
    } else {
      break;
    }
  }

  return current;
}

function buildParticipantCandidate({
  text,
  cells,
  registration,
  explicitLane,
  source,
  sourceOrder
}) {
  const normalized = normalizeBoatText(text);
  const className = extractClassName(normalized, registration);
  const name = extractName(normalized, registration, className, cells);
  const values = extractValues(normalized, registration, explicitLane);

  return {
    id: explicitLane ? `B${explicitLane}` : null,
    number: explicitLane,
    course: explicitLane,
    laneSource: explicitLane ? "explicit" : "unassigned",
    registration,
    className,
    name,
    avgSt: values.avgSt,
    nationalWinRate: values.nationalWinRate,
    localWinRate: values.localWinRate,
    motorTwoRate: values.motorTwoRate,
    boatTwoRate: values.boatTwoRate,
    source,
    sourceOrder,
    sourceTextLength: normalized.length
  };
}

function extractClassName(text, registration) {
  return (
    text.match(new RegExp(`${registration}\\s*[/／\\s]*([AB][12])\\b`, "i"))?.[1]
    ?? text.match(/\b([AB][12])\b/i)?.[1]
    ?? null
  )?.toUpperCase() ?? null;
}

function extractName(text, registration, className, cells = []) {
  const escapedClass = className ? escapeRegExp(className) : "[AB][12]";
  const patterns = [
    new RegExp(`${registration}\\s*[/／\\s]*${escapedClass}\\s*([一-龠々ヶヵぁ-んァ-ヶー・\\s]{2,24})`, "i"),
    new RegExp(`([一-龠々ヶヵぁ-んァ-ヶー・\\s]{2,24})\\s*${registration}\\s*[/／\\s]*${escapedClass}`, "i"),
    new RegExp(`${registration}\\s*([一-龠々ヶヵぁ-んァ-ヶー・\\s]{2,24})`)
  ];

  for (const pattern of patterns) {
    const value = cleanName(text.match(pattern)?.[1]);
    if (value) return value;
  }

  for (const cell of cells) {
    const value = cleanName(
      cell
        .replace(registration, " ")
        .replace(className ?? "", " ")
        .replace(/[／/]/g, " ")
    );
    if (value) return value;
  }

  return `登録${registration}`;
}

function cleanName(value) {
  if (!value) return null;

  const cleaned = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /(全国|当地|支部|出身地|年齢|体重|F数|L数|平均ST|勝率|2連率|3連率|モーター|ボート|今節|成績|早見).*$/u,
      ""
    )
    .trim();

  if (
    cleaned.length < 2 ||
    cleaned.length > 20 ||
    /^(写真|氏名|選手|登録|全国|当地|モーター|ボート|成績|早見)$/u.test(cleaned) ||
    /\d/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function extractValues(text, registration, lane) {
  const numericSource = text
    .replace(new RegExp(registration, "g"), " ")
    .replace(new RegExp(`(?:^|\\D)${lane ?? ""}(?=\\D|$)`), " ");

  const values = [...numericSource.matchAll(/-?\d+(?:\.\d+)?/g)]
    .map(match => Number(match[0]))
    .filter(Number.isFinite);

  const avgSt = values.find(v => v >= 0.05 && v <= 0.35) ?? null;

  const rateCandidates = values.filter(v => v >= 1.0 && v <= 9.99);
  const percentageCandidates = values.filter(v => v >= 10 && v <= 100);

  return {
    avgSt,
    nationalWinRate: rateCandidates[0] ?? null,
    localWinRate: rateCandidates[1] ?? null,
    motorTwoRate: percentageCandidates[0] ?? null,
    boatTwoRate: percentageCandidates[1] ?? null
  };
}

function detectExplicitLane(cells, full) {
  for (const cell of cells.slice(0, 5)) {
    const match = cell.match(/^([1-6])$/);
    if (match) return Number(match[1]);
  }
  return detectLaneFromWindow(full);
}

function detectLaneNearElement($, element, container) {
  const probes = [
    normalizeBoatText($(element).prev().text()),
    normalizeBoatText($(element).parent().prev().text()),
    normalizeBoatText($(element).closest("tr").find("th,td").first().text()),
    normalizeBoatText(container.find("[class*='boat'],[class*='waku'],[class*='lane']").first().text()),
    normalizeBoatText(container.text()).slice(0, 80)
  ];

  for (const probe of probes) {
    const lane = detectLaneFromWindow(probe);
    if (lane) return lane;
  }

  return null;
}

function detectLaneFromWindow(text, registration = null) {
  const normalized = normalizeBoatText(text);

  const directPatterns = [
    /(?:^|\s|[|｜])([1-6])(?:号艇|枠|コース|[|｜]|\s|$)/,
    /(?:艇番|枠番|コース)\s*[:：]?\s*([1-6])/,
    /^\s*([1-6])\s*(?:[|｜]|$)/
  ];

  for (const pattern of directPatterns) {
    const match = normalized.match(pattern);
    if (match) return Number(match[1]);
  }

  if (registration) {
    const before = normalized.slice(
      Math.max(0, normalized.indexOf(registration) - 50),
      normalized.indexOf(registration)
    );
    const match = before.match(/([1-6])\s*$/);
    if (match) return Number(match[1]);
  }

  return null;
}

function mergeByRegistration(candidates) {
  const result = new Map();

  for (const candidate of candidates) {
    if (!candidate.registration) continue;

    if (!result.has(candidate.registration)) {
      result.set(candidate.registration, candidate);
      continue;
    }

    result.set(
      candidate.registration,
      mergeParticipants(result.get(candidate.registration), candidate)
    );
  }

  return result;
}

function mergeParticipants(current, incoming) {
  const richer = preferRicherParticipant(current, incoming);
  const poorer = richer === current ? incoming : current;

  return {
    ...richer,
    number: richer.number ?? poorer.number,
    course: richer.course ?? poorer.course,
    id: richer.id ?? poorer.id,
    laneSource:
      richer.number ? richer.laneSource : poorer.laneSource,
    className: richer.className ?? poorer.className,
    name:
      !richer.name?.startsWith("登録") ? richer.name : poorer.name,
    avgSt: richer.avgSt ?? poorer.avgSt,
    nationalWinRate: richer.nationalWinRate ?? poorer.nationalWinRate,
    localWinRate: richer.localWinRate ?? poorer.localWinRate,
    motorTwoRate: richer.motorTwoRate ?? poorer.motorTwoRate,
    boatTwoRate: richer.boatTwoRate ?? poorer.boatTwoRate,
    sourceOrder: Math.min(current.sourceOrder, incoming.sourceOrder),
    source: `${current.source}+${incoming.source}`
  };
}

function assignMissingLanes(candidates) {
  const used = new Set(
    candidates.filter(x => isLane(x.number)).map(x => x.number)
  );
  const available = [1, 2, 3, 4, 5, 6].filter(x => !used.has(x));

  for (const candidate of candidates) {
    if (isLane(candidate.number)) continue;

    const lane = available.shift();
    if (!lane) break;

    candidate.number = lane;
    candidate.course = lane;
    candidate.id = `B${lane}`;
    candidate.laneSource = "sequence";
  }
}

function preferRicherParticipant(current, incoming) {
  return scoreParticipant(incoming) > scoreParticipant(current)
    ? incoming
    : current;
}

function scoreParticipant(participant) {
  return [
    participant.number,
    participant.name && !participant.name.startsWith("登録"),
    participant.className,
    participant.avgSt,
    participant.nationalWinRate,
    participant.localWinRate,
    participant.motorTwoRate,
    participant.boatTwoRate
  ].filter(value => value !== null && value !== undefined && value !== false).length;
}

function stripInternalFields(participant) {
  const {
    source,
    sourceOrder,
    sourceTextLength,
    laneSource,
    ...publicParticipant
  } = participant;

  return {
    ...publicParticipant,
    laneSource
  };
}

function findRegistrations(text) {
  return [
    ...new Set(
      [...text.matchAll(/(?:^|\D)(\d{4})(?!\d)/g)].map(match => match[1])
    )
  ];
}

function countSources(candidates) {
  const counts = {};
  for (const candidate of candidates) {
    counts[candidate.source] = (counts[candidate.source] ?? 0) + 1;
  }
  return counts;
}

function findDuplicates(values) {
  const counts = new Map();

  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value);
}

function normalizeBoatText(value) {
  return normalizeText(value)
    .replace(/[０-９]/g, char =>
      String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
    )
    .replace(/[Ａ-Ｚａ-ｚ]/g, char =>
      String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
    )
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLane(value) {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}
