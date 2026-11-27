import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyDebtPrepayment,comparePrepayment,saveKaspiSchedule} from '../lib/debt-planning.ts';
import {calendar,effectiveDebt,empty,forecast,remainingEvent,reserved,schedule,type Account,type Debt,type Entry,type Event,type Goal} from '../lib/finance.ts';
import {paymentGroups} from '../lib/workspace-view.ts';
import {dataSchema} from '../lib/schema.ts';

const now='2025-11-25';
const cashAccount:Account={id:'cash',name:'Текущий счёт',kind:'cash',owner:'',opening:8_000_000,rate:0,basis:0,maturity:'',contract:0,futureContract:0,score:0,interest:0,eligible:0,awarded:0,fee:0,earlyRate:0,opened:'',rollover:false};
const ready=()=>({...empty(),accounts:[cashAccount]});
const goal:Goal={id:'goal',name:'Квартира',price:300_000_000,down:50,reserve:20_000_000,date:'2026-06-01',latest:'2026-07-01',score:5,buffer:0,laterScore:16,rentMin:0,rentMax:0,rate:0,laterRate:0,completed:false};
const loan:Debt={id:'mortgage',name:'Ипотека',kind:'mortgage',balance:1_200_000,payment:100_000,date:'2025-11-26',rate:5,apr:5,original:1_200_000,confirmed:true};
const tx=(fields:Partial<Entry>={}):Entry=>({id:'paid',name:'Платёж',kind:'expense',date:now,amount:500_000,from:'cash',to:'',event:'',category:'',reservation:'',sold:0,...fields});
const event=(fields:Partial<Event>={}):Event=>({id:'pay',name:'Платёж',kind:'expense',date:now,amount:500_000,status:'planned',rule:'',comment:'',...fields});

test('группы включают просроченные и оплаченные события ровно один раз',()=>{
  const d=ready();
  const events=[event({id:'overdue',date:'2025-10-20'}),event({id:'next',date:'2025-11-26'}),event({id:'same',date:'2025-11-27'}),
    event({id:'paid',date:'2025-11-20'}),event({id:'cancel',status:'canceled'})];
  d.transactions=[tx({event:'paid'})];
  assert.deepEqual(paymentGroups(d,events,'2025-11-01',now,'2025-11-27').map(group=>group.events.map(e=>e.id)),[['overdue'],['next'],['same'],['paid']]);
});

test('общий график Kaspi сохраняет разные суммы, защищает ипотеку и обновляет прогноз',()=>{
  const d=ready();
  d.debts=[loan];
  const data=saveKaspiSchedule(d,{id:'kaspi',name:'Kaspi',date:now,mode:'aggregate',text:'25.12.2025\t35 000\n2026-01-25;19000\n25/02/2026 10000'});
  const debt=data.debts.find(x=>x.id==='kaspi')!;
  assert.equal(data.debts.find(x=>x.id==='mortgage')?.rate,5);
  assert.equal(dataSchema.parse(data).debts[1].kaspiMode,'aggregate');
  assert.equal(debt.balance,6_400_000);
  assert.deepEqual(calendar(data,'2025-12-01','2026-02-28').filter(e=>e.rule===debt.id).map(e=>e.amount),[3_500_000,1_900_000,1_000_000]);
  assert.equal(forecast(data,goal,now).rows.find(r=>r.date==='2025-12-31')!.expenses-forecast(d,goal,now).rows.find(r=>r.date==='2025-12-31')!.expenses,3_500_000);
  assert.throws(()=>saveKaspiSchedule(data,{id:'duplicate',name:'Рассрочка',date:now,mode:'individual',text:'2025-12-25 2000'}),/другом графике/);
  assert.throws(()=>saveKaspiSchedule(data,{id:'mortgage',name:'Ипотека',date:now,mode:'individual',text:'2025-12-25 2000'}),/только для рассрочки/);
});

