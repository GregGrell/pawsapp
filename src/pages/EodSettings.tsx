import { useState } from 'react';
import { useAuth } from '../auth';
import { Empty, Icon, Page } from '../components/ui';
import { useTable } from '../lib/hooks';
import { insert, update } from '../lib/store';

export default function EodSettings() {
  const { isMgmt } = useAuth();
  const items = useTable('eod_checklist_items').filter((i) => i.active).sort((a, b) => a.sort - b.sort);
  const settings = useTable('app_settings');
  const alertAt = settings.find((s) => s.key === 'eod_alert_time')?.value ?? '20:00';
  const [label, setLabel] = useState('');
  if (!isMgmt) return <Page title="Checklist" back="More"><Empty>Only management can edit the checklist.</Empty></Page>;
  return (
    <Page title="End-of-day checklist" back="More">
      <section className="card tight">
        <h2 className="h" style={{ paddingBottom: 6 }}>Checks staff tick each evening</h2>
        {items.map((it, i) => (
          <div key={it.id} className="row" style={{ alignItems: 'center' }}>
            <input className="input" defaultValue={it.label} aria-label={`Check ${i + 1}`} onBlur={(e) => e.target.value.trim() && e.target.value !== it.label && update('eod_checklist_items', { id: it.id }, { label: e.target.value.trim() })} />
            <button className="btn link sm" aria-label="Remove" onClick={() => update('eod_checklist_items', { id: it.id }, { active: false })}><Icon name="trash" size={18} color="var(--red)" /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
          <input className="input" placeholder="Add a check" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn" disabled={!label.trim()} onClick={() => { insert('eod_checklist_items', { label: label.trim(), sort: items.length + 1, active: true }); setLabel(''); }}>Add</button>
        </div>
      </section>
      <section className="card">
        <label className="field">
          <span>Alert management if not signed off by</span>
          <input type="time" defaultValue={alertAt} onBlur={(e) => e.target.value && update('app_settings', { key: 'eod_alert_time' }, { value: e.target.value })} />
        </label>
      </section>
    </Page>
  );
}
