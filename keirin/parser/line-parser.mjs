
export function inferLines({participants,lineText=null}) {
  if(lineText){
    const groups=lineText.split(/[｜|、,\s]+/).filter(Boolean),valid=new Set(participants.map(p=>p.number)),assignments=[],assigned=new Set();
    let idx=0;
    for(const group of groups){
      const nums=[...group.matchAll(/[1-9]/g)].map(m=>Number(m[0])).filter(n=>valid.has(n));
      if(!nums.length)continue;
      const lineId=String.fromCharCode(65+idx++);
      nums.forEach((number,i)=>{assignments.push({number,lineId,lineOrder:i+1,role:i===0?"自力":i===1?"番手":"三番手",lineStatus:"公式並び"});assigned.add(number)});
    }
    if(assigned.size>=Math.max(3,participants.length-2)){
      const map=new Map(assignments.map(x=>[x.number,x]));
      return {participants:participants.map(p=>({...p,...(map.get(p.number)||{lineId:"solo",lineOrder:1,role:"単騎",lineStatus:"公式並び外"})})),source:"公式並び表記",confidence:"高",warnings:[]};
    }
  }

  return {
    participants:participants.map(p=>({...p,role:"判定保留",lineId:`unknown-${p.number}`,lineOrder:1,lineStatus:"公式並び未取得・判定保留"})),
    source:"公式並び未取得",
    confidence:"低",
    warnings:["公式ライン情報未取得。ライン依存枝は判定保留。"]
  };
}
