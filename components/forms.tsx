import type {FormEvent,ReactNode} from 'react';
import {X} from 'lucide-react';
import {Button} from './ui/button';

export type Value=string|number|boolean;
export type Field={key:string;label:string;type?:'money'|'number'|'date'|'boolean'|'text'|'select';options?:[string,string][];optional?:boolean};
export const field=(key:string,label:string,type?:Field['type'],optional=false):Field=>({key,label,type,optional});
export const select=(key:string,label:string,options:[string,string][],optional=false):Field=>({key,label,type:'select',options,optional});
export function FormModal({title,fields,initial,close,submit,busy,children}:{title:string;fields:Field[];initial:Record<string,Value>;close:()=>void;submit:(values:Record<string,Value>)=>void;busy:boolean;children?:ReactNode}){
  function onSubmit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=new FormData(e.currentTarget);
    const values={...initial};
    for(const f of fields){
      const raw=String(form.get(f.key)??'');
      values[f.key]=f.type==='boolean'?form.has(f.key):f.type==='money'?Math.round(Number(raw)*100):f.type==='number'?Number(raw):raw.trim();
    }
    submit(values);
  }
  return <div className="overlay" onClick={close}><section className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}>
    <div className="dialog-header"><h2>{title}</h2><Button variant="ghost" onClick={close} aria-label="Закрыть"><X size={20}/></Button></div>
    {children}
    <form onSubmit={onSubmit}><div className="form-grid">{fields.map(f=>{
      const v=initial[f.key]??'';
      return <label key={f.key} className={f.type==='boolean'?'checkbox':''}>
        {f.type==='boolean'?<><input type="checkbox" name={f.key} defaultChecked={Boolean(v)}/>{f.label}</>:<>{f.label}
        {f.type==='select'?<select name={f.key} defaultValue={String(v)} required={!f.optional}>{f.optional&&<option value="">—</option>}{f.options?.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>:
          <input name={f.key} type={f.type==='money'||f.type==='number'?'number':f.type??'text'} defaultValue={f.type==='money'?Number(v)/100:String(v)} required={!f.optional} min={f.type==='number'||f.type==='money'?0:undefined} step={f.type==='money'?'0.01':'any'}/>}</>}
      </label>;
    })}</div><div className="actions"><Button variant="outline" type="button" onClick={close}>Отмена</Button><Button disabled={busy}>Сохранить</Button></div></form>
  </section></div>;
}
export function Blank({children}:{children:ReactNode}){return <div className="blank">{children}</div>}
