import assert from 'node:assert/strict';
import {test} from 'node:test';
import {balance,budgetCuts,cash,empty,reserved,sum,validateEntry,type Account,type Entry} from '../lib/finance.ts';
import {assignableLiving,changeEnvelope,envelopeAmounts,envelopeSummary,safeEnvelopeSpending,transferEnvelopeSavings} from '../lib/envelopes.ts';
import {purchaseOptions,withPaymentReserves} from '../lib/cashflow.ts';
import {dataSchema} from '../lib/schema.ts';

const date='2025-11-28';
const nextMonth='2025-12-01';
const coat={id:'clothes',name:'Одежда',budget:5_000_000,minimum:2_000_000,maximum:5_000_000,rank:2,flexible:true};
const dateNight={id:'dating',name:'Свидания',budget:4_000_000,minimum:3_000_000,maximum:4_000_000,rank:1,flexible:true};
const target={target:coat.id,name:coat.name,group:'living'};
const account=(id:string,kind:Account['kind'],opening:number):Account=>({id,name:id,kind,opening,owner:'',rate:0,basis:0,maturity:'',contract:0,futureContract:0,score:0,interest:0,eligible:0,awarded:0,fee:0,earlyRate:0,opened:'',rollover:false});
const tx=(fields:Partial<Entry>={}):Entry=>({id:'tx',kind:'expense',name:'Покупка',date,amount:1_000_000,from:'cash',to:'',category:coat.id,event:'',reservation:'',sold:0,...fields});
const setup=()=>({...empty(),accounts:[account('cash','cash',10_000_000),account('wallet','cash',2_000_000),account('otbasy','otbasy',20_000_000)],categories:[coat,dateNight]});
const earmark=()=>changeEnvelope(setup(),{date,id:'allocation',target,amount:5_000_000})!;

test('план одежды не создаёт денег, выделение и освобождение 50 000 ₸ сохраняют капитал',()=>{
  const data=setup();
  assert.deepEqual(envelopeAmounts(data,coat,date),{plan:5_000_000,assigned:0,spent:0,available:0});
  assert.equal(changeEnvelope(data,{date,id:'release',source:coat.id,amount:5_000_000}),null);
  const assigned=earmark();
  assert.equal(cash(assigned),12_000_000);
  assert.equal(envelopeSummary(assigned).free,7_000_000);
  assert.deepEqual(envelopeAmounts(assigned,coat,date),{plan:5_000_000,assigned:5_000_000,spent:0,available:5_000_000});
  const released=changeEnvelope(assigned,{date,id:'release',source:coat.id,amount:5_000_000})!;
  assert.equal(cash(released),12_000_000);
  assert.equal(envelopeSummary(released).free,12_000_000);
  assert.equal(envelopeAmounts(released,coat,date).available,0);
  const transfer=tx({kind:'transfer',category:'',amount:5_000_000,to:'otbasy'});
  assert.equal(validateEntry(released,transfer),'');
  assert.deepEqual(released.accounts.map(a=>balance(a,[transfer])),[5_000_000,2_000_000,25_000_000]);
});

test('расход закрывает только оплаченные 10 000 ₸ и оставляет свободные деньги прежними',()=>{
  const data=earmark();
  const entry=withPaymentReserves(data,tx(),coat.id);
  assert.equal(validateEntry(data,entry),'');
  const next={...data,transactions:[entry]};
  assert.equal(cash(next),11_000_000);
  assert.equal(reserved(next),4_000_000);
  assert.equal(envelopeSummary(next).free,7_000_000);
  assert.deepEqual(envelopeAmounts(next,coat,date),{plan:5_000_000,assigned:5_000_000,spent:1_000_000,available:4_000_000});
  assert.equal(changeEnvelope(next,{date,id:'too-much',source:coat.id,amount:5_000_000}),null);
});

test('перевод экономии 50 000 ₸ атомарен и не увеличивает капитал',()=>{
  const data=earmark();
  const wrong=transferEnvelopeSavings(data,coat.id,tx({kind:'transfer',from:'wallet',to:'otbasy',amount:5_000_000}));
  assert.ok(wrong.error);
  assert.equal(reserved(data),5_000_000);
  const transfer=tx({kind:'transfer',category:'',to:'otbasy',amount:5_000_000});
  const result=transferEnvelopeSavings(data,coat.id,transfer).data!;
  assert.equal(sum(result.accounts.map(a=>balance(a,result.transactions))),32_000_000);
  assert.equal(balance(result.accounts[2],result.transactions),25_000_000);
  assert.equal(reserved(result),0);
  assert.equal(cash(result),7_000_000);
  assert.ok(transferEnvelopeSavings(result,coat.id,transfer).error);
});

