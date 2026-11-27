'use client';
import {Activity,ArrowDownLeft,ArrowLeftRight,ArrowUpRight,CalendarDays,ChartNoAxesCombined,ChevronRight,CircleDollarSign,Home,Landmark,Plus,ShieldCheck,Sparkles,Target,Wallet} from 'lucide-react';
import {Area,AreaChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {availableForGoal,balance,cash,calendar,categoryBudget,downPayment,first,forecast,money,month,remainingEvent,reserved,sum,type Data,type Entry} from '../lib/finance';
import {Button} from './ui/button';
export const shortDate=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{day:'numeric',month:'long',timeZone:'Asia/Almaty'}):'Дата не задана';
export const dayLabel=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{month:'short',year:'numeric',timeZone:'Asia/Almaty'}):'—';
const compact=(n:number)=>Math.abs(n)>=1e8?(n/1e8).toLocaleString('ru-KZ',{maximumFractionDigits:1})+' млн':Math.round(n/1e5)+' тыс.';
export const kinds={cash:Wallet,reserve:ShieldCheck,otbasy:Landmark,bcc:Landmark,market:Activity};

export function ForecastChart({rows,metric='savings'}:{rows:ReturnType<typeof forecast>['rows'];metric?:keyof Omit<ReturnType<typeof forecast>['rows'][number],'date'>}){
  return <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{top:10,right:10,left:0,bottom:0}}>
    <defs><linearGradient id="fillForecast" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#639b65" stopOpacity=".26"/><stop offset="100%" stopColor="#639b65" stopOpacity=".02"/></linearGradient></defs>
    <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 4"/>
    <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={x=>dayLabel(x).split(' ')[0]} minTickGap={22} tick={{fill:'var(--muted)',fontSize:12}}/>
    <YAxis tickLine={false} axisLine={false} tickFormatter={metric==='op'?x=>String(Math.round(x*10)/10):compact} tick={{fill:'var(--muted)',fontSize:12}} width={58}/>
    <Tooltip labelFormatter={x=>dayLabel(String(x))} formatter={v=>[metric==='op'?Number(v).toFixed(2):money(Number(v)),'Прогноз']} contentStyle={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,color:'var(--ink)'}}/>
    <Area type="monotone" dataKey={metric} stroke="#558b59" strokeWidth={2.5} fill="url(#fillForecast)" animationDuration={500}/>
  </AreaChart></ResponsiveContainer></div>;
}
export function Dashboard({data:d,date,go,operation,plan,moneyToday}:{data:Data;date:string;go:(page:string)=>void;operation:(kind:Entry['kind'])=>void;plan:()=>void;moneyToday?:React.ReactNode}){
  const goal=d.goals.find(g=>!g.completed);
  const start=first(date), end=month(start,1);
  const tx=d.transactions.filter(t=>t.date>=start&&t.date<end);
  const income=sum(tx.filter(t=>t.kind==='income').map(t=>t.amount));
  const expenses=sum(tx.filter(t=>t.kind==='expense').map(t=>t.amount));
  const events=calendar(d,date,month(date,2));
  const next=events.find(e=>e.kind==='income'&&remainingEvent(e,d.transactions)>0);
  const capital=sum(d.accounts.map(a=>balance(a,d.transactions)));
  const market=sum(d.accounts.filter(a=>a.kind==='market').map(a=>balance(a,d.transactions)));
  const saved=sum(d.accounts.filter(a=>availableForGoal(a,goal?.date??date)).map(a=>balance(a,d.transactions)));
  const target=goal?downPayment(goal)+goal.reserve:0;
  const progress=target?Math.min(100,100*saved/target):0;
  const prediction=goal?forecast(d,goal,date,d.scenarios[0]):null;
  const upcoming=events.filter(e=>e.kind!=='notice'&&remainingEvent(e,d.transactions)>0).slice(0,3);
  const planned=calendar(d,start,end).filter(e=>e.date<end&&e.status!=='canceled');
  const planIncome=sum(planned.filter(e=>e.kind==='income').map(e=>e.amount));
  const planExpense=sum(planned.filter(e=>e.kind==='expense').map(e=>e.amount))+sum(d.categories.map(c=>categoryBudget(d,c,date)));
  const stats=[
    {name:'Общий капитал',n:capital,sub:'На счетах и в активах',Icon:Wallet},
    {name:'Свободные деньги',n:cash(d)-reserved(d),sub:reserved(d)?'Резерв · '+money(reserved(d)):'Доступно к распределению',Icon:CircleDollarSign},
    {name:'Доходы в этом месяце',n:income,sub:planIncome?'План '+money(planIncome):'Фактические поступления',Icon:ArrowDownLeft},
    {name:'Расходы в этом месяце',n:expenses,sub:planExpense?'План '+money(planExpense):'Оплаченные операции',Icon:ArrowUpRight}
  ];
  return <>
    <div className="page-heading"><div><p className="eyebrow">{dayLabel(date)}</p><h1>Обзор финансов</h1><p>Ваши деньги, цели и ближайшие решения.</p></div><Button onClick={()=>operation('income')}><Plus size={19}/> Получил деньги</Button></div>
    {moneyToday}
    <div className="top-grid">
      <section className="hero">
        <div className="hero-label"><Target size={17}/> Финансовая цель</div>
        <h2>{goal?.name??'Добавьте первую цель'}</h2>
        <div className="hero-number">{money(saved)}</div>
        <div className="hero-caption">{goal?'из '+money(target)+' · взнос и подушка':'Накоплено на депозитах и в резерве'}</div>
        <div className="hero-progress"><div style={{width:progress+'%'}}/></div>
        <div className="hero-foot"><span>{progress.toLocaleString('ru-KZ',{maximumFractionDigits:1})}% цели</span><span>{target?'Осталось '+money(Math.max(0,target-saved)):'Цель в разделе «Цели»'}</span></div>
      </section>
      <section className="card next-card"><div className="icon-soft"><Sparkles size={20}/></div><p className="eyebrow">Ближайшее действие</p>
        <h2>{next?next.name:'План распределения'}</h2>
        <p>{next?shortDate(next.date)+' · '+money(remainingEvent(next,d.transactions)):'Распределите доступный остаток между платежами, бюджетом и накоплениями.'}</p>
        <Button variant="outline" onClick={plan}>Открыть помощник <ChevronRight size={16}/></Button>
      </section>
    </div>
    <div className="stat-grid">{stats.map(({name,n,sub,Icon})=><section className="card stat-card" key={name}><div className="stat-label"><span>{name}</span><Icon size={18}/></div><strong>{money(n)}</strong><small>{sub}</small></section>)}</div>
    <div className="bottom-grid">
      <section className="card chart-card"><div className="section-head"><div><h2>Прогноз накоплений</h2><p>{prediction?.reached?'Покупка по прогнозу · '+dayLabel(prediction.reached):'По текущему плану'}</p></div><Button variant="ghost" onClick={()=>go('analytics')} aria-label="Открыть аналитику"><ChartNoAxesCombined size={20}/></Button></div>
        {prediction?<ForecastChart rows={prediction.rows.slice(0,12)}/>:<p>Добавьте финансовую цель для расчёта.</p>}
      </section>
      <section className="card calendar-card"><div className="section-head"><div><h2>Ближайшие события</h2><p>Из финансового календаря</p></div><CalendarDays size={19}/></div>
        {upcoming.length?upcoming.map(e=><button className="event-row" key={e.id} onClick={()=>go('calendar')}><span className={'icon-soft '+(e.kind==='income'?'positive':'')} >{e.kind==='income'?<ArrowDownLeft size={18}/>:<ArrowUpRight size={18}/>}</span><span><b>{e.name}</b><small>{shortDate(e.date)}</small></span><strong>{money(e.amount)}</strong></button>):<p>Нет событий с заданной датой.</p>}
        <Button variant="ghost" onClick={()=>go('calendar')}>Весь календарь <ChevronRight size={16}/></Button>
      </section>
    </div>
    <section className="card"><div className="section-head"><div><h2>Мои счета</h2><p>Рыночные активы · {money(market)}</p></div><Button variant="outline" onClick={()=>go('accounts')}>Все счета <ChevronRight size={16}/></Button></div>
      <div className="account-strip">{d.accounts.slice(0,7).map(a=>{const Icon=kinds[a.kind];return <button key={a.id} onClick={()=>go('accounts')}><span className="icon-soft"><Icon size={17}/></span><span>{a.name}<b>{money(balance(a,d.transactions))}</b></span></button>})}</div>
    </section>
    <div className="quick"><Button variant="outline" onClick={()=>operation('expense')}><ArrowUpRight size={17}/> Добавить расход</Button><Button variant="outline" onClick={()=>operation('transfer')}><ArrowLeftRight size={17}/> Перевести деньги</Button><Button variant="outline" onClick={()=>go('goals')}><Home size={17}/> Цели</Button></div>
  </>;
}
