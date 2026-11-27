import {addDays,availableEnvelope,allocation,balance,billNeeds,budgetCuts,calendar,cash,categoryBudget,categorySpent,dailyBudget,days,debtComparison,downPayment,dueDate,effectiveDebt,entryMonth,first,forecast,goalValue,guaranteed,livingReserve,month,payDate,purchaseComfortFloor,releaseLiving,remainingEvent,reserved,sum,uses,usedReserve,type Data,type Entry,type Event} from './finance.ts';

export function cashflow(d:Data,start:string,horizon=90){
  const end=addDays(start,horizon-1);
  const events=calendar(d,month(start,-12),addDays(end,14));
  const byDate=new Map<string,Event[]>();
  for(const e of events){
    if(((e.kind==='expense'||e.kind==='income')&&remainingEvent(e,d.transactions)===0)||
      e.status==='canceled'||e.status==='received'||e.status==='settled_before_tracking'||(e.date<start&&(e.kind==='income'||e.kind==='notice')))continue;
    const recommended=e.kind==='expense'&&!e.id.startsWith('purchase@')?payDate(d,e,start):e.date;
    const period=first(e.date);
    const scheduled=recommended<period&&d.settings.closings?.[first(recommended)]?period:recommended;
    const effective=scheduled<start?start:scheduled;
    if(effective>end)continue;
    byDate.set(effective,[...(byDate.get(effective)??[]),e]);
  }
  let current=cash(d);
  let envelopes=reserved(d);
  let projectedLivingUsed=0;
  const rows: {date:string;income:number;expenses:number;savings:number;available:number;events:Event[];livingReleased:number;cause:string}[]=[];
  for(let i=0;i<horizon;i++){
    const date=addDays(start,i);
    const today=byDate.get(date)??[];
    const sameDayIncome=sum(today.filter(e=>e.kind==='income'&&guaranteed(d,e)).map(e=>remainingEvent(e,d.transactions)));
    const expenses=sum(today.filter(e=>e.kind==='expense').map(e=>remainingEvent(e,d.transactions)));
    const savings=sum(today.filter(e=>e.kind==='saving').map(e=>e.amount));
    const period=first(date);
    const living=d.settings.closings?.[period]?0:sum(d.categories.map(c=>{
      const budget=categoryBudget(d,c,date);
      const spent=categorySpent(d,c.id,date);
      const dayIndex=days(period,date);
      const monthLength=days(period,month(period,1));
      const daysAfterStart=days(start>period?start:period,date);
      const priorProjection=Math.floor(budget*dayIndex/monthLength)-Math.floor(budget*(dayIndex-daysAfterStart)/monthLength);
      const daily=Math.floor(budget*(dayIndex+1)/monthLength)-Math.floor(budget*dayIndex/monthLength);
      return Math.max(0,Math.min(daily,budget-spent-priorProjection));
    }));
    const released=sum(today.map(e=>e.kind==='expense'?Math.min(reserved(d,e.id),remainingEvent(e,d.transactions)):e.kind==='saving'?e.amount:0));
    const eligibleLiving=livingReserve(d,undefined,date);
    const lifeRelease=Math.min(living,Math.max(0,eligibleLiving-projectedLivingUsed));
    projectedLivingUsed+=lifeRelease;
    const beforeIncome=current-expenses-savings-living;
    current=beforeIncome+sameDayIncome;
    envelopes=Math.max(0,envelopes-released-lifeRelease);
    rows.push({date,income:sameDayIncome,expenses,savings,available:current-envelopes,events:today,
      livingReleased:lifeRelease,cause:beforeIncome<0?(today.find(e=>e.kind==='expense')?.name??'Бюджет на жизнь и ранее назначенные платежи'):''});
  }
  return rows;
}

export function closedPeriodAvailability(d:Data,date:string){
  const end=month(first(date),1);
  const obligations=calendar(d,month(date,-12),end).filter(e=>e.kind==='expense'&&dueDate(e)<end)
    .map(event=>({event,missing:Math.max(0,remainingEvent(event,d.transactions)-reserved(d,event.id))}))
    .filter(row=>row.missing>0);
  const required=sum(obligations.map(row=>row.missing));
  const free=Math.max(0,cash(d)-reserved(d));
  return {obligations,required,available:Math.max(0,free-required),shortage:Math.max(0,required-free)};
}

