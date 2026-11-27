'use client';
import {useState} from 'react';
import {Activity,ArrowDownLeft,ArrowLeftRight,ArrowUpRight,ChevronLeft,ChevronRight,Landmark,ShieldCheck,ShoppingBag,Wallet} from 'lucide-react';
import {balance,cash,downPayment,effectiveDebt,first,forecast,goalHoldings,guaranteed,money,month,nextIncome,remainingEvent,reserved,sum,type Data,type Event,calendar} from '../lib/finance';
import {nextMonthPlan} from '../lib/month-plan';
import {Button} from './ui/button';
export const shortDate=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{day:'numeric',month:'long',timeZone:'Asia/Almaty'}):'Дата не задана';
export const dayLabel=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{month:'short',year:'numeric',timeZone:'Asia/Almaty'}):'—';
export const kinds={cash:Wallet,reserve:ShieldCheck,otbasy:Landmark,bcc:Landmark,market:Activity};

export function Dashboard({data:d,date,go,updateBalance,income,expense,transfer,purchase,prediction,moneyToday}:{data:Data;date:string;go:(page:string)=>void;updateBalance:()=>void;income:(event?:Event)=>void;expense:()=>void;transfer:()=>void;purchase:()=>void;prediction:ReturnType<typeof forecast>|null;moneyToday:React.ReactNode}){
  const [operations,setOperations]=useState(false);
  const goal=d.goals.find(g=>!g.completed);
  const upcoming=calendar(d,date,month(date,2));
  const expected=upcoming.find(event=>event.kind==='income'&&event.date===date&&remainingEvent(event,d.transactions)>0&&guaranteed(d,event))??nextIncome(d,upcoming,date);
  const dispatch=(action:()=>void)=>{setOperations(false);action();};
  const capital=sum(d.accounts.map(a=>balance(a,d.transactions)));
  const savings=sum(d.accounts.filter(a=>a.kind!=='cash').map(a=>balance(a,d.transactions)));
  const debts=sum(d.debts.map(debt=>effectiveDebt(debt,d).balance));
  const holdings=goal?goalHoldings(d,goal):null;
  const target=goal?downPayment(goal)+goal.reserve:0;
  const nextPlan=nextMonthPlan(d,date,prediction);
  const savedPlan=d.settings.monthlySavingPlan?.[nextPlan.period];
  const deposits=sum(nextPlan.savings.map(row=>Math.max(0,(savedPlan?.[row.id]??row.suggested)-row.transferred)));
  const plannedTotal=nextPlan.paymentTotal+nextPlan.life+deposits;
  const parts=[
    {name:'Платежи и покупки',amount:nextPlan.paymentTotal,color:'bills'},
    {name:'На жизнь',amount:nextPlan.life,color:'living'},
    {name:'Пополнения',amount:deposits,color:'saving'},
    {name:'Остаток по плану',amount:Math.max(0,nextPlan.income-plannedTotal),color:'left'},
  ];
  const scale=Math.max(nextPlan.income,plannedTotal);
  const gathered=holdings?.total??0;
  const progress=target>0?Math.max(0,Math.min(100,gathered/target*100)):0;
  return <>
    <div className="page-heading"><div><p className="eyebrow">{dayLabel(date)}</p><h1>Главная</h1></div></div>
    <section className="card capital-summary">
      <div className="section-head"><div><h2>Свободные деньги сейчас</h2><strong className="large">{money(cash(d)-reserved(d))}</strong></div><Button variant="outline" onClick={updateBalance}>Сверить остаток</Button></div>
      <details><summary>Счета и капитал</summary>
        <p>Всего на счетах и в активах {money(capital)} · накопления и активы {money(savings)}.</p>
        <p>Денежные счета {money(cash(d))} · из них зарезервировано {money(reserved(d))}.</p>
        <Button variant="outline" onClick={()=>go('accounts')}>Все счета</Button>
        <p>Чистая финансовая позиция {money(capital-debts)} после вычета долгов {money(debts)}.</p>
      </details>
    </section>
    <Button className="main-operation" onClick={()=>setOperations(true)}>+ Операция</Button>
    {operations&&<div className="overlay" onClick={()=>setOperations(false)}><section className="dialog small-dialog operation-sheet" role="dialog" aria-modal="true" aria-label="Новая операция" onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape')setOperations(false);}}>
      <div className="dialog-header"><h2>Новая операция</h2><Button variant="ghost" onClick={()=>setOperations(false)}>Закрыть</Button></div>
      <Button autoFocus onClick={()=>dispatch(expense)}><ArrowUpRight size={18}/> Расход</Button>
      <Button variant="outline" onClick={()=>dispatch(()=>income())}><ArrowDownLeft size={18}/> Доход</Button>
      <Button variant="outline" onClick={()=>dispatch(transfer)}><ArrowLeftRight size={18}/> Перевод</Button>
      <Button variant="ghost" onClick={()=>dispatch(purchase)}><ShoppingBag size={18}/> Хочу купить</Button>
    </section></div>}
    <section className="card">
      <div className="section-head"><h2>Следующее поступление</h2></div>
      {expected?<><div className="list-row"><span><b>{expected.name}</b><small>{shortDate(expected.date)} · ожидается</small></span><strong>{money(remainingEvent(expected,d.transactions))}</strong></div>
        </>:<p>Поступления пока не запланированы.</p>}
      <div className="dashboard-links">
        {expected&&<Button variant="outline" onClick={()=>income(expected)}>Получил деньги</Button>}
        <Button variant="ghost" onClick={()=>go('month')}>Открыть план месяца <ChevronRight size={16} aria-hidden="true"/></Button>
      </div>
    </section>
    <details className="card"><summary>Подробнее о сегодняшнем бюджете</summary>{moneyToday}</details>
    <div className="split home-insights">
      {scale>0&&<section className="card"><div className="section-head"><div><h2>Бюджет месяца</h2><p>План · {dayLabel(nextPlan.period)}</p></div></div>
        <div className="insight-track" aria-hidden="true">{parts.filter(part=>part.amount>0).map(part=>
          <span key={part.color} className={'insight-'+part.color} style={{width:part.amount/scale*100+'%'}}/>)}</div>
        <dl className="insight-legend">{parts.filter(part=>part.amount>0).map(part=><div key={part.color}>
          <dt><span className={'insight-dot insight-'+part.color} aria-hidden="true"/>{part.name}</dt><dd>{money(part.amount)}</dd>
        </div>)}</dl>
        <p className={plannedTotal>nextPlan.income?'loss':undefined}>Ожидается {money(nextPlan.income)}{plannedTotal>nextPlan.income?' · не хватает '+money(plannedTotal-nextPlan.income):''}</p>
      </section>}
      <section className="card"><div className="section-head"><h2>Моя квартира</h2>{target>0&&<strong>{progress.toLocaleString('ru-KZ',{maximumFractionDigits:1})}%</strong>}</div>
        {target>0?<><strong className="large">{money(gathered)}</strong><p>из {money(target)}</p>
          <div className="insight-track" role="progressbar" aria-label="Прогресс к покупке квартиры" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span className="insight-saving" style={{width:progress+'%'}}/></div>
          <p>{prediction?.reached?'По прогнозу · '+dayLabel(prediction.reached):'Дата покупки пока не определена'}</p>
        </>:<p>Добавь цель, чтобы видеть прогресс.</p>}
        <Button variant="ghost" onClick={()=>go('goals')}>Открыть цель <ChevronRight size={16} aria-hidden="true"/></Button>
      </section>
    </div>
  </>;
}