test('отдельные каспи-рассрочки можно хранить одновременно, пересохраняя только непогашенный остаток',()=>{
  const first=saveKaspiSchedule(ready(),{id:'phone',name:'Телефон',date:now,mode:'individual',text:'2025-12-25 4000\n2026-01-25 2000'});
  const second=saveKaspiSchedule(first,{id:'computer',name:'Ноутбук',date:now,mode:'individual',text:'2025-12-25 3000'});
  second.events=[event({id:'phone@2025-12-25',rule:'phone',date:'2025-12-25',amount:400_000,status:'partial'})];
  second.transactions=[tx({id:'partial',event:'phone@2025-12-25',amount:100_000})];
  const edited=saveKaspiSchedule(second,{id:'phone',name:'Телефон',date:now,mode:'individual',text:'2025-12-25 3000\n2026-01-25 1500'});
  assert.equal(edited.transactions.length,1);
  assert.equal(effectiveDebt(edited.debts.find(d=>d.id==='phone')!,edited).balance,450_000);
  assert.equal(edited.debts.find(d=>d.id==='computer')?.balance,300_000);
  const due=calendar(edited,'2025-12-01','2025-12-31').find(e=>e.rule==='phone')!;
  assert.equal(remainingEvent(due,edited.transactions),300_000);
});

test('частичное и полное досрочное погашение сокращают график и освобождают привязанные резервы',()=>{
  const data=saveKaspiSchedule(ready(),{id:'kaspi',name:'Kaspi',date:now,mode:'aggregate',text:'2025-12-05 3500\n2026-01-05 2500'});
  const loan=data.debts[0];
  data.plans=[{id:'reserved',date:now,status:'accepted',items:[{id:'reserve',group:'bills',target:'kaspi@2026-01-05',name:'Январь',amount:250_000,reason:''}]}];
  const partial=applyDebtPrepayment(data,loan,tx({category:loan.id,amount:150_000}));
  assert.deepEqual(schedule(effectiveDebt(loan,partial)).map(row=>row.amount),[350_000,100_000]);
  assert.equal(reserved(partial),100_000);
  const proportional=applyDebtPrepayment(data,loan,tx({category:loan.id,amount:150_000,reducePayment:true}));
  assert.deepEqual(schedule(effectiveDebt(loan,proportional)).map(row=>row.amount),[262_500,187_500]);
  data.plans[0].items.push({id:'early',group:'debt',target:loan.id,name:'Досрочное',amount:100_000,reason:''});
  const closed=applyDebtPrepayment(data,loan,tx({category:loan.id,amount:600_000}));
  assert.equal(effectiveDebt(loan,closed).balance,0);
  assert.equal(reserved(closed),0);
  assert.equal(calendar(closed,now,'2026-02-01').filter(row=>row.rule===loan.id&&remainingEvent(row,closed.transactions)>0).length,0);
});

test('частичный платёж ипотеки под 5% начисляет эти проценты один раз',()=>{
  const data=ready();
  data.debts=[loan];
  data.transactions=[tx({amount:50_000,event:'mortgage@2025-11-26',category:'mortgage'})];
  const effective=effectiveDebt(loan,data);
  assert.equal(effective.balance,1_155_000);
  assert.equal(schedule(effective)[0].interest,0);
  assert.equal(schedule(effective)[0].amount,50_000);
  const due=calendar(data,now,'2025-11-30')[0];
  assert.equal(remainingEvent(due,data.transactions),50_000);
  assert.equal(effective.rate,5);
});

test('освободившийся платёж беспроцентной рассрочки не считается процентной экономией',()=>{
  const data=saveKaspiSchedule(ready(),{id:'kaspi',name:'Kaspi',date:now,mode:'aggregate',text:'2025-12-05 3500\n2026-01-05 2500'});
  const comparison=comparePrepayment(data,data.debts[0],now,goal);
  assert.equal(comparison.comparison.saved,0);
  assert.deepEqual(comparison.relief.map(row=>row.amount),[350_000,250_000]);
  assert.equal(comparison.preservesCushion,false);
  assert.equal(comparison.favorable,false);
  assert.equal(data.transactions.length,0);
});

test('новый график может сдвинуть дату готовности к покупке',()=>{
  const d=ready();
  d.accounts.push({...cashAccount,id:'ot',name:'Отбасы',kind:'otbasy',opening:1_000_000,contract:10_000_000,interest:50_000});
  d.rules=[{id:'salary',name:'Зарплата',kind:'income',amount:5_000_000,date:'2025-12-01',repeat:'monthly',active:true}];
  const target={...goal,price:25_000_000,reserve:0,date:'2025-12-31',latest:'2026-01-31'};
  const baseline=forecast(d,target,now,undefined,{});
  const changed=saveKaspiSchedule(d,{id:'loan',name:'Kaspi',mode:'aggregate',date:now,text:'2025-12-21 35000'});
  const revised=forecast(changed,target,now,undefined,{});
  assert.equal(baseline.reached,'2025-12-31');
  assert.equal(revised.reached,'2026-01-31');
});
