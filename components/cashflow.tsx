'use client';
import {Disclosure} from './ui/finance';
import {useState} from 'react';
import {Bell} from 'lucide-react';
import {monthlyReport,paymentState,purchaseOptions,reminders} from '../lib/cashflow';
import {recommendedPurchase} from '../lib/workspace-view';
import {first,money,month,type Data,type Event} from '../lib/finance';
import {dayLabel,shortDate} from './dashboard';
import {Blank} from './forms';
import {Button} from './ui/button';

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

export function PurchaseCheck({data,date,request,close,apply,busy}:{data:Data;date:string;request:{id?:string;amount:number;date:string;name:string};close:()=>void;apply:(data:Data,reserve:number)=>void;busy:boolean}){
  const options=purchaseOptions(data,date,request.amount,request.date,request.id);
  const recommended=recommendedPurchase(options);
  const renderOption=(option:(typeof options)[number])=><div className="flow-day" key={option.label}><h2>{option===recommended?'Рекомендуемый вариант':option.label}</h2>
      <p>{option.shortfall===null?'Расход включён в будущий прогноз.':option.shortfall?'Сейчас не хватает '+money(option.shortfall)+' без риска для обязательств.':'Покупка укладывается в доступный бюджет.'}</p>
      {option.cuts.length>0&&<p>Из гибких категорий: {option.cuts.map(c=>c.category.name+' '+money(c.amount)).join(' · ')}.</p>}
      {option.walletMoves.length>0&&<p>Перенести на покупку из выделенных денег {option.walletMoves.map(move=>move.category.name+' '+money(move.amount)).join(' · ')}.</p>}
      <Disclosure summary={<>Подробности расчёта</>}><p>Плановые лимиты месяца {data.categories.map(c=>c.name+' '+money(option.budgets[c.id]??c.budget)).join(' · ')}.</p><p>Вариант сохраняет ваш минимум или 20% плана, если минимум равен нулю. Деньги из кошельков перемещаются только в суммах, указанных для выбранного варианта.</p>
      {option.proposal.length>0&&<p>По текущему остатку после покупки: {option.proposal.map(i=>i.name+' '+money(i.amount)).join(' · ')}.</p>}
      </Disclosure><p>Покупка квартиры: {option.projected?shortDate(option.projected)+' '+option.projected.slice(0,4):'дата вне горизонта прогноза'}{option.delay!==null?' · сдвиг '+(option.delay>0?'+':'')+option.delay+' дн':''}.</p>
      <Button variant="outline" disabled={busy} onClick={()=>apply(option.data,option.walletMoves.reduce((total,move)=>total+move.amount,0))}>Применить вариант</Button>
    </div>;
  return <div className="overlay" onClick={close}><section className="dialog" role="dialog" aria-modal="true" aria-label="Оценка покупки" onClick={e=>e.stopPropagation()}>
    <div className="dialog-header"><h2>{request.name} · {money(request.amount)}</h2><Button variant="ghost" onClick={close}>Закрыть</Button></div>
    {recommended&&renderOption(recommended)}
    <Disclosure summary={<>Другие варианты</>}>{options.filter(option=>option!==recommended).map(renderOption)}</Disclosure>
  </section></div>;
}

export function MonthReport({data,day,initialPeriod,closeMonth,reopen,close}:{data:Data;day:string;initialPeriod:string;closeMonth:(date:string)=>void;reopen:(date:string)=>void;close:()=>void}){
  const [period,P]=useState(initialPeriod||first(day));
  const report=monthlyReport(data,period);
  return <div className="overlay" onClick={close}><section className="dialog" role="dialog" aria-modal="true" aria-label="Отчёт за месяц" onClick={e=>e.stopPropagation()}>
    <div className="dialog-header"><h2>Отчёт за месяц</h2><Button variant="ghost" onClick={close}>Закрыть</Button></div>
    <div className="inline"><Button variant="outline" onClick={()=>P(month(period,-1))}>Предыдущий</Button><b>{dayLabel(period)}</b><Button variant="outline" disabled={period>=first(day)} onClick={()=>P(month(period,1))}>Следующий</Button></div>
    {report.partial&&<p>{data.settings.firstTrackingMonth===period?'Первый неполный учётный месяц.':'Неполный месяц.'} Отчёт включает известные операции.</p>}
    <dl>{Object.entries({Доходы:money(report.income),Расходы:report.partial&&report.expenses===0?'Нет подтверждённых записей':money(report.expenses),'Отложено переводами':money(report.saved),'Изменение накоплений':money(report.growth),
      'Изменение ОП':report.scoreDelta?.toFixed(2)??'Нет двух сверок','Полученные проценты':report.interest===null?'Укажите при сверке':money(report.interest)}).map(([label,value])=><div className="report-term" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {report.goalGap!==null&&<p>До цели к концу месяца · {money(report.goalGap)}. {report.goalProgress!==null&&report.goalProgress!==0?(report.goalProgress>0?'Цель ближе на ':'До цели стало дальше на ')+money(Math.abs(report.goalProgress))+'.':''}</p>}
    <p>Неиспользованные лимиты · {report.surplus.map(x=>data.categories.find(c=>c.id===x.id)?.name+' '+money(x.amount)).join(' · ')||'—'}.</p>
    {report.snapshot?<><p>Месяц закрыт {shortDate(report.snapshot.date)}{report.snapshot.date<month(period,1)?' досрочно':''}. Операции до конца месяца по-прежнему попадут в отчёт.</p><Button variant="outline" onClick={()=>reopen(period)}>Открыть месяц заново</Button></>:<Button onClick={()=>closeMonth(period)}>Сверить и закрыть месяц</Button>}
  </section></div>;
}
