export const FREE_QUESTION_LIMIT=20;
const zone='Europe/London';
// Month boundaries follow UK civil time, including British Summer Time.
function boundary(year:number,month:number){
 const noon=Date.UTC(year,month,1,12);
 const offset=new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeZoneName:'shortOffset'}).formatToParts(noon).find(p=>p.type==='timeZoneName')!.value;
 const match=offset.match(/GMT([+-])(\d+)(?::(\d+))?/);
 const minutes=match?(match[1]==='+'?1:-1)*(Number(match[2])*60+Number(match[3]||0)):0;
 return Date.UTC(year,month,1)-minutes*60000;
}
export function freeAllowancePeriod(now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'numeric'}).formatToParts(now);
 const year=Number(parts.find(p=>p.type==='year')!.value),month=Number(parts.find(p=>p.type==='month')!.value)-1;
 return {start:boundary(year,month),resetsAt:boundary(year,month+1)};
}
