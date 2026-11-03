-- Weights, microchip checks, and adopter / foster contacts (applied via Supabase 2026-11-03:
-- migrations "weights_and_chip_checks" and "adopter_contacts").
create table public.animal_weights (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  weighed_on date not null default (now() at time zone 'Asia/Qatar')::date,
  kg numeric(6,2) not null check (kg > 0 and kg < 200),
  notes text not null default '',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.microchip_checks (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  checked_on date not null default (now() at time zone 'Asia/Qatar')::date,
  result text not null default 'ok' check (result in ('ok','not_found','mismatch')),
  scanned text not null default '',
  notes text not null default '',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
-- RLS: can_edit_animals() read/insert/update, management all; audit_animal_change() triggers on both.

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'adopter' check (kind in ('adopter','foster','other')),
  full_name text not null,
  phone text not null default '', email text not null default '',
  address text not null default '', city text not null default '', country text not null default '',
  notes text not null default '',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.animal_locations add column contact_id uuid references public.contacts(id) on delete set null;
-- RLS: can_edit_animals() read/insert/update, management all; contact_audit table + audit_contact_change() trigger.
