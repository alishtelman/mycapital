create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  label text not null default 'Личный бюджет' check (length(label) between 1 and 80),
  shared boolean not null default false,
  revision integer not null default 0
);
create unique index one_personal_workspace on public.households(owner) where not shared;
create table public.household_members (
  household uuid references public.households on delete cascade,
  email text not null,
  can_edit boolean not null default false,
  primary key(household,email)
);
create table public.user_settings (
  household uuid primary key references public.households on delete cascade,
  body jsonb not null
);
create table public.audit_log (
  household uuid references public.households on delete cascade,
  revision integer not null,
  actor uuid references auth.users on delete set null,
  at timestamptz not null default now(),
  primary key(household,revision)
);
create function public.owns_workspace(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select from public.households where id=target and owner=(select auth.uid())); $$;

create function public.can_access_workspace(target uuid, write_access boolean default false) returns boolean
language sql stable security definer set search_path = ''
as $$
select public.owns_workspace(target) or (
  coalesce((select auth.jwt())->>'email','') <> ''
  and exists(select from auth.users where id=(select auth.uid()) and email_confirmed_at is not null and lower(email)=lower((select auth.jwt())->>'email'))
  and exists(select from public.households where id=target and shared)
  and exists(select from public.household_members where household=target
    and email=lower((select auth.jwt())->>'email') and (can_edit or not write_access))
);
$$;

revoke all on function public.owns_workspace(uuid), public.can_access_workspace(uuid,boolean) from public;
grant execute on function public.owns_workspace(uuid), public.can_access_workspace(uuid,boolean) to authenticated;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.user_settings enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.households,public.household_members,public.user_settings,public.audit_log from anon,authenticated;
grant select on public.households,public.household_members,public.user_settings,public.audit_log to authenticated;
grant insert(owner,label,shared) on public.households to authenticated;
grant insert,update,delete on public.household_members to authenticated;
create policy household_read on public.households for select to authenticated using(owner=(select auth.uid()) or public.can_access_workspace(id));
create policy household_create on public.households for insert to authenticated with check(owner=(select auth.uid()));
create policy member_manage on public.household_members for all to authenticated using(public.owns_workspace(household)) with check(public.owns_workspace(household));
create policy settings_read on public.user_settings for select to authenticated using(public.can_access_workspace(household));
create policy audit_read on public.audit_log for select to authenticated using(public.can_access_workspace(household));

do $$
declare t text;
begin
  foreach t in array array['accounts','transactions','planned_events','recurring_rules','expense_categories','planned_purchases','loans','financial_goals','forecast_scenarios','allocation_plans','government_bonus_records']
  loop
    execute format('create table public.%I (household uuid references public.households on delete cascade, id text not null, body jsonb not null check (jsonb_typeof(body) = ''object'' and body->>''id'' = id), primary key(household,id))',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy read_workspace on public.%I for select to authenticated using(public.can_access_workspace(household))',t);
  end loop;
end;
$$;
alter table public.transactions add constraint valid_amount check ((body->>'amount')::bigint between 1 and 1000000000000);
alter table public.accounts add constraint valid_opening check ((body->>'opening')::bigint between 0 and 1000000000000);

create function public.workspace(target uuid) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  result jsonb; item record; records jsonb;
begin
  select jsonb_build_object('revision',h.revision,'data',jsonb_build_object('settings',s.body))
  into result from public.households h left join public.user_settings s on h.id=s.household where h.id=target;
  if result is null then return null; end if;
  for item in select * from (values
    ('accounts','accounts'),('transactions','transactions'),('events','planned_events'),('rules','recurring_rules'),
    ('categories','expense_categories'),('purchases','planned_purchases'),('debts','loans'),('goals','financial_goals'),
    ('scenarios','forecast_scenarios'),('plans','allocation_plans'),('bonuses','government_bonus_records')
  ) as p(key,table_name)
  loop
    execute format('select coalesce(jsonb_agg(body order by id),''[]''::jsonb) from public.%I where household=$1',item.table_name) into records using target;
    result=jsonb_set(result,array['data',item.key],records);
  end loop;
  return result;
end;
$$;
revoke all on function public.workspace(uuid) from public;
grant execute on function public.workspace(uuid) to authenticated;

-- The Next.js API verifies the user and validates the entire document before calling this RPC.
-- The server-only role cannot be used from a browser session.
create function public.save_workspace(target uuid, expected integer, payload jsonb, actor_id uuid) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  version integer; item record;
begin
  select revision into version from public.households where id=target for update;
  if not exists(select from public.households where id=target and owner=actor_id)
    and not exists(select from public.household_members member join auth.users u on lower(u.email)=member.email
      where member.household=target and member.can_edit and exists(select from public.households where id=target and shared) and u.id=actor_id and u.email_confirmed_at is not null)
  then raise exception 'workspace_forbidden' using errcode='42501'; end if;
  if version is distinct from expected then raise exception 'workspace_conflict' using errcode='40001'; end if;
  for item in select * from (values
    ('accounts','accounts'),('transactions','transactions'),('events','planned_events'),('rules','recurring_rules'),
    ('categories','expense_categories'),('purchases','planned_purchases'),('debts','loans'),('goals','financial_goals'),
    ('scenarios','forecast_scenarios'),('plans','allocation_plans'),('bonuses','government_bonus_records')
  ) as p(key,table_name)
  loop
    execute format('delete from public.%I q where household=$1 and not exists(select from jsonb_array_elements($2) j where j->>''id''=q.id)',item.table_name) using target,payload->item.key;
    execute format('insert into public.%I as q(household,id,body) select $1,j->>''id'',j from jsonb_array_elements($2) j on conflict(household,id) do update set body=excluded.body where q.body is distinct from excluded.body',item.table_name) using target,payload->item.key;
  end loop;
  insert into public.user_settings values(target,payload->'settings') on conflict(household) do update set body=excluded.body;
  update public.households set revision=version+1 where id=target;
  insert into public.audit_log(household,revision,actor) values(target,version+1,actor_id);
  return version+1;
end;
$$;
revoke all on function public.save_workspace(uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_workspace(uuid,integer,jsonb,uuid) to service_role;
grant all on public.households,public.household_members,public.user_settings,public.audit_log,public.accounts,public.transactions,public.planned_events,public.recurring_rules,public.expense_categories,public.planned_purchases,public.loans,public.financial_goals,public.forecast_scenarios,public.allocation_plans,public.government_bonus_records to service_role;
