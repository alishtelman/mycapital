import type {ComponentProps, ReactNode} from 'react';
import {ChevronDown, ChevronRight} from 'lucide-react';
import {money} from '../../lib/finance';

export function Amount({value, sign='', className=''}:{value:number; sign?:string; className?:string}){
  return <strong className={['amount',className].filter(Boolean).join(' ')}>{sign}{money(value)}</strong>;
}

export function Status({children, tone='neutral'}:{children:ReactNode; tone?:'neutral'|'success'|'attention'}){
  return <span className={'status status-'+tone}>{children}</span>;
}

export function SectionHeading({title, description, action, page=false}:{title:ReactNode; description?:ReactNode; action?:ReactNode; page?:boolean}){
  const Heading=page?'h1':'h2';
  return <div className={page?'page-heading':'section-head'}><div><Heading>{title}</Heading>{description&&<p>{description}</p>}</div>{action}</div>;
}

export function Blank({children}:{children:ReactNode}){
  return <div className="blank">{children}</div>;
}

export function Disclosure({summary, children, ...props}:ComponentProps<'details'> & {summary:ReactNode}){
  return <details {...props}><summary className="disclosure-summary"><span className="disclosure-label">{summary}</span><ChevronDown className="disclosure-chevron" size={16} aria-hidden="true"/></summary>{children}</details>;
}

export function AccountCard({icon,name,value,caption,actions,children}:{icon:ReactNode;name:string;value:number;caption?:ReactNode;actions?:ReactNode;children:ReactNode}){
  return <section className="card account-card">
    <Disclosure summary={<><span className="icon-soft">{icon}</span><span><b>{name}</b>{caption&&<small className="row-note">{caption}</small>}</span><Amount value={value}/></>}>
      {children}
    </Disclosure>
    {actions}
  </section>;
}

export function FinancialRow({name, detail, value, icon, onClick}:{name:ReactNode; detail?:ReactNode; value?:ReactNode; icon?:ReactNode; onClick?:()=>void}){
  const content=<>{icon&&<span className="row-icon icon-soft">{icon}</span>}<span className="row-copy"><b>{name}</b>{detail&&<small>{detail}</small>}</span>{value&&<span className="row-value amount">{value}</span>}{onClick&&<ChevronRight className="row-chevron" size={16} aria-hidden="true"/>}</>;
  return onClick?<button type="button" className="list-row financial-row" onClick={onClick}>{content}</button>:<div className="list-row financial-row">{content}</div>;
}

export function PaymentRow({status, ...props}:ComponentProps<typeof FinancialRow> & {status?:ReactNode}){
  return <FinancialRow {...props} detail={<>{props.detail}{status&&<> · <Status>{status}</Status></>}</>}/>;
}

export function Progress({value, label, className='', over=false}:{value:number; label:string; className?:string; over?:boolean}){
  const percent=Math.max(0,Math.min(value,100));
  return <div className={['progress',className].filter(Boolean).join(' ')} role="progressbar" aria-label={label} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}><div className={over?'over':undefined} style={{width:percent+'%'}}/></div>;
}
