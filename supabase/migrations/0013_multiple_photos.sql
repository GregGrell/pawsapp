-- Several photos per entry: the first stays in its existing column, the rest go in extra_paths.
alter table public.request_replies     add column if not exists extra_paths text[] not null default '{}';
alter table public.incidents           add column if not exists extra_paths text[] not null default '{}';
alter table public.task_completions    add column if not exists extra_paths text[] not null default '{}';
alter table public.appointment_outcomes add column if not exists extra_paths text[] not null default '{}';
alter table public.cash_donations      add column if not exists extra_paths text[] not null default '{}';
alter table public.petty_cash_spends   add column if not exists extra_paths text[] not null default '{}';
alter table public.sick_reports        add column if not exists extra_paths text[] not null default '{}';
alter table public.treatments          add column if not exists extra_paths text[] not null default '{}';
alter table public.medical_notes       add column if not exists extra_paths text[] not null default '{}';
alter table public.maintenance_issues  add column if not exists extra_paths text[] not null default '{}';
alter table public.maintenance_issues  add column if not exists fix_extra_paths text[] not null default '{}';

create or replace view public.treatments_in_care with (security_invoker = true) as
  select t.id, t.animal_id, t.type_id, t.kind, t.name, t.given_on, t.next_due_on, t.product, t.batch, t.vet, t.result,
         t.certificate_path, t.notes, t.created_by, t.created_at, t.manufacturer, t.sl_key, t.extra_paths
  from public.treatments t join public.animals a on a.id = t.animal_id
  where a.status = any (array['shelter','foster','trial']);
create or replace view public.medical_notes_in_care with (security_invoker = true) as
  select n.id, n.animal_id, n.noted_on, n.title, n.body, n.file_path, n.created_by, n.created_at, n.sl_key, n.extra_paths
  from public.medical_notes n join public.animals a on a.id = n.animal_id
  where a.status = any (array['shelter','foster','trial']);
