import {z} from 'zod';
import type {Data} from './finance';
export const str=z.string().max(500);
export const date=z.union([z.iso.date(),z.literal('')]);
export const amount=z.number().int().min(0).max(1_000_000_000_000);
export const rate=z.number().min(0).max(1000);
export const num=z.number().int().min(0).max(10000);
const id=str.min(1);
const account=z.object({id,name:id,kind:z.enum(['cash','otbasy','bcc','reserve','market']),owner:str,opening:amount,rate,basis:amount,maturity:date,contract:amount,futureContract:amount,score:rate,interest:amount,eligible:amount,awarded:amount,fee:rate.max(100),earlyRate:rate,opened:date,rollover:z.boolean(),balanceDate:date.optional(),liquidity:z.enum(['liquid','term']).optional(),nominal:rate.optional(),termMonths:num.max(120).optional(),goalIncluded:z.boolean().optional(),goalShare:rate.max(100).optional(),goalPurpose:z.enum(['down','cushion']).optional()});
export const entry=z.object({id,date:z.iso.date(),name:id,kind:z.enum(['income','expense','transfer','sale','valuation']),amount:amount.positive(),from:str,to:str,category:str,event:str,reservation:str,sold:amount,plannedSale:id.optional(),budgetMonth:z.iso.date().refine(d=>d.endsWith('-01')).optional(),openingBalanceIncluded:z.boolean().optional(),reducePayment:z.boolean().optional(),finalPayment:z.boolean().optional(),reserveUses:z.array(z.object({id,amount:amount.positive()})).max(300).optional(),comment:str.optional()});
const payment=z.object({category:str.optional(),minimum:amount.optional(),maximum:amount.optional(),account:str.optional(),priority:num.optional(),partial:z.boolean().optional(),early:z.boolean().optional(),automatic:z.boolean().optional(),reminders:z.array(num.max(365)).max(20).optional(),comment:str.optional(),grace:num.max(90).optional(),discount:rate.max(100).optional()});
const event=z.object({id,name:id,date:z.iso.date(),kind:z.enum(['income','expense','saving','notice']),amount,status:z.enum(['planned','partial','received','settled_before_tracking','moved','canceled']),rule:str,comment:str,deadline:date.optional(),payment:payment.optional()}).refine(e=>!e.deadline||e.deadline>=e.date,'Крайний срок должен быть не раньше даты платежа.');
const rule=z.object({id,name:id,kind:z.enum(['income','expense']),amount,date,base:amount.optional(),percent:rate.optional(),repeat:z.enum(['monthly','weekly','fortnightly','bimonthly','quarterly','semiannual','yearly','once','custom']),active:z.boolean(),dates:z.array(z.iso.date()).max(1500).optional(),payment:payment.optional(),uncertain:z.boolean().optional()});
const category=z.object({id,name:id,budget:amount,minimum:amount,maximum:amount,rank:num,flexible:z.boolean()}).refine(c=>c.minimum<=c.budget&&c.budget<=c.maximum,'Проверьте границы бюджета.');
const purchase=z.object({id,name:id,date:z.iso.date(),amount,minimum:amount,maximum:amount,rank:num,required:z.boolean(),movable:z.boolean(),staged:z.boolean(),category:str,status:z.enum(['planned','done','canceled']),comment:str}).refine(p=>p.minimum<=p.amount&&p.amount<=p.maximum,'Проверьте границы стоимости.');
const debt=z.object({id,name:id,kind:z.enum(['mortgage','installment']),balance:amount,payment:amount,date,rate,apr:rate,original:amount,confirmed:z.boolean(),installments:z.array(z.object({date:z.iso.date(),amount:amount.positive()})).max(600).optional()}).refine(d=>!d.installments||(d.kind==='installment'&&d.rate===0&&d.installments.every((p,i)=>i===0||d.installments![i-1].date<p.date)),'График должен содержать уникальные даты по порядку.');
const goal=z.object({id,name:id,price:amount,down:rate.max(100),reserve:amount,date:z.iso.date(),latest:z.iso.date(),score:rate,buffer:rate,laterScore:rate,rentMin:amount,rentMax:amount,rate,laterRate:rate,completed:z.boolean()}).refine(g=>g.latest>=g.date,'Допустимая дата должна быть не раньше желаемой.');
const scenario=z.object({id,name:id,income:rate,expenses:rate,rates:rate,market:rate,price:rate,bonusDelay:num.max(365),otbasyShare:rate.max(100)});
const item=z.object({id,name:id,amount,target:str,reason:str,group:str});
const plan=z.object({id,date:z.iso.date(),items:z.array(item).max(300),status:z.enum(['accepted','released'])});
const bonus=z.object({id,account:id,year:num.min(2000),date,eligible:amount,credited:amount,actual:amount});
const rows=<T extends z.ZodType<{id:string}>>(s:T)=>z.array(s).max(10000).refine(xs=>new Set(xs.map(x=>x.id)).size===xs.length,'Идентификаторы записей повторяются.');
export const settings=z.object({conservative:z.boolean().optional(),safetyDays:num.max(14).optional(),reminderTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),timeZone:z.literal('Asia/Almaty').optional(),
roadmap:z.record(str,z.object({done:z.boolean().optional(),date:z.iso.date().optional()})).optional(),
plannedSales:rows(z.object({id,account:id,date:z.iso.date(),value:amount.positive(),proceeds:amount.positive()})).optional(),
partialMonths:z.record(z.iso.date(),z.boolean()).optional(),
notifications:z.record(str,z.object({read:z.boolean().optional(),until:z.iso.date().optional()})).optional(),
closings:z.record(z.iso.date(),z.object({date:z.iso.date(),score:rate.optional(),interest:amount.optional(),carried:z.record(str,amount).optional()})).optional(),monthly:z.record(z.iso.date(),z.record(str,amount)).optional(),mrp:z.record(z.string().regex(/^\d{4}$/),amount),priority:z.array(z.enum(['bills','living','purchases','reserve','otbasy','bcc','debt','free'])).max(8)});
export const dataSchema:z.ZodType<Data>=z.object({accounts:rows(account),transactions:rows(entry),events:rows(event),rules:rows(rule),categories:rows(category),purchases:rows(purchase),debts:rows(debt),goals:rows(goal),scenarios:rows(scenario),plans:rows(plan),bonuses:rows(bonus),settings});
