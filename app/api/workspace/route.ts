import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {dataSchema} from '../../../lib/schema';
import {balance,cash,reserved,sum,today,uses,validateEntry} from '../../../lib/finance';

const headers={'Cache-Control':'no-store'};
const response=(error:string,status:number)=>Response.json({error},{status,headers});
function clients(request:Request){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(!url||!key||!secret||!token)return null;
  const auth={persistSession:false,autoRefreshToken:false};
  return {token,userDb:createClient(url,key,{auth,global:{headers:{Authorization:'Bearer '+token}}}),admin:createClient(url,secret,{auth})};
}
export async function PUT(request:Request){
  const db=clients(request);
  if(!db)return response('Проверьте подключение Supabase и вход.',401);
  const {data:{user}}=await db.userDb.auth.getUser(db.token);
  if(!user)return response('Войдите заново.',401);
  const payload=z.object({id:z.uuid(),revision:z.number().int().min(0),data:dataSchema}).safeParse(await request.json().catch(()=>null));
  if(!payload.success)return response(payload.error.issues[0]?.message??'Проверьте данные.',400);
  const {id,revision,data}=payload.data;
  const access=await db.userDb.rpc('can_access_workspace',{target:id,write_access:true});
  if(access.error||access.data!==true)return response('Недостаточно прав для записи.',403);
  if(data.accounts.some(a=>balance(a,data.transactions)<0)||cash(data)<reserved(data))return response('Средства на счетах или в резервах не сходятся.',422);
  const items=data.plans.flatMap(p=>p.items);
  const byItem=new Map(items.map(i=>[i.id,i]));
  const spent=new Map<string,number>();
  const eventById=new Map(data.events.map(e=>[e.id,e]));
  const validationData={...data,plans:[]};
  if(new Set(items.map(i=>i.id)).size!==items.length)return response('Резервы повторяются.',422);
  for(const entry of data.transactions){
    // Validate the shape and account references independently of historical ordering.
    const error=validateEntry(validationData,entry,false);
    if(error||entry.date>today())return response(error||'Проверьте дату операции.',422);
    if(entry.event){
      const event=eventById.get(entry.event);
      if(!event||event.kind!==entry.kind)return response('Не найдено совместимое событие.',422);
    }
    const links=uses(entry);
    if(new Set(links.map(link=>link.id)).size!==links.length||sum(links.map(link=>link.amount))>entry.amount)
      return response('Проверьте сумму списания из резервов.',422);
    for(const link of links){
      const item=byItem.get(link.id);
      if(!item)return response('Не найден связанный резерв.',422);
      const used=(spent.get(item.id)??0)+link.amount;
      if(used>item.amount)return response('Превышен остаток резерва.',422);
      if(['otbasy','bcc','reserve'].includes(item.group)&&(entry.kind!=='transfer'||entry.to!==item.target))
        return response('Зачислите перевод на счёт, указанный в резерве.',422);
      if(item.group==='living'&&(entry.kind!=='expense'||entry.category!==item.target))
        return response('Выберите категорию резерва.',422);
      if(['bills','purchases'].includes(item.group)&&(entry.kind!=='expense'||entry.event!==item.target))
        return response('Выберите событие резерва.',422);
      spent.set(item.id,used);
    }
  }
  const result=await db.admin.rpc('save_workspace',{target:id,expected:revision,payload:data,actor_id:user.id});
  if(result.error)return response(result.error.code==='40001'?'Данные изменились в другом окне. Обновите страницу.':'Не удалось сохранить изменения.',result.error.code==='40001'?409:500);
  return Response.json({revision:result.data},{headers});
}
export async function DELETE(request:Request){
  const db=clients(request);
  if(!db)return response('Проверьте подключение Supabase и вход.',401);
  const {data:{user}}=await db.userDb.auth.getUser(db.token);
  if(!user)return response('Войдите заново.',401);
  const result=await db.admin.auth.admin.deleteUser(user.id);
  if(result.error)return response('Не удалось удалить аккаунт.',500);
  return Response.json({ok:true},{headers});
}
