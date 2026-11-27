import {closedPeriodAvailability} from './cashflow.ts';
import {dailyBudget,availableEnvelope,balance,cash,categoryBudget,categorySpent,first,livingReserve,month,releaseLiving,reserved,sum,usedReserve,validateEntry,type Category,type Data,type Entry,type Item} from './finance.ts';

export function livingAccount(data:Data){
  return data.accounts.find(account=>account.kind==='cash'&&account.id===data.settings.livingAccount);
}

export function envelopeAmounts(data:Data,category:Category,date:string){
  const items=data.plans.filter(plan=>plan.status==='accepted').flatMap(plan=>plan.items)
    .filter(item=>item.group==='living'&&item.target===category.id&&availableEnvelope(item,date));
  const previous=data.transactions.filter(entry=>entry.date<first(date));
  return {
    plan:categoryBudget(data,category,date),
    assigned:sum(items.map(item=>Math.max(0,item.amount-usedReserve(previous,item.id)))),
    spent:categorySpent(data,category.id,date),
    available:livingReserve(data,category.id,date),
  };
}

export function envelopeSummary(data:Data){
  const items=data.plans.filter(plan=>plan.status==='accepted').flatMap(plan=>plan.items);
  const held=(groups:string[])=>sum(items.filter(item=>groups.includes(item.group)).map(item=>Math.max(0,item.amount-usedReserve(data.transactions,item.id))));
  return {cash:cash(data),free:cash(data)-reserved(data),bills:held(['bills','debt']),living:livingReserve(data),
    purchases:held(['purchases']),savings:held(['otbasy','bcc']),cushion:held(['reserve'])};
}

export function assignableLiving(data:Data,date:string,category:Category){
  const amounts=envelopeAmounts(data,category,date);
  const account=livingAccount(data);
  const walletRoom=account?balance(account,data.transactions)-envelopeSummary(data).living:Infinity;
  return Math.max(0,Math.min(cash(data)-reserved(data),walletRoom,amounts.plan-amounts.spent-amounts.available));
}

export function changeEnvelope(data:Data,input:{
  date:string; id:string; amount:number; source?:string;
  target?:Pick<Item,'target'|'name'|'group'>; carry?:boolean;
}):Data|null{
  const {date,id,amount,source,target,carry}=input;
  if(!Number.isSafeInteger(amount)||amount<=0||(!source&&!target))return null;
  const next=source?releaseLiving(data,source,amount,date):data;
  if(!next)return null;
  if(!target)return next;
  if(data.plans.some(plan=>plan.id===id||plan.items.some(item=>item.id===id)))return null;
  if(amount>cash(next)-reserved(next))return null;
  if(target.group==='living'){
    const category=next.categories.find(c=>c.id===target.target);
    if(!category)return null;
    const account=livingAccount(next);
    if(carry&&account&&amount>balance(account,next.transactions)-livingReserve(next))return null;
    if(!carry&&amount>assignableLiving(next,date,category))return null;
  }
  if(carry&&(!source||target.group!=='living'||target.target!==source))return null;
  return {...next,plans:[...next.plans,{id,date,status:'accepted',items:[{
    ...target,id,amount,reason:carry?'Остаток прошлого месяца':'Распределение кошелька',
    budgetMonth:target.group==='living'?(carry?month(first(date),1):first(date)):undefined,
  }]}]};
}

export function safeEnvelopeSpending(data:Data,date:string,budget=dailyBudget(data,date)){
  const held=livingReserve(data,undefined,date);
  const closed=data.settings.closings?.[first(date)];
  const closedBudget=closed?closedPeriodAvailability(data,date):null;
  const free=closedBudget?.available??budget.forLife;
  const unprotected=closedBudget?.shortage??Math.max(0,budget.obligations+budget.planned-budget.free);
  return free+Math.max(0,held-unprotected);
}

export function transferEnvelopeSavings(data:Data,source:string,entry:Entry){
  if(data.transactions.some(row=>row.id===entry.id))return {error:'Этот перевод уже записан.'};
  if(entry.kind!=='transfer'||!data.accounts.some(a=>a.id===entry.from&&a.kind==='cash')||
    !data.accounts.some(a=>a.id===entry.to&&(a.kind==='otbasy'||a.kind==='bcc'))){
    return {error:'Выберите денежный счёт и депозит.'};
  }
  const released=changeEnvelope(data,{source,id:entry.id,date:entry.date,amount:entry.amount});
  if(!released)return {error:'В категории меньше выделенных денег.'};
  const error=validateEntry(released,entry);
  if(error)return {error};
  return {data:{...released,transactions:[...released.transactions,entry]}};
}
