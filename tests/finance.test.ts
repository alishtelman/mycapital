import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {allocation,balance,bonus,calendar,cash,categoryBudget,categorySpent,debtComparison,depositYield,effectiveDebt,empty,forecast,goalHoldings,livingReserve,releaseLiving,remainingEvent,reserved,schedule,score,sum,today,validateEntry,type Data,type Entry} from '../lib/finance.ts';

import {parseInstallments} from '../lib/installments.ts';

const sample=():Data=>JSON.parse(readFileSync(new URL('../lib/demo.json',import.meta.url),'utf8'));
const date='2026-11-27';
const create=(extra:Partial<Entry>):Entry=>({id:'new',name:'Тестовая операция',date:today(),kind:'expense',amount:100,from:'cash',to:'',event:'',category:'',reservation:'',sold:0,...extra});
const dec=(d:Data)=>calendar(d,'2026-12-01','2026-12-31');

test('зарплата состоит из двух выплат',()=>{
  const salaries=dec(sample()).filter(e=>e.kind==='income');
  assert.deepEqual(salaries.map(e=>e.date),['2026-12-01','2026-12-16']);
  assert.equal(sum(salaries.map(e=>e.amount)),90_500_000);
});
test('аванс ниже плана оставляет к получению только разницу',()=>{
  const d=sample();
  const e=dec(d).find(x=>x.rule==='advance')!;
  d.transactions.push(create({kind:'income',amount:e.amount-100,from:'',to:'cash',event:e.id}));
  assert.equal(remainingEvent({...e,status:'partial'},d.transactions),100);
  assert.equal(cash(d),58_139_900);
});
test('перенос премии на раннюю дату оставляет одно событие',()=>{
  const d=sample();
  const e=calendar(d,'2027-01-01','2027-01-31').find(e=>e.rule==='quarter')!;
  d.events.push({...e,date:'2027-01-10',status:'moved'});
  assert.deepEqual(calendar(d,'2027-01-01','2027-01-31').filter(x=>x.rule==='quarter').map(x=>x.date),['2027-01-10']);
});
test('отменённое дежурство отсутствует в ожидаемом доходе',()=>{
  const d=sample();
  d.events.push({id:'duty',date:'2026-12-10',kind:'income',name:'Дежурства',rule:'',comment:'',amount:22500000,status:'canceled'});
  assert.equal(remainingEvent(d.events[0],[]),0);
});
test('покупка 180 000 ₸ учитывается один раз и повышает расходы прогноза',()=>{
  const a=sample(),b=sample();
  a.purchases=[];b.purchases=[{...b.purchases[0],amount:18000000}];
  const x=forecast(a,a.goals[0],date).rows[1], y=forecast(b,b.goals[0],date).rows[1];
  assert.equal(y.expenses-x.expenses,18000000);
});
test('перерасход зависит от факта, а разовая покупка не удваивает расходы категории',()=>{
  const d=sample(), c=d.categories[0];
  d.transactions=[create({category:c.id,date:'2026-11-10',amount:c.budget+50}),create({id:'other',category:c.id,date:'2026-11-11',amount:100,event:'purchase@test'})];
  assert.equal(categorySpent(d,c.id,date)-categoryBudget(d,c,date),50);
});
test('помощник сначала защищает комфортный минимум и расходует весь доступный остаток',()=>{
  const d=sample(), items=allocation(d,date);
  assert.equal(items[0].group,'living');
  assert.equal(sum(items.map(i=>i.amount)),cash(d));
  assert.ok(items.filter(i=>i.group==='living').every(i=>i.amount<=d.categories.find(c=>c.id===i.target)!.minimum));
});
test('полное досрочное погашение закрывает рассрочку',()=>{
  const d=sample(), loan=d.debts[0];
  d.transactions=[create({category:loan.id,amount:loan.balance})];
  assert.equal(effectiveDebt(loan,d).balance,0);
  assert.equal(schedule(effectiveDebt(loan,d)).length,0);
  assert.equal(debtComparison(loan,14).saved,0);
});
test('частичное досрочное погашение снижает будущий платёж при выбранной настройке',()=>{
  const d=sample(),loan=d.debts[0];
  d.transactions=[create({category:loan.id,amount:loan.balance/2,reducePayment:true})];
  assert.equal(effectiveDebt(loan,d).payment,loan.payment/2);
  assert.equal(schedule(effectiveDebt(loan,d))[0].amount,loan.payment/2);
});
test('перевод между депозитами сохраняет капитал',()=>{
  const d=sample();
  const e=create({kind:'transfer',from:'ot',to:'bcc',amount:172300});
  assert.equal(validateEntry(d,e),'');
  assert.equal(sum(d.accounts.map(a=>balance(a,[e]))),sum(d.accounts.map(a=>a.opening)));
});
test('частичная продажа золота добавляет свободные деньги и убирает проданную долю',()=>{
  const d=sample();
  const e=create({kind:'sale',from:'gold',to:'cash',amount:100000,sold:101000});
  assert.equal(validateEntry(d,e),'');
  const gold=d.accounts.find(a=>a.id==='gold')!;
  assert.equal(balance(gold,[e]),gold.opening-101000);
  assert.equal(cash({...d,transactions:[e]})-cash(d),100000);
});
test('эффективная годовая ставка преобразуется в ставку за фактический срок',()=>{
  const principal=80_000_000;
  assert.equal(depositYield(principal,18,365,true),14_400_000);
  assert.equal(depositYield(principal,18,90,true),Math.round(principal*(1.18**(90/365)-1)));
  assert.notEqual(depositYield(principal,18,90,true),depositYield(principal,18,90));
});
test('госпремия исключает уже поощрённую сумму и соблюдает лимит',()=>{
  assert.equal(bonus(1500000,432500,1000000),100000);
  assert.equal(bonus(100_000_000,432500),17_300_000);
  assert.equal(bonus(1000,432500,1000),0);
});
test('увеличение договорной суммы уменьшает расчётный ОП',()=>{
  assert.equal(score(150000,15000000),10);
  assert.equal(score(150000,30000000),5);
});
test('семейный ОП учитывает сумму вознаграждений на общем договоре',()=>{
  assert.equal(score(100000+50000,30000000),5);
  const d=sample();
  d.accounts.find(a=>a.id==='ot2')!.interest=80000;
  assert.ok(forecast(d,d.goals[0],date).rows[0].op>forecast(sample(),d.goals[0],date).rows[0].op);
});
test('задержка премии переносит поступление между месяцами',()=>{
  const d=sample(), g=d.goals[0];
  const base=forecast(d,g,date,d.scenarios[0]).rows;
  const later=forecast(d,g,date,{...d.scenarios[0],bonusDelay:30}).rows;
  assert.equal(base[2].income-later[2].income,59500000);
  assert.equal(later[3].income-base[3].income,59500000);
});
test('помощник выбирает вклад только если он доступен к покупке',()=>{
  const d=sample(), g=d.goals[0];
  g.score=0;g.buffer=0;g.reserve=0;
  const ok=allocation(d,date);
  assert.ok(ok.some(x=>x.group==='bcc'));
  d.accounts.find(a=>a.id==='bcc')!.maturity='2030-01-01';
  const locked=allocation(d,date);
  assert.ok(!locked.some(x=>x.group==='bcc'));
  assert.ok(locked.some(x=>x.group==='free'));
});
test('потеря при досрочном закрытии сравнивается с пониженной номинальной ставкой',()=>{
  const principal=50000000;
  const loss=depositYield(principal,18,45,true)-depositYield(principal,0.1,45);
  assert.ok(loss>0);
  assert.equal(depositYield(principal,18,-10,true),0);
});
test('недостижимая цель возвращает дефицит и пустую дату',()=>{
  const d=sample();d.rules=[];d.accounts=[];d.categories=[];
  const p=forecast(d,d.goals[0],date);
  assert.equal(p.reached,'');
  assert.ok(p.deadline!.deficit>0);
});
test('подтверждение расхода расходует использованный резерв ровно один раз',()=>{
  const d=sample();
  d.plans=[{id:'plan',date,status:'accepted',items:[{id:'part',name:'Аренда',amount:cash(d),target:'',reason:'',group:'bills'}]}];
  const cost=create({amount:100});
  assert.notEqual(validateEntry(d,cost),'');
  const linked={...cost,reservation:'part'};
  assert.equal(validateEntry(d,linked),'');
  const updated={...d,transactions:[linked]};
  assert.equal(cash(updated),reserved(updated));
  assert.equal(allocation(updated,date).length,0);
});
test('пустой профиль сохраняет свободный остаток нулевым',()=>{
  assert.deepEqual(allocation(empty(),date),[]);
});

