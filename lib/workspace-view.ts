import {addDays,calendar,dueDate,first,month,remainingEvent,type Data,type Event} from './finance.ts';

export function preferredWorkspace<T extends {id:string;owner:string;shared:boolean}>(rows:T[],userId:string,previousId:string|null){
  return rows.find(row=>row.id===previousId)??rows.find(row=>row.owner===userId&&!row.shared);
}

export function paymentCalendarEvents(data:Data,period:string,today:string){
  const end=month(period,1);
  const current=period===first(today);
  return calendar(data,month(period,-12),addDays(end,-1)).filter(event=>{
    if(event.date>=period)return true;
    if(event.kind!=='expense'||remainingEvent(event,data.transactions)===0)return false;
    const due=dueDate(event);
    return due<end&&(current||due>=period);
  });
}

export function paymentGroups(data:Data,events:Event[],period:string,today:string,nextIncome?:string){
  const open=events.filter(event=>event.kind==='expense'&&event.status!=='canceled'&&remainingEvent(event,data.transactions)>0);
  const selectedEnd=month(period,1);
  const current=period===first(today);
  const unpaid=open.filter(event=>dueDate(event)<selectedEnd);
  const todayRows=current?unpaid.filter(event=>dueDate(event)<=today):[];
  const beforePay=current&&nextIncome?unpaid.filter(event=>dueDate(event)>today&&dueDate(event)<nextIncome):[];
  const used=new Set([...todayRows,...beforePay].map(e=>e.id));
  return [
    {label:'Сегодня',events:todayRows},
    {label:'До следующей зарплаты',events:beforePay},
    {label:'До конца месяца',events:open.filter(event=>!used.has(event.id))},
    {label:'Оплачено',events:events.filter(event=>event.kind==='expense'&&event.status!=='canceled'&&remainingEvent(event,data.transactions)===0)},
  ].map(group=>({...group,events:group.events.sort((a,b)=>dueDate(a).localeCompare(dueDate(b)))}));
}

export function recommendedPurchase<T extends {shortfall:number|null}>(options:T[]){
  return options.find(option=>option.shortfall===0)??options[0];
}
