'use client';
import {Activity,ArrowDownLeft,ArrowLeftRight,ArrowUpRight,CalendarDays,Landmark,ShieldCheck,ShoppingBag,Target,Wallet} from 'lucide-react';
import {balance,cash,calendar,downPayment,effectiveDebt,forecast,goalHoldings,money,month,reserved,sum,type Data,type Event} from '../lib/finance';
import {paymentState} from '../lib/cashflow';
import {Button} from './ui/button';
export const shortDate=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{day:'numeric',month:'long',timeZone:'Asia/Almaty'}):'Дата не задана';
export const dayLabel=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{month:'short',year:'numeric',timeZone:'Asia/Almaty'}):'—';
export const kinds={cash:Wallet,reserve:ShieldCheck,otbasy:Landmark,bcc:Landmark,market:Activity};

export function Dashboard({data:d,date,go,income,expense,transfer,purchase,onEvent,prediction,moneyToday}:{data:Data;date:string;go:(page:string)=>void;income:()=>void;expense:()=>void;transfer:()=>void;purchase:()=>void;onEvent:(event:Event)=>void;prediction:ReturnType<typeof forecast>|null;moneyToday:React.ReactNode}){
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
      <div className="section-head"><div><h2>Мой капитал</h2><strong className="large">{money(capital)}</strong></div><Button variant="outline" onClick={()=>go('accounts')}>Мои счета</Button></div>
      <dl className="capital-breakdown">
        <div><dt>Доступно на счетах</dt><dd>{money(cash(d)-reserved(d))}</dd></div>
        <div><dt>Накопления и активы</dt><dd>{money(savings)}</dd></div>
      </dl>
      <details><summary>Как рассчитано?</summary>
        <p>Денежные счета {money(cash(d))} · из них зарезервировано {money(reserved(d))}.</p>
        <p>Свободно для распределения {money(cash(d)-reserved(d))}.</p>
        <p>Чистая финансовая позиция {money(capital-debts)} после вычета долгов {money(debts)}.</p>
      </details>
    </section>
    <div className="dashboard-actions">
      <Button onClick={income}><ArrowDownLeft size={18}/> Доход</Button>
      <Button variant="outline" onClick={expense}><ArrowUpRight size={18}/> Расход</Button>
      <Button variant="outline" onClick={transfer}><ArrowLeftRight size={18}/> Перевод</Button>
      <Button variant="outline" onClick={purchase}><ShoppingBag size={18}/> Хочу купить</Button>
    </div>
    {moneyToday}
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
