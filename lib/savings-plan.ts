import {addDays,balance,debtComparison,effectiveDebt,entryMonth,first,forecast,goalPurpose,governmentAwards,loanScore,month,nextBccMaturity,optimizeSavings,otbasyYield,sum,type Data,type Goal,type Scenario} from './finance.ts';

export type SavingsOptimization=ReturnType<typeof optimizeSavings>;

export function monthlySavingsRows(data:Data,optimized:SavingsOptimization,until:string){
  const prediction=optimized.estimate;
  const rows=[];
  let opening=prediction.startingCapital,interest=0,bonus=0;
  const periods=Map.groupBy(prediction.rows.filter(row=>first(row.date)<=first(until)),row=>first(row.date));
  for(const [period,parts] of periods){
    const end=parts.at(-1)!;
    const actual=data.transactions.filter(entry=>entryMonth(entry)===period);
    const planned=prediction.deposits.filter(deposit=>first(deposit.date)===period);
    const deposits=[...data.accounts.filter(a=>['otbasy','bcc','reserve'].includes(a.kind)||a.kind==='cash'&&goalPurpose(a)==='cushion').map(a=>({id:a.id,name:a.name})),...(planned.some(row=>!row.account)?[{id:'',name:'Финансовая подушка'}]:[])]
      .flatMap(account=>{
        const deposits=planned.filter(row=>row.account===account.id);
        const funded=sum(actual.filter(t=>t.kind==='transfer'&&t.to===account.id).map(t=>t.amount));
        const amount=sum(deposits.map(row=>row.amount));
        return [{...account,amount,funded,reason:[...new Set(deposits.map(row=>row.reason).filter(Boolean))].join(' · ')}];
      });
    rows.push({period,opening,income:sum(parts.map(row=>row.income)),expenses:sum(parts.map(row=>row.expenses)),
      actualIncome:sum(actual.filter(row=>row.kind==='income').map(row=>row.amount)),
      actualExpenses:sum(actual.filter(row=>row.kind==='expense').map(row=>row.amount)),
      sale:sum(parts.map(row=>row.saleIncome)),interest:end.interest-interest,bonus:end.bonus-bonus,
      op:end.op,savings:end.savings,capital:end.capital,deposits});
    opening=end.capital;
    interest=end.interest;
    bonus=end.bonus;
  }
  return rows;
}

export function savingsActions(data:Data,goal:Goal,start:string,optimized:SavingsOptimization){
  const target=optimized.estimate.reached||goal.latest;
  const before=(date:string)=>date<start?start:date;
  const tasks:{id:string;name:string;date:string;detail:string;amount?:number}[]=[];
  const ot=data.accounts.filter(a=>a.kind==='otbasy');
  if(ot.filter(a=>a.opened&&a.opened<=start||balance(a,data.transactions)>0).length<2){
    tasks.push({id:'spouse:'+goal.id,name:'Проверить и при необходимости открыть вклад супруги',date:before(start),detail:'Уточнить владельца, дату открытия, право на премию и условия семейного пакета.'});
  }
  for(const account of data.accounts.filter(a=>a.kind==='market'&&balance(a,data.transactions)>0&&a.goalIncluded!==false)){
    const sales=(data.settings.plannedSales??[]).filter(sale=>sale.account===account.id&&sale.date>=start&&!data.transactions.some(t=>t.plannedSale===sale.id));
    if(!sales.length){
      tasks.push({id:'sale:'+account.id,name:'Оценить продажу · '+account.name,date:before(addDays(goal.date,-90)),detail:'Внести дату и ожидаемую выручку после комиссий. Цена продажи может отличаться от оценки.'});
    }
    for(const sale of sales)tasks.push({id:'sale:'+sale.id,name:'Проверить условия продажи · '+account.name,date:sale.date,detail:'Оценка выручки требует подтверждения фактической сделкой.'});
  }
  for(const account of data.accounts.filter(a=>a.kind==='bcc')){
    const maturity=nextBccMaturity(account,start);
    if(maturity>=start)tasks.push({id:'maturity:'+account.id+':'+maturity,name:'Окончание срока · '+account.name,date:maturity,
      detail:account.rollover?'Проверить отключение продления и окно перевода до сделки.':'Сверить проценты и доступную сумму со вкладом.'});
  }
  for(const award of governmentAwards(data).filter(a=>a.date>=start&&a.date<=goal.latest)){
    const account=data.accounts.find(a=>a.id===award.account);
    if(account)tasks.push({id:'bonus:'+award.id,name:'Проверить госпремию · '+account.name,date:award.date,
      detail:award.actual?'Сверить подтверждённую сумму с фактом зачисления.':'Ожидаемая премия зависит от права вкладчика, базы и подтверждения банка.'});
  }
  for(const [period,rows] of Map.groupBy(optimized.estimate.deposits.filter(row=>row.date<=target),row=>first(row.date))){
    if(sum(rows.map(row=>row.amount))>0)tasks.push({id:'fund:'+period,name:'Пополнить счета по плану месяца',date:before(period),detail:'Суммы и назначение каждого перевода указаны в таблице месяца.'});
  }
  const deal=optimized.estimate.rows.find(row=>row.date===optimized.estimate.reached);
  if(deal&&deal.availableBcc>0){
    const down=deal.target-goal.reserve;
    const transfer=Math.min(deal.availableBcc,Math.max(0,down-deal.otbasy-Math.max(0,deal.liquid)));
    if(transfer>0)tasks.push({id:'move:'+goal.id,name:'Перевести доступную часть БЦК в Отбасы',date:deal.date,detail:'Сверить окно снятия, сумму и реквизиты перед переводом.',amount:transfer});
  }
  if(data.debts.some(debt=>debt.kind==='installment'&&effectiveDebt(debt,data).balance>0)){
    const rate=Math.max(0,...data.accounts.filter(a=>a.kind==='bcc').map(a=>a.rate));
    const positive=data.debts.filter(d=>d.kind==='installment'&&d.confirmed).some(debt=>debtComparison(effectiveDebt(debt,data),rate).net>0);
    tasks.push({id:'debt:'+goal.id,name:'Сравнить досрочное погашение рассрочек',date:month(first(start),1),
      detail:positive?'Оценка показывает возможную экономию. Сверить её с банком и сохранить обязательные резервы.':'Сравнить экономию процентов с доходностью вклада и датой покупки.'});
  }
  tasks.push(
    {id:'score:'+goal.id,name:'Проверить ОП и семейный пакет в Отбасы',date:before(addDays(target,-45)),detail:'Сверить договорную сумму и банковский ОП после возможного объединения вкладов.'},
    {id:'approval:'+goal.id,name:'Запросить предварительную оценку платёжеспособности',date:before(addDays(target,-30)),detail:'Банк оценивает доходы, действующие долги и объект. Прогноз приложения не подтверждает одобрение.'},
  );
  return tasks.sort((a,b)=>a.date.localeCompare(b.date));
}

