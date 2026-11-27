'use client';
import {useState} from 'react';
import {Activity,ArrowDownLeft,ArrowLeftRight,ArrowUpRight,CalendarDays,Landmark,ShieldCheck,ShoppingBag,Target,Wallet} from 'lucide-react';
import {balance,cash,calendar,downPayment,effectiveDebt,first,forecast,goalHoldings,money,month,reserved,sum,type Data,type Event} from '../lib/finance';
import {nextMonthPlan} from '../lib/month-plan';
import {paymentState} from '../lib/cashflow';
import {Button} from './ui/button';
export const shortDate=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{day:'numeric',month:'long',timeZone:'Asia/Almaty'}):'Дата не задана';
export const dayLabel=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{month:'short',year:'numeric',timeZone:'Asia/Almaty'}):'—';
export const kinds={cash:Wallet,reserve:ShieldCheck,otbasy:Landmark,bcc:Landmark,market:Activity};

export function Dashboard({data:d,date,go,updateBalance,editPlan,income,expense,transfer,purchase,onEvent,prediction,moneyToday}:{data:Data;date:string;go:(page:string)=>void;updateBalance:()=>void;editPlan:(period:string)=>void;income:()=>void;expense:()=>void;transfer:()=>void;purchase:()=>void;onEvent:(event:Event)=>void;prediction:ReturnType<typeof forecast>|null;moneyToday:React.ReactNode}){
  const [showCurrent,setShowCurrent]=useState(Boolean(d.settings.monthlySavingPlan?.[first(date)]));
  const plan=nextMonthPlan(d,date,prediction,showCurrent?first(date):undefined);
  const savedPlan=d.settings.monthlySavingPlan?.[plan.period];
  const savingTotal=sum(plan.savings.map(row=>savedPlan?.[row.id]??row.suggested));
  const goal=d.goals.find(g=>!g.completed);
  const events=calendar(d,date,month(date,2)).filter(e=>e.kind!=='notice'&&e.status!=='canceled'&&e.date>=date);
  const upcoming=events.filter(e=>e.kind==='expense').slice(0,3);
  const capital=sum(d.accounts.map(a=>balance(a,d.transactions)));
  const savings=sum(d.accounts.filter(a=>a.kind!=='cash').map(a=>balance(a,d.transactions)));
  const debts=sum(d.debts.map(debt=>effectiveDebt(debt,d).balance));
  const holdings=goal?goalHoldings(d,goal):null;
  const saved=holdings?.total??0;
  const target=goal?downPayment(goal)+goal.reserve:0;
  const progress=target?Math.min(100,100*saved/target):0;
  return <>
    <div className="page-heading"><div><p className="eyebrow">{dayLabel(date)}</p><h1>Главная</h1></div></div>
    <section className="card capital-summary">
      <div className="section-head"><div><h2>Свободные деньги сейчас</h2><strong className="large">{money(cash(d)-reserved(d))}</strong></div><Button variant="outline" onClick={updateBalance}>Указать остаток</Button></div>
      <dl className="capital-breakdown">
        <div><dt>Всего на счетах и в активах</dt><dd>{money(capital)}</dd></div>
        <div><dt>Накопления и активы</dt><dd>{money(savings)}</dd></div>
      </dl>
      <details><summary>Как рассчитано?</summary>
        <p>Денежные счета {money(cash(d))} · из них зарезервировано {money(reserved(d))}.</p>
        <Button variant="outline" onClick={()=>go('accounts')}>Все счета</Button>
        <p>Чистая финансовая позиция {money(capital-debts)} после вычета долгов {money(debts)}.</p>
      </details>
    </section>
    <div className="dashboard-actions">
      <Button onClick={income}><ArrowDownLeft size={18}/> Доход</Button>
      <Button variant="outline" onClick={expense}><ArrowUpRight size={18}/> Расход</Button>
      <Button variant="outline" onClick={transfer}><ArrowLeftRight size={18}/> Перевод</Button>
      <Button variant="outline" onClick={purchase}><ShoppingBag size={18}/> Хочу купить</Button>
    </div>
    <section className="card">
      <div className="section-head"><div><h2>{showCurrent?'План на этот месяц':'План на следующий месяц'}</h2><p>{dayLabel(plan.period)}</p></div>
        {!!plan.savings.length&&<Button variant="outline" onClick={()=>editPlan(plan.period)}>{savedPlan?'Изменить план':'Сохранить свой план'}</Button>}
      </div>
      <Button variant="ghost" onClick={()=>setShowCurrent(!showCurrent)}>{showCurrent?'Следующий месяц':'Этот месяц'}</Button>
      <div className="list-row"><b>Ожидаемые поступления</b><strong>{money(plan.income)}</strong></div>
      <div className="list-row"><b>На повседневные расходы</b><strong>{money(plan.life)}</strong></div>
      <div className="list-row"><b>На платежи и покупки</b><strong>{money(plan.paymentTotal)}</strong></div>
      {plan.obligations.filter(row=>row.debt).map(row=><div className="list-row" key={row.id}><span><b>{row.name}</b><small>{row.date?shortDate(row.date):'Дата пока не указана'}</small></span><strong>{money(row.amount)}</strong></div>)}
      {plan.obligations.some(row=>!row.debt)&&<details><summary>Другие платежи и покупки</summary>
        {plan.obligations.filter(row=>!row.debt).map(row=><div className="list-row" key={row.id}><span><b>{row.name}</b><small>{row.date?shortDate(row.date):'Дата пока не указана'}</small></span><strong>{money(row.amount)}</strong></div>)}
      </details>}
      {!!plan.savings.length&&<details open><summary>{savedPlan?'Пополнения по твоему плану':'Предлагаемые пополнения'} · {money(savingTotal)}</summary>
        {plan.savings.map(row=><div className="list-row" key={row.id}><b>{row.name}</b><strong>{money(savedPlan?.[row.id]??row.suggested)}</strong></div>)}
        {!prediction&&<p>Добавь цель, чтобы рассчитать пополнения.</p>}
      </details>}
      {plan.income<plan.paymentTotal+plan.life+savingTotal&&<p className="loss">Из ожидаемых доходов не хватает {money(plan.paymentTotal+plan.life+savingTotal-plan.income)}. Остаток на сегодня в эту сумму не заложен.</p>}
      <p>Это план. Поступления и расходы записывай после того, как деньги реально придут или будут потрачены.</p>
    </section>
    <details className="card"><summary>Подробнее о сегодняшнем бюджете</summary>{moneyToday}</details>
    <div className="split">
      <section className="card"><div className="section-head"><h2>Моя цель</h2><Target size={20}/></div>
        {goal&&holdings?<><h3>{goal.name}</h3><strong className="large">{money(saved)}</strong>
          <p>из {money(target)} на взнос и подушку</p>
          <div className="progress"><div style={{width:progress+'%'}}/></div>
          <p>{progress.toLocaleString('ru-KZ',{maximumFractionDigits:1})}% цели · ещё {money(Math.max(0,target-saved))}</p>
          <p>{prediction?.reached?'Покупка по прогнозу в '+dayLabel(prediction.reached):'При текущем плане дата покупки не определена'}</p>
          <details><summary>Подробнее</summary><p>Квартира {money(goal.price)} · взнос {money(downPayment(goal))}</p>
          <p>В Отбасы {money(holdings.otbasy)} · на вкладах БЦК {money(holdings.bcc)}</p>
          <p>На взнос деньгами к сроку {money(holdings.downPaymentFunds)} · подушка {money(holdings.cushion)} из {money(goal.reserve)}</p>
          {holdings.market>0&&<p>Рыночные активы {money(holdings.market)} по текущей оценке. Для взноса потребуется продажа.</p>}<p>Целевой ОП {goal.score} · расчётный к дате цели {prediction?.deadline?.op.toFixed(2)??'—'}</p></details>
        </>:<p>Добавьте финансовую цель для расчёта.</p>}
        <Button variant="ghost" onClick={()=>go('goals')}>Открыть цель</Button>
      </section>
      <section className="card"><div className="section-head"><h2>Ближайшие платежи</h2><CalendarDays size={20}/></div>
        {upcoming.length?upcoming.map(e=><button className="list-row" key={e.id} onClick={()=>onEvent(e)}><span><b>{e.name}</b><small>{shortDate(e.date)} · {paymentState(d,e,date).label}</small></span><strong>{money(e.amount)}</strong></button>):<p>Нет платежей с заданной датой.</p>}
        <Button variant="ghost" onClick={()=>go('calendar')}>Весь календарь</Button>
      </section>
    </div>
  </>;
}
