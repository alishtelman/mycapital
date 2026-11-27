import {trimPaymentReserves} from './cashflow.ts';
import {balance,calendar,cash,dailyBudget,debtComparison,effectiveDebt,first,forecast,goalPurpose,goalValue,month,remainingEvent,reserved,schedule,sum,usedReserve,validateEntry,type Data,type Debt,type Entry,type Goal,type Scenario} from './finance.ts';
import {parseInstallments} from './installments.ts';

export function kaspiMode(debt:Debt){
  return debt.kaspiMode??(debt.installments?'aggregate':/kaspi|каспи/i.test(debt.name)&&debt.kind==='installment'?'individual':undefined);
}

export function updateDebtCalendar(data:Data,loan:Debt,date:string){
  const events=calendar(data,month(date,-12),month(date,36)).filter(event=>event.rule===loan.id);
  const current=effectiveDebt(loan,data);
  let debtRoom=current.balance;
  const plans=data.plans.map(plan=>plan.status!=='accepted'?plan:{...plan,items:plan.items.map(item=>{
    if(item.group!=='debt'||item.target!==loan.id)return item;
    const spent=usedReserve(data.transactions,item.id);
    const remaining=Math.min(debtRoom,Math.max(0,item.amount-spent));
    debtRoom-=remaining;
    return {...item,amount:spent+remaining};
  })});
  let next={...data,plans};
  const known=new Set([...events.map(event=>event.id),...schedule(current).map(row=>loan.id+'@'+row.date)]);
  for(const target of new Set(data.plans.filter(plan=>plan.status==='accepted').flatMap(plan=>plan.items.map(item=>item.target)))){
    if(!target.startsWith(loan.id+'@')||known.has(target))continue;
    const canceled={id:target,name:loan.name,date,kind:'expense',status:'canceled',rule:loan.id,amount:0,comment:''} as const;
    next={...next,plans:trimPaymentReserves(next,canceled)};
  }
  for(const event of events){
    if(!reserved(next,event.id)&&!next.events.some(row=>row.id===event.id))continue;
    next={...next,events:[...next.events.filter(row=>row.id!==event.id),event]};
    next={...next,plans:trimPaymentReserves(next,event)};
  }
  return next;
}

export function saveKaspiSchedule(data:Data,{id,name,mode,text,date}:{id:string;name:string;mode:NonNullable<Debt['kaspiMode']>;text:string;date:string}){
  const installments=parseInstallments(text);
  if(!name.trim()||installments.length>600)throw new Error('Укажите название и не более 600 платежей.');
  if(installments[0].date<date)throw new Error('Укажите только оставшиеся платежи с сегодняшней даты.');
  const existing=data.debts.find(loan=>loan.id===id);
  if(existing&&existing.kind!=='installment')throw new Error('График Kaspi можно сохранить только для рассрочки.');
  const active=data.debts.filter(loan=>loan.id!==id&&kaspiMode(loan)&&effectiveDebt(loan,data).balance>0);
  if(active.some(loan=>kaspiMode(loan)!==mode)||(mode==='aggregate'&&active.length))throw new Error(
    'Действующие рассрочки Kaspi уже учитываются в другом графике. Выберите тот же режим или исправьте существующий график.');
  const accountedPayments=existing?data.transactions.filter(t=>t.kind==='expense'&&!t.openingBalanceIncluded&&
    (t.category===id||t.event.startsWith(id+'@')||data.events.some(event=>event.id===t.event&&event.rule===id))).map(t=>t.id):[];
  if(installments.some(row=>data.events.some(event=>event.id===id+'@'+row.date&&remainingEvent(event,data.transactions)===0&&event.status!=='canceled'))){
    throw new Error('В графике есть дата уже закрытого платежа. Оставьте только непогашенные суммы.');
  }
  const total=sum(installments.map(row=>row.amount));
  if(!Number.isSafeInteger(total))throw new Error('Проверьте итоговую сумму графика.');
  const loan:Debt={id,name,kind:'installment',balance:total,payment:installments[0].amount,date:installments[0].date,
    rate:0,apr:0,original:existing?.original??total,confirmed:true,installments,kaspiMode:mode,accountedPayments};
  const overrides=data.events.map(event=>event.status==='canceled'&&installments.some(row=>event.id===id+'@'+row.date)?
    {...event,status:'planned' as const}:event);
  return updateDebtCalendar({...data,events:overrides,debts:[...data.debts.filter(row=>row.id!==id),loan]},loan,date);
}

