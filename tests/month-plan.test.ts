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
