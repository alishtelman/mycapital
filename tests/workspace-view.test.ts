import assert from 'node:assert/strict';
import test from 'node:test';
import type {Event} from '../lib/finance.ts';
import {calendarGroups,recommendedPurchase} from '../lib/workspace-view.ts';

test('календарь показывает каждое событие месяца в одной группе',()=>{
  const events=['2026-11-19','2026-11-20','2026-11-21','2026-11-24','2026-11-26'].map(date=>({
    id:date,name:date,date,kind:'expense',status:'planned',amount:100,rule:'',comment:'',
  } satisfies Event));
  assert.deepEqual(calendarGroups(events,'2026-11-20','2026-11-26').map(group=>group.events.map(e=>e.date)),
    [['2026-11-20'],['2026-11-21'],['2026-11-24'],['2026-11-26'],['2026-11-19']]);
});

test('рекомендация покупки сохраняет самый мягкий вариант без дефицита',()=>{
  const options=[{shortfall:100},{shortfall:0},{shortfall:0}];
  assert.equal(recommendedPurchase(options),options[1]);
  const future=[{shortfall:null},{shortfall:null}];
  assert.equal(recommendedPurchase(future),future[0]);
});
