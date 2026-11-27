export type Account = {id:string; name:string; kind:'cash'|'otbasy'|'bcc'|'reserve'|'market'; owner:string; opening:number; rate:number; basis:number; maturity:string; contract:number; futureContract:number; score:number; interest:number; eligible:number; awarded:number; fee:number; earlyRate:number; opened:string; rollover:boolean; balanceDate?:string; liquidity?:'liquid'|'term'; nominal?:number; termMonths?:number; goalIncluded?:boolean; goalShare?:number; goalPurpose?:'down'|'cushion'};
export type Entry = {id:string; date:string; name:string; kind:'income'|'expense'|'transfer'|'sale'|'valuation'; amount:number; from:string; to:string; category:string; event:string; reservation:string; sold:number; plannedSale?:string; budgetMonth?:string; openingBalanceIncluded?:boolean; reducePayment?:boolean; finalPayment?:boolean; reserveUses?:{id:string;amount:number}[]; comment?:string};
export type Event = {id:string; name:string; date:string; kind:'income'|'expense'|'saving'|'notice'; amount:number; status:'planned'|'partial'|'received'|'settled_before_tracking'|'moved'|'canceled'; rule:string; comment:string; deadline?:string; payment?:Payment};
export type Payment = {category?:string; minimum?:number; maximum?:number; account?:string; priority?:number; partial?:boolean; early?:boolean; automatic?:boolean; reminders?:number[]; comment?:string; grace?:number; discount?:number};
export type Rule = {id:string; name:string; kind:'income'|'expense'; amount:number; date:string; base?:number; percent?:number; repeat:'monthly'|'weekly'|'fortnightly'|'bimonthly'|'quarterly'|'semiannual'|'yearly'|'once'|'custom'; active:boolean; payment?:Payment; dates?:string[]; uncertain?:boolean};
export type Category = {id:string; name:string; budget:number; minimum:number; maximum:number; rank:number; flexible:boolean};
export type Purchase = {id:string; name:string; date:string; amount:number; minimum:number; maximum:number; rank:number; required:boolean; movable:boolean; staged:boolean; category:string; status:'planned'|'done'|'canceled'; comment:string};
export type Debt = {id:string; name:string; kind:'mortgage'|'installment'; balance:number; payment:number; date:string; rate:number; apr:number; original:number; confirmed:boolean; installments?:{date:string;amount:number}[]};
export type Goal = {id:string; name:string; price:number; down:number; reserve:number; date:string; latest:string; score:number; buffer:number; laterScore:number; rentMin:number; rentMax:number; rate:number; laterRate:number; completed:boolean};
export type Scenario = {id:string; name:string; income:number; expenses:number; rates:number; market:number; price:number; bonusDelay:number; otbasyShare:number};
export type Item = {id:string; name:string; amount:number; target:string; reason:string; group:string};
export type Plan = {id:string; date:string; items:Item[]; status:'accepted'|'released'};
export type Bonus = {id:string; account:string; year:number; date:string; eligible:number; credited:number; actual:number};
export type Settings = {monthly?:Record<string,Record<string,number>>; conservative?:boolean; safetyDays?:number; reminderTime?:string; timeZone?:string; monthlySavingPlan?:Record<string,Record<string,number>>; roadmap?:Record<string,{done?:boolean;date?:string}>; plannedSales?:{id:string;account:string;date:string;value:number;proceeds:number}[]; partialMonths?:Record<string,boolean>; notifications?:Record<string,{read?:boolean; until?:string}>; closings?:Record<string,{date:string; score?:number; interest?:number; carried?:Record<string,number>}>; mrp:Record<string,number>; priority:string[]};
export type Data = {accounts:Account[]; transactions:Entry[]; events:Event[]; rules:Rule[]; categories:Category[]; purchases:Purchase[]; debts:Debt[]; goals:Goal[]; scenarios:Scenario[]; plans:Plan[]; bonuses:Bonus[]; settings:Settings};

export const empty = ():Data => ({accounts:[],transactions:[],events:[],rules:[],categories:[],purchases:[],debts:[],goals:[],scenarios:[],plans:[],bonuses:[],settings:{mrp:{},priority:['bills','living','purchases','reserve','otbasy','bcc','debt','free']}});
export const sum = (items:number[]) => items.reduce((a,b)=>a+b,0);
export const money = (n:number) => new Intl.NumberFormat('ru-KZ',{maximumFractionDigits:2}).format(n/100)+' ₸';
export const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Almaty'}).format(new Date());
const stamp = (date:string) => Date.parse(date+'T00:00:00Z');
export const days = (from:string,to:string) => Math.round((stamp(to)-stamp(from))/86400000);
export const addDays = (date:string,n:number) => new Date(stamp(date)+n*86400000).toISOString().slice(0,10);
export function month(date:string,n:number) {
  const [y,m,d]=date.split('-').map(Number);
  const last=new Date(Date.UTC(y,m+n,0)).getUTCDate();
  return new Date(Date.UTC(y,m+n-1,Math.min(d,last))).toISOString().slice(0,10);
}
export const first = (date:string) => date.slice(0,7)+'-01';
export const depositYield = (amount:number,rate:number,days:number,effective=false) =>
  Math.round(amount*(effective ? Math.pow(1+rate/100,Math.max(0,days)/365)-1 : rate/100*Math.max(0,days)/365));
