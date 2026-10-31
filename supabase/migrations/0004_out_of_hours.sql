create table public.out_of_hours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  work_on date not null,
  start_time time not null,
  end_time time not null,
  reason text not null check (length(trim(reason)) > 0),
  til_minutes int not null check (til_minutes >= 0),
  status text not null default 'counted' check (status in ('counted','rejected')),
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index out_of_hours_user on public.out_of_hours (user_id, work_on);
alter table public.out_of_hours enable row level security;
create policy ooh_read on public.out_of_hours for select to authenticated using (user_id = auth.uid() or public.is_management());
create policy ooh_insert on public.out_of_hours for insert to authenticated with check (public.is_active() and user_id = auth.uid() and status = 'counted');
create policy ooh_mgmt on public.out_of_hours for all to authenticated using (public.is_management()) with check (public.is_management());
alter publication supabase_realtime add table public.out_of_hours;
