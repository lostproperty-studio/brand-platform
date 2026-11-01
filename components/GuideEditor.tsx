'use client';
import { createElement, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Block, BlockKind, BlockMedia, Guide, GuideChapter } from '@/lib/portal/guide';
import { GuideBlock, textOn, type EditKit, type TextField } from '@/components/portal/GuideBlock';
import { TimedProgress } from '@/components/Progress';
import { tierLabel, type Tier } from '@/lib/playbook';
import { ChapterCover } from '@/components/portal/ChapterCover';
import { coverKind } from '@/lib/portal/covers';

const KINDS: [BlockKind, string][] = [['cover', 'Cover'], ['divider', 'Subsection start'], ['text', 'Text'], ['split', 'Text + image'], ['media', 'Images'], ['swatches', 'Colour swatches']];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (v: string | undefined, multiline: boolean) => (!v ? '' : multiline ? v.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : esc(v).replace(/\n/g, '<br>'));
const fromEl = (el: HTMLElement) => el.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Text you edit in place, in the brand's own type. Enter ends a headline; in body text, Enter starts a new paragraph.
function Editable({ value, onSave, tag, className, placeholder, multiline }: { value?: string; onSave: (v: string) => void; tag: string; className: string; placeholder: string; multiline?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const el = ref.current; if (el && document.activeElement !== el) el.innerHTML = toHtml(value, !!multiline); }, [value, multiline]);
  return createElement(tag, {
    ref, className: className + ' ed', contentEditable: true, suppressContentEditableWarning: true, 'data-ph': placeholder, spellCheck: true, role: 'textbox', 'aria-label': placeholder, 'aria-multiline': multiline || undefined,
    onBlur: () => { const el = ref.current; if (!el) return; const v = fromEl(el); if (v !== (value || '').trim()) onSave(v); if (!v) el.innerHTML = ''; },
    onPaste: (e: React.ClipboardEvent) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { (e.target as HTMLElement).innerHTML = toHtml(value, !!multiline); (e.target as HTMLElement).blur(); }
      if (e.key === 'Enter' && !multiline && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); }
    }
  });
}

