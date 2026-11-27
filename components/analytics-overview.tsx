'use client';

import {useState,type ReactNode} from 'react';
import dynamic from 'next/dynamic';
import {capitalHistory} from '../lib/analytics-view';
import {monthlyReport} from '../lib/cashflow';
import {calendar,categoryBudget,categorySpent,downPayment,effectiveDebt,first,goalHoldings,loanScore,month,remainingEvent,sum,type Data,type Goal,type forecast} from '../lib/finance';
import {nextMonthPlan} from '../lib/month-plan';
import {dayLabel} from './dashboard';
import {Amount,SectionHeading} from './ui/finance';
import {Button} from './ui/button';

const ForecastChart=dynamic(()=>import('./forecast-chart'));
type Projection=ReturnType<typeof forecast>;

export function AnalyticsOverview({data,day,goal,projection,scenario}:{data:Data;day:string;goal?:Goal;projection:Projection|null;scenario?:ReactNode}){
  const [metric,setMetric]=useState<'savings'|'capital'|'debt'>(goal?'savings':'capital');
  const report=monthlyReport(data,day);
  const monthPlan=nextMonthPlan(data,day,projection,first(day));
  const history=capitalHistory(data,day);
  const capital=history.at(-1)!.actual;
  const previousCapital=history.at(-2)?.actual;
  const debt=sum(data.debts.map(loan=>effectiveDebt(loan,data).balance));
  const nextPeriod=month(first(day),1);
  const debtExpense=(period:string)=>{
    const end=month(period,1);
    return sum(calendar(data,period,end).filter(event=>event.date<end&&data.debts.some(loan=>loan.id===event.rule))
      .map(event=>remainingEvent(event,data.transactions)));
  };
  const currentLoad=debtExpense(first(day));
  const nextLoad=debtExpense(nextPeriod);
  const target=goal?downPayment(goal)+goal.reserve:undefined;
  const progress=goal?goalHoldings(data,goal).total:0;
  const opGap=goal&&projection?.deadline?Math.max(0,loanScore(goal)+goal.buffer-projection.deadline.op):0;
  const targetDate=projection?.reached??'';
  const deadline=projection?.deadline;
  const metricName={savings:'Квартира',capital:'Капитал',debt:'Долг'}[metric];
  const end=metric==='savings'&&goal?[goal.latest,targetDate].sort().at(-1)!:month(day,12);
  const actual=metric==='capital'?history:[{date:day,actual:metric==='debt'?debt:progress}];
  const chartRows=[
    ...actual,
    ...(projection?.rows??[]).filter(row=>row.date>day&&row.date<=end).map(row=>({date:row.date,projected:row[metric]})),
  ];
  const gap=monthPlan.income-monthPlan.paymentTotal;
  const overdue=monthPlan.incomeEvents.filter(e=>e.date<day);
  const overspent=data.categories.map(category=>({name:category.name,amount:categorySpent(data,category.id,day)-categoryBudget(data,category,day)}))
    .filter(row=>row.amount>0).sort((a,b)=>b.amount-a.amount)[0];
  const lateIncome=sum(overdue.map(e=>remainingEvent(e,data.transactions)));
  return <>
    <section className="card analytics-summary">
      <SectionHeading title="Что видно за месяц" description={dayLabel(day)}/>
      <dl className="month-totals analytics-totals">
        {([
          ['Доходы',report.income],['Расходы',report.expenses],['Переведено в накопления',report.saved],
        ] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd><Amount value={value}/></dd></div>)}
      </dl>
      <ul className="insight-list">
        {(monthPlan.income>0||monthPlan.paymentTotal>0)&&<li>Осталось получить <Amount value={monthPlan.income}/> и оплатить <Amount value={monthPlan.paymentTotal}/>.
          {gap<0&&<> Платежи выше ожидаемых доходов на <Amount value={-gap}/>.</>}</li>}
        {lateIncome>0&&<li>После плановых дат пока не подтверждено <Amount value={lateIncome}/> поступлений.</li>}
        {overspent&&<li>Самое большое превышение плана — {overspent.name.toLocaleLowerCase('ru')} на <Amount value={overspent.amount}/>.</li>}
        <li>Капитал <Amount value={capital}/>{previousCapital!==undefined&&<> · с конца прошлого месяца <Amount value={capital-previousCapital} sign={capital>previousCapital?'+':''}/></>}.</li>
        {data.debts.length>0&&<li>Платежи по кредитам · осталось в этом месяце <Amount value={currentLoad}/>, в следующем по графику <Amount value={nextLoad}/>.</li>}
        {goal&&<li>На квартиру выделено <Amount value={progress}/> из <Amount value={target??0}/>.
          {deadline&&deadline.deficit>0&&<> К желаемой дате не хватает <Amount value={deadline.deficit}/>.</>}{opGap>0?' До ОП с запасом не хватает '+opGap.toFixed(2)+'.':''}</li>}

      </ul>
      {report.partial&&<p>Учёт за месяц неполный. Итоги включают подтверждённые записи.</p>}
    </section>
    {(projection||history.length>1)&&<section className="card">
      <SectionHeading title={metric==='savings'?'Прогноз покупки квартиры':metricName} action={scenario}/>
      <div className="quick analytics-metrics" role="group" aria-label="Вид графика">
        {(projection?['savings','capital','debt'] as const:['capital'] as const).map(item=><Button key={item}
          variant={metric===item?'default':'outline'} aria-pressed={metric===item} onClick={()=>setMetric(item)}>{{savings:'Квартира',capital:'Капитал',debt:'Долг'}[item]}</Button>)}
      </div>
      {chartRows.length>1&&<ForecastChart rows={chartRows} actual={metric==='savings'?'Факт · выделенные активы':'Факт'}
        projected={metric==='savings'?'Прогноз · доступно к сделке':'Прогноз'}
        target={metric==='savings'?(projection?.deadline?.target??target):undefined} reached={metric==='savings'?targetDate:undefined}
        caption={metric==='savings'?(targetDate?'Вертикальная отметка показывает первую дату, когда модель покрывает взнос, подушку и ОП.':'Кривая показывает доступные накопления. Дата появится после выполнения требований к взносу, подушке и ОП.'):
          metric==='capital'?'Капитал включает счета и активы. Пунктир зависит от выбранного сценария.':'График показывает остаток долга. Месячная нагрузка зависит от сроков и сумм отдельных платежей.'}/>}
      {metric==='capital'&&history.length===1&&<p>Фактический капитал показан на текущую дату. Для истории нужны даты начальных остатков.</p>}
      {metric==='savings'&&deadline&&deadline.deficit>0&&<p>Для сделки важна доступность средств. Рыночные активы переходят в прогноз после запланированной продажи.</p>}
    </section>}
  </>;
}
