'use client';
import {useState} from 'react';
import {Bell,CalendarClock,Wallet} from 'lucide-react';
import {monthlyReport,paymentState,purchaseOptions,reminders} from '../lib/cashflow';
import {recommendedPurchase} from '../lib/workspace-view';
import {dailyBudget,first,money,month,type Data,type Event} from '../lib/finance';
import {dayLabel,shortDate} from './dashboard';
import {Blank} from './forms';
import {Button} from './ui/button';

export function MoneyToday({data,date,clock,onEvent,plan,report}:{data:Data;date:string;clock:string;onEvent:(event:Event)=>void;plan:()=>void;report:()=>void}){
  const budget=dailyBudget(data,date);
  const closed=Boolean(data.settings.closings?.[first(date)]);
  const actions=reminders(data,date,clock).filter(n=>n.event&&(!closed||n.event.date<month(first(date),1))).slice(0,3);
  return <div className="split">
    <section className="card"><div className="section-head"><h2>{closed?'Свободные деньги после закрытия месяца':'Сколько могу потратить сегодня'}</h2><Wallet size={20}/></div>
      <strong className="large">{money(closed?budget.free:budget.daily)}</strong>
      {closed?<p>Остаток можно потратить или отложить. Новый расчёт начнётся {shortDate(month(first(date),1))}.</p>:<>
        <p>{money(budget.forLife)} на жизнь до {budget.income?shortDate(budget.end):'конца расчётного периода'} · {budget.horizon} дн.</p>
        {budget.shortage>0&&<p className="loss">До обязательных платежей не хватает {money(budget.shortage)}.</p>}
        {budget.undated>0&&<p>Учтён запас на платежи без даты · {money(budget.undated)}.</p>}
        {budget.delayed&&<p>Есть неподтверждённое поступление. Лимит рассчитан без него.</p>}
      </>}
    </section>
    <section className="card"><div className="section-head"><h2>Что сделать сегодня</h2><CalendarClock size={20}/></div>
      {actions.length===0&&<p>Срочных действий нет.</p>}
      {actions.length===0&&budget.income&&<p>{shortDate(budget.end)} · {budget.income.name}</p>}
      {actions.map(n=><button key={n.id} className="list-row" onClick={()=>onEvent(n.event!)}><span><b>{n.title}</b><small>{n.detail}</small></span><strong>{money(n.event!.amount)}</strong></button>)}
      <div className="quick">{!closed&&<Button variant="outline" onClick={plan}>Пересчитать распределение</Button>}<Button variant="outline" onClick={report}>Отчёт за месяц</Button></div>
    </section>
  </div>;
}

export function Notifications({data,date,clock,close,open,mark,busy}:{data:Data;date:string;clock:string;close:()=>void;open:(event:Event)=>void;mark:(id:string,snooze:boolean)=>void;busy:boolean}){
  const items=reminders(data,date,clock);
  return <div className="overlay" onClick={close}><section className="dialog" role="dialog" aria-modal="true" aria-label="Уведомления" onClick={e=>e.stopPropagation()}>
    <div className="dialog-header"><h2><Bell size={19} style={{display:'inline'}}/> Уведомления</h2><Button variant="ghost" onClick={close}>Закрыть</Button></div>
    {!items.length&&<Blank>Новых уведомлений нет.</Blank>}
    {items.map(n=><div className="flow-day" key={n.id}><b>{n.title}</b><p>{n.detail}</p>
      {n.event?.kind==='expense'&&(()=>{const p=paymentState(data,n.event,date);return <p>Сумма {money(p.remaining)} · в резерве {money(p.held)} · не хватает {money(p.missing)}.</p>;})()}
      <div className="quick">{n.event&&<Button variant="outline" onClick={()=>open(n.event!)}>Подробнее</Button>}
      <Button variant="ghost" disabled={busy} onClick={()=>mark(n.id,true)}>На завтра</Button><Button variant="ghost" disabled={busy} onClick={()=>mark(n.id,false)}>Прочитано</Button></div>
    </div>)}
  </section></div>;
}

