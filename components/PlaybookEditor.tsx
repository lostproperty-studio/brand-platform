'use client';
import { useState } from 'react';
import { TIERS, type Playbook, type Slot, type SlotNeed, type Tier } from '@/lib/playbook';

const NEED: [SlotNeed, string][] = [['fixed', 'Always'], ['optional', 'If the file has it'], ['none', '—']];

export function PlaybookEditor({ initial }: { initial: Playbook }) {
  const [p, setP] = useState(initial);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const setSlot = (id: string, patch: Partial<Slot>) => setP({ ...p, slots: p.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  async function save(body: unknown, done = 'Saved. Projects use it from their next check.') {
    setMsg('Saving…');
    const r = await fetch('/api/studio/playbook', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Couldn’t save.'); return; }
    setP(j); setMsg(done);
  }
  const addSlot = () => { const id = 'slot-' + Math.random().toString(36).slice(2, 7); setP({ ...p, slots: [...p.slots, { id, title: 'New section', match: '', need: { essentials: 'none', standard: 'optional', comprehensive: 'fixed' }, depth: { essentials: '', standard: '', comprehensive: '' } }] }); setOpen(id); };

  return (
    <div className="pb-ed">
      <section className="card pb-sec">
        <div><h2>House rules</h2><p className="mute">The constants. They go into every prompt that writes or checks guidelines.</p></div>
        <label className="sr" htmlFor="pb-house">House rules</label>
        <textarea id="pb-house" className="in pb-text" rows={18} value={p.house} onChange={(e) => setP({ ...p, house: e.target.value })} />
      </section>

      <section className="card pb-sec">
        <div><h2>What each tier contains</h2><p className="mute">For each section: whether a guide at that tier needs it, and how deep it goes. “Never drafted” sections are called out as missing instead of written.</p></div>
        <div className="pb-table" role="table" aria-label="Sections by tier">
          <div className="pb-row pb-headrow" role="row"><span role="columnheader">Section</span>{TIERS.map((t) => <span key={t.id} role="columnheader">{t.label}</span>)}<span /></div>
          {p.slots.map((s) => (
            <div key={s.id} className="pb-slot">
              <div className="pb-row" role="row">
                <span role="cell" className="pb-title">{s.title}{s.strategy ? <span className="tag">Never drafted</span> : s.needsArtwork ? <span className="tag">Needs artwork</span> : null}</span>
                {TIERS.map((t) => <span role="cell" key={t.id}><label className="sr" htmlFor={`n-${s.id}-${t.id}`}>{s.title} at {t.label}</label><select id={`n-${s.id}-${t.id}`} className="fm-sel" value={s.need[t.id]} onChange={(e) => setSlot(s.id, { need: { ...s.need, [t.id]: e.target.value as SlotNeed } })}>{NEED.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></span>)}
                <span role="cell"><button className="btn" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>{open === s.id ? 'Close' : 'Edit'}</button></span>
              </div>
              {open === s.id ? <div className="pb-detail">
                <label className="mute" htmlFor={`t-${s.id}`}>Name</label><input id={`t-${s.id}`} className="in" value={s.title} onChange={(e) => setSlot(s.id, { title: e.target.value })} />
                <label className="mute" htmlFor={`m-${s.id}`}>Words that identify it in a chapter or headline, comma separated</label><input id={`m-${s.id}`} className="in" value={s.match} onChange={(e) => setSlot(s.id, { match: e.target.value })} />
                {TIERS.map((t) => <div key={t.id}><label className="mute" htmlFor={`d-${s.id}-${t.id}`}>At {t.label}, it holds</label><input id={`d-${s.id}-${t.id}`} className="in" value={s.depth[t.id as Tier]} onChange={(e) => setSlot(s.id, { depth: { ...s.depth, [t.id]: e.target.value } })} /></div>)}
                <label className="row"><input type="checkbox" checked={!!s.strategy} onChange={(e) => setSlot(s.id, { strategy: e.target.checked })} /> Strategy: never drafted, only called out as missing</label>
                <label className="row"><input type="checkbox" checked={!!s.needsArtwork} onChange={(e) => setSlot(s.id, { needsArtwork: e.target.checked })} /> Needs the studio’s artwork or direction: called out, not written</label>
                <div className="row"><button className="btn" onClick={() => { setP({ ...p, slots: p.slots.filter((x) => x.id !== s.id) }); setOpen(null); }}>Remove section</button></div>
              </div> : null}
            </div>
          ))}
        </div>
        <div className="row"><button className="btn" onClick={addSlot}>+ Section</button></div>
      </section>

      <section className="card pb-sec">
        <div><h2>Rules for AI</h2><p className="mute">The fixed don’ts every kit, Claude skill and the portal’s Ask give AI, whatever the brand. People don’t see these in the guide. One per line.</p></div>
        <label className="sr" htmlFor="pb-ai">Rules for AI</label>
        <textarea id="pb-ai" className="in pb-text" rows={8} value={p.aiDonts.join('\n')} onChange={(e) => setP({ ...p, aiDonts: e.target.value.split('\n') })} />
      </section>

      <div className="pb-save">
        <button className="btn pink" onClick={() => save({ house: p.house, slots: p.slots, aiDonts: p.aiDonts })}>Save playbook</button>
        <button className="btn" onClick={() => { if (confirm('Go back to the default playbook? Your changes are lost.')) save({ reset: true }, 'Back to the default playbook.'); }}>Reset to default</button>
        <span className="mute" role="status">{msg}</span>
        {p.updatedAt ? <span className="mute">Last saved {new Date(p.updatedAt).toLocaleString('en-GB')}</span> : null}
      </div>
    </div>
  );
}
