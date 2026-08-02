
export const VENUES = {
  "01":"桐生","02":"戸田","03":"江戸川","04":"平和島","05":"多摩川","06":"浜名湖",
  "07":"蒲郡","08":"常滑","09":"津","10":"三国","11":"びわこ","12":"住之江",
  "13":"尼崎","14":"鳴門","15":"丸亀","16":"児島","17":"宮島","18":"徳山",
  "19":"下関","20":"若松","21":"芦屋","22":"福岡","23":"唐津","24":"大村"
};

export function normalizeText(value = "") {
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function clamp(value, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}

export function validDate(value) {
  return /^\d{8}$/.test(value);
}

export function validRaceParams(date, jcd, rno) {
  return validDate(date) && /^\d{2}$/.test(jcd) && /^(?:[1-9]|1[0-2])$/.test(String(rno));
}

export function timeToMinutes(value) {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minutesToTime(value) {
  if (!Number.isFinite(value)) return null;
  const x = (value + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store"
    }
  });
}
