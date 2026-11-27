'use client';
import {closingPayments,prepareMonthClosing,reopenAccountingMonth} from '../lib/month-closing';
import {expectedIncome,incomePeriod,incomeType,incomeTypes,type IncomeType} from '../lib/income';
import {assignableLiving,changeEnvelope,envelopeAmounts,envelopeSummary,livingAccount,transferEnvelopeSavings} from '../lib/envelopes';
import {AccountCard,Amount,Disclosure,FinancialRow,PaymentRow,Progress,SectionHeading} from './ui/finance';
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {createClient,type Session} from '@supabase/supabase-js';
import {ArrowDownLeft,ArrowLeftRight,ArrowUpRight,Bell,CalendarDays,ChartNoAxesCombined,ChevronDown,ChevronLeft,ChevronRight,CircleHelp,Coins,History,House,LayoutGrid,LogOut,Menu,Moon,Plus,Settings,ShieldCheck,ShoppingBag,Sparkles,Sun,Target,Wallet} from 'lucide-react';
import demo from '../lib/demo.json';
import {addDays,allocation,balance,bccYield,bonus,budgetCuts,calendar,cash,dailyBudget,categoryBudget,categorySpent,days,depositYield,depositTransfers,downPayment,dueDate,effectiveDebt,empty,entryMonth,first,forecast,goalPurpose,goalShare,governmentAwards,livingReserve,marketBasis,money,month,optimizeSavings,otbasyYield,remainingEvent,reserved,ruleAmount,savingPlanProgress,usedReserve,schedule,score,sum,today,validateEntry,type Account,type Data,type Entry,type Event,type Item,type Plan,type Rule} from '../lib/finance';
import {closedPeriodAvailability,closePaidExpense,detachExpense,monthlyReport,paymentState,reminders,trimPaymentReserves,withPaymentReserves} from '../lib/cashflow';
import {MonthReport,Notifications,PurchaseCheck} from './cashflow';
import {datedHistory} from '../lib/analytics-view';
import {AnalyticsOverview} from './analytics-overview';
import {SavingsRoadmap} from './savings-roadmap';
import {nextMonthPlan} from '../lib/month-plan';
import {prepareFirstMonth} from '../lib/reconciliation';
import {applyDebtPrepayment,comparePrepayment,kaspiMode,linkedDebtExpense,saveKaspiSchedule,updateDebtCalendar} from '../lib/debt-planning';
import {KaspiSchedule} from './kaspi-schedule';
import {paymentCalendarEvents,paymentGroups,preferredWorkspace} from '../lib/workspace-view';
import {dataSchema} from '../lib/schema';
import {Dashboard,MonthScreen,dayLabel,kinds,shortDate} from './dashboard';
import {Blank,FormModal,field as f,select as s,type Field,type Value} from './forms';
import {accountNames,editor,eventNames,groupNames,titles,type Entity} from './editors';
import {Button} from './ui/button';