export const score = (interest:number,contract:number) => contract>0 ? interest*1000/contract : 0;
export const bonus = (eligible:number,mrp:number,previouslyRewarded=0) => Math.round(Math.min(Math.max(0,eligible-previouslyRewarded),mrp*200)*0.2);
export const downPayment = (goal:Goal) => Math.round(goal.price*goal.down/100);
export const ruleAmount = (r:Rule) => r.base&&r.percent ? Math.round(r.base*r.percent/100) : r.amount;
export const categoryBudget = (d:Data,c:Category,date:string) => d.settings.monthly?.[first(date)]?.[c.id]??c.budget;
export const availableForGoal = (a:Account,date:string) => a.goalIncluded!==false && (a.kind==='otbasy'||a.kind==='reserve'||(a.kind==='bcc'&&(!a.maturity||a.maturity<=date)&&(a.liquidity!=='term'||!!a.maturity)));
export const entryMonth = (entry:Entry) => entry.budgetMonth??first(entry.date);
export const balance = (a:Account,entries:Entry[]) => a.opening+sum(entries.filter(e=>!e.openingBalanceIncluded).map(e=>
  (e.to===a.id?e.amount:0)-(e.from===a.id?(e.kind==='sale'?e.sold:e.amount):0)));
export function goalShare(account:Account){
  if(account.goalIncluded===false)return 0;
  return account.goalShare??(account.kind==='cash'?0:account.kind==='market'&&account.goalIncluded!==true?0:100);
}
export const goalPurpose = (account:Account) => account.goalPurpose??(account.kind==='reserve'?'cushion':'down');
export const goalValue = (account:Account,entries:Entry[]) => Math.round(balance(account,entries)*goalShare(account)/100);
export function goalHoldings(d:Data,goal:Goal){
  const value=(kind:Account['kind'])=>sum(d.accounts.filter(a=>a.kind===kind).map(a=>goalValue(a,d.transactions)));
  const otbasy=value('otbasy'), bcc=value('bcc'), market=value('market'), cashForGoal=value('cash');
  const liquidByPurpose=(purpose:NonNullable<Account['goalPurpose']>)=>sum(d.accounts.filter(a=>
    goalPurpose(a)===purpose&&a.kind!=='market'&&(a.kind!=='bcc'||availableForGoal(a,goal.date))).map(a=>goalValue(a,d.transactions)));
  const cushion=liquidByPurpose('cushion');
  return {otbasy,bcc,market,cushion,total:otbasy+bcc+market+cashForGoal+value('reserve'),downPaymentFunds:liquidByPurpose('down')};
}
export const uses = (entry:Entry) => entry.reserveUses??(entry.reservation?[{id:entry.reservation,amount:entry.amount}]:[]);
export const usedReserve = (entries:Entry[],id:string) => sum(entries.flatMap(uses).filter(x=>x.id===id).map(x=>x.amount));
export const reserved = (d:Data,target?:string) => sum(d.plans.filter(p=>p.status==='accepted').flatMap(p=>p.items.filter(i=>!target||i.target===target)
  .map(i=>Math.max(0,i.amount-usedReserve(d.transactions,i.id)))));
export const cash = (d:Data) => sum(d.accounts.filter(a=>a.kind==='cash').map(a=>balance(a,d.transactions)));
export function livingReserve(d:Data,category:string){
  return sum(d.plans.filter(p=>p.status==='accepted').flatMap(p=>p.items.filter(i=>i.group==='living'&&i.target===category)
    .map(i=>Math.max(0,i.amount-usedReserve(d.transactions,i.id)))));
}
export function releaseLiving(d:Data,category:string,amount:number){
  if(!Number.isSafeInteger(amount)||amount<=0||amount>livingReserve(d,category))return null;
  let left=amount;
  const plans=d.plans.map(p=>p.status!=='accepted'?p:{...p,items:p.items.map(i=>{
    if(!left||i.group!=='living'||i.target!==category)return i;
    const release=Math.min(left,Math.max(0,i.amount-usedReserve(d.transactions,i.id)));
    left-=release;
    return {...i,amount:i.amount-release};
  })});
  return {...d,plans};
}
export const remainingEvent = (e:Event,entries:Entry[]) => ['received','settled_before_tracking','canceled'].includes(e.status)?0:Math.max(0,e.amount-sum(entries.filter(t=>t.event===e.id).map(t=>t.amount)));