test('корректировка закрытого резерва сохраняет связь с историей',()=>{
  const d=sample();
  d.plans=[{id:'plan',date,status:'released',items:[{id:'part',name:'Резерв',amount:1000,target:'',reason:'',group:'bills'}]}];
  const entry=create({amount:500,reservation:'part'});
  assert.equal(validateEntry({...d,transactions:[entry]},{...entry,amount:900}),'');
  assert.notEqual(validateEntry(d,entry),'');
});

test('прогноз для середины месяца не включает доход после крайнего срока',()=>{
  const d=sample();
  const goal={...d.goals[0],date:'2026-12-10',latest:'2026-12-31'};
  const result=forecast(d,goal,date);
  assert.equal(result.deadline?.date,goal.date);
  assert.equal(result.deadline?.income,61000000);
  assert.equal(result.latest?.income,29500000);
});

test('прогресс цели учитывает выделенные активы, а взнос исключает рынок, подушку и недоступный вклад',()=>{
  const d=sample();
  const goal=d.goals[0];
  const account=d.accounts[0];
  d.accounts=[
    {...account,id:'cash',kind:'cash',opening:80_000},
    {...account,id:'otbasy',kind:'otbasy',opening:100_000},
    {...account,id:'term',kind:'bcc',liquidity:'term',maturity:'2030-01-01',opening:50_000},
    {...account,id:'cushion',kind:'reserve',opening:20_000},
    {...account,id:'gold',kind:'market',opening:30_000,goalIncluded:true},
    {...account,id:'shares',kind:'market',opening:10_000,goalIncluded:undefined},
  ];
  assert.deepEqual(goalHoldings(d,goal),{otbasy:100_000,bcc:50_000,market:30_000,cushion:20_000,total:200_000,downPaymentFunds:100_000});
});

