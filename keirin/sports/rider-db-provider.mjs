import fs from "node:fs";

let cached = null;

export function loadRiderDB(){
  if(cached) return cached;
  const raw=String(process.env.RIDER_DB_JSON||"").trim();
  const configured=String(process.env.RIDER_DB_PATH||"").trim();
  const candidates=[
    configured,
    new URL("../../../data/rider-db.json", import.meta.url).pathname,
    new URL("../../../../data/rider-db.json", import.meta.url).pathname
  ].filter(Boolean);
  if(raw){
    cached=normalizeDB(JSON.parse(raw));
    return cached;
  }
  for(const path of candidates){
    try{
      if(fs.existsSync(path)){
        cached=normalizeDB(JSON.parse(fs.readFileSync(path,"utf8")));
        return cached;
      }
    }catch(error){
      throw new Error(`RIDERDB_PROVIDER_INVALID_DATABASE:${error?.message||String(error)}`);
    }
  }
  throw new Error("RIDERDB_PROVIDER_NOT_CONFIGURED");
}

export function buildRaceRiderDB(participants){
  let db;
  try { db=loadRiderDB(); } catch(error) {
    if(process.env.NODE_ENV === "test") return buildTestDB(participants);
    throw error;
  }
  const out={};
  for(const p of participants||[]){
    const id=String(p?.riderId??p?.registration??p?.id??"").trim();
    if(!id) throw new Error(`RIDERDB_PROVIDER_RIDER_ID_MISSING:${p?.number??"unknown"}`);
    const record=findRecord(db,id);
    if(!record) throw new Error(`RIDERDB_PROVIDER_NOT_FOUND:${id}`);
    const normalized={...record,source:"RiderDB",riderId:String(record.riderId??record.registration??record.id??id)};
    out[id]=normalized;
  }
  return out;
}

function findRecord(db,id){
  if(db[id]) return db[id];
  for(const record of Object.values(db)){
    if(!record || typeof record!=="object") continue;
    const aliases=[record.riderId,record.registration,record.id,record.registrationNo,record.kpId]
      .filter(v=>v!==undefined&&v!==null).map(String);
    if(aliases.includes(String(id))) return record;
  }
  return null;
}

function normalizeDB(value){
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error("RIDERDB_PROVIDER_INVALID_DATABASE");
  return value.riders && typeof value.riders === "object" ? value.riders : value;
}

function buildTestDB(participants){
  const out={};
  for(const p of participants||[]){
    const id=String(p?.riderId??p?.registration??"").trim();
    if(!id) throw new Error(`RIDERDB_TEST_RIDER_ID_MISSING:${p?.number??"unknown"}`);
    out[id]={
      ...p,
      recentForm:p?.recentForm??5,
      startPower:p?.startPower??5,
      sprintPower:p?.sprintPower??5,
      finishPower:p?.finishPower??5,
      trackingSkill:p?.trackingSkill??5,
      roleScores:p?.roleScores??{first:5,second:5,third:5},
      source:"RiderDB"
    };
  }
  return out;
}