export function schedule(debt:Debt, limit=600) {
  let remaining=debt.balance;
  const payments: {date:string; amount:number; interest:number; remaining:number}[]=[];
  if(!debt.date || !debt.confirmed) return payments;
  if(debt.installments){
    for(const row of debt.installments.slice(0,limit)){
      const amount=Math.min(remaining,row.amount);
      if(amount<=0)break;
      remaining-=amount;
      payments.push({...row,amount,interest:0,remaining});
    }
    return payments;
  }
  for(let i=0;i<limit&&remaining>0;i++){
    const interest=Math.round(remaining*debt.rate/1200);
    if(debt.payment<=interest) break;
    const amount=Math.min(debt.payment,remaining+interest);
    remaining+=interest-amount;
    payments.push({date:month(debt.date,i),amount,interest,remaining});
  }
  return payments;
}
export function effectiveDebt(debt:Debt,d:Data):Debt{
  const linked=d.transactions.filter(t=>!t.openingBalanceIncluded&&t.kind==='expense'&&(t.category===debt.id||t.event.startsWith(debt.id+'@')||d.events.some(e=>e.id===t.event&&e.rule===debt.id)));
  if(debt.installments){
    const payments=debt.installments.map(row=>{
      const id=debt.id+'@'+row.date;
      const event=d.events.find(e=>e.id===id);
      const paid=sum(linked.filter(t=>t.event===id).map(t=>t.amount));
      return {...row,amount:event?.status==='received'?0:Math.max(0,row.amount-paid)};
    }).filter(row=>row.amount>0);
    const early=sum(linked.filter(t=>!t.event).map(t=>t.amount));
    const remaining=Math.max(0,sum(payments.map(p=>p.amount))-early);
    return {...debt,installments:payments,balance:remaining,date:payments[0]?.date??'',payment:Math.min(remaining,payments[0]?.amount??0)};
  }
  const groups=Map.groupBy(linked.filter(t=>t.event&&t.category!==debt.id),t=>t.event);
  let principal=debt.balance, date=debt.date;
  for(const [id,tx] of [...groups].sort((a,b)=>(d.events.find(e=>e.id===a[0])?.date??a[0]).localeCompare(d.events.find(e=>e.id===b[0])?.date??b[0]))){
    const event=d.events.find(e=>e.id===id);
    const paid=sum(tx.map(t=>t.amount));
    const interest=Math.round(principal*debt.rate/1200);
    principal=Math.max(0,principal-Math.max(0,paid-interest));
    if(event&&(event.status==='received'||paid>=event.amount||tx.some(t=>t.finalPayment))&&date<=event.date)date=month(debt.date,Math.max(1,(Number(event.date.slice(0,4))-Number(debt.date.slice(0,4)))*12+Number(event.date.slice(5,7))-Number(debt.date.slice(5,7))+1));
  }
  const early=linked.filter(t=>!t.event||t.category===debt.id);
  const reduced=Math.max(0,principal-sum(early.map(t=>t.amount)));
  const payment=early.some(t=>t.reducePayment)&&principal>0?Math.floor(debt.payment*reduced/principal):debt.payment;
  return {...debt,date,balance:reduced,payment};
}
export function categorySpent(d:Data,id:string,date:string){
  return sum(d.transactions.filter(t=>t.kind==='expense'&&t.category===id&&!t.event&&entryMonth(t)===first(date)).map(t=>t.amount));
}
export function debtComparison(debt:Debt,depositRate:number){
  const table=schedule(debt);
  const saved=sum(table.map(p=>p.interest));
  const horizon=table.at(-1)?.date;
  const keepDeposit=horizon?depositYield(debt.balance,depositRate,Math.max(0,days(debt.date,horizon)+30),true):0;
  const investFreedPayments=horizon?sum(table.map(p=>depositYield(p.amount,depositRate,days(p.date,horizon),true))):0;
  const lost=keepDeposit-investFreedPayments;
  return {saved,lost,net:saved-lost,months:table.length};
}
export function calendar(d:Data,start:string,end:string) {
  const overrides=new Map(d.events.map(e=>[e.id,e]));
  const generated:Event[]=[];
  const append=(e:Event)=>{
    if(!overrides.has(e.id)&&e.date>=start&&e.date<=end) generated.push(e);
  };
  for(const r of d.rules.filter(r=>r.active&&(r.date||r.repeat==='custom'))){
    const recurring={monthly:1,bimonthly:2,quarterly:3,semiannual:6,yearly:12,once:1};
    const dates=r.repeat==='custom'?[...new Set(r.dates??[])].sort():[];
    if(r.repeat!=='custom')for(let i=0;i<1600;i++){
      if(r.repeat==='once'&&i>0)break;
      const date=r.repeat==='weekly'||r.repeat==='fortnightly'?addDays(r.date,i*(r.repeat==='weekly'?7:14)):month(r.date,i*recurring[r.repeat]);
      if(date>end)break;
      dates.push(date);
    }
    for(const date of dates)append({id:r.id+'@'+date,name:r.name,kind:r.kind,date,amount:ruleAmount(r),status:'planned',rule:r.id,
      comment:r.payment?.comment??'',deadline:r.payment?.grace?addDays(date,r.payment.grace):undefined,payment:r.payment});
  }
  for(const loan of d.debts){
    const payments=schedule(effectiveDebt(loan,d));
    if(loan.installments){
      const dates=new Set(payments.map(p=>loan.id+'@'+p.date));
      for(const event of overrides.values()){
        if(event.rule===loan.id&&!dates.has(event.id)&&remainingEvent(event,d.transactions)>0){
          overrides.set(event.id,{...event,status:'canceled'});
        }
      }
    }
    for(const p of payments){
    const id=loan.id+'@'+p.date;
    const alreadyPaid=loan.installments?sum(d.transactions.filter(t=>t.kind==='expense'&&t.event===id&&!t.openingBalanceIncluded).map(t=>t.amount)):0;
    const override=overrides.get(id);
    if(loan.installments&&override&&override.status!=='received'){
      overrides.set(id,{...override,amount:p.amount+alreadyPaid});
    }
    append({id,name:loan.name,kind:'expense',date:p.date,amount:p.amount+alreadyPaid,status:'planned',rule:loan.id,comment:''});
  }
  }
  for(const p of d.purchases.filter(p=>p.status==='planned')) append({id:'purchase@'+p.id,name:p.name,kind:'expense',date:p.date,amount:p.amount,status:'planned',rule:p.id,comment:p.comment});
  for(const a of d.accounts.filter(a=>a.kind==='bcc'&&a.maturity)){
    for(let i=0;i<(a.rollover&&a.termMonths?120:1);i++){
      const date=month(a.maturity,i*(a.termMonths??0));
      if(date>end)break;
      append({id:'maturity@'+a.id+'@'+date,name:'Окончание вклада · '+a.name,kind:'notice',date,amount:0,status:'planned',rule:a.id,comment:''});
    }
  }
  for(const p of d.plans.filter(p=>p.status==='accepted')) for(const i of p.items.filter(i=>['reserve','bcc','otbasy'].includes(i.group))){
    const pending=i.amount-usedReserve(d.transactions,i.id);
    if(pending>0)append({id:'saving@'+i.id,name:i.name,kind:'saving',date:p.date,amount:pending,status:'planned',rule:i.target,comment:i.reason});
  }
  for(const b of d.bonuses.filter(b=>b.date)) append({id:'bonus@'+b.id,name:'Госпремия · '+(d.accounts.find(a=>a.id===b.account)?.name??''),kind:'notice',date:b.date,amount:0,status:'planned',rule:b.id,comment:''});
  return [...[...overrides.values()].filter(e=>e.date>=start&&e.date<=end),...generated].sort((a,b)=>a.date.localeCompare(b.date));
}

