import {balance,calendar,cash,first,livingFundingError,livingReserve,month,releaseLiving,remainingEvent,reserved,type Data,type Entry} from './finance.ts';
import {changeEnvelope} from './envelopes.ts';

export function closingPayments(data:Data,period:string){
  const start=first(period),end=month(start,1);
  return calendar(data,start,end).filter(event=>event.date<end&&event.kind==='expense')
    .map(event=>({event,amount:remainingEvent(event,data.transactions)})).filter(row=>row.amount>0);
}

export function prepareMonthClosing(data:Data,period:string,date:string,input:{
  balances:Record<string,number>;
  reserveAction:'keep'|'release'|'carry';
  reviewedPayments:boolean;
  id:()=>string;
  score?:number;
  interest?:number;
}):Data{
  const start=first(period),current=first(date);
  if(start>current||data.settings.closings?.[start])throw new Error('Этот месяц нельзя закрыть повторно или заранее.');
  if(!input.reviewedPayments&&closingPayments(data,start).length)throw new Error('Проверьте обязательные платежи.');
  if(start!==current&&(Object.keys(input.balances).length||input.reserveAction!=='keep'))throw new Error('Сверка остатков и резервов доступна для текущего месяца.');
  const corrections:Entry[]=[];
  for(const [accountId,amount] of Object.entries(input.balances)){
    const account=data.accounts.find(a=>a.id===accountId&&a.kind!=='market');
    if(!account||!Number.isSafeInteger(amount)||amount<0)throw new Error('Укажите действительные остатки денежных счетов.');
    const delta=amount-balance(account,data.transactions);
    if(delta)corrections.push({id:input.id(),kind:'valuation',name:'Сверка месяца · '+account.name,date,amount:Math.abs(delta),
      from:delta<0?account.id:'',to:delta>0?account.id:'',category:'',event:'',reservation:'',sold:0});
  }
  let next={...data,transactions:[...data.transactions,...corrections]};
  for(const category of data.categories){
    const amount=livingReserve(next,category.id,date);
    if(!amount||input.reserveAction==='keep')continue;
    const changed=input.reserveAction==='release'?releaseLiving(next,category.id,amount,date):
      changeEnvelope(next,{date,id:input.id(),amount,source:category.id,target:{name:category.name,target:category.id,group:'living'},carry:true});
    if(!changed)throw new Error('Проверьте доступные деньги для переноса.');
    next=changed;
  }
  const walletError=livingFundingError(next);
  if(walletError)throw new Error(walletError);
  if(cash(next)<reserved(next))throw new Error('После сверки денег меньше, чем зарезервировано. Сверьте суммы или освободите резерв.');
  return {...next,settings:{...next.settings,closings:{...next.settings.closings,[start]:{date,score:input.score,interest:input.interest}}}};
}

export function reopenAccountingMonth(data:Data,period:string){
  const snapshot=data.settings.closings?.[period];
  if(!snapshot)return data;
  const closings={...data.settings.closings};
  delete closings[period];
  const monthly={...data.settings.monthly};
  if(snapshot.carried){
    const nextPeriod=month(period,1);
    const budgets={...monthly[nextPeriod]};
    for(const [id,amount] of Object.entries(snapshot.carried))budgets[id]=Math.max(0,(budgets[id]??0)-amount);
    monthly[nextPeriod]=budgets;
  }
  return {...data,settings:{...data.settings,closings,monthly}};
}
