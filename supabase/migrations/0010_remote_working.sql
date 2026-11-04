-- Working from home: chosen people can sign in remotely; hours are recorded separately from on-site time.
alter table public.site_presence add column if not exists remote boolean not null default false;
alter table public.profiles add column if not exists can_work_remote boolean not null default false;
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_management()
     and (new.role is distinct from old.role or new.active is distinct from old.active or new.can_work_remote is distinct from old.can_work_remote) then
    raise exception 'Only management can change roles, activation or remote working';
  end if;
  return new;
end $$;
-- Lucy McManus was switched on when this was applied.
