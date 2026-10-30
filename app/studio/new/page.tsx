'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Review, type Item } from '@/components/Review';

type Step = { title: string; desc: string; state: 'waiting' | 'running' | 'done' };
const STEPS = ['Client', 'Figma file', 'Scan', 'Review', 'Typefaces', 'Create'];

// New project: client → Figma link → live scan → review → typefaces → build the kit and publish.
export default function NewProject() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [client, setClient] = useState('');
  const [line, setLine] = useState('');
  const [figma, setFigma] = useState('');
  const [project, setProject] = useState<{ id: string; slug: string } | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scan, setScan] = useState<{ status: string; steps: Step[]; meta: { type?: { font: string }[] }; error?: string; figma_key: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [fonts, setFonts] = useState<{ role: string; name: string; licence: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const figmaOk = /figma\.com\/(file|design|proto)\/[A-Za-z0-9]{10,}/.test(figma);

  async function startScan() {
    setError(''); setBusy('Creating the project…');
    const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client, line, figmaUrl: figma }) });
    const p = await r.json(); if (!r.ok) { setError(p.error || 'Couldn’t create the project.'); setBusy(''); return; }
    setProject(p); setStep(2); setBusy('');
    const s = await fetch(`/api/projects/${p.id}/scan`, { method: 'POST' }); const sj = await s.json();
    if (!s.ok) { setError(sj.error || 'The scan couldn’t start.'); return; }
    setScanId(sj.scanId);
  }

  useEffect(() => {
    if (!scanId) return;
    const tick = async () => {
      const r = await fetch(`/api/scans/${scanId}`); if (!r.ok) return;
      const j = await r.json(); setScan(j.scan);
      if (j.scan.status === 'done') {
        setItems(j.items);
        const detected = [...new Set((j.scan.meta?.type || []).map((t: { font: string }) => t.font.replace(/\s+\d+$/, '')))].slice(0, 3) as string[];
        setFonts(['display', 'body', 'caption'].map((role, k) => ({ role, name: detected[k] || '', licence: '' })));
        if (poll.current) clearInterval(poll.current); setStep(3);
      }
      if (j.scan.status === 'failed' && poll.current) clearInterval(poll.current);
    };
    tick(); poll.current = setInterval(tick, 1500);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [scanId]);

  async function create() {
    if (!project) return;
    setError('');
    setBusy('Saving typefaces…');
    await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand: { fonts: fonts.filter((f) => f.name).map((f) => ({ role: f.role, name: f.name, label: f.role === 'display' ? 'Headlines' : f.role === 'body' ? 'Body copy' : 'Captions', licence: f.licence })) } }) });
    setBusy('Building the kit and the repository…');
    const k = await fetch(`/api/projects/${project.id}/kit?direct=1`, { method: 'POST' });
    if (!k.ok) { setError('The kit build failed: ' + (await k.text()).slice(0, 200)); setBusy(''); return; }
    setBusy('Publishing the portal…');
    await fetch(`/api/projects/${project.id}/publish`, { method: 'POST' });
    router.push(`/studio/projects/${project.id}?created=1`);
  }

  return (
    <div className="wz">
      <nav className="wz-rail" aria-label="Setup steps">
        <a className="btn" href="/studio" style={{ alignSelf: 'flex-start', marginBottom: 10 }}>← Projects</a>
        {STEPS.map((s, i) => <div key={s} className={'wz-step' + (i === step ? ' on' : i < step ? ' done' : '')}><span className="wz-n">{i + 1}</span>{s}</div>)}
      </nav>
      <div className={'wz-body' + (step === 3 ? ' wide' : '')}>
        <p className="mute">New project · step {step + 1} of {STEPS.length}</p>
        {step === 0 ? <>
          <h1>Who is the client?</h1>
          <label className="mute" htmlFor="c">Client name</label><input id="c" className="in" style={{ height: 38, fontSize: 18 }} value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Tileyard" />
          <label className="mute" htmlFor="l">One line about the brand</label><input id="l" className="in" value={line} onChange={(e) => setLine(e.target.value)} />
        </> : null}
        {step === 1 ? <>
          <h1>Link the Figma file</h1>
          <p className="mute">Paste the link to the guidelines page. I’ll read its text, colours, type and asset layers, then show you everything I find.</p>
          <label className="mute" htmlFor="f">Figma link (include the page’s node-id)</label><input id="f" className="in" value={figma} onChange={(e) => setFigma(e.target.value)} placeholder="https://www.figma.com/design/…?node-id=…" />
          {figma && !figmaOk ? <p className="mute">That doesn’t look like a Figma file link yet.</p> : null}
        </> : null}
        {step === 2 ? <>
          <h1>Reading the Figma file</h1>
          <div className="card"><div className="steps">{(scan?.steps || ([] as Step[])).map((s) => <div key={s.title} className="step"><span className={'dot ' + s.state} /><div><p style={{ margin: 0 }}>{s.title}</p><p className="mute" style={{ margin: 0 }}>{s.desc}</p></div></div>)}{!scan ? <p className="mute">Starting…</p> : null}</div></div>
          {scan?.status === 'failed' ? <p>The scan failed: {scan.error}</p> : null}
        </> : null}
        {step === 3 && scan ? <>
          <h1>Check what I found</h1>
          <p className="mute" style={{ maxWidth: 720 }}>Accept what’s right, correct what isn’t, answer the questions. Answers save as you go; anything left open uses the suggested option and is listed in the changelog.</p>
          <Review initial={items} figmaKey={scan.figma_key} />
        </> : null}
        {step === 4 ? <>
          <h1>Typefaces</h1>
          <p className="mute">Figma can’t hand over font files. Confirm the names, and say what the licence allows; the kit only ships files the licence covers.</p>
          {fonts.map((f, k) => <div key={f.role} className="card" style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: 8, alignItems: 'center' }}><span className="mute">{f.role}</span><input className="in" aria-label={`${f.role} typeface`} value={f.name} onChange={(e) => setFonts((l) => l.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} /><input className="in" aria-label={`${f.role} licence`} placeholder="Licence, e.g. web + desktop, 5 users" value={f.licence} onChange={(e) => setFonts((l) => l.map((x, j) => (j === k ? { ...x, licence: e.target.value } : x)))} /></div>)}
        </> : null}
        {step === 5 ? <>
          <h1>Build the first version</h1>
          <div className="card"><p style={{ margin: 0 }}>{client}</p><p className="mute" style={{ margin: 0 }}>{items.filter((i) => i.status !== 'open').length} of {items.length} review items answered. The rest use the suggested option.</p></div>
          <p className="mute">This creates the kit repository, exports the assets, writes the tokens, guidelines and templates, and publishes the portal.</p>
        </> : null}
        {busy ? <p className="mute">{busy}</p> : null}
        {error ? <p>{error}</p> : null}
        <div className="wz-nav">
          <button className="btn" disabled={!!busy || step === 2 || step === 3} onClick={() => (step === 0 ? router.push('/studio') : setStep(step === 3 ? 3 : step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</button>
          {step === 0 ? <button className="btn solid" disabled={!client.trim()} onClick={() => setStep(1)}>Continue</button> : null}
          {step === 1 ? <button className="btn solid" disabled={!figmaOk || !!busy} onClick={startScan}>Scan the file</button> : null}
          {step === 3 || step === 4 ? <button className="btn solid" onClick={() => setStep(step + 1)}>Continue</button> : null}
          {step === 5 ? <button className="btn pink" disabled={!!busy} onClick={create}>Create project</button> : null}
        </div>
      </div>
    </div>
  );
}
