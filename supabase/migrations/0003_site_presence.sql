create table public.site_presence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  event text not null check (event in ('in','out')),
  at timestamptz not null default now(),
  reason_kind text check (reason_kind in ('appointment','end_of_day','break','errand','other')),
  reason text not null default '',
  item_id uuid references public.calendar_items(id) on delete set null,
  added_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (event = 'in' or reason_kind is not null)
);
create index site_presence_user_at on public.site_presence (user_id, at);
alter table public.site_presence enable row level security;
create policy presence_read on public.site_presence for select to authenticated using (user_id = auth.uid() or public.is_management());
create policy presence_insert on public.site_presence for insert to authenticated with check (public.is_active() and (user_id = auth.uid() or public.is_management()));
create policy presence_mgmt on public.site_presence for all to authenticated using (public.is_management()) with check (public.is_management());
alter publication supabase_realtime add table public.site_presence;
