-- Calendar entries can have several team members and named external people (e.g. meetings).
alter table public.calendar_items add column if not exists attendees uuid[] not null default '{}';
alter table public.calendar_items add column if not exists external_people text not null default '';
update public.calendar_items set attendees = array[assignee] where assignee is not null and attendees = '{}';
