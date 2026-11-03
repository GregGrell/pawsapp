-- Disease tests (FIV/FeLV for cats, quad/4Dx for dogs), vaccine manufacturer, and saved flight lists.
alter table public.treatment_types drop constraint treatment_types_kind_check;
alter table public.treatment_types add constraint treatment_types_kind_check check (kind in ('vaccine','worming','flea_tick','ratt','test','other'));
alter table public.treatments drop constraint treatments_kind_check;
alter table public.treatments add constraint treatments_kind_check check (kind in ('vaccine','worming','flea_tick','ratt','test','other'));
alter table public.treatments add column if not exists manufacturer text not null default '';

insert into public.treatment_types (kind, name, species, interval_days, sort) values
  ('test', 'FIV/FeLV test', 'cat', null, 40),
  ('test', 'Quad test (4Dx)', 'dog', null, 41);

create table public.flight_lists (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  flight_on date,
  animal_ids uuid[] not null default '{}',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.flight_lists enable row level security;
create policy flight_lists_read on public.flight_lists for select to authenticated using (public.can_edit_animals());
create policy flight_lists_insert on public.flight_lists for insert to authenticated with check (public.can_edit_animals());
create policy flight_lists_update on public.flight_lists for update to authenticated using (public.can_edit_animals()) with check (public.can_edit_animals());
create policy flight_lists_delete on public.flight_lists for delete to authenticated using (public.can_edit_animals());
alter publication supabase_realtime add table public.flight_lists;