export function paymentState(d:Data,e:Event,date:string){
  const actual=sum(d.transactions.filter(t=>t.event===e.id&&t.kind==='expense'&&!t.openingBalanceIncluded).map(t=>t.amount));
  const remaining=remainingEvent(e,d.transactions);
  const held=Math.min(remaining,reserved(d,e.id));
  const label=e.status==='canceled'?'Отменён':e.status==='settled_before_tracking'?'Оплачено до начала учёта':!remaining?'Оплачен':actual?(dueDate(e)<date?'Частично оплачен · остаток просрочен':'Частично оплачен'):dueDate(e)<date?'Просрочен':
    held>=remaining?'Полностью зарезервирован':held?'Частично зарезервирован':e.status==='moved'?'Перенесён':e.date<=date?'Не обеспечен деньгами':'Запланирован';
  return {actual,remaining,held,missing:remaining-held,label,recommended:payDate(d,e,date)};
}

export function withPaymentReserves(d:Data,entry:Entry,target:string){
  let remaining=entry.amount;
  const items=d.plans.filter(p=>p.status==='accepted').flatMap(p=>p.items).filter(i=>i.target===target&&availableEnvelope(i,entryMonth(entry))&&
    (entry.event?['bills','purchases'].includes(i.group):i.group==='living'));
  const reserveUses=[];
  for(const i of items){
    const draw=Math.min(remaining,Math.max(0,i.amount-usedReserve(d.transactions.filter(t=>t.id!==entry.id),i.id)));
    if(draw){reserveUses.push({id:i.id,amount:draw});remaining-=draw;}
  }
  return {...entry,reservation:'',reserveUses};
}
export function trimPaymentReserves(d:Data,event:Event){
  let needed=remainingEvent(event,d.transactions);
  return d.plans.map(plan=>plan.status!=='accepted'?plan:{...plan,items:plan.items.map(item=>{
    if(item.target!==event.id||!['bills','purchases'].includes(item.group))return item;
    const used=usedReserve(d.transactions,item.id);
    const kept=Math.min(needed,Math.max(0,item.amount-used));
    needed-=kept;
    return {...item,amount:used+kept};
  })});
}

export function closePaidExpense(d:Data,event:Event,date:string):Data{
  const {actual,remaining}=paymentState(d,event,date);
  if(event.kind!=='expense'||!actual||!remaining)return d;
  const completed:Event={...event,status:'received'};
  return {...d,events:[...d.events.filter(e=>e.id!==event.id),completed],plans:trimPaymentReserves(d,completed)};
}

export function detachExpense(d:Data,entry:Entry):Data{
  const old=d.transactions.find(t=>t.id===entry.id);
  const event=d.events.find(e=>e.id===old?.event);
  if(!old||!event||old.kind!=='expense')return d;
  const targets=new Set(d.plans.flatMap(p=>p.items).filter(i=>i.target===event.id&&['bills','purchases'].includes(i.group)).map(i=>i.id));
  const detached=uses(old).filter(link=>targets.has(link.id));
  const preserved=uses(old).filter(link=>!targets.has(link.id));
  const transactions=d.transactions.map(t=>t.id===entry.id?{...entry,event:'',reservation:'',reserveUses:preserved,finalPayment:false}:t);
  const others=transactions.filter(t=>t.event===event.id);
  const paid=sum(others.map(t=>t.amount));
  const updated:Event={...event,status:event.status==='canceled'||event.status==='settled_before_tracking'?event.status:
    paid>=event.amount||others.some(t=>t.finalPayment)?'received':paid?'partial':'planned'};
  const plans=d.plans.map(p=>({...p,items:p.items.map(i=>({...i,amount:i.amount-(detached.find(link=>link.id===i.id)?.amount??0)}))}));
  return {...d,transactions,plans:trimPaymentReserves({...d,transactions,plans},updated),events:d.events.map(e=>e.id===updated.id?updated:e)};
}