export const dueDate = (e:Event) => e.deadline||e.date;
export const guaranteed = (d:Data,e:Event) => !d.settings.conservative||d.rules.some(r=>r.id===e.rule&&!r.uncertain&&['monthly','weekly','fortnightly'].includes(r.repeat)&&!/дежурств|преми|13-я/i.test(r.name));
export function payDate(d:Data,e:Event,date:string){
  const deadline=dueDate(e);
  if(e.payment?.automatic)return e.date;
  if(e.payment?.early===false||deadline<=date)return deadline;
  let day=addDays(deadline,-(d.settings.safetyDays??2));
  while([0,6].includes(new Date(stamp(day)).getUTCDay()))day=addDays(day,-1);
  return day<date?date:day;
}
export function nextIncome(d:Data,events:Event[],date:string){
  return events.find(e=>e.kind==='income'&&e.date>date&&remainingEvent(e,d.transactions)>0&&guaranteed(d,e));
}
export function paymentNeed(d:Data,e:Event){return Math.max(0,remainingEvent(e,d.transactions)-reserved(d,e.id));}
export function forecastsForBills(d:Data,date:string){
  const events=calendar(d,month(date,-12),addDays(date,95));
  const income=nextIncome(d,events,date);
  const delayed=events.some(e=>e.kind==='income'&&e.date<date&&e.date>=addDays(date,-7)&&remainingEvent(e,d.transactions)>0&&guaranteed(d,e));
  const end=income?.date??addDays(date,30);
  const bills=events.filter(e=>e.kind==='expense'&&!e.id.startsWith('purchase@')&&remainingEvent(e,d.transactions)>0);
  return {events,income,delayed,end,bills};
}
export function livingNeed(d:Data,c:Category,start:string,end:string,minimum=true){
  let total=0;
  for(let date=start;date<end;){
    const endMonth=month(first(date),1);
    const until=endMonth<end?endMonth:end;
    const level=minimum?c.minimum:categoryBudget(d,c,date);
    total+=Math.min(Math.max(0,level-categorySpent(d,c.id,date)),Math.round(level*days(date,until)/days(first(date),endMonth)));
    date=until;
  }
  return total;
}
export function billNeeds(d:Data,date:string){
  const {events,income,delayed,end,bills}=forecastsForBills(d,date);
  const essential=bills.filter(e=>payDate(d,e,date)<=end);
  const future=bills.filter(e=>!essential.includes(e)&&payDate(d,e,date)<=addDays(end,35));
  const incomeAfter=events.filter(e=>e.kind==='income'&&guaranteed(d,e)&&e.date>=end);
  const needs=essential.sort((a,b)=>dueDate(a).localeCompare(dueDate(b))||(a.payment?.priority??5)-(b.payment?.priority??5))
    .map(event=>({event,amount:paymentNeed(d,event),reason:'Обеспечить к '+dueDate(event)}));
  let earlier=0;
  for(const event of future.sort((a,b)=>payDate(d,a,date).localeCompare(payDate(d,b,date)))){
    const payment=payDate(d,event,date);
    const inflows=sum(incomeAfter.filter(e=>e.date<payment).map(e=>remainingEvent(e,d.transactions)));
    const life=sum(d.categories.map(c=>livingNeed(d,c,end,payment)));
    const amount=paymentNeed(d,event);
    const shortage=Math.min(amount,Math.max(0,amount-Math.max(0,inflows-life-earlier)));
    earlier+=amount;
    if(shortage>0)needs.push({event,amount:shortage,reason:'Часть нужна заранее: будущих поступлений может не хватить'});
  }
  const purchases=events.filter(e=>e.kind==='expense'&&e.id.startsWith('purchase@')&&remainingEvent(e,d.transactions)>0&&e.date>=month(date,-3)&&
    (e.date<=end||d.purchases.some(p=>'purchase@'+p.id===e.id&&p.staged)))
    .map(event=>({event,amount:Math.max(0,Math.round(remainingEvent(event,d.transactions)*(event.date<=end?1:Math.min(1,days(date,end)/Math.max(1,days(date,event.date)))))-reserved(d,event.id))}));
  return {needs,purchases,end,income,delayed};
}
export function undatedObligations(d:Data){
  return sum(d.rules.filter(r=>r.active&&r.kind==='expense'&&!r.date&&(r.repeat!=='custom'||!r.dates?.length)).map(ruleAmount))
    +sum(d.debts.filter(debt=>!debt.date||!debt.confirmed).map(debt=>Math.min(debt.payment,effectiveDebt(debt,d).balance)));
}
export function dailyBudget(d:Data,date:string){
  const {needs,purchases,end,income,delayed}=billNeeds(d,date);
  const undated=undatedObligations(d);
  const obligations=sum(needs.map(x=>x.amount))+undated;
  const planned=sum(purchases.map(x=>x.amount));
  const free=Math.max(0,cash(d)-reserved(d));
  const categories=d.categories.map(c=>({id:c.id,minimum:Math.max(0,livingNeed(d,c,date,end)-reserved(d,c.id)),
    available:Math.max(0,livingNeed(d,c,date,end,false)-reserved(d,c.id))}));
  const forLife=Math.min(Math.max(0,free-obligations-planned),sum(categories.map(c=>c.available)));
  return {income,end,undated,horizon:Math.max(1,days(date,end)),delayed,free,obligations,planned,forLife,
    daily:Math.floor(forLife/Math.max(1,days(date,end))),shortage:Math.max(0,obligations-free),
    save:Math.max(0,free-obligations-planned-sum(categories.map(c=>c.minimum)))};
}

