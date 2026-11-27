'use client';

import {CartesianGrid,Line,LineChart,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {money} from '../lib/finance';
import {dayLabel} from './dashboard';

export type ChartPoint={date:string;actual?:number;projected?:number};
const compact=(n:number)=>Math.abs(n)>=1e8?(n/1e8).toLocaleString('ru-KZ',{maximumFractionDigits:1})+' млн':Math.round(n/1e5)+' тыс.';

export default function ForecastChart({rows,caption,actual='Факт',projected='Прогноз',target,reached}:{rows:ChartPoint[];caption:string;
  actual?:string;projected?:string;target?:number;reached?:string}){
  return <figure className="analytics-figure">
    <div className="analytics-legend" aria-label="Легенда, суммы в тенге">
      <span><i className="chart-actual"/>{actual}</span>
      {rows.some(row=>row.projected!==undefined)&&<span><i className="chart-projected"/>{projected}</span>}
      {target!==undefined&&<span><i className="chart-target"/>Цель {money(target)}</span>}
      {reached&&<span>Плановая дата · {dayLabel(reached)}</span>}
      <span>₸</span>
    </div>
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{top:12,right:14,left:0,bottom:8}}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4"/>
          <XAxis dataKey="date" tickFormatter={date=>dayLabel(date).replace(' г.','')} minTickGap={18} tickLine={false} tick={{fill:'var(--muted)',fontSize:10}}/>
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{fill:'var(--muted)',fontSize:10}} width={57}/>
          <Tooltip labelFormatter={date=>dayLabel(String(date))} formatter={value=>money(Number(value))}
            contentStyle={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:8,color:'var(--ink)'}}/>
          {target!==undefined&&<ReferenceLine y={target} ifOverflow="extendDomain" stroke="var(--attention)" strokeDasharray="3 4"/>}
          {reached&&rows.some(row=>row.date===reached)&&<ReferenceLine x={reached} stroke="var(--attention)" strokeDasharray="3 4"/>}
          <Line dataKey="actual" name={actual} stroke="var(--ink)" strokeWidth={2} dot={{r:3,fill:'var(--ink)'}} isAnimationActive={false}/>
          <Line dataKey="projected" name={projected} stroke="var(--green)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
    <figcaption>{caption}</figcaption>
  </figure>;
}
