-- Animal records: PAWSapp becomes the record for every animal, current and past.
-- Adds a 'records' role (overseas adoption team: animal records only), location history,
-- treatments with due dates, medical notes, files, and an audit log of who changed what.

-- ---------- roles ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('staff','management','volunteer','records'));

-- Who can read and edit animal records: staff, management and the records team.
create or replace function public.can_edit_animals() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select active and role in ('staff','management','records') from public.profiles where id = auth.uid()), false)
$$;

-- Records team needs the team's names for "who did what".
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_active() or public.can_edit_animals() or id = auth.uid());

-- ---------- animals: full profile ----------
alter table public.animals
  add column if not exists breed text not null default '',
  add column if not exists colour text not null default '',
  add column if not exists sex text not null default 'unknown' check (sex in ('male','female','unknown')),
  add column if not exists dob date,
  add column if not exists dob_estimated boolean not null default false,
  add column if not exists neutered boolean,
  add column if not exists microchip text not null default '',
  add column if not exists microchip_on date,
  add column if not exists status text not null default 'shelter'
    check (status in ('shelter','foster','trial','adopted','transferred','deceased','returned','other')),
  add column if not exists status_since date,
  add column if not exists intake_on date,
  add column if not exists notes text not null default '',
  add column if not exists photo_path text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid default auth.uid() references public.profiles(id),
  add column if not exists updated_by uuid references public.profiles(id);

update public.animals set status = case when in_shelter then 'shelter' else 'adopted' end where status = 'shelter' and not in_shelter;
create unique index if not exists animals_microchip_unique on public.animals (microchip) where microchip <> '';

-- in_shelter follows status, so the kennel log and sign-outs keep working unchanged
create or replace function public.animals_sync_flags() returns trigger
language plpgsql set search_path = public as $$
begin
  new.in_shelter := (new.status = 'shelter');
  if new.status <> 'shelter' then new.kennel_id := null; end if;
  new.microchip := regexp_replace(coalesce(new.microchip, ''), '\s', '', 'g');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;
drop trigger if exists animals_flags on public.animals;
create trigger animals_flags before insert or update on public.animals
  for each row execute function public.animals_sync_flags();

-- ---------- location history ----------
create table public.animal_locations (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  status text not null check (status in ('shelter','foster','trial','adopted','transferred','deceased','returned','other')),
  kennel_id uuid references public.kennels(id) on delete set null,
  with_name text not null default '',
  with_contact text not null default '',
  country text not null default '',
  from_on date not null default (now() at time zone 'Asia/Qatar')::date,
  note text not null default '',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.animal_locations (animal_id, from_on);

-- The newest entry (by date) sets where the animal is now. Back-dated history leaves "now" alone.
create or replace function public.on_animal_location() returns trigger
language plpgsql security definer set search_path = public as $$
declare latest uuid;
begin
  select id into latest from public.animal_locations where animal_id = new.animal_id
    order by from_on desc, created_at desc limit 1;
  if latest = new.id then
    update public.animals set status = new.status, status_since = new.from_on,
      kennel_id = case when new.status = 'shelter' then new.kennel_id else null end
    where id = new.animal_id;
  end if;
  return new;
end $$;
create trigger animal_location_current after insert on public.animal_locations
  for each row execute function public.on_animal_location();

-- Existing animals get a starting entry so every record has a history.
insert into public.animal_locations (animal_id, status, kennel_id, from_on, note, created_by)
select id, status, kennel_id, coalesce(intake_on, (updated_at at time zone 'Asia/Qatar')::date), 'Record started', null from public.animals;

-- Permanent sign-outs now go into the location history.
create or replace function public.on_animal_moved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'permanent' and new.animal_id is not null then
    insert into public.animal_locations (animal_id, status, from_on, note, created_by)
    values (new.animal_id,
            case new.destination when 'foster' then 'foster' when 'adopter' then 'adopted' when 'transfer' then 'transferred' else 'other' end,
            (new.out_at at time zone 'Asia/Qatar')::date, new.reason, new.out_by);
  end if;
  return new;
end $$;

-- ---------- treatments ----------
create table public.treatment_types (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('vaccine','worming','flea_tick','ratt','other')),
  name text not null,
  species text not null default 'both' check (species in ('dog','cat','both')),
  interval_days int check (interval_days is null or interval_days > 0),
  active boolean not null default true,
  sort int not null default 0
);

insert into public.treatment_types (kind, name, species, interval_days, sort) values
  ('vaccine', 'Rabies', 'both', 365, 1),
  ('vaccine', 'DHPPi + Lepto', 'dog', 365, 2),
  ('vaccine', 'Tricat (FVRCP)', 'cat', 365, 3),
  ('worming', 'Worming', 'both', 90, 10),
  ('flea_tick', 'Flea & tick', 'both', 30, 20),
  ('ratt', 'RATT (rabies titre test)', 'both', null, 30);

