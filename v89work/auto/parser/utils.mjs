
export const TRACKS = {
  kawaguchi:"川口",
  isesaki:"伊勢崎",
  hamamatsu:"浜松",
  iizuka:"飯塚",
  sanyou:"山陽"
};

export function normalizeText(value=""){
  return String(value).replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
}
export function absoluteUrl(href,base){
  try{return new URL(href,base).toString()}catch{return null}
}
export function jsonResponse(status,body){
  return new Response(JSON.stringify(body),{
    status,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
  });
}
export function clamp(v,min=0,max=10){return Math.min(max,Math.max(min,v))}
