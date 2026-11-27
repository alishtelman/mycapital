import {entryMonth, first, validateEntry, type Data, type Entry} from './finance.ts';

export function prepareReconciliation(data:Data, period:string, entries:Entry[]){
  const start=first(period);
  if(!validDate(start)||entries.length===0)throw new Error('Укажите месяц и добавьте операции.');
  const seen=[...data.transactions];
  const added:Entry[]=[];
  const existing:Entry[]=[];
  for(const draft of entries){
    const entry={...draft,budgetMonth:start,openingBalanceIncluded:true};
    if(!entry.name.trim()||!validDate(entry.date))throw new Error('Заполните название и фактическую дату операции.');
    const error=validateEntry(data,entry);
    if(error)throw new Error(error);
    const match=seen.find(row=>row.kind===entry.kind&&row.date===entry.date&&row.amount===entry.amount&&row.from===entry.from&&row.to===entry.to);
    if(match){
      if(entryMonth(match)!==start)throw new Error('Такая операция уже есть в другом бюджетном месяце. Исправьте её в истории.');
      existing.push(entry);
      continue;
    }
    seen.push(entry);
    added.push(entry);
  }
  return {added,existing,data:{...data,transactions:seen,settings:{...data.settings,partialMonths:{...data.settings.partialMonths,[start]:true}}}};
}

function validDate(date:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const utc=new Date(date+'T00:00:00Z');
  return Number.isFinite(utc.getTime())&&utc.toISOString().slice(0,10)===date;
}