export function depositTransfers(d:Data,accountId:string,period:string){
  return Math.max(0,sum(d.transactions.filter(t=>t.kind==='transfer'&&entryMonth(t)===period)
    .map(t=>(t.to===accountId?t.amount:0)-(t.from===accountId?t.amount:0))));
}

export function savingPlanProgress(d:Data,period:string,draft:Item[]=[]){
  const targets=d.settings.monthlySavingPlan?.[period];
  if(!targets)return [];
  return d.accounts.flatMap(account=>{
    const target=targets[account.id];
    if(target===undefined||(account.kind!=='otbasy'&&account.kind!=='bcc'))return [];
    const transferred=depositTransfers(d,account.id,period);
    const held=sum(d.plans.filter(p=>p.status==='accepted').flatMap(p=>p.items.filter(item=>item.group===account.kind&&item.target===account.id)
      .map(item=>Math.max(0,item.amount-usedReserve(d.transactions,item.id)))));
    const proposed=sum(draft.filter(item=>item.group===account.kind&&item.target===account.id).map(item=>item.amount));
    return [{id:account.id,group:account.kind,name:account.name,target,transferred,held,proposed,left:Math.max(0,target-transferred-held-proposed)}];
  });
}

export function allocation(d:Data,date:string,choice?:Scenario,period=first(date)):Item[]{
  let left=Math.max(0,cash(d)-reserved(d));
  const {needs,purchases,end:next}=billNeeds(d,date);
  const goal=d.goals.find(g=>!g.completed);
  const items:Item[]=[];
  function add(group:string,target:string,name:string,wanted:number,reason:string){
    const amount=Math.min(left,Math.max(0,Math.round(wanted)-reserved(d,target)));
    if(amount>0){items.push({id:group+':'+target,group,target,name,amount,reason});left-=amount;}
  }
  let undatedHeld=0;
  const protectedGroups=['bills','living','purchases'];
  const personalPlan=d.settings.monthlySavingPlan?.[period];
  const groups=personalPlan?protectedGroups:[...new Set([...protectedGroups,...d.settings.priority,...empty().settings.priority])].filter(g=>g!=='free');
  for(const group of groups){
    if(group==='bills'){
      for(const {event,amount,reason} of needs)add(group,event.id,event.name,amount+reserved(d,event.id),reason);
      undatedHeld=Math.min(left,undatedObligations(d));
      left-=undatedHeld;
    }
    if(group==='purchases')for(const {event,amount} of purchases)add(group,event.id,event.name,amount+reserved(d,event.id),'Резерв к дате покупки');
    if(group==='living')for(const c of [...d.categories].sort((a,b)=>a.rank-b.rank)){
      add(group,c.id,c.name,livingNeed(d,c,date,next),'Комфортный минимум до следующего поступления');
    }
    if(group==='reserve'&&goal){
      const a=d.accounts.find(a=>a.kind==='reserve');
      if(a) add(group,a.id,a.name,Math.max(0,goal.reserve-balance(a,d.transactions))*Math.min(1,days(date,next)/Math.max(1,days(date,goal.date))),'Пополнение подушки в темпе цели');
    }
    if(group==='otbasy'&&goal){
      const accounts=d.accounts.filter(a=>a.kind==='otbasy'&&goalShare(a)>0&&goalPurpose(a)==='down');
      const horizon=Math.max(0,days(date,goal.date));
      const contract=Math.max(...accounts.map(a=>a.futureContract||a.contract),0);
      const base=sum(accounts.map(a=>(a.interest||a.score*a.contract/1000)+depositYield(balance(a,d.transactions),a.rate,horizon)));
      let needed=Math.max(0,contract*(goal.score+goal.buffer)/1000-base);
      for(const a of [...accounts].sort((a,b)=>b.rate-a.rate)){
        const mrp=d.settings.mrp[date.slice(0,4)]??0;
        const record=d.bonuses.find(b=>b.account===a.id&&String(b.year)===date.slice(0,4));
        const bonusRoom=goal.date.slice(0,4)>date.slice(0,4)&&(!record?.date||record.date<=goal.date)?Math.max(0,mrp*200-Math.max(0,(record?.eligible??a.eligible)-(record?.credited??a.awarded))):0;
        const opNeed=horizon&&a.rate?needed*36500/(a.rate*horizon):0;
        const share=choice?left*choice.otbasyShare/100:0;
        const before=left;
        add(group,a.id,a.name,Math.max(opNeed,bonusRoom,share),opNeed>0?'Пополнение для прогнозного ОП':bonusRoom>0?'Доступный годовой лимит госпремии':'Доля выбранного сценария');
        needed=Math.max(0,needed-depositYield(before-left,a.rate,horizon));
      }
    }
    if(group==='bcc'){
      const a=d.accounts.filter(a=>a.kind==='bcc'&&(!goal||availableForGoal(a,goal.date))).sort((a,b)=>b.rate-a.rate)[0];
      if(a) add(group,a.id,a.name,left+reserved(d,a.id),'Остаток на вклад, доступный к сроку цели');
    }
    if(group==='debt') for(const loan of d.debts.filter(x=>x.kind==='installment'&&x.confirmed)){
      const current=effectiveDebt(loan,d);
      const comparison=debtComparison(current,Math.max(0,...d.accounts.filter(a=>a.kind==='bcc').map(a=>a.rate)));
      if(comparison.net>0&&left>=current.balance) add(group,loan.id,loan.name,current.balance,'Экономия процентов выше упущенного дохода');
    }
  }
  if(personalPlan){
    let available=Math.min(left,dailyBudget(d,date).save);
    for(const row of savingPlanProgress(d,period)){
      const amount=Math.min(available,row.left);
      if(!amount)continue;
      items.push({id:row.group+':'+row.id,group:row.group,target:row.id,name:row.name,amount,reason:'По твоему плану на месяц'});
      available-=amount;
      left-=amount;
    }
  }
  left+=undatedHeld;
  if(left)items.push({id:'free',group:'free',target:'',name:'Ликвидный остаток',amount:left,
    reason:undatedObligations(d)?'Включает запас на обязательства без даты':'Свободные средства без срока размещения'});
  return items;
}