test('освобождение кошелька на жизнь сохраняет фактический расход и остаток счёта',()=>{
  const d=sample();
  d.transactions=[create({amount:20_000,reservation:'envelope'})];
  d.plans=[{id:'plan',date,status:'accepted',items:[{id:'envelope',target:'food',name:'Продукты',group:'living',reason:'',amount:80_000}]}];
  assert.equal(livingReserve(d,'food'),60_000);
  assert.equal(releaseLiving(d,'food',70_000),null);
  const changed=releaseLiving(d,'food',60_000)!;
  assert.equal(livingReserve(changed,'food'),0);
  assert.equal(changed.plans[0].items[0].amount,20_000);
  assert.equal(cash(changed),cash(d));
  assert.deepEqual(changed.transactions,d.transactions);
});

test('график Kaspi учитывает уменьшающиеся платежи и частичную оплату один раз',()=>{
  const d=sample();
  const installments=parseInstallments('2026-12-05  1 200,50\n2027-01-05; 300');
  assert.deepEqual(installments.map(row=>row.amount),[120_050,30_000]);
  assert.throws(()=>parseInstallments('2026-02-30 100'));
  const debt={id:'kaspi',name:'Kaspi',kind:'installment' as const,balance:150_050,payment:120_050,date:'2026-12-05',rate:0,apr:0,original:150_050,confirmed:true,installments};
  d.debts=[debt];
  const event=dec(d).find(row=>row.rule==='kaspi')!;
  d.events=[{...event,status:'partial'}];
  d.transactions=[create({event:event.id,amount:20_000})];
  const updated=dec(d).find(row=>row.rule==='kaspi')!;
  assert.equal(remainingEvent(updated,d.transactions),100_050);
  assert.deepEqual(schedule(effectiveDebt(debt,d)).map(row=>row.amount),[100_050,30_000]);
  d.transactions.push(create({id:'early',category:debt.id,amount:130_050}));
  assert.equal(effectiveDebt(debt,d).balance,0);
  assert.equal(remainingEvent(dec(d).find(row=>row.rule==='kaspi')!,d.transactions),0);
});

test('запланированная продажа переносит капитал в деньги один раз',()=>{
  const d=sample(), asset=d.accounts.find(a=>a.kind==='market')!, goal=d.goals[0];
  const scenario={...d.scenarios[0],market:100};
  const value=100_000, proceeds=90_000;
  d.settings.plannedSales=[{id:'test-sale',account:asset.id,date,value,proceeds}];
  const before=forecast({...d,settings:{...d.settings,plannedSales:[]}},goal,date,scenario).rows[0];
  const planned=forecast(d,goal,date,scenario).rows[0];
  assert.equal(planned.capital,before.capital-value+proceeds);
  const actual=create({kind:'sale',from:asset.id,to:d.accounts.find(a=>a.kind==='cash')!.id,amount:proceeds,sold:value,date,plannedSale:'test-sale'});
  d.transactions=[actual];
  assert.equal(forecast(d,goal,date,scenario).rows[0].capital,planned.capital);
  assert.match(validateEntry(d,{...actual,id:'duplicate'}),/уже подтверждена/);
});

test('доля счёта и назначение разделяют взнос и подушку без изменения баланса',()=>{
  const d=sample(), goal=d.goals[0], account=d.accounts[0];
  d.accounts=[
    {...account,id:'otbasy',kind:'otbasy',opening:200_000,goalIncluded:true,goalShare:50,goalPurpose:'down'},
    {...account,id:'bcc',kind:'bcc',opening:100_000,goalIncluded:true,goalShare:25,goalPurpose:'cushion',liquidity:'liquid',maturity:''},
    {...account,id:'market',kind:'market',opening:100_000,goalIncluded:true,goalShare:30,goalPurpose:'cushion'},
  ];
  const result=goalHoldings(d,goal);
  assert.equal(result.total,155_000);
  assert.equal(result.downPaymentFunds,100_000);
  assert.equal(result.cushion,25_000);
  assert.equal(sum(d.accounts.map(a=>balance(a,d.transactions))),400_000);
});
