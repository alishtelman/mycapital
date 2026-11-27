import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {allocation,calendar,cash,dailyBudget,days,effectiveDebt,empty,payDate,reserved,sum,today,validateEntry,type Account,type Data,type Entry,type Event,type Plan,type Rule} from '../lib/finance.ts';
import {cashflow,monthlyReport,paymentState,purchaseOptions,reminders,trimPaymentReserves,withPaymentReserves} from '../lib/cashflow.ts';
import {dataSchema} from '../lib/schema.ts';

const start='2026-12-01';
const demo=JSON.parse(readFileSync(new URL('../lib/demo.json',import.meta.url),'utf8')) as Data;
const makeRule=(r:Partial<Rule>):Rule=>({id:'bill',name:'Счёт',kind:'expense',amount:1_000_000,date:'2026-12-05',repeat:'monthly',active:true,...r});
function setup(opening:number){
  const base=empty();
  base.accounts=[{...demo.accounts.find(a=>a.kind==='cash')!,opening}];
  base.rules=[makeRule({id:'salary',name:'Зарплата',kind:'income',date:'2026-12-11',amount:44_400_000})];
  return base;
}
function withReserves(d:Data,event:Event,amounts:number[]){
  d.plans=amounts.map((amount,i):Plan=>({id:'plan'+i,date:start,status:'accepted',items:[{id:'item'+i,name:event.name,target:event.id,amount,reason:'',group:'bills'}]}));
}
function payment(e:Event,amount:number):Entry{
  return {id:'paid',date:today(),name:e.name,amount,kind:'expense',category:'',event:e.id,from:'cash',to:'',reservation:'',sold:0};
}
test('аванс 444 000 ₸ покрывает платежи до зарплаты и распределяется один раз',()=>{
  const d=setup(0);
  d.transactions=[{...payment({id:'',name:'Аванс'} as Event,44_400_000),kind:'income',from:'',to:'cash'}];
  d.rules.push(makeRule({amount:9_305_323,date:'2026-12-07'}));
  const items=allocation(d,start);
  assert.equal(items.find(i=>i.group==='bills')?.amount,9_305_323);
  assert.equal(sum(items.map(i=>i.amount)),44_400_000);
});
test('крупный платёж частично обеспечивается заранее из первого поступления',()=>{
  const d=setup(20_000_000);
  d.rules[0].amount=5_000_000;
  d.rules.push(makeRule({date:'2026-12-20',amount:9_000_000}));
  const items=allocation(d,start);
  assert.equal(items.find(i=>i.group==='bills')?.amount,4_000_000);
});
test('одна оплата расходует два резерва и не списывает их дважды',()=>{
  const d=setup(12_000_000);
  d.rules.push(makeRule({amount:9_000_000}));
  const e=calendar(d,start,'2026-12-08').find(e=>e.kind==='expense')!;
  withReserves(d,e,[4_000_000,3_000_000]);
  const t=withPaymentReserves(d,payment(e,e.amount),e.id);
  assert.equal(t.reserveUses!.length,2);
  assert.equal(validateEntry(d,t),'');
  d.transactions=[t];
  assert.equal(reserved(d),0);
  assert.equal(cash(d),3_000_000);
});
test('частичная оплата и корректировка коммунального счёта высвобождают только излишек',()=>{
  const d=setup(6_000_000);
  d.rules.push(makeRule({name:'Коммунальные услуги',amount:3_500_000}));
  const e=calendar(d,start,'2026-12-09').find(e=>e.kind==='expense')!;
  withReserves(d,e,[3_500_000]);
  d.transactions=[withPaymentReserves(d,payment(e,2_000_000),e.id)];
  d.plans=trimPaymentReserves(d,{...e,amount:3_000_000});
  assert.equal(reserved(d),1_000_000);
  assert.equal(paymentState(d,{...e,amount:3_000_000},start).actual,2_000_000);
});
test('перенос и месячный повтор дают ровно по одному событию',()=>{
  const d=setup(0);
  d.rules.push(makeRule({date:'2026-12-31'}));
  const e=calendar(d,start,'2027-02-28').find(e=>e.rule==='bill')!;
  d.events.push({...e,date:'2026-12-30',status:'moved'});
  assert.deepEqual(calendar(d,start,'2027-02-28').filter(e=>e.rule==='bill').map(e=>e.date),['2026-12-30','2027-01-31','2027-02-28']);
});
test('задержка поступления и неопределённый доход не увеличивают дневной лимит',()=>{
  const d=setup(12_000_000);
  d.rules[0].date='2026-11-29';
  d.rules.push(makeRule({id:'bonus',kind:'income',name:'Премия',uncertain:true,date:'2026-12-03'}));
  d.settings.conservative=true;
  const result=dailyBudget(d,start);
  assert.equal(result.delayed,true);
  assert.equal(result.end,'2026-12-29');
  assert.equal(cashflow(d,start).find(r=>r.date==='2026-12-03')!.income,0);
  assert.equal(cashflow(d,start).length,90);
});
test('180 000 ₸ на украшения учитываются один раз, минимумы одежды и свиданий сохраняются',()=>{
  const d=structuredClone(demo);
  const options=purchaseOptions(d,start,18_000_000,'2026-12-20');
  const aggressive=options[2];
  assert.equal(aggressive.data.purchases.find(p=>p.id==='assessment')?.amount,18_000_000);
  assert.ok(aggressive.cuts.every(c=>aggressive.budgets[c.category.id]>=c.category.minimum));
});
test('обязательный платёж с дефицитом блокирует накопления',()=>{
  const d=setup(2_000_000);
  d.rules.push(makeRule({amount:3_000_000,date:'2026-12-10'}));
  assert.equal(dailyBudget(d,start).shortage,1_000_000);
  assert.equal(dailyBudget(d,start).save,0);
  assert.ok(cashflow(d,start).some(r=>r.available<0&&r.cause==='Счёт'));
});
test('закрытая рассрочка больше не создаёт будущие платежи',()=>{
  const d=setup(8_000_000);
  d.debts=[{...demo.debts[0],id:'loan',kind:'installment',confirmed:true,date:'2026-12-03',rate:0,balance:1_000_000,payment:300_000}];
  d.transactions=[{...payment({name:'Рассрочка',id:''} as Event,1_000_000),category:'loan'}];
  assert.equal(effectiveDebt(d.debts[0],d).balance,0);
  assert.ok(!calendar(d,start,'2027-02-01').some(e=>e.rule==='loan'));
});
test('срочный вклад исключён из доступных расходов',()=>{
  const d=setup(0);
  const account:Account={...demo.accounts.find(a=>a.kind==='bcc')!,maturity:'2099-01-01',liquidity:'term'};
  d.accounts.push(account);
  assert.equal(dailyBudget(d,start).free,0);
  assert.notEqual(validateEntry(d,{...payment({name:'Расход',id:''} as Event,1),from:account.id}),'');
});
test('120 000 ₸ на жизнь на десять дней дают лимит 12 000 ₸',()=>{
  const d=setup(12_000_000);
  d.categories=[{id:'food',name:'На жизнь',budget:40_000_000,minimum:20_000_000,maximum:50_000_000,rank:1,flexible:true}];
  const budget=dailyBudget(d,start);
  assert.equal(budget.horizon,10);
  assert.equal(budget.daily,1_200_000);
});
test('срок, выходные, резерв, прочтение и перенос уведомления',()=>{
  const d=setup(2_000_000);
  d.rules.push(makeRule({date:'2026-12-07',payment:{reminders:[7,3,1,0]}}));
  const e=calendar(d,start,'2026-12-09').find(e=>e.rule==='bill')!;
  assert.equal(payDate(d,e,start),'2026-12-04');
  withReserves(d,e,[e.amount]);
  const alert=reminders(d,start).find(x=>x.event?.id===e.id)!;
  assert.ok(alert.detail.includes('Полностью зарезервирован'));
  d.settings.notifications={[alert.id]:{until:'2026-12-02'}};
  assert.ok(!reminders(d,start).some(x=>x.id===alert.id));
  assert.ok(reminders(d,'2026-12-02').some(x=>x.id===alert.id));
  d.settings.notifications={[alert.id]:{read:true}};
  assert.ok(!reminders(d,'2026-12-02').some(x=>x.id===alert.id));
});
test('старый профиль проходит текущую схему без изменения балансов, структуры и истории',()=>{
  const parsed=dataSchema.parse(demo);
  assert.deepEqual(parsed,demo);
});
test('отчёт берёт фактические проценты и изменение ОП из двух закрытий',()=>{
  const d=setup(0);
  d.settings.closings={'2026-11-01':{date:start,score:2},[start]:{date:'2026-12-31',score:2.4,interest:5000}};
  assert.equal(monthlyReport(d,start).interest,5000);
  assert.ok(Math.abs(monthlyReport(d,start).scoreDelta!-0.4)<.001);
});
test('крайний срок и рекомендуемая дата могут отличаться от даты события',()=>{
  const d=setup(1);
  d.rules.push(makeRule({date:'2026-12-02',payment:{grace:5}}));
  const bill=calendar(d,start,'2026-12-09').find(e=>e.rule==='bill')!;
  assert.equal(days(bill.date,bill.deadline!),5);
  assert.equal(payDate(d,bill,start),'2026-12-04');
});
