import assert from 'node:assert/strict';
import {test} from 'node:test';
import {balance,calendar,cash,empty,livingReserve,remainingEvent,reserved,type Account,type Data,type Entry} from '../lib/finance.ts';
import {monthlyReport} from '../lib/cashflow.ts';
import {changeEnvelope} from '../lib/envelopes.ts';
import {expectedIncome,incomePeriod,incomeType,incomeTypes} from '../lib/income.ts';
import {closingPayments,prepareMonthClosing,reopenAccountingMonth} from '../lib/month-closing.ts';
import {prepareFirstMonth} from '../lib/reconciliation.ts';
import {dataSchema} from '../lib/schema.ts';

const start='2025-05-01',day='2025-05-28';
const account=(id:string,kind:Account['kind'],opening:number):Account=>({id,name:id,kind,opening,owner:'',rate:0,basis:0,maturity:'',contract:0,futureContract:0,score:0,interest:0,eligible:0,awarded:0,fee:0,earlyRate:0,opened:'',rollover:false});
const tx=(fields:Partial<Entry>):Entry=>({id:'salary',name:'Зарплата',kind:'income',date:'2025-04-29',amount:45_000_000,from:'',to:'cash',category:'',event:'',reservation:'',sold:0,...fields});
const caseData=():Data=>({...empty(),accounts:[account('cash','cash',10_000_000),account('bcc','bcc',30_000_000)],
  rules:[{id:'salary',name:'Остаток зарплаты',kind:'income' as const,date:'2025-04-01',repeat:'monthly' as const,amount:40_000_000,active:true},
    {id:'advance',name:'Аванс',kind:'income' as const,date:'2025-04-16',repeat:'monthly' as const,amount:20_000_000,active:true},
    {id:'shifts',name:'Оплата дежурств',kind:'income' as const,date:'2025-04-03',repeat:'monthly' as const,amount:10_000_000,active:true}]});
const deposit=tx({id:'deposit',kind:'transfer',name:'Пополнение',date:'2025-05-05',from:'cash',to:'bcc',amount:30_000_000});
const advance=tx({id:'advance',name:'Аванс',date:'2025-05-17',amount:21_000_000});

test('шесть видов поступлений и плановая зарплата относятся к выбранному бюджетному месяцу',()=>{
  assert.equal(incomeTypes.length,6);
  assert.equal(incomeType('13-я зарплата'),'thirteenth');
  const d=caseData();
  assert.equal(expectedIncome(d,'salary',start)?.date,'2025-05-01');
  assert.equal(expectedIncome(d,'advance',start)?.date,'2025-05-16');
  assert.equal(expectedIncome(d,'gift',start),undefined);
  assert.equal(calendar(d,start,day).some(e=>e.rule==='shifts'),false);
  const moved={...expectedIncome(d,'salary',start)!,date:'2025-04-29',status:'moved' as const};
  assert.equal(incomePeriod(moved),start);
  assert.equal(expectedIncome(d,'salary',start,moved)?.date,'2025-04-29');
});

test('первая сверка дополняет отчёт и закрывает ожидаемые выплаты без изменения начальных остатков',()=>{
  const d=caseData();
  const review=prepareFirstMonth(d,start,[tx({}),advance,deposit],{id:'bcc',opened:'2025-05-05'});
  assert.deepEqual(review.data.accounts.map(a=>balance(a,review.data.transactions)),[10_000_000,30_000_000]);
  const report=monthlyReport(review.data,start);
  assert.equal(report.income,66_000_000);
  assert.equal(report.saved,30_000_000);
  assert.equal(report.expenses,0);
  assert.equal(report.partial,true);
  assert.equal(dataSchema.parse(review.data).settings.firstTrackingMonth,start);
  assert.equal(review.data.accounts[1].opened,'2025-05-05');
  assert.equal(monthlyReport(review.data,'2025-04-01').income,0);
  assert.equal(monthlyReport(review.data,'2025-06-01').partial,false);
  assert.ok(calendar(review.data,start,day).filter(e=>e.kind==='income').every(e=>remainingEvent(e,review.data.transactions)===0));
  assert.equal(expectedIncome(review.data,'salary','2025-06-01')?.date,'2025-06-01');
  const retry=prepareFirstMonth(review.data,start,[tx({}),advance,deposit],{id:'bcc',opened:'2025-05-05'});
  assert.equal(retry.added.length,0);
  assert.equal(retry.data.transactions.length,3);
});

