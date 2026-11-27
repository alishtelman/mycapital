'use client';
import {Activity,CalendarDays,Landmark,Plus,ShieldCheck,Target,Wallet} from 'lucide-react';
import {availableForGoal,balance,cash,calendar,downPayment,effectiveDebt,forecast,money,month,reserved,sum,type Data,type Event} from '../lib/finance';
import {paymentState} from '../lib/cashflow';
import {Button} from './ui/button';
export const shortDate=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{day:'numeric',month:'long',timeZone:'Asia/Almaty'}):'Дата не задана';
export const dayLabel=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{month:'short',year:'numeric',timeZone:'Asia/Almaty'}):'—';
export const kinds={cash:Wallet,reserve:ShieldCheck,otbasy:Landmark,bcc:Landmark,market:Activity};

export function Dashboard({data:d,date,go,income,onEvent,prediction,moneyToday}:{data:Data;date:string;go:(page:string)=>void;income:()=>void;onEvent:(event:Event)=>void;prediction:ReturnType<typeof forecast>|null;moneyToday:React.ReactNode}){
  const goal=d.goals.find(g=>!g.completed);
  const events=calendar(d,date,month(date,2)).filter(e=>e.kind!=='notice'&&e.status!=='canceled'&&e.date>=date);
  const upcoming=events.filter(e=>e.kind==='expense').slice(0,3);
  const capital=sum(d.accounts.map(a=>balance(a,d.transactions)));
  const savings=sum(d.accounts.filter(a=>a.kind!=='cash').map(a=>balance(a,d.transactions)));
  const debts=sum(d.debts.map(debt=>effectiveDebt(debt,d).balance));
  const saved=sum(d.accounts.filter(a=>availableForGoal(a,goal?.date??date)).map(a=>balance(a,d.transactions)));
  const target=goal?downPayment(goal)+goal.reserve:0;
  const progress=target?Math.min(100,100*saved/target):0;
  return <>
    <div className="page-heading"><div><p className="eyebrow">{dayLabel(date)}</p><h1>Главная</h1></div><Button onClick={income}><Plus size={19}/> Получил деньги</Button></div>
    <section className="card capital-summary">
      <div className="section-head"><div><h2>Мой капитал</h2><strong className="large">{money(capital)}</strong></div><Button variant="outline" onClick={()=>go('accounts')}>Мои счета</Button></div>
      <dl className="capital-breakdown">
        <div><dt>Доступно на счетах</dt><dd>{money(cash(d)-reserved(d))}</dd></div>
        <div><dt>Накопления и активы</dt><dd>{money(savings)}</dd></div>
        <div><dt>Отложено в бюджете</dt><dd>{money(reserved(d))}</dd></div>
        <div><dt>Капитал за вычетом долгов</dt><dd>{money(capital-debts)}</dd></div>
      </dl>
    </section>
    {moneyToday}
    <div className="split">
      <section className="card"><div className="section-head"><h2>Моя цель</h2><Target size={20}/></div>
        {goal?<><h3>{goal.name}</h3><strong className="large">{money(saved)}</strong>
          <p>из {money(target)} на взнос и подушку</p>
          <div className="progress"><div style={{width:progress+'%'}}/></div>
          <p>{progress.toLocaleString('ru-KZ',{maximumFractionDigits:1})}% цели · ещё {money(Math.max(0,target-saved))}</p>
          <p>{prediction?.reached?'Покупка по прогнозу в '+dayLabel(prediction.reached):'При текущем плане дата покупки не определена'}</p>
          <details><summary>Подробнее</summary><p>Квартира {money(goal.price)} · взнос {money(downPayment(goal))}</p><p>Целевой ОП {goal.score} · расчётный к дате цели {prediction?.deadline?.op.toFixed(2)??'—'}</p></details>
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
