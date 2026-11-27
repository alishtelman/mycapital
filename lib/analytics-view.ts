import {balance,first,month,addDays,sum,type Data,type Entry} from './finance.ts';

export function datedHistory(transactions:Entry[],account:string){
  const rows=transactions.filter(row=>!account||row.from===account||row.to===account)
    .sort((a,b)=>b.date.localeCompare(a.date));
  return [...Map.groupBy(rows,row=>row.date)];
}

export function capitalHistory(data:Data,today:string){
  const value=(date:string)=>sum(data.accounts.map(account=>balance(account,data.transactions.filter(entry=>entry.date<=date))));
  const knownFrom=data.accounts.length>0&&data.accounts.every(account=>account.balanceDate)
    ?data.accounts.map(account=>account.balanceDate!).sort().at(-1):undefined;
  const rows=[];
  if(knownFrom){
    for(let offset=-5;offset<0;offset++){
      const date=addDays(month(first(today),offset+1),-1);
      if(date>=knownFrom)rows.push({date,actual:value(date)});
    }
  }
  return [...rows,{date:today,actual:value(today)}];
}
