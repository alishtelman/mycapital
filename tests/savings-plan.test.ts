import assert from 'node:assert/strict';
import {test} from 'node:test';
import {downPayment,empty,forecast,loanScore,nextBccMaturity,optimizeSavings,type Account,type Data,type Goal,type Scenario} from '../lib/finance.ts';
import {monthlySavingsRows,savingsActions,savingsCorrections,savingsSensitivity} from '../lib/savings-plan.ts';

const tenge=(value:number)=>value*100;
const today='2026-12-01';
const goal:Goal={id:'home',name:'Квартира',price:tenge(16_000_000),down:50,reserve:tenge(1_000_000),date:'2027-08-31',latest:'2027-09-30',score:5,buffer:.15,
  laterScore:16,rentMin:0,rentMax:0,rate:0,laterRate:0,completed:false,intermediate:true};
const scenario:Scenario={id:'base',name:'Базовый',income:100,expenses:100,rates:100,market:100,price:100,bonusDelay:0,otbasyShare:0};
const account=(id:string,kind:Account['kind'],opening:number,attrs:Partial<Account>={}):Account=>({
  id,name:id,kind,opening:tenge(opening),owner:id,rate:0,basis:0,maturity:'',contract:0,futureContract:0,score:0,interest:0,eligible:0,awarded:0,
  fee:0,earlyRate:0,opened:'',rollover:false,...attrs,
});
function fixture():Data{
  const d=empty();
  d.accounts=[
    account('cash','cash',700_000),account('ot','otbasy',2_000_000,{rate:2,contract:tenge(16_000_000),interest:tenge(30_000)}),
    account('wife','otbasy',300_000,{rate:2,contract:tenge(1_000_000),opened:'2026-05-01'}),
    account('bcc','bcc',1_000_000,{rate:16,nominal:15,liquidity:'liquid'}),account('reserve','reserve',500_000),
  ];
  d.rules=[
    {id:'salary',name:'Зарплата с дежурствами',kind:'income',amount:tenge(1_000_000),date:today,repeat:'monthly',active:true},
    {id:'advance',name:'Аванс',kind:'income',amount:tenge(250_000),date:'2026-12-16',repeat:'monthly',active:true},
    {id:'bonus13',name:'13-я зарплата',kind:'income',amount:tenge(400_000),date:'2026-12-25',repeat:'once',active:true},
    {id:'quarter',name:'Квартальная премия',kind:'income',amount:tenge(100_000),date:'2026-12-24',repeat:'quarterly',active:true},
    {id:'bill',name:'Обязательный платёж',kind:'expense',amount:tenge(300_000),date:'2026-12-05',repeat:'monthly',active:true},
  ];
  d.categories=[{id:'life',name:'Жизнь',budget:tenge(220_000),minimum:tenge(180_000),maximum:tenge(300_000),rank:1,flexible:true}];
  d.purchases=[{id:'purchase',name:'Покупка',date:'2027-01-10',amount:tenge(100_000),minimum:0,maximum:tenge(100_000),rank:1,required:true,movable:false,staged:false,category:'',status:'planned',comment:''}];
  d.debts=[{id:'loan',name:'Рассрочка',kind:'installment',balance:tenge(100_000),payment:tenge(50_000),date:'2026-12-20',rate:0,apr:0,original:tenge(100_000),confirmed:true}];
  return d;
}

test('подбор сравнивает варианты и оставляет часть накоплений на более доходном вкладе',()=>{
  const d=fixture();
  const plan=optimizeSavings(d,goal,today,scenario);
  assert.ok(plan.candidates.length>=3);
  assert.ok(plan.candidates.some(row=>!row.coverage));
  assert.ok(plan.coverage,JSON.stringify({share:plan.share,opGap:plan.opGap,liquidity:plan.liquidity,deficit:plan.end?.deficit}));
  assert.ok(plan.end!.op>=loanScore(goal)+goal.buffer);
  assert.equal(plan.end!.deficit,0);
  assert.equal(plan.liquidity,0);
  assert.ok(plan.estimate.deposits.some(row=>row.account==='bcc'&&row.amount>0));
  assert.ok(plan.estimate.deposits.some(row=>row.account==='ot'&&row.amount>0));
  assert.ok(plan.candidates.filter(row=>row.coverage).every(row=>plan.contribution<=row.contribution));
  const rows=monthlySavingsRows(d,plan,goal.latest);
  assert.equal(rows[0].opening,tenge(4_500_000));
  assert.equal(rows[0].income,tenge(1_750_000));
  assert.equal(rows[0].expenses,tenge(570_000));
  assert.equal(rows[1].expenses,tenge(670_000));
  assert.equal(rows[1].opening,rows[0].capital);
  assert.ok(rows[1].interest>0);
});

test('неподтверждённые премии исключены, подтверждённые условия дают отдельную оценку для обоих владельцев',()=>{
  const d=fixture();
  d.settings.mrp['2026']=tenge(4_000);
  d.bonuses=d.accounts.filter(a=>a.kind==='otbasy').map(a=>({id:a.id,account:a.id,year:2026,date:'2027-03-01',
    eligible:tenge(800_000),credited:0,actual:0}));
  const safe=forecast(d,goal,today,scenario,{});
  assert.equal(safe.deadline?.bonus,0);
  assert.equal(savingsSensitivity(d,goal,today,scenario).verifiedBonus?.bonus,0);
  d.bonuses=d.bonuses.map(b=>({...b,eligibilityConfirmed:true}));
  assert.equal(savingsSensitivity(d,goal,today,scenario).verifiedBonus?.bonus,tenge(320_000));
  assert.equal(forecast(d,goal,today,scenario,{}).deadline?.bonus,0);
  d.bonuses[0].actual=tenge(150_000);
  assert.equal(forecast(d,goal,today,scenario,{}).deadline?.bonus,tenge(150_000));
});

