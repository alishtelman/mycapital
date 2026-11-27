import {calendar,first,month,remainingEvent,type Data,type Event} from './finance.ts';

export const incomeTypes=[
  ['salary','Зарплата'],['advance','Аванс'],['quarter','Квартальная премия'],
  ['thirteenth','13-я зарплата'],['gift','Подарок'],['other','Другой доход'],
] as const;
export type IncomeType=typeof incomeTypes[number][0];

export function incomeType(name:string):IncomeType{
  if(/13\s*[-–]?\s*я|тринадцат/i.test(name))return 'thirteenth';
  if(/аванс/i.test(name))return 'advance';
  if(/зарплат|оклад/i.test(name))return 'salary';
  if(/преми/i.test(name))return 'quarter';
  if(/подар/i.test(name))return 'gift';
  return 'other';
}

export const incomePeriod = (event:Event) => first(event.id.match(/@(\d{4}-\d{2}-\d{2})$/)?.[1]??event.date);

export function expectedIncome(data:Data,type:IncomeType,period:string,requested?:Event){
  if(requested&&requested.kind==='income'&&incomePeriod(requested)===period&&remainingEvent(requested,data.transactions)>0)return requested;
  if(type==='other'||type==='gift')return;
  const candidates=calendar(data,month(period,-1),month(period,2)).filter(event=>event.kind==='income'&&incomePeriod(event)===period&&
    incomeType(event.name)===type&&remainingEvent(event,data.transactions)>0);
  return candidates.length===1?candidates[0]:undefined;
}
