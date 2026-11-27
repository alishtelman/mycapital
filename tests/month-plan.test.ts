import assert from 'node:assert/strict';
import test from 'node:test';
import {empty} from '../lib/finance.ts';
import {nextMonthPlan} from '../lib/month-plan.ts';

test('план следующего месяца включает ипотеку и рассрочки без повторного учёта',()=>{
  const data=empty();
  data.rules=[{id:'salary',name:'Зарплата',kind:'income',amount:80_000,date:'2026-12-01',repeat:'monthly',active:true}];
  data.debts=[
    {id:'mortgage',name:'Ипотека',kind:'mortgage',balance:300_000,payment:20_000,date:'',rate:0,apr:0,original:300_000,confirmed:false},
    {id:'installment',name:'Рассрочка',kind:'installment',balance:40_000,payment:10_000,date:'2026-12-05',rate:0,apr:0,original:40_000,confirmed:true},
  ];
  const plan=nextMonthPlan(data,'2026-11-28',null);
  assert.equal(plan.period,'2026-12-01');
  assert.equal(plan.income,80_000);
  assert.equal(plan.paymentTotal,30_000);
  assert.equal(plan.obligations.length,2);
  assert.equal(plan.obligations.find(row=>row.id==='mortgage')?.date,'');
});

test('после уточнения даты долг виден один раз; оплаченный счёт сохраняет фактическую сумму',()=>{
  const data=empty();
  data.debts=[{id:'mortgage',name:'Ипотека',kind:'mortgage',balance:300_000,payment:20_000,date:'2026-12-10',rate:0,apr:0,original:300_000,confirmed:true}];
  data.events=[{id:'utility',name:'Коммунальные услуги',kind:'expense',date:'2026-12-05',amount:30_000,status:'received',rule:'',comment:''}];
  data.transactions=[{id:'actual',name:'Коммунальные услуги',kind:'expense',date:'2026-12-05',amount:23_000,from:'',to:'',event:'utility',category:'',reservation:'',sold:0}];
  const plan=nextMonthPlan(data,'2026-11-28',null);
  assert.equal(plan.obligations.length,1);
  assert.equal(plan.obligations[0].source,'event');
  assert.equal(plan.obligations[0].date,'2026-12-10');
  assert.equal(plan.paymentTotal,20_000);
  assert.equal(plan.paid[0].paid,23_000);
});