export function forecast(d:Data,goal:Goal,start:string,s?:Scenario){
  const accounts=d.accounts.filter(a=>a.kind==='otbasy'&&goalShare(a)>0&&goalPurpose(a)==='down');
  const contract=Math.max(0,...accounts.map(a=>a.futureContract||a.contract));
  let otbasy=sum(accounts.map(a=>goalValue(a,d.transactions)));
  // The bank's actual score is tied to the contract, independent of the amount earmarked in MyCapital.
  let interest=sum(accounts.map(a=>a.interest||a.score*a.contract/1000));
  const cushionAccounts=d.accounts.filter(a=>goalPurpose(a)==='cushion'&&(a.kind==='cash'||availableForGoal(a,goal.date)));
  let reserves=sum(cushionAccounts.map(a=>goalValue(a,d.transactions)));
  const bccAccounts=d.accounts.filter(a=>a.kind==='bcc'&&goalShare(a)>0&&goalPurpose(a)==='down');
  let bcc=sum(bccAccounts.map(a=>goalValue(a,d.transactions)));
  const otRate=(Math.max(0,...accounts.map(a=>a.rate)))*(s?.rates??100)/100;
  const earmarkedCash=sum(cushionAccounts.filter(a=>a.kind==='cash').map(a=>goalValue(a,d.transactions)));
  const otherDownPayment=sum(d.accounts.filter(a=>a.kind==='reserve'&&goalPurpose(a)==='down').map(a=>goalValue(a,d.transactions)));
  let liquid=cash(d)-earmarkedCash+otherDownPayment;
  const goalExcluded=sum(d.accounts.filter(a=>a.kind!=='cash'&&a.kind!=='market').map(a=>balance(a,d.transactions)))
    -otbasy-bcc-(reserves-earmarkedCash)-otherDownPayment;
  const marketBalances=new Map(d.accounts.filter(a=>a.kind==='market').map(a=>[a.id,balance(a,d.transactions)]));
  const marketFactor=(s?.market??100)/100;
  const sales=(d.settings.plannedSales??[]).filter(sale=>sale.date>=start&&!d.transactions.some(t=>t.kind==='sale'&&t.plannedSale===sale.id))
    .sort((a,b)=>a.date.localeCompare(b.date));
  const down=Math.round(downPayment(goal)*(s?.price??100)/100);
  const end=month(start,36);
  const events=calendar(d,month(start,-12),end).filter(e=>!e.id.startsWith('credited@')&&(e.date>=start||e.kind==='expense'));
  const due=events.map(e=>({...e,date:e.kind==='expense'&&e.date<start?start:e.kind==='income'&&d.rules.some(r=>r.id===e.rule&&r.repeat==='quarterly')?addDays(e.date,s?.bonusDelay??0):e.date}));
  const checkpoints=[goal.date,goal.latest].filter(date=>date>=start&&date<end).map(date=>addDays(date,1)).sort();
  const otBalances=new Map(accounts.map(a=>[a.id,goalValue(a,d.transactions)]));
  const bccBalances=new Map(bccAccounts.map(a=>[a.id,goalValue(a,d.transactions)]));
  const otChoice=[...accounts].sort((a,b)=>b.rate-a.rate)[0];
  const bccChoice=[...bccAccounts].filter(a=>availableForGoal(a,goal.date)).sort((a,b)=>b.rate-a.rate)[0];
  const rateFactor=(s?.rates??100)/100;
  let cumulativeInterest=0, cumulativeBonus=0, reached='';
  const rows=[];
  const deposits:{date:string;account:string;amount:number}[]=[];
  for(let date=start;date<end;){
    const naturalEnd=month(first(date),1);
    const until=checkpoints.find(point=>point>date&&point<naturalEnd)??(naturalEnd>end?end:naturalEnd);
    const span=days(date,until);
    const monthFraction=span/days(first(date),naturalEnd);
    const closed=!!d.settings.closings?.[first(date)];
    const candidates=due.filter(e=>e.date>=date&&e.date<until);
    const income=Math.round(sum(candidates.filter(e=>e.kind==='income').map(e=>remainingEvent(e,d.transactions)))*(s?.income??100)/100);
    const datedBills=sum(candidates.filter(e=>e.kind==='expense').map(e=>remainingEvent(e,d.transactions)));
    const undatedBills=
      sum(d.rules.filter(r=>r.active&&r.kind==='expense'&&!r.date).map(r=>Math.round(ruleAmount(r)*(r.repeat==='weekly'?52/12:r.repeat==='fortnightly'?26/12:r.repeat==='yearly'?1/12:r.repeat==='semiannual'?1/6:r.repeat==='bimonthly'?1/2:r.repeat==='quarterly'?1/3:1))))+
      sum(d.debts.filter(l=>!l.date||!l.confirmed).map(l=>{const debt=effectiveDebt(l,d);return Math.min(debt.payment,Math.max(0,debt.balance-debt.payment*Math.max(0,(Number(date.slice(0,4))-Number(start.slice(0,4)))*12+Number(date.slice(5,7))-Number(start.slice(5,7)))));}));

    const living=sum(d.categories.map(c=>{
      const actual=categorySpent(d,c.id,date);
      return Math.max(0,Math.round(categoryBudget(d,c,date)*(s?.expenses??100)/100)-actual);
    }));
    const expenses=datedBills+(closed?0:Math.round((undatedBills+living)*monthFraction));
    const otInterest=sum(accounts.map(a=>{
      const principal=otBalances.get(a.id)??0;
      const earned=depositYield(principal,a.rate*rateFactor,span);
      otBalances.set(a.id,principal+earned);
      return earned;
    }));
    const bccInterest=sum(bccAccounts.map(a=>{
      const principal=bccBalances.get(a.id)??0;
      const earningDays=!a.maturity||a.rollover||a.liquidity==='liquid'?span:Math.max(0,Math.min(span,days(date,a.maturity)));
      const earned=depositYield(principal,a.rate*rateFactor,earningDays,true);
      bccBalances.set(a.id,principal+earned);
      return earned;
    }));
    interest+=otInterest;
    otbasy+=otInterest;
    bcc+=bccInterest;
    cumulativeInterest+=bccInterest+otInterest;
    for(const award of d.bonuses.filter(x=>x.date>=date&&x.date<until&&!d.events.some(e=>e.id==='credited@'+x.id&&e.status==='received')&&accounts.some(a=>a.id===x.account))){
      const actualPosted=sum(d.transactions.filter(t=>t.event==='credited@'+award.id).map(t=>t.amount));
      const amount=Math.max(0,(award.actual||bonus(award.eligible,d.settings.mrp[String(award.year)]??0,award.credited))-actualPosted);
      otbasy+=amount;
      otBalances.set(award.account,(otBalances.get(award.account)??0)+amount);
      cumulativeBonus+=amount;
    }
    const saleIncome=sum(sales.filter(sale=>sale.date>=date&&sale.date<until).map(sale=>{
      const holding=marketBalances.get(sale.account)??0;
      if(sale.value<=0||sale.value>holding)return 0;
      marketBalances.set(sale.account,holding-sale.value);
      return sale.proceeds;
    }));
    const market=Math.round(sum([...marketBalances.values()])*marketFactor);
    liquid+=income+saleIncome-expenses;
    const save=closed?0:Math.max(0,liquid);
    const remainingPeriods=Math.max(1,Math.ceil(days(date,goal.date)/30.44));
    const accepted=d.plans.filter(p=>p.status==='accepted'&&((p.date<date&&date===start)||(p.date>=date&&p.date<until)));
    const confirmedTarget=(kind:Account['kind'])=>sum(accepted.flatMap(p=>p.items).filter(i=>d.accounts.some(a=>a.id===i.target&&a.kind===kind))
      .map(i=>Math.max(0,i.amount-usedReserve(d.transactions,i.id))));
    const toReserve=Math.min(save,Math.max(confirmedTarget('reserve'),Math.ceil(Math.max(0,goal.reserve-reserves)/remainingPeriods)));
    reserves+=toReserve;
    liquid-=toReserve;
    const available=save-toReserve;
    const daysToGoal=Math.max(0,days(until,goal.date));
    const projected=sum(accounts.map(a=>depositYield(otBalances.get(a.id)??0,a.rate*rateFactor,daysToGoal)));
    const interestGap=Math.max(0,contract*(goal.score+goal.buffer)/1000-interest-projected);
    const early=daysToGoal>0&&otRate>0?Math.ceil(interestGap*36500/(daysToGoal*otRate)):0;
    const toOtbasy=accounts.length?Math.min(available,Math.max(early,confirmedTarget('otbasy'),Math.round(available*(s?.otbasyShare??0)/100))):0;
    otbasy+=toOtbasy;
    if(otChoice)otBalances.set(otChoice.id,(otBalances.get(otChoice.id)??0)+toOtbasy);
    liquid-=toOtbasy;
    const toBcc=!closed&&bccChoice&&until<=goal.date?Math.max(0,liquid):0;
    if(bccChoice&&toBcc>0){
      bcc+=liquid;
      bccBalances.set(bccChoice.id,(bccBalances.get(bccChoice.id)??0)+liquid);
      liquid=0;
    }
    if(otChoice&&toOtbasy>0)deposits.push({date,account:otChoice.id,amount:toOtbasy});
    if(bccChoice&&toBcc>0)deposits.push({date,account:bccChoice.id,amount:toBcc});
    const boundary=addDays(until,-1);
    for(const a of [...bccAccounts].sort((a,b)=>a.rate-b.rate)){
      if(liquid>=0||!availableForGoal(a,boundary))continue;
      const principal=bccBalances.get(a.id)??0;
      const withdrawal=Math.min(-liquid,principal);
      bccBalances.set(a.id,principal-withdrawal);
      bcc-=withdrawal;liquid+=withdrawal;
    }
    const locked=sum(bccAccounts.filter(a=>!availableForGoal(a,boundary)).map(a=>bccBalances.get(a.id)??0));
    const op=score(interest,contract);
    const availableDown=Math.max(0,otbasy+Math.max(0,bcc-locked)+liquid);
    const transferable=Math.min(availableDown,Math.max(0,bcc-locked)+Math.max(0,liquid));
    const otbasyAtDeal=otbasy+transferable;
    const deficit=Math.max(0,down-availableDown)+Math.max(0,goal.reserve-reserves);
    if(!reached&&deficit===0&&op>=goal.score&&otbasyAtDeal>=down&&accounts.length&&contract>0) reached=boundary;
    rows.push({date:boundary,income,expenses,otbasy,bcc,reserves,op,deficit,interest:cumulativeInterest,bonus:cumulativeBonus,capital:otbasy+bcc+reserves+market+liquid+goalExcluded,
      savings:otbasy+Math.max(0,bcc-locked)+reserves+liquid,target:down+goal.reserve,liquid,debt:sum(d.debts.map(loan=>schedule(effectiveDebt(loan,d)).filter(p=>p.date<until).at(-1)?.remaining??effectiveDebt(loan,d).balance))});
    date=until;
  }
  return {rows,deposits,reached,deadline:rows.find(r=>r.date>=goal.date),
    latest:rows.find(r=>r.date>=goal.latest)};
}

