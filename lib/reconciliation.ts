import {expectedIncome,incomeType} from './income.ts';
import {balance,entryMonth, first, validateEntry, type Data, type Entry} from './finance.ts';

export function prepareReconciliation(data:Data, period:string, entries:Entry[], correctPeriod=false){
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
      if(entryMonth(match)!==start){
        if(!correctPeriod)throw new Error('Такая операция уже есть в другом бюджетном месяце. Исправьте её в истории.');
        seen[seen.indexOf(match)]={...match,budgetMonth:start};
      }
      existing.push(match);
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

export function prepareFirstMonth(data:Data,period:string,entries:Entry[],deposit?:{id:string;opened:string}){
  const start=first(period);
  if(data.settings.firstTrackingMonth&&data.settings.firstTrackingMonth!==start)throw new Error('Первый месяц уже указан. Добавьте запись через историю операций.');
  for(const entry of entries){
    const exact=data.transactions.some(row=>row.kind===entry.kind&&row.amount===entry.amount&&row.to===entry.to&&row.from===entry.from&&row.date===entry.date);
    if(exact)continue;
    const nearMatch=data.transactions.find(row=>row.kind===entry.kind&&row.amount===entry.amount&&
      (entry.kind==='transfer'?row.to===entry.to:incomeType(row.name)===incomeType(entry.name)&&(row.to===entry.to||row.date===entry.date))&&
      Math.abs(Date.parse(row.date)-Date.parse(entry.date))<=14*86400000);
    if(nearMatch)throw new Error('Похожая операция уже есть с другой датой или счётом. Сверьте её в истории.');
  }
  const review=prepareReconciliation(data,start,entries,true);
  let accounts=data.accounts;
  if(deposit){
    const account=accounts.find(a=>a.kind==='bcc'&&a.id===deposit.id);
    const transfer=entries.find(entry=>entry.kind==='transfer'&&entry.to===deposit.id);
    if(!account||!transfer||!validDate(deposit.opened)||deposit.opened>transfer.date)throw new Error('Укажите точную дату открытия депозита, не позже пополнения.');
    if(account.opened&&account.opened!==deposit.opened)throw new Error('Дата открытия отличается от указанной в карточке депозита. Сверьте её с выпиской.');
    if(!data.transactions.some(row=>row.kind==='transfer'&&row.date===transfer.date&&row.amount===transfer.amount&&row.to===transfer.to&&row.from===transfer.from)&&
      (account.balanceDate?account.balanceDate<transfer.date||account.opening<transfer.amount:balance(account,data.transactions)<transfer.amount)){
      throw new Error('Проверьте начальный баланс депозита: эта сумма должна быть уже учтена.');
    }
    accounts=accounts.map(a=>a.id===account.id?{...a,opened:deposit.opened}:a);
  }
  const covered=new Map(data.events.map(event=>[event.id,event]));
  for(const entry of entries.filter(entry=>entry.kind==='income')){
    const event=expectedIncome(data,incomeType(entry.name),start);
    if(event&&!data.transactions.some(row=>row.event===event.id&&!row.openingBalanceIncluded)){
      covered.set(event.id,{...event,status:'settled_before_tracking'});
    }
  }
  return {...review,data:{...review.data,accounts,events:[...covered.values()],
    settings:{...review.data.settings,firstTrackingMonth:start}}};
}
