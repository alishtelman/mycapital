'use client';
import {useState} from 'react';
import {Area,AreaChart,CartesianGrid,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {cashflow,paymentState} from '../lib/cashflow';
import {first,money,month,type Data,type Event} from '../lib/finance';
import {shortDate} from './dashboard';

export default function FlowCalendar({data,date,next,open}:{data:Data;date:string;next:string;open:(e:Event)=>void}){
  const [period,P]=useState('7');
  const horizon=period==='next'?Math.max(1,Math.round((Date.parse(next)-Date.parse(date))/86400000)):period==='month'?Math.round((Date.parse(month(first(date),1))-Date.parse(date))/86400000):Number(period);
  const rows=cashflow(data,date,horizon);
  return <section className="card"><div className="section-head"><div><h2>Денежные потоки</h2><p>Прогноз свободного остатка по дням</p></div>
    <select aria-label="Период потоков" value={period} onChange={e=>P(e.target.value)}>{[['1','Сегодня'],['7','Ближайшие 7 дней'],['next','До следующей зарплаты'],['month','Текущий месяц'],['90','Следующие 90 дней'],['365','Год']].map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></div>
    {rows.length>1&&<div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows}><CartesianGrid stroke="var(--line)" vertical={false}/><XAxis dataKey="date" tickFormatter={x=>x.slice(5)} minTickGap={20}/><YAxis tickFormatter={n=>Math.round(Number(n)/100000)+'к'}/><ReferenceLine y={0} stroke="var(--danger)"/><Tooltip formatter={n=>money(Number(n))} labelFormatter={x=>shortDate(String(x))}/><Area dataKey="available" name="Свободный остаток" type="linear" stroke="#558b59" fill="#c3e1c4"/></AreaChart></ResponsiveContainer></div>}
    <div className="schedule">{rows.filter(r=>rows.length<=7||r.cause||r.events.length).map(r=><div className="flow-day" key={r.date}><div className="subline"><b>{shortDate(r.date)}</b><b className={r.available<0?'loss':''}>{money(r.available)}</b></div>
      {r.cause&&<p className="loss">Риск нехватки: {r.cause}. Проверьте платежи и планы пополнения.</p>}
      {r.events.map(e=><button className="list-row" key={e.id} onClick={()=>open(e)}><span><b>{e.name}</b><small>{e.kind==='expense'?paymentState(data,e,date).label:e.kind==='income'?'Поступление':e.kind==='saving'?'Пополнение':'Напоминание'}</small></span><strong>{money(e.amount)}</strong></button>)}</div>)}</div>
  </section>;
}

