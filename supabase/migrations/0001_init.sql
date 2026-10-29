-- PAWSapp schema
-- Roles: 'staff' and 'management'. New sign-ups are inactive until management approves them,
-- except the very first account, which becomes active management.

create extension if not exists pgcrypto;

-- ---------- people ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'staff' check (role in ('staff','management')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, full_name, email, role, active)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.email,
          case when first_user then 'management' else 'staff' end,
          first_user);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_management() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active and role = 'management' from public.profiles where id = auth.uid()), false)
$$;

-- ---------- settings ----------
create table public.app_settings (
  key text primary key,
  value jsonb not null
);
insert into public.app_settings (key, value) values
  ('eod_alert_time', '"20:00"'),
  ('morning_reminder_time', '"07:00"'),
  ('timezone', '"Asia/Qatar"'),
  ('kennel_prefix', '{"dog":"D","cat":"C"}');

-- ---------- animals ----------
create table public.kennels (
  id uuid primary key default gen_random_uuid(),
  species text not null check (species in ('dog','cat')),
  code text not null unique,
  sort int not null default 0,
  active boolean not null default true
);

create table public.animals (
  id uuid primary key default gen_random_uuid(),
  shelterluv_id text unique,
  name text not null,
  species text not null check (species in ('dog','cat')),
  kennel_id uuid references public.kennels(id) on delete set null,
  in_shelter boolean not null default true,
  source text not null default 'manual' check (source in ('manual','shelterluv')),
  updated_at timestamptz not null default now()
);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  name text not null,
  instructions text not null default '',
  active boolean not null default true,
  source text not null default 'manual' check (source in ('manual','shelterluv'))
);

create table public.vaccines_due (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  vaccine text not null,
  due_on date not null,
  done boolean not null default false,
  source text not null default 'manual' check (source in ('manual','shelterluv'))
);

-- ---------- kennel log ----------
create table public.kennel_logs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  action text not null check (action in ('fed','exercised','cleaned','meds')),
  species text not null check (species in ('dog','cat')),
  animal_id uuid references public.animals(id) on delete set null,
  items text[] not null default '{}',
  summary text not null
);

-- ---------- calendar ----------
create table public.calendar_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('appointment','task')),
  category text not null default 'other',
  title text not null,
  starts_on date not null,
  at_time time,
  repeat text not null default 'none' check (repeat in ('none','daily','weekly')),
  assignee uuid references public.profiles(id) on delete set null,
  notes text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  active boolean not null default true
);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.calendar_items(id) on delete cascade,
  occurs_on date not null,
  status text not null check (status in ('claimed','done')),
  claimed_by uuid references public.profiles(id),
  done_by uuid references public.profiles(id),
  done_at timestamptz,
  photo_path text,
  unique (item_id, occurs_on)
);

create table public.appointment_outcomes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.calendar_items(id) on delete cascade,
  occurs_on date not null,
  outcome text not null check (outcome in ('attended','missed','rescheduled')),
  note text not null default '',
  photo_path text,
  closed_by uuid not null default auth.uid() references public.profiles(id),
  closed_at timestamptz not null default now(),
  unique (item_id, occurs_on)
);

-- ---------- requests from management ----------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  done boolean not null default false,
  done_by uuid references public.profiles(id),
  done_at timestamptz
);

create table public.request_replies (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id),
  body text not null default '',
  photo_path text,
  created_at timestamptz not null default now()
);

-- ---------- incidents ----------
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  location text not null default '',
  description text not null,
  photo_path text,
  acknowledged_by uuid references public.profiles(id),
  acknowledged_at timestamptz
);

-- ---------- leave ----------
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  kind text not null check (kind in ('day_off','annual','other')),
  start_on date not null,
  end_on date not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_on >= start_on)
);

create table public.sick_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  sick_on date not null,
  consecutive_day int not null default 1 check (consecutive_day >= 1),
  certificate_path text,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, sick_on),
  check (consecutive_day = 1 or certificate_path is not null)
);

-- ---------- timesheets ----------
create table public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  work_on date not null,
  hour int not null check (hour between 0 and 23),
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, work_on, hour)
);

-- ---------- visitors (QR sign-in) ----------
create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'visitor' check (kind in ('visitor','volunteer')),
  guests int not null default 0 check (guests between 0 and 20),
  phone text not null default '',
  signed_in_at timestamptz not null default now(),
  signed_out_at timestamptz
);

-- ---------- end of day ----------
create table public.eod_checklist_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort int not null default 0,
  active boolean not null default true
);
insert into public.eod_checklist_items (label, sort) values
  ('All animals fed and water topped up', 1),
  ('All kennels secured', 2),
  ('Evening meds given', 3),
  ('Lights and fans set for the night', 4),
  ('Gate locked', 5);

create table public.eod_signoffs (
  id uuid primary key default gen_random_uuid(),
  work_on date not null unique,
  signed_by uuid not null default auth.uid() references public.profiles(id),
  signed_at timestamptz not null default now(),
  checked text[] not null default '{}',
  notes text not null default '',
  report jsonb not null default '{}'
);