export function validateEntry(d:Data,e:Entry,checkBalances=true){
  const a=d.accounts.find(x=>x.id===e.from), b=d.accounts.find(x=>x.id===e.to);
  if((e.from&&!a)||(e.to&&!b)) return 'Указанный счёт не найден.';
  if(e.date>today()) return 'Фактическая операция не может быть в будущем.';
  if(e.kind==='income'&&(!b||b.kind==='market'||a)) return 'Выберите счёт для поступления.';
  if(e.kind==='expense'&&(!a||a.kind==='market'||b)) return 'Выберите счёт списания.';
  if(checkBalances&&e.kind==='expense'&&a?.kind==='bcc'&&(a.maturity>e.date||a.liquidity==='term'&&!a.maturity))return 'Этот вклад пока недоступен для платежей.';
  if(e.kind==='transfer'&&(!a||!b||a.id===b.id||a.kind==='market'||b.kind==='market')) return 'Выберите два разных денежных счёта.';
  if(e.kind==='sale'&&(!a||a.kind!=='market'||!b||b.kind!=='cash'||e.sold<=0)) return 'Для продажи укажите рыночный актив, свободный счёт и стоимость продаваемой части.';
  if(e.kind==='valuation'&&((!a&&!b)||(a&&b))) return 'Укажите корректируемый счёт.';
  if(e.plannedSale&&(e.kind!=='sale'||!d.settings.plannedSales?.some(sale=>sale.id===e.plannedSale&&sale.account===e.from)||d.transactions.some(t=>t.id!==e.id&&t.plannedSale===e.plannedSale)))return 'Продажа не соответствует плану или уже подтверждена.';
  if(e.openingBalanceIncluded&&(!['income','expense','transfer'].includes(e.kind)||e.event||e.reservation||uses(e).length||e.sold||e.reducePayment||e.finalPayment))return 'Историческая запись не может изменять платежи, долги или резервы.';
  if(e.budgetMonth&&(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(e.budgetMonth)||e.budgetMonth>first(month(today(),1))))return 'Укажите месяц бюджета до следующего месяца включительно.';
  if(e.amount<=0) return 'Введите сумму больше нуля.';
  if(!checkBalances)return '';
  const remaining=d.transactions.filter(t=>t.id!==e.id);
  if(!d.accounts.every(account=>balance(account,[...remaining,e])>=0)) return 'Недостаточно средств на счёте.';
  const links=uses(e);
  if(sum(links.map(link=>link.amount))>e.amount||new Set(links.map(link=>link.id)).size!==links.length)return 'Проверьте сумму списания из резервов.';
  for(const link of links){
    const prior=d.transactions.find(t=>t.id===e.id);
    const item=d.plans.filter(p=>p.status==='accepted'||(prior&&uses(prior).some(x=>x.id===link.id))).flatMap(p=>p.items).find(i=>i.id===link.id);
    if(!item||usedReserve(remaining,link.id)+link.amount>item.amount)return 'Сумма превышает остаток резерва.';
  }
  if(cash({...d,transactions:[...remaining,e]})<reserved({...d,transactions:[...remaining,e]})) return 'Часть свободных денег уже зарезервирована. Выберите резерв или освободите его в бюджете.';
  return '';
}

