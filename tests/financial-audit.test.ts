import assert from 'node:assert/strict';
import {test} from 'node:test';
import {balance,bccYield,calendar,cash,effectiveDebt,empty,forecast,goalHoldings,otbasyYield,remainingEvent,reserved,score,type Account,type Entry,type Event,type Goal} from '../lib/finance.ts';
import {cashflow,monthlyReport,paymentState} from '../lib/cashflow.ts';

const account=(id:string,kind:Account['kind'],opening=0):Account=>({id,name:id,kind,opening,owner:id,rate:0,basis:0,maturity:'',contract:0,futureContract:0,score:0,interest:0,eligible:0,awarded:0,fee:0,earlyRate:0,opened:'',rollover:false});
const entry=(fields:Partial<Entry>):Entry=>({id:'entry',name:'Операция',date:'2026-11-20',kind:'expense',amount:0,from:'',to:'',event:'',category:'',reservation:'',sold:0,...fields});
const event=(fields:Partial<Event>):Event=>({id:'bill',name:'Платёж',date:'2026-12-01',kind:'expense',amount:10_000,status:'planned',rule:'',comment:'',...fields});
const goal:Goal={id:'home',name:'Квартира',price:100_000_000,down:50,reserve:0,date:'2027-08-15',latest:'2027-09-15',score:5,buffer:0,laterScore:16,rentMin:0,rentMax:0,rate:0,laterRate:0,completed:false};

test('перевод и резерв меняют доступность денег, сохраняя 1 500 ₸ капитала',()=>{
  const d=empty();
  d.accounts=[account('cash','cash',100_000),account('bcc','bcc',50_000)];
  d.plans=[{id:'plan',status:'accepted',date:'2026-11-20',items:[{id:'bill',target:'bill',group:'bills',name:'Связь',reason:'',amount:15_000}]}];
  d.transactions=[entry({kind:'transfer',amount:20_000,from:'cash',to:'bcc'}),entry({id:'old',kind:'income',amount:500_000,to:'cash',openingBalanceIncluded:true})];
  assert.deepEqual(d.accounts.map(a=>balance(a,d.transactions)),[80_000,70_000]);
  assert.equal(cash(d)-reserved(d),65_000);
  assert.equal(monthlyReport(d,'2026-11-01').income,500_000);
  assert.equal(monthlyReport(d,'2026-11-01').saved,20_000);
});

test('зарплата включает дежурства, реальное отдельно записанное поступление сохраняется в истории',()=>{
  const d=empty();
  d.accounts=[account('cash','cash')];
  d.rules=[{id:'salary',name:'Зарплата',kind:'income',amount:90_000_000,date:'2026-12-01',repeat:'monthly',active:true},{id:'duty',name:'Оплата дежурств',kind:'income',amount:20_000_000,date:'2026-12-10',repeat:'monthly',active:true}];
  d.events=[event({id:'duty@2026-12-10',name:'Дежурства',rule:'duty',kind:'income',date:'2026-12-10',amount:20_000_000})];
  d.transactions=[entry({kind:'income',to:'cash',amount:100_000,date:'2026-12-01'})];
  assert.equal(forecast(d,goal,'2026-12-01').rows[0].income,90_000_000);
  assert.equal(calendar(d,'2026-12-01','2026-12-31').find(e=>e.rule==='duty')?.status,'canceled');
  assert.equal(monthlyReport(d,'2026-12-01').income,100_000);
});

test('три записи госпремии двух владельцев дают две премии по 173 000 ₸',()=>{
  const d=empty();
  d.accounts=[{...account('one','otbasy'),owner:'Первый'}, {...account('duplicate','otbasy'),owner:'  ПЕРВЫЙ  '}, {...account('two','otbasy'),owner:'Вторая'}];
  d.settings.mrp['2026']=432_500;
  d.bonuses=d.accounts.map(a=>({id:a.id,account:a.id,year:2026,date:'2027-02-01',eligible:100_000_000,credited:0,actual:0}));
  assert.equal(forecast(d,goal,'2027-02-01').rows[0].bonus,34_600_000);
  d.transactions=[entry({kind:'income',amount:17_300_000,to:'duplicate',event:'credited@duplicate',date:'2027-02-01'})];
  assert.equal(forecast(d,goal,'2027-02-01').rows[0].bonus,17_300_000);
});

test('банковские примеры на 1 млн ₸ и ОП по договору на 30 млн ₸',()=>{
  assert.equal(bccYield({...account('bcc','bcc'),nominal:15,rate:17},100_000_000,30),1_232_877);
  assert.equal(otbasyYield(100_000_000,2,'2027-01-01','2027-02-01'),166_667);
  assert.equal(score(15_000_000,3_000_000_000),5);
});

