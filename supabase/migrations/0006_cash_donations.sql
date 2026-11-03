-- Cash donations pot: anyone on the team logs a donation; only management sees the pot
-- and can move money from it into petty cash.
create table public.cash_donations (
  id uuid primary key default gen_random_uuid(),
  amount numeric(10,2) not null check (amount > 0),
  donor text not null default '',
  note text not null default '',
  receipt_path text,
  received_by uuid not null default auth.uid() references public.profiles(id),
  received_on date not null default (now() at time zone 'Asia/Qatar')::date,
  created_at timestamptz not null default now()
);

create table public.donation_transfers (
  id uuid primary key default gen_random_uuid(),
  amount numeric(10,2) not null check (amount > 0),
  note text not null default '',
  transferred_by uuid not null default auth.uid() references public.profiles(id),
  transferred_on date not null default (now() at time zone 'Asia/Qatar')::date,
  created_at timestamptz not null default now()
);

alter table public.petty_cash_issues add column transfer_id uuid unique references public.donation_transfers(id) on delete cascade;

alter table public.cash_donations enable row level security;
alter table public.donation_transfers enable row level security;

create policy don_insert on public.cash_donations for insert to authenticated
  with check (public.is_active() and received_by = auth.uid());
create policy don_read on public.cash_donations for select to authenticated
  using (received_by = auth.uid() or public.is_management());
create policy don_mgmt on public.cash_donations for all to authenticated
  using (public.is_management()) with check (public.is_management());

create policy dt_mgmt on public.donation_transfers for all to authenticated
  using (public.is_management()) with check (public.is_management());

-- A transfer can't take the pot below zero, and it lands in petty cash as an issue.
create or replace function public.on_donation_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
declare pot numeric;
begin
  select coalesce((select sum(amount) from cash_donations), 0) - coalesce((select sum(amount) from donation_transfers), 0) into pot;
  if new.amount > pot then
    raise exception 'Transfer of QAR % is more than the QAR % in the donations pot', new.amount, pot;
  end if;
  return new;
end $$;
create trigger donation_transfer_check before insert on public.donation_transfers
  for each row execute function public.on_donation_transfer();

create or replace function public.after_donation_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into petty_cash_issues (amount, issued_to, issued_by, issued_on, note, created_at, transfer_id)
  values (new.amount, null, new.transferred_by, new.transferred_on,
          'From donations pot' || case when new.note <> '' then ' · ' || new.note else '' end, new.created_at, new.id);
  return new;
end $$;
create trigger donation_transfer_to_float after insert on public.donation_transfers
  for each row execute function public.after_donation_transfer();

revoke execute on function public.on_donation_transfer() from public, anon, authenticated;
revoke execute on function public.after_donation_transfer() from public, anon, authenticated;

alter publication supabase_realtime add table public.cash_donations, public.donation_transfers;