export function budgetCuts(d:Data,date:string,amount:number,except=''){
  let gap=amount;
  const changes=[];
  const categories=[...d.categories].filter(c=>c.id!==except&&c.flexible).sort((a,b)=>b.rank-a.rank);
  for(const category of categories){
    const before=categoryBudget(d,category,date);
    const spent=categorySpent(d,category.id,date);
    const protectedBudget=Math.max(category.minimum,spent+reserved(d,category.id));
    const cut=Math.min(gap,Math.max(0,before-protectedBudget));
    if(cut>0){changes.push({category,amount:cut,newBudget:before-cut});gap-=cut;}
  }
  return {changes,gap};
}

export function optimizeSavings(d:Data,goal:Goal,date:string,scenario?:Scenario){
  const basis=scenario??{id:'base',name:'Базовый',income:100,expenses:100,rates:100,market:100,price:100,bonusDelay:0,otbasyShare:0};
  const candidates=[...new Set([0,5,10,15,20,25,30,40,50,60,75,90,100,basis.otbasyShare])].map(share=>{
    const model={...basis,otbasyShare:share};
    const estimate=forecast(d,goal,date,model);
    const end=estimate.deadline;
    const coverage=!!end&&end.deficit===0&&end.op>=goal.score+goal.buffer&&!!estimate.reached&&estimate.reached<=goal.date&&end.liquid>=0;
    return {share,model,estimate,end,coverage};
  });
  candidates.sort((a,b)=>{
    if(a.coverage!==b.coverage)return Number(b.coverage)-Number(a.coverage);
    if(a.coverage)return (b.end?.capital??0)-(a.end?.capital??0)||a.share-b.share;
    return (a.end?.deficit??0)-(b.end?.deficit??0)||
      Math.max(0,goal.score+goal.buffer-(a.end?.op??0))-Math.max(0,goal.score+goal.buffer-(b.end?.op??0))||
      (b.end?.capital??0)-(a.end?.capital??0);
  });
  return candidates[0];
}

export function marketBasis(account:Account,entries:Entry[]){
  let total=account.opening, basis=account.basis;
  for(const entry of entries.filter(e=>!e.openingBalanceIncluded).sort((a,b)=>a.date.localeCompare(b.date))){
    if(entry.kind==='sale'&&entry.from===account.id&&total>0){
      basis-=Math.round(basis*Math.min(total,entry.sold)/total);
      total-=entry.sold;
    }else if(entry.kind==='valuation'){
      if(entry.to===account.id)total+=entry.amount;
      if(entry.from===account.id)total-=entry.amount;
    }
  }
  return basis;
}