export function reminders(d:Data,date:string,clock='23:59'){
  const {needs,purchases,delayed,income}=billNeeds(d,date);
  const upcoming=calendar(d,addDays(date,-7),addDays(date,365));
  const items:{id:string;title:string;detail:string;event?:Event}[]=[];
  const add=(id:string,title:string,detail:string,event?:Event)=>{
    const state=d.settings.notifications?.[id];
    if(!state?.read&&(!state?.until||state.until<=date))items.push({id,title,detail,event});
  };
  for(const e of [...new Map([...upcoming,...needs.map(x=>x.event),...purchases.map(x=>x.event)].map(e=>[e.id,e])).values()]){
    if(e.status==='received'||e.status==='settled_before_tracking'||e.status==='canceled'||e.kind==='saving')continue;
    if(e.kind==='expense'){
      const p=paymentState(d,e,date), until=days(date,dueDate(e));
      const interval=[...(e.payment?.reminders??[7,3,1,0])].sort((a,b)=>a-b).find(n=>n>=until);
      if(p.remaining&&(until<0||(interval!==undefined&&(interval>until||clock>=(d.settings.reminderTime??'09:00')))))
        add(e.id+':'+(until<0?'late':interval)+':'+p.label,e.name,p.label+' · срок '+dueDate(e),e);
    }
    if(e.kind==='income'&&e.date>=date&&days(date,e.date)<=3)add(e.id+':expected',e.name,'Ожидаемое поступление',e);
    if(e.kind==='income'&&e.date<date)add(e.id+':unconfirmed',e.name,'Поступление ожидает подтверждения',e);
    if(e.kind==='notice'&&e.date>=date&&days(date,e.date)<=7)add(e.id,e.name,'Событие приближается',e);
  }
  if(delayed)add('delay:'+first(date),'Проверьте поступления','Часть ожидаемых денег пока не подтверждена.',income);
  for(const c of d.categories){
    if(categorySpent(d,c.id,date)>categoryBudget(d,c,date))add(c.id+':'+first(date),'Перерасход · '+c.name,'Откройте бюджет для перераспределения.');
  }
  for(const debt of d.debts){
    const current=effectiveDebt(debt,d);
    if(current.balance>0&&current.balance<=current.payment&&current.date>=date&&days(date,current.date)<=7)
      add(debt.id+':last:'+current.date,debt.name,'Приближается последний платёж.');
  }
  const goal=d.goals.find(g=>!g.completed);
  if(goal&&date.slice(-2)==='01')add('op:'+first(date),'Проверьте оценочный показатель','Сверьте фактический ОП с приложением Отбасы.');
  for(const plan of d.plans.filter(p=>p.status==='accepted'&&days(p.date,date)>=7)){
    for(const item of plan.items.filter(i=>i.group==='otbasy'&&i.amount>usedReserve(d.transactions,i.id)))add(item.id+':topup',item.name,'Запланированное пополнение ещё ожидает подтверждения.');
  }
  return items;
}