export function PurchaseCheck({data,date,request,close,apply,busy}:{data:Data;date:string;request:{id?:string;amount:number;date:string;name:string};close:()=>void;apply:(data:Data)=>void;busy:boolean}){
  const options=purchaseOptions(data,date,request.amount,request.date,request.id);
  const recommended=recommendedPurchase(options);
  const renderOption=(option:(typeof options)[number])=><div className="flow-day" key={option.label}><h2>{option===recommended?'Рекомендуемый вариант':option.label}</h2>
      <p>{option.shortfall===null?'Расход включён в будущий прогноз.':option.shortfall?'Сейчас не хватает '+money(option.shortfall)+' без риска для обязательств.':'Покупка укладывается в доступный бюджет.'}</p>
      {option.cuts.length>0&&<p>Из гибких категорий: {option.cuts.map(c=>c.category.name+' '+money(c.amount)).join(' · ')}.</p>}
      <details><summary>Подробности расчёта</summary><p>Бюджеты месяца: {data.categories.map(c=>c.name+' '+money(option.budgets[c.id]??c.budget)).join(' · ')}.</p>
      {option.proposal.length>0&&<p>По текущему остатку после покупки: {option.proposal.map(i=>i.name+' '+money(i.amount)).join(' · ')}.</p>}
      </details><p>Покупка квартиры: {option.projected?shortDate(option.projected)+' '+option.projected.slice(0,4):'дата вне горизонта прогноза'}{option.delay!==null?' · сдвиг '+(option.delay>0?'+':'')+option.delay+' дн':''}.</p>
      <Button variant="outline" disabled={busy} onClick={()=>apply(option.data)}>Применить вариант</Button>
    </div>;
  return <div className="overlay" onClick={close}><section className="dialog" role="dialog" aria-modal="true" aria-label="Оценка покупки" onClick={e=>e.stopPropagation()}>
    <div className="dialog-header"><h2>{request.name} · {money(request.amount)}</h2><Button variant="ghost" onClick={close}>Закрыть</Button></div>
    {recommended&&renderOption(recommended)}
    <details><summary>Другие варианты</summary>{options.filter(option=>option!==recommended).map(renderOption)}</details>
  </section></div>;
}

export function MonthReport({data,day,closeMonth,close}:{data:Data;day:string;closeMonth:(date:string)=>void;close:()=>void}){
  const [period,P]=useState(first(day));
  const report=monthlyReport(data,period);
  return <div className="overlay" onClick={close}><section className="dialog" role="dialog" aria-modal="true" aria-label="Отчёт за месяц" onClick={e=>e.stopPropagation()}>
    <div className="dialog-header"><h2>Отчёт за месяц</h2><Button variant="ghost" onClick={close}>Закрыть</Button></div>
    <div className="inline"><Button variant="outline" onClick={()=>P(month(period,-1))}>Предыдущий</Button><b>{dayLabel(period)}</b><Button variant="outline" disabled={period>=first(day)} onClick={()=>P(month(period,1))}>Следующий</Button></div>
    <dl>{Object.entries({Доходы:money(report.income),Расходы:money(report.expenses),'Отложено переводами':money(report.saved),'Изменение накоплений':money(report.growth),
      'Изменение ОП':report.scoreDelta?.toFixed(2)??'Нет двух сверок','Полученные проценты':report.interest===null?'Укажите при сверке':money(report.interest)}).map(([label,value])=><div className="report-term" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {report.goalGap!==null&&<p>До цели к концу месяца · {money(report.goalGap)}. {report.goalProgress!==null&&report.goalProgress!==0?(report.goalProgress>0?'Цель ближе на ':'До цели стало дальше на ')+money(Math.abs(report.goalProgress))+'.':''}</p>}
    <p>Переносимый бюджет · {report.surplus.map(x=>data.categories.find(c=>c.id===x.id)?.name+' '+money(x.amount)).join(' · ')||'—'}.</p>
    {report.snapshot?<p>Месяц закрыт {shortDate(report.snapshot.date)}.</p>:<Button onClick={()=>closeMonth(period)}>Сверить и закрыть месяц</Button>}
  </section></div>;
}