test('более поздний срочный вклад блокируется, план продажи остаётся оценкой',()=>{
  const d=fixture();
  d.accounts[3]={...d.accounts[3],liquidity:'term',maturity:'2027-10-01',termMonths:3};
  d.accounts.push(account('gold','market',1_000_000,{goalIncluded:true}));
  d.settings.plannedSales=[{id:'sale',account:'gold',date:'2027-03-01',value:tenge(1_000_000),proceeds:tenge(950_000)}];
  const plan=optimizeSavings(d,goal,today,scenario);
  assert.equal(plan.end?.availableBcc,0);
  assert.ok(!plan.estimate.deposits.some(row=>row.account==='bcc'));
  assert.equal(monthlySavingsRows(d,plan,goal.latest).find(row=>row.period==='2027-03-01')?.sale,tenge(950_000));
  assert.equal(forecast(d,goal,today,{...scenario,market:80},{}).rows.find(row=>row.date==='2027-03-31')?.saleIncome,tenge(760_000));
  assert.equal(forecast(d,goal,today,scenario,{excludeSales:true}).rows.some(r=>r.saleIncome>0),false);
  assert.equal(nextBccMaturity({...d.accounts[3],rollover:true,maturity:'2026-08-15'},today),'2027-02-15');
  const tasks=savingsActions(d,goal,today,plan);
  assert.ok(tasks.some(t=>t.id==='sale:sale'));
  assert.ok(tasks.some(t=>t.id.startsWith('maturity:bcc')));
  assert.ok(tasks.some(t=>t.id.startsWith('approval:')));
});

test('покупка до дохода оставляет кассовый разрыв, а слишком дорогая цель даёт измеримые поправки',()=>{
  const d=fixture();
  d.accounts[0].opening=0;
  d.accounts[3].liquidity='term';d.accounts[3].maturity='2027-12-01';
  d.rules[0].date='2026-12-11';
  const plan=optimizeSavings(d,{...goal,price:tenge(40_000_000)},today,scenario);
  assert.equal(plan.coverage,false);
  assert.ok(plan.liquidity>=tenge(300_000));
  const gaps=savingsCorrections(d,{...goal,price:tenge(40_000_000)},today,plan);
  assert.ok(gaps&&gaps.cashDeficit>0&&gaps.monthlyLowerBound>0);
  assert.equal(downPayment({...goal,down:30}),tenge(8_000_000));
  assert.equal(loanScore({...goal,score:4}),5);
});

test('проверенная база госпремии супруги получает приоритет в пределах доли Отбасы',()=>{
  const d=fixture();
  d.settings.mrp['2026']=tenge(4_000);
  d.bonuses=[{id:'wife-award',account:'wife',year:2026,date:'2027-03-01',eligible:tenge(600_000),credited:0,actual:0,eligibilityConfirmed:true}];
  const estimate=forecast(d,goal,today,{...scenario,otbasyShare:50},{});
  const wife=estimate.deposits.find(row=>row.account==='wife');
  assert.equal(wife?.amount,tenge(200_000));
  assert.match(wife?.reason??'',/госпремии/);
  assert.equal(estimate.deadline?.bonus,0);
  const deposits=estimate.deposits.filter(row=>row.date===today);
  assert.ok(deposits.some(row=>row.account==='bcc'&&row.amount>0));
});

test('вклад с неизвестным сроком и доступностью не финансирует взнос',()=>{
  const d=fixture();
  d.accounts[3].liquidity=undefined;
  const result=forecast(d,goal,today,scenario,{});
  assert.equal(result.deadline?.availableBcc,0);
  assert.ok(!result.deposits.some(row=>row.account==='bcc'));
});

test('рассчитанная ежемесячная поправка заново проходит проверки на взнос, подушку, ОП и ликвидность',()=>{
  const d=fixture();
  const expensive={...goal,price:tenge(28_000_000)};
  const plan=optimizeSavings(d,expensive,today,scenario);
  assert.equal(plan.coverage,false);
  const amount=savingsCorrections(d,expensive,today,plan)?.additionalMonthly;
  assert.ok(amount&&amount>0);
  const model={...plan.model,otbasyShare:90};
  const ready=forecast(d,expensive,today,model,{monthlyExtra:amount,endDate:'2027-09-01'});
  assert.equal(ready.deadline?.deficit,0);
  assert.ok(ready.deadline!.op>=loanScore(expensive)+expensive.buffer);
  assert.ok(ready.rows.every(row=>row.cashFloor>=0));
  const below=forecast(d,expensive,today,model,{monthlyExtra:amount-100_000,endDate:'2027-09-01'});
  assert.ok(below.deadline!.deficit>0||below.deadline!.op<loanScore(expensive)+expensive.buffer||below.rows.some(row=>row.cashFloor<0));
});


test('принятое пополнение после досрочного закрытия месяца переносится в прогноз один раз',()=>{
  const d=fixture();
  d.accounts.push(account('priority','bcc',0,{rate:6,liquidity:'liquid'}));
  d.settings.closings={'2026-11-01':{date:'2026-11-28'}};
  d.plans=[{id:'held',date:'2026-11-28',status:'accepted',items:[
    {id:'priority-item',target:'priority',name:'Мой план',group:'bcc',amount:tenge(100_000),reason:''},
  ]}];
  const result=forecast(d,goal,'2026-11-28',scenario,{});
  assert.deepEqual(result.deposits.filter(row=>row.account==='priority').map(row=>[row.date,row.amount]),[['2026-12-01',tenge(100_000)]]);
});
