import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { Empty, Page, toast } from '../components/ui';
import { useTable } from '../lib/hooks';
import { build, readFiles, write, type Built, type Parsed } from '../lib/slimport';
import { refresh } from '../lib/store';
import { ShelterluvPanel } from './Kennels';

const LABEL: Record<string, string> = {
  animals: 'Animals', people: 'People', intakes: 'Intakes', outcomes: 'Outcomes', foster_placements: 'Foster placements',
  foster_returns: 'Foster returns', vaccines: 'Vaccines', tests: 'Diagnostic tests', treatments: 'Treatments',
  procedures: 'Procedures / surgeries', exams: 'Physical exams', diagnoses: 'Diagnoses', unknown: 'Not recognised',
};

/** Management: load Shelterluv custom-report exports (Excel) into PAWSapp. Safe to run again with newer exports. */
export default function SlImport() {
  const { me, isMgmt } = useAuth();
  const types = useTable('treatment_types');
  const [parsed, setParsed] = useState<Parsed[] | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  // Reports can be handed over straight from a Shelterluv tab (window.postMessage), so the weekly top-up
  // needs no downloads. Only messages from Shelterluv itself are accepted, and only for management.
  const pickRef = useRef<(f: File[]) => void>(() => {});
  useEffect(() => {
    if (!isMgmt) return;
    window.name = 'paws-sl-import';
    const on = (e: MessageEvent) => {
      if (!/^https:\/\/(new|www)\.shelterluv\.com$/.test(e.origin) || e.data?.type !== 'paws-sl-files') return;
      const files = (e.data.files ?? []).filter((f: any) => f?.blob instanceof Blob).map((f: any) => new File([f.blob], String(f.name || 'report.xlsx')));
      if (files.length) pickRef.current(files);
      (e.source as Window | null)?.postMessage({ type: 'paws-sl-received', count: files.length }, e.origin);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [isMgmt]);

  if (!isMgmt) return <Page title="Import from Shelterluv" back="More"><Empty>Management only.</Empty></Page>;

  const pick = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setErr(''); setDone(false); setLog([]); setBusy('Reading files…');
    try {
      const p = await readFiles([...files]);
      setParsed(p);
      setBuilt(build(p, types.map((t) => ({ id: t.id, name: t.name, kind: t.kind, interval_days: t.interval_days }))));
    } catch (e: any) {
      setErr(String(e.message ?? e));
    }
    setBusy('');
  };

  pickRef.current = (f) => { pick(f); };
  const run = async () => {
    if (!built) return;
    setErr(''); setLog([]);
    try {
      await write(built, me.id, (m) => { setBusy(m); setLog((l) => (l.at(-1)?.split(':')[0] === m.split(':')[0] ? [...l.slice(0, -1), m] : [...l, m])); });
      await refresh();
      setDone(true);
      toast('Shelterluv import finished');
    } catch (e: any) {
      setErr(String(e.message ?? e));
    }
    setBusy('');
  };

  const byReport = parsed ? Object.entries(parsed.reduce<Record<string, number>>((m, p) => ({ ...m, [p.report]: (m[p.report] ?? 0) + p.rows.length }), {})) : [];

  return (
    <Page title="Import from Shelterluv" sub="Animals, people, history and medical records" back="More">
      <ShelterluvPanel />
      <h2 className="h" style={{ padding: '8px 4px 0' }}>Import from export files</h2>
      <span className="t13" style={{ padding: '0 4px' }}>The API doesn't include people, tests, treatments, medication or medical notes. For those, use Shelterluv's custom-report exports here.</span>
      <section className="card">
        <span className="t14">Choose all the Shelterluv export files (.xlsx) at once. Nothing is saved until you press <b>Import</b>.</span>
        <span className="t13">You can run this again later with newer exports. Records already imported are recognised by their Shelterluv ID and left as they are, so edits made in PAWSapp are never overwritten.</span>
        <input type="file" multiple accept=".xlsx,.xls" onChange={(e) => pick(e.target.files)} disabled={!!busy} />
      </section>

      {parsed && (
        <section className="card tight">
          <h2 className="h" style={{ paddingBottom: 6 }}>Files read · {parsed.length}</h2>
          {byReport.map(([k, n]) => (
            <div key={k} className="row"><span className="t15 grow" style={k === 'unknown' ? { color: 'var(--red)' } : undefined}>{LABEL[k] ?? k}</span><span className="t15">{n.toLocaleString()} rows</span></div>
          ))}
        </section>
      )}

      {built && (
        <section className="card tight">
          <h2 className="h" style={{ paddingBottom: 6 }}>What will be created</h2>
          {[
            ['Animal records', built.animals.length],
            ['People (adopters, fosters, contacts)', built.contacts.length],
            ['Location history entries', built.locations.length],
            ['Vaccinations, tests, worming, flea & tick', built.treatments.length],
            ['Past medication courses', built.medications.length],
            ['Medical history notes', built.notes.length],
            ['Weights', built.weights.length],
            ['Original Shelterluv rows kept', built.raw.length],
          ].map(([l, n]) => <div key={l as string} className="row"><span className="t15 grow">{l}</span><span className="t15">{(n as number).toLocaleString()}</span></div>)}
          <div className="row">
            <span className="t13 grow">Where animals are now (from Shelterluv)</span>
            <span className="t13">{Object.entries(built.animals.reduce<Record<string, number>>((m, a) => ({ ...m, [a.final_status]: (m[a.final_status] ?? 0) + 1 }), {})).map(([k, n]) => `${k} ${n}`).join(' · ')}</span>
          </div>
        </section>
      )}

      {built && !done && (
        <button className="btn" disabled={!!busy} onClick={run}>{busy || 'Import'}</button>
      )}
      {log.length > 0 && (
        <section className="card tight">
          {log.map((l, i) => <span key={i} className="t13">{l}</span>)}
        </section>
      )}
      {err && <section className="card"><span className="bad">{err}</span><span className="t13">Nothing already saved is lost. Fix the problem and run the import again; it picks up where it left off.</span></section>}
      {done && <section className="card"><span className="ok">Import finished. Open Animal records to see everything.</span></section>}
    </Page>
  );
}
