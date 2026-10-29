import { useState } from 'react';
import { useAuth } from '../auth';
import { itemsOn, useProfiles, useTable } from '../lib/hooks';
import { queueUpload, upsert, type Row } from '../lib/store';
import { timeOf, today } from '../lib/time';
import { Empty, Icon, PhotoPicker, StoredImage, toast } from './ui';

export function useTasksOn(day: string) {
  const items = useTable('calendar_items');
  const comps = useTable('task_completions');
  const tasks = itemsOn(items, day).filter((i) => i.kind === 'task');
  return tasks.map((t) => ({ task: t, comp: comps.find((c) => c.item_id === t.id && c.occurs_on === day) as Row | undefined }));
}

const REPEAT: Record<string, string> = { none: 'One-off', daily: 'Daily', weekly: 'Weekly' };

export default function TaskList({ day = today(), limit }: { day?: string; limit?: number }) {
  const { me } = useAuth();
  const { name } = useProfiles();
  const list = useTasksOn(day);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const shown = limit ? list.slice(0, limit) : list;

  if (!list.length) return <Empty>No tasks for this day.</Empty>;

  const claim = (t: Row) => upsert('task_completions', { item_id: t.id, occurs_on: day, status: 'claimed', claimed_by: me.id }, 'item_id,occurs_on');
  const finish = (t: Row, c?: Row) => {
    const photo_path = photo ? queueUpload('photos', photo, 'tasks') : null;
    upsert('task_completions', { item_id: t.id, occurs_on: day, status: 'done', claimed_by: c?.claimed_by ?? me.id, done_by: me.id, done_at: new Date().toISOString(), photo_path }, 'item_id,occurs_on');
    setFinishing(null);
    setPhoto(null);
    toast('Task done');
  };

  return (
    <>
      {shown.map(({ task: t, comp: c }) => {
        const done = c?.status === 'done';
        const claimed = c?.status === 'claimed';
        const mine = claimed && c?.claimed_by === me.id;
        return (
          <div key={t.id} className="row" style={{ flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
              <div className="grow">
                <span className="t15">{t.title}</span>
                <span className="t13">
                  {REPEAT[t.repeat]}
                  {t.at_time ? ` · ${t.at_time.slice(0, 5)}` : ''}
                  {t.assignee ? ` · for ${name(t.assignee)}` : ''}
                </span>
                {done && <span className="ok">Done by {name(c!.done_by)} · {timeOf(c!.done_at)}{c!.photo_path ? ' · photo' : ''}</span>}
                {claimed && !mine && <span className="warn">{name(c!.claimed_by)} has this</span>}
              </div>
              {!c && <button className="btn outline sm" onClick={() => claim(t)}>I've got it</button>}
              {claimed && finishing !== t.id && (
                <button className="btn sm" onClick={() => setFinishing(t.id)}>
                  <Icon name="check" size={16} color="#fff" width={2.4} /> Done
                </button>
              )}
              {done && (
                <span role="img" aria-label="Done" style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--blue-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={18} color="var(--blue)" width={2.4} />
                </span>
              )}
            </div>
            {finishing === t.id && (
              <div className="panel" style={{ width: '100%' }}>
                <PhotoPicker value={photo} onChange={setPhoto} label="Photo of the finished job" />
                <button className="btn" onClick={() => finish(t, c)}>Mark done</button>
                <button className="btn link" onClick={() => { setFinishing(null); setPhoto(null); }}>Cancel</button>
              </div>
            )}
            {done && c!.photo_path && <StoredImage bucket="photos" path={c!.photo_path} />}
          </div>
        );
      })}
    </>
  );
}