export function purchaseOptions(d:Data,date:string,price:number,purchaseDate=date,existing?:string){
  const goal=d.goals.find(g=>!g.completed);
  const base=goal?forecast(d,goal,date).reached:'';
  const exempt=existing?'purchase@'+existing:'';
  const current=existing?d.purchases.find(p=>p.id===existing):undefined;
  const id=existing??'assessment';
  return [0,.5,1].map((factor,index)=>{
    const key=first(purchaseDate);
    const {changes}=budgetCuts(d,purchaseDate,price,'',true);
    const budgets={...d.settings.monthly?.[key]};
    for(const change of changes)budgets[change.category.id]=categoryBudget(d,change.category,purchaseDate)-Math.floor(change.amount*factor);
    const adjusted={...d,settings:{...d.settings,monthly:{...d.settings.monthly,[key]:budgets}}};
    const bill=dailyBudget(adjusted,date);
    const withPurchase:Data={...adjusted,events:d.events.map(e=>e.id===exempt?{...e,date:purchaseDate,amount:price}:e),purchases:[...d.purchases.filter(p=>p.id!==id),{
      id,name:current?.name??'Незапланированная покупка',date:purchaseDate,amount:price,minimum:0,maximum:price,
      rank:current?.rank??1,required:current?.required??false,movable:true,staged:false,category:'',status:'planned',comment:''
    }]};
    const cuts=changes.filter(x=>factor&&Math.floor(x.amount*factor)>0).map(x=>({...x,amount:Math.floor(x.amount*factor)}));
    const plannedAmount=existing?billNeeds(adjusted,date).purchases.find(x=>x.event.id===exempt)?.amount??0:0;
    const funding=bill.save+plannedAmount+reserved(d,exempt||'assessment');
    const buyingToday=purchaseDate===date;
    let redistributed=withPurchase;
    const walletMoves=[];
    let gap=buyingToday&&bill.free>=bill.obligations+bill.planned?Math.ceil(Math.max(0,price-funding)*factor):0;
    for(const category of [...d.categories].filter(c=>c.flexible).sort((a,b)=>b.rank-a.rank)){
      const comfort=Math.max(0,purchaseComfortFloor(category,categoryBudget(d,category,date))-categorySpent(d,category.id,date));
      const available=livingReserve(d,category.id,date);
      const amount=Math.min(gap,Math.max(0,available-comfort));
      if(!amount)continue;
      const released=releaseLiving(redistributed,category.id,amount,date);
      if(!released)continue;
      redistributed=released;
      walletMoves.push({category,amount});
      gap-=amount;
    }
    const projected=goal?forecast(redistributed,goal,date).reached:'';
    const proposal=buyingToday?allocation(redistributed,date).filter(i=>['otbasy','bcc','reserve','debt'].includes(i.group)):[];
    return {label:['Комфортный','Сбалансированный','Приоритет накоплений'][index],cuts,walletMoves,budgets,data:redistributed,base,projected,
      delay:base&&projected?days(base,projected):null,shortfall:buyingToday?Math.max(0,price-funding-sum(walletMoves.map(move=>move.amount))):null,proposal};

  });
}

export function monthlyReport(d:Data,period:string){
  const start=first(period),end=month(start,1);
  const tx=d.transactions.filter(e=>entryMonth(e)===start);
  const savings=new Set(d.accounts.filter(a=>a.kind==='reserve'||a.kind==='bcc'||a.kind==='otbasy').map(a=>a.id));
  const before=d.transactions.filter(e=>e.date<start);
  const after=d.transactions.filter(e=>e.date<end);
  const snapshot=d.settings.closings?.[start];
  const previous=d.settings.closings?.[month(start,-1)];
  const goal=d.goals.find(g=>!g.completed);
  const goalBalance=(entries:Entry[])=>sum(d.accounts.map(a=>goalValue(a,entries)));
  const goalGap=goal?Math.max(0,downPayment(goal)+goal.reserve-goalBalance(after)):null;
  const goalProgress=goal&&goalGap!==null?Math.max(0,downPayment(goal)+goal.reserve-goalBalance(before))-goalGap:null;
  return {partial:!!d.settings.partialMonths?.[start],goalGap,goalProgress,income:sum(tx.filter(t=>t.kind==='income').map(t=>t.amount)),expenses:sum(tx.filter(t=>t.kind==='expense').map(t=>t.amount)),
    saved:sum(tx.filter(t=>t.kind==='transfer').map(t=>(savings.has(t.to)?t.amount:0)-(savings.has(t.from)?t.amount:0))),
    growth:sum(d.accounts.filter(a=>savings.has(a.id)).map(a=>balance(a,after)-balance(a,before))),
    scoreDelta:snapshot?.score!==undefined&&previous?.score!==undefined?snapshot.score-previous.score:null,
    interest:snapshot?.interest??null,
    surplus:d.categories.map(c=>({id:c.id,amount:Math.max(0,categoryBudget(d,c,start)-categorySpent(d,c.id,start))})),snapshot};
}

export function nextDebt(d:Data){
  const deposit=Math.max(0,...d.accounts.filter(a=>a.kind==='bcc').map(a=>a.rate));
  return d.debts.filter(l=>l.kind==='installment').map(l=>effectiveDebt(l,d)).filter(l=>l.balance>0&&l.confirmed)
    .map(loan=>({loan,comparison:debtComparison(loan,deposit)}))
    .filter(x=>x.comparison.months>0).sort((a,b)=>b.comparison.net-a.comparison.net||a.loan.balance-b.loan.balance);
}
