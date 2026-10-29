import { useState } from 'react';
import { useAuth } from '../auth';
import { Empty, Icon, Page, PhotoPicker, StoredImage, toast } from '../components/ui';
import { money, useProfiles, useTable } from '../lib/hooks';
import { insert, queueUpload } from '../lib/store';
import { supabase } from '../lib/supabase';
import { addDays, shortDate, today } from '../lib/time';

export default function PettyCash() {
  const { isMgmt } = useAuth();
  const issues = useTable('petty_cash_issues');
  const spends = useTable('petty_cash_spends');
  const issued = issues.reduce((n, i) => n + Number(i.amount), 0);
  const spent = spends.reduce((n, s) => n + Number(s.amount), 0);
  const available = issued - spent;

  return (
    <Page title="Petty cash" sub="Running float">
      <section className="balance" aria-label="Balance">
        <div>
          <span className="h" style={{ color: '#fff' }}>Available</span>
          <div className="big">QAR {money(available)}</div>
        </div>
        <div className="grid2">
          <div className="sm"><span style={{ fontSize: 13 }}>Issued</span><b style={{ fontSize: 18 }}>{money(issued)}</b></div>
          <div className="sm"><span style={{ fontSize: 13 }}>Spent</span><b style={{ fontSize: 18 }}>{money(spent)}</b></div>
        </div>
      </section>

      {isMgmt && <IssueForm />}
      <SpendForm available={available} />
      {isMgmt && <Export />}
      <Transactions />
    </Page>
  );
}

function IssueForm() {
  const { me } = useAuth();
  const { list } = useProfiles();
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const v = parseFloat(amount);
  return (
    <section className="card">
      <h2 className="h">Issue petty cash</h2>
      <div className="grid2">
        <label className="field"><span>Amount (QAR)</span><input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label className="field">
          <span>Issued to</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Shelter float</option>
            {list.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Note · optional</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button
        className="btn dark"
        disabled={!(v > 0)}
        onClick={() => {
          insert('petty_cash_issues', { amount: v, issued_to: to || null, issued_by: me.id, issued_on: today(), note: note.trim(), created_at: new Date().toISOString() });
          setAmount('');
          setNote('');
          toast(`QAR ${money(v)} recorded`);
        }}
      >
        Record issue
      </button>
    </section>
  );
}

function SpendForm({ available }: { available: number }) {
  const { me } = useAuth();
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [receipt, setReceipt] = useState<Blob | null>(null);
  const [noReceipt, setNoReceipt] = useState(false);
  const [reason, setReason] = useState('');
  const v = parseFloat(amount);
  const ok = v > 0 && desc.trim() && (receipt || (noReceipt && reason.trim()));
  let label = 'Log spend';
  if (!(v > 0) || !desc.trim()) label = 'Enter amount and what it was for';
  else if (!receipt && !noReceipt) label = 'Add a receipt or press NO RECEIPT';
  else if (noReceipt && !reason.trim()) label = 'Give a reason for no receipt';
  else label = `Log spend · QAR ${money(v)}`;

  const submit = () => {
    const receipt_path = receipt ? queueUpload('photos', receipt, 'receipts') : null;
    insert('petty_cash_spends', {
      amount: v, description: desc.trim(), receipt_path, no_receipt_reason: noReceipt ? reason.trim() : null,
      spent_by: me.id, spent_on: today(), created_at: new Date().toISOString(),
    });
    setAmount(''); setDesc(''); setReceipt(null); setNoReceipt(false); setReason('');
    toast('Spend logged');
  };

  return (
    <section className="card">
      <h2 className="h">Log money spent</h2>
      <label className="field"><span>Amount (QAR)</span><input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
      <label className="field"><span>What was it for?</span><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Cat litter, 4 bags" /></label>
      <div className="field">
        <span>Receipt · required</span>
        {!noReceipt && !receipt && (
          <div className="grid2">
            <PhotoPicker value={receipt} onChange={setReceipt} label="Photo of receipt" required />
            <button type="button" className="btn" style={{ minHeight: 56, background: '#fff', color: 'var(--amber)', border: '2px solid #B45309', fontWeight: 800, letterSpacing: '0.04em' }} onClick={() => setNoReceipt(true)}>NO RECEIPT</button>
          </div>
        )}
        {receipt && <PhotoPicker value={receipt} onChange={setReceipt} required />}
        {noReceipt && (
          <div className="banner amber" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 12 }}>
            <div className="head">
              <strong className="warn" style={{ letterSpacing: '0.04em' }}>NO RECEIPT</strong>
              <button className="btn link sm" style={{ color: 'var(--amber)', textDecoration: 'underline' }} onClick={() => { setNoReceipt(false); setReason(''); }}>Add receipt instead</button>
            </div>
            <label className="field"><span>Reason · required</span><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Parking machine didn't print a ticket" /></label>
          </div>
        )}
      </div>
      {v > available && <span className="bad">This is more than the cash available. Management will see it in the record.</span>}
      <button className="btn" disabled={!ok} onClick={submit}>{label}</button>
    </section>
  );
}