function additionalMonthlyFunding(data:Data,goal:Goal,start:string,optimized:SavingsOptimization){
  if(addDays(goal.date,1)<=month(first(start),start===first(start)?0:1))return null;
  const model={...optimized.model,otbasyShare:90};
  function works(amount:number){
    const prediction=forecast(data,goal,start,model,{monthlyExtra:amount,endDate:addDays(goal.date,1)});
    const row=prediction.deadline;
    return !!row&&row.deficit===0&&row.op>=loanScore(goal)+goal.buffer&&!!prediction.reached&&prediction.rows.every(r=>r.cashFloor>=0);
  }
  let lower=0,upper=Math.ceil(goal.price/100_000);
  if(upper<=0||!works(upper*100_000))return null;
  while(lower<upper){
    const middle=Math.floor((lower+upper)/2);
    if(works(middle*100_000))upper=middle;else lower=middle+1;
  }
  return lower*100_000;
}

export function savingsCorrections(data:Data,goal:Goal,start:string,optimized:SavingsOptimization){
  const deadline=optimized.end;
  if(!deadline)return null;
  const targetOp=loanScore(goal)+goal.buffer;
  const deposits=data.accounts.filter(a=>a.kind==='otbasy'&&a.contract>0);
  const contract=Math.max(0,...deposits.map(a=>a.futureContract||a.contract));
  const rate=Math.max(0,...deposits.map(a=>a.rate))*optimized.model.rates/100;
  const one=otbasyYield(100_000_000,rate,start,goal.date);
  const opGap=Math.max(0,targetOp-deadline.op);
  const earlyOpContribution=one&&contract?Math.ceil((opGap*contract/1000)*100_000_000/one):null;
  const cashDeficit=Math.max(0,deadline.deficit);
  const downPercent=Math.max(goal.down,goal.intermediate?50:0)/100;
  const priceLimit=downPercent&&optimized.model.price>0&&deadline.reserves>=goal.reserve?Math.floor(deadline.availableDown/downPercent*100/optimized.model.price):null;
  const limit=optimized.estimate.latest;
  const firstContribution=start===first(start)?start:month(first(start),1);
  let months=0;
  for(let date=firstContribution;date<=goal.date;date=month(date,1))months++;
  return {cashDeficit,opGap,earlyOpContribution,priceLimit,additionalMonthly:optimized.coverage?null:additionalMonthlyFunding(data,goal,start,optimized),monthlyLowerBound:months?Math.ceil(cashDeficit/months):cashDeficit,
    lateDeficit:limit?.deficit,lateOp:limit?.op,liquidity:optimized.liquidity};
}

export function savingsSensitivity(data:Data,goal:Goal,date:string,model:Scenario){
  return {
    withoutSales:forecast(data,goal,date,model,{excludeSales:true}).deadline,
    verifiedBonus:forecast(data,goal,date,model,{conditionalBonus:true}).deadline,
  };
}