// The studio's guidelines editor: the client's view, editable in place.
export function GuideEditor({ projectId, slug, guide: initial, content, thumbs, fontCss, tier, colours = [], logoUrl = null }: { projectId: string; slug: string; guide: Guide | null; content: Record<string, unknown>; thumbs: Record<string, string>; fontCss: string; tier?: Tier; colours?: { name: string; hex: string }[]; logoUrl?: string | null }) {
  const router = useRouter();
  const [guide, setGuide] = useState(initial);
  const [urls, setUrls] = useState(thumbs);
  const [chId, setChId] = useState(initial?.chapters[0]?.id || '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [drag, setDrag] = useState<{ kind: 'block' | 'chapter'; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(guide);
  const fileFor = useRef<{ block: string; target: number | 'backdrop' | 'new' | 'thumb' } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setGuide(initial); latest.current = initial; setUrls(thumbs); }, [initial, thumbs]);

  async function rebuild() {
    setBusy(true); setMsg('');
    const r = await fetch(`/api/projects/${projectId}/guide`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? `Rebuilt ${j.chapters} chapters from ${j.frames} Figma slides. Your edits were kept.${gapText(j.gaps)}` : 'The rebuild didn’t finish: ' + (j.error || r.status) + ' Try again in a minute; Figma is sometimes busy.');
    router.refresh();
  }
  const gapText = (x?: { tier: string | null; drafts: number; missing: number; error?: string }) => !x ? '' : x.error ? ' The tier check didn’t run: ' + x.error : !x.tier ? ' Set a tier on the Overview to have gaps drafted.' : ` ${x.drafts} draft section${x.drafts === 1 ? '' : 's'} and ${x.missing} missing item${x.missing === 1 ? '' : 's'} for the ${tierLabel(x.tier as Tier)} tier.`;
  async function checkGaps() {
    setBusy(true); setMsg('Checking against the tier and drafting the gaps…');
    const r = await fetch(`/api/projects/${projectId}/guide/drafts`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? 'Checked.' + gapText(j) : j.error || 'The check didn’t finish.');
    router.refresh();
  }
  const [dismissed, setDismissed] = useState<string[]>((content.dismissedSlots as string[]) || []);
  async function dismissSlot(slot?: string) {
    if (!slot) return;
    const next = [...new Set([...dismissed, slot])]; setDismissed(next);
    await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { dismissedSlots: next } }) });
  }
  function commit(next: Guide) {
    setGuide(next); latest.current = next; setMsg('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { guide: latest.current } }) });
      setMsg(r.ok ? 'Saved · publish to show the client' : 'Couldn’t save. Check your connection.');
    }, 600);
  }
  const g = guide;
  const ch = g?.chapters.find((c) => c.id === chId);
  const setChapters = (chapters: GuideChapter[]) => g && commit({ ...g, chapters });
  const setCh = (patch: Partial<GuideChapter>) => g && setChapters(g.chapters.map((c) => (c.id === chId ? { ...c, ...patch } : c)));
  const setBlocks = (blocks: Block[]) => setCh({ blocks });
  const editBlock = (id: string, patch: Partial<Block>) => ch && setBlocks(ch.blocks.map((b) => (b.id === id ? { ...b, ...patch, edited: true } : b)));
  const insertAt = (i: number, kind: BlockKind) => { if (!ch) return; const b: Block = { id: 'b-' + uid(), kind, heading: kind === 'swatches' ? 'Colours' : kind === 'divider' ? 'New subsection' : 'New section', body: kind === 'text' || kind === 'split' ? 'Write something…' : '', media: [], swatches: kind === 'swatches' ? [{ name: 'Colour', hex: '#000000' }] : undefined, cols: kind === 'media' ? 2 : undefined, side: kind === 'split' ? 'right' : undefined, edited: true }; const l = [...ch.blocks]; l.splice(i, 0, b); setBlocks(l); setMenu(null); };
  const moveBlock = (id: string, toId: string) => { if (!ch || id === toId) return; const l = [...ch.blocks]; const from = l.findIndex((b) => b.id === id); const [b] = l.splice(from, 1); l.splice(l.findIndex((x) => x.id === toId), 0, b); setBlocks(l); };
  const moveChapter = (id: string, toId: string) => { if (!g || id === toId) return; const l = [...g.chapters]; const from = l.findIndex((c) => c.id === id); const [c] = l.splice(from, 1); l.splice(l.findIndex((x) => x.id === toId), 0, c); setChapters(l); };

  async function upload(file: File): Promise<BlockMedia | null> {
    const dims = await new Promise<{ w: number; h: number }>((ok) => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth || 1200, h: im.naturalHeight || 800 }); im.onerror = () => ok({ w: 1200, h: 800 }); im.src = URL.createObjectURL(file); });
    const fd = new FormData(); fd.set('file', file); setMsg('Uploading…');
    const r = await fetch(`/api/projects/${projectId}/guide/upload`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Upload failed.'); return null; }
    setUrls((u) => ({ ...u, [j.path]: j.url })); setMsg('');
    return { path: j.path, w: dims.w, h: dims.h, kind: file.type === 'image/svg+xml' ? 'graphic' : 'photo' };
  }
  function pickImage(block: string, target: number | 'backdrop' | 'new' | 'thumb') { fileFor.current = { block, target }; fileInput.current?.click(); }
  async function onFile(f?: File) {
    const t = fileFor.current; if (!f || !t || !ch) return;
    const up = await upload(f); if (!up) return;
    if (t.target === 'thumb') { setCh({ thumb: up.path }); return; }
    const b = ch.blocks.find((x) => x.id === t.block); if (!b) return;
    if (t.target === 'backdrop') editBlock(b.id, { backdrop: up });
    else if (t.target === 'new') editBlock(b.id, { media: [...(b.media || []), up] });
    else editBlock(b.id, { media: (b.media || []).map((m, i) => (i === t.target ? { ...up, caption: m.caption } : m)) });
  }

  if (!g) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <p className="mute" style={{ margin: 0 }}>Reads the Figma page and rebuilds every slide as live web content. Then edit it here exactly as the client will see it.</p>
      <div className="row"><button className="btn solid" disabled={busy} onClick={rebuild}>Build guidelines from Figma</button><span className="mute">{msg}</span></div>
      <TimedProgress label="Reading Figma and rebuilding every slide" expected={90} running={busy} />
    </div>
  );

  const kitFor = (b: Block): EditKit => ({
    text: (field: TextField, value, el) => <Editable key={field} value={value} tag={el.tag} className={el.className} placeholder={el.placeholder} multiline={el.multiline} onSave={(v) => editBlock(b.id, { [field]: v || undefined } as Partial<Block>)} />,
    image: (target, m, imgEl) => <span className="ve-img">{imgEl}<span className="ve-imgbar">
      <button onClick={() => pickImage(b.id, target)}>Replace</button>
      {target !== 'backdrop' ? <button onClick={() => editBlock(b.id, { media: (b.media || []).map((x, i) => (i === target ? { ...x, kind: x.kind === 'photo' ? 'graphic' : 'photo' } : x)) })}>{m.kind === 'photo' ? 'Fit' : 'Fill'}</button> : null}
      {target !== 'backdrop' && m.caption === undefined ? <button onClick={() => editBlock(b.id, { media: (b.media || []).map((x, i) => (i === target ? { ...x, caption: '' } : x)) })}>Caption</button> : null}
      <button onClick={() => (target === 'backdrop' ? editBlock(b.id, { backdrop: undefined }) : editBlock(b.id, { media: (b.media || []).filter((_, i) => i !== target) }))}>Remove</button>
    </span></span>,
    caption: (i, value) => (value === undefined ? null : <Editable value={value} tag="p" className="gb-cap" placeholder="Caption" onSave={(v) => editBlock(b.id, { media: (b.media || []).map((x, k) => (k === i ? { ...x, caption: v || undefined } : x)) })} />),
    swatch: (i, s) => { const set = (p: Partial<typeof s>) => editBlock(b.id, { swatches: (b.swatches || []).map((x, k) => (k === i ? { ...x, ...p } : x)) }); return (
      <div key={i} className="gb-swc ve-sw" style={{ background: s.hex, color: textOn(s.hex) }}>
        <Editable value={s.name} tag="span" className="gb-swn" placeholder="Name" onSave={(v) => set({ name: v || 'Colour' })} />
        <span className="sw-meta"><Editable value={s.hex} tag="span" className="sw-hex" placeholder="#000000" onSave={(v) => { const h = v.trim().toUpperCase().replace(/^([0-9A-F]{6})$/, '#$1'); if (/^#[0-9A-F]{6}$/.test(h)) set({ hex: h }); }} /><Editable value={s.note} tag="span" className="" placeholder="Note, e.g. CMYK" onSave={(v) => set({ note: v || undefined })} /></span>
        <span className="ve-swbar"><label title="Pick colour"><input type="color" value={/^#[0-9A-F]{6}$/i.test(s.hex) ? s.hex : '#000000'} onChange={(e) => set({ hex: e.target.value.toUpperCase() })} aria-label={`Colour for ${s.name}`} />●</label><button onClick={() => editBlock(b.id, { swatches: (b.swatches || []).filter((_, k) => k !== i) })} aria-label={`Remove ${s.name}`}>×</button></span>
      </div>); },
    addSwatch: () => <button key="add" className="gb-swc ve-add" onClick={() => editBlock(b.id, { swatches: [...(b.swatches || []), { name: 'Colour', hex: '#000000' }] })}>+ Swatch</button>,
    addImage: () => <button key="addimg" className="ve-add ve-addimg" onClick={() => pickImage(b.id, 'new')}>+ Add image</button>
  });

  const subsIdx = (id: string) => { const subs = ch ? ch.blocks.filter((b) => b.kind === 'divider' && !b.hidden) : []; const k = subs.findIndex((b) => b.id === id); return k >= 0 ? String(k + 1).padStart(2, '0') : undefined; };
  const hiddenCount = ch ? ch.blocks.filter((b) => b.hidden).length : 0;
  const all = g.chapters.flatMap((c) => c.blocks);
  const nDraft = all.filter((b) => b.draft === 'draft').length, nMissing = all.filter((b) => b.draft === 'missing').length;
  const chDrafts = (c: GuideChapter) => c.blocks.filter((b) => b.draft).length;
  const accept = (b: Block) => editBlock(b.id, { draft: undefined, draftNote: undefined });
  const removeBlock = (b: Block) => ch && setBlocks(ch.blocks.filter((x) => x.id !== b.id));

  return (
    <div className="ve">
      <style>{fontCss}</style>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="ve-top">
        <button className="btn solid" disabled={busy} onClick={rebuild}>Rebuild from Figma</button>
        <a className="btn" href={`/p/${slug}/guidelines`} target="_blank" rel="noopener">Preview as client ↗</a>
        <label className="row mute"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden{hiddenCount ? ` (${hiddenCount})` : ''}</label>
        <span className="ve-tier">{tier ? `${tierLabel(tier)} tier` : 'No tier set'}{nDraft || nMissing ? ` · ${[nDraft ? `${nDraft} draft${nDraft === 1 ? '' : 's'} to check` : '', nMissing ? `${nMissing} missing` : ''].filter(Boolean).join(' · ')}` : ''}</span>
        {tier ? <button className="btn" disabled={busy} onClick={checkGaps}>Check for gaps</button> : <a className="btn" href="?tab=overview">Set a tier</a>}
        <span className="mute" role="status">{msg}</span>
      </div>
      {(g.version || 1) < 2 ? <div className="card" role="status" style={{ borderColor: '#000' }}><p style={{ margin: 0 }}>These guidelines were built with an older version, so some pages may still show slide images.</p><p className="mute" style={{ margin: '4px 0 8px' }}>Rebuild to get live text, colour swatches you can click to copy, and subsections. Your edits are kept.</p><button className="btn solid" disabled={busy} onClick={rebuild}>Rebuild now</button></div> : null}
      <TimedProgress label="Reading Figma and rebuilding every slide" expected={Math.max(45, g.chapters.reduce((n, c) => n + c.blocks.length, 0) * 2)} running={busy} />

      <div className="ve-grid">
        <nav className="ve-chs" aria-label="Chapters">
          <p className="ve-label">Chapters · drag to reorder</p>
          {g.chapters.map((c, i) => <div key={c.id} draggable onDragStart={() => setDrag({ kind: 'chapter', id: c.id })} onDragOver={(e) => { if (drag?.kind === 'chapter') { e.preventDefault(); setOver(c.id); } }} onDrop={() => { if (drag?.kind === 'chapter') moveChapter(drag.id, c.id); setDrag(null); setOver(null); }} onDragEnd={() => { setDrag(null); setOver(null); }}
            className={'ve-ch' + (c.id === chId ? ' on' : '') + (c.hidden ? ' off' : '') + (over === c.id && drag?.kind === 'chapter' ? ' over' : '')}>
            <button onClick={() => setChId(c.id)}><span className="pt-n">{String(i + 1).padStart(2, '0')}</span>{c.title}{chDrafts(c) ? <span className="ve-dcount" title="Drafts and missing items to check">{chDrafts(c)}</span> : null}</button>
            <button className="ve-eye" onClick={() => setChapters(g.chapters.map((x) => (x.id === c.id ? { ...x, hidden: !x.hidden } : x)))} aria-label={c.hidden ? `Show ${c.title}` : `Hide ${c.title}`} title={c.hidden ? 'Hidden from the client' : 'Hide from the client'}>{c.hidden ? '○' : '●'}</button>
          </div>)}
          <button className="btn" style={{ marginTop: 8 }} onClick={() => { const c: GuideChapter = { id: 'custom-' + uid(), key: null, title: 'New chapter', kicker: '', lede: '', edited: true, blocks: [], rules: [] }; setChapters([...g.chapters, c]); setChId(c.id); }}>+ Chapter</button>
        </nav>

        {ch ? <div className="ve-canvas pt">
          <article className="pt-page ve-page">
            <header className="pt-chhead ve-chhead">
              <p className="mute"><span className="pt-n">{String(g.chapters.indexOf(ch) + 1).padStart(2, '0')}</span><Editable value={ch.kicker} tag="span" className="" placeholder="Label" onSave={(v) => setCh({ kicker: v, edited: true })} /></p>
              <Editable value={ch.title} tag="h1" className="pt-display" placeholder="Chapter title" onSave={(v) => setCh({ title: v || 'Untitled', edited: true })} />
              <Editable value={ch.lede} tag="p" className="pt-lede" placeholder="Add an introduction (optional)" multiline onSave={(v) => setCh({ lede: v, edited: true })} />
              {ch.hidden ? <p className="tag">This chapter is hidden from the client</p> : null}
              <div className="ve-cover">
                <div className="ve-cover-pv pt-chthumb"><ChapterCover c={ch} i={g.chapters.indexOf(ch)} g={g} urls={urls} colours={colours} logoUrl={logoUrl} /></div>
                <div className="ve-cover-txt">
                  <p className="ve-label">Cover on the home page · {({ upload: 'your thumbnail', slide: 'the opening slide', logo: 'the logo', type: 'the typeface', colour: 'the palette', grid: 'the dot grid', imagery: 'a carousel of the photography', voice: 'three key words', image: 'the chapter’s first image', title: 'the chapter title' } as Record<string, string>)[coverKind(ch, g.chapters.indexOf(ch))]}</p>
                  {coverKind({ ...ch, thumb: undefined }, g.chapters.indexOf(ch)) === 'type' && !ch.thumb ? <label className="ve-cover-f">Type sample<input className="in" defaultValue={ch.thumbSample || ''} placeholder="Auto: abc or Abc, matching the brand" onBlur={(e) => setCh({ thumbSample: e.target.value.trim() || undefined })} /></label> : null}
                  {coverKind({ ...ch, thumb: undefined }, g.chapters.indexOf(ch)) === 'voice' && !ch.thumb ? <label className="ve-cover-f">Three key words<input className="in" defaultValue={ch.thumbWords || ''} placeholder="Auto from the headlines. e.g. Warm, Curious, Direct" onBlur={(e) => setCh({ thumbWords: e.target.value.trim() || undefined })} /></label> : null}
                  <div className="row"><button className="btn" onClick={() => pickImage('', 'thumb')}>{ch.thumb ? 'Replace thumbnail' : 'Upload a thumbnail'}</button>{ch.thumb ? <button className="btn" onClick={() => setCh({ thumb: undefined })}>Use the generated cover</button> : null}</div>
                </div>
              </div>
            </header>

            <div className="pt-blocks ve-blocks">
              <Inserter open={menu === 'i0'} onOpen={() => setMenu(menu === 'i0' ? null : 'i0')} onPick={(k) => insertAt(0, k)} />
              {ch.blocks.map((b, i) => (b.hidden && !showHidden ? null : (
                <div key={b.id}>
                  {b.draft ? <div className={'ve-draft ' + b.draft} role="note">
                    <span className="ve-draft-tag">{b.draft === 'draft' ? 'Draft, check this' : 'Missing'}</span>
                    <span className="ve-draft-note">{b.draftNote}{b.draft === 'missing' && b.body ? ` For this tier: ${b.body}` : ''}</span>
                    {b.draft === 'draft' ? <><button className="btn solid" onClick={() => accept(b)}>Accept</button><button className="btn" onClick={() => removeBlock(b)}>Delete</button></>
                      : <><button className="btn solid" onClick={() => editBlock(b.id, { draft: undefined, draftNote: undefined, body: '' })}>Write it now</button><button className="btn" onClick={() => { removeBlock(b); dismissSlot(b.slot); }} title="Not needed for this client; it won’t be flagged again">Not needed</button></>}
                    <span className="mute">Hidden from the client until accepted.</span>
                  </div> : null}
                  <div className={'ve-block' + (b.hidden ? ' off' : '') + (b.draft ? ' is-draft' : '') + (over === b.id && drag?.kind === 'block' ? ' over' : '')}
                    onDragOver={(e) => { if (drag?.kind === 'block') { e.preventDefault(); setOver(b.id); } }} onDrop={() => { if (drag?.kind === 'block') moveBlock(drag.id, b.id); setDrag(null); setOver(null); }}>
                    <BlockBar b={b} onDragStart={() => setDrag({ kind: 'block', id: b.id })} onDragEnd={() => { setDrag(null); setOver(null); }} edit={(p) => editBlock(b.id, p)}
                      onDuplicate={() => { const l = [...ch.blocks]; l.splice(i + 1, 0, { ...b, id: 'b-' + uid(), source: undefined, edited: true }); setBlocks(l); }}
                      onDelete={() => (b.source ? editBlock(b.id, { hidden: true }) : setBlocks(ch.blocks.filter((x) => x.id !== b.id)))}
                      onReset={b.source && b.edited ? () => { if (confirm('Discard your edits to this section? It refreshes from Figma on the next rebuild.')) setBlocks(ch.blocks.map((x) => (x.id === b.id ? { ...x, edited: false } : x))); } : undefined}
                      onImage={() => pickImage(b.id, 'new')} onBackdrop={() => pickImage(b.id, 'backdrop')} />
                    {b.hidden ? <p className="ve-hidden">Hidden from the client · <button onClick={() => editBlock(b.id, { hidden: false })}>Show</button></p> : null}
                    <GuideBlock b={{ ...b, hidden: false }} urls={urls} headingLevel={3} number={b.kind === 'divider' ? subsIdx(b.id) : undefined} chapter={ch.title} edit={kitFor(b)} />
                  </div>
                  <Inserter open={menu === 'i' + (i + 1)} onOpen={() => setMenu(menu === 'i' + (i + 1) ? null : 'i' + (i + 1))} onPick={(k) => insertAt(i + 1, k)} />
                </div>)))}
              {!ch.blocks.length ? <p className="mute">This chapter is empty. Use + to add a section.</p> : null}
            </div>

            {ch.rules.length ? <section className="pt-blk"><h2 className="pt-h2">The rules</h2><p className="mute" style={{ marginTop: -6 }}>From the review. Change them in the Review tab.</p><div className="pt-rules">{ch.rules.map((r, k) => <div key={k} className="pt-rule"><p className="pt-rule-h">{r.title}</p><p>{r.text}</p></div>)}</div></section> : null}
          </article>
        </div> : null}
      </div>
      <p className="mute">Built {new Date(g.generatedAt).toLocaleString('en-GB')} from “{g.page}” in {g.file}. Sections you edit or add are kept when you rebuild.</p>
    </div>
  );
}

function Inserter({ open, onOpen, onPick }: { open: boolean; onOpen: () => void; onPick: (k: BlockKind) => void }) {
  return <div className={'ve-ins' + (open ? ' open' : '')}>
    <button className="ve-ins-btn" onClick={onOpen} aria-expanded={open} aria-label="Add a section here">+</button>
    {open ? <div className="ve-menu" role="menu">{KINDS.map(([k, l]) => <button key={k} role="menuitem" onClick={() => onPick(k)}><KindIcon k={k} />{l}</button>)}</div> : null}
  </div>;
}

function KindIcon({ k }: { k: BlockKind }) {
  const r = { cover: 'M3 3h18v18H3z M6 15h8', divider: 'M3 6h18 M3 12h9 M15 10h6v6h-6z', text: 'M4 6h16 M4 10h16 M4 14h11', split: 'M3 5h8v14H3z M14 7h7 M14 11h7 M14 15h5', media: 'M3 5h8v6H3z M13 5h8v6h-8z M3 13h8v6H3z M13 13h8v6h-8z', swatches: 'M3 6h5v12H3z M10 6h5v12h-5z M17 6h4v12h-4z' }[k];
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d={r} /></svg>;
}

// The toolbar that appears on a section: layout, text style, colour, images, order, visibility.
function BlockBar({ b, edit, onDragStart, onDragEnd, onDuplicate, onDelete, onReset, onImage, onBackdrop }: { b: Block; edit: (p: Partial<Block>) => void; onDragStart: () => void; onDragEnd: () => void; onDuplicate: () => void; onDelete: () => void; onReset?: () => void; onImage: () => void; onBackdrop: () => void }) {
  const [pop, setPop] = useState<'layout' | 'type' | 'colour' | null>(null);
  const seg = <T extends string | number>(cur: T | undefined, opts: [T, string][], set: (v: T) => void) => <div className="ve-seg">{opts.map(([v, l]) => <button key={String(v)} className={cur === v ? 'on' : ''} onClick={() => set(v)}>{l}</button>)}</div>;
  return (
    <div className="ve-bar" onMouseLeave={() => setPop(null)}>
      <span className="ve-handle" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title="Drag to move" aria-label="Drag to move">⋮⋮</span>
      <div className="ve-pop-wrap"><button onClick={() => setPop(pop === 'layout' ? null : 'layout')} aria-expanded={pop === 'layout'}><KindIcon k={b.kind} />{KINDS.find(([k]) => k === b.kind)?.[1]}</button>
        {pop === 'layout' ? <div className="ve-pop">
          {KINDS.map(([k, l]) => <button key={k} className={'ve-row' + (b.kind === k ? ' on' : '')} onClick={() => edit({ kind: k, side: k === 'split' ? b.side || 'right' : b.side })}><KindIcon k={k} />{l}</button>)}
          {b.kind === 'split' ? <><p className="ve-label">Image side</p>{seg(b.side || 'right', [['left', 'Left'], ['right', 'Right']], (v) => edit({ side: v }))}</> : null}
          {b.kind === 'media' ? <><p className="ve-label">Columns</p>{seg(b.cols || 2, [[1, '1'], [2, '2'], [3, '3'], [4, '4']], (v) => edit({ cols: v }))}</> : null}
        </div> : null}</div>
      <div className="ve-pop-wrap"><button onClick={() => setPop(pop === 'type' ? null : 'type')} aria-expanded={pop === 'type'} title="Text style"><span style={{ fontWeight: 500 }}>Aa</span></button>
        {pop === 'type' ? <div className="ve-pop">
          <p className="ve-label">Headline size</p>{seg(b.headSize, [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']], (v) => edit({ headSize: v }))}
          <p className="ve-label">Text size</p>{seg(b.bodySize, [['S', 'S'], ['M', 'M'], ['L', 'L']], (v) => edit({ bodySize: v }))}
          <p className="ve-label">Text columns</p>{seg(b.bodyCols || 1, [[1, '1'], [2, '2'], [3, '3']], (v) => edit({ bodyCols: v }))}
          <p className="ve-label">Align</p>{seg(b.align || 'left', [['left', 'Left'], ['center', 'Centre']], (v) => edit({ align: v }))}
        </div> : null}</div>
      <div className="ve-pop-wrap"><button onClick={() => setPop(pop === 'colour' ? null : 'colour')} aria-expanded={pop === 'colour'} title="Colours"><span className="ve-dot" style={{ background: b.bg || '#fff' }} /></button>
        {pop === 'colour' ? <div className="ve-pop">
          <p className="ve-label">Background</p><div className="row"><input type="color" value={b.bg && /^#[0-9A-F]{6}$/i.test(b.bg) ? b.bg : '#FFFFFF'} onChange={(e) => edit({ bg: e.target.value.toUpperCase() })} aria-label="Background colour" /><button className="btn" onClick={() => edit({ bg: undefined })}>None</button></div>
          <p className="ve-label">Text</p><div className="row"><input type="color" value={b.ink && /^#[0-9A-F]{6}$/i.test(b.ink) ? b.ink : '#000000'} onChange={(e) => edit({ ink: e.target.value.toUpperCase() })} aria-label="Text colour" /><button className="btn" onClick={() => edit({ ink: undefined })}>Auto</button></div>
          <p className="ve-label">Background image</p><div className="row"><button className="btn" onClick={onBackdrop}>{b.backdrop ? 'Replace' : 'Add'}</button>{b.backdrop ? <button className="btn" onClick={() => edit({ backdrop: undefined })}>Remove</button> : null}</div>
        </div> : null}</div>
      {b.kind !== 'text' && b.kind !== 'swatches' ? <button onClick={onImage} title="Add image">+ Image</button> : null}
      {b.original ? <button className={b.showOriginal ? 'on' : ''} onClick={() => edit({ showOriginal: !b.showOriginal })} title="Show the Figma slide as a picture instead">Slide</button> : null}
      <span className="ve-sep" />
      <button onClick={onDuplicate} title="Duplicate">Duplicate</button>
      {onReset ? <button onClick={onReset} title="Discard edits">Reset</button> : null}
      <button onClick={() => edit({ hidden: !b.hidden })}>{b.hidden ? 'Show' : 'Hide'}</button>
      {!b.source ? <button onClick={onDelete} title="Delete">Delete</button> : null}
    </div>
  );
}