test('сверка переотносит уже проведённое поступление к месяцу без изменения факта',()=>{
  const d=caseData();
  d.transactions=[tx({id:'posted'})];
  const next=prepareFirstMonth(d,start,[tx({id:'candidate'})]).data;
  assert.equal(next.transactions.length,1);
  assert.equal(next.transactions[0].id,'posted');
  assert.equal(next.transactions[0].openingBalanceIncluded,undefined);
  assert.equal(monthlyReport(next,start).income,45_000_000);
  assert.equal(cash(next),cash(d));
});

test('сверка просит дату открытия, проверяет начальный баланс и блокирует похожие дубли',()=>{
  const d=caseData();
  assert.throws(()=>prepareFirstMonth(d,start,[deposit],{id:'bcc',opened:''}),/точную дату/);
  d.accounts[1].balanceDate='2025-05-02';
  assert.throws(()=>prepareFirstMonth(d,start,[deposit],{id:'bcc',opened:'2025-05-05'}),/начальный баланс/);
  const previous=caseData();
  previous.transactions=[tx({date:'2025-04-28'})];
  assert.throws(()=>prepareFirstMonth(previous,start,[tx({})]),/другой датой/);
  previous.accounts.push(account('other','cash',0));
  previous.transactions=[tx({to:'other'})];
  assert.throws(()=>prepareFirstMonth(previous,start,[tx({})]),/счётом/);
});

test('закрытие сверяет счета, сохраняет неоплаченный платёж и освобождает только деньги на жизнь',()=>{
  const d=caseData();
  d.categories=[{id:'life',name:'На жизнь',budget:2_000_000,minimum:0,maximum:2_000_000,rank:1,flexible:true}];
  d.rules.push({id:'bill',kind:'expense',repeat:'once',date:'2025-05-29',name:'Связь',amount:300_000,active:true});
  const funded=changeEnvelope(d,{date:day,id:'life',amount:1_000_000,target:{target:'life',name:'На жизнь',group:'living'}})!;
  const params={balances:{cash:9_000_000},reserveAction:'release' as const,reviewedPayments:false,id:()=> 'balance-correction'};
  assert.throws(()=>prepareMonthClosing(funded,start,day,params),/платежи/);
  const closed=prepareMonthClosing(funded,start,day,{...params,reviewedPayments:true});
  assert.equal(cash(closed),9_000_000);
  assert.equal(reserved(closed),0);
  assert.equal(livingReserve(closed,'life',day),0);
  assert.equal(closingPayments(closed,start)[0].amount,300_000);
  assert.equal(monthlyReport(closed,start).expenses,0);
  assert.equal(monthlyReport(closed,start).snapshot?.date,day);
  const reopened=reopenAccountingMonth(closed,start);
  assert.equal(monthlyReport(reopened,start).snapshot,undefined);
  assert.equal(cash(reopened),9_000_000);
  assert.equal(reopened.transactions.length,1);
});

test('повторное открытие сохраняет перенесённые деньги и не повторяет сверку',()=>{
  const d=caseData();
  d.categories=[{id:'life',name:'На жизнь',budget:2_000_000,minimum:0,maximum:2_000_000,rank:1,flexible:true}];
  const funded=changeEnvelope(d,{date:day,id:'life',amount:1_000_000,target:{target:'life',name:'На жизнь',group:'living'}})!;
  const params={balances:{},reserveAction:'carry' as const,reviewedPayments:true,id:()=> 'carried'};
  const closed=prepareMonthClosing(funded,start,day,params);
  assert.throws(()=>prepareMonthClosing(closed,start,day,params),/повторно/);
  const reopened=reopenAccountingMonth(closed,start);
  assert.equal(livingReserve(reopened,'life',day),0);
  assert.equal(livingReserve(reopened,'life','2025-06-01'),1_000_000);
  assert.equal(cash(reopened),cash(funded));
});