test('привязанный счёт ограничивает выделение и сохраняет покрытие категории',()=>{
  const data=setup();
  data.settings.livingAccount='wallet';
  assert.equal(assignableLiving(data,date,coat),2_000_000);
  assert.equal(changeEnvelope(data,{date,id:'excess',amount:2_000_001,target}),null);
  const ready=changeEnvelope(data,{date,id:'wallet-assign',amount:2_000_000,target})!;
  assert.notEqual(validateEntry(ready,tx({from:'wallet',category:''})),'');
  assert.equal(validateEntry(ready,withPaymentReserves(ready,tx({from:'wallet'}),coat.id)),'');
  assert.equal(dataSchema.parse(ready).settings.livingAccount,'wallet');
});

test('перенос сохраняет деньги и защищает их от ноябрьских расходов',()=>{
  const data=earmark();
  const carried=changeEnvelope(data,{date,id:'carry',amount:5_000_000,source:coat.id,target,carry:true})!;
  assert.equal(envelopeAmounts(carried,coat,date).available,0);
  assert.equal(envelopeAmounts(carried,coat,nextMonth).available,5_000_000);
  assert.equal(envelopeSummary(carried).free,7_000_000);
  assert.equal(withPaymentReserves(carried,tx(),coat.id).reserveUses?.length,0);
  assert.equal(withPaymentReserves(carried,tx({date:nextMonth}),coat.id).reserveUses?.[0].amount,1_000_000);
  assert.equal(dataSchema.parse(carried).plans.at(-1)?.items[0].budgetMonth,nextMonth);
});

test('перераспределение сохраняет капитал, а предложение по покупке удерживает минимумы',()=>{
  const data=earmark();
  const targetDating={target:dateNight.id,name:dateNight.name,group:'living'};
  const next=changeEnvelope(data,{date,id:'move',source:coat.id,amount:2_000_000,target:targetDating})!;
  assert.equal(envelopeAmounts(next,coat,date).available,3_000_000);
  assert.equal(envelopeAmounts(next,dateNight,date).available,2_000_000);
  assert.equal(reserved(next),5_000_000);
  const cuts=budgetCuts(next,date,10_000_000);
  assert.deepEqual(cuts.changes.map(c=>[c.category.id,c.newBudget]),[[coat.id,3_000_000],[dateNight.id,3_000_000]]);
  assert.equal(cuts.gap,7_000_000);
});

test('безопасная сумма учитывает выделенные деньги на жизнь один раз и защищает платежи',()=>{
  const data=earmark();
  const budget={income:undefined,end:nextMonth,undated:0,horizon:3,delayed:false,free:7_000_000,obligations:8_000_000,planned:0,forLife:0,daily:0,shortage:1_000_000,save:0};
  assert.equal(safeEnvelopeSpending(data,date,budget),4_000_000);
  const carried=changeEnvelope(data,{date,id:'carry',source:coat.id,target,amount:5_000_000,carry:true})!;
  assert.equal(safeEnvelopeSpending(carried,date,budget),0);
});

test('вариант крупной покупки предлагает только деньги сверх комфортных минимумов',()=>{
  const data=earmark();
  const withDating=changeEnvelope(data,{date,id:'dating',amount:4_000_000,target:{name:dateNight.name,target:dateNight.id,group:'living'}})!;
  const options=purchaseOptions(withDating,date,7_000_000);
  assert.equal(options[0].walletMoves.length,0);
  const suggested=options[2];
  assert.deepEqual(suggested.walletMoves.map(move=>[move.category.id,move.amount]),[[coat.id,3_000_000],[dateNight.id,1_000_000]]);
  assert.equal(envelopeAmounts(suggested.data,coat,date).available,2_000_000);
  assert.equal(envelopeAmounts(suggested.data,dateNight,date).available,3_000_000);
  assert.equal(suggested.shortfall,0);
  assert.equal(cash(withDating),cash(suggested.data));
});

test('без настроенного минимума крупная покупка сохраняет пятую часть плана',()=>{
  const data=earmark();
  const category={...coat,minimum:0};
  data.categories=[category];
  const proposed=purchaseOptions(data,date,15_000_000)[2];
  assert.equal(envelopeAmounts(proposed.data,category,date).available,1_000_000);
  assert.ok(proposed.shortfall!>0);
});
