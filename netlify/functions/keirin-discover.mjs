import { parseScheduleHtml } from "../../keirin/parser/schedule-parser.mjs";
import { discoverRacePages } from "../../keirin/parser/discovery-parser.mjs";
import { validDate, jsonResponse } from "../../keirin/parser/utils.mjs";

export default async req => {
  const u = new URL(req.url);
  const date = u.searchParams.get("date") || "";

  if (!validDate(date)) {
    return jsonResponse(400, { ok:false, error:"日付形式不正" });
  }

  const scheduleUrl = `https://keirin.jp/pc/raceschedule?scyy=${date.slice(0,4)}&scym=${date.slice(4,6)}`;
  const jar = new Jar();

  try {
    const sr = await fw(scheduleUrl, jar);
    if (!sr.ok) {
      return jsonResponse(502, { ok:false, error:`日程取得HTTP ${sr.status}` });
    }

    const schedule = parseScheduleHtml(await sr.text(), scheduleUrl, date);
    const checked = [];

    for (const m of schedule.meetings.slice(0, 20)) {
      if (!m.officialRequest) {
        checked.push({
          ...m,
          verifiedMeeting:false,
          raceNumbers:[],
          verificationReason:"target-cell-official-post-not-found"
        });
        continue;
      }

      try {
        let r = await fw(m.officialRequest.url, jar, scheduleUrl, m.officialRequest);
        let html = r.ok ? await r.text() : "";

        const targetDayRequest = r.ok
          ? findTargetDayRequest(html, date, m.venueCode, m.officialRequest)
          : null;

        if (targetDayRequest) {
          r = await fw(targetDayRequest.url, jar, m.officialRequest.url, targetDayRequest);
          html = r.ok ? await r.text() : "";
        }

        const discovery = r.ok
          ? discoverRacePages(html, r.url || m.officialRequest.url)
          : null;

        const officialRace = r.ok
          ? extractRaceResult(html, date, m.venueCode)
          : { raceNumbers:[], responseDate:"", responseVenueCode:"" };

        const raceNumbers = officialRace.raceNumbers;

        checked.push({
          ...m,
          verifiedMeeting: r.ok && raceNumbers.length > 0,
          raceNumbers,
          verificationDetail: officialRace,
          discovery: discovery || emptyDiscovery(),
          discoveryError: r.ok ? null : `HTTP ${r.status}`,
          verificationReason: raceNumbers.length
            ? "official-race-number-found"
            : "official-race-number-not-found"
        });
      } catch (e) {
        checked.push({
          ...m,
          verifiedMeeting:false,
          raceNumbers:[],
          discovery:emptyDiscovery(),
          discoveryError:e instanceof Error ? e.message : String(e),
          verificationReason:"verification-error"
        });
      }
    }

    const unique = new Map();

    for (const m of checked) {
      if (!m.verifiedMeeting || !m.raceNumbers.length) continue;

      const key = `${m.date}|${m.venueCode}`;
      if (!unique.has(key)) {
        unique.set(key, sanitizeMeeting(m));
      }
    }

    const meetings = [...unique.values()]
      .sort((a,b) => Number(a.venueCode) - Number(b.venueCode));

    return jsonResponse(200, {
      ok:true,
      date,
      meetings,
      diagnostics:{
        ...schedule.diagnostics,
        candidateCount:checked.length,
        verifiedCount:meetings.length,
        rejected:checked
          .filter(x => !x.verifiedMeeting)
          .map(x => ({
            venueCode:x.venueCode,
            venueName:x.venueName,
            reason:x.verificationReason,
            error:x.discoveryError || null,
            responseDate:x.verificationDetail?.responseDate || "",
            responseVenueCode:x.verificationDetail?.responseVenueCode || ""
          })),
        note:"対象日セルの公式POST情報・実在R確認済みのみ表示"
      },
      checkedAt:new Date().toISOString()
    });
  } catch (e) {
    return jsonResponse(500, {
      ok:false,
      error:e instanceof Error ? e.message : String(e)
    });
  }
}

function extractRaceResult(html, date, venueCode) {
  const data = readPc0201Data(html);
  const responseDate = String(data?.selKaisai || "");
  const responseVenueCode = String(data?.selKjyoCd || "").padStart(2, "0");

  if (
    !data ||
    responseDate !== String(date) ||
    responseVenueCode !== String(venueCode || "").padStart(2, "0") ||
    !Array.isArray(data.C0201race)
  ) {
    return { raceNumbers:[], responseDate, responseVenueCode };
  }

  return {
    raceNumbers:data.C0201race
      .map((race,index) => race ? index + 1 : null)
      .filter(Boolean),
    responseDate,
    responseVenueCode
  };
}

function readPc0201Data(html) {
  const source = String(html || "");
  const marker = /jsonData\[['"]PC0201['"]\]\s*=\s*/g.exec(source);
  if (!marker) return null;

  const start = marker.index + marker[0].length;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
    } else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(source.slice(start, i + 1))?.C0201data || null;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function findTargetDayRequest(html, date, venueCode, officialRequest) {
  const data = readPc0201Data(html);

  if (
    !data ||
    String(data.selKjyoCd || "").padStart(2, "0") !==
      String(venueCode || "").padStart(2, "0") ||
    String(data.selKaisai || "") === String(date)
  ) {
    return null;
  }

  const label = `${date.slice(4,6)}/${date.slice(6,8)}`;
  const day = Array.isArray(data.C0201kaisai)
    ? data.C0201kaisai.find(x =>
        String(x?.txtEventDate || "").padStart(5, "0") === label &&
        x?.encParaK
      )
    : null;

  return day
    ? {
        ...officialRequest,
        encp:String(day.encParaK),
        disp:"PJ0305"
      }
    : null;
}

function sanitizeMeeting(m) {
  const { officialRequest, officialLinks, ...safe } = m;
  return safe;
}

function emptyDiscovery() {
  return {
    ok:false,
    links:{raceCards:[],odds:[],results:[],other:[]},
    diagnostics:{fallback:true}
  };
}

class Jar {
  constructor() {
    this.c = new Map();
  }

  ingest(r) {
    const s = r.headers.get("set-cookie");
    if (!s) return;

    for (const p of s.split(/,(?=[^;,]+=)/)) {
      const q = p.split(";")[0];
      const i = q.indexOf("=");
      if (i > 0) {
        this.c.set(q.slice(0,i).trim(), q.slice(i+1).trim());
      }
    }
  }

  header() {
    return [...this.c]
      .map(([k,v]) => `${k}=${v}`)
      .join("; ");
  }

  names() {
    return [...this.c.keys()];
  }
}

async function fw(url, jar, referer = null, officialRequest = null) {
  const headers = {
    "user-agent":"Mozilla/5.0 (compatible; ChariNekoDev/0.5.3; personal-use)",
    "accept-language":"ja"
  };

  if (jar.header()) headers.cookie = jar.header();
  if (referer) headers.referer = referer;

  const options = {
    headers,
    redirect:"follow",
    signal:AbortSignal.timeout(12000)
  };

  if (officialRequest) {
    options.method = "POST";
    headers["content-type"] = "application/x-www-form-urlencoded";
    options.body = new URLSearchParams({
      encp:officialRequest.encp,
      disp:officialRequest.disp
    }).toString();
  }

  const r = await fetch(url, options);
  jar.ingest(r);
  return r;
}
