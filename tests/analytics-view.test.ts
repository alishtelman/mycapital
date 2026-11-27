import assert from 'node:assert/strict';
import {test} from 'node:test';
import {capitalHistory,datedHistory} from '../lib/analytics-view.ts';
import {empty,type Account,type Entry} from '../lib/finance.ts';

const account={id:'cash',name:'Счёт',kind:'cash',opening:10_000,owner:'',rate:0,basis:0,maturity:'',contract:0,futureContract:0,score:0,interest:0,eligible:0,awarded:0,fee:0,earlyRate:0,opened:'',rollover:false,balanceDate:'2026-09-15'} satisfies Account;
const entry=(changes:Partial<Entry>):Entry=>({id:'entry',kind:'income',name:'Доход',date:'2026-10-10',amount:2_000,from:'',to:'cash',category:'',event:'',reservation:'',sold:0,...changes});

test('история группирует по фактической дате после фильтра по счёту',()=>{
  const rows=[entry({id:'a'}),entry({id:'b',date:'2026-11-11',budgetMonth:'2026-12-01'}),entry({id:'c',to:'other'}),entry({id:'d',kind:'transfer',from:'cash',to:'other'})];
  assert.deepEqual(datedHistory(rows,'cash').map(([date,items])=>[date,items.map(row=>row.id)]),[['2026-11-11',['b']],['2026-10-10',['a','d']]]);
});

test('история капитала начинается с первого известного остатка и не удваивает историческую запись',()=>{
  const data={...empty(),accounts:[account],transactions:[entry({}),entry({id:'historical',date:'2026-09-01',openingBalanceIncluded:true})]};
  assert.deepEqual(capitalHistory(data,'2026-11-28'),[{date:'2026-09-30',actual:10_000},{date:'2026-10-31',actual:12_000},{date:'2026-11-28',actual:12_000}]);
  assert.deepEqual(capitalHistory({...data,accounts:[{...account,balanceDate:undefined}]},'2026-11-28'),[{date:'2026-11-28',actual:12_000}]);
});
