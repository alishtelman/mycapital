'use client';
import {Area,AreaChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {forecast,money} from '../lib/finance';
import {dayLabel} from './dashboard';
const compact=(n:number)=>Math.abs(n)>=1e8?(n/1e8).toLocaleString('ru-KZ',{maximumFractionDigits:1})+' млн':Math.round(n/1e5)+' тыс.';
export default function ForecastChart({rows,metric='savings'}:{rows:ReturnType<typeof forecast>['rows'];metric?:keyof Omit<ReturnType<typeof forecast>['rows'][number],'date'>}){
  return <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{top:10,right:10,left:0,bottom:0}}>
    <defs><linearGradient id="fillForecast" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#639b65" stopOpacity=".26"/><stop offset="100%" stopColor="#639b65" stopOpacity=".02"/></linearGradient></defs>
    <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 4"/>
    <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={x=>dayLabel(x).split(' ')[0]} minTickGap={22} tick={{fill:'var(--muted)',fontSize:12}}/>
    <YAxis tickLine={false} axisLine={false} tickFormatter={metric==='op'?x=>String(Math.round(x*10)/10):compact} tick={{fill:'var(--muted)',fontSize:12}} width={58}/>
    <Tooltip labelFormatter={x=>dayLabel(String(x))} formatter={v=>[metric==='op'?Number(v).toFixed(2):money(Number(v)),'Прогноз']} contentStyle={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,color:'var(--ink)'}}/>
    <Area type="monotone" dataKey={metric} stroke="#558b59" strokeWidth={2.5} fill="url(#fillForecast)" animationDuration={500}/>
  </AreaChart></ResponsiveContainer></div>;
}