create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  type_id uuid references public.treatment_types(id) on delete set null,
  kind text not null check (kind in ('vaccine','worming','flea_tick','ratt','other')),
  name text not null,
  given_on date,
  next_due_on date,
  product text not null default '',
  batch text not null default '',
  vet text not null default '',
  result text not null default '',
  certificate_path text,
  notes text not null default '',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (given_on is not null or next_due_on is not null)
);
create index on public.treatments (animal_id, type_id, given_on);

-- ---------- medical notes, files, medications ----------
create table public.medical_notes (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  noted_on date not null default (now() at time zone 'Asia/Qatar')::date,
  title text not null,
  body text not null default '',
  file_path text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.medical_notes (animal_id, noted_on);

create table public.animal_files (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  kind text not null default 'photo' check (kind in ('photo','document')),
  path text not null,
  caption text not null default '',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.animal_files (animal_id);

alter table public.medications
  add column if not exists started_on date default (now() at time zone 'Asia/Qatar')::date,
  add column if not exists ended_on date,
  add column if not exists created_by uuid default auth.uid() references public.profiles(id),
  add column if not exists created_at timestamptz not null default now();

-- ---------- audit log ----------
create table public.animal_audit (
  id bigint generated always as identity primary key,
  animal_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null,
  changes jsonb not null default '{}',
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index on public.animal_audit (animal_id, changed_at desc);

create or replace function public.audit_animal_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  diff jsonb := '{}'::jsonb;
  k text;
  aid uuid;
  skip text[] := array['updated_at','updated_by','created_at','created_by','in_shelter','id'];
begin
  aid := case when tg_table_name = 'animals' then coalesce((n->>'id')::uuid, (o->>'id')::uuid)
              else coalesce((n->>'animal_id')::uuid, (o->>'animal_id')::uuid) end;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if not (k = any(skip)) and (o->k) is distinct from (n->k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(o->k, n->k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    diff := n - skip;
  else
    diff := o - skip;
  end if;
  insert into public.animal_audit (animal_id, table_name, row_id, action, changes, changed_by)
  values (aid, tg_table_name, coalesce((n->>'id')::uuid, (o->>'id')::uuid), lower(tg_op), diff, auth.uid());
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['animals','animal_locations','treatments','medical_notes','animal_files','medications','animal_movements'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_animal_change()', t);
  end loop;
end $$;

revoke execute on function public.audit_animal_change() from public, anon, authenticated;
revoke execute on function public.on_animal_location() from public, anon, authenticated;
revoke execute on function public.animals_sync_flags() from public, anon, authenticated;

-- ---------- access ----------
alter table public.animal_locations enable row level security;
alter table public.treatment_types enable row level security;
alter table public.treatments enable row level security;
alter table public.medical_notes enable row level security;
alter table public.animal_files enable row level security;
alter table public.animal_audit enable row level security;

-- animals: volunteers can still see names (for sign-outs); staff, management and records team edit
create policy animals_records_read on public.animals for select to authenticated using (public.can_edit_animals());
create policy animals_records_insert on public.animals for insert to authenticated with check (public.can_edit_animals());
create policy animals_records_update on public.animals for update to authenticated using (public.can_edit_animals()) with check (public.can_edit_animals());

-- kennels: records team can read
create policy kennels_records_read on public.kennels for select to authenticated using (public.can_edit_animals());

-- medications: records team too, and staff can now add and stop
create policy medications_records_read on public.medications for select to authenticated using (public.can_edit_animals());
create policy medications_records_insert on public.medications for insert to authenticated with check (public.can_edit_animals());
create policy medications_records_update on public.medications for update to authenticated using (public.can_edit_animals()) with check (public.can_edit_animals());

do $$
declare t text;
begin
  foreach t in array array['animal_locations','treatments','medical_notes','animal_files'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.can_edit_animals())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.can_edit_animals())', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.can_edit_animals()) with check (public.can_edit_animals())', t);
    execute format('create policy %1$s_mgmt on public.%1$s for all to authenticated using (public.is_management()) with check (public.is_management())', t);
  end loop;
end $$;

create policy treatment_types_read on public.treatment_types for select to authenticated using (public.can_edit_animals());
create policy treatment_types_mgmt on public.treatment_types for all to authenticated using (public.is_management()) with check (public.is_management());

-- audit log: readable, never writable from the app
create policy animal_audit_read on public.animal_audit for select to authenticated using (public.can_edit_animals());

-- photos and certificates for animals live under photos/animals/
create policy photos_records_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'animals' and public.can_edit_animals());
create policy photos_records_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'animals' and public.can_edit_animals());

alter publication supabase_realtime add table public.animals, public.animal_locations, public.treatments,
  public.medical_notes, public.animal_files, public.medications, public.treatment_types;
