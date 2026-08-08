import express from "express";
import { fetchKeirinOfficialData,fetchKeirinOfficialResult } from "./keirin-browser.mjs";
import { fetchKeirinOfficialMeetings } from "./keirin-discover.mjs";
import { pathToFileURL } from "node:url";

const VENUES={"11":"函館","12":"青森","13":"いわき平","21":"弥彦","22":"前橋","23":"取手","24":"宇都宮","25":"大宮","26":"西武園","27":"京王閣","28":"立川","31":"松戸","32":"千葉","34":"川崎","35":"平塚","36":"小田原","37":"伊東","38":"静岡","42":"名古屋","43":"岐阜","44":"大垣","45":"豊橋","46":"富山","47":"松阪","48":"四日市","51":"福井","53":"奈良","54":"向日町","55":"和歌山","56":"岸和田","61":"玉野","62":"広島","63":"防府","71":"高松","73":"小松島","74":"高知","75":"松山","81":"小倉","83":"久留米","84":"武雄","85":"佐世保","86":"別府","87":"熊本"};

export const app = express();
app.disable("x-powered-by");

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chari-neko-keirin-browser", version: "0.5.1-official-evidence" });
});

app.get("/keirin/discover", async (req,res)=>{
  const date=String(req.query.date||"");
  if(!/^\d{8}$/.test(date))return res.status(400).json({ok:false,code:"INVALID_REQUEST",error:"date must be YYYYMMDD"});
  try{return res.status(200).json(await fetchKeirinOfficialMeetings({date}));}
  catch(error){return res.status(502).json({ok:false,code:"OFFICIAL_SOURCE_ERROR",error:error instanceof Error?error.message:String(error)});}
});

app.get("/keirin/race", async (req, res) => {
  const date = String(req.query.date || "");
  const venueCode = String(req.query.venueCode || "").padStart(2, "0");
  const venueName = String(req.query.venueName || "");
  const raceNo = Number(req.query.raceNo || 0);

  if (!/^\d{8}$/.test(date)) {
    return res.status(400).json({ ok: false, error: "日付形式不正" });
  }
  if (!/^\d{2}$/.test(venueCode)) {
    return res.status(400).json({ ok: false, error: "会場コード不正" });
  }
  if (!venueName) {
    return res.status(400).json({ ok: false, error: "会場名未指定" });
  }
  if (!Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12) {
    return res.status(400).json({ ok: false, error: "レース番号不正" });
  }

  // 千葉(32)はKEIRIN.JPの通常開催ではなく外部VELO250案内のため、
  // 通常競輪のブラウザ取得を実行しない。
  if (venueCode === "32" || venueName === "千葉") {
    return res.status(422).json({
      ok: false,
      error: "千葉はKEIRIN.JP通常競輪の解析対象ではありません（VELO250外部開催）",
      unsupportedVenue: true
    });
  }

  try {
    const result = await fetchKeirinOfficialData({
      date,
      venueCode,
      venueName,
      raceNo
    });

    res.status(result.ok ? 200 : 422).json(result);
   } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      diagnostics:
        error && typeof error === "object" && "diagnostics" in error
          ? error.diagnostics
          : null
    });
  }
});

app.get("/keirin/result", async (req,res)=>{
  const date=String(req.query.date||""),venueCode=String(req.query.venueCode||"").padStart(2,"0"),raceNo=Number(req.query.raceNo||0),venueName=String(req.query.venueName||VENUES[venueCode]||"");
  const invalid=!/^\d{8}$/.test(date)||!/^\d{2}$/.test(venueCode)||!venueName||!Number.isInteger(raceNo)||raceNo<1||raceNo>12;
  if(invalid)return res.status(400).json({ok:false,code:"INVALID_REQUEST",error:"date・venueCode・raceNoが不正です"});
  if(venueCode==="32")return res.status(404).json({ok:false,code:"RESULT_NOT_FOUND",error:"千葉はKEIRIN.JP通常競輪の結果対象外です"});
  try{
    const fetched=await fetchKeirinOfficialResult({date,venueCode,venueName,raceNo}),result=fetched.officialData?.result;
    if(fetched.audit?.identityPassed===false||result?.status==="identity_mismatch")return res.status(409).json({ok:false,code:"RESULT_IDENTITY_MISMATCH",error:"公式結果のrace identityが要求と一致しません",audit:fetched.audit||result?.identity});
    if(!fetched.ok||!result){const notFound=/開催リンクを特定できません/.test(fetched.error||"");return res.status(notFound?404:502).json({ok:false,code:notFound?"RESULT_NOT_FOUND":"OFFICIAL_SOURCE_ERROR",error:fetched.error||"公式結果を取得できません",diagnostics:fetched.diagnostics||null})}
    if(result.status==="not_finished"&&isBeforeJstToday(date))return res.status(404).json({ok:false,code:"RESULT_NOT_FOUND",error:"確定済み日付の公式結果が見つかりません",result});
    return res.status(200).json({ok:true,code:result.status==="not_finished"?"RESULT_NOT_FINISHED":null,result});
  }catch(error){return res.status(502).json({ok:false,code:"OFFICIAL_SOURCE_ERROR",error:error instanceof Error?error.message:String(error),diagnostics:error?.diagnostics||null})}
});

const port = Number(process.env.PORT || 3000);
export function startServer(){return app.listen(port,"0.0.0.0",()=>console.log(`keirin browser service listening on ${port}`))}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startServer();
function isBeforeJstToday(date){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),read=t=>parts.find(x=>x.type===t)?.value||"";return date<`${read("year")}${read("month")}${read("day")}`}
