'use client';

import {useState,type FormEvent} from 'react';
import {month,money,type Debt} from '../lib/finance';
import {parseInstallments} from '../lib/installments';
import {Button} from './ui/button';

type Mode=NonNullable<Debt['kaspiMode']>;
type Draft={name:string;mode:Mode;text:string};

export function KaspiSchedule({initial,date,busy,close,save}:{initial:Draft;date:string;busy:boolean;close:()=>void;save:(draft:Draft)=>void}){
  const [name,setName]=useState(initial.name);
  const [mode,setMode]=useState(initial.mode);
  const [method,setMethod]=useState<'table'|'paste'>('table');
  const [text,setText]=useState(initial.text);
  const [rows,setRows]=useState(()=>initial.text?parseInstallments(initial.text).map(row=>({date:row.date,amount:String(row.amount/100)})):[{date,amount:''}]);
  const [error,setError]=useState('');
  const [preview,setPreview]=useState<ReturnType<typeof parseInstallments>|null>(null);
  const toText=()=>rows.map(row=>row.date+' '+row.amount).join('\n');
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const value=method==='paste'?text:toText();
    try{
      const parsed=parseInstallments(value);
      if(preview){save({name,mode,text:value});return;}
      setPreview(parsed);setError('');
    }catch(error){setError(error instanceof Error?error.message:'Проверьте график.');}
  }
  function changeMethod(next:typeof method){
    if(next===method)return;
    setError('');
    if(next==='paste')setText(rows.every(row=>!row.amount)?'':toText());
    else if(text.trim()){
      try{setRows(parseInstallments(text).map(row=>({date:row.date,amount:String(row.amount/100)})));}
      catch(error){setError(error instanceof Error?error.message:'Проверьте график.');return;}
    }
    setMethod(next);
  }
  return <div className="overlay" onClick={close}><section className="dialog" role="dialog" aria-modal="true" aria-label="График Kaspi" onClick={e=>e.stopPropagation()}>
    <div className="dialog-header"><h2>График Kaspi</h2><Button variant="ghost" onClick={close}>Закрыть</Button></div>
    <form onSubmit={submit}>
      {!preview?<><div className="form-grid">
        <label>Название<input value={name} onChange={e=>setName(e.target.value)} required/></label>
        <label>Режим учёта<select value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="aggregate">Общий график Kaspi</option><option value="individual">Отдельная рассрочка</option></select></label>
      </div>
      <p>Внесите оставшиеся суммы из Kaspi. Общий график уже включает отдельные рассрочки, учтённые в нём.</p>
      <div className="quick" role="group" aria-label="Способ ввода">
        <Button type="button" variant={method==='table'?'default':'outline'} onClick={()=>changeMethod('table')}>Таблица</Button>
        <Button type="button" variant={method==='paste'?'default':'outline'} onClick={()=>changeMethod('paste')}>Вставить из буфера</Button>
      </div>
      {method==='paste'?<label className="form-grid kaspi-paste">График: дата и сумма в каждой строке<textarea required rows={6} value={text} onChange={e=>setText(e.target.value)} placeholder={'2027-01-20 35000\n20.02.2027   19000'}/></label>:
        <div className="kaspi-table">{rows.map((row,index)=><div className="kaspi-row" key={index}>
          <label>Дата {index+1}<input type="date" value={row.date} min={date} required onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,date:e.target.value}:r))}/></label>
          <label>Сумма {index+1}, ₸<input type="number" min="0.01" step="0.01" value={row.amount} required onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,amount:e.target.value}:r))}/></label>
          <Button type="button" variant="ghost" disabled={rows.length===1} aria-label={'Убрать строку '+(index+1)} onClick={()=>setRows(rows.filter((_,i)=>i!==index))}>Убрать</Button>
        </div>)}
          <Button type="button" variant="outline" onClick={()=>setRows([...rows,{date:month(rows.at(-1)?.date||date,1),amount:''}])}>Добавить строку</Button>
        </div>}
      </>:<div>
        <p>{name} · {mode==='aggregate'?'общий график':'отдельная рассрочка'}</p>
        <p>Остаток долга по новому графику {money(preview.reduce((sum,row)=>sum+row.amount,0))} · {preview.length} платежей.</p>
        <p>Первый платёж {preview[0].date} · {money(preview[0].amount)}.</p>
      </div>}
      {error&&<p role="alert" className="loss">{error}</p>}
      <div className="actions">{preview&&<Button type="button" variant="ghost" onClick={()=>setPreview(null)}>Назад</Button>}<Button disabled={busy}>{preview?'Сохранить график':'Проверить график'}</Button></div>
    </form>
  </section></div>;
}
