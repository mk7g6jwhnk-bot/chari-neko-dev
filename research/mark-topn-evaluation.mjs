const MARKS=['◎','○','▲','△','☆'];
const ratio=(n,d)=>d?n/d:null;
const number=value=>Number.isFinite(Number(value))?Number(value):null;

export function rankRiderMarks(row,{scoreOverride=null}={}){
  const source=scoreOverride||row?.prediction?.riderScores||[];
  return source.map(r=>({...r,number:number(r.number),score:number(r.score)}))
    .filter(r=>r.number!==null&&r.score!==null)
    .sort((a,b)=>b.score-a.score||a.number-b.number).slice(0,5)
    .map((r,index)=>({...r,rank:index+1,mark:MARKS[index]}));
}

export function evaluateMarkTopN(rows,{scoreByRace=null}={}){
  const details=[],unknown=[];
  for(const row of rows||[]){
    const marks=rankRiderMarks(row,{scoreOverride:scoreByRace?.get?.(row.raceKey)||null});
    const result=(row?.result?.finishOrder||[]).slice(0,3).map(Number).filter(Number.isFinite);
    if(marks.length<5||result.length<3){unknown.push({raceKey:row?.raceKey||null,reason:marks.length<5?'MARK_SNAPSHOT_UNAVAILABLE':'RESULT_UNAVAILABLE'});continue;}
    const markByNumber=new Map(marks.map(m=>[m.number,m.mark]));
    details.push({raceKey:row.raceKey,predictionHash:row?.hashes?.predictionHash||null,marks,result,
      finishMarks:result.map(n=>markByNumber.get(n)||'圏外')});
  }
  const cumulative={};
  for(let n=1;n<=5;n++){
    const label=MARKS.slice(0,n).join('');
    const cover=details.map(row=>row.result.filter(x=>row.marks.slice(0,n).some(m=>m.number===x)).length);
    const winners=details.filter(row=>row.marks.slice(0,n).some(m=>m.number===row.result[0])).length;
    const all=cover.filter(x=>x===3).length;
    cumulative[label]={n,evaluatedRaces:details.length,winnerCapture:winners,winnerCaptureRate:ratio(winners,details.length),
      actualTop3Coverage:Object.fromEntries([3,2,1,0].map(k=>[k,cover.filter(x=>x===k).length])),
      exactTop3AllCovered:all,exactTop3AllCoveredRate:ratio(all,details.length)};
  }
  const finishPositionDistribution={};
  for(let i=0;i<3;i++)finishPositionDistribution[String(i+1)]=Object.fromEntries([...MARKS,'圏外'].map(mark=>[mark,details.filter(row=>row.finishMarks[i]===mark).length]));
  const firstMark=details.map(row=>row.marks[0]);
  const firstWins=details.filter((row,index)=>row.result[0]===firstMark[index]?.number).length;
  const firstTop3=details.filter((row,index)=>row.result.includes(firstMark[index]?.number)).length;
  return{schemaVersion:'MARK_TOP_N_EVALUATION_V1',evaluatedRaces:details.length,unknownRaces:unknown.length,unknown,
    cumulative,finishPositionDistribution,special:{firstMarkWinnerRate:ratio(firstWins,details.length),firstMarkTop3Rate:ratio(firstTop3,details.length),
      top2WinnerCaptureRate:cumulative['◎○'].winnerCaptureRate,top3WinnerCaptureRate:cumulative['◎○▲'].winnerCaptureRate,
      top3AllCoveredRate:cumulative['◎○▲'].exactTop3AllCoveredRate,top5AllCoveredRate:cumulative['◎○▲△☆'].exactTop3AllCoveredRate},details};
}

