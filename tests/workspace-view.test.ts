import assert from 'node:assert/strict';
import test from 'node:test';
import {empty,type Event} from '../lib/finance.ts';
import {paymentCalendarEvents,paymentGroups,preferredWorkspace,recommendedPurchase} from '../lib/workspace-view.ts';

test('календарь показывает каждое событие месяца в одной группе',()=>{
  const events=['2026-11-19','2026-11-20','2026-11-21','2026-11-24','2026-11-26'].map(date=>({
    id:date,name:date,date,kind:'expense',status:'planned',amount:100,rule:'',comment:'',
  } satisfies Event));
  assert.deepEqual(paymentGroups(empty(),events,'2026-11-01','2026-11-20','2026-11-26').map(group=>group.events.map(e=>e.date)),
    [['2026-11-19','2026-11-20'],['2026-11-21','2026-11-24'],['2026-11-26'],[]]);
});

test('рекомендация покупки сохраняет самый мягкий вариант без дефицита',()=>{
  const options=[{shortfall:100},{shortfall:0},{shortfall:0}];
  assert.equal(recommendedPurchase(options),options[1]);
  const future=[{shortfall:null},{shortfall:null}];
  assert.equal(recommendedPurchase(future),future[0]);
});


test('событие предыдущего месяца с переходящим крайним сроком видно в календаре',()=>{
  const data=empty();
  const bill={id:'renewal',name:'Платёж',kind:'expense',date:'2026-10-30',deadline:'2026-11-29',status:'planned',rule:'',amount:10_000,comment:''} satisfies Event;
  data.events=[bill];
  const events=paymentCalendarEvents(data,'2026-11-01','2026-11-28');
  assert.deepEqual(paymentGroups(data,events,'2026-11-01','2026-11-28','2026-12-01')[1].events,[bill]);
});

test('после обновления восстанавливается только доступное семейное пространство',()=>{
  const personal={id:'personal',owner:'me',shared:false};
  const shared={id:'family',owner:'other',shared:true};
  assert.equal(preferredWorkspace([personal,shared],'me','family'),shared);
  assert.equal(preferredWorkspace([personal],'me','family'),personal);
  assert.equal(preferredWorkspace([],'me','family'),undefined);
});
