import {addDays, type Event} from './finance.ts';

export function calendarGroups(events:Event[], day:string, nextIncome?:string){
  const weekday=new Date(day+'T00:00:00Z').getUTCDay();
  const weekEnd=addDays(day,(8-weekday)%7||7);
  return [
    {label:'Сегодня',events:events.filter(event=>event.date===day)},
    {label:'На этой неделе',events:events.filter(event=>event.date>day&&event.date<weekEnd)},
    {label:'До следующей зарплаты',events:events.filter(event=>event.date>=weekEnd&&nextIncome&&event.date<nextIncome)},
    {label:'Позже в этом месяце',events:events.filter(event=>event.date>=weekEnd&&(!nextIncome||event.date>=nextIncome))},
    {label:'Прошедшие события',events:events.filter(event=>event.date<day)},
  ];
}

export function recommendedPurchase<T extends {shortfall:number|null}>(options:T[]){
  return options.find(option=>option.shortfall===0)??options[0];
}