test('персональный план даёт супруге 300 ₸ и БЦК 200 ₸ без повторного перевода на контрольной дате',()=>{
  const d=empty();
  d.accounts=[account('cash','cash',100_000),account('one','otbasy'),account('two','otbasy'),account('bcc','bcc')];
  d.settings.monthlySavingPlan={'2026-12-01':{two:30_000,bcc:20_000}};
  d.transactions=[entry({kind:'transfer',from:'cash',to:'two',amount:10_000,date:'2026-12-01'})];
  const result=forecast(d,{...goal,date:'2026-12-15',latest:'2026-12-28'},'2026-12-02');
  assert.deepEqual(result.deposits.filter(r=>r.date.startsWith('2026-12')),[
    {date:'2026-12-02',account:'two',amount:20_000},{date:'2026-12-02',account:'bcc',amount:20_000}]);
  assert.equal(result.rows[1].liquid,50_000);
});

test('рыночный актив включён в цель, продажа даёт 450 ₸ денег за актив на 500 ₸ только один раз',()=>{
  const d=empty();
  d.accounts=[account('cash','cash',10_000),{...account('gold','market',50_000),goalIncluded:true}];
  d.settings.plannedSales=[{id:'plan',account:'gold',date:'2026-12-05',value:50_000,proceeds:45_000}];
  assert.equal(goalHoldings(d,goal).total,50_000);
  assert.equal(forecast(d,goal,'2026-12-01').rows[0].capital,55_000);
  assert.equal(forecast(d,goal,'2026-12-01').rows[0].liquid,55_000);
  d.transactions=[entry({kind:'sale',from:'gold',to:'cash',sold:50_000,amount:45_000,plannedSale:'plan',date:'2026-12-05'})];
  assert.equal(forecast(d,goal,'2026-12-06').rows[0].capital,55_000);
  assert.equal(monthlyReport(d,'2026-12-01').income,0);
});

test('оплата 100 ₸ закрывает обязательство, историческая сумма и перевод его не погашают',()=>{
  const d=empty(), bill=event({});
  d.accounts=[account('cash','cash',100_000)];
  d.events=[bill];
  d.transactions=[entry({kind:'transfer',amount:10_000,event:bill.id}),entry({id:'old',amount:10_000,event:bill.id,openingBalanceIncluded:true})];
  assert.equal(remainingEvent(bill,d.transactions),10_000);
  assert.equal(paymentState(d,bill,'2026-12-01').actual,0);
  d.transactions.push(entry({id:'paid',amount:10_000,event:bill.id,from:'cash'}));
  assert.equal(cashflow(d,'2026-12-01',1)[0].expenses,0);
  assert.equal(forecast(d,goal,'2026-12-01').rows[0].expenses,0);
});

test('график долга учитывает 12 ₸ процентов и 100 ₸ основного долга по одному платежу',()=>{
  const d=empty();
  const loan={id:'loan',name:'Рассрочка',kind:'installment' as const,balance:120_000,payment:11_200,date:'2026-12-01',rate:12,apr:12,original:120_000,confirmed:true};
  d.debts=[loan];
  d.transactions=[entry({date:'2026-12-01',event:'loan@2026-12-01',category:'loan',amount:11_200})];
  assert.equal(effectiveDebt(loan,d).balance,110_000);
  assert.equal(effectiveDebt(loan,d).date,'2027-01-01');
});

test('закрытие ноября отменяет расчёт на жизнь, декабрьский разовый платёж учитывается единожды',()=>{
  const d=empty();
  d.accounts=[account('cash','cash',9_200_000)];
  d.categories=[{id:'food',name:'Продукты',budget:30_000,minimum:0,maximum:30_000,rank:0,flexible:true}];
  d.settings.closings={'2026-11-01':{date:'2026-11-28',carried:{food:5_000}}};
  d.settings.monthly={'2026-12-01':{food:35_000}};
  d.rules=[{id:'custom',name:'Разовый платёж',kind:'expense',date:'',dates:['2026-12-15'],amount:20_000,active:true,repeat:'custom'}];
  const result=forecast(d,goal,'2026-11-28');
  assert.equal(result.rows[0].expenses,0);
  assert.equal(result.rows[0].liquid,9_200_000);
  assert.equal(result.rows[1].expenses,55_000);
  assert.equal(result.rows[2].expenses,30_000);
});

test('дата покупки ждёт и денег, и ОП, а целевые даты остаются точными',()=>{
  const d=empty();
  d.accounts=[{...account('ot','otbasy',40_000_000),contract:100_000_000,interest:499_000,rate:2}];
  d.rules=[{id:'salary',name:'Зарплата',kind:'income',date:'2027-09-01',amount:20_000_000,repeat:'once',active:true}];
  const result=forecast(d,goal,'2027-08-01');
  assert.equal(result.deadline?.date,'2027-08-15');
  assert.ok((result.deadline?.op??0)>5);
  assert.ok((result.deadline?.deficit??0)>9_900_000);
  assert.equal(result.reached,'2027-09-15');
});
