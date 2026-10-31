create table public.maintenance_issues (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  location text not null default '',
  description text not null,
  urgent boolean not null default false,
  photo_path text,
  status text not null default 'open' check (status in ('open','in_progress','fixed')),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz,
  fix_note text not null default '',
  fix_photo_path text
);
alter table public.maintenance_issues enable row level security;
create policy maint_read on public.maintenance_issues for select to authenticated using (public.is_active());
create policy maint_insert on public.maintenance_issues for insert to authenticated with check (public.is_active());
create policy maint_update on public.maintenance_issues for update to authenticated using (public.is_active()) with check (public.is_active());
create policy maint_delete on public.maintenance_issues for delete to authenticated using (public.is_management());
alter publication supabase_realtime add table public.maintenance_issues;
