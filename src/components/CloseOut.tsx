import { useState } from 'react';
import { useAuth } from '../auth';
import { queueUpload, upsert, type Row } from '../lib/store';
import { PhotoPicker, toast } from './ui';

const OUTCOMES = [
  ['attended', 'Attended'],
  ['missed', 'Missed'],
  ['rescheduled', 'Rescheduled'],
] as const;

export const OUTCOME_LABEL: Record<string, string> = { attended: 'Attended', missed: 'Missed', rescheduled: 'Rescheduled' };
export const OUTCOME_COLOR: Record<string, string> = { attended: 'var(--blue-dark)', missed: 'var(--red)', rescheduled: 'var(--amber)' };

export default function CloseOut({ item, day, onDone }: { item: Row; day: string; onDone: () => void }) {
  const { me } = useAuth();
  const [outcome, setOutcome] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const save = () => {
    if (!outcome) return;
    const photo_path = photo ? queueUpload('photos', photo, 'outcomes') : null;
    upsert('appointment_outcomes', { item_id: item.id, occurs_on: day, outcome, note: note.trim(), photo_path, closed_by: me.id, closed_at: new Date().toISOString() }, 'item_id,occurs_on');
    toast('Outcome saved');
    onDone();
  };
  return (
    <div className="panel">
      <strong style={{ fontSize: 15 }}>What happened?</strong>
      <div className="grid3">
        {OUTCOMES.map(([k, l]) => (
          <button key={k} className="pill" style={{ padding: 0 }} aria-pressed={outcome === k} onClick={() => setOutcome(k)}>{l}</button>
        ))}
      </div>
      <label className="field">
        <span>Notes · optional</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Vet happy with healing, recheck in 10 days" />
      </label>
      <PhotoPicker value={photo} onChange={setPhoto} label="Add photo" />
      <button className="btn" disabled={!outcome} onClick={save}>{outcome ? 'Save outcome' : 'Choose what happened'}</button>
      <button className="btn link" onClick={onDone}>Cancel</button>
    </div>
  );
}