export function MonthScreen({data,date,period,prediction,changePeriod,editPlan,openBudget,openPayments,report,openPayment}:{data:Data;date:string;period:string;prediction:ReturnType<typeof forecast>|null;changePeriod:(period:string)=>void;editPlan:(period:string)=>void;openBudget:()=>void;openPayments:()=>void;report:()=>void;openPayment:(row:ReturnType<typeof nextMonthPlan>['obligations'][number])=>void}){
  const plan=nextMonthPlan(data,date,prediction,period);
  const savedPlan=data.settings.monthlySavingPlan?.[period];
  const savingTotal=sum(plan.savings.map(row=>savedPlan?.[row.id]??row.suggested));
  const leftToSave=sum(plan.savings.map(row=>Math.max(0,(savedPlan?.[row.id]??row.suggested)-row.transferred)));
  const missingDates=plan.obligations.filter(row=>!row.date);
  const renderPayment=(row:typeof plan.obligations[number])=><button type="button" className="list-row" key={row.id} onClick={()=>openPayment(row)}>
    <span><b>{row.name}</b><small>{row.date?shortDate(row.date):'Указать дату платежа'}</small>
      {row.held>0&&<small>Отложено {money(row.held)}</small>}
      {row.paid>0&&row.amount>0&&<small>Уже оплачено {money(row.paid)}</small>}</span>
    <strong>{money(row.amount||row.paid)}</strong><ChevronRight size={16} aria-hidden="true"/></button>;
  return (
    <section className="card month-screen">
      <header className="month-toolbar">
        <div className="month-switcher" role="group" aria-label="Период плана">
          <Button variant="ghost" className="month-step" aria-label="Предыдущий месяц" disabled={period<=first(date)} onClick={()=>changePeriod(month(period,-1))}><ChevronLeft size={18} aria-hidden="true"/></Button>
          <h1>{new Intl.DateTimeFormat('ru-KZ',{month:'long',year:'numeric',timeZone:'Asia/Almaty'}).format(new Date(period+'T12:00:00+05:00'))}</h1>
          <Button variant="ghost" className="month-step" aria-label="Следующий месяц" onClick={()=>changePeriod(month(period,1))}><ChevronRight size={18} aria-hidden="true"/></Button>
        </div>
        {plan.savings.length>0&&<Button variant="outline" onClick={()=>editPlan(plan.period)}>{savedPlan?'Изменить план':'Сохранить свой план'}</Button>}
      </header>
      <details><summary>Ожидаемые поступления · {money(plan.income)}</summary>
        {plan.incomeEvents.map(event=><div className="list-row" key={event.id}><span><b>{event.name}</b><small>{shortDate(event.date)}</small></span><strong>{money(remainingEvent(event,data.transactions))}</strong></div>)}
      </details>
      {missingDates.length>0&&<details open><summary>Уточнить даты · {missingDates.length}</summary>{missingDates.map(renderPayment)}</details>}

      <details open><summary>Платежи и покупки · {money(plan.paymentTotal)}</summary>
        {plan.obligations.filter(row=>row.debt&&row.date).map(renderPayment)}
        {plan.obligations.some(row=>!row.debt&&row.date)&&<details><summary>Другие платежи и покупки</summary>
          {plan.obligations.filter(row=>!row.debt&&row.date).map(renderPayment)}
        </details>}
        {plan.paid.length>0&&<details><summary>Уже оплачено · {money(sum(plan.paid.map(row=>row.paid)))}</summary>{plan.paid.map(renderPayment)}</details>}
      </details>
      <details><summary>На жизнь · {money(plan.life)}</summary><Button variant="outline" onClick={openBudget}>Категории и резервы</Button></details>
      {!!plan.savings.length&&<details open><summary>{savedPlan?'Пополнения по твоему плану':'Предлагаемые пополнения'} · {money(savingTotal)}</summary>
        {plan.savings.map(row=>{
          const target=savedPlan?.[row.id]??row.suggested;
          return <div className="list-row" key={row.id}><span><b>{row.name}</b><small>Переведено {money(row.transferred)} · осталось {money(Math.max(0,target-row.transferred))}</small></span><strong>{money(target)}</strong></div>;
        })}
        {!prediction&&<p>Добавь цель, чтобы рассчитать пополнения.</p>}
      </details>}
      {plan.income<plan.paymentTotal+plan.life+leftToSave&&<p className="loss">Из ожидаемых доходов не хватает {money(plan.paymentTotal+plan.life+leftToSave-plan.income)}. Остаток на сегодня в эту сумму не заложен.</p>}
      <div className="dashboard-links"><Button variant="outline" onClick={openPayments}>Календарь платежей</Button><Button variant="outline" onClick={report}>Отчёт за месяц</Button></div>
    </section>
  );
}
