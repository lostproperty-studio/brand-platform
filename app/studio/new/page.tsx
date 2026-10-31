'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Review, type Item } from '@/components/Review';
import { FontManager } from '@/components/FontManager';
import { ProgressBar, useProgress, type Phase } from '@/components/Progress';
import { TierCards } from '@/components/TierPicker';
import type { Tier } from '@/lib/playbook';

type Step = { title: string; desc: string; state: 'waiting' | 'running' | 'done' };
const STEPS = ['Client', 'Figma file', 'Scan', 'Review', 'Typefaces', 'Create'];
// Typical durations (seconds) of the scan steps, and of building the project at the end
const SCAN_PHASES: Phase[] = [{ label: 'Opening the Figma file', expected: 6 }, { label: 'Reading the text', expected: 2 }, { label: 'Reading colours and type', expected: 2 }, { label: 'Exporting asset previews', expected: 20 }, { label: 'Claude is drafting rules and questions', expected: 140 }];
const CREATE_PHASES: Phase[] = [{ label: 'Building the kit and the repository', expected: 45 }, { label: 'Building the online guidelines from Figma', expected: 75 }];

// New project: client → Figma link → live scan → review (can be skipped) → typefaces → build the kit.
// Publishing to the client is a separate step on the project page, after the fonts are licensed.
export default function NewProject() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [client, setClient] = useState('');
  const [line, setLine] = useState('');
  const [figma, setFigma] = useState('');
  const [tier, setTier] = useState<Tier | undefined>();
  const [project, setProject] = useState<{ id: string; slug: string; figma: string } | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scan, setScan] = useState<{ status: string; steps: Step[]; meta: { type?: { font: string }[] }; error?: string; figma_key: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [detected, setDetected] = useState<string[]>([]);
  const [skippedReview, setSkippedReview] = useState(false);
  const [busy, setBusy] = useState('');
  const [createPhase, setCreatePhase] = useState(-1);
  const [error, setError] = useState('');
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const scanSteps = scan?.steps || [];
  const scanCurrent = scan ? Math.max(scanSteps.findIndex((x) => x.state === 'running'), scanSteps.some((x) => x.state === 'done') ? scanSteps.filter((x) => x.state === 'done').length : 0) : -1;
  const scanProgress = useProgress(SCAN_PHASES, scanId ? Math.min(scanCurrent, SCAN_PHASES.length - 1) : -1, scan?.status === 'done');
  const createProgress = useProgress(CREATE_PHASES, Math.min(createPhase, 1), createPhase >= 2);
  const figmaOk = /figma\.com\/(file|design|proto)\/[A-Za-z0-9]{10,}/.test(figma);

  async function startScan() {
    setError(''); setScan(null); setScanId(null);
    // Create the project once; going back and scanning again reuses it instead of making a duplicate.
    let p = project;
    if (!p || p.figma !== figma) {
      if (p) await fetch(`/api/projects/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ figmaUrl: figma }) });
      else {
        setBusy('Creating the project…');
        const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client, line, figmaUrl: figma, tier }) });
        const j = await r.json(); if (!r.ok) { setError(j.error || 'Couldn’t create the project.'); setBusy(''); return; }
        p = { id: j.id, slug: j.slug, figma };
      }
      setProject({ ...p, figma });
    }
    setStep(2); setBusy('');
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
        // Family names from the scan, without weight numbers or "Trial"/"Test" (the trial state lives on the files)
        setDetected([...new Set((j.scan.meta?.type || []).map((t: { font: string }) => t.font.replace(/\s+\d+$/, '').replace(/\s*\b(trial|test)\b\s*/gi, ' ').replace(/\s+/g, ' ').trim()))].filter(Boolean).slice(0, 3) as string[]);
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
    setBusy('Building the kit and the repository…'); setCreatePhase(0);
    const k = await fetch(`/api/projects/${project.id}/kit?direct=1`, { method: 'POST' });
    if (!k.ok) { setError('The kit build failed: ' + (await k.text()).slice(0, 200)); setBusy(''); setCreatePhase(-1); return; }
    setBusy('Building the online guidelines from Figma…'); setCreatePhase(1);
    const g = await fetch(`/api/projects/${project.id}/guide`, { method: 'POST' });
    if (!g.ok) { setError('The kit is built, but the guidelines didn’t build: ' + ((await g.json().catch(() => ({}))).error || g.status) + '. You can retry from the project’s Guidelines tab.'); setBusy(''); setCreatePhase(-1); return; }
    setCreatePhase(2);
    router.push(`/studio/projects/${project.id}?created=1${skippedReview ? '&skipped=1' : ''}`);
  }

  return (
    <div className="wz">
      <nav className="wz-rail" aria-label="Setup steps">
        <div className="bp-mark" style={{ padding: '4px 10px 12px' }}><img src="/lp-logo.svg" alt="Lost Property" style={{ width: 40 }} /><span className="bp-sub">Brand Platform</span></div>
        <a className="btn" href="/studio" style={{ alignSelf: 'flex-start', marginBottom: 10 }}>← Projects</a>
        {STEPS.map((s, i) => <div key={s} className={'wz-step' + (i === step ? ' on' : i < step ? ' done' : '')}><span className="wz-n">{i + 1}</span>{s}</div>)}
      </nav>
      <div className={'wz-body' + (step === 3 ? ' wide' : '')}>
        <p className="mute">New project · step {step + 1} of {STEPS.length}</p>
        {step === 0 ? <>
          <h1>Who is the client?</h1>
          <label className="mute" htmlFor="c">Client name</label><input id="c" className="in" style={{ height: 38, fontSize: 18 }} value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Tileyard" />
          <label className="mute" htmlFor="l">One line about the brand</label><input id="l" className="in" value={line} onChange={(e) => setLine(e.target.value)} />
          <p className="mute" style={{ margin: '12px 0 0' }}>Guide tier: how deep the guidelines go. You can change it later.</p>
          <TierCards value={tier} onChange={setTier} />
        </> : null}
        {step === 1 ? <>
          <h1>Link the Figma file</h1>
          <p className="mute">Paste the link to the guidelines page. I’ll read its text, colours, type and asset layers, then show you everything I find.</p>
          <label className="mute" htmlFor="f">Figma link (include the page’s node-id)</label><input id="f" className="in" value={figma} onChange={(e) => setFigma(e.target.value)} placeholder="https://www.figma.com/design/…?node-id=…" />
          {figma && !figmaOk ? <p className="mute">That doesn’t look like a Figma file link yet.</p> : null}
        </> : null}
        {step === 2 ? <>
          <h1>Reading the Figma file</h1>
          <ProgressBar {...scanProgress} label={scan?.status === 'done' ? 'Done' : scanProgress.label} failed={scan?.status === 'failed'} />
          <div className="card"><div className="steps">{(scan?.steps || ([] as Step[])).map((s) => <div key={s.title} className="step"><span className={'dot ' + s.state} /><div><p style={{ margin: 0 }}>{s.title}</p><p className="mute" style={{ margin: 0 }}>{s.desc}</p></div></div>)}{!scan ? <p className="mute">Starting…</p> : null}</div></div>
          {scan?.status === 'failed' ? <><p>The scan failed: {scan.error}</p><div className="row"><button className="btn solid" onClick={startScan}>Try the scan again</button><span className="mute">Uses the same project; nothing is duplicated.</span></div></> : null}
        </> : null}
        {step === 3 && scan ? <>
          <h1>A few questions</h1>
          <p className="mute" style={{ maxWidth: 640 }}>A few quick questions, most important first. Short on time? <strong style={{ color: '#000' }}>Skip for now</strong> and come back to them from the project’s Review tab.</p>
          <Review initial={items} figmaKey={scan.figma_key} scanId={scanId!} />
        </> : null}
        {step === 4 && project ? <>
          <h1>Typefaces</h1>
          <p className="mute">Figma can’t hand over font files, so add them here. Trial files are fine for now: they’re used for previews, never put in the kit, and you’ll be reminded to swap in the licensed files before publishing to the client.</p>
          <FontManager projectId={project.id} detected={detected} />
        </> : null}
        {step === 5 ? <>
          <h1>Build the first version</h1>
          <div className="card"><p style={{ margin: 0 }}>{client}</p><p className="mute" style={{ margin: 0 }}>{skippedReview ? 'Review skipped for now. ' : ''}{items.filter((i) => i.status !== 'open').length} of {items.length} review items answered. Open items use the suggested option until you answer them in the project’s Review tab.</p></div>
          <p className="mute">This creates the kit repository, exports the assets, writes the tokens, guidelines and templates, and builds the client’s online guidelines from the Figma page. The client portal stays in draft until you publish it from the project page.</p>
        </> : null}
        {step === 5 && createPhase >= 0 ? <ProgressBar {...createProgress} label={createProgress.label || 'Finishing'} /> : busy ? <p className="mute">{busy}</p> : null}
        {error ? <p>{error}</p> : null}
        <div className="wz-nav">
          <button className="btn" disabled={!!busy || (step === 2 && scan?.status !== 'failed') || step === 3} onClick={() => (step === 0 ? router.push('/studio') : setStep(step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</button>
          {step === 0 ? <button className="btn solid" disabled={!client.trim() || !tier} onClick={() => setStep(1)}>Continue</button> : null}
          {step === 1 ? <button className="btn solid" disabled={!figmaOk || !!busy} onClick={startScan}>Scan the file</button> : null}
          {step === 3 ? <div className="row"><button className="btn" onClick={() => { setSkippedReview(true); setStep(4); }}>Skip for now</button><button className="btn solid" onClick={() => { setSkippedReview(false); setStep(4); }}>Continue</button></div> : null}
          {step === 4 ? <button className="btn solid" onClick={() => setStep(5)}>Continue</button> : null}
          {step === 5 ? <button className="btn pink" disabled={!!busy} onClick={create}>Create project</button> : null}
        </div>
      </div>
    </div>
  );
}