const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
const nav=[
  ['dashboard','Главная',House],['month','Месяц',LayoutGrid],['calendar','Платежи',CalendarDays],
  ['accounts','Накопления',Wallet],['debts','Кредиты',Coins],['goals','Цели',Target],
  ['analytics','Аналитика',ChartNoAxesCombined],['history','История операций',History],
  ['purchases','Планы и покупки',ShoppingBag],['settings','Настройки',Settings]
] as const;
const kindNames={income:'Поступление',expense:'Расход',transfer:'Перевод',sale:'Продажа актива',valuation:'Корректировка баланса'};
type Household={id:string;owner:string;label:string;shared:boolean};
type Member={email:string;can_edit:boolean};
type Modal={title:string;fields:Field[];initial:Record<string,Value>;submit:(value:Record<string,Value>)=>void;actions?:React.ReactNode;primaryFields?:number;hideSubmit?:boolean;submitLabel?:string};
const planRows=(d:Data)=>d.plans.filter(p=>p.status==='accepted').flatMap(p=>p.items.map(i=>({...i,plan:p.id,left:Math.max(0,i.amount-usedReserve(d.transactions,i.id))}))).filter(i=>i.left>0);
const scalarFields=(value:object):Record<string,Value>=>Object.fromEntries(Object.entries(value).filter(([,v])=>['string','number','boolean'].includes(typeof v)));
const setRow=<T extends {id:string}>(rows:T[],row:T)=>[...rows.filter(x=>x.id!==row.id),row];
function download(name:string,body:string,type:string){
  const href=URL.createObjectURL(new Blob([body],{type}));
  const a=document.createElement('a');a.href=href;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(href),500);
}
function exportCalendar(d:Data,date:string){
  const esc=(x:string)=>x.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const stamp=new Date().toISOString().replace(/[-:]|\.\d{3}/g,'');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tenge//Finance//RU','CALSCALE:GREGORIAN'];
  for(const e of calendar(d,month(first(date),-1),month(first(date),12)).filter(e=>e.status!=='canceled')){
    const time=(d.settings.reminderTime??'09:00').replace(':','');
    const alarmDate=dueDate(e).replaceAll('-','');
    const zoned=new Date(dueDate(e)+'T'+(d.settings.reminderTime??'09:00')+':00+05:00').toISOString().replace(/[-:]|\.\d{3}/g,'');
    lines.push('BEGIN:VEVENT','UID:'+encodeURIComponent(e.id)+'@mycapital','DTSTAMP:'+stamp,
      'DTSTART:'+(e.kind==='expense'?zoned:new Date(e.date+'T'+time.slice(0,2)+':'+time.slice(2)+':00+05:00').toISOString().replace(/[-:]|\.\d{3}/g,'')),
      'SUMMARY:'+esc(e.name),'DESCRIPTION:'+esc([money(e.amount),alarmDate,e.comment].filter(Boolean).join(' · ')));
    if(e.status!=='received')for(const days of new Set(e.payment?.reminders??[7,3,1,0]))lines.push('BEGIN:VALARM','ACTION:DISPLAY',
      'TRIGGER:'+(days?'-P'+days+'D':'PT0M'),'DESCRIPTION:'+esc(e.name),'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const folded=lines.map(line=>{
    let result='',length=0;
    for(const ch of line){const bytes=new TextEncoder().encode(ch).length;if(length+bytes>75){result+='\r\n ';length=1;}result+=ch;length+=bytes;}
    return result;
  });
  download('tenge.ics',folded.join('\r\n')+'\r\n','text/calendar;charset=utf-8');
}
export function Workspace(){
  const [inbox,setInbox]=useState(false);
  const [showReport,setShowReport]=useState(false);
  const [reportPeriod,setReportPeriod]=useState('');
  const [purchase,setPurchase]=useState<{id?:string;amount:number;date:string;name:string}|null>(null);
  const [clock,setClock]=useState('00:00');
  const writing=useRef(false);
  const switching=useRef(false);
  const activeUser=useRef<string|null>(null);
  const [data,D]=useState<Data>(()=>dataSchema.parse(demo));
  const [section,S]=useState('dashboard');
  const [day,setDay]=useState('2026-11-27');
  const [planPeriod,setPlanPeriod]=useState('');
  const [pointer,setPointer]=useState('2026-11-01');
  const [mode,setMode]=useState<'month'|'list'>('list');
  const [eventFilter,setEventFilter]=useState<'all'|Event['kind']>('expense');
  const [kaspiEditor,setKaspiEditor]=useState<Data['debts'][number]|null>(null);
  const [showKaspi,setShowKaspi]=useState(false);
  const [theme,setTheme]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [notice,N]=useState('');
  const [modal,M]=useState<Modal|null>(null);
  const [draft,setDraft]=useState<Item[]|null>(null);
  const [editingDraft,setEditingDraft]=useState(false);
  const [busy,B]=useState(false);
  const [session,setSession]=useState<Session|null>(null);
  const [authMode,A]=useState<'login'|'signUp'|'magic'|'reset'|'recover'|null>(null);
  const [households,H]=useState<Household[]>([]);
  const [workspace,W]=useState<Household|null>(null);
  const [workspaceError,setWorkspaceError]=useState('');
  const [members,setMembers]=useState<Member[]>([]);
  const [revision,R]=useState(0);
  const [scenario,setScenario]=useState('');
  const [accountHistory,setAccountHistory]=useState('');
  const [received,setReceived]=useState(0);
  const [allocationPeriod,setAllocationPeriod]=useState('');
  const demoMode=!workspace;
  const [settled,setSettled]=useState(false);
  useEffect(()=>{
    const date=today();
    const frame=requestAnimationFrame(()=>{setDay(date);setPointer(first(date));setTheme(localStorage.getItem('theme')==='dark');});
    if('serviceWorker' in navigator&&process.env.NODE_ENV==='production')void navigator.serviceWorker.register('/sw.js').catch(()=>{});
    const auth=db?.auth.onAuthStateChange((event,value)=>{
      const user=value?.user.id??null;
      const changed=activeUser.current!==null&&activeUser.current!==user;
      activeUser.current=user;
      setSession(value);
      if(event==='PASSWORD_RECOVERY')A('recover');
      if(event==='INITIAL_SESSION')setSettled(true);
      if(event==='SIGNED_OUT'||changed){
        W(null);setWorkspaceError('');H([]);setMembers([]);D(dataSchema.parse(demo));R(0);S('dashboard');M(null);setDraft(null);setReceived(0);
      }
    });
    return ()=>{cancelAnimationFrame(frame);auth?.data.subscription.unsubscribe();};
  },[]);
  useEffect(()=>{
    const update=()=>{setClock(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()));setDay(today());};
    const frame=requestAnimationFrame(update);
    const timer=setInterval(update,30_000);
    return ()=>{cancelAnimationFrame(frame);clearInterval(timer);};
  },[]);
  useEffect(()=>{
    document.documentElement.dataset.theme=theme?'dark':'light';
  },[theme]);
  useEffect(()=>{
    if(!session?.user.id||!db)return;
    const client=db, owner=session.user.id;
    let canceled=false;
    const fail=(message:string)=>{if(!canceled)setWorkspaceError(message);};
    async function load(){
      let result=await client.from('households').select('id,owner,label,shared');
      if(canceled)return;
      if(result.error){fail('Не удалось загрузить рабочие пространства.');return;}
      if(!result.data.some(h=>h.owner===owner&&!h.shared)){
        await client.from('households').insert({owner});
        result=await client.from('households').select('id,owner,label,shared');
      }
      if(canceled)return;
      if(result.error){fail('Не удалось загрузить рабочие пространства.');return;}
      H(result.data);
      const selected=preferredWorkspace(result.data,owner,localStorage.getItem('workspace:'+owner));
      if(!selected){fail('Рабочее пространство недоступно.');return;}
      const saved=await client.rpc('workspace',{target:selected.id});
      if(canceled)return;
      if(saved.error||!saved.data){fail('Не удалось прочитать данные рабочего пространства.');return;}
      const parsed=dataSchema.safeParse(saved.data.data);
      if(saved.data.revision>0&&!parsed.success){fail('Формат сохранённых данных отличается от текущего.');return;}
      D(parsed.success?parsed.data:empty());W(selected);R(saved.data.revision);M(null);setDraft(null);setReceived(0);setWorkspaceError('');
      localStorage.setItem('workspace:'+owner,selected.id);
      const list=await client.from('household_members').select('email,can_edit').eq('household',selected.id);
      if(!canceled)setMembers(list.data??[]);
    }
    void load();
    return ()=>{canceled=true;};
  },[session?.user.id]);
  useEffect(()=>{
    if(!notice)return;
    const timer=setTimeout(()=>N(''),6500);
    return ()=>clearTimeout(timer);
  },[notice]);

  async function loadWorkspace(h:Household){
    if(!db||!session||busy||writing.current||switching.current)return;
    const user=session.user.id;
    switching.current=true;
    B(true);
    try{
      const result=await db.rpc('workspace',{target:h.id});
      if(activeUser.current!==user)return;
      if(result.error||!result.data)throw Error('Рабочее пространство недоступно.');
      D(result.data.revision>0?dataSchema.parse(result.data.data):empty());
      W(h);R(result.data.revision);setReceived(0);M(null);setDraft(null);
      localStorage.setItem('workspace:'+user,h.id);
      const list=await db.from('household_members').select('email,can_edit').eq('household',h.id);
      if(activeUser.current===user)setMembers(list.data??[]);
    }catch(e){if(activeUser.current===user)N(e instanceof Error?e.message:'Не удалось загрузить данные.');}
    finally{switching.current=false;B(false);}
  }
  async function persist(next:Data,message='Изменения сохранены'){
    if(busy||writing.current||switching.current)return false;
    if(db&&(!settled||session&&!workspace)){N('Дождитесь загрузки рабочего пространства.');return false;}
    const parsed=dataSchema.safeParse(next);
    if(!parsed.success){N(parsed.error.issues[0]?.message??'Проверьте данные.');return false;}
    if(next.accounts.some(a=>balance(a,next.transactions)<0)||cash(next)<reserved(next)){N('Проверьте остатки счетов и резервов.');return false;}
    if(workspace){
      if(!session)return false;
      const user=session.user.id;
      writing.current=true;B(true);
      try{
        const result=await fetch('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
          body:JSON.stringify({id:workspace.id,revision,data:parsed.data})});
        const json=await result.json();
        if(activeUser.current!==user)return false;
        if(!result.ok){N(json.error??'Не удалось сохранить данные.');return false;}
        R(json.revision);
      }catch{N('Нет связи с сервером. Изменения можно отправить повторно.');return false;}
      finally{writing.current=false;B(false);}
    }
    D(parsed.data);N(message);return true;
  }
  function go(page:string){S(page);setMobile(false);window.scrollTo({top:0});}
  function edit(entity:Entity,existing?:Record<string,Value>){
    const form=editor(entity,data,existing);
    M({title:titles[entity],...form,submit:v=>{
      const previous=data[entity] as unknown as Record<string,Value>[];
      const next={...data,[entity]:[...previous.filter(r=>r.id!==v.id),v]};
      if(entity==='bonuses'&&next.bonuses.filter(b=>b.account===v.account&&b.year===v.year).length>1){N('Для счёта уже существует запись за этот год.');return;}
      void persist(next).then(ok=>{if(ok)M(null);});
    }});
  }
  function editPayment(rule?:Rule){
    const r=rule??{id:crypto.randomUUID(),name:'',kind:'expense',amount:0,date:'',repeat:'monthly',active:true};
    const p=r.payment;
    const initial={name:r.name,amount:r.amount,date:r.date,repeat:r.repeat,active:r.active,dates:r.dates?.join(', ')??'',
      minimum:p?.minimum??0,maximum:p?.maximum??0,grace:p?.grace??0,priority:p?.priority??5,account:p?.account??'',
      category:p?.category??'',partial:p?.partial??true,early:p?.early??true,automatic:p?.automatic??false,discount:p?.discount??0,
      reminders:(p?.reminders??[7,3,1,0]).join(', '),comment:p?.comment??''};
    const fields=[f('name','Название'),f('amount','Плановая сумма, ₸','money'),f('date','Дата ближайшей оплаты','date',true),
      s('repeat','Периодичность',[['once','Разовый'],['weekly','Еженедельно'],['fortnightly','Раз в две недели'],['monthly','Ежемесячно'],['bimonthly','Раз в два месяца'],['quarterly','Ежеквартально'],['semiannual','Раз в полгода'],['yearly','Ежегодно'],['custom','Пользовательский график']]),
      f('dates','Даты своего графика, ГГГГ-ММ-ДД через запятую','text',true),f('grace','Дней от даты оплаты до крайнего срока','number'),
      f('minimum','Минимум, ₸','money'),f('maximum','Верхняя оценка, ₸ (0 — без ограничения)','money'),
      s('category','Категория',data.categories.map(c=>[c.id,c.name]),true),s('account','Счёт оплаты',data.accounts.filter(a=>a.kind==='cash').map(a=>[a.id,a.name]),true),
      f('priority','Приоритет (1 — высокий)','number'),f('reminders','Напоминания за N дней, через запятую','text',true),
      f('comment','Комментарий','text',true),f('discount','Скидка за досрочную оплату, %','number'),
      f('partial','Разрешена частичная оплата','boolean'),f('early','Разрешена досрочная оплата','boolean'),f('automatic','Автосписание','boolean'),f('active','Активный платёж','boolean')];
    function remove(archive:boolean){
      if(!window.confirm(archive?'Архивировать правило и отменить будущие неоплаченные платежи?':'Удалить правило и отменить будущие неоплаченные платежи?'))return;
      const affected=calendar(data,day,month(day,36)).filter(e=>e.rule===r.id&&remainingEvent(e,data.transactions)>0);
      let next={...data,rules:archive?setRow(data.rules,{...r,active:false}):data.rules.filter(x=>x.id!==r.id),events:data.events.filter(e=>!affected.some(a=>a.id===e.id))};
      for(const e of affected){
        const canceled:Event={...e,status:'canceled'};
        if(data.events.some(x=>x.id===e.id)||reserved(data,e.id))next.events=setRow(next.events,canceled);
        next={...next,plans:trimPaymentReserves(next,canceled)};
      }
      void persist(next).then(ok=>{if(ok)M(null);});
    }
    M({title:rule?'Правило обязательного платежа':'Новый обязательный платёж',fields,initial,primaryFields:4,
      actions:rule&&<><Button variant="outline" onClick={()=>remove(true)}>Архивировать</Button><Button variant="outline" onClick={()=>remove(false)}>Удалить правило</Button></>,
      submit:v=>{
        const dates=String(v.dates).split(',').map(x=>x.trim()).filter(Boolean);
        const alarms=String(v.reminders).split(',').map(x=>x.trim()).filter(Boolean).map(Number);
        if((v.repeat==='custom'&&!dates.length)||alarms.some(x=>!Number.isInteger(x)||x<0||x>365)){N('Проверьте даты графика и интервалы напоминаний.');return;}
        if(dates.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x))){N('Укажите даты в формате ГГГГ-ММ-ДД.');return;}
        if(Number(v.minimum)>Number(v.amount)||(Number(v.maximum)>0&&Number(v.maximum)<Number(v.amount))){N('Плановая сумма должна быть в указанном диапазоне.');return;}
        const next:Rule={...r,name:String(v.name),repeat:v.repeat as Rule['repeat'],date:String(v.date),active:Boolean(v.active),amount:Number(v.amount),dates,
          payment:{minimum:Number(v.minimum),maximum:Number(v.maximum),grace:Number(v.grace),priority:Number(v.priority),account:String(v.account),category:String(v.category),
            partial:Boolean(v.partial),early:Boolean(v.early),automatic:Boolean(v.automatic),discount:Number(v.discount),comment:String(v.comment),reminders:[...new Set(alarms)]}};
        // Once a payment is reserved, preserve its occurrence when the recurring rule changes.
        const pinned=calendar(data,month(day,-12),month(day,36)).filter(e=>e.rule===r.id&&reserved(data,e.id)&&!data.events.some(x=>x.id===e.id));
        void persist({...data,events:[...data.events,...pinned],rules:setRow(data.rules,next)}).then(ok=>{if(ok)M(null);});
      }});
  }
  function reservePayment(event:Event){
    const missing=paymentState(data,event,day).missing;
    const available=Math.max(0,cash(data)-reserved(data));
    if(!missing||!available){N('Свободных денег для этого резерва сейчас нет.');return;}
    M({title:'Зарезервировать платёж',initial:{amount:Math.min(missing,available)},fields:[f('amount','Сумма резерва, ₸','money')],submit:v=>{
      const amount=Number(v.amount);
      if(amount<=0||amount>Math.min(missing,available)){N('Проверьте доступную сумму резерва.');return;}
      const plan:Plan={id:crypto.randomUUID(),date:day,status:'accepted',items:[{id:crypto.randomUUID(),target:event.id,name:event.name,amount,
        group:event.id.startsWith('purchase@')?'purchases':'bills',reason:'Срок '+dueDate(event)}]};
      void persist({...data,events:setRow(data.events,event),plans:[...data.plans,plan]},'Резерв создан').then(ok=>{if(ok)M(null);});
    }});
  }
  function planSale(account:Account){
    const existing=data.settings.plannedSales?.find(sale=>sale.account===account.id&&!data.transactions.some(t=>t.plannedSale===sale.id));
    const marketValue=balance(account,data.transactions);
    M({title:'Запланировать продажу · '+account.name,fields:[f('date','Плановая дата','date'),f('value','Рыночная стоимость продаваемой части, ₸','money'),f('proceeds','Ожидаемая выручка после издержек, ₸','money')],
      initial:{date:existing?.date??day,value:existing?.value??marketValue,proceeds:existing?.proceeds??Math.floor(marketValue*(1-account.fee/100))},
      actions:<p>План влияет на прогноз квартиры. Остатки изменятся после подтверждения фактической продажи.</p>,
      submit:v=>{
        const value=Number(v.value), proceeds=Number(v.proceeds), date=String(v.date);
        if(date<day||value<=0||value>marketValue||proceeds<=0){N('Проверьте дату и суммы продажи.');return;}
        const plannedSales=setRow(data.settings.plannedSales??[],{id:existing?.id??crypto.randomUUID(),account:account.id,date,value,proceeds});
        void persist({...data,settings:{...data.settings,plannedSales}},'Продажа добавлена в прогноз').then(ok=>{if(ok)M(null);});
      }});
  }
  function importInstallments(loan?:Data['debts'][number]){
    setKaspiEditor(loan??null);setShowKaspi(true);
  }
  function compareDebt(loan:Data['debts'][number]){
    const activeGoal=data.goals.find(goal=>!goal.completed);
    const selected=data.scenarios.find(item=>item.id===scenario)??data.scenarios[0];
    const model=activeGoal?optimizeSavings(data,activeGoal,day,selected).model:selected;
    const compare=comparePrepayment(data,loan,day,activeGoal,model);
    const head=compare.relief[0];
    const dateLabel=(date?:string)=>date?dayLabel(date):'дата не определена';
    M({title:'Досрочное погашение · '+loan.name,fields:[],initial:{},hideSubmit:true,submit:()=>{},actions:<div className="debt-comparison">
      <p><b>{compare.favorable?'Расчёт показывает выгоду при текущих условиях':'Обычный график остаётся предпочтительным по расчёту'}</b></p>
      <dl><dt>Заплатить сейчас · оценка</dt><dd><Amount value={compare.entry.amount}/></dd>
        <dt>Снижение нагрузки · {head?dayLabel(head.period):'ближайший месяц'}</dt><dd><Amount value={head?.amount??0}/></dd>
        <dt>Экономия процентов</dt><dd><Amount value={compare.comparison.saved}/></dd>
        <dt>Упущенный доход вклада</dt><dd><Amount value={compare.comparison.lost}/></dd>
        {compare.baseline&&<><dt>Дата покупки · обычный график</dt><dd>{dateLabel(compare.baseline.reached)}</dd>
          <dt>После погашения</dt><dd>{compare.alternative?dateLabel(compare.alternative.reached):'Недостаточно доступных средств'}</dd>
          {compare.alternative?.deadline&&<><dt>Дефицит к сроку после погашения</dt><dd><Amount value={compare.alternative.deadline.deficit}/></dd>
            <dt>ОП после погашения</dt><dd>{compare.alternative.deadline.op.toFixed(2)}</dd></>}</>}
      </dl>
      <p>Ликвидность {compare.preservesLiquidity?'сохраняется':'требует пополнения'} · подушка {compare.preservesCushion?'достаточна':'ниже цели'}{activeGoal?' · '+(compare.protectsGoal?'цель сохраняется':'план квартиры требует пересчёта'):''}.</p>
      {compare.relief.length>0&&<Disclosure summary="Нагрузка по месяцам">{compare.relief.slice(0,24).map(row=><FinancialRow key={row.period} name={dayLabel(row.period)} value={<Amount value={row.amount}/>}/>)}</Disclosure>}
      <p>Перед записью сверьте сумму полного закрытия и обновлённый график с банком.</p>
      <Button variant="outline" onClick={()=>operation('expense',undefined,undefined,undefined,{name:compare.entry.name,amount:compare.entry.amount,category:loan.id,...(compare.entry.from?{from:compare.entry.from}:{})})}>Записать погашение</Button>
    </div>});
  }
  function mergeDutyIncome(){
    const duties=data.rules.filter(r=>r.active&&r.kind==='income'&&/дежурств/i.test(r.name));
    const salary=data.rules.filter(r=>r.active&&r.kind==='income'&&!duties.includes(r)&&r.repeat==='monthly');
    if(!duties.length||!salary.length){N('Нужны действующие правила зарплаты и дежурств.');return;}
    M({title:'Учесть дежурства в зарплате',fields:[s('salary','Выплата зарплаты',salary.map(r=>[r.id,r.name])),f('amount','Полная ожидаемая выплата с дежурствами, ₸','money')],
      initial:{salary:salary[0].id,amount:ruleAmount(salary[0])+sum(duties.map(ruleAmount))},
      actions:<p>Отдельные правила дежурств будут отключены. Записанные поступления сохранятся.</p>,
      submit:v=>{
        const amount=Number(v.amount);
        if(amount<=0){N('Введите полную ожидаемую сумму.');return;}
        const rules=data.rules.map(r=>duties.includes(r)?{...r,active:false}:r.id===v.salary?{...r,amount,base:undefined,percent:undefined}:r);
        const events=data.events.map(e=>duties.some(r=>r.id===e.rule)&&e.date>=day&&remainingEvent(e,data.transactions)>0
          ?{...e,status:'canceled' as const}:e);
        void persist({...data,rules,events},'Дежурства учтены в прогнозе зарплаты').then(ok=>{if(ok)M(null);});
      }});
  }
  function quickIncome(expected?:Event,type?:IncomeType){
    const accounts=data.accounts.filter(a=>a.kind!=='market');
    const account=accounts.find(a=>a.kind==='cash')??accounts[0];
    if(!account){N('Сначала добавьте денежный счёт.');go('accounts');return;}
    if(!expected&&!type){
      M({title:'Какой доход получили?',fields:[],initial:{},submit:()=>{},actions:<div className="income-choices">
        {incomeTypes.map(([key,label])=><Button type="button" key={key} variant="outline" onClick={()=>quickIncome(undefined,key)}>{label}</Button>)}
      </div>,hideSubmit:true});
      return;
    }
    const kind=type??incomeType(expected?.name??'');
    const label=incomeTypes.find(([key])=>key===kind)![1];
    M({title:label,fields:[
      f('amount','Сумма, ₸','money'),f('date','Дата поступления','date'),s('to','Счёт зачисления',accounts.map(a=>[a.id,a.name])),
      f('budgetMonth','Месяц бюджета (любая дата месяца)','date',true),
      f('partial','Ожидаю ещё часть этой выплаты','boolean'),
    ],initial:{amount:0,date:day,to:account.id,budgetMonth:expected?incomePeriod(expected):'',partial:false},primaryFields:3,
      actions:kind==='salary'?<p>Укажите полную сумму, которая пришла на счёт, включая оплату дежурств.</p>:undefined,
      submit:v=>{
        const date=String(v.date),period=first(String(v.budgetMonth||date));
        const event=expectedIncome(data,kind,period,expected);
        const amount=Number(v.amount),to=String(v.to);
        if(data.transactions.some(entry=>entry.kind==='income'&&entry.amount===amount&&entry.date===date&&entry.to===to&&incomeType(entry.name)===kind)){
          N('Такое поступление уже есть в истории. Откройте его, чтобы исправить сумму или дату.');return;
        }
        commitEntry({id:crypto.randomUUID(),kind:'income',name:label,date,amount,from:'',to,budgetMonth:period,
          finalPayment:event?!v.partial:undefined,category:'',event:event?.id??'',reservation:'',sold:0},event);
      }});
  }
  function reconcileMonth(){
    const cashAccounts=data.accounts.filter(a=>a.kind==='cash');
    const deposits=data.accounts.filter(a=>a.kind==='bcc');
    if(!cashAccounts.length){N('Для сверки добавьте денежный счёт.');return;}
    const deposit=deposits.find(a=>/моя цель/i.test(a.name))??deposits[0];
    const titles={salary:'Зарплата',advance:'Аванс',deposit:'Пополнение БЦК'};
    const kinds=['salary','advance','deposit'] as const;
    M({title:'Восстановить первый месяц',submitLabel:'Проверить операции',fields:[
      f('period','Бюджетный месяц (любая дата месяца)','date'),
      s('cash','Счёт зарплаты и аванса',cashAccounts.map(a=>[a.id,a.name])),
      ...kinds.slice(0,2).flatMap(key=>[f(key+'Date',titles[key]+' · дата поступления','date',true),f(key+'Amount',titles[key]+' · сумма, ₸','money',true)]),
      ...(deposits.length?[s('deposit','Депозит БЦК',deposits.map(a=>[a.id,a.name])),f('opened','Точная дата открытия депозита','date',true),
        f('depositDate','Дата пополнения (если отличается от даты открытия)','date',true),f('depositAmount','Размещено на депозите, ₸','money',true)]:[])],
      initial:{period:data.settings.firstTrackingMonth??first(day),cash:cashAccounts[0].id,deposit:deposit?.id??'',opened:deposit?.opened??''},primaryFields:6,
      actions:<p>Внесите известные доходы и пополнение БЦК по выписке. Укажите фактическую дату даже для зарплаты, поступившей в предыдущем месяце. Расходы без подтверждения в отчёт не попадут.</p>,
      submit:v=>{
        const period=first(String(v.period));
        const drafts:Entry[]=[];
        const selectedDeposit=deposits.find(a=>a.id===v.deposit);
        const opened=String(v.opened??'');
        for(const key of kinds){
          const amount=Number(v[key+'Amount']??0);
          const date=String(v[key+'Date']||(key==='deposit'&&amount?opened:''));
          if(!date&&!amount)continue;
          if(!date||amount<=0){N('Укажите и дату, и сумму: '+titles[key]+'.');return;}
          drafts.push({id:crypto.randomUUID(),name:titles[key],kind:key==='deposit'?'transfer':'income',date,amount,
            from:key==='deposit'?String(v.cash):'',to:key==='deposit'?String(v.deposit):String(v.cash),category:'',event:'',reservation:'',sold:0});
        }
        const hasDeposit=drafts.some(entry=>entry.kind==='transfer');
        if(hasDeposit&&(!opened||!selectedDeposit)){N('Укажите точную дату открытия депозита по выписке.');return;}
        try{
          const review=prepareFirstMonth(data,period,drafts,hasDeposit&&selectedDeposit?{id:selectedDeposit.id,opened}:undefined);
          const involved=new Set(drafts.flatMap(entry=>[entry.from,entry.to]));
          const balances=data.accounts.filter(a=>involved.has(a.id));
          const report=monthlyReport(review.data,period);
          M({title:'Подтвердить сверку · '+dayLabel(period),submitLabel:'Записать в отчёт',fields:[f('confirm','Все указанные операции уже учтены в остатках','boolean')],
            initial:{confirm:false},actions:<div>
              {review.added.map(entry=><p key={entry.id}>{shortDate(entry.date)} · {entry.name} · {money(entry.amount)} · новая запись отчёта</p>)}
              {review.existing.map(entry=><p key={entry.id}>{entry.name} · уже есть в истории{entryMonth(entry)!==period?' · изменится только бюджетный месяц':''}</p>)}
              {balances.map(account=><p key={account.id}>{account.name} · начальный баланс {money(account.opening)}
                {account.balanceDate?' на '+shortDate(account.balanceDate):''} · сейчас {money(balance(account,data.transactions))}</p>)}
              <p>Доходы за месяц по известным операциям {money(report.income)}. Первый месяц будет помечен как неполный. Остатки счетов сохранятся.</p>
            </div>,submit:answer=>{
              if(!answer.confirm){N('Подтвердите, что суммы уже учтены.');return;}
              void persist(review.data,'Сверка сохранена').then(ok=>{if(ok){M(null);setReportPeriod(period);setShowReport(true);}});
            }});
        }catch(error){N(error instanceof Error?error.message:'Проверьте операции.');}
      }});
  }
  function configureGoalAccount(account:Account){
    M({title:'Доля в цели · '+account.name,fields:[f('share','Доля средств в цели, %','number'),
      s('purpose','Назначение',[['down','Первоначальный взнос'],['cushion','Финансовая подушка']])],
      initial:{share:goalShare(account),purpose:goalPurpose(account)},
      actions:<p>Укажите 0%, чтобы исключить счёт. Рыночные активы станут доступны для взноса или подушки после продажи.</p>,
      submit:v=>{
        const share=Number(v.share);
        if(share<0||share>100){N('Укажите долю от 0 до 100%.');return;}
        const goalPurpose=v.purpose==='cushion'?'cushion':'down';
        void persist({...data,accounts:setRow(data.accounts,{...account,goalIncluded:share>0,goalShare:share,goalPurpose})},'Назначение обновлено').then(ok=>{if(ok)M(null);});
      }});
  }
  function recordHistory(existing?:Entry){
    const accounts=data.accounts.filter(a=>a.kind!=='market');
    const options=accounts.map(a=>[a.id,a.name] as [string,string]);
    M({title:'Операция уже включена в начальный баланс',
      fields:[s('kind','Тип операции',[['income','Поступление'],['expense','Расход'],['transfer','Внутренний перевод']]),f('name','Название'),
        f('amount','Сумма, ₸','money'),f('date','Фактическая дата','date'),f('period','Месяц бюджета (любая дата месяца)','date',true),
        s('from','Со счёта (для расхода или перевода)',options,true),s('to','На счёт (для дохода или перевода)',options,true),
        s('category','Категория расхода',data.categories.map(c=>[c.id,c.name]),true),f('confirm','Сумма уже учтена в остатках указанных счетов','boolean')],
      initial:existing?{...scalarFields(existing),period:entryMonth(existing),confirm:false}:{kind:'income',date:day,amount:0,from:'',to:'',confirm:false},
      actions:<p>Запись попадёт в историю и отчёт. Текущие остатки счетов не изменятся.</p>,
      submit:v=>{
        if(!v.confirm){N('Подтвердите сверку остатков счетов.');return;}
        const date=String(v.date), kind=v.kind as Entry['kind'], period=first(String(v.period||date));
        const entry:Entry={id:existing?.id??crypto.randomUUID(),kind,date,name:String(v.name),amount:Number(v.amount),from:kind==='income'?'':String(v.from),
          to:kind==='expense'?'':String(v.to),category:kind==='expense'?String(v.category):'',event:'',reservation:'',sold:0,budgetMonth:period,openingBalanceIncluded:true};
        const duplicate=data.transactions.some(t=>t.id!==entry.id&&t.kind===kind&&t.date===date&&t.from===entry.from&&t.to===entry.to&&t.amount===entry.amount);
        if(duplicate){N('За эту дату уже есть операция с такой суммой и счетами. Проверьте историю.');return;}
        const error=validateEntry(data,entry);
        if(error){N(error);return;}
        void persist({...data,transactions:setRow(data.transactions,entry),settings:{...data.settings,partialMonths:{...data.settings.partialMonths,[period]:true}}},'Историческая запись добавлена').then(ok=>{if(ok)M(null);});
      }});
  }
  function quickExpense(){
    const account=data.accounts.find(a=>a.kind==='cash');
    if(!account){N('Добавьте счёт свободных денег.');go('accounts');return;}
    M({title:'Добавить расход',fields:[f('amount','Сумма, ₸','money'),s('category','Категория',data.categories.map(c=>[c.id,c.name]),true),
      f('date','Дата расхода','date'),s('from','Счёт списания',data.accounts.filter(a=>a.kind==='cash').map(a=>[a.id,a.name]),true)],
      initial:{amount:0,category:'',date:day,from:''},primaryFields:2,
      submit:v=>{
        const category=String(v.category);
        const entry:Entry={id:crypto.randomUUID(),kind:'expense',date:String(v.date),amount:Number(v.amount),from:String(v.from||'')||((category?livingAccount(data)?.id:undefined)??account.id),to:'',category,
          name:data.categories.find(c=>c.id===category)?.name||'Повседневный расход',comment:'',event:'',reservation:'',sold:0};
        commitEntry(category?withPaymentReserves(data,entry,category):entry);
      }});
  }
  function configureLivingAccount(){
    const accounts=data.accounts.filter(a=>a.kind==='cash');
    M({title:'Счёт кошелька «На жизнь»',fields:[s('account','Где лежат деньги',[['virtual','Виртуальный кошелёк'],...accounts.map(a=>[a.id,a.name] as [string,string])])],
      initial:{account:livingAccount(data)?.id??'virtual'},
      actions:<p>Привязка выбирает реальный счёт для повседневных расходов. Она не создаёт перевод.</p>,
      submit:v=>{
        const account=accounts.find(a=>a.id===v.account);
        if(account&&balance(account,data.transactions)<envelopeSummary(data).living){N('На счёте меньше денег, чем уже выделено на жизнь.');return;}
        void persist({...data,settings:{...data.settings,livingAccount:account?.id}},'Кошелёк настроен').then(ok=>{if(ok)M(null);});
      }});
  }
  function changeLivingReserve(category:string,action:'assign'|'release'|'move'|'carry'|'save'){
    const c=data.categories.find(c=>c.id===category);
    if(!c)return;
    const limit=action==='assign'?assignableLiving(data,day,c):livingReserve(data,c.id,day);
    if(limit<=0){N('В этом кошельке сейчас нет денег для этого действия.');return;}
    const here={name:c.name,target:c.id,group:'living'};
    const fields=[f('amount','Сумма, ₸','money')];
    const destinations:Pick<Item,'name'|'target'|'group'>[]=action==='move'?[
      ...data.categories.filter(other=>other.id!==c.id).map(other=>({name:other.name,target:other.id,group:'living'})),
      ...calendar(data,day,month(day,12)).filter(e=>e.kind==='expense'&&remainingEvent(e,data.transactions)>reserved(data,e.id)).map(e=>({
        name:e.name+' · '+shortDate(e.date),target:e.id,group:e.id.startsWith('purchase@')?'purchases':'bills'})),
      ...data.accounts.filter(a=>a.kind==='reserve').map(a=>({name:a.name,target:a.id,group:'reserve'})),
    ]:data.accounts.filter(a=>a.kind==='otbasy'||a.kind==='bcc').map(a=>({name:a.name,target:a.id,group:a.kind}));
    const cashAccounts=data.accounts.filter(a=>a.kind==='cash');
    if(action==='move'||action==='save'){
      if(!destinations.length){N('Добавьте счёт или другое назначение.');return;}
      fields.push(s('destination','Куда направить',destinations.map(d=>[d.target,d.name])));
    }
    if(action==='save')fields.push(s('from','С какого счёта',cashAccounts.map(a=>[a.id,a.name])));
    const titles={assign:'Выделить деньги на жизнь',release:'Освободить остаток',move:'Перераспределить деньги',carry:'Перенести остаток на следующий месяц',save:'Перевести экономию на накопления'};
    M({title:titles[action],fields,initial:{amount:limit,destination:destinations[0]?.target??'',from:livingAccount(data)?.id??cashAccounts[0]?.id??''},
      actions:<p>{c.name} · доступно {money(limit)}. {action==='save'?'Запишите перевод после пополнения депозита в банке.':'Остатки банковских счетов сохранятся.'}</p>,
      submit:v=>{
        const amount=Number(v.amount);
        if(amount>limit){N('Доступно '+money(limit)+'.');return;}
        const destination=destinations.find(item=>item.target===v.destination);
        if((action==='save'||action==='move')&&!destination)return;
        if(action==='move'&&destination&&['bills','purchases'].includes(destination.group)){
          const event=calendar(data,day,month(day,12)).find(e=>e.id===destination.target);
          if(!event||amount>remainingEvent(event,data.transactions)-reserved(data,event.id)){N('Сумма больше незарезервированного остатка платежа.');return;}
        }
        const id=crypto.randomUUID();
        let next:Data|null;
        if(action==='save'&&destination){
          const entry:Entry={id,kind:'transfer',date:day,name:'Экономия · '+c.name,amount,from:String(v.from),to:destination.target,
            category:'',event:'',reservation:'',sold:0};
          const result=transferEnvelopeSavings(data,c.id,entry);
          if(!result.data){N(result.error);return;}
          next=result.data;
        }else{
          next=changeEnvelope(data,{date:day,id,amount,source:action==='assign'?undefined:c.id,
            target:action==='assign'||action==='carry'?here:action==='move'?destination:undefined,carry:action==='carry'});
        }
        if(!next){N('Проверьте сумму и доступные деньги на выбранном назначении.');return;}
        void persist(next,action==='save'?'Перевод записан':action==='release'?'Остаток освобождён':action==='carry'?'Остаток перенесён':'Деньги распределены').then(ok=>{if(ok)M(null);});
      }});
  }
  function assessPurchase(id?:string){
    const existing=data.purchases.find(p=>p.id===id);
    M({title:'Хочу купить',initial:{amount:existing?.amount??0,date:existing?.date??day,name:existing?.name??'Незапланированная покупка'},
      fields:[f('name','Покупка'),f('amount','Стоимость, ₸','money'),f('date','Плановая дата','date')],submit:v=>{
        if(Number(v.amount)<=0||String(v.date)<day){N('Укажите стоимость и сегодняшнюю или будущую дату.');return;}
        const name=String(v.name);
        const match=data.purchases.find(p=>p.status==='planned'&&first(p.date)===first(String(v.date))&&p.name.trim().toLocaleLowerCase('ru')===name.trim().toLocaleLowerCase('ru'));
        M(null);setPurchase({id:id??match?.id,amount:Number(v.amount),date:String(v.date),name});
      }});
  }
  function closeMonth(period:string){
    const current=period===first(day);
    const accounts=current?data.accounts.filter(a=>a.kind!=='market'):[];
    const pending=closingPayments(data,period);
    const nextPeriod=month(period,1);
    const balances=Object.fromEntries(accounts.map(a=>[a.id,balance(a,data.transactions)]));
    function checkBalances(values=balances){
      M({title:'Закрытие месяца · 1 из 5',submitLabel:'К платежам',fields:accounts.map(a=>f(a.id,a.name+' · остаток в банке, ₸','money')),
        initial:values,actions:<p>{current?'Сверьте остатки с банком на сегодня. Разницы будут записаны как корректировки баланса.':'Вы закрываете прошлый месяц. Текущие остатки счетов сохранятся.'}</p>,
        submit:v=>checkPayments(Object.fromEntries(accounts.map(a=>[a.id,Number(v[a.id])]))),
      });
    }
    function checkPayments(verified:Record<string,number>){
      M({title:'Закрытие месяца · 2 из 5',submitLabel:'К резервам',initial:{reviewed:false},
        fields:pending.length?[f('reviewed','Проверил список. Открытые платежи остаются в плане.','boolean')]:[],
        actions:<div><p>{pending.length?'Осталось оплатить.': 'По календарю открытых платежей за месяц нет.'}</p>
          {pending.map(({event,amount})=><p key={event.id}>{event.name} · {money(amount)}</p>)}
          <p>Платежи без даты проверяются отдельно в бюджете.</p>
          <Button type="button" variant="ghost" onClick={()=>checkBalances(verified)}>Назад</Button></div>,
        submit:v=>{
          if(pending.length&&!v.reviewed){N('Подтвердите, что проверили список платежей.');return;}
          checkReserves(verified);
        }});
    }
    function checkReserves(verified:Record<string,number>,reserveAction='keep'){
      const available=current?livingReserve(data,undefined,day):0;
      M({title:'Закрытие месяца · 3 из 5',submitLabel:'К экономии',initial:{reserveAction,score:0,interest:0,scoresKnown:false},
        fields:[
          ...(available?[s('reserveAction','Что сделать с остатком',[['keep','Сохранить в кошельках'],['release','Освободить остаток'],['carry','Перенести на следующий месяц']])]:[]),
          f('scoresKnown','Записать ОП и полученные проценты','boolean'),f('score','Фактический ОП','number',true),f('interest','Получено процентов, ₸','money',true),
        ],primaryFields:available?1:0,actions:<div><p>{available?'В кошельках на жизнь доступно '+money(available)+'.':'Нет остатков текущего месяца для освобождения или переноса.'}</p>
          <Button type="button" variant="ghost" onClick={()=>checkPayments(verified)}>Назад</Button></div>,
        submit:v=>{
          try{
            const next=prepareMonthClosing(data,period,day,{balances:verified,reserveAction:v.reserveAction as 'keep'|'release'|'carry',reviewedPayments:true,
              id:()=>crypto.randomUUID(),score:v.scoresKnown?Number(v.score):undefined,interest:v.scoresKnown?Number(v.interest):undefined});
            checkSavings(next,()=>checkReserves(verified,String(v.reserveAction)));
          }catch(error){N(error instanceof Error?error.message:'Проверьте сверку остатков.');}
        }});
    }
    function checkSavings(next:Data,back:()=>void,distribute=false){
      const available=current?closedPeriodAvailability(next,day).available:Math.max(0,cash(next)-reserved(next));
      M({title:'Закрытие месяца · 4 из 5',submitLabel:'К следующему месяцу',initial:{distribute},
        fields:available?[f('distribute','После закрытия предложить распределение денег','boolean')]:[],
        actions:<div><p>Свободно после сверки {money(available)}. В распределение попадут деньги на счетах с учётом резервов.</p>
          <Button type="button" variant="ghost" onClick={back}>Назад</Button></div>,
        submit:v=>nextMonth(next,Boolean(v.distribute),()=>checkSavings(next,back,Boolean(v.distribute)))});
    }
    function nextMonth(next:Data,distribute:boolean,back:()=>void){
      M({title:'Закрытие месяца · 5 из 5',submitLabel:'Закрыть и открыть план',fields:[],initial:{},
        actions:<div><p>После сохранения откроется план на {dayLabel(nextPeriod)}. Проверьте платежи, расходы на жизнь и пополнения накоплений.</p>
          <Button type="button" variant="ghost" onClick={back}>Назад</Button></div>,
        submit:()=>void persist(next,'Месяц закрыт').then(ok=>{
          if(!ok)return;
          M(null);setPlanPeriod(nextPeriod);go('month');
          if(distribute)openPlan(next,0,nextPeriod);
        })});
    }
    setReportPeriod('');
    setShowReport(false);
    checkBalances();
  }
  function reopenMonth(period:string){
    if(!data.settings.closings?.[period])return;
    M({title:'Открыть месяц заново',submitLabel:'Открыть месяц',fields:[f('confirm','Подтвердить повторное открытие','boolean')],initial:{confirm:false},
      actions:<p>Операции и сверки остатков сохранятся. Перенесённые деньги останутся в месяце назначения.</p>,
      submit:v=>{
        if(!v.confirm){N('Подтвердите повторное открытие.');return;}
        void persist(reopenAccountingMonth(data,period),'Месяц открыт').then(ok=>{if(ok){M(null);setReportPeriod(period);setShowReport(true);}});
      }});
    setReportPeriod('');
    setShowReport(false);
  }
  function updateRoadmap(id:string,title:string,date:string,done:boolean){
    M({title,fields:[f('date','Рекомендуемая дата','date'),f('done','Выполнено','boolean')],initial:{date,done},
      submit:v=>void persist({...data,settings:{...data.settings,roadmap:{...data.settings.roadmap,[id]:{date:String(v.date),done:Boolean(v.done)}}}},'План обновлён').then(ok=>{if(ok)M(null);})});
  }
  function updateStartingCash(){
    const accounts=data.accounts.filter(a=>a.kind==='cash');
    if(!accounts.length){edit('accounts');return;}
    M({title:'Сколько денег сейчас на счетах',fields:accounts.map(a=>f(a.id,a.name+' · остаток в банке, ₸','money')),
      initial:Object.fromEntries(accounts.map(a=>[a.id,balance(a,data.transactions)])),
      actions:<p>Укажи остаток, который видишь в банке. Tenge запишет сверку баланса.</p>,
      submit:v=>{
        const corrections=accounts.flatMap(a=>{
          const difference=Number(v[a.id])-balance(a,data.transactions);
          if(!difference)return [];
          const entry:Entry={id:crypto.randomUUID(),date:day,name:'Сверка остатка · '+a.name,kind:'valuation',amount:Math.abs(difference),
            from:difference<0?a.id:'',to:difference>0?a.id:'',category:'',event:'',reservation:'',sold:0};
          return [entry];
        });
        if(!corrections.length){M(null);return;}
        void persist({...data,transactions:[...data.transactions,...corrections]},'Остатки сверены').then(ok=>{if(ok)M(null);});
      }});
  }
  const goal=data.goals.find(g=>!g.completed);
  const activeScenario=data.scenarios.find(x=>x.id===scenario)??data.scenarios[0];
  const savingsOptimization=useMemo(()=>goal?optimizeSavings(data,goal,day,activeScenario):null,[data,goal,day,activeScenario]);
  const currentForecast=savingsOptimization?.estimate??null;
  function openMonthPayment(row:ReturnType<typeof nextMonthPlan>['obligations'][number],period:string){
    if(row.source==='event'){
      const event=calendar(data,period,month(period,1)).find(event=>event.id===row.id);
      if(event)eventEditor(event);
      return;
    }
    if(row.source==='rule'){
      const rule=data.rules.find(rule=>rule.id===row.id);
      if(!rule)return;
      M({title:'Дата платежа · '+rule.name,fields:[f('date','Первая дата оплаты','date')],initial:{date:period},
        actions:<p>Дата станет началом действующего расписания «{rule.name}».</p>,
        submit:v=>void persist({...data,rules:setRow(data.rules,{...rule,date:String(v.date)})},'Дата платежа сохранена').then(ok=>{if(ok)M(null);})});
      return;
    }
    const debt=data.debts.find(debt=>debt.id===row.id);
    if(!debt)return;
    M({title:'Следующий платёж · '+debt.name,fields:[f('date','Дата платежа','date'),f('payment','Платёж, ₸','money')],
      initial:{date:debt.date||period,payment:debt.payment},actions:<p>Сверь сумму и дату с графиком банка.</p>,
      submit:v=>{
        const payment=Number(v.payment);
        if(payment<=0||payment<=Math.round(effectiveDebt(debt,data).balance*debt.rate/1200)){N('Укажи платёж, который покрывает проценты и часть долга.');return;}
        void persist({...data,debts:setRow(data.debts,{...debt,date:String(v.date),payment,confirmed:true})},'Дата и сумма платежа сохранены').then(ok=>{if(ok)M(null);});
      }});
  }
  function editNextMonthPlan(period:string){
    const plan=nextMonthPlan(data,day,currentForecast,period);
    const existing=data.settings.monthlySavingPlan?.[plan.period];
    M({title:'Пополнения на '+dayLabel(plan.period),fields:plan.savings.map(row=>f(row.id,row.name+' · план, ₸','money')),
      initial:Object.fromEntries(plan.savings.map(row=>[row.id,existing?.[row.id]??row.suggested])),
      actions:<p>Это твои цели на месяц. Фактический перевод добавляется отдельно после пополнения.</p>,
      submit:v=>{
        const monthlySavingPlan={...data.settings.monthlySavingPlan,[plan.period]:Object.fromEntries(plan.savings.map(row=>[row.id,Number(v[row.id])]))};
        void persist({...data,settings:{...data.settings,monthlySavingPlan}},'План пополнений сохранён').then(ok=>{if(ok)M(null);});
      }});
  }
  function valuation(account:Account){
    const current=balance(account,data.transactions);
    M({title:account.kind==='market'?'Обновить рыночную стоимость':'Сверить текущий баланс',fields:[f('value','Новый баланс, ₸','money'),f('date','Дата сверки','date')],initial:{value:current,date:day},submit:v=>{
      const delta=Number(v.value)-current;
      if(!delta){M(null);return;}
      commitEntry({id:crypto.randomUUID(),kind:'valuation',date:String(v.date),name:'Сверка · '+account.name,amount:Math.abs(delta),from:delta<0?account.id:'',to:delta>0?account.id:'',category:'',event:'',reservation:'',sold:0});
    }});
  }
  function openPlan(next=data,amount=0,period=first(day)){
    setEditingDraft(false);setReceived(amount);setAllocationPeriod(period);
    const configured=next.scenarios.find(s=>s.id===scenario)??next.scenarios[0];
    const activeGoal=next.goals.find(g=>!g.completed);
    if(!activeGoal||next.settings.monthlySavingPlan?.[period]){
      setDraft(allocation(next,day,configured,period));return;
    }
    const planned=optimizeSavings(next,activeGoal,day,configured).estimate.deposits.filter(row=>row.account&&first(row.date)===period);
    const targets:Record<string,number>={};
    for(const item of planned)targets[item.account]=(targets[item.account]??depositTransfers(next,item.account,period))+item.amount;
    const modeled={...next,settings:{...next.settings,monthlySavingPlan:{...next.settings.monthlySavingPlan,[period]:targets}}};
    setDraft(allocation(modeled,day,configured,period));
  }
  function commitEntry(entry:Entry,event?:Event){
    if(!/\d{4}-\d{2}-\d{2}/.test(entry.date)||!entry.name){N('Заполните название и дату.');return;}
    const loan=linkedDebtExpense(data,entry);
    const early=loan&&!entry.event;
    const prior=early?applyDebtPrepayment(data,loan,entry):data;
    const error=validateEntry(prior,entry);
    if(error){N(error);return;}
    const freshIncome=entry.kind==='income'&&!data.transactions.some(row=>row.id===entry.id)&&data.accounts.some(a=>a.id===entry.to&&a.kind==='cash');
    let next={...prior,transactions:setRow(prior.transactions,entry)};
    if(event){
      const entries=next.transactions.filter(e=>e.event===event.id);
      const actual=sum(entries.map(e=>e.amount));
      const updated={...event,status:(actual>=event.amount||entries.some(e=>e.finalPayment)?'received':actual>0?'partial':'planned') as Event['status']};
      next={...next,events:setRow(data.events,updated),plans:trimPaymentReserves(next,updated)};
    }
    if(loan&&!early)next=updateDebtCalendar(next,loan,entry.date);
    void persist(next,'Операция сохранена').then(ok=>{
      if(ok){M(null);if(freshIncome)openPlan(next,entry.amount,entryMonth(entry));}
    });
  }
  function operation(kind:Entry['kind'],event?:Event,item?:Item,existing?:Entry,preset?:Partial<Entry>){
    if(kind==='valuation')return;
    const available=data.accounts.filter(a=>a.kind!=='market');
    if(!available.length){N('Сначала добавьте денежный счёт.');go('accounts');return;}
    const primary=available.find(a=>a.kind==='cash')?.id??available[0]?.id??'';
    const matchingEvent=event??data.events.find(e=>e.id===existing?.event);
    const openEvents=calendar(data,month(day,-3),month(day,3)).filter(e=>
      e.kind===kind&&remainingEvent(e,data.transactions)>0);
    const list=kind==='sale'?data.accounts.filter(a=>a.kind==='market'):available;
    const currentId=existing?.id??crypto.randomUUID();
    const newEntry:Entry={id:currentId,kind,name:matchingEvent?.name??item?.name??'',date:day,amount:item?.amount??(matchingEvent?remainingEvent(matchingEvent,data.transactions):0),from:kind==='income'?'':kind==='sale'?list[0]?.id??'':matchingEvent?.payment?.account||(preset?.category&&!matchingEvent?livingAccount(data)?.id:undefined)||primary,
      to:kind==='income'||kind==='sale'?primary:kind==='transfer'?(item?.target??available.find(a=>a.id!==primary)?.id??''):'',
      category:item?.group==='living'||item?.group==='debt'?item.target:matchingEvent?.payment?.category??'',event:matchingEvent?.id??'',reservation:item?.id??'',sold:0,...preset};
    const fields=[f('name','Название'),f('date','Фактическая дата','date'),f('amount',kind==='sale'?'Выручка после издержек, ₸':'Фактическая сумма, ₸','money')];
    if(kind==='expense')fields.push(f('comment','Комментарий','text',true));
    if(kind!=='income')fields.push(s('from','Списать со счёта',list.map(a=>[a.id,a.name])));
    if(kind!=='expense')fields.push(s('to','Зачислить на счёт',available.filter(a=>kind!=='sale'||a.kind==='cash').map(a=>[a.id,a.name])));
    if(kind==='expense'&&(preset?.category||existing?.reducePayment!==undefined)&&data.debts.some(d=>d.id===(preset?.category??existing?.category)))fields.push(f('reducePayment','Уменьшить платёж (иначе сократить срок)','boolean'));
    if(kind==='sale')fields.push(f('sold','Рыночная стоимость продаваемой части, ₸','money'));
    if(kind==='expense'&&!item&&(!matchingEvent||existing)&&!preset?.category)fields.push(s('category','Категория бюджета',data.categories.map(c=>[c.id,c.name]),true));
    if(existing&&matchingEvent&&kind==='expense')fields.push(f('detach','Отвязать расход от календарного платежа','boolean'));
    if(!matchingEvent&&(kind==='income'||kind==='expense')&&!preset?.category)fields.push(s('event','Сопоставить с календарём',openEvents.map(e=>[e.id,e.name+' · '+shortDate(e.date)]),true));
    if((kind==='income'||kind==='expense')&&(matchingEvent||openEvents.length)&&!preset?.category)fields.push(f('finalPayment','Остаток по этому событию не ожидается','boolean'));
    if(!item&&!matchingEvent&&kind!=='income'&&!existing)fields.push(s('reservation','Использовать резерв',planRows(data).map(i=>[i.id,i.name+' · '+money(i.left)]),true));
    M({title:existing?'Исправить операцию':kindNames[kind],fields,initial:scalarFields(existing??newEntry),submit:v=>{
      const {detach,...values}=v;
      const e={...(existing??newEntry),...values} as Entry;
      if(detach){
        const next=detachExpense(data,e);
        if(next===data)return;
        const saved=next.transactions.find(t=>t.id===e.id)!;
        const error=validateEntry(next,saved);
        if(error){N(error);return;}
        void persist(next,'Расход отвязан от платежа').then(ok=>{if(ok)M(null);});
        return;
      }
      if(e.reducePayment&&e.kind!=='expense')delete e.reducePayment;
      const selected=matchingEvent??openEvents.find(x=>x.id===e.event);
      const direct=item??planRows(data).find(i=>i.id===e.reservation);
      if(direct){
        const savings=['otbasy','bcc','reserve'].includes(direct.group);
        if(savings&&(kind!=='transfer'||e.to!==direct.target)){N('Для этого резерва подтвердите перевод на указанный счёт.');return;}
        if(!savings&&kind!=='expense'){N('Для этого резерва подтвердите расход.');return;}
      }
      if(direct&&kind==='expense'&&direct.group==='living')e.category=direct.target;
      if(direct&&kind==='expense'&&direct.group==='debt')e.category=direct.target;
      const linked=selected??(direct?calendar(data,month(day,-12),month(day,2)).find(x=>x.id===direct.target):undefined);
      if(direct&&['bills','purchases'].includes(direct.group)&&(!linked||linked.id!==direct.target)){N('Выберите событие, для которого создан резерв.');return;}
      if(linked){
        const outstanding=existing?Math.max(0,linked.amount-sum(data.transactions.filter(t=>t.event===linked.id&&t.id!==existing.id).map(t=>t.amount))):remainingEvent(linked,data.transactions);
        if(kind==='expense'&&!existing&&(!outstanding||(e.amount>outstanding))){N('Сумма превышает остаток. Сначала измените сумму платежа.');return;}
        if(kind==='expense'&&e.amount<outstanding&&(linked.payment?.partial===false||e.amount<(linked.payment?.minimum??0))){N('Укажите полную сумму или допустимый частичный платёж.');return;}
        if(kind==='expense'&&!existing&&linked.payment?.early===false&&e.date<linked.date){N('Досрочная оплата отключена для этого платежа.');return;}
        e.event=linked.id;
        if(kind==='expense'&&!existing)e.category=linked.payment?.category||e.category;
      }
      if(!e.event&&data.debts.some(d=>d.id===e.category)){
        const debt=data.debts.find(d=>d.id===e.category)!;
        if(e.amount>effectiveDebt(debt,{...data,transactions:data.transactions.filter(t=>t.id!==e.id)}).balance){N('Сумма больше остатка долга.');return;}
      }
      const useAutomatic=kind==='expense'&&!existing&&!item&&!e.reservation;
      commitEntry(useAutomatic&&(linked||e.category)?withPaymentReserves(data,e,linked?.id??e.category):e,linked);
    }});
  }
  function changePayment(event:Event,field:'amount'|'date'){
    const state=paymentState(data,event,day);
    const loan=data.debts.find(loan=>event.rule===loan.id&&loan.installments);
    M({title:(field==='amount'?'Изменить сумму · ':'Перенести платёж · ')+event.name,
      fields:[field==='amount'?f('amount','Полная сумма платежа, ₸','money'):f('date','Новая дата платежа','date')],
      initial:{amount:event.amount,date:event.date},
      actions:<p>Изменится только этот платёж. Подтверждённые операции сохранятся.</p>,
      submit:v=>{
        const amount=field==='amount'?Number(v.amount):event.amount;
        const date=field==='date'?String(v.date):event.date;
        if(amount<=state.actual||!date){N('Сумма должна быть больше уже оплаченной части.');return;}
        const updated={...event,amount,date,deadline:event.deadline?addDays(event.deadline,days(event.date,date)):undefined,
          status:(date!==event.date?'moved':event.status) as Event['status']};
        const targetRow=loan?.installments?.find(row=>event.id===loan.id+'@'+row.date);
        const accounted=sum(data.transactions.filter(t=>loan?.accountedPayments?.includes(t.id)&&t.event===event.id).map(t=>t.amount));
        const revised=loan&&targetRow&&field==='amount'?{...loan,
          installments:loan.installments!.map(row=>row===targetRow?{...row,amount:amount-accounted}:row)}:null;
        const next={...data,events:setRow(data.events,updated),debts:revised?setRow(data.debts,revised):data.debts};
        void persist({...next,plans:trimPaymentReserves(next,updated)},'Платёж обновлён').then(ok=>{if(ok)M(null);});
      }});
  }
  function eventEditor(event:Event){
    setInbox(false);
    const form=editor('events',data,scalarFields(event));
    const status=event.kind==='expense'?paymentState(data,event,day):null;
    if(status){
      form.fields=form.fields.map(field=>field.key==='amount'?{...field,label:'Плановая сумма, ₸'}:field);
      form.fields.push(f('deadline','Крайний срок','date',true));
    }
    const active=remainingEvent(event,data.transactions)>0;
    M({title:event.name,...form,primaryFields:status?0:undefined,actions:<>
      {status&&<p>{status.label} · рекомендованная дата {shortDate(status.recommended)} · оплачено {money(status.actual)} · в резерве {money(status.held)} · осталось оплатить {money(status.remaining)} · осталось зарезервировать {money(status.missing)}.</p>}
      {status&&!!event.payment?.discount&&<p>Возможная досрочная скидка {event.payment.discount}%. Сверьте итоговую сумму перед оплатой.</p>}
      {active&&event.kind==='expense'&&<>
        <Button variant="outline" onClick={()=>operation('expense',event)}>Отметить оплату</Button>
        <Button variant="outline" onClick={()=>changePayment(event,'amount')}>Изменить сумму</Button>
        <Button variant="outline" onClick={()=>changePayment(event,'date')}>Перенести</Button>
      </>}
      {status&&status.actual>0&&status.remaining>0&&<>
        <p>Если {money(status.actual)} — полная сумма по счёту, закрой платёж без доплаты. Свободная часть резерва вернётся в бюджет.</p>
        <Button variant="outline" disabled={busy} onClick={()=>{
          void persist(closePaidExpense(data,event,day),'Платёж закрыт').then(ok=>{if(ok)M(null);});
        }}>Закрыть без доплаты</Button>
      </>}
      {status&&active&&status.actual===0&&event.date<=day&&<Button variant="outline" disabled={busy} onClick={()=>{
        const updated:Event={...event,status:'settled_before_tracking'};
        const next={...data,events:setRow(data.events,updated)};
        void persist({...next,plans:trimPaymentReserves(next,updated)},'Отмечено без списания').then(ok=>{if(ok)M(null);});
      }}>Уже оплачено до начала учёта</Button>}
      {status&&status.missing>0&&<Button variant="outline" onClick={()=>reservePayment(event)}>Зарезервировать</Button>}
      {active&&event.kind==='income'&&<Button variant="outline" onClick={()=>operation('income',event)}>Получил деньги</Button>}
    </>,submit:v=>{
      if(data.transactions.some(t=>t.event===event.id)&&v.kind!==event.kind){N('У платежа уже есть подтверждённые операции.');return;}
      const updated={...event,...v} as Event;
      if(updated.date!==event.date&&updated.status==='planned')updated.status='moved';
      const next={...data,events:setRow(data.events,updated)};
      void persist({...next,plans:trimPaymentReserves(next,updated)}).then(ok=>{if(ok)M(null);});
    }});
  }
  function release(plan:Plan){void persist({...data,plans:setRow(data.plans,{...plan,status:'released'})},'Резерв освобождён');}
  function accept(){
    if(!draft)return;
    const allocated=draft.filter(i=>i.amount>0&&i.group!=='free').map(i=>({...i,id:crypto.randomUUID(),budgetMonth:i.group==='living'?first(day):undefined}));
    const wallet=livingAccount(data);
    if(wallet&&envelopeSummary(data).living+sum(allocated.filter(i=>i.group==='living').map(i=>i.amount))>balance(wallet,data.transactions)){
      N('На привязанном счёте не хватает денег для этого распределения.');return;
    }
    if(sum(draft.map(i=>i.amount))!==Math.max(0,cash(data)-reserved(data))){N('Распределение должно совпадать со свободным остатком.');return;}
    if(draft.some(i=>['otbasy','bcc','reserve','debt'].includes(i.group)&&i.amount>0)&&
      sum(draft.filter(i=>['otbasy','bcc','reserve','debt'].includes(i.group)).map(i=>i.amount))>dailyBudget(data,day).save){N('Для накоплений сейчас доступно меньше: сначала защитите платежи, покупки и минимум на жизнь.');return;}
    if(!allocated.length){N('Выберите сумму для резервирования.');return;}
    const baseline=allocation(data,day,data.scenarios.find(s=>s.id===scenario),allocationPeriod);
    if(baseline.some(i=>i.group==='living'&&i.amount>(draft.find(j=>j.id===i.id)?.amount??0))
      &&!window.confirm('Вы уменьшили резерв на комфортный минимум. Подтвердить исключение для этого распределения?'))return;
    void persist({...data,plans:[...data.plans,{id:crypto.randomUUID(),date:day,items:allocated,status:'accepted'}]},'Распределение принято').then(ok=>{if(ok){setDraft(null);go('checklist');}});
  }

  async function auth(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!db){N('Настройте Supabase по README, чтобы создать аккаунт.');return;}
    const form=new FormData(e.currentTarget);
    const email=String(form.get('email')??'').trim();
    const password=String(form.get('password')??'');
    const redirectTo=window.location.origin;
    B(true);
    try{
      const result=authMode==='recover'?await db.auth.updateUser({password}):authMode==='signUp'?await db.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}}):
        authMode==='magic'?await db.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}}):
        authMode==='reset'?await db.auth.resetPasswordForEmail(email,{redirectTo}):await db.auth.signInWithPassword({email,password});
      if(result.error){N(result.error.message);return;}
      N(authMode==='magic'||authMode==='reset'||authMode==='signUp'?'Проверьте почту.':'Доступ подтверждён.');
      A(null);
    }finally{B(false);}
  }
  async function importFile(file?:File){
    if(!file||!workspace)return;
    if(file.size>3_000_000){N('Файл больше 3 МБ.');return;}
    try{
      const parsed=dataSchema.parse(JSON.parse(await file.text()));
      if(revision>0&&!window.confirm('Заменить текущие данные содержимым файла?'))return;
      if(await persist(parsed,'Данные импортированы'))go('dashboard');
    }catch{N('Файл не соответствует формату Tenge.');}
  }
  function csv(){
    const line=(items:(string|number)[])=>items.map(x=>'"'+String(x).replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"').join(';');
    download('tenge.csv','\ufeff'+[line(['Дата','Операция','Тип','Сумма, ₸','Списано','Зачислено']),...data.transactions.map(t=>line([t.date,t.name,kindNames[t.kind],(t.amount/100).toFixed(2),data.accounts.find(a=>a.id===t.from)?.name??'',data.accounts.find(a=>a.id===t.to)?.name??'']))].join('\r\n'),'text/csv;charset=utf-8');
  }
  async function createShared(v:Record<string,Value>){
    if(!db||!session)return;
    const result=await db.from('households').insert({owner:session.user.id,label:String(v.label),shared:true}).select('id,owner,label,shared').single();
    if(result.error){N('Не удалось создать семейный бюджет.');return;}
    H([...households,result.data]);await loadWorkspace(result.data);N('Семейный бюджет создан');
  }
  async function invite(v:Record<string,Value>){
    if(!db||!workspace)return;
    const email=String(v.email).toLowerCase().trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){N('Проверьте email.');return;}
    const result=await db.from('household_members').upsert({household:workspace.id,email,can_edit:Boolean(v.can_edit)});
    if(result.error){N('Не удалось предоставить доступ.');return;}
    setMembers([...members.filter(m=>m.email!==email),{email,can_edit:Boolean(v.can_edit)}]);M(null);N('Доступ предоставлен. Участнику нужно войти с этим email.');
  }
  async function deleteUser(){
    if(!window.confirm('Удалить аккаунт и принадлежащий ему семейный бюджет? Это действие необратимо.'))return;
    const result=await fetch('/api/workspace',{method:'DELETE',headers:{Authorization:'Bearer '+session?.access_token}});
    if(!result.ok){N('Не удалось удалить аккаунт.');return;}
    await db?.auth.signOut({scope:'local'});
  }

  const draftForecast=useMemo(()=>{
    if(!draft||!goal||!draft.length)return null;
    const plan:Plan={id:'preview',date:day,status:'accepted',items:draft.filter(i=>i.group!=='free')};
    return forecast({...data,plans:[...data.plans,plan]},goal,day,activeScenario);
  },[draft,goal,data,day,activeScenario]);
  const currentEvents=useMemo(()=>calendar(data,pointer,month(pointer,1)).filter(e=>e.date<month(pointer,1)),[data,pointer]);
  const ruleDates=useMemo(()=>{
    const upcoming=new Map<string,string>();
    for(const event of calendar(data,day,month(day,15))){
      if(event.rule&&!upcoming.has(event.rule)&&remainingEvent(event,data.transactions)>0)upcoming.set(event.rule,event.date);
    }
    return upcoming;
  },[data,day]);
  const ruleDetail=(r:Rule)=>{
    if(!r.active)return 'Архив';
    const next=ruleDates.get(r.id);
    if(next)return (r.kind==='expense'?'Следующий платёж: ':'Следующее поступление: ')+shortDate(next);
    return r.date||r.dates?.length?'Ближайших событий нет':'Нужно указать дату';
  };
  const reserves=planRows(data);
  const wallet=useMemo(()=>dailyBudget(data,day),[data,day]);
  const alerts=useMemo(()=>reminders(data,day,clock),[data,day,clock]);
  const monthPayments=useMemo(()=>calendar(data,first(day),month(first(day),1)).filter(e=>e.kind==='expense'&&e.date<month(first(day),1)&&e.status!=='canceled'&&!e.id.startsWith('purchase@')).map(event=>({event,...paymentState(data,event,day)})),[data,day]);
  const listEvents=useMemo(()=>section==='calendar'?paymentCalendarEvents(data,pointer,day):[],[data,pointer,day,section]);
  const visibleEvents=currentEvents.filter(e=>e.status!=='canceled'&&e.kind!=='notice'&&(eventFilter==='all'||e.kind===eventFilter));
  const paymentSections=section==='calendar'?paymentGroups(data,listEvents,pointer,day,wallet.income?wallet.end:undefined):[];
  const historyByDate=section==='history'?datedHistory(data.transactions,accountHistory):[];
  const contributionProgress=draft?savingPlanProgress(data,allocationPeriod,draft):[];
  const toggleTheme=()=>{localStorage.setItem('theme',theme?'light':'dark');setTheme(!theme);};
  const heading=(title:string,description:string,action?:React.ReactNode)=><SectionHeading page title={title} description={description} action={action}/>;
  const add=(entity:Entity,label:string)=><Button onClick={()=>edit(entity)}><Plus size={18}/>{label}</Button>;
  const row=(name:string,detail:string,value:string,click:()=>void)=><FinancialRow key={name+detail} name={name} detail={detail} value={value} onClick={click}/>;
  const editPriority=()=>{
    const initial=Object.fromEntries(Object.keys(groupNames).filter(g=>g!=='free').map(g=>[g,data.settings.priority.indexOf(g)+1]));
    M({title:'Приоритеты распределения',initial,fields:Object.entries(groupNames).filter(([g])=>g!=='free').map(([g,label])=>f(g,label,'number')),submit:v=>{
      const priority=Object.keys(initial).sort((a,b)=>Number(v[a])-Number(v[b])).concat('free');
      void persist({...data,settings:{...data.settings,priority}}).then(ok=>{if(ok)M(null);});
    }});
  };
  const wallets=section==='budget'?envelopeSummary(data):null;
  const reservesPanel=<section className="card"><div className="section-head"><div><h2>Что осталось сделать</h2><p>Отложено {money(reserved(data))}. Подтвердите оплату или перевод после выполнения.</p></div><ShieldCheck size={22}/></div>
              {!reserves.length&&<Blank>Здесь появятся позиции после принятия распределения.</Blank>}
              {reserves.map(i=>row(i.name,groupNames[i.group]??i.reason,money(i.left),()=>{
                const item={...i,amount:i.left};
                const event=['bills','purchases'].includes(i.group)?calendar(data,month(day,-12),month(day,36)).find(e=>e.id===i.target):undefined;
                if(event){operation('expense',event);return;}
                operation(['otbasy','bcc','reserve'].includes(i.group)?'transfer':'expense',undefined,item);
              }))}
              {data.plans.filter(p=>p.status==='accepted'&&reserves.some(i=>i.plan===p.id)).map(p=><Button key={p.id} variant="outline" disabled={busy} onClick={()=>release(p)}>Освободить резерв от {shortDate(p.date)}</Button>)}
            </section>;
  return <div className="shell">
    <aside className={'sidebar '+(mobile?'opened':'')}>
      <button className="brand" onClick={()=>go('dashboard')}><span className="brand-icon"><ChartNoAxesCombined size={20}/></span><span>Tenge</span></button>
      <nav className="primary-nav" aria-label="Разделы">{nav.slice(0,4).map(([id,label,Icon])=><button key={id} className={section===id?'active':''} onClick={()=>go(id)} aria-current={section===id?'page':undefined}><Icon size={18}/><span>{label}</span></button>)}
        <button className={section==='more'||nav.slice(4).some(([id])=>id===section)?'active':''} onClick={()=>go('more')} aria-current={section==='more'?'page':undefined}><Menu size={18}/><span>Ещё</span></button>
      </nav>
      <div className="side-bottom"><button className="profile" onClick={()=>session?go('settings'):A('login')}><span className="avatar">{session?.user.email?.slice(0,2).toUpperCase()??'T'}</span><span><b>{session?'Мой аккаунт':'Личный бюджет'}</b><small>{session?.user.email??'Демонстрационный режим'}</small></span><ChevronDown size={15}/></button></div>
    </aside>
    {mobile&&<button className="backdrop" aria-label="Закрыть меню" onClick={()=>setMobile(false)}/>}
    <div className="workspace">
      <header className="topbar"><div><Button variant="ghost" className="mobile-menu" onClick={()=>setMobile(true)} aria-label="Меню"><Menu size={22}/></Button></div><div>
        <Button variant="ghost" aria-label="Уведомления" onClick={()=>setInbox(true)}><Bell size={19}/>{alerts.length>0&&<span className="alert-count">{alerts.length}</span>}</Button>
        <span className="currency"><span/> KZT</span>
        <Button variant="ghost" onClick={toggleTheme} aria-label={theme?'Светлая тема':'Тёмная тема'}>{theme?<Sun size={19}/>:<Moon size={19}/>}</Button>
        {(!db||settled)&&(!session?<Button variant="outline" onClick={()=>A('login')}>Войти</Button>:<Button variant="ghost" disabled={busy} onClick={()=>void db?.auth.signOut()} aria-label="Выйти"><LogOut size={19}/></Button>)}
      </div></header>
      <main>
        {db&&(!settled||session&&!workspace)?<section className="card">
          <p>{workspaceError||'Загружаем данные рабочего пространства.'}</p>
          {workspaceError&&<Button variant="outline" onClick={()=>window.location.reload()}>Повторить загрузку</Button>}
        </section>:<>
        {section==='more'&&<><div className="page-heading"><h1>Ещё</h1></div><section className="card">{nav.slice(4).filter(([id])=>id!=='goals'&&id!=='purchases').map(([id,label,Icon])=><button className="list-row" key={id} onClick={()=>go(id)}><span className="inline"><Icon size={18}/><b>{label}</b></span><ChevronRight size={16}/></button>)}</section></>}
        {section==='dashboard'&&(!session||workspace)&&<Dashboard data={data} date={day} go={go} updateBalance={updateStartingCash} income={quickIncome} expense={quickExpense} transfer={()=>operation('transfer')} purchase={()=>assessPurchase()} prediction={currentForecast} openPayment={eventEditor} openMonth={period=>{setPlanPeriod(period);go('month');}}/>}
        {section==='month'&&<MonthScreen data={data} date={day} period={planPeriod||first(day)} prediction={currentForecast} changePeriod={setPlanPeriod}
          editPlan={editNextMonthPlan} openPayment={row=>openMonthPayment(row,planPeriod||first(day))} openBudget={()=>go('budget')} openPayments={()=>{setPointer(planPeriod||first(day));go('calendar');}}
          report={()=>{setReportPeriod(planPeriod||first(day));setShowReport(true);}}/>}
        {section==='checklist'&&<>{heading('План принят','Деньги отложены в Tenge. Отмечайте фактически выполненные действия.',<Button variant="outline" onClick={()=>go('month')}>Вернуться к плану</Button>)}{reservesPanel}</>}
        {section==='budget'&&<>
          {heading('Бюджет','Расходы и платежи на месяц.',<Button onClick={quickExpense}><Plus size={18}/> Добавить расход</Button>)}
          <section className="card">
            <SectionHeading title="Куда распределены деньги" description="Кошельки показывают назначение денег на реальных счетах."
              action={<Button variant="outline" onClick={()=>operation('transfer',undefined,undefined,undefined,{
                to:data.accounts.find(a=>a.kind==='otbasy'||a.kind==='bcc')?.id??'',name:'Пополнение накоплений',
              })}>Перевести на депозит</Button>}/>
            <dl className="envelope-figures">{([
              ['Свободные деньги','free'],['На обязательные платежи','bills'],['На жизнь','living'],['На крупные покупки','purchases'],
              ['На накопления','savings'],['Финансовая подушка','cushion'],
            ] as const).map(([label,key])=><div className="report-term" key={key}><dt>{label}</dt><dd>{money(wallets?.[key]??0)}</dd></div>)}</dl>
          </section>
          <div className="quick"><Button variant="outline" onClick={()=>go('purchases')}>Планы и покупки</Button><Button variant="outline" onClick={()=>openPlan()}>Распределить деньги</Button></div>
          <section className="card"><div className="section-head"><div><h2>Обязательные платежи</h2><p>Даты, суммы и напоминания</p></div><Button onClick={()=>editPayment()}><Plus size={18}/> Новый платёж</Button></div>
            <p>Всего {money(sum(monthPayments.map(p=>p.actual+p.remaining+(p.event.status==='settled_before_tracking'?p.event.amount:0))))} · оплачено {money(sum(monthPayments.map(p=>p.actual+(p.event.status==='settled_before_tracking'?p.event.amount:0))))} · осталось {money(sum(monthPayments.map(p=>p.remaining)))} · отложить {money(sum(monthPayments.map(p=>p.missing)))}</p>
            {monthPayments.filter(p=>p.remaining>0).map(p=><div className="action-row" key={p.event.id}>
              <PaymentRow name={p.event.name} detail={shortDate(dueDate(p.event))} status={p.label} value={money(p.remaining)} onClick={()=>eventEditor(p.event)}/>
              <Button variant="outline" onClick={()=>operation('expense',p.event)}>Оплатил</Button>
            </div>)}
            {monthPayments.some(p=>p.remaining===0)&&<Disclosure summary={<>Оплачено</>}>{monthPayments.filter(p=>p.remaining===0).map(p=>
              row(p.event.name,shortDate(dueDate(p.event))+' · план '+money(p.event.amount)+(p.actual?' · факт '+money(p.actual):' · '+p.label),
                money(p.actual||p.event.amount),()=>eventEditor(p.event)))}</Disclosure>}
            {!monthPayments.length&&<Blank>В этом месяце нет платежей с датой.</Blank>}
            <Button variant="ghost" onClick={()=>go('settings')}>Настройки регулярных платежей</Button>
            <Button variant="ghost" onClick={()=>setShowReport(true)}>Отчёт за месяц</Button>
          </section>
          <div className="split">
            <section className="card"><SectionHeading title="Кошелёк на жизнь" description={livingAccount(data)?.name??'Виртуальный кошелёк'} action={add('categories','Категория')}/>
              <Button variant="outline" onClick={configureLivingAccount}>Настроить счёт кошелька</Button>
              {!data.categories.length&&<Blank>Добавьте свои категории бюджета.</Blank>}
              {data.categories.map(c=>{
                const spent=categorySpent(data,c.id,day);
                const budget=categoryBudget(data,c,day);
                const left=budget-spent;
                const amounts=envelopeAmounts(data,c,day);
                const {changes:cuts}=budgetCuts(data,day,Math.max(0,-left),c.id);
                return <div className="budget-item" key={c.id}>
                  {row(c.name,'Настроить план',money(budget),()=>edit('categories',c))}
                  <Progress label={'Расходы · '+c.name} value={budget?100*spent/budget:0} over={left<0}/>
                  <dl className="envelope-figures"><dt>План</dt><dd>{money(amounts.plan)}</dd><dt>Выделено</dt><dd>{money(amounts.assigned)}</dd><dt>Потрачено</dt><dd>{money(amounts.spent)}</dd><dt>Доступно</dt><dd>{money(amounts.available)}</dd></dl>
                  <Disclosure summary={<>Управлять деньгами · {c.name}</>}><div className="quick">
                    <Button variant="outline" onClick={()=>changeLivingReserve(c.id,'assign')}>Выделить деньги</Button>
                    {amounts.available>0&&<>
                      <Button variant="outline" onClick={()=>changeLivingReserve(c.id,'release')}>Освободить остаток</Button>
                      <Button variant="outline" onClick={()=>changeLivingReserve(c.id,'move')}>Перераспределить деньги</Button>
                      <Button variant="outline" onClick={()=>changeLivingReserve(c.id,'save')}>Перевести экономию на накопления</Button>
                      <Button variant="ghost" onClick={()=>changeLivingReserve(c.id,'carry')}>Перенести на следующий месяц</Button>
                    </>}
                  </div></Disclosure>
                  {left<0&&cuts.length>0&&<p className="budget-tip">Можно перераспределить {cuts.map(x=>x.category.name+' · '+money(x.amount)).join(', ')}. <Button variant="outline" disabled={busy} onClick={()=>{
                    if(!window.confirm('Подтвердить перераспределение бюджета?'))return;
                    const moved=sum(cuts.map(x=>x.amount));
                    const key=first(day);
                    const budgets={...data.settings.monthly?.[key],[c.id]:budget+moved};
                    for(const cut of cuts)budgets[cut.category.id]=categoryBudget(data,cut.category,day)-cut.amount;
                    void persist({...data,settings:{...data.settings,monthly:{...data.settings.monthly,[key]:budgets}}});
                  }}>Применить</Button></p>}
                </div>;
              })}
            </section>
            {reservesPanel}

          </div>
        </>}
        {section==='calendar'&&<>
          {heading('Платежи','Отслеживайте поступления, платежи и важные даты.',add('events','Добавить событие'))}

          <section className="card"><div className="section-head calendar-controls"><div className="inline"><Button variant="outline" aria-label="Предыдущий месяц" onClick={()=>setPointer(month(pointer,-1))}><ChevronLeft size={18}/></Button><h2>{dayLabel(pointer)}</h2><Button variant="outline" aria-label="Следующий месяц" onClick={()=>setPointer(month(pointer,1))}><ChevronRight size={18}/></Button></div><div className="inline"><select aria-label="Вид событий" value={eventFilter} onChange={e=>setEventFilter(e.target.value as typeof eventFilter)}><option value="all">Все</option><option value="income">Доходы</option><option value="expense">Расходы</option><option value="saving">Накопления</option></select><Button variant={mode==='month'?'default':'outline'} onClick={()=>setMode('month')}>Месяц</Button><Button variant={mode==='list'?'default':'outline'} onClick={()=>setMode('list')}>Список</Button><Button variant="outline" onClick={()=>exportCalendar(data,pointer)}>Экспорт ICS</Button></div></div>
          {mode==='month'?<div className="month-grid">
            {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=><div className="weekday" key={x}>{x}</div>)}
            {Array.from({length:(new Date(pointer+'T00:00:00Z').getUTCDay()+6)%7},(_,i)=><div className="calendar-empty" key={'empty'+i}/>)}
            {Array.from({length:days(pointer,month(pointer,1))},(_,i)=>{
              const date=pointer.slice(0,8)+String(i+1).padStart(2,'0');
              return <div className={'calendar-cell '+(date===day?'current-date':'')} key={date}><span>{i+1}</span>{visibleEvents.filter(e=>e.date===date).map(e=><button key={e.id} title={e.name} className={'event-chip '+e.kind+' '+e.status} onClick={()=>eventEditor(e)}>{e.name}</button>)}</div>;
            })}
          </div>:eventFilter==='expense'||eventFilter==='all'?<>
            {paymentSections.map(group=><section className="calendar-group" key={group.label}>
              <SectionHeading title={group.label}/>
              {group.events.length===0&&<p>Нет платежей</p>}
              {group.events.map(e=>{
                const state=paymentState(data,e,day);
                return <div key={e.id}>
                  <div className="action-row"><PaymentRow name={e.name} detail={shortDate(dueDate(e))+' '+dueDate(e).slice(0,4)}
                    status={state.label} value={<Amount value={state.remaining||state.actual||e.amount}/>} onClick={()=>eventEditor(e)}/>
                    {state.remaining>0&&<Button variant="outline" onClick={()=>operation('expense',e)}>Оплатил</Button>}
                  </div>
                </div>;
              })}
            </section>)}
            {eventFilter==='all'&&visibleEvents.filter(e=>e.kind!=='expense').map(e=>row(e.name,shortDate(e.date)+' · '+eventNames[e.status],money(e.amount),()=>eventEditor(e)))}
          </>:visibleEvents.length?visibleEvents.map(e=>row(e.name,shortDate(e.date)+' · '+eventNames[e.status],money(e.amount),()=>eventEditor(e))):<Blank>В этом месяце нет событий.</Blank>}
          </section>
          <div><Button variant="ghost" onClick={()=>go('settings')}>Настройки регулярных платежей</Button></div>
        </>}
        {section==='accounts'&&<>
          {heading('Накопления','Счета, депозиты и активы.',add('accounts','Добавить счёт'))}
          <div className="account-list">{data.accounts.map(a=>{
            const amount=balance(a,data.transactions), Icon=kinds[a.kind];
            const basis=marketBasis(a,data.transactions);
            const interest=a.interest||Math.round(a.score*a.contract/1000);
            const future=a.futureContract||a.contract;
            const mrp=data.settings.mrp[day.slice(0,4)]??0;
            const cashYield=bccYield(a,amount,91);
            const savingsAccount=['otbasy','bcc','reserve'].includes(a.kind)||a.kind==='cash'&&goalPurpose(a)==='cushion';
            const projected=(currentForecast?.deposits??[]).filter(row=>row.account===a.id&&first(row.date)===first(day));
            const planned=sum(projected.map(row=>row.amount));
            const funded=depositTransfers(data,a.id,first(day));
            const accountPlan=data.settings.monthlySavingPlan?.[first(day)]?.[a.id];
            const topup=accountPlan===undefined?planned:Math.max(0,accountPlan-funded);
            return <AccountCard key={a.id} icon={<Icon size={18}/>} name={a.name} value={amount}
              caption={accountNames[a.kind]}
              actions={savingsAccount?<div className="savings-account-actions"><p>Месяц · план <Amount value={accountPlan??planned+funded}/> · факт <Amount value={funded}/></p>
                <Button variant="outline" onClick={()=>operation('transfer',undefined,undefined,undefined,{
                  name:'Пополнение · '+a.name,to:a.id,from:data.accounts.find(account=>account.kind==='cash'&&account.id!==a.id)?.id,amount:topup,
                })}>Пополнить</Button></div>:undefined}>
              {projected.length>0&&<p>{[...new Set(projected.map(row=>row.reason))].join(' · ')}</p>}
              <p>{a.owner||'Владелец не указан'}</p>
              {a.kind==='market'&&<dl><dt>Сумма вложений</dt><dd>{a.basis?money(basis):'Укажите'}</dd><dt>Прибыль / убыток</dt><dd>{a.basis?money(amount-basis):'—'}</dd><dt>Оценка чистой продажи</dt><dd>{money(Math.round(amount*(1-a.fee/100)))}</dd></dl>}
              {a.kind==='bcc'&&<dl><dt>ГЭСВ</dt><dd>{a.rate}%</dd><dt>Номинальная ставка</dt><dd>{a.nominal?a.nominal+'%':'Укажите'}</dd><dt>Срок и продление</dt><dd>{a.termMonths?a.termMonths+' мес.':'Срок не указан'} · {a.rollover?'авто':'вручную'}</dd><dt>Окончание</dt><dd>{shortDate(a.maturity)}</dd>{!a.maturity&&a.liquidity!=='liquid'&&<><dt>Доступность для плана</dt><dd>Укажите дату окончания или возможность снятия</dd></>}<dt>Доход за 3 / 6 / 12 мес.</dt><dd>{[cashYield,bccYield(a,amount,182),bccYield(a,amount,365)].map(money).join(' / ')}</dd><dt>Потеря при раннем закрытии, оценка</dt><dd>{a.opened?money(Math.max(0,bccYield(a,amount,days(a.opened,day))-depositYield(amount,a.earlyRate,days(a.opened,day)))):'Укажите дату открытия'}</dd></dl>}
              {a.kind==='otbasy'&&<dl><dt>Фактический / расчётный ОП</dt><dd>{a.score.toFixed(2)} / {score(interest,a.contract).toFixed(2)}</dd><dt>После изменения договора</dt><dd>{score(interest,future).toFixed(2)}</dd><dt>Прогноз ОП к цели</dt><dd>{score(interest+otbasyYield(amount,a.rate,day,goal?.date??day),future).toFixed(2)}</dd><dt>Вознаграждение до цели</dt><dd>{goal?money(Math.max(0,Math.round(goal.score*future/1000-interest))):'—'}</dd>{goal&&future>0&&<><dt>Вознаграждение до ОП {goal.laterScore}</dt><dd>{money(Math.max(0,Math.round(goal.laterScore*future/1000-interest)))}</dd>
                <dt>Дней до целевого ОП на текущем балансе</dt><dd>{amount&&a.rate?Math.ceil(Math.max(0,goal.score*future/1000-interest)*36000/(amount*a.rate)):'—'}</dd></>}
                <dt>Остаток годового лимита</dt><dd>{mrp?money(Math.max(0,mrp*200-Math.max(0,a.eligible-a.awarded))):'Укажите МРП'}</dd><dt>Ожидаемая госпремия</dt><dd>{mrp?money(bonus(a.eligible,mrp,a.awarded)):'—'}</dd></dl>}
              {a.kind==='market'&&<div className="quick"><Button variant="outline" onClick={()=>planSale(a)}>Запланировать продажу</Button>
                {data.settings.plannedSales?.filter(sale=>sale.account===a.id&&!data.transactions.some(t=>t.plannedSale===sale.id)).map(sale=>
                  <Button key={sale.id} variant="outline" onClick={()=>operation('sale',undefined,undefined,undefined,{from:a.id,name:'Продажа · '+a.name,sold:sale.value,amount:sale.proceeds,plannedSale:sale.id})}>Подтвердить продажу · {shortDate(sale.date)}</Button>)}
              </div>}
              <div className="quick"><Button variant="outline" onClick={()=>configureGoalAccount(a)}>Доля в цели · {goalShare(a)}%</Button><Button variant="outline" onClick={()=>edit('accounts',a)}>Изменить</Button><Button variant="ghost" onClick={()=>valuation(a)}>{a.kind==='market'?'Переоценка':'Сверить баланс'}</Button><Button variant="ghost" onClick={()=>{setAccountHistory(a.id);go('history');}}>Операции</Button></div>
            </AccountCard>;
          })}</div>
          {!data.accounts.length&&<Blank>Добавьте счёт или загрузите начальный профиль в настройках.</Blank>}
          {data.accounts.some(a=>a.kind==='otbasy')&&<Disclosure className="card" summary="Семейный пакет и госпремии"><div className="quick">{add('bonuses','Добавить госпремию')}</div><p>Расчётный ОП может отличаться от показателя банка. Сверяйте договорную сумму, вознаграждение и условия объединения.</p><p>Прогноз к дате цели · ОП <b>{currentForecast?.deadline?.op.toFixed(2)??'—'}</b></p>
            {governmentAwards(data).map(b=>{
              const name=data.accounts.find(a=>a.id===b.account)?.name??'Отбасы';
              const posted=data.events.find(e=>e.id==='credited@'+b.id);
              const estimate=bonus(b.eligible,data.settings.mrp[String(b.year)]??0,b.credited);
              return <div key={b.id}>{row(name,String(b.year)+' · '+shortDate(b.date)+(posted?.status==='received'?' · зачислена':b.actual?' · сумма по данным банка':b.eligibilityConfirmed?' · условная оценка':' · условия не проверены'),money(b.actual||estimate),()=>edit('bonuses',b))}
                {b.actual>0&&posted?.status!=='received'&&<div className="quick"><Button variant="outline" onClick={()=>operation('income',posted??{id:'credited@'+b.id,name:'Госпремия · '+name,date:day,kind:'income',amount:b.actual,status:'planned',rule:'',comment:''},undefined,undefined,{to:b.account})}>Подтвердить госпремию</Button></div>}</div>;
            })}
          </Disclosure>}
        </>}
        {section==='debts'&&<>
          {heading('Кредиты и рассрочки','Остатки, графики и оценка досрочного погашения.',add('debts','Добавить долг'))}
          <div className="quick"><Button variant="outline" onClick={()=>importInstallments()}>Добавить график Kaspi</Button></div>
          <section className="card"><SectionHeading title="Нагрузка по ближайшим месяцам"/>
            {[0,1,2].map(offset=>{
              const period=month(first(day),offset);
              const end=month(period,1);
              const obligation=sum(calendar(data,period,end).filter(event=>event.date<end&&data.debts.some(loan=>loan.id===event.rule))
                .map(event=>remainingEvent(event,data.transactions)));
              return <FinancialRow key={period} name={dayLabel(period)} value={<Amount value={obligation}/>}/>;
            })}
          </section>
          {!data.debts.length&&<Blank>У вас нет добавленных обязательств.</Blank>}
          {data.debts.map(original=>{
            const loan=effectiveDebt(original,data), payments=schedule(loan);
            return <section className="card" key={loan.id}><SectionHeading title={loan.name} description={loan.confirmed?shortDate(loan.date):'Подтвердите исходные данные'} action={<Amount className="large" value={loan.balance}/>}/>
              <p>{loan.installments?'Следующий платёж ':'Платёж в месяц '}{money(loan.payment)}{payments.length>0?' · до '+shortDate(payments.at(-1)!.date)+' '+payments.at(-1)!.date.slice(0,4):''}</p>
              {payments.length>0&&<p>Ставка {loan.rate}% · ГЭСВ {loan.apr}%{kaspiMode(original)?' · '+(kaspiMode(original)==='aggregate'?'общий график Kaspi':'отдельная рассрочка'):''}</p>}
              {!loan.balance&&<p>Долг закрыт.</p>}
              <div className="quick"><Button variant="outline" onClick={()=>original.installments?importInstallments(original):edit('debts',scalarFields(original))}>{original.installments?'Обновить график':'Настроить'}</Button>
                {loan.balance>0&&loan.confirmed&&payments.length>0&&<Button variant="outline" onClick={()=>compareDebt(original)}>Сравнить досрочное погашение</Button>}</div>
              {payments.length>0&&<Disclosure summary={<>График · {payments.length} платежей</>}><div className="schedule">{payments.map(p=><div className="schedule-row" key={p.date}><span>{shortDate(p.date)} {p.date.slice(0,4)}</span><b>{money(p.amount)}</b><span>Проценты {money(p.interest)}</span><span>Остаток {money(p.remaining)}</span></div>)}</div></Disclosure>}
            </section>;
          })}
        </>}
        {section==='goals'&&<>
          {heading('Финансовые цели','Настройте размер взноса, подушку и желаемый срок покупки.',add('goals','Новая цель'))}
          {!data.goals.length&&<Blank>Создайте цель, чтобы увидеть прогноз накоплений.</Blank>}
          {data.goals.map(g=><section key={g.id} className="card"><div className="section-head"><div><h2>{g.name}</h2><p>{g.completed?'Завершена':shortDate(g.date)+' '+g.date.slice(0,4)+' · допустимо до '+shortDate(g.latest)}</p></div><Button variant="outline" onClick={()=>edit('goals',g)}>Изменить</Button></div>
            <dl><dt>Стоимость объекта</dt><dd>{money(g.price)}</dd><dt>Взнос · {g.down}%</dt><dd>{money(downPayment(g))}</dd><dt>Подушка</dt><dd>{money(g.reserve)}</dd><dt>Целевой ОП</dt><dd>{g.score} · далее {g.laterScore}</dd><dt>Предполагаемая аренда</dt><dd>{money(g.rentMin)} — {money(g.rentMax)}</dd></dl>
          </section>)}
          {goal&&savingsOptimization&&<SavingsRoadmap data={data} goal={goal} day={day} optimized={savingsOptimization} updateTask={updateRoadmap}/>}
        </>}
        {section==='analytics'&&<>
          {heading('Аналитика','Итоги месяца и прогноз по вашим настройкам.')}
          <AnalyticsOverview data={data} day={day} goal={goal} projection={currentForecast} scenario={data.scenarios.length>0?
            <select aria-label="Сценарий" value={activeScenario?.id??''} onChange={e=>setScenario(e.target.value)}>
              {data.scenarios.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select>:undefined}/>
          <Disclosure className="card" summary="Настроить сценарии">
            <div className="quick">{add('scenarios','Новый сценарий')}
              {savingsOptimization&&<Button variant="outline" onClick={()=>edit('scenarios',{...savingsOptimization.model,id:crypto.randomUUID(),name:'Подбор накоплений'})}>Сохранить подбор</Button>}
            </div>
            {data.scenarios.map(item=><FinancialRow key={item.id} name={item.name} detail="Условия прогноза" onClick={()=>edit('scenarios',item)}/>)}
          </Disclosure>
        </>}
        {section==='history'&&<>
          <SectionHeading page title="История операций"/>
          <section className="card">
            <div className="section-head history-controls">
              <select aria-label="Фильтр по счёту" value={accountHistory} onChange={e=>setAccountHistory(e.target.value)}>
                <option value="">Все счета</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <Button variant="ghost" onClick={quickExpense}>Добавить расход</Button>
            </div>
            {!historyByDate.length&&<Blank>Операций по этому фильтру пока нет.</Blank>}
            {historyByDate.map(([date,entries])=><section className="history-day" key={date}>
              <h2>{shortDate(date)} {date.slice(0,4)}</h2>
              {entries.map(t=><FinancialRow key={t.id} icon={t.kind==='income'?<ArrowDownLeft size={18}/>:t.kind==='expense'?<ArrowUpRight size={18}/>:<ArrowLeftRight size={18}/>}
                name={t.name} detail={kindNames[t.kind]+(t.openingBalanceIncluded?' · Учтено в начальном балансе':'')+(entryMonth(t)!==first(t.date)?' · Бюджет '+dayLabel(entryMonth(t)):'')}
                value={<Amount className={'transaction-'+t.kind} value={t.amount} sign={t.kind==='expense'?'−':t.kind==='income'?'+':''}/>} onClick={()=>{
                  if(t.openingBalanceIncluded){recordHistory(t);return;}
                  if(t.kind!=='valuation'){operation(t.kind,undefined,undefined,t);return;}
                  M({title:'Исправить переоценку',fields:[f('name','Название'),f('date','Дата','date'),f('amount','Сумма изменения, ₸','money')],initial:scalarFields(t),submit:v=>commitEntry({...t,...v})});
                }}/>)}
            </section>)}
          </section>
          <Disclosure className="card" summary="Восстановление и сверка истории"><div className="quick">
            <Button variant="outline" onClick={reconcileMonth}>Восстановить первый месяц</Button>
            <Button variant="outline" onClick={()=>recordHistory()}>Добавить историческую запись</Button>
          </div></Disclosure>
        </>}
        {section==='purchases'&&<>
          {heading('Планы и покупки','Будущие покупки учитываются в прогнозе и бюджете до оплаты.',<Button onClick={()=>assessPurchase()}>Хочу купить</Button>)}
          <section className="card">{!data.purchases.length&&<Blank>Добавьте покупку, чтобы увидеть её влияние на накопления.</Blank>}{data.purchases.map(p=>{
            const event=calendar(data,month(day,-12),month(day,36)).find(e=>e.id==='purchase@'+p.id);
            const date=event?.date??p.date;
            const rest=event?remainingEvent(event,data.transactions):0;
            return <div className="purchase" key={p.id}>{row(p.name,shortDate(date)+' · '+(event?eventNames[event.status]:p.status==='done'?'Выполнена':'Отменена'),money(p.amount),()=>edit('purchases',p))}
              {p.comment&&<p>{p.comment}</p>}{event&&rest>0&&<div className="quick"><Button variant="outline" onClick={()=>operation('expense',event,undefined,undefined,{category:p.category})}>Подтвердить покупку</Button>
                <Button variant="outline" onClick={()=>assessPurchase(p.id)}>Оценить влияние</Button></div>}
            </div>;
          })}</section>
        </>}
        {section==='settings'&&<>
          {heading('Настройки','Рабочее пространство, параметры распределения и резервные копии.')}
          <div className="split">
            <section className="card"><h2>Рабочее пространство</h2>
              {demoMode?<><p>Сейчас открыт пример с вымышленными данными. Изменения действуют до обновления страницы.</p><Button onClick={()=>A('login')}>Войти в аккаунт</Button></>:<>
                <p>{session?.user.email}</p>
                <select aria-label="Семейный бюджет" value={workspace.id} onChange={e=>{const h=households.find(h=>h.id===e.target.value);if(h)void loadWorkspace(h);}}>{households.map(h=><option value={h.id} key={h.id}>{h.label+(h.owner===session?.user.id?'':' · приглашение')}</option>)}</select>
                <div className="quick"><Button variant="outline" onClick={()=>M({title:'Новый семейный бюджет',fields:[f('label','Название')],initial:{label:'Семейный бюджет'},submit:v=>void createShared(v)})}>Создать семейный бюджет</Button></div>
                {workspace.shared&&workspace.owner===session?.user.id&&<><p>Участники семейного бюджета</p>
                  {members.map(m=>row(m.email,m.can_edit?'Просмотр и правка':'Просмотр','Изменить',()=>M({title:'Доступ участника',fields:[f('can_edit','Разрешить редактирование','boolean')],initial:{email:m.email,can_edit:m.can_edit},submit:v=>void invite(v),actions:<Button variant="outline" onClick={async()=>{
                    const result=await db?.from('household_members').delete().eq('household',workspace.id).eq('email',m.email);
                    if(result?.error){N('Не удалось отозвать доступ.');return;}setMembers(members.filter(x=>x.email!==m.email));M(null);N('Доступ отозван');
                  }}>Отозвать доступ</Button>})))}
                  <Button variant="outline" onClick={()=>M({title:'Предоставить доступ',fields:[f('email','Email участника'),f('can_edit','Разрешить редактирование','boolean')],initial:{email:'',can_edit:false},submit:v=>void invite(v)})}>Добавить участника</Button>
                </>}
              </>}
            </section>
            <section className="card"><h2>Правила помощника</h2><p>Измените порядок финансирования и МРП для расчёта госпремии.</p>
              <div className="quick"><Button variant="outline" onClick={()=>M({title:'Календарь и напоминания',fields:[f('reminderTime','Время напоминаний, ЧЧ:ММ'),f('safetyDays','Запас до срока, дней','number'),f('conservative','Исключать неопределённые поступления до подтверждения','boolean')],initial:{reminderTime:data.settings.reminderTime??'09:00',safetyDays:data.settings.safetyDays??2,conservative:data.settings.conservative??false},
                actions:<p>Часовой пояс Asia/Almaty. Внутренние уведомления доступны в открытом Tenge. Для внешних напоминаний импортируйте ICS в календарь.</p>,
                submit:v=>void persist({...data,settings:{...data.settings,timeZone:'Asia/Almaty',reminderTime:String(v.reminderTime),safetyDays:Number(v.safetyDays),conservative:Boolean(v.conservative)}}).then(ok=>{if(ok)M(null);})})}>Напоминания</Button><Button variant="outline" onClick={editPriority}>Приоритеты</Button><Button variant="outline" onClick={mergeDutyIncome}>Дежурства в зарплате</Button><Button variant="outline" onClick={()=>M({title:'МРП по годам',fields:[f('year','Год','number'),f('mrp','МРП, ₸','money')],initial:{year:Number(day.slice(0,4)),mrp:data.settings.mrp[day.slice(0,4)]??0},submit:v=>void persist({...data,settings:{...data.settings,mrp:{...data.settings.mrp,[String(v.year)]:Number(v.mrp)}}}).then(ok=>{if(ok)M(null);})})}>Задать МРП</Button></div>
              {Object.entries(data.settings.mrp).map(([y,v])=><p key={y}>{y} · {money(v)}</p>)}
            </section>
          </div>
          <Disclosure className="card" summary="Регулярные платежи и доходы">
            <SectionHeading title="Правила повторения" description="Изменения правил применяются к будущим событиям." action={add('rules','Новое правило')}/>
            {data.rules.map(rule=>row(rule.name,ruleDetail(rule),money(ruleAmount(rule)),()=>rule.kind==='expense'?editPayment(rule):edit('rules',scalarFields(rule))))}
          </Disclosure>
          <section className="card"><h2>Импорт и экспорт</h2><p>Выгрузите резервную копию или историю операций.</p><div className="quick">
            <Button variant="outline" onClick={()=>download('tenge-backup.json',JSON.stringify(data,null,2),'application/json')}>Экспорт JSON</Button>
            <Button variant="outline" onClick={csv}>Экспорт CSV</Button>
            {workspace&&<label className="button outline file-button">Импорт JSON<input type="file" accept=".json,application/json" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>}
          </div></section>
          {workspace&&<Disclosure className="card" summary={<>Удаление аккаунта</>}><p>При удалении аккаунта удаляется принадлежащий ему семейный бюджет.</p><Button variant="outline" className="loss" onClick={()=>void deleteUser()}>Удалить аккаунт</Button></Disclosure>}
        </>}
        </>}
      </main>
    </div>
    <nav className="bottom-nav" aria-label="Основное меню">{nav.slice(0,4).map(([id,label,Icon])=><button key={id} className={section===id?'active':''} onClick={()=>go(id)}><Icon size={21}/>{label}</button>)}<button className={section==='more'||nav.slice(4).some(([id])=>id===section)?'active':''} onClick={()=>go('more')}><Menu size={21}/>Ещё</button></nav>
    {notice&&<div className="toast" role="status"><span>{notice}</span><button aria-label="Скрыть уведомление" onClick={()=>N('')}>×</button></div>}
    {inbox&&!modal&&<Notifications data={data} date={day} clock={clock} close={()=>setInbox(false)} open={eventEditor} busy={busy} mark={(id,snooze)=>void persist({...data,settings:{...data.settings,notifications:{...data.settings.notifications,[id]:snooze?{until:addDays(day,1)}:{read:true}}}},snooze?'Напоминание отложено':'Уведомление прочитано')}/>}
    {showReport&&!modal&&<MonthReport data={data} day={day} initialPeriod={reportPeriod} close={()=>{setReportPeriod('');setShowReport(false);}} closeMonth={closeMonth} reopen={reopenMonth}/>}
    {purchase&&!modal&&<PurchaseCheck data={data} date={day} request={purchase} busy={busy} close={()=>setPurchase(null)} apply={(next,reserve)=>{
      const id=purchase.id??'assessment';
      const row=next.purchases.find(p=>p.id===id);
      if(!row)return;
      const purchaseId=purchase.id??crypto.randomUUID();
      const original=data.purchases.find(x=>x.id===purchaseId);
      const planned={...row,...original,id:purchaseId,name:purchase.name,date:purchase.date,amount:purchase.amount,
        minimum:Math.min(purchase.amount,original?.minimum??0),maximum:Math.max(purchase.amount,original?.maximum??0)};
      const updates=data.events.map(event=>event.id==='purchase@'+purchaseId?{...event,date:planned.date,amount:planned.amount,name:planned.name}:event);
      const updated={...next,events:updates,purchases:[...next.purchases.filter(p=>p.id!==id),planned]};
      const existingEvent=updates.find(e=>e.id==='purchase@'+purchaseId);
      const plans=existingEvent?trimPaymentReserves(updated,existingEvent):[...updated.plans];
      if(reserve>0){
        const target='purchase@'+purchaseId;
        plans.push({id:crypto.randomUUID(),date:day,status:'accepted',items:[{
          id:crypto.randomUUID(),target,name:planned.name,group:'purchases',reason:'Перераспределение на покупку',amount:reserve,
        }]});
      }
      void persist({...updated,plans},'Покупка и бюджет обновлены').then(ok=>{if(ok)setPurchase(null);});
    }}/>}
    {showKaspi&&<KaspiSchedule date={day} busy={busy} close={()=>setShowKaspi(false)}
      initial={{name:kaspiEditor?.name??'Рассрочки Kaspi',mode:kaspiEditor?kaspiMode(kaspiEditor)??'aggregate':'aggregate',
        text:kaspiEditor?schedule(effectiveDebt(kaspiEditor,data)).filter(row=>row.date>=day).map(row=>row.date+' '+row.amount/100).join('\n'):''}}
      save={draft=>{
        try{
          const next=saveKaspiSchedule(data,{...draft,id:kaspiEditor?.id??crypto.randomUUID(),date:day});
          void persist(next,'График рассрочек сохранён').then(ok=>{if(ok)setShowKaspi(false);});
        }catch(error){N(error instanceof Error?error.message:'Проверьте график.');}
      }}/>}
    {modal&&<FormModal key={modal.title+String(modal.initial.template??modal.initial.category??'')} {...modal} busy={busy} close={()=>M(null)}>{modal.actions&&<div className="quick">{modal.actions}</div>}</FormModal>}
    {draft&&!modal&&<div className="overlay" onClick={()=>setDraft(null)}><section className="dialog" role="dialog" aria-modal="true" aria-label="Финансовый помощник" onClick={e=>e.stopPropagation()}>
      <div className="dialog-header"><div><div className="icon-soft"><Sparkles size={20}/></div><h2>Распределение средств</h2></div><Button variant="ghost" aria-label="Закрыть" onClick={()=>setDraft(null)}>×</Button></div>
      <Disclosure summary={<>Почему именно так?</>}><p>Фактический остаток {money(cash(data))} · уже зарезервировано {money(reserved(data))}.</p>
      <p>Обязательные платежи {money(wallet.obligations)} · покупки {money(wallet.planned)} · на жизнь {money(wallet.forLife)} · можно отложить {money(wallet.save)}.</p>
      <p>{wallet.income?'Следующий доход '+shortDate(wallet.end):'Расчёт на '+wallet.horizon+' дн.'}{wallet.shortage?' · дефицит обязательных платежей '+money(wallet.shortage):''}.</p></Disclosure>
      <p>{received>0?'Получено '+money(received)+' · ':''}Доступно {money(Math.max(0,cash(data)-reserved(data)))}</p>
      {contributionProgress.length>0&&<section className="budget-tip"><h3>Пополнения · {dayLabel(allocationPeriod)}</h3>
        {contributionProgress.map(row=><div className="list-row" key={row.id}><span><b>{row.name}</b>
          <small>План {money(row.target)} · переведено {money(row.transferred)}{row.held>0?' · уже отложено '+money(row.held):''}</small>
          {row.left>0&&<small>Останется пополнить {money(row.left)}</small>}</span><span><strong>{money(row.proposed)}</strong><small>Отложить сейчас</small></span></div>)}
      </section>}
      {draft.length===0&&<Blank>Свободных средств для распределения пока нет.</Blank>}
      {received>0&&!editingDraft&&<div>{Object.entries(groupNames).map(([group,label])=>{
        const amount=sum(draft.filter(i=>i.group===group).map(i=>i.amount));
        return amount>0&&<div className="subline" key={group}><b>{label}</b><strong>{money(amount)}</strong></div>;
      })}</div>}
      <Disclosure open={editingDraft||received<=0} summary={<>Позиции плана</>}>{draft.filter(i=>i.group!=='free'||!editingDraft).map(i=><div className="list-row" key={i.id}><span><b>{i.name}</b><small>{i.reason}</small></span>
        {editingDraft?<label className="amount-edit"><span>₸</span><input aria-label={i.name} type="number" min="0" step=".01" value={i.amount/100} onChange={e=>{
          const n=Math.round(Number(e.target.value)*100);
          const changed=draft.filter(j=>j.group!=='free').map(j=>j.id===i.id?{...j,amount:Math.max(0,n)}:j);
          const rest=Math.max(0,cash(data)-reserved(data)-sum(changed.map(j=>j.amount)));
          setDraft([...changed,{id:'free',group:'free',target:'',amount:rest,name:'Ликвидный остаток',reason:'Свободные средства'}]);
        }}/></label>:<strong>{money(i.amount)}</strong>}
      </div>)}
      </Disclosure>
      {editingDraft&&<p>Ликвидный остаток · {money(draft.find(i=>i.group==='free')?.amount??0)}</p>}
      {goal&&currentForecast&&draftForecast&&<Disclosure className="budget-tip" summary={<>Как изменится прогноз</>}><p>Дефицит к сроку {money(draftForecast.deadline?.deficit??0)} · ОП {draftForecast.deadline?.op.toFixed(2)??'—'}</p><p>Дата покупки в текущем плане: {currentForecast.reached?dayLabel(currentForecast.reached):'за горизонтом прогноза'}. С выбранным планом: {draftForecast.reached?dayLabel(draftForecast.reached):'за горизонтом прогноза'}.</p></Disclosure>}
      <div className="actions wrap"><Button variant="ghost" onClick={()=>setDraft(null)}>Отложить</Button><Button variant="outline" onClick={()=>openPlan(data,received,allocationPeriod)}>Пересчитать</Button><Button variant="outline" disabled={!draft.length} onClick={()=>setEditingDraft(!editingDraft)}>{editingDraft?'Готово':'Изменить распределение'}</Button><Button disabled={busy||!draft.some(i=>i.group!=='free'&&i.amount>0)} onClick={accept}>Принять план</Button></div>
    </section></div>}
    {authMode&&<div className="overlay" onClick={()=>A(null)}><section className="dialog small-dialog" role="dialog" aria-modal="true" aria-label="Вход" onClick={e=>e.stopPropagation()}>
      <div className="dialog-header"><h2>{authMode==='signUp'?'Создать аккаунт':authMode==='magic'?'Войти по ссылке':authMode==='reset'?'Восстановить доступ':authMode==='recover'?'Задать новый пароль':'Войти в Tenge'}</h2><Button variant="ghost" onClick={()=>A(null)} aria-label="Закрыть">×</Button></div>
      {!db&&<p>Для входа нужны настройки Supabase из README. Демонстрация доступна сразу.</p>}
      <form onSubmit={auth} className="auth-form">{authMode!=='recover'&&<label>Email<input name="email" type="email" required autoComplete="email"/></label>}
        {['login','signUp','recover'].includes(authMode)&&<label>Пароль<input name="password" type="password" required minLength={8} autoComplete={authMode==='login'?'current-password':'new-password'}/></label>}
        <Button disabled={busy}>{authMode==='login'?'Войти':authMode==='signUp'?'Зарегистрироваться':authMode==='recover'?'Сохранить пароль':'Отправить ссылку'}</Button>
      </form>
      <div className="quick">{([['login','Войти'],['signUp','Регистрация'],['magic','Вход по ссылке'],['reset','Забыли пароль?']] as const).filter(([id])=>id!==authMode).map(([id,label])=><Button key={id} variant="ghost" onClick={()=>A(id)}>{label}</Button>)}</div>
    </section></div>}
    <button className="help-chip" aria-label="Помощь" onClick={()=>N('Начните с финансовой цели, счетов и дат в календаре.')}><CircleHelp size={19}/></button>
  </div>;
}
