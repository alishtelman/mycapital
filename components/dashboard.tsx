'use client';
import {Amount,Disclosure,FinancialRow,PaymentRow,Progress,SectionHeading} from './ui/finance';
import {Activity,ArrowDownLeft,ArrowLeftRight,ArrowUpRight,ChevronLeft,ChevronRight,Landmark,ShieldCheck,ShoppingBag,Wallet} from 'lucide-react';
import {addDays,balance,calendar,dailyBudget,depositTransfers,downPayment,dueDate,entryMonth,first,forecast,goalHoldings,livingReserve,money,month,remainingEvent,sum,type Data,type Event} from '../lib/finance';
import {safeEnvelopeSpending} from '../lib/envelopes';
import {nextMonthPlan} from '../lib/month-plan';
import {Button} from './ui/button';
export const shortDate=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{day:'numeric',month:'long',timeZone:'Asia/Almaty'}):'Дата не задана';
export const dayLabel=(date:string)=>date?new Date(date+'T12:00:00+05:00').toLocaleDateString('ru-KZ',{month:'short',year:'numeric',timeZone:'Asia/Almaty'}):'—';
export const kinds={cash:Wallet,reserve:ShieldCheck,otbasy:Landmark,bcc:Landmark,market:Activity};

function savingsRows(data:Data,prediction:ReturnType<typeof forecast>|null,period:string,standard:ReturnType<typeof nextMonthPlan>['savings']){
  const saved=data.settings.monthlySavingPlan?.[period];
  const cushionRows=(prediction?.deposits??[]).filter(row=>first(row.date)===period&&!standard.some(account=>account.id===row.account));
  const cushions=[...Map.groupBy(cushionRows,row=>row.account)].map(([account,rows])=>{
    const transferred=account?depositTransfers(data,account,period):0;
    return {id:account,name:data.accounts.find(a=>a.id===account)?.name??'Финансовая подушка',
      transferred,suggested:transferred+sum(rows.map(row=>row.amount))};
  });
  return [...standard,...cushions].map(row=>({...row,amount:Math.max(0,(saved?.[row.id]??row.suggested)-row.transferred)}));
}

export function Dashboard({data:d,date,go,updateBalance,income,expense,transfer,purchase,prediction,openPayment,openMonth}:{data:Data;date:string;go:(page:string)=>void;updateBalance:()=>void;income:(event?:Event)=>void;expense:()=>void;transfer:()=>void;purchase:()=>void;prediction:ReturnType<typeof forecast>|null;openPayment:(event:Event)=>void;openMonth:(period:string)=>void}){
  const goal=d.goals.find(g=>!g.completed);
  const spending=dailyBudget(d,date);
  const safe=safeEnvelopeSpending(d,date,spending);
  const holdings=goal?goalHoldings(d,goal):null;
  const target=goal?downPayment(goal)+goal.reserve:0;
  const upcoming=calendar(d,month(date,-1),addDays(date,30)).filter(e=>e.kind==='expense'&&remainingEvent(e,d.transactions)>0)
    .sort((a,b)=>dueDate(a).localeCompare(dueDate(b)));
  const nextPlan=nextMonthPlan(d,date,prediction);
  const deposits=savingsRows(d,prediction,nextPlan.period,nextPlan.savings).filter(row=>row.amount>0);
  const advice=[
    spending.shortage>0?{name:'Проверьте покрытие обязательных платежей',action:()=>go('calendar')}:null,
    !d.settings.monthlySavingPlan?.[nextPlan.period]&&deposits.length?{name:'Проверьте план следующего месяца',action:()=>openMonth(nextPlan.period)}:null,
    goal&&prediction?.deadline?.deficit?{name:'Посмотрите, что сдвигает дату покупки',action:()=>go('analytics')}:null,
  ].filter(item=>item!==null).slice(0,3);
  return <>
    <SectionHeading page title="Главная" description={dayLabel(date)}/>
    <section className="card capital-summary home-balance">
      <div><h2>Общий капитал</h2><Amount className="large" value={sum(d.accounts.map(a=>balance(a,d.transactions)))}/></div>
      <div><h2>Безопасно на жизнь</h2><Amount className="safe-amount" value={safe}/><p>{spending.income?'До '+shortDate(spending.end):'До конца расчётного периода'}</p></div>
    </section>
    <div className="home-quick" aria-label="Быстрые действия">
      <Button onClick={expense}><ArrowUpRight size={18}/>Расход</Button>
      <Button variant="outline" onClick={()=>income()}><ArrowDownLeft size={18}/>Доход</Button>
      <Button variant="outline" onClick={transfer}><ArrowLeftRight size={18}/>Перевод</Button>
      <Button variant="outline" onClick={purchase}><ShoppingBag size={18}/>Покупка</Button>
      <Button variant="ghost" onClick={updateBalance}>Сверить остаток</Button>
    </div>
    {upcoming.length>0&&<section className="card">
      <SectionHeading title="Ближайшие платежи" action={<Button variant="ghost" onClick={()=>go('calendar')}>Все платежи</Button>}/>
      {upcoming.slice(0,3).map(e=><PaymentRow key={e.id} name={e.name}
        detail={shortDate(dueDate(e))} status={dueDate(e)<date?'Просрочен':undefined}
        value={<Amount value={remainingEvent(e,d.transactions)}/>} onClick={()=>openPayment(e)}/>)}
    </section>}
    {!!advice.length&&<section className="card"><SectionHeading title="Что сделать дальше"/>
      {advice.map(item=><FinancialRow key={item.name} name={item.name} onClick={item.action}/>)}
    </section>}
    {(target>0||deposits.length>0)&&<div className="split home-insights">
      {target>0&&<section className="card">
        <SectionHeading title="Моя квартира" action={<Button variant="ghost" onClick={()=>go('goals')}>Открыть цель</Button>}/>
        <Amount className="large" value={holdings?.total??0}/>
        <p>из {money(target)}{prediction?.reached?' · прогноз '+dayLabel(prediction.reached):''}</p>
        <Progress className="insight-track" label="Прогресс к покупке квартиры" value={(holdings?.total??0)/target*100}/>
      </section>}
      {deposits.length>0&&<section className="card">
        <SectionHeading title="План накоплений" description={dayLabel(nextPlan.period)}/>
        {deposits.map(deposit=><FinancialRow key={deposit.id} name={deposit.name} value={<Amount value={deposit.amount}/>}/>)}
      </section>}
    </div>}
  </>;
}

