'use client';

import {useMemo} from 'react';
import {loanScore,money,type Data,type Goal} from '../lib/finance';
import {monthlySavingsRows,savingsActions,savingsCorrections,savingsSensitivity,type SavingsOptimization} from '../lib/savings-plan';
import {dayLabel,shortDate} from './dashboard';
import {Amount,Blank,Disclosure,FinancialRow,SectionHeading,Status} from './ui/finance';

export function SavingsRoadmap({data,goal,day,optimized,updateTask}:{data:Data;goal:Goal;day:string;optimized:SavingsOptimization;
  updateTask:(id:string,name:string,date:string,done:boolean)=>void}){
  const rows=useMemo(()=>monthlySavingsRows(data,optimized,[goal.latest,optimized.estimate.reached].sort().at(-1)!),[data,optimized,goal.latest]);
  const tasks=useMemo(()=>savingsActions(data,goal,day,optimized),[data,goal,day,optimized]);
  const gaps=useMemo(()=>savingsCorrections(data,goal,day,optimized),[data,goal,day,optimized]);
  const sensitivity=useMemo(()=>savingsSensitivity(data,goal,day,optimized.model),[data,goal,day,optimized.model]);
  return <section className="card">
    <SectionHeading title="План накоплений по месяцам" description="Прогноз на основе ваших остатков, календаря и условий вкладов."/>
    <p><Status tone={optimized.coverage?'success':'attention'}>{optimized.coverage?'Все условия модели к желаемой дате выполнены':'К желаемой дате остаются ограничения'}</Status></p>
    <p>По прогнозу {optimized.estimate.reached?dayLabel(optimized.estimate.reached):'нет даты в ближайшие 36 месяцев'} · желаемый срок {dayLabel(goal.date)}–{dayLabel(goal.latest)}.</p>
    <p>Порог ОП {loanScore(goal).toFixed(2)} · с вашим запасом {(loanScore(goal)+goal.buffer).toFixed(2)}. Семейный ОП требует сверки с банком. <a className="savings-source" href="https://hcsbk.kz/ru/faq/2562/2598/?SEC=2562">Условия Отбасы</a></p>
    {!goal.intermediate&&<p>Сейчас используется ОП из настроек цели. Для подтверждённого стандартного промежуточного займа действуют ориентиры 50% взноса и ОП от 5.</p>}
    <p>Продажи учитываются по введённой оценке выручки. Расчёт основывается на банком подтверждённых суммах госпремий, если они ещё ожидают зачисления.</p>
    {gaps&&<Disclosure summary="Почему меняется срок и что можно сделать">
      <dl>
        <dt>Нехватка взноса и подушки</dt><dd><Amount value={gaps.cashDeficit}/></dd>
        <dt>Разрыв ОП с запасом</dt><dd>{gaps.opGap.toFixed(2)}</dd>
        <dt>Кассовый разрыв до срока</dt><dd><Amount value={gaps.liquidity}/></dd>
      </dl>
      {gaps.cashDeficit>0&&<p>Чтобы сократить денежный разрыв, нужен дополнительный чистый поток порядка {money(gaps.monthlyLowerBound)} в месяц без учёта процентов и ОП.</p>}
      {gaps.additionalMonthly!==null&&gaps.additionalMonthly>0&&<p>Пересчёт показывает вариант с дополнительными {money(gaps.additionalMonthly)} чистыми в начале каждого месяца. Для него проверен сценарий с пределом до 90% ранних пополнений Отбасы.</p>}
      {gaps.opGap>0&&gaps.earlyOpContribution!==null&&<p>Для закрытия разрыва по ОП по отдельности расчёт требует раннего взноса порядка {money(gaps.earlyOpContribution)} на самый доходный вклад Отбасы при текущей ставке и сроке.</p>}
      {gaps.liquidity>0&&<p>Оставьте в доступных деньгах минимум {money(gaps.liquidity)} дополнительно или перенесите ближайший расход на дату после его финансирования.</p>}
      {gaps.priceLimit!==null&&gaps.cashDeficit>0&&<p>По сумме взноса ориентир цены — до {money(gaps.priceLimit)} при цене и доле взноса выбранного сценария. ОП и платёжеспособность проверяются отдельно.</p>}
      {gaps.lateDeficit!==undefined&&<p>К {dayLabel(goal.latest)} ожидаемый дефицит {money(gaps.lateDeficit)}, ОП {gaps.lateOp?.toFixed(2)}.</p>}
      {sensitivity.withoutSales&&<p>Без плановых продаж дефицит к желаемой дате {money(sensitivity.withoutSales.deficit)}.</p>}
      {!!sensitivity.verifiedBonus?.bonus&&sensitivity.verifiedBonus.bonus!>(optimized.end?.bonus??0)&&<p>Если премии с проверенными условиями будут зачислены, в сценарии они составят до {money(sensitivity.verifiedBonus.bonus)}. Банк подтвердит сумму отдельно.</p>}
    </Disclosure>}
    <Disclosure summary="Сравнить варианты распределения"><p>Доля ограничивает ранние пополнения для ОП. Ваши назначения и пополнения под проверенную базу премии рассчитываются отдельно.</p>
      {optimized.candidates.map(candidate=><FinancialRow key={candidate.share} name={'До '+candidate.share+'% в Отбасы'+(candidate.share===optimized.share?' · выбран':'')}
        detail={candidate.coverage?'Выполняет условия':`Разрыв ОП ${candidate.opGap.toFixed(2)} · кассовый разрыв ${money(candidate.liquidity)}`}
        value={candidate.end?money(candidate.end.deficit):'—'}/>)}
    </Disclosure>
    {!rows.length&&<Blank>В выбранном периоде нет будущих расчётных месяцев.</Blank>}
    {rows.map((row,index)=><Disclosure key={row.period} open={index===0||undefined} summary={<>{dayLabel(row.period)} · <Amount value={row.savings}/></>}>
      <dl className="savings-month-figures">
        <dt>{index===0?'Капитал на дату расчёта':'Начальный капитал'}</dt><dd><Amount value={row.opening}/></dd>
        <dt>Поступления · план / факт</dt><dd><Amount value={row.income}/> / <Amount value={row.actualIncome}/></dd>
        <dt>Расходы · план / факт</dt><dd><Amount value={row.expenses}/> / <Amount value={row.actualExpenses}/></dd>
        {row.sale>0&&<><dt>Продажа активов · план</dt><dd><Amount value={row.sale}/></dd></>}
        <dt>Ожидаемые проценты</dt><dd><Amount value={row.interest}/></dd>
        {row.bonus>0&&<><dt>Госпремия по данным банка</dt><dd><Amount value={row.bonus}/></dd></>}
        <dt>Прогноз ОП</dt><dd>{row.op.toFixed(2)}</dd>
        <dt>Итоговые накопления к цели</dt><dd><Amount value={row.savings}/></dd>
        <dt>Итоговый капитал с активами</dt><dd><Amount value={row.capital}/></dd>
      </dl>
      <p>План показывает будущие операции с даты расчёта. Факт включает записанные операции бюджетного месяца.</p>
      {row.deposits.map(deposit=><FinancialRow key={deposit.id} name={deposit.name}
        detail={(deposit.reason||(deposit.funded?'Записанный перевод':'Пополнение не запланировано'))+' · факт '+money(deposit.funded)}
        value={<Amount value={deposit.amount}/>}/>)}
    </Disclosure>)}
    <Disclosure summary="Дорожная карта"><div>
      {tasks.map(task=>{
        const saved=data.settings.roadmap?.[task.id];
        const date=saved?.date??task.date,done=Boolean(saved?.done);
        return <FinancialRow key={task.id} name={task.name}
          detail={<>{shortDate(date)} · {dayLabel(date)} · {task.detail}{done?' · выполнено':''}</>}
          value={task.amount?money(task.amount):undefined} onClick={()=>updateTask(task.id,task.name,date,done)}/>;
      })}
    </div></Disclosure>
  </section>;
}
