import {calendar, categoryBudget, depositTransfers, effectiveDebt, first, month, remainingEvent, ruleAmount, sum, type Data, type forecast} from './finance.ts';

export function nextMonthPlan(data:Data,date:string,prediction:ReturnType<typeof forecast>|null,period=month(first(date),1)){
  const end=month(period,1);
  const events=calendar(data,period,end).filter(event=>event.date<end&&remainingEvent(event,data.transactions)>0);
  const dates=new Set(events.map(event=>event.rule));
  const payments=events.filter(event=>event.kind==='expense').map(event=>({
    id:event.id,debt:data.debts.some(debt=>debt.id===event.rule),name:event.name,amount:remainingEvent(event,data.transactions),date:event.deadline??event.date,
  }));
  const undatedDebts=data.debts.filter(debt=>(!debt.date||!debt.confirmed)&&!dates.has(debt.id)).map(debt=>{
    const effective=effectiveDebt(debt,data);
    return {id:debt.id,debt:true,name:debt.name,amount:Math.min(effective.balance,effective.payment),date:''};
  });
  const undatedRules=data.rules.filter(rule=>rule.active&&rule.kind==='expense'&&!rule.date&&(!rule.dates?.length||rule.repeat!=='custom')).map(rule=>
    ({id:rule.id,debt:false,name:rule.name,amount:ruleAmount(rule),date:''}));
  const obligations=[...payments,...undatedDebts,...undatedRules].filter(row=>row.amount>0);
  const income=sum(events.filter(event=>event.kind==='income').map(event=>remainingEvent(event,data.transactions)));
  const life=sum(data.categories.map(category=>categoryBudget(data,category,period)));
  const paymentTotal=sum(obligations.map(row=>row.amount));
  let remaining=Math.max(0,income-paymentTotal-life);
  const savings=data.accounts.filter(account=>account.kind==='otbasy'||account.kind==='bcc').map(account=>{
    const projected=sum((prediction?.deposits??[]).filter(row=>row.account===account.id&&first(row.date)===period).map(row=>row.amount));
    const suggested=Math.min(remaining,projected);
    remaining-=suggested;
    const transferred=depositTransfers(data,account.id,period);
    return {id:account.id,name:account.name,suggested:suggested+transferred,transferred};
  });
  return {period,income,life,paymentTotal,obligations,savings};
}