-- ---------- petty cash ----------
create table public.petty_cash_issues (
  id uuid primary key default gen_random_uuid(),
  amount numeric(10,2) not null check (amount > 0),
  issued_to uuid references public.profiles(id),
  issued_by uuid not null default auth.uid() references public.profiles(id),
  issued_on date not null default (now() at time zone 'Asia/Qatar')::date,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.petty_cash_spends (
  id uuid primary key default gen_random_uuid(),
  amount numeric(10,2) not null check (amount > 0),
  description text not null,
  receipt_path text,
  no_receipt_reason text,
  spent_by uuid not null default auth.uid() references public.profiles(id),
  spent_on date not null default (now() at time zone 'Asia/Qatar')::date,
  created_at timestamptz not null default now(),
  check (receipt_path is not null or length(trim(coalesce(no_receipt_reason,''))) > 0)
);

-- ---------- push ----------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table public.notifications_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- ============ Row level security ============
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.kennels enable row level security;
alter table public.animals enable row level security;
alter table public.medications enable row level security;
alter table public.vaccines_due enable row level security;
alter table public.kennel_logs enable row level security;
alter table public.calendar_items enable row level security;
alter table public.task_completions enable row level security;
alter table public.appointment_outcomes enable row level security;
alter table public.requests enable row level security;
alter table public.request_replies enable row level security;
alter table public.incidents enable row level security;
alter table public.leave_requests enable row level security;
alter table public.sick_reports enable row level security;
alter table public.timesheet_entries enable row level security;
alter table public.visitors enable row level security;
alter table public.eod_checklist_items enable row level security;
alter table public.eod_signoffs enable row level security;
alter table public.petty_cash_issues enable row level security;
alter table public.petty_cash_spends enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications_sent enable row level security;

-- profiles: everyone active can see the team; you can edit your own name; management edits roles/activation
create policy profiles_read on public.profiles for select to authenticated using (public.is_active() or id = auth.uid());
create policy profiles_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- only management may change someone's role or activation
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_management()
     and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'Only management can change roles or activation';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();
create policy profiles_mgmt on public.profiles for update to authenticated using (public.is_management()) with check (public.is_management());

create policy settings_read on public.app_settings for select to authenticated using (public.is_active());
create policy settings_mgmt on public.app_settings for all to authenticated using (public.is_management()) with check (public.is_management());

-- shared operational tables: all active users read and add; management can change anything
do $$
declare t text;
begin
  foreach t in array array['kennels','animals','medications','vaccines_due','eod_checklist_items'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.is_active())', t);
    execute format('create policy %1$s_mgmt on public.%1$s for all to authenticated using (public.is_management()) with check (public.is_management())', t);
  end loop;
  foreach t in array array['kennel_logs','calendar_items','task_completions','appointment_outcomes','request_replies','incidents','eod_signoffs','petty_cash_spends'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.is_active())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_active())', t);
    execute format('create policy %1$s_mgmt on public.%1$s for all to authenticated using (public.is_management()) with check (public.is_management())', t);
  end loop;
end $$;

-- staff can update task claims/completions and calendar items they created
create policy task_completions_update on public.task_completions for update to authenticated using (public.is_active()) with check (public.is_active());
create policy calendar_items_own on public.calendar_items for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy incidents_ack on public.incidents for update to authenticated using (public.is_management()) with check (public.is_management());

-- requests: management posts; everyone reads; anyone can mark done
create policy requests_read on public.requests for select to authenticated using (public.is_active());
create policy requests_insert on public.requests for insert to authenticated with check (public.is_management());
create policy requests_done on public.requests for update to authenticated using (public.is_active()) with check (public.is_active());
create policy requests_mgmt on public.requests for delete to authenticated using (public.is_management());

-- leave: see all (team calendar); create own; management decides
create policy leave_read on public.leave_requests for select to authenticated using (public.is_active());
create policy leave_insert on public.leave_requests for insert to authenticated with check (public.is_active() and user_id = auth.uid());
create policy leave_mgmt on public.leave_requests for update to authenticated using (public.is_management()) with check (public.is_management());

-- sick reports: private to the person and management
create policy sick_read on public.sick_reports for select to authenticated using (user_id = auth.uid() or public.is_management());
create policy sick_insert on public.sick_reports for insert to authenticated with check (public.is_active() and user_id = auth.uid());
create policy sick_mgmt on public.sick_reports for update to authenticated using (public.is_management()) with check (public.is_management());

-- team view of who is off sick today, without details
create or replace function public.sick_today(day date) returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select user_id from public.sick_reports where sick_on = day and public.is_active()
$$;

-- timesheets: own rows; management reads all
create policy ts_read on public.timesheet_entries for select to authenticated using (user_id = auth.uid() or public.is_management());
create policy ts_write on public.timesheet_entries for insert to authenticated with check (public.is_active() and user_id = auth.uid());
create policy ts_update on public.timesheet_entries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- visitors: the public gate form can sign in; staff see the list and sign people out
create policy visitors_public_insert on public.visitors for insert to anon, authenticated with check (signed_out_at is null);
create policy visitors_read on public.visitors for select to authenticated using (public.is_active());
create policy visitors_update on public.visitors for update to authenticated using (public.is_active()) with check (public.is_active());

-- petty cash issues: management records; everyone sees the float
create policy pci_read on public.petty_cash_issues for select to authenticated using (public.is_active());
create policy pci_mgmt on public.petty_cash_issues for all to authenticated using (public.is_management()) with check (public.is_management());

-- push subscriptions: own only
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- notifications_sent: no client access (service role only)

-- ============ Storage ============
insert into storage.buckets (id, name, public) values
  ('photos', 'photos', false),
  ('certificates', 'certificates', false)
on conflict (id) do nothing;

create policy photos_read on storage.objects for select to authenticated using (bucket_id = 'photos' and public.is_active());
create policy photos_write on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_active());

-- certificates: stored under <user id>/..., readable by that person and management
create policy certs_read on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_management()));
create policy certs_write on storage.objects for insert to authenticated
  with check (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active());

-- realtime for live updates
alter publication supabase_realtime add table public.kennel_logs, public.calendar_items, public.task_completions,
  public.appointment_outcomes, public.requests, public.incidents, public.eod_signoffs, public.leave_requests,
  public.petty_cash_spends, public.petty_cash_issues, public.visitors;
