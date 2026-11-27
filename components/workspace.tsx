'use client';
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {createClient,type Session} from '@supabase/supabase-js';
import {ArrowDownLeft,ArrowLeftRight,ArrowUpRight,Bell,CalendarDays,ChartNoAxesCombined,ChevronDown,ChevronLeft,ChevronRight,CircleHelp,Coins,History,House,LayoutGrid,LogOut,Menu,Moon,Plus,Settings,ShieldCheck,ShoppingBag,Sparkles,Sun,Target,Wallet} from 'lucide-react';
import demo from '../lib/demo.json';
import {addDays,allocation,balance,bonus,budgetCuts,calendar,cash,dailyBudget,categoryBudget,categorySpent,days,debtComparison,depositYield,downPayment,dueDate,effectiveDebt,empty,first,forecast,marketBasis,money,month,optimizeSavings,remainingEvent,reserved,ruleAmount,usedReserve,schedule,score,sum,today,validateEntry,type Account,type Data,type Entry,type Event,type Item,type Plan,type Rule} from '../lib/finance';
import {closePaidExpense,monthlyReport,nextDebt,paymentState,reminders,trimPaymentReserves,withPaymentReserves} from '../lib/cashflow';
import {FlowCalendar,MoneyToday,MonthReport,Notifications,PurchaseCheck} from './cashflow';
import {dataSchema} from '../lib/schema';
import {Dashboard,ForecastChart,dayLabel,kinds,shortDate} from './dashboard';
import {Blank,FormModal,field as f,select as s,type Field,type Value} from './forms';
import {accountNames,editor,eventNames,groupNames,titles,type Entity} from './editors';
import {Button} from './ui/button';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
const nav=[
  ['dashboard','Главная',House],['budget','Бюджет',LayoutGrid],['calendar','Календарь',CalendarDays],
  ['accounts','Накопления',Wallet],['debts','Кредиты',Coins],['goals','Цели',Target],
  ['analytics','Аналитика',ChartNoAxesCombined],['history','История операций',History],
  ['purchases','Планы и покупки',ShoppingBag],['settings','Настройки',Settings]
] as const;
const kindNames={income:'Поступление',expense:'Расход',transfer:'Перевод',sale:'Продажа актива',valuation:'Корректировка баланса'};
const types=Object.entries(kindNames) as [Entry['kind'],string][];
type Household={id:string;owner:string;label:string;shared:boolean};
type Member={email:string;can_edit:boolean};
type Modal={title:string;fields:Field[];initial:Record<string,Value>;submit:(value:Record<string,Value>)=>void;actions?:React.ReactNode};
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
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//MyCapital//Finance//RU','CALSCALE:GREGORIAN'];
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
  download('mycapital.ics',folded.join('\r\n')+'\r\n','text/calendar;charset=utf-8');
}
export function Workspace(){
  const [inbox,setInbox]=useState(false);
  const [showReport,setShowReport]=useState(false);
  const [purchase,setPurchase]=useState<{id?:string;amount:number;date:string;name:string}|null>(null);
  const [clock,setClock]=useState('00:00');
  const writing=useRef(false);
  const [data,D]=useState<Data>(()=>dataSchema.parse(demo));
  const [section,S]=useState('dashboard');
  const [day,setDay]=useState('2026-11-27');
  const [pointer,setPointer]=useState('2026-11-01');
  const [mode,setMode]=useState<'month'|'list'>('month');
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
  const [members,setMembers]=useState<Member[]>([]);
  const [revision,R]=useState(0);
  const [scenario,setScenario]=useState('');
  const [optimized,setOptimized]=useState(false);
  const [accountHistory,setAccountHistory]=useState('');
  const [metric,setMetric]=useState<keyof Omit<ReturnType<typeof forecast>['rows'][number],'date'>>('savings');
  const [received,setReceived]=useState(0);
  const demoMode=!workspace;
  const [settled,setSettled]=useState(false);
  useEffect(()=>{
    const date=today();
    const frame=requestAnimationFrame(()=>{setDay(date);setPointer(first(date));setTheme(localStorage.getItem('theme')==='dark');});
    if('serviceWorker' in navigator&&process.env.NODE_ENV==='production')void navigator.serviceWorker.register('/sw.js').catch(()=>{});
    const auth=db?.auth.onAuthStateChange((event,value)=>{
      setSession(value);
      if(event==='PASSWORD_RECOVERY')A('recover');
      if(event==='INITIAL_SESSION')setSettled(true);
      if(event==='SIGNED_OUT'){
        W(null);H([]);setMembers([]);D(dataSchema.parse(demo));R(0);S('dashboard');M(null);setDraft(null);setReceived(0);
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
    async function load(){
      let result=await client.from('households').select('id,owner,label,shared');
      if(result.error){N('Не удалось открыть рабочее пространство. Проверьте миграцию Supabase.');return;}
      if(!result.data.some(h=>h.owner===owner&&!h.shared)){
        await client.from('households').insert({owner});
        result=await client.from('households').select('id,owner,label,shared');
      }
      if(canceled)return;
      H(result.data??[]);
      const personal=result.data?.find(h=>h.owner===owner&&!h.shared);
      if(personal){
        const saved=await client.rpc('workspace',{target:personal.id});
        if(canceled)return;
        if(saved.error){N('Не удалось прочитать данные.');return;}
        const parsed=dataSchema.safeParse(saved.data?.data);
        if(saved.data?.revision>0&&!parsed.success){N('Формат сохранённых данных отличается от текущего.');return;}
        D(parsed.success?parsed.data:empty());W(personal);R(saved.data?.revision??0);M(null);setDraft(null);setReceived(0);
        const list=await client.from('household_members').select('email,can_edit').eq('household',personal.id);
        if(!canceled)setMembers(list.data??[]);
      }
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
    if(!db)return;
    B(true);
    try{
      const result=await db.rpc('workspace',{target:h.id});
      if(result.error||!result.data)throw Error('Рабочее пространство недоступно.');
      D(result.data.revision>0?dataSchema.parse(result.data.data):empty());
      W(h);R(result.data.revision);setReceived(0);M(null);setDraft(null);
      const list=await db.from('household_members').select('email,can_edit').eq('household',h.id);
      setMembers(list.data??[]);
    }catch(e){N(e instanceof Error?e.message:'Не удалось загрузить данные.');}
    finally{B(false);}
  }
  async function persist(next:Data,message='Изменения сохранены'){
    if(busy||writing.current)return false;
    const parsed=dataSchema.safeParse(next);
    if(!parsed.success){N(parsed.error.issues[0]?.message??'Проверьте данные.');return false;}
    if(next.accounts.some(a=>balance(a,next.transactions)<0)||cash(next)<reserved(next)){N('Проверьте остатки счетов и резервов.');return false;}
    if(workspace){
      writing.current=true;B(true);
      try{
        const result=await fetch('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session?.access_token},
          body:JSON.stringify({id:workspace.id,revision,data:parsed.data})});
        const json=await result.json();
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
    M({title:rule?'Правило обязательного платежа':'Новый обязательный платёж',fields,initial,
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
  function quickExpense(){
    const account=data.accounts.find(a=>a.kind==='cash');
    if(!account){N('Добавьте счёт свободных денег.');return;}
    const templates=['Продукты','Бензин','Кафе','Свидание','Одежда','Подписка','Непредвиденное'];
    const open=(template='')=>{
      const detected=data.categories.find(c=>c.name.toLowerCase().includes(template.toLowerCase().slice(0,-1)));
      M({title:'Быстрый расход',fields:[f('amount','Сумма, ₸','money'),s('category','Категория',data.categories.map(c=>[c.id,c.name]),true),f('comment','Комментарий','text',true)],
        initial:{amount:0,category:template?detected?.id??'':'',comment:'',template},
        actions:<div className="quick">{templates.map(t=><Button key={t} variant="outline" onClick={()=>open(t)}>{t}</Button>)}<Button variant="ghost" onClick={()=>operation('expense')}>Все поля</Button></div>,
        submit:v=>{
          const category=String(v.category);
          const entry:Entry={id:crypto.randomUUID(),kind:'expense',date:day,amount:Number(v.amount),from:account.id,to:'',category,
            name:template||data.categories.find(c=>c.id===category)?.name||'Повседневный расход',comment:String(v.comment),event:'',reservation:'',sold:0};
          commitEntry(category?withPaymentReserves(data,entry,category):entry);
        }});
    };
    open();
  }
  function assessPurchase(id?:string){
    const existing=data.purchases.find(p=>p.id===id);
    M({title:'Могу ли я себе это позволить?',initial:{amount:existing?.amount??0,date:existing?.date??day,name:existing?.name??'Незапланированная покупка'},
      fields:[f('name','Покупка'),f('amount','Стоимость, ₸','money'),f('date','Плановая дата','date')],submit:v=>{
        if(Number(v.amount)<=0||String(v.date)<day){N('Укажите стоимость и сегодняшнюю или будущую дату.');return;}
        M(null);setPurchase({id,amount:Number(v.amount),date:String(v.date),name:String(v.name)});
      }});
  }
  function closeMonth(period:string){
    const report=monthlyReport(data,period);
    const accounts=data.accounts.filter(a=>a.kind!=='market');
    const fields=[f('score','Фактический ОП','number',true),f('interest','Получено процентов за месяц, ₸','money',true),
      f('carry','Перенести неизрасходованный бюджет в следующий месяц','boolean'),f('scoresKnown','Записать указанные ОП и проценты','boolean'),
      ...accounts.map(a=>f('account:'+a.id,a.name+' · баланс на сегодня, ₸','money'))];
    M({title:'Сверка и закрытие месяца',fields,initial:{carry:false,scoresKnown:false,score:0,interest:0,
      ...Object.fromEntries(accounts.map(a=>['account:'+a.id,balance(a,data.transactions)]))},
      actions:<p>Сверка записывает корректировки на сегодня. Перенос меняет лимиты следующего месяца и не увеличивает остатки счетов.</p>,
      submit:v=>{
        if(data.settings.closings?.[period])return;
        const corrections=accounts.flatMap(a=>{
          const delta=Number(v['account:'+a.id])-balance(a,data.transactions);
          if(!delta)return [];
          const tx:Entry={id:crypto.randomUUID(),name:'Сверка месяца · '+a.name,kind:'valuation',date:day,amount:Math.abs(delta),
            from:delta<0?a.id:'',to:delta>0?a.id:'',category:'',event:'',reservation:'',sold:0};
          return [tx];
        });
        const nextMonth=month(period,1);
        const budget={...data.settings.monthly?.[nextMonth]};
        for(const c of data.categories)budget[c.id]=categoryBudget(data,c,nextMonth)+(v.carry?report.surplus.find(x=>x.id===c.id)?.amount??0:0);
        const closings={...data.settings.closings,[period]:{date:day,...(v.scoresKnown?{score:Number(v.score),interest:Number(v.interest)}:{})}};
        void persist({...data,transactions:[...data.transactions,...corrections],settings:{...data.settings,closings,monthly:{...data.settings.monthly,[nextMonth]:budget}}},'Месяц закрыт').then(ok=>{if(ok)M(null);});
      }});
    setShowReport(false);
  }
  function valuation(account:Account){
    const current=balance(account,data.transactions);
    M({title:account.kind==='market'?'Обновить рыночную стоимость':'Сверить текущий баланс',fields:[f('value','Новый баланс, ₸','money'),f('date','Дата сверки','date')],initial:{value:current,date:day},submit:v=>{
      const delta=Number(v.value)-current;
      if(!delta){M(null);return;}
      commitEntry({id:crypto.randomUUID(),kind:'valuation',date:String(v.date),name:'Сверка · '+account.name,amount:Math.abs(delta),from:delta<0?account.id:'',to:delta>0?account.id:'',category:'',event:'',reservation:'',sold:0});
    }});
  }
  function openPlan(next=data,amount=received){setEditingDraft(false);setReceived(amount);setDraft(allocation(next,day,next.scenarios.find(s=>s.id===scenario)));}
  function commitEntry(entry:Entry,event?:Event){
    if(!/\d{4}-\d{2}-\d{2}/.test(entry.date)||!entry.name){N('Заполните название и дату.');return;}
    const error=validateEntry(data,entry);
    if(error){N(error);return;}
    let next={...data,transactions:setRow(data.transactions,entry)};
    if(event){
      const entries=next.transactions.filter(e=>e.event===event.id);
      const actual=sum(entries.map(e=>e.amount));
      const updated={...event,status:(actual>=event.amount||entries.some(e=>e.finalPayment)?'received':actual>0?'partial':'planned') as Event['status']};
      next={...next,events:setRow(data.events,updated),plans:trimPaymentReserves(next,updated)};
    }
    void persist(next,'Операция сохранена').then(ok=>{
      if(ok){M(null);if(entry.kind==='income')openPlan(next,entry.amount);}
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
    const newEntry:Entry={id:currentId,kind,name:matchingEvent?.name??item?.name??'',date:day,amount:item?.amount??(matchingEvent?remainingEvent(matchingEvent,data.transactions):0),from:kind==='income'?'':kind==='sale'?list[0]?.id??'':matchingEvent?.payment?.account||primary,
      to:kind==='income'||kind==='sale'?primary:kind==='transfer'?(item?.target??available.find(a=>a.id!==primary)?.id??''):'',
      category:item?.group==='living'||item?.group==='debt'?item.target:matchingEvent?.payment?.category??'',event:matchingEvent?.id??'',reservation:item?.id??'',sold:0,...preset};
    const fields=[f('name','Название'),f('date','Фактическая дата','date'),f('amount',kind==='sale'?'Выручка после издержек, ₸':'Фактическая сумма, ₸','money')];
    if(kind==='expense')fields.push(f('comment','Комментарий','text',true));
    if(kind!=='income')fields.push(s('from','Списать со счёта',list.map(a=>[a.id,a.name])));
    if(kind!=='expense')fields.push(s('to','Зачислить на счёт',available.filter(a=>kind!=='sale'||a.kind==='cash').map(a=>[a.id,a.name])));
    if(kind==='expense'&&(preset?.category||existing?.reducePayment!==undefined)&&data.debts.some(d=>d.id===(preset?.category??existing?.category)))fields.push(f('reducePayment','Уменьшить платёж (иначе сократить срок)','boolean'));
    if(kind==='sale')fields.push(f('sold','Рыночная стоимость продаваемой части, ₸','money'));
    if(kind==='expense'&&!item&&!matchingEvent&&!preset?.category)fields.push(s('category','Категория бюджета',data.categories.map(c=>[c.id,c.name]),true));
    if(!matchingEvent&&(kind==='income'||kind==='expense')&&!preset?.category)fields.push(s('event','Сопоставить с календарём',openEvents.map(e=>[e.id,e.name+' · '+shortDate(e.date)]),true));
    if((kind==='income'||kind==='expense')&&(matchingEvent||openEvents.length)&&!preset?.category)fields.push(f('finalPayment','Остаток по этому событию не ожидается','boolean'));
    if(!item&&!matchingEvent&&kind!=='income'&&!existing)fields.push(s('reservation','Использовать резерв',planRows(data).map(i=>[i.id,i.name+' · '+money(i.left)]),true));
    M({title:existing?'Исправить операцию':kindNames[kind],fields,initial:scalarFields(existing??newEntry),submit:v=>{
      const e={...(existing??newEntry),...v} as Entry;
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
      if(data.debts.some(d=>d.id===e.category)){
        const debt=data.debts.find(d=>d.id===e.category)!;
        if(e.amount>effectiveDebt(debt,{...data,transactions:data.transactions.filter(t=>t.id!==e.id)}).balance){N('Сумма больше остатка долга.');return;}
      }
      const useAutomatic=kind==='expense'&&!existing&&!item&&!e.reservation;
      commitEntry(useAutomatic&&(linked||e.category)?withPaymentReserves(data,e,linked?.id??e.category):e,linked);
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
    M({title:event.name,...form,actions:<>
      {status&&<p>{status.label} · рекомендованная дата {shortDate(status.recommended)} · оплачено {money(status.actual)} · в резерве {money(status.held)} · осталось оплатить {money(status.remaining)} · осталось зарезервировать {money(status.missing)}.</p>}
      {status&&!!event.payment?.discount&&<p>Возможная досрочная скидка {event.payment.discount}%. Сверьте итоговую сумму перед оплатой.</p>}
      {active&&event.kind==='expense'&&<Button variant="outline" onClick={()=>operation('expense',event)}>Оплатил</Button>}
      {status&&status.actual>0&&status.remaining>0&&<>
        <p>Если {money(status.actual)} — полная сумма по счёту, закрой платёж без доплаты. Свободная часть резерва вернётся в бюджет.</p>
        <Button variant="outline" disabled={busy} onClick={()=>{
          void persist(closePaidExpense(data,event,day),'Платёж закрыт').then(ok=>{if(ok)M(null);});
        }}>Закрыть без доплаты</Button>
      </>}
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
    const allocated=draft.filter(i=>i.amount>0&&i.group!=='free').map(i=>({...i,id:crypto.randomUUID()}));
    if(sum(draft.map(i=>i.amount))!==Math.max(0,cash(data)-reserved(data))){N('Распределение должно совпадать со свободным остатком.');return;}
    if(draft.some(i=>['otbasy','bcc','reserve','debt'].includes(i.group)&&i.amount>0)&&
      sum(draft.filter(i=>['otbasy','bcc','reserve','debt'].includes(i.group)).map(i=>i.amount))>dailyBudget(data,day).save){N('Для накоплений сейчас доступно меньше: сначала защитите платежи, покупки и минимум на жизнь.');return;}
    if(!allocated.length){N('Выберите сумму для резервирования.');return;}
    const baseline=allocation(data,day,data.scenarios.find(s=>s.id===scenario));
    if(baseline.some(i=>i.group==='living'&&i.amount>(draft.find(j=>j.id===i.id)?.amount??0))
      &&!window.confirm('Вы уменьшили резерв на комфортный минимум. Подтвердить исключение для этого распределения?'))return;
    void persist({...data,plans:[...data.plans,{id:crypto.randomUUID(),date:day,items:allocated,status:'accepted'}]},'Распределение принято').then(ok=>{if(ok){setDraft(null);go('budget');}});
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
    }catch{N('Файл не соответствует формату MyCapital.');}
  }
  function csv(){
    const line=(items:(string|number)[])=>items.map(x=>'"'+String(x).replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"').join(';');
    download('mycapital.csv','\ufeff'+[line(['Дата','Операция','Тип','Сумма, ₸','Списано','Зачислено']),...data.transactions.map(t=>line([t.date,t.name,kindNames[t.kind],(t.amount/100).toFixed(2),data.accounts.find(a=>a.id===t.from)?.name??'',data.accounts.find(a=>a.id===t.to)?.name??'']))].join('\r\n'),'text/csv;charset=utf-8');
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

  const goal=data.goals.find(g=>!g.completed);
  const activeScenario=data.scenarios.find(x=>x.id===scenario)??data.scenarios[0];
  const recommendation=useMemo(()=>optimized&&goal?optimizeSavings(data,goal,day,activeScenario):null,[optimized,data,goal,day,activeScenario]);
  const currentForecast=useMemo(()=>goal?forecast(data,goal,day,activeScenario):null,[data,goal,day,activeScenario]);
  const draftForecast=useMemo(()=>{
    if(!draft||!goal||!draft.length)return null;
    const plan:Plan={id:'preview',date:day,status:'accepted',items:draft.filter(i=>i.group!=='free')};
    return forecast({...data,plans:[...data.plans,plan]},goal,day,activeScenario);
  },[draft,goal,data,day,activeScenario]);
  const currentEvents=useMemo(()=>calendar(data,pointer,month(pointer,1)).filter(e=>e.date<month(pointer,1)),[data,pointer]);
  const reserves=planRows(data);
  const wallet=useMemo(()=>dailyBudget(data,day),[data,day]);
  const alerts=useMemo(()=>reminders(data,day,clock),[data,day,clock]);
  const rankedDebt=useMemo(()=>nextDebt(data),[data]);
  const debtRate=Math.max(0,...data.accounts.filter(a=>a.kind==='bcc').map(a=>a.rate));
  const current=nav.find(n=>n[0]===section);
  const toggleTheme=()=>{localStorage.setItem('theme',theme?'light':'dark');setTheme(!theme);};
  const heading=(title:string,description:string,action?:React.ReactNode)=><div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
  const add=(entity:Entity,label:string)=><Button onClick={()=>edit(entity)}><Plus size={18}/>{label}</Button>;
  const row=(name:string,detail:string,value:string,click:()=>void)=><button className="list-row" key={name+detail} onClick={click}><span><b>{name}</b><small>{detail}</small></span><strong>{value}</strong><ChevronRight size={16}/></button>;
  const editPriority=()=>{
    const initial=Object.fromEntries(Object.keys(groupNames).filter(g=>g!=='free').map(g=>[g,data.settings.priority.indexOf(g)+1]));
    M({title:'Приоритеты распределения',initial,fields:Object.entries(groupNames).filter(([g])=>g!=='free').map(([g,label])=>f(g,label,'number')),submit:v=>{
      const priority=Object.keys(initial).sort((a,b)=>Number(v[a])-Number(v[b])).concat('free');
      void persist({...data,settings:{...data.settings,priority}}).then(ok=>{if(ok)M(null);});
    }});
  };
  return <div className="shell">
    <aside className={'sidebar '+(mobile?'opened':'')}>
      <button className="brand" onClick={()=>go('dashboard')}><span className="brand-icon"><ChartNoAxesCombined size={20}/></span><span>MyCapital</span></button>
      <div className="nav-label">Рабочее пространство</div>
      <nav>{nav.map(([id,label,Icon])=><button key={id} className={section===id?'active':''} onClick={()=>go(id)} aria-current={section===id?'page':undefined}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="side-bottom"><button className="profile" onClick={()=>session?go('settings'):A('login')}><span className="avatar">{session?.user.email?.slice(0,2).toUpperCase()??'MC'}</span><span><b>{session?'Мой аккаунт':'Личный бюджет'}</b><small>{session?.user.email??'Демонстрационный режим'}</small></span><ChevronDown size={15}/></button></div>
    </aside>
    {mobile&&<button className="backdrop" aria-label="Закрыть меню" onClick={()=>setMobile(false)}/>}
    <div className="workspace">
      <header className="topbar"><div><Button variant="ghost" className="mobile-menu" onClick={()=>setMobile(true)} aria-label="Меню"><Menu size={22}/></Button><b>{current?.[1]}</b></div><div>
        <Button variant="ghost" aria-label="Уведомления" onClick={()=>setInbox(true)}><Bell size={19}/>{alerts.length>0&&<span className="alert-count">{alerts.length}</span>}</Button>
        <span className="currency"><span/> KZT</span>
        <Button variant="ghost" onClick={toggleTheme} aria-label={theme?'Светлая тема':'Тёмная тема'}>{theme?<Sun size={19}/>:<Moon size={19}/>}</Button>
        {(!db||settled)&&(!session?<Button variant="outline" onClick={()=>A('login')}>Войти</Button>:<Button variant="ghost" onClick={()=>void db?.auth.signOut()} aria-label="Выйти"><LogOut size={19}/></Button>)}
      </div></header>
      <main>
        {section==='dashboard'&&session&&!workspace&&<section className="card"><p>Загружаем данные аккаунта.</p></section>}
        {section==='dashboard'&&(!session||workspace)&&<Dashboard data={data} date={day} go={go} operation={operation} plan={()=>openPlan()} moneyToday={<MoneyToday data={data} date={day} clock={clock} onEvent={eventEditor} plan={()=>openPlan()} buy={()=>assessPurchase()} expense={quickExpense} report={()=>setShowReport(true)}/>}/>}
        {section==='budget'&&<>
          {heading('Бюджет','Планируйте расходы на месяц и подтверждайте распределение поступлений.',<Button onClick={()=>openPlan()}><Sparkles size={18}/> Распределить {money(Math.max(0,cash(data)-reserved(data)))}</Button>)}
          <section className="card"><div className="section-head"><div><h2>Обязательные платежи</h2><p>Даты, суммы и напоминания</p></div><Button onClick={()=>editPayment()}><Plus size={18}/> Новый платёж</Button></div>
            {data.rules.filter(r=>r.kind==='expense').map(r=>row(r.name,r.active?r.date?shortDate(r.date):r.repeat==='custom'?'Пользовательский график':'Нужно указать дату':'Архив',money(ruleAmount(r)),()=>editPayment(r)))}
            <Button variant="outline" onClick={()=>setShowReport(true)}>Закрытие и отчёт за месяц</Button>
          </section>
          <div className="split">
            <section className="card"><div className="section-head"><div><h2>На жизнь</h2><p>{dayLabel(day)}</p></div>{add('categories','Категория')}</div>
              {!data.categories.length&&<Blank>Добавьте свои категории бюджета.</Blank>}
              {data.categories.map(c=>{
                const spent=categorySpent(data,c.id,day);
                const budget=categoryBudget(data,c,day);
                const left=budget-spent;
                const {changes:cuts}=budgetCuts(data,day,Math.max(0,-left),c.id);
                return <div className="budget-item" key={c.id}>
                  {row(c.name,'Минимум '+money(c.minimum)+' · резерв '+money(reserved(data,c.id)),money(budget),()=>edit('categories',c))}
                  <div className="progress"><div style={{width:Math.min(100,budget?100*spent/budget:0)+'%'}} className={left<0?'over':''}/></div>
                  <div className="subline"><span>Потрачено {money(spent)}</span><span className={left<0?'loss':''}>{left>=0?'Осталось ':'Перерасход '}{money(Math.abs(left))}</span></div>
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
            <section className="card"><div className="section-head"><div><h2>Резервы</h2><p>{money(reserved(data))} из свободных денег</p></div><ShieldCheck size={22}/></div>
              {!reserves.length&&<Blank>Здесь появятся позиции после принятия распределения.</Blank>}
              {reserves.map(i=>row(i.name,i.reason,money(i.left),()=>{
                const item={...i,amount:i.left};
                const event=['bills','purchases'].includes(i.group)?calendar(data,month(day,-12),month(day,36)).find(e=>e.id===i.target):undefined;
                if(event){operation('expense',event);return;}
                operation(['otbasy','bcc','reserve'].includes(i.group)?'transfer':'expense',undefined,item);
              }))}
              {data.plans.filter(p=>p.status==='accepted'&&reserves.some(i=>i.plan===p.id)).map(p=><Button key={p.id} variant="outline" disabled={busy} onClick={()=>release(p)}>Освободить резерв от {shortDate(p.date)}</Button>)}
            </section>
          </div>
        </>}
        {section==='calendar'&&<>
          {heading('Финансовый календарь','Отслеживайте поступления, платежи и важные даты.',add('events','Добавить событие'))}
          <FlowCalendar data={data} date={day} next={wallet.end} open={eventEditor}/>
          <section className="card"><div className="section-head calendar-controls"><div className="inline"><Button variant="outline" aria-label="Предыдущий месяц" onClick={()=>setPointer(month(pointer,-1))}><ChevronLeft size={18}/></Button><h2>{dayLabel(pointer)}</h2><Button variant="outline" aria-label="Следующий месяц" onClick={()=>setPointer(month(pointer,1))}><ChevronRight size={18}/></Button></div><div className="inline"><Button variant={mode==='month'?'default':'outline'} onClick={()=>setMode('month')}>Месяц</Button><Button variant={mode==='list'?'default':'outline'} onClick={()=>setMode('list')}>Список</Button><Button variant="outline" onClick={()=>exportCalendar(data,pointer)}>Экспорт ICS</Button></div></div>
          {mode==='month'?<div className="month-grid">
            {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=><div className="weekday" key={x}>{x}</div>)}
            {Array.from({length:(new Date(pointer+'T00:00:00Z').getUTCDay()+6)%7},(_,i)=><div className="calendar-empty" key={'empty'+i}/>)}
            {Array.from({length:days(pointer,month(pointer,1))},(_,i)=>{
              const date=pointer.slice(0,8)+String(i+1).padStart(2,'0');
              return <div className={'calendar-cell '+(date===day?'current-date':'')} key={date}><span>{i+1}</span>{currentEvents.filter(e=>e.date===date).map(e=><button key={e.id} title={e.name} className={'event-chip '+e.kind+' '+e.status} onClick={()=>eventEditor(e)}>{e.name}</button>)}</div>;
            })}
          </div>:currentEvents.length?currentEvents.map(e=>row(e.name,shortDate(e.date)+' · '+eventNames[e.status],e.amount?money(e.amount):'—',()=>eventEditor(e))):<Blank>В этом месяце нет событий.</Blank>}
          </section>
          <section className="card"><div className="section-head"><div><h2>Регулярные события</h2><p>Укажите даты для платежей и поступлений без расписания.</p></div>{add('rules','Правило')}</div>
            {data.rules.map(r=>row(r.name,r.date?shortDate(r.date):'Нужно указать дату',money(ruleAmount(r)),()=>r.kind==='expense'?editPayment(r):edit('rules',scalarFields(r))))}
          </section>
        </>}
        {section==='accounts'&&<>
          {heading('Счета и накопления','Денежные счета, депозиты и рыночные активы.',add('accounts','Добавить счёт'))}
          <div className="quick"><Button variant="outline" onClick={()=>operation('transfer')}><ArrowLeftRight size={17}/> Перевод</Button><Button variant="outline" onClick={()=>operation('sale')}>Продажа актива</Button>{add('bonuses','Госпремия')}</div>
          <div className="account-grid">{data.accounts.map(a=>{
            const amount=balance(a,data.transactions), Icon=kinds[a.kind];
            const basis=marketBasis(a,data.transactions);
            const interest=a.interest||Math.round(a.score*a.contract/1000);
            const future=a.futureContract||a.contract;
            const horizon=goal?Math.max(0,days(day,goal.date)):0;
            const mrp=data.settings.mrp[day.slice(0,4)]??0;
            const cashYield=depositYield(amount,a.rate,91,true);
            return <section className="card account-card" key={a.id}><div className="section-head"><div className="icon-soft"><Icon size={20}/></div><span className="pill">{accountNames[a.kind]}</span></div>
              <h2>{a.name}</h2><strong className="large">{money(amount)}</strong>
              <p>{a.owner||'Владелец не указан'}</p>
              {a.kind==='market'&&<dl><dt>Сумма вложений</dt><dd>{a.basis?money(basis):'Укажите'}</dd><dt>Прибыль / убыток</dt><dd>{a.basis?money(amount-basis):'—'}</dd><dt>Оценка чистой продажи</dt><dd>{money(Math.round(amount*(1-a.fee/100)))}</dd></dl>}
              {a.kind==='bcc'&&<dl><dt>ГЭСВ</dt><dd>{a.rate}%</dd><dt>Номинальная ставка</dt><dd>{a.nominal?a.nominal+'%':'Укажите'}</dd><dt>Срок и продление</dt><dd>{a.termMonths?a.termMonths+' мес.':'Срок не указан'} · {a.rollover?'авто':'вручную'}</dd><dt>Окончание</dt><dd>{shortDate(a.maturity)}</dd><dt>Доход за 3 / 6 / 12 мес.</dt><dd>{[cashYield,depositYield(amount,a.rate,182,true),depositYield(amount,a.rate,365,true)].map(money).join(' / ')}</dd><dt>Потеря при раннем закрытии, оценка</dt><dd>{a.opened?money(Math.max(0,depositYield(amount,a.rate,days(a.opened,day),true)-depositYield(amount,a.earlyRate,days(a.opened,day)))):'Укажите дату открытия'}</dd></dl>}
              {a.kind==='otbasy'&&<dl><dt>Фактический / расчётный ОП</dt><dd>{a.score.toFixed(2)} / {score(interest,a.contract).toFixed(2)}</dd><dt>После изменения договора</dt><dd>{score(interest,future).toFixed(2)}</dd><dt>Прогноз ОП к цели</dt><dd>{score(interest+depositYield(amount,a.rate,horizon),future).toFixed(2)}</dd><dt>Вознаграждение до цели</dt><dd>{goal?money(Math.max(0,Math.round(goal.score*future/1000-interest))):'—'}</dd>{goal&&future>0&&<><dt>Вознаграждение до ОП {goal.laterScore}</dt><dd>{money(Math.max(0,Math.round(goal.laterScore*future/1000-interest)))}</dd>
                <dt>Дней до целевого ОП на текущем балансе</dt><dd>{amount&&a.rate?Math.ceil(Math.max(0,goal.score*future/1000-interest)*36500/(amount*a.rate)):'—'}</dd></>}
                <dt>Остаток годового лимита</dt><dd>{mrp?money(Math.max(0,mrp*200-Math.max(0,a.eligible-a.awarded))):'Укажите МРП'}</dd><dt>Ожидаемая госпремия</dt><dd>{mrp?money(bonus(a.eligible,mrp,a.awarded)):'—'}</dd></dl>}
              <div className="quick"><Button variant="outline" onClick={()=>edit('accounts',a)}>Изменить</Button><Button variant="ghost" onClick={()=>valuation(a)}>{a.kind==='market'?'Переоценка':'Сверить баланс'}</Button><Button variant="ghost" onClick={()=>{setAccountHistory(a.id);go('history');}}>Операции</Button></div>
            </section>;
          })}</div>
          {!data.accounts.length&&<Blank>Добавьте счёт или загрузите начальный профиль в настройках.</Blank>}
          {data.accounts.some(a=>a.kind==='otbasy')&&<section className="card"><h2>Семейный пакет Отбасы</h2><p>Расчётный ОП может отличаться от показателя банка. Сверяйте договорную сумму, вознаграждение и условия объединения.</p><p>Прогноз к дате цели · ОП <b>{currentForecast?.deadline?.op.toFixed(2)??'—'}</b></p>
            {data.bonuses.map(b=>{
              const name=data.accounts.find(a=>a.id===b.account)?.name??'Отбасы';
              const posted=data.events.find(e=>e.id==='credited@'+b.id);
              const estimate=bonus(b.eligible,data.settings.mrp[String(b.year)]??0,b.credited);
              return <div key={b.id}>{row(name,String(b.year)+' · '+shortDate(b.date)+(posted?.status==='received'?' · зачислена':' · ожидается'),money(b.actual||estimate),()=>edit('bonuses',b))}
                {b.actual>0&&posted?.status!=='received'&&<div className="quick"><Button variant="outline" onClick={()=>operation('income',posted??{id:'credited@'+b.id,name:'Госпремия · '+name,date:day,kind:'income',amount:b.actual,status:'planned',rule:'',comment:''},undefined,undefined,{to:b.account})}>Подтвердить госпремию</Button></div>}</div>;
            })}
          </section>}
        </>}
        {section==='debts'&&<>
          {heading('Кредиты и рассрочки','Остатки, графики и оценка досрочного погашения.',add('debts','Добавить долг'))}
          {rankedDebt.length>0&&<section className="card"><h2>Какую рассрочку закрыть следующей</h2>
            <p>{rankedDebt[0].comparison.net>0?'Лидер по расчётной выгоде: '+rankedDebt[0].loan.name:'По заданной ставке вклада досрочное закрытие не даёт положительной расчётной выгоды.'}</p>
            {rankedDebt.map(({loan,comparison})=>row(loan.name,'Экономия '+money(comparison.saved)+' · проценты вклада '+money(comparison.lost)+' · платёж '+money(loan.payment),money(comparison.net),()=>operation('expense',undefined,undefined,undefined,{name:'Досрочно · '+loan.name,amount:loan.balance,category:loan.id})))}
          </section>}
          {!data.debts.length&&<Blank>У вас нет добавленных обязательств.</Blank>}
          {data.debts.map(original=>{
            const loan=effectiveDebt(original,data), payments=schedule(loan), check=debtComparison(loan,debtRate);
            return <section className="card" key={loan.id}><div className="section-head"><div><h2>{loan.name}</h2><p>{loan.confirmed?shortDate(loan.date):'Подтвердите исходные данные'}</p></div><strong className="large">{money(loan.balance)}</strong></div>
              <p>Платёж {money(loan.payment)} · ставка {loan.rate}% · ГЭСВ {loan.apr}%</p>
              {payments.length>0&&<p>При закрытии сейчас: экономия процентов {money(check.saved)}, оценка упущенного дохода {money(check.lost)}. Освободится {money(loan.payment)} в месяц.</p>}
              {!loan.balance&&<p>Долг закрыт. Запустите помощник, чтобы направить свободные деньги на накопления.</p>}
              <div className="quick"><Button variant="outline" onClick={()=>edit('debts',original)}>Настроить</Button>{loan.balance>0&&loan.confirmed&&<Button variant="outline" onClick={()=>operation('expense',undefined,undefined,undefined,{name:'Досрочно · '+loan.name,category:loan.id,amount:loan.balance})}>Погасить досрочно</Button>}</div>
              {payments.length>0&&<details><summary>График · {payments.length} платежей</summary><div className="schedule">{payments.map(p=><div className="schedule-row" key={p.date}><span>{shortDate(p.date)} {p.date.slice(0,4)}</span><b>{money(p.amount)}</b><span>Проценты {money(p.interest)}</span><span>Остаток {money(p.remaining)}</span></div>)}</div></details>}
            </section>;
          })}
        </>}
        {section==='goals'&&<>
          {heading('Финансовые цели','Настройте размер взноса, подушку и желаемый срок покупки.',add('goals','Новая цель'))}
          {!data.goals.length&&<Blank>Создайте цель, чтобы увидеть прогноз накоплений.</Blank>}
          {data.goals.map(g=><section key={g.id} className="card"><div className="section-head"><div><h2>{g.name}</h2><p>{g.completed?'Завершена':shortDate(g.date)+' '+g.date.slice(0,4)+' · допустимо до '+shortDate(g.latest)}</p></div><Button variant="outline" onClick={()=>edit('goals',g)}>Изменить</Button></div>
            <dl><dt>Стоимость объекта</dt><dd>{money(g.price)}</dd><dt>Взнос · {g.down}%</dt><dd>{money(downPayment(g))}</dd><dt>Подушка</dt><dd>{money(g.reserve)}</dd><dt>Целевой ОП</dt><dd>{g.score} · далее {g.laterScore}</dd><dt>Предполагаемая аренда</dt><dd>{money(g.rentMin)} — {money(g.rentMax)}</dd></dl>
          </section>)}
        </>}
        {section==='analytics'&&<>
          {heading('Прогноз и аналитика','Сравните денежные потоки и сроки покупки по сценариям.',add('scenarios','Новый сценарий'))}
          {goal&&currentForecast?<><section className="card"><div className="section-head"><div><h2>{activeScenario?.name??'Прогноз'}</h2><p>{currentForecast.reached?'Дата по прогнозу · '+dayLabel(currentForecast.reached):'Цель не достигается за 36 месяцев'}</p></div><div className="inline"><select aria-label="Сценарий" value={activeScenario?.id??''} onChange={e=>setScenario(e.target.value)}>{data.scenarios.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select>
            <select aria-label="Показатель" value={metric} onChange={e=>setMetric(e.target.value as typeof metric)}>{Object.entries({savings:'Накопления',income:'Доходы',expenses:'Расходы',capital:'Капитал',op:'ОП',otbasy:'Отбасы',bcc:'БЦК',debt:'Долг',bonus:'Госпремия',interest:'Процентный доход',deficit:'Дефицит'}).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>
            </div><ForecastChart rows={currentForecast.rows} metric={metric}/><p>Дефицит к сроку {money(currentForecast.deadline?.deficit??0)} · прогноз ОП {currentForecast.deadline?.op.toFixed(2)} из {goal.score}. Прогноз помесячный.</p>
          </section>
          <section className="card"><h2>План и факт</h2>{[first(day),month(first(day),-1)].map(period=>{
            const next=month(period,1), events=calendar(data,period,next).filter(e=>e.date<next&&e.status!=='canceled');
            const tx=data.transactions.filter(t=>t.date>=period&&t.date<next);
            const plannedIncome=sum(events.filter(e=>e.kind==='income').map(e=>e.amount));
            const plannedExpense=sum(events.filter(e=>e.kind==='expense').map(e=>e.amount))+sum(data.categories.map(c=>categoryBudget(data,c,period)));
            return <p key={period}><b>{dayLabel(period)}</b> · доходы {money(sum(tx.filter(t=>t.kind==='income').map(t=>t.amount)))} / {money(plannedIncome)} · расходы {money(sum(tx.filter(t=>t.kind==='expense').map(t=>t.amount)))} / {money(plannedExpense)}</p>;
          })}</section></>:<Blank>Задайте активную цель, чтобы построить прогноз.</Blank>}
          <section className="card"><div className="section-head"><h2>Сравнение сценариев</h2>{goal&&<Button variant="outline" onClick={()=>setOptimized(!optimized)}>{optimized?'Скрыть подбор':'Подобрать распределение'}</Button>}</div>
            {recommendation&&<div className="budget-tip"><b>{recommendation.coverage?'Найден сценарий с нужным взносом, подушкой и запасом по ОП':'Использованные сценарии не закрывают все условия к желаемой дате'}</b><p>Доля для раннего пополнения Отбасы · {recommendation.share}% · ОП {recommendation.end?.op.toFixed(2)} · дефицит {money(recommendation.end?.deficit??0)}</p>
            <Button variant="outline" onClick={()=>edit('scenarios',{...recommendation.model,id:crypto.randomUUID(),name:'Подбор накоплений'})}>Сохранить как сценарий</Button></div>}
            {data.scenarios.map(x=>{
            const prediction=goal?forecast(data,goal,day,x):null;
            const end=prediction?.deadline;
            return row(x.name,end?'ОП '+end.op.toFixed(2)+' · подушка '+money(end.reserves)+' · проценты '+money(end.interest)+' · премия '+money(end.bonus):'Настройки сценария',prediction?.reached?dayLabel(prediction.reached):end?'Дефицит '+money(end.deficit):'—',()=>edit('scenarios',x));
          })}</section>
        </>}
        {section==='history'&&<>
          {heading('История операций','Фактические поступления, платежи, переводы и переоценка.',<Button onClick={()=>operation('income')}><Plus size={18}/> Получил деньги</Button>)}
          <div className="quick">{types.filter(([k])=>k==='expense'||k==='transfer'||k==='sale').map(([k,label])=><Button key={k} variant="outline" onClick={()=>operation(k)}>{label}</Button>)}</div>
          <section className="card"><div className="section-head"><h2>Операции</h2><select aria-label="Фильтр по счёту" value={accountHistory} onChange={e=>setAccountHistory(e.target.value)}>
            <option value="">Все счета</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          {!data.transactions.some(t=>!accountHistory||t.from===accountHistory||t.to===accountHistory)&&<Blank>Подтверждённых операций пока нет.</Blank>}{data.transactions.filter(t=>!accountHistory||t.from===accountHistory||t.to===accountHistory).sort((a,b)=>b.date.localeCompare(a.date)).map(t=><div key={t.id} className="transaction-row">
            <div className="icon-soft">{t.kind==='income'?<ArrowDownLeft size={18}/>:t.kind==='expense'?<ArrowUpRight size={18}/>:<ArrowLeftRight size={18}/>}</div>
            {row(t.name,shortDate(t.date)+' · '+kindNames[t.kind],money(t.amount),()=>{
              if(t.kind!=='valuation'){operation(t.kind,undefined,undefined,t);return;}
              M({title:'Исправить переоценку',fields:[f('name','Название'),f('date','Дата','date'),f('amount','Сумма изменения, ₸','money')],initial:scalarFields(t),submit:v=>commitEntry({...t,...v})});
            })}
          </div>)}</section>
        </>}
        {section==='purchases'&&<>
          {heading('Планы и покупки','Будущие покупки учитываются в прогнозе и бюджете до оплаты.',add('purchases','Новая покупка'))}
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
                actions:<p>Часовой пояс Asia/Almaty. Внутренние уведомления доступны в открытом MyCapital. Для внешних напоминаний импортируйте ICS в календарь.</p>,
                submit:v=>void persist({...data,settings:{...data.settings,timeZone:'Asia/Almaty',reminderTime:String(v.reminderTime),safetyDays:Number(v.safetyDays),conservative:Boolean(v.conservative)}}).then(ok=>{if(ok)M(null);})})}>Напоминания</Button><Button variant="outline" onClick={editPriority}>Приоритеты</Button><Button variant="outline" onClick={()=>M({title:'МРП по годам',fields:[f('year','Год','number'),f('mrp','МРП, ₸','money')],initial:{year:Number(day.slice(0,4)),mrp:data.settings.mrp[day.slice(0,4)]??0},submit:v=>void persist({...data,settings:{...data.settings,mrp:{...data.settings.mrp,[String(v.year)]:Number(v.mrp)}}}).then(ok=>{if(ok)M(null);})})}>Задать МРП</Button></div>
              {Object.entries(data.settings.mrp).map(([y,v])=><p key={y}>{y} · {money(v)}</p>)}
            </section>
          </div>
          <section className="card"><h2>Импорт и экспорт</h2><p>Выгрузите резервную копию или историю операций.</p><div className="quick">
            <Button variant="outline" onClick={()=>download('mycapital-backup.json',JSON.stringify(data,null,2),'application/json')}>Экспорт JSON</Button>
            <Button variant="outline" onClick={csv}>Экспорт CSV</Button>
            {workspace&&<label className="button outline file-button">Импорт JSON<input type="file" accept=".json,application/json" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>}
          </div>{workspace&&<><p>Даты обязательных платежей, дежурств и депозитов задаются в календаре и накоплениях. Проверьте остаток рассрочек в кредитах.</p><Button variant="outline" className="loss" onClick={()=>void deleteUser()}>Удалить аккаунт</Button></>}</section>
        </>}
      </main>
    </div>
    <nav className="bottom-nav" aria-label="Основное меню">{nav.slice(0,4).map(([id,label,Icon])=><button key={id} className={section===id?'active':''} onClick={()=>go(id)}><Icon size={21}/>{label}</button>)}<button onClick={()=>setMobile(true)}><Menu size={21}/>Ещё</button></nav>
    {notice&&<div className="toast" role="status"><span>{notice}</span><button aria-label="Скрыть уведомление" onClick={()=>N('')}>×</button></div>}
    {inbox&&!modal&&<Notifications data={data} date={day} clock={clock} close={()=>setInbox(false)} open={eventEditor} busy={busy} mark={(id,snooze)=>void persist({...data,settings:{...data.settings,notifications:{...data.settings.notifications,[id]:snooze?{until:addDays(day,1)}:{read:true}}}},snooze?'Напоминание отложено':'Уведомление прочитано')}/>}
    {showReport&&!modal&&<MonthReport data={data} day={day} close={()=>setShowReport(false)} closeMonth={closeMonth}/>}
    {purchase&&!modal&&<PurchaseCheck data={data} date={day} request={purchase} busy={busy} close={()=>setPurchase(null)} apply={next=>{
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
      void persist({...updated,plans:existingEvent?trimPaymentReserves(updated,existingEvent):updated.plans},'Покупка и бюджет обновлены').then(ok=>{if(ok)setPurchase(null);});
    }}/>}
    {modal&&<FormModal key={modal.title+String(modal.initial.template??modal.initial.category??'')} {...modal} busy={busy} close={()=>M(null)}>{modal.actions&&<div className="quick">{modal.actions}</div>}</FormModal>}
    {draft&&!modal&&<div className="overlay" onClick={()=>setDraft(null)}><section className="dialog" role="dialog" aria-modal="true" aria-label="Финансовый помощник" onClick={e=>e.stopPropagation()}>
      <div className="dialog-header"><div><div className="icon-soft"><Sparkles size={20}/></div><h2>Распределение средств</h2></div><Button variant="ghost" aria-label="Закрыть" onClick={()=>setDraft(null)}>×</Button></div>
      <p>Фактический остаток {money(cash(data))} · уже зарезервировано {money(reserved(data))}.</p>
      <p>Обязательные платежи {money(wallet.obligations)} · покупки {money(wallet.planned)} · на жизнь {money(wallet.forLife)} · можно отложить {money(wallet.save)}.</p>
      <p>{wallet.income?'Следующий доход '+shortDate(wallet.end):'Расчёт на '+wallet.horizon+' дн.'}{wallet.shortage?' · дефицит обязательных платежей '+money(wallet.shortage):''}.</p>
      <p>{received>0?'Получено '+money(received)+' · ':''}Доступно {money(Math.max(0,cash(data)-reserved(data)))}</p>
      {draft.length===0&&<Blank>Свободных средств для распределения пока нет.</Blank>}
      {draft.filter(i=>i.group!=='free'||!editingDraft).map((i)=><div className="list-row" key={i.id}><span><b>{i.name}</b><small>{i.reason}</small></span>
        {editingDraft?<label className="amount-edit"><span>₸</span><input aria-label={i.name} type="number" min="0" step=".01" value={i.amount/100} onChange={e=>{
          const n=Math.round(Number(e.target.value)*100);
          const changed=draft.filter(j=>j.group!=='free').map(j=>j.id===i.id?{...j,amount:Math.max(0,n)}:j);
          const rest=Math.max(0,cash(data)-reserved(data)-sum(changed.map(j=>j.amount)));
          setDraft([...changed,{id:'free',group:'free',target:'',amount:rest,name:'Ликвидный остаток',reason:'Свободные средства'}]);
        }}/></label>:<strong>{money(i.amount)}</strong>}
      </div>)}
      {editingDraft&&<p>Ликвидный остаток · {money(draft.find(i=>i.group==='free')?.amount??0)}</p>}
      {goal&&currentForecast&&draftForecast&&<div className="budget-tip"><b>Прогноз после подтверждения операций</b><p>Дефицит к сроку {money(draftForecast.deadline?.deficit??0)} · ОП {draftForecast.deadline?.op.toFixed(2)??'—'}</p><p>Дата покупки в текущем плане: {currentForecast.reached?dayLabel(currentForecast.reached):'за горизонтом прогноза'}. С выбранным планом: {draftForecast.reached?dayLabel(draftForecast.reached):'за горизонтом прогноза'}.</p></div>}
      <div className="actions wrap"><Button variant="ghost" onClick={()=>setDraft(null)}>Отложить</Button><Button variant="outline" onClick={()=>openPlan()}>Пересчитать</Button><Button variant="outline" disabled={!draft.length} onClick={()=>setEditingDraft(!editingDraft)}>{editingDraft?'Готово':'Изменить суммы'}</Button><Button disabled={busy||!draft.some(i=>i.group!=='free'&&i.amount>0)} onClick={accept}>Принять распределение</Button></div>
    </section></div>}
    {authMode&&<div className="overlay" onClick={()=>A(null)}><section className="dialog small-dialog" role="dialog" aria-modal="true" aria-label="Вход" onClick={e=>e.stopPropagation()}>
      <div className="dialog-header"><h2>{authMode==='signUp'?'Создать аккаунт':authMode==='magic'?'Войти по ссылке':authMode==='reset'?'Восстановить доступ':authMode==='recover'?'Задать новый пароль':'Войти в MyCapital'}</h2><Button variant="ghost" onClick={()=>A(null)} aria-label="Закрыть">×</Button></div>
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
