'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';

const CATEGORIES = ['Meals', 'Travel', 'Office', 'Software', 'Other'];
const LIMIT = 5000;
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function Dashboard() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [fresh, setFresh] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/expenses', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to load');
      setRows((prev) => {
        if (prev.length) {
          const known = new Set(prev.map((x) => x.id));
          const added = d.filter((x) => !known.has(x.id)).map((x) => x.id);
          if (added.length) {
            setFresh(new Set(added));
            setTimeout(() => setFresh(new Set()), 4000);
          }
        }
        return d;
      });
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000); // new claims from Claude show up live
    return () => clearInterval(t);
  }, [load]);

  async function patch(id, body) {
    const r = await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    await load();
  }

  const totals = useMemo(() => {
    const t = { pending: 0, approved: 0, rejected: 0, flagged: 0, byCat: {} };
    for (const r of rows) {
      t[r.status] += r.amount;
      if (r.status === 'pending' && r.amount > LIMIT) t.flagged++;
      if (r.status !== 'rejected') t.byCat[r.category] = (t.byCat[r.category] || 0) + r.amount;
    }
    return t;
  }, [rows]);

  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const count = (s) => (s === 'all' ? rows.length : rows.filter((r) => r.status === s).length);
  const maxCat = Math.max(1, ...Object.values(totals.byCat));

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1><span className="logo">◆</span> ClaimIt</h1>
          <p className="sub">Expense claims filed from Claude · Demo workspace</p>
        </div>
        <a className="btn primary" href={`/api/export${filter === 'all' ? '' : `?status=${filter}`}`}>⬇ Export CSV</a>
      </header>

      {err && <div className="error">⚠ {err}</div>}

      <section className="cards">
        <Card label="Pending approval" value={inr(totals.pending)} hint={`${count('pending')} claims`} tone="amber" />
        <Card label="Approved" value={inr(totals.approved)} hint={`${count('approved')} claims`} tone="green" />
        <Card label="Over policy (pending)" value={totals.flagged} hint={`Claims above ${inr(LIMIT)}`} tone="red" />
        <div className="card">
          <div className="label">By category</div>
          {Object.keys(totals.byCat).length === 0 && <div className="hint">No claims yet</div>}
          {Object.entries(totals.byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
            <div key={c} className="cat">
              <span>{c}</span>
              <div className="bar"><i style={{ width: `${(v / maxCat) * 100}%` }} /></div>
              <b>{inr(v)}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="tabs">
          {['all', 'pending', 'approved', 'rejected'].map((s) => (
            <button key={s} className={filter === s ? 'tab on' : 'tab'} onClick={() => setFilter(s)}>
              {s[0].toUpperCase() + s.slice(1)} <span>{count(s)}</span>
            </button>
          ))}
          <span className="live">● Live</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th><th>Date</th><th>Employee</th><th>Merchant</th><th>Category</th>
              <th className="r">Amount</th><th>Status</th><th>Source</th><th></th>
            </tr>
          </thead>
          <tbody>
            {!loaded && <tr><td colSpan={9} className="empty">Loading…</td></tr>}
            {loaded && shown.length === 0 && <tr><td colSpan={9} className="empty">No claims here.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className={`${r.amount > LIMIT ? 'over' : ''} ${fresh.has(r.id) ? 'fresh' : ''}`}>
                <td className="muted">{r.id}</td>
                <td>{r.date}</td>
                <td>{r.employee}</td>
                <td>
                  {r.merchant}
                  {r.note && <div className="note">{r.note}</div>}
                </td>
                <td>{r.category}</td>
                <td className="r amt">
                  {inr(r.amount)}
                  {r.amount > LIMIT && <div className="flag">Over policy</div>}
                </td>
                <td>
                  <span className={`badge ${r.status}`}>{r.status}</span>
                  {r.updated_by && r.status !== 'pending' && <div className="note">by {r.updated_by}</div>}
                </td>
                <td className="muted">{r.source === 'Claude' ? '✦ Claude' : r.source}</td>
                <td className="actions">
                  {r.status !== 'approved' && <button className="btn sm ok" onClick={() => patch(r.id, { status: 'approved' })}>Approve</button>}
                  {r.status !== 'rejected' && <button className="btn sm no" onClick={() => patch(r.id, { status: 'rejected' })}>Reject</button>}
                  <button className="btn sm" onClick={() => setEditing(r)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="foot">
        Employees file claims by sending a receipt to Claude with the ClaimIt connector · MCP endpoint: <code>/api/mcp</code> · Policy: claims above {inr(LIMIT)} are flagged
      </footer>

      {editing && <EditModal row={editing} onClose={() => setEditing(null)} onSave={async (b) => { await patch(editing.id, b); setEditing(null); }} />}
    </main>
  );
}

function Card({ label, value, hint, tone }) {
  return (
    <div className={`card ${tone}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="hint">{hint}</div>
    </div>
  );
}

function EditModal({ row, onClose, onSave }) {
  const [f, setF] = useState({
    employee: row.employee, merchant: row.merchant, amount: row.amount,
    date: row.date, category: row.category, note: row.note || '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { await onSave({ ...f, amount: Number(f.amount) }); } catch (x) { setErr(x.message); setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Edit claim #{row.id}</h2>
        <label>Employee<input value={f.employee} onChange={set('employee')} required /></label>
        <label>Merchant<input value={f.merchant} onChange={set('merchant')} required /></label>
        <div className="row2">
          <label>Amount (₹)<input type="number" step="0.01" min="0.01" value={f.amount} onChange={set('amount')} required /></label>
          <label>Date<input type="date" value={f.date} onChange={set('date')} required /></label>
        </div>
        <label>Category
          <select value={f.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Note<textarea rows={2} value={f.note} onChange={set('note')} /></label>
        {Number(f.amount) > LIMIT && <div className="flag">This claim is above the {inr(LIMIT)} policy limit.</div>}
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