function Transactions() {
  const { name } = useProfiles();
  const issues = useTable('petty_cash_issues');
  const spends = useTable('petty_cash_spends');
  const rows = [
    ...issues.map((i) => ({ k: 'i', id: i.id, at: i.created_at, day: i.issued_on, title: 'Cash issued', who: `${name(i.issued_by)}${i.issued_to ? ` to ${name(i.issued_to)}` : ' to shelter float'}`, amount: Number(i.amount), r: i })),
    ...spends.map((s) => ({ k: 's', id: s.id, at: s.created_at, day: s.spent_on, title: s.description, who: name(s.spent_by), amount: -Number(s.amount), r: s })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card tight">
      <h2 className="h" style={{ paddingBottom: 6 }}>Transactions</h2>
      {!rows.length && <Empty>Nothing recorded yet.</Empty>}
      {rows.slice(0, 60).map((x) => (
        <div key={x.id} className="row" style={{ flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <div className="grow">
              <span className="t15">{x.title}</span>
              <span className="t13">{shortDate(x.day)} · {x.who}</span>
              {x.k === 's' && (
                x.r.receipt_path
                  ? <button className="chip" style={{ background: 'var(--blue-wash)', color: 'var(--blue-dark)', border: 0, cursor: 'pointer' }} onClick={() => setOpen(open === x.id ? null : x.id)}>Receipt {open === x.id ? '▴' : '▾'}</button>
                  : <span className="chip" style={{ background: 'var(--amber-tint)', color: 'var(--amber)' }}>NO RECEIPT</span>
              )}
              {x.k === 's' && !x.r.receipt_path && <span className="t13" style={{ fontStyle: 'italic', color: 'var(--ink-2)' }}>Reason: {x.r.no_receipt_reason}</span>}
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', color: x.amount > 0 ? 'var(--blue)' : 'var(--ink)' }}>{x.amount > 0 ? '+' : '−'} {money(Math.abs(x.amount))}</span>
          </div>
          {open === x.id && <StoredImage bucket="photos" path={x.r.receipt_path} />}
        </div>
      ))}
    </section>
  );
}

function Export() {
  const { name } = useProfiles();
  const issues = useTable('petty_cash_issues');
  const spends = useTable('petty_cash_spends');
  const d = today();
  const [from, setFrom] = useState(d.slice(0, 8) + '01');
  const [to, setTo] = useState(d);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [['Date', 'Type', 'Description', 'Amount (QAR)', 'Person', 'Receipt file', 'No-receipt reason'].map(esc).join(',')];
      const inRange = (day: string) => day >= from && day <= to;
      issues.filter((i) => inRange(i.issued_on)).forEach((i) =>
        lines.push([i.issued_on, 'Issued', i.note || 'Cash issued', money(i.amount), i.issued_to ? name(i.issued_to) : 'Shelter float', '', ''].map(esc).join(',')),
      );
      let n = 0;
      for (const s of spends.filter((x) => inRange(x.spent_on)).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        let file = '';
        if (s.receipt_path) {
          n += 1;
          file = `receipts/${s.spent_on}_${String(n).padStart(3, '0')}.${s.receipt_path.split('.').pop()}`;
          const { data } = await supabase.storage.from('photos').download(s.receipt_path);
          if (data) zip.file(file, data);
          else file += ' (missing)';
        }
        lines.push([s.spent_on, 'Spent', s.description, `-${money(s.amount)}`, name(s.spent_by), file, s.no_receipt_reason ?? ''].map(esc).join(','));
      }
      zip.file('petty-cash.csv', '﻿' + lines.join('\r\n'));
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `petty-cash_${from}_to_${to}.zip`;
      a.click();
      toast('Export downloaded');
    } catch (e: any) {
      toast(`Export failed: ${e?.message ?? e}`);
    }
    setBusy(false);
  };

  return (
    <section className="card">
      <h2 className="h">Export</h2>
      <span className="t14">A .zip with a CSV of every issue and spend, plus a copy of each receipt. No-receipt spends include the reason given.</span>
      <div className="grid2">
        <label className="field"><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>To</span><input type="date" value={to} max={addDays(d, 0)} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <button className="btn" disabled={busy || !navigator.onLine} onClick={run}>
        <Icon name="download" size={18} color="#fff" width={2.2} /> {busy ? 'Preparing…' : navigator.onLine ? 'Download CSV + receipts' : 'Needs a connection'}
      </button>
    </section>
  );
}
