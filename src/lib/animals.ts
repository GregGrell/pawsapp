import type { Row } from './store';
import { addDays, today } from './time';

export const STATUS: Record<string, { label: string; bg: string; fg: string; inCare: boolean }> = {
  shelter: { label: 'In shelter', bg: '#E6F4EA', fg: '#166534', inCare: true },
  foster: { label: 'Foster', bg: 'var(--blue-wash)', fg: 'var(--blue-dark)', inCare: true },
  trial: { label: 'Trial adoption', bg: '#F3E8FF', fg: '#6B21A8', inCare: true },
  adopted: { label: 'Adopted', bg: '#FCE7F3', fg: '#9D174D', inCare: false },
  transferred: { label: 'Transferred', bg: 'var(--line-2)', fg: 'var(--ink-2)', inCare: false },
  returned: { label: 'Returned to owner', bg: 'var(--line-2)', fg: 'var(--ink-2)', inCare: false },
  deceased: { label: 'Deceased', bg: 'var(--line-2)', fg: 'var(--ink-2)', inCare: false },
  other: { label: 'Other', bg: 'var(--line-2)', fg: 'var(--ink-2)', inCare: false },
};
export const STATUS_ORDER = ['shelter', 'foster', 'trial', 'adopted', 'transferred', 'returned', 'deceased', 'other'];

export const KIND_LABEL: Record<string, string> = {
  vaccine: 'Vaccination',
  worming: 'Worming',
  flea_tick: 'Flea & tick',
  ratt: 'RATT',
  other: 'Other',
};

export const SEX_LABEL: Record<string, string> = { male: 'Male', female: 'Female', unknown: 'Unknown' };

/** Age in years (decimal) from a date of birth. */
export function ageYears(dob?: string | null): number | null {
  if (!dob) return null;
  const ms = new Date(today() + 'T00:00:00Z').getTime() - new Date(dob + 'T00:00:00Z').getTime();
  return ms / (365.25 * 86400_000);
}

export function ageText(a: Row) {
  const y = ageYears(a.dob);
  if (y == null) return '';
  const est = a.dob_estimated ? '~' : '';
  if (y < 1) {
    const m = Math.max(0, Math.floor(y * 12));
    return `${est}${m} month${m === 1 ? '' : 's'}`;
  }
  const yy = Math.floor(y);
  return `${est}${yy} yr${yy === 1 ? '' : 's'}`;
}

export function addDaysTo(day: string, n: number) {
  return addDays(day, n);
}

export type Due = { animal: Row; type: Row | null; name: string; kind: string; due: string; last: Row | null; overdue: boolean };

/**
 * What's due for each animal still in our care: for each treatment type, the most recent
 * entry decides the next due date. An entry with only a due date (no given date) counts as a reminder.
 */
export function careDue(animals: Row[], treatments: Row[], types: Row[], withinDays = 14): Due[] {
  const d = today();
  const limit = addDays(d, withinDays);
  const inCare = new Map(animals.filter((a) => STATUS[a.status]?.inCare ?? a.in_shelter).map((a) => [a.id, a]));
  const latest = new Map<string, Row>();
  for (const t of treatments) {
    if (!inCare.has(t.animal_id)) continue;
    const key = `${t.animal_id}|${t.type_id ?? t.name}`;
    const cur = latest.get(key);
    const tk = t.given_on ?? t.next_due_on;
    const ck = cur ? cur.given_on ?? cur.next_due_on : '';
    if (!cur || tk > ck || (tk === ck && t.created_at > cur.created_at)) latest.set(key, t);
  }
  const out: Due[] = [];
  for (const t of latest.values()) {
    if (!t.next_due_on || t.next_due_on > limit) continue;
    out.push({
      animal: inCare.get(t.animal_id)!,
      type: types.find((x) => x.id === t.type_id) ?? null,
      name: t.name,
      kind: t.kind,
      due: t.next_due_on,
      last: t.given_on ? t : null,
      overdue: t.next_due_on < d,
    });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.animal.name.localeCompare(b.animal.name));
}

/** Types that apply to a species. */
export function typesFor(types: Row[], species: string) {
  return types.filter((t) => t.active && (t.species === 'both' || t.species === species)).sort((a, b) => a.sort - b.sort);
}

/** A friendly label for a field name in the audit log. */
export const FIELD_LABEL: Record<string, string> = {
  name: 'Name', species: 'Species', breed: 'Breed', colour: 'Colour', sex: 'Sex', dob: 'Date of birth', dob_estimated: 'DOB estimated',
  neutered: 'Neutered', microchip: 'Microchip', microchip_on: 'Chip inserted', status: 'Status', status_since: 'Status since',
  intake_on: 'Intake date', notes: 'Notes', photo_path: 'Main photo', kennel_id: 'Kennel', given_on: 'Given', next_due_on: 'Next due',
  product: 'Product', batch: 'Batch', vet: 'Vet', result: 'Result', certificate_path: 'Certificate', title: 'Title', body: 'Details',
  noted_on: 'Date', file_path: 'File', with_name: 'With', with_contact: 'Contact', country: 'Country', from_on: 'From', note: 'Note',
  instructions: 'Dose / when', active: 'Active', started_on: 'Started', ended_on: 'Stopped', caption: 'Caption', kind: 'Type',
  reason: 'Reason', destination: 'Going to', returned_at: 'Returned', type_id: 'Treatment',
};

export const TABLE_LABEL: Record<string, string> = {
  animals: 'Profile', animal_locations: 'Location', treatments: 'Treatment', medical_notes: 'Medical note',
  animal_files: 'Photo / file', medications: 'Medication', animal_movements: 'Sign-out',
};
