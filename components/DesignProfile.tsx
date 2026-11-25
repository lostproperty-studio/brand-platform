'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Check, ChevronDown, ExternalLink, Loader2, Lock, LockOpen, Minus, PenLine, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { SETTING_INFO, type Profile, type Setting, type SettingKey, type Source } from '@/lib/designProfileInfo';
import './designProfile.css';

// The design system's profile, read from the guidelines by AI, shown as the brand's actual elements: colours in
// their roles, type set in the brand's fonts, small drawings of the grid, corners and imagery, devices and rules.
// Every element says where it came from. Click one to adjust it in place (a correction is locked, so reading the
// guidelines again keeps it), lock it as it is, or switch it off so the design system's default is used.

type Colour = { name: string; hex: string; role?: string };
type Roles = { paper: Colour; ink: Colour; accent: Colour; surface: Colour };
type S = Profile['settings'];

const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const i12 = { size: 12, strokeWidth: 1.75, 'aria-hidden': true } as const;
const WEIGHT: Record<number, string> = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };
const CASE_LABEL: Record<string, string> = { sentence: 'Sentence case', upper: 'UPPERCASE', lower: 'lowercase', title: 'Title Case' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lumOf = (hex: string) => { const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const onHex = (hex: string) => (lumOf(hex) > 0.36 ? '#000' : '#fff');
const caseText = (t: string, c: string) => (c === 'upper' ? t.toUpperCase() : c === 'lower' ? t.toLowerCase() : c === 'title' ? t.replace(/\b\w/g, (m) => m.toUpperCase()) : t);
const srcText = (s: Source) => (s.from === 'guidelines' ? `Read from the guidelines (${s.chapter})` : s.from === 'studio' ? 'Set by the studio' : 'A judgement call: the guidelines don’t say');

export function DesignProfile({ projectId, slug, initial, chapters, colours = [], roles, fonts = [], fontCss = '' }: {
  projectId: string; slug: string; initial: Profile | null; chapters: number;
  /** The brand's palette, for the accent picker and the role swatches */
  colours?: Colour[];
  /** The working colour roles the design system picks from the palette (`roles` in lib/designSystem) */
  roles?: Roles | null;
  /** The brand's typefaces by role (display, body…), for the type specimens */
  fonts?: { role: string; name: string }[];
  /** @font-face rules for the brand's fonts (fontFaceCss), so specimens are set in them */
  fontCss?: string;
}) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<SettingKey | null>(null);
  const [draft, setDraft] = useState<unknown>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Partial<Record<SettingKey, HTMLButtonElement | null>>>({});

  async function read() {
    setBusy(true); setMsg('Reading the guidelines, text and pages…'); setOpen(null);
    const r = await fetch(`/api/projects/${projectId}/design-profile`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error || 'The read didn’t finish. Try again.'); return; }
    setP(j.profile); setMsg(''); router.refresh();
  }
  async function patch(key: SettingKey, body: Record<string, unknown>, close = true) {
    setSaving(true);
    const r = await fetch(`/api/projects/${projectId}/design-profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ...body }) });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setMsg(j.error || 'Couldn’t save that.'); return; }
    setP(j.profile); setMsg('');
    if (close) closeEditor(); else setDraft(structuredClone((j.profile as Profile).settings[key].value));
  }
  function openEditor(k: SettingKey) {
    if (open === k) { closeEditor(); return; }
    setOpen(k); setMsg(''); setDraft(structuredClone(p!.settings[k].value));
  }
  function closeEditor() {
    const k = open; setOpen(null); setDraft(null);
    if (k) requestAnimationFrame(() => tileRefs.current[k]?.focus());
  }

  // Only the @font-face rules: the :root variables fontFaceCss also writes aren't wanted in the studio
  const faces = fontCss.split('\n').filter((l) => l.startsWith('@font-face')).join('\n');
  const family = (role: string) => { const f = fonts.find((x) => x.role === role && x.name) || (role === 'display' ? fonts.find((x) => x.role === 'body' && x.name) : undefined); return f ? `"brand-${f.role}", ${JSON.stringify(f.name)}, var(--font)` : 'var(--font)'; };
  const dispName = (fonts.find((x) => x.role === 'display' && x.name) || fonts.find((x) => x.role === 'body' && x.name))?.name;
  const bodyName = fonts.find((x) => x.role === 'body' && x.name)?.name;
  const palette = colours.filter((c) => /^#[0-9A-F]{6}$/i.test(c.hex)).filter((c, i, a) => a.findIndex((x) => x.hex.toUpperCase() === c.hex.toUpperCase()) === i);

  if (!p) return <div className="dp2">
    <div className="dp2-head">
      <div><p className="dp2-t"><Sparkles {...I} /> Design profile</p>
        <p className="dp2-meta">{chapters ? 'Not read yet. The AI reads the guidelines (text and pages) and records the brand’s visual rules: colour roles, type habits, grid, corners, imagery and devices. The design system is built from them, and you can adjust any of it.' : 'Import guidelines chapters first; the profile is read from them.'}</p></div>
      <div className="dp2-acts"><button className="btn solid ic" disabled={busy || !chapters} onClick={read}>{busy ? <Loader2 {...I} className="spin" /> : <BookOpen {...I} />}Read the guidelines</button></div>
    </div>
    {msg ? <p className="dp2-msg" role="status">{msg}</p> : null}
  </div>;

  const st = p.settings;
  // While a setting is being edited, its tile previews the draft
  const val = <K extends SettingKey>(k: K): S[K]['value'] => (open === k && draft !== null ? draft : st[k]?.value) as S[K]['value'];
  const keys = (Object.keys(SETTING_INFO) as SettingKey[]).filter((k) => st[k]);
  const n = { guide: keys.filter((k) => st[k].source.from === 'guidelines').length, judge: keys.filter((k) => st[k].source.from === 'judgement').length, studio: keys.filter((k) => st[k].source.from === 'studio').length };

  // Colours in their roles: the profile's accent and ground over the roles the system picks from the palette
  const acc = val('accent');
  const accCol = palette.find((c) => c.hex.toUpperCase() === acc.hex.toUpperCase()) || { name: 'Accent', hex: acc.hex };
  const dark = !st.ground.off && val('ground') === 'dark';
  const paper = roles?.paper || { name: 'White', hex: '#FFFFFF' }, ink = roles?.ink || { name: 'Black', hex: '#000000' };
  const roleSw: { role: string; c: Colour }[] = [
    { role: 'Background', c: dark ? ink : paper }, { role: 'Text', c: dark ? paper : ink },
    { role: 'Accent', c: st.accent.off ? roles?.accent || accCol : accCol }, ...(roles?.surface ? [{ role: 'Surface', c: roles.surface }] : [])
  ];

  /** One decision as a row: a small picture of it, the decision in words, where it came from, and Edit. The editor
   *  opens in place under the row. */
  const tile = (k: SettingKey, visual: ReactNode, value: ReactNode, _cls = '') => {
    const s = st[k] as Setting<unknown>; if (!s) return null;
    const label = SETTING_INFO[k].label;
    const list = k === 'devices' || k === 'dos' || k === 'donts';
    const items = list ? (val(k) as string[]) : [];
    const tag = s.source.from === 'studio' ? 'Edited' : s.source.from === 'guidelines' ? 'From the guidelines' : 'AI’s call: check';
    return <div className={`dp3-item${open === k ? ' is-open' : ''}${s.off ? ' is-off' : ''}`} key={k}>
      <div className="dp3-row">
        {list ? null : <span className="dp3-vis" aria-hidden="true">{visual}</span>}
        <span className="dp3-txt"><span className="dp3-name">{label}</span>
          {s.off ? <span className="dp3-val">Off: the design system’s default is used</span>
            : list ? (items.length ? <ul className={`dp3-list dp3-list-${k}`}>{items.map((d, i) => <li key={i}>{k === 'dos' ? <Check {...i12} /> : k === 'donts' ? <X {...i12} /> : null}<span>{d}</span></li>)}</ul> : <span className="dp3-val">None yet</span>)
            : <span className="dp3-val">{value}</span>}</span>
        <span className={`dp3-src dp3-src-${s.source.from}`} title={srcText(s.source)}>{s.locked ? <Lock {...i12} /> : null}{tag}</span>
        <button ref={(el) => { tileRefs.current[k] = el; }} type="button" className="btn sm dp3-edit" onClick={() => openEditor(k)} aria-expanded={open === k} aria-controls={`dp2-pop-${k}`} aria-label={`${open === k ? 'Close' : 'Edit'} ${label}`}>{open === k ? 'Close' : 'Edit'}</button>
      </div>
      {open === k ? <Editor k={k} s={s} error={msg} draft={draft} setDraft={setDraft} palette={palette} saving={saving} onClose={closeEditor} rootRef={rootRef}
        onSave={() => patch(k, { value: Array.isArray(draft) ? draft.map((x) => String(x).trim()).filter(Boolean) : draft })} onLock={() => patch(k, { locked: !s.locked }, false)} onOff={() => patch(k, { off: !s.off }, false)} /> : null}
    </div>;
  };

  const hc = val('headlineCase'), hw = val('headlineWeight'), ht = val('headlineTracking'), ds = val('displayScale'), bs = val('bodySize');
  const g = val('grid'), co = val('corners'), im = val('imagery'), dn = val('density'), bt = val('buttons'), ru = val('rules');
  const head = { fontFamily: family('display'), fontWeight: st.headlineWeight.off ? 500 : hw, letterSpacing: st.headlineTracking.off ? '-0.01em' : `${ht}em` };
  const amount = { sparing: 1, moderate: 2, bold: 3 }[acc.use] || 1;
  const ratio = im.ratio.split(':').map(Number);
  const readOn = p.at ? new Date(p.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  return <div className="dp2 dp3" ref={rootRef}>
    {faces ? <style>{faces}</style> : null}
    <div className="dp3-head">
      <p className="dp3-intro">What the AI decided from the guidelines{readOn ? ` (read ${readOn})` : ''}. Check each decision and edit anything that’s wrong. {n.judge ? <>The {n.judge} marked <span className="dp3-src dp3-src-judgement">AI’s call: check</span> aren’t in the guidelines, so look at those first.</> : null}</p>
      <div className="dp2-acts">
        <a className="btn ic" href={`/p/${slug}/resources/design-system`} target="_blank" rel="noopener"><ExternalLink {...I} />See the design system</a>
        <button className="btn ic" disabled={busy || !chapters} onClick={read} title="Decisions you edited or locked stay as they are">{busy ? <Loader2 {...I} className="spin" /> : <RotateCcw {...I} />}Read again</button>
      </div>
    </div>
    {msg && !open ? <p className="dp2-msg" role="status">{msg}</p> : null}

    <div className="dp2-groups">
      <section className="dp2-g dp2-g-colour" aria-labelledby="dp2-h-colour">
        <h3 id="dp2-h-colour" className="dp2-gh">Colour</h3>
        <div className="dp3-rows">
          <div className="dp3-item"><div className="dp3-row"><span className="dp3-txt"><span className="dp3-name">Colours in use</span><span className="dp2-roles dp3-roles" aria-label="Colour roles">
          {roleSw.map(({ role, c }) => <div key={role} className="dp2-role"><span className="dp2-chip" style={{ background: c.hex, color: onHex(c.hex) }}>{role === 'Text' ? 'Aa' : ''}</span><span className="dp2-rl">{role}</span><span className="dp2-rn">{c.name}</span></div>)}
        </span></span></div></div>
          {tile('accent', <span className="dp2-acc"><span className="dp2-accsw" style={{ background: acc.hex }} /><span className="dp2-meter">{[1, 2, 3].map((x) => <i key={x} className={x <= amount ? 'on' : ''} style={x <= amount ? { background: acc.hex } : undefined} />)}</span></span>, <>{accCol.name !== 'Accent' ? accCol.name : acc.hex.toUpperCase()} · {acc.use}</>)}
          {tile('ground', <span className="dp2-page" style={{ background: dark ? ink.hex : paper.hex, color: dark ? paper.hex : ink.hex }}><b>Aa</b><i style={{ background: acc.hex }} /></span>, <>{cap(val('ground'))} pages</>)}
        </div>
      </section>

      <section className="dp2-g dp2-g-type" aria-labelledby="dp2-h-type">
        <h3 id="dp2-h-type" className="dp2-gh">Type{dispName ? <span className="dp2-ghs">{dispName}{bodyName && bodyName !== dispName ? ` · ${bodyName}` : ''}</span> : null}</h3>
        <div className="dp3-rows">
          <div className="dp3-item"><div className="dp2-spec" aria-hidden="true">
          <p className="dp2-spec-h" style={{ ...head, fontSize: { restrained: 26, large: 32, huge: 40 }[st.displayScale.off ? 'large' : ds] }}>{caseText('Headline style', st.headlineCase.off ? 'sentence' : hc)}</p>
          <p className="dp2-spec-b" style={{ fontFamily: family('body'), fontSize: st.bodySize.off ? 16 : bs }}>Body text reads like this, at {st.bodySize.off ? 16 : bs}px.</p>
        </div></div>
          {tile('headlineCase', <span className="dp2-glyph" style={{ ...head, textTransform: hc === 'upper' ? 'uppercase' : hc === 'lower' ? 'lowercase' : 'none' }}>{hc === 'title' ? 'Ab Cd' : hc === 'sentence' ? 'Ab cd' : 'Ab'}</span>, { sentence: 'Sentence', upper: 'UPPER', lower: 'lower', title: 'Title' }[hc])}
          {tile('headlineWeight', <span className="dp2-glyph" style={{ fontFamily: family('display'), fontWeight: hw }}>Aa</span>, <>{hw} · {WEIGHT[hw] || ''}</>)}
          {tile('headlineTracking', <span className="dp2-glyph" style={{ fontFamily: family('display'), letterSpacing: `${ht * 3}em` }}>AVA</span>, `${ht > 0 ? '+' : ''}${ht}em`)}
          {tile('displayScale', <span className="dp2-scale">{[0.45, 0.7, 1].map((x, i) => <i key={x} className={i <= ['restrained', 'large', 'huge'].indexOf(ds) ? 'on' : ''} style={{ height: `${x * 100}%` }} />)}</span>, cap(ds))}
          {tile('bodySize', <span className="dp2-glyph" style={{ fontFamily: family('body'), fontSize: bs + 2 }}>Aa</span>, `${bs}px`)}
        </div>
      </section>

      <section className="dp2-g dp2-g-layout" aria-labelledby="dp2-h-layout">
        <h3 id="dp2-h-layout" className="dp2-gh">Layout</h3>
        <div className="dp3-rows">
          {tile('grid', <svg viewBox="0 0 100 56" className="dp2-svg">{(() => { const m = g.marginPct, gw = Math.min(g.gutter / 10, 3), w = (100 - 2 * m - gw * (g.columns - 1)) / g.columns; return <><rect x="0" y="0" width="100" height="56" className="dp2-paper" />{Array.from({ length: g.columns }, (_, i) => <rect key={i} x={m + i * (w + gw)} y="6" width={w} height="44" className="dp2-col" />)}</>; })()}</svg>, `${g.columns} col · ${g.marginPct}% margin · ${g.gutter}px gutter`, 'dp2-wide')}
          {tile('corners', <svg viewBox="0 0 100 56" className="dp2-svg"><rect x="6" y="20" width="36" height="16" rx={co.controls >= 999 ? 8 : Math.min(co.controls / 2, 8)} className="dp2-ink" /><rect x="52" y="8" width="42" height="40" rx={Math.min(co.cards / 2, 20)} className="dp2-card" /></svg>, `${co.controls >= 999 ? 'Pill' : `${co.controls}px`} · ${co.cards}px`)}
          {tile('density', <span className="dp2-dense" style={{ gap: { airy: 8, balanced: 5, dense: 2 }[dn] }}>{[0, 1, 2].map((x) => <i key={x} />)}</span>, cap(dn))}
          {tile('buttons', <span className={`dp2-btn dp2-btn-${bt}`} style={{ borderRadius: Math.min(co.controls, 20) }}>Button</span>, cap(bt))}
          {tile('rules', <svg viewBox="0 0 100 56" className="dp2-svg">{[14, 28, 42].map((y) => <g key={y}><rect x="10" y={y - 6} width={y === 14 ? 50 : 36} height="4" rx="1" className="dp2-col" />{ru ? <line x1="10" x2="90" y1={y + 4} y2={y + 4} className="dp2-rule" /> : null}</g>)}</svg>, ru ? 'Hairlines' : 'No rules')}
        </div>
      </section>

      <section className="dp2-g dp2-g-img" aria-labelledby="dp2-h-img">
        <h3 id="dp2-h-img" className="dp2-gh">Imagery</h3>
        <div className="dp3-rows">
          {tile('imagery', <span className={`dp2-photo dp2-ph-${im.treatment}`}><span style={{ aspectRatio: `${ratio[0]} / ${ratio[1]}`, borderRadius: im.corners && im.treatment !== 'full-bleed' ? Math.max(3, Math.min(co.cards, 8)) : 0 }} />{im.treatment === 'mixed' ? <span style={{ aspectRatio: `${ratio[0]} / ${ratio[1]}`, borderRadius: im.corners ? 3 : 0 }} /> : null}<i /><i /></span>, `${cap(im.treatment)} · ${im.ratio}${im.corners ? ' · rounded' : ''}`)}
          {tile('devices', <span className="dp2-chips">{val('devices').length ? val('devices').slice(0, 4).map((d, i) => <span key={i}>{d}</span>) : <span className="dp2-none">None found</span>}</span>, `${val('devices').length} graphic device${val('devices').length === 1 ? '' : 's'}`, 'dp2-wide')}
        </div>
      </section>

      <section className="dp2-g dp2-g-rules" aria-labelledby="dp2-h-rules">
        <h3 id="dp2-h-rules" className="dp2-gh">Do’s and don’ts</h3>
        <div className="dp3-rows">
          {(['dos', 'donts'] as const).map((k) => tile(k, <ul className={`dp2-dd dp2-dd-${k}`}>{val(k).length ? val(k).slice(0, 3).map((d, i) => <li key={i}>{k === 'dos' ? <Check {...i12} /> : <X {...i12} />}<span>{d}</span></li>) : <li className="dp2-none">None yet</li>}{val(k).length > 3 ? <li className="dp2-more">+{val(k).length - 3} more</li> : null}</ul>, `${val(k).length} rule${val(k).length === 1 ? '' : 's'}`, 'dp2-wide'))}
        </div>
      </section>
    </div>

    <details className="dp2-more-info">
      <summary><ChevronDown {...I} />How the profile works</summary>
      <div>
        <p>The AI reads the guidelines’ text and pages and records the brand’s visual rules. Where the guidelines say or show something, it’s marked <BookOpen {...i12} /> with the chapter it came from; where they don’t, the AI makes a judgement call (<Sparkles {...i12} />) a senior designer would make for this brand. Judgement calls are the first things to check.</p>
        <p>Changing anything marks it <PenLine {...i12} /> set by the studio and locks it, so reading the guidelines again keeps your correction. Lock keeps a setting as it is; switching one off uses the design system’s default instead. The profile is read again after every guidelines import.</p>
        <p>Read from: {p.chapters.join(', ') || 'no chapters'}{p.frames ? `, and ${p.frames} page picture${p.frames === 1 ? '' : 's'}` : ''}.</p>
      </div>
    </details>
  </div>;
}

/** The in-place editor for one element: the right control for its kind, where it came from, and lock / off */
function Editor({ k, s, error, draft, setDraft, palette, saving, onClose, onSave, onLock, onOff, rootRef }: {
  k: SettingKey; s: Setting<unknown>; error: string; draft: unknown; setDraft: (v: unknown) => void; palette: Colour[]; saving: boolean;
  onClose: () => void; onSave: () => void; onLock: () => void; onOff: () => void; rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [side, setSide] = useState<'left' | 'right'>('left');
  useLayoutEffect(() => {
    const el = ref.current, root = rootRef.current; if (!el || !root) return;
    const r = el.getBoundingClientRect(), rr = root.getBoundingClientRect();
    if (r.right > Math.min(rr.right, window.innerWidth - 12)) setSide('right');
  }, [rootRef]);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.dp2-pop-b button, .dp2-pop-b input')?.focus();
    // A click outside closes it (a click on its own tile toggles it there)
    const down = (e: MouseEvent) => { const t = e.target as Node; if (ref.current && !ref.current.contains(t) && !(ref.current.parentElement?.contains(t))) closeRef.current(); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);

  const info = SETTING_INFO[k];
  const changed = JSON.stringify(draft) !== JSON.stringify(s.value);
  const set = (patch: Record<string, unknown>) => setDraft({ ...(draft as object), ...patch });
  const d = draft as never;
  let body: ReactNode = null;
  if (k === 'accent') {
    const a = draft as S['accent']['value'];
    body = <>
      <Field label="Colour">{palette.length ? <div className="dp2-swpick">{palette.map((c) => <button key={c.hex} type="button" className="dp2-swb" style={{ background: c.hex }} aria-pressed={c.hex.toUpperCase() === a.hex.toUpperCase()} aria-label={`${c.name} ${c.hex.toUpperCase()}`} title={`${c.name} ${c.hex.toUpperCase()}`} onClick={() => set({ hex: c.hex.toUpperCase() })}>{c.hex.toUpperCase() === a.hex.toUpperCase() ? <Check size={14} strokeWidth={2.25} color={onHex(c.hex)} aria-hidden /> : null}</button>)}</div>
        : <input className="in" aria-label="Hex" value={a.hex} onChange={(e) => set({ hex: e.target.value })} />}</Field>
      <Field label="How much of it">{seg(['sparing', 'moderate', 'bold'], a.use, (v) => set({ use: v }))}</Field>
    </>;
  } else if (k === 'ground') body = <Field label="Pages start">{seg(['light', 'dark'], d, setDraft)}</Field>;
  else if (k === 'headlineCase') body = <Field label="Case">{seg(['sentence', 'upper', 'lower', 'title'], d, setDraft, (o) => CASE_LABEL[o])}</Field>;
  else if (k === 'displayScale') body = <Field label="Biggest type">{seg(['restrained', 'large', 'huge'], d, setDraft)}</Field>;
  else if (k === 'density') body = <Field label="Spacing">{seg(['airy', 'balanced', 'dense'], d, setDraft)}</Field>;
  else if (k === 'buttons') body = <Field label="Main action">{seg(['solid', 'outline', 'underline'], d, setDraft)}</Field>;
  else if (k === 'rules') body = <Field label="Hairlines between content">{seg(['yes', 'no'], draft ? 'yes' : 'no', (v) => setDraft(v === 'yes'))}</Field>;
  else if (k === 'headlineWeight') body = <Stepper label="Weight" value={d} min={100} max={900} step={100} onChange={setDraft} hint={WEIGHT[d as number]} />;
  else if (k === 'headlineTracking') body = <Stepper label="Tracking (em)" value={d} min={-0.05} max={0.1} step={0.005} onChange={setDraft} />;
  else if (k === 'bodySize') body = <Stepper label="Body size (px)" value={d} min={13} max={20} step={1} onChange={setDraft} />;
  else if (k === 'corners') {
    const c = draft as S['corners']['value'];
    body = <>
      <div className="dp2-row"><Stepper label="Buttons and inputs (px)" value={c.controls >= 999 ? 24 : c.controls} min={0} max={60} step={1} onChange={(v) => set({ controls: v })} disabled={c.controls >= 999} />
        <label className="dp2-check"><input type="checkbox" checked={c.controls >= 999} onChange={(e) => set({ controls: e.target.checked ? 999 : 4 })} /> Pill</label></div>
      <Stepper label="Cards and images (px)" value={c.cards} min={0} max={40} step={1} onChange={(v) => set({ cards: v })} />
    </>;
  } else if (k === 'grid') {
    const g = draft as S['grid']['value'];
    body = <>
      <Stepper label="Columns" value={g.columns} min={4} max={16} step={1} onChange={(v) => set({ columns: v })} />
      <Stepper label="Outer margin (% of width)" value={g.marginPct} min={2} max={12} step={0.5} onChange={(v) => set({ marginPct: v })} />
      <Stepper label="Gutter (px)" value={g.gutter} min={8} max={40} step={2} onChange={(v) => set({ gutter: v })} />
    </>;
  } else if (k === 'imagery') {
    const m = draft as S['imagery']['value'];
    body = <>
      <Field label="Treatment">{seg(['full-bleed', 'framed', 'cutout', 'mixed'], m.treatment, (v) => set({ treatment: v }))}</Field>
      <Field label="Crop">{seg(['4:5', '1:1', '3:2', '16:9'], m.ratio, (v) => set({ ratio: v }), (o) => o)}</Field>
      <Field label="Corners">{seg(['square', 'rounded'], m.corners ? 'rounded' : 'square', (v) => set({ corners: v === 'rounded' }))}</Field>
    </>;
  } else if (k === 'devices' || k === 'dos' || k === 'donts') {
    body = <ListEdit items={draft as string[]} max={k === 'devices' ? 5 : 8} onChange={setDraft} noun={k === 'devices' ? 'device' : 'rule'} />;
  }

  const src = s.source;
  return <div ref={ref} id={`dp2-pop-${k}`} className={`dp2-pop dp2-pop-${side}${k === 'dos' || k === 'donts' || k === 'devices' ? ' dp2-pop-wide' : ''}`} role="dialog" aria-labelledby={`${id}-t`} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <div className="dp2-pop-h">
      <div><p className="dp2-pop-t" id={`${id}-t`}>{info.label}</p><p className="dp2-pop-help">{info.help}</p></div>
      <button type="button" className="dp2-x" onClick={onClose} aria-label="Close"><X {...I} /></button>
    </div>
    <div className="dp2-pop-b">{body}</div>
    <p className={`dp2-pop-src dp2-mk-${src.from}`}>
      {src.from === 'guidelines' ? <><BookOpen {...i12} /><span>Read from <b>{src.chapter}</b>{src.evidence ? <>: “{src.evidence}”</> : null}</span></>
        : src.from === 'studio' ? <><PenLine {...i12} /><span>Set by the studio{s.locked ? ': locked, so reading the guidelines again keeps it' : ''}.</span></>
        : <><Sparkles {...i12} /><span>Judgement call: {src.why}</span></>}
    </p>
    {error ? <p className="dp2-pop-err" role="alert">{error}</p> : null}
    <div className="dp2-pop-f">
      <button type="button" className="btn solid sm" disabled={!changed || saving} onClick={onSave} title="Saving locks it, so reading the guidelines again keeps your change">{saving ? <Loader2 {...i12} className="spin" /> : null}Save</button>
      <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
      <span className="dp2-sp" />
      <button type="button" className={'btn sm ic' + (s.locked ? ' dp2-on' : '')} aria-pressed={!!s.locked} disabled={saving} onClick={onLock} title={s.locked ? 'Locked: reading the guidelines again keeps it' : 'Keep it as it is when the guidelines are read again'}>{s.locked ? <Lock {...i12} /> : <LockOpen {...i12} />}{s.locked ? 'Locked' : 'Lock'}</button>
      <button type="button" className={'btn sm' + (s.off ? ' dp2-on' : '')} aria-pressed={!!s.off} disabled={saving} onClick={onOff} title={s.off ? 'Use this setting again' : 'Switch off: the design system’s default is used'}>{s.off ? 'Off · turn on' : 'Use default'}</button>
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="dp2-field" role="group" aria-label={label}><span className="dp2-fl">{label}</span>{children}</div>;
}

function seg<T extends string>(opts: readonly T[], value: T, on: (v: T) => void, show: (o: T) => string = cap) {
  return <div className="dp2-seg">{opts.map((o) => <button key={o} type="button" aria-pressed={o === value} onClick={() => on(o)}>{show(o)}</button>)}</div>;
}

function Stepper({ label, value, min, max, step, onChange, hint, disabled }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint?: string; disabled?: boolean }) {
  const id = useId();
  const dec = String(step).split('.')[1]?.length || 0;
  const fix = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(dec))));
  return <div className="dp2-field">
    <label className="dp2-fl" htmlFor={id}>{label}</label>
    <div className="dp2-step">
      <button type="button" aria-label={`Less ${label.toLowerCase()}`} disabled={disabled || value <= min} onClick={() => onChange(fix(value - step))}><Minus {...i12} /></button>
      <input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(fix(v)); }} />
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={disabled || value >= max} onClick={() => onChange(fix(value + step))}><Plus {...i12} /></button>
      {hint ? <span className="dp2-hint">{hint}</span> : null}
    </div>
  </div>;
}

function ListEdit({ items, max, onChange, noun }: { items: string[]; max: number; onChange: (v: string[]) => void; noun: string }) {
  const listRef = useRef<HTMLOListElement>(null);
  const add = () => { onChange([...items, '']); requestAnimationFrame(() => { const ins = listRef.current?.querySelectorAll('input'); ins?.[ins.length - 1]?.focus(); }); };
  return <div className="dp2-list">
    <ol ref={listRef}>{items.map((t, i) => <li key={i}>
      <input className="in" aria-label={`${cap(noun)} ${i + 1}`} value={t} maxLength={160} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (items.length < max) add(); } }} />
      <button type="button" className="dp2-x" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 {...i12} /></button>
    </li>)}</ol>
    {items.length < max ? <button type="button" className="btn sm ic" onClick={add}><Plus {...i12} />Add a {noun}</button> : <span className="dp2-hint">Up to {max}.</span>}
  </div>;
}
