begin;
insert into auth.users (id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000001','owner@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000002','member@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000003','outsider@example.invalid',now());
insert into public.households(id,owner,shared) values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001',true),
 ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000002',false);
insert into public.household_members values ('00000000-0000-0000-0000-000000000101','member@example.invalid',false);
set local role service_role;
select public.save_workspace('00000000-0000-0000-0000-000000000101',0,
 '{"accounts":[{"id":"cash","opening":100}],"transactions":[{"id":"entry","amount":12}],
   "events":[],"rules":[],"categories":[],"purchases":[],"debts":[],"goals":[],"scenarios":[],"plans":[],"bonuses":[],"settings":{}}',
 '00000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.save_workspace('00000000-0000-0000-0000-000000000101',0,'{}','00000000-0000-0000-0000-000000000001');
    raise exception 'Concurrency guard failed';
  exception when serialization_failure then null;
  end;
end $$;
select public.save_workspace('00000000-0000-0000-0000-000000000102',0,
 '{"accounts":[{"id":"cash","opening":500}],"transactions":[{"id":"entry","amount":10,"reserveUses":[{"id":"envelope","amount":10}]}],
   "events":[],"rules":[],"categories":[],"purchases":[],"debts":[],"goals":[],"scenarios":[],"plans":[],"bonuses":[],
   "settings":{"reminderTime":"09:15","notifications":{"example":{"read":true}}}}',
 '00000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","email":"outsider@example.invalid"}',true);
do $$ begin
  if exists(select from public.households) or exists(select from public.accounts) or exists(select from public.transactions)
    or public.workspace('00000000-0000-0000-0000-000000000101') is not null then
      raise exception 'Outsider can read the workspace';
  end if;
  begin
    perform public.save_workspace('00000000-0000-0000-0000-000000000101',1,'{}','00000000-0000-0000-0000-000000000003');
    raise exception 'Authenticated client can bypass server validation';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","email":"member@example.invalid"}',true);
do $$ begin
  if (select count(*) from public.accounts)<>2 or public.can_access_workspace('00000000-0000-0000-0000-000000000101',true) then raise exception 'Read-only access check failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"owner@example.invalid"}',true);
do $$ begin
  if not public.can_access_workspace('00000000-0000-0000-0000-000000000101',true) then raise exception 'Owner cannot edit'; end if;
  if public.workspace('00000000-0000-0000-0000-000000000101')->>'revision'<>'1' then raise exception 'Workspace was not saved'; end if;
  if public.workspace('00000000-0000-0000-0000-000000000102') is not null then raise exception 'Private household leaked into family budget'; end if;
  if (select count(*) from public.household_members)<>1 then raise exception 'Owner cannot see members'; end if;
end $$;
insert into public.households(owner,label,shared) values ('00000000-0000-0000-0000-000000000001','Личные счета',false) returning id;
rollback;