export function MonthScreen({data,date,period,prediction,changePeriod,editPlan,openBudget,openPayments,report,openPayment}:{data:Data;date:string;period:string;prediction:ReturnType<typeof forecast>|null;changePeriod:(period:string)=>void;editPlan:(period:string)=>void;openBudget:()=>void;openPayments:()=>void;report:()=>void;openPayment:(row:ReturnType<typeof nextMonthPlan>['obligations'][number])=>void}){
  const plan=nextMonthPlan(data,date,prediction,period);
  const saved=data.settings.monthlySavingPlan?.[period];
  const received=sum(data.transactions.filter(row=>entryMonth(row)===period&&row.kind==='income').map(row=>row.amount));
  const living=livingReserve(data,undefined,period);
  const deposits=savingsRows(data,prediction,period,plan.savings);
  const toSave=sum(deposits.map(row=>row.amount));
  const label=new Intl.DateTimeFormat('ru-KZ',{month:'long',year:'numeric',timeZone:'Asia/Almaty'}).format(new Date(period+'T12:00:00+05:00'));
  return <section className="card month-screen">
    <header className="month-toolbar">
      <div className="month-switcher" role="group" aria-label="Период плана">
        <Button variant="ghost" className="month-step" aria-label="Предыдущий месяц" onClick={()=>changePeriod(month(period,-1))}><ChevronLeft size={18}/></Button>
        <h1>{label}</h1>
        <Button variant="ghost" className="month-step" aria-label="Следующий месяц" onClick={()=>changePeriod(month(period,1))}><ChevronRight size={18}/></Button>
      </div>
      <Button variant="ghost" onClick={report}>Отчёт за месяц</Button>
    </header>
    <dl className="month-totals">
      {([
        ['Получено',received],['Ожидается',plan.income],['Нужно оплатить',plan.paymentTotal],
        ['Выделено на жизнь',living],['Направить на накопления',toSave],
      ] as const).map(([name,amount])=><div key={name}><dt>{name}</dt><dd><Amount value={amount}/></dd></div>)}
    </dl>
    {plan.incomeEvents.length>0&&<Disclosure summary="Поступления по датам">
      {plan.incomeEvents.map(e=><FinancialRow key={e.id} name={e.name} detail={shortDate(e.date)} value={<Amount value={remainingEvent(e,data.transactions)}/>}/>)}
    </Disclosure>}
    {plan.obligations.length>0&&<Disclosure summary="Что оплатить">
      {plan.obligations.map(row=><PaymentRow key={row.id} name={row.name} detail={row.date?shortDate(row.date):'Указать дату'}
        status={row.held?'Зарезервировано '+money(row.held):undefined} value={<Amount value={row.amount}/>} onClick={()=>openPayment(row)}/>)}
      <Button variant="ghost" onClick={openPayments}>Календарь платежей</Button>
    </Disclosure>}
    <div className="month-life"><p>План на жизнь {money(plan.life)}</p><Button variant="ghost" onClick={openBudget}>Кошельки</Button></div>
    {deposits.length>0&&<Disclosure summary="В какие счета пополнить">
      {deposits.map(row=><FinancialRow key={row.id} name={row.name} detail={row.transferred?'Уже переведено '+money(row.transferred):undefined} value={<Amount value={row.amount}/>}/>)}
      {plan.savings.length>0&&<Button variant="outline" onClick={()=>editPlan(period)}>{saved?'Изменить план':'Задать свой план'}</Button>}
    </Disclosure>}
  </section>;
}