export function prepaymentEntry(data:Data,loan:Debt,date:string,id:string){
  const amount=effectiveDebt(loan,data).balance;
  const funds=data.accounts.filter(a=>a.kind==='cash').sort((a,b)=>balance(b,data.transactions)-balance(a,data.transactions));
  const cushionAccount=funds.find(account=>account.goalPurpose==='cushion'&&account.goalIncluded!==false);
  const from=funds.find(account=>account.id!==cushionAccount?.id&&account.goalPurpose!=='cushion')?.id??'';
  return {id,name:'Досрочно · '+loan.name,date,kind:'expense',amount,from,to:'',category:loan.id,event:'',reservation:'',sold:0} satisfies Entry;
}

export function applyDebtPrepayment(data:Data,loan:Debt,entry:Entry){
  return updateDebtCalendar({...data,transactions:[...data.transactions.filter(row=>row.id!==entry.id),entry]},loan,entry.date);
}

export function comparePrepayment(data:Data,original:Debt,date:string,goal?:Goal,scenario?:Scenario){
  const loan=effectiveDebt(original,data);
  const entry=prepaymentEntry(data,original,date,'prepayment-preview');
  const deposits=data.accounts.filter(a=>a.kind==='bcc'&&(a.liquidity==='liquid'||a.maturity>=date));
  const rate=Math.max(0,...deposits.map(a=>a.rate));
  const comparison=debtComparison(loan,rate,date);
  const table=schedule(loan);
  const monthly=Map.groupBy(table,payment=>first(payment.date));
  const relief=[...monthly].map(([period,rows])=>({period,amount:sum(rows.map(row=>row.amount))}));
  const simulated=applyDebtPrepayment(data,original,entry);
  const valid=entry.amount>0&&entry.from&&validateEntry(simulated,entry)==='';
  const free=Math.max(0,cash(data)-reserved(data));
  const released=Math.max(0,reserved(data)-reserved(simulated));
  const safety=dailyBudget(data,date).save;
  const after=dailyBudget(simulated,date);
  const cushion=sum(data.accounts.filter(a=>goalPurpose(a)==='cushion'&&(a.kind==='cash'||a.kind==='reserve'||a.kind==='bcc'&&a.liquidity==='liquid'))
    .map(a=>goalValue(a,data.transactions)));
  const baseline=goal?forecast(data,goal,date,scenario,{}):null;
  const alternative=valid&&goal?forecast(simulated,goal,date,scenario,{}):null;
  const protectsGoal=!goal||!!alternative&&(!baseline?.reached||!!alternative.reached&&alternative.reached<=baseline.reached)&&
    (alternative.deadline?.deficit??Infinity)<=(baseline?.deadline?.deficit??Infinity)&&
    (alternative.deadline?.op??0)>=(baseline?.deadline?.op??0);
  const forecastGap=!!goal&&!!alternative?.rows.some(row=>row.date<=goal.latest&&row.cashFloor<0);
  const preservesLiquidity=Boolean(valid)&&entry.amount<=Math.min(free,safety)+released&&after.shortage===0&&!forecastGap;
  const preservesCushion=!!goal&&cushion>=goal.reserve;
  const favorable=comparison.net>0&&preservesLiquidity&&preservesCushion&&protectsGoal;
  return {entry,comparison,relief,preservesLiquidity,preservesCushion,protectsGoal,favorable,baseline,alternative};
}

export function linkedDebtExpense(data:Data,entry:Entry){
  if(entry.kind!=='expense'||entry.openingBalanceIncluded)return;
  return data.debts.find(loan=>loan.id===entry.category||entry.event.startsWith(loan.id+'@')||
    data.events.some(event=>event.id===entry.event&&event.rule===loan.id));
}
