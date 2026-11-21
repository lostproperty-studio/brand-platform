'use client';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { AtSign, Bell, BookOpenText, Clapperboard, FileText, Globe, Image, Instagram, Linkedin, Mail, Megaphone, MessageSquareText, Monitor, Music2, Newspaper, Package, PanelTop, Presentation, RectangleHorizontal, Search, ShoppingBag, Signpost, Smartphone, Sparkles, Type, Youtube, type LucideProps } from 'lucide-react';
import { useFit } from '@/components/portal/v2/WriterBlocks';
import { TEMPLATE_GROUPS, WRITER_TEMPLATES, countOf, templateById, type WriterPart } from '@/lib/writerTemplates';
import { ArrowRight, Plus, RefreshCw, Star, X } from 'lucide-react';
import { CoText } from '@/components/portal/v2/CoWriter';

// Pieces are templates: each one is copy for a destination (an Instagram caption, a Google search ad, a poster),
// with that destination's fields and limits. The picker says only what each is for; the card shows the rest.

type Ic = ComponentType<LucideProps>;
export const TEMPLATE_ICON: Record<string, Ic> = {
  'google-search': Search, 'google-pmax': Megaphone, 'meta-feed': AtSign, 'meta-reels': Smartphone, 'linkedin-ad': Linkedin, display: RectangleHorizontal,
  instagram: Instagram, 'instagram-story': Smartphone, linkedin: Linkedin, x: MessageSquareText, threads: AtSign, tiktok: Music2, 'video-script': Clapperboard, youtube: Youtube,
  email: Mail, newsletter: Newspaper, sms: MessageSquareText, push: Bell,
  hero: PanelTop, 'web-page': Globe, seo: Search, product: ShoppingBag, 'app-store': Smartphone,
  poster: Image, signage: Signpost, packaging: Package, press: FileText, substack: BookOpenText,
  tagline: Type, presentation: Presentation, custom: Monitor
};
/** One line on what each template is for: no limits or parts, just the job */
export const TEMPLATE_FOR: Record<string, string> = {
  'google-search': 'Text ads in Google search results', 'google-pmax': 'Google ads across Search, YouTube and more', 'meta-feed': 'A sponsored post on Facebook or Instagram', 'meta-reels': 'A full-screen vertical ad', 'linkedin-ad': 'A sponsored post on LinkedIn', display: 'A web banner',
  instagram: 'A feed post', 'instagram-story': 'Words over a story', linkedin: 'A post from the company page', x: 'A post on X', threads: 'A post on Threads', tiktok: 'Caption and on-screen words', 'video-script': 'A short film, scene by scene', youtube: 'Title and description',
  email: 'One email, subject to button', newsletter: 'A regular update', sms: 'One text message', push: 'A phone notification',
  hero: 'The top of a web page', 'web-page': 'A section of a web page', seo: 'How a page shows in search', product: 'A product page', 'app-store': 'An app’s store listing',
  poster: 'Read in a few seconds', signage: 'Signs around a place', packaging: 'Front and back of pack', press: 'News for journalists', substack: 'A first-person essay',
  tagline: 'One short line', presentation: 'A slide’s words', custom: 'Your own fields'
};
/** Tips that cycle faintly in an empty field, on how to get going with that kind of piece */
const TIPS: Record<string, string[]> = {
  'video-script': ['Open on one image that tells the whole story', 'One scene per line: the shot, then | and any voiceover', 'Start with a sound or a moment, not the logo', 'End on one line people will remember'],
  instagram: ['The first line is all most people see: make it the hook', 'Write it the way you’d say it to one person', 'Lead with the thing itself, not the build-up'],
  'instagram-story': ['A few words, read in a second', 'Say the one thing, then where to go'],
  linkedin: ['Open with something only you could say', 'Keep the first two lines short: that’s what shows'],
  'google-search': ['Each headline has to work on its own', 'Put the place or the offer in at least one', 'Have a few under 15 characters'],
  'google-pmax': ['Each line has to work alone, in any order', 'Mix short headlines with long ones'],
  'meta-feed': ['The first sentence does the work', 'Say what’s in it for them'],
  email: ['A subject line that reads like a person wrote it', 'Say the one thing in the first line', 'One button, one action'],
  newsletter: ['Open with the best bit, not a hello', 'One idea per section'],
  sms: ['Who it’s from, what it is, what to do', 'Keep it to one text'],
  push: ['Say what’s new in the title', 'Give a reason to tap'],
  hero: ['Say what it is before what it means', 'The button says exactly what happens next'],
  'web-page': ['Answer the question the reader came with', 'Short paragraphs, one idea each'],
  seo: ['Put the words people search for first', 'Write the description as a promise'],
  poster: ['Seven words or fewer', 'Readable from across the street', 'One idea, said big'],
  signage: ['Say where, not what', 'As few words as it takes'],
  press: ['The news in the first sentence', 'Who, what, when, where, then why it matters', 'One paragraph per part of the story', 'Name the materials, places and people'],
  substack: ['Open on a scene, not a claim', 'What did you notice this week?', 'One film, album or brand that proves it', 'Say it the way you’d tell the team'],
  presentation: ['One idea per slide', 'Make the title the point, not the topic'],
  tagline: ['Short enough to say in one breath', 'Something only this brand could say']
};
const GENERAL = ['Start with what you most want them to know', 'Write it plainly first, make it sing after', 'Select any words for other ways to say them'];
export const tipsFor = (id: string) => TIPS[id] || GENERAL;

export const iconFor = (id: string): Ic => TEMPLATE_ICON[id] || Sparkles;

// Favourite and recently used templates (kept in this browser), shown first in the / menu
const FAV = 'lp-writer-favs', REC = 'lp-writer-recent';

const read = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } dispatchEvent(new Event('lp-tpl')); };
export const usedTemplate = (id: string) => write(REC, [id, ...read(REC).filter((x) => x !== id)].slice(0, 6));
export const toggleFav = (id: string) => { const f = read(FAV); write(FAV, f.includes(id) ? f.filter((x) => x !== id) : [...f, id].slice(0, 8)); };
export function useQuickTemplates() {
  const [q, setQ] = useState<{ favs: string[]; recent: string[] }>({ favs: [], recent: [] });
  useEffect(() => { const f = () => setQ({ favs: read(FAV), recent: read(REC) }); f(); addEventListener('lp-tpl', f); return () => removeEventListener('lp-tpl', f); }, []);
  return q;
}

export function TemplatePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('mousedown', c); addEventListener('keydown', k); return () => { removeEventListener('mousedown', c); removeEventListener('keydown', k); }; }, [onClose]);
  const fit = useFit(ref, 480);
  const { favs } = useQuickTemplates();
  const list = WRITER_TEMPLATES.filter((t) => !q || `${t.label} ${t.group} ${TEMPLATE_FOR[t.id] || ''}`.toLowerCase().includes(q.toLowerCase()));
  return <div className="tp" ref={ref} role="dialog" aria-label="Choose what you’re writing" style={fit.style}>
    <div className="tp-h"><strong>What are you writing?</strong><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: Instagram, email, poster…" onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) onPick(list[0].id); }} /></div>
    <div className="tp-body">
      {TEMPLATE_GROUPS.map((g) => { const ts = list.filter((t) => t.group === g); return ts.length ? <section key={g}><p className="tp-g">{g}</p><div className="tp-grid">
        {ts.map((t) => { const I = iconFor(t.id); const fav = favs.includes(t.id); return <div key={t.id} className="tp-r"><button type="button" className="tp-t" onClick={() => onPick(t.id)}><span className="tp-i"><I size={18} strokeWidth={1.6} aria-hidden /></span><span><b>{t.label}</b><span>{TEMPLATE_FOR[t.id] || ''}</span></span></button>
          <button type="button" className={'tp-star' + (fav ? ' on' : '')} onClick={() => toggleFav(t.id)} aria-pressed={fav} aria-label={fav ? `Unfavourite ${t.label}` : `Favourite ${t.label}`} title={fav ? 'Favourite: first in the / menu' : 'Add to favourites, first in the / menu'}><Star size={14} strokeWidth={1.7} fill={fav ? 'currentColor' : 'none'} aria-hidden /></button></div>; })}
      </div></section> : null; })}
      {!list.length ? <p className="tp-none">Nothing matches. Try “Something else”.</p> : null}
    </div>
  </div>;
}

export const templateLabel = (id: string) => templateById(id).label;

// ---------- A piece's fields: one per part of the destination, each with its own count against the limit

type Val = string | string[];
const list = (v?: Val) => (Array.isArray(v) ? v : v ? [v] : []);
export const fieldsOf = (id: string): WriterPart[] => { const t = templateById(id); return t.parts.length ? t.parts : [{ key: 'body', label: 'Copy', body: true }]; };
/** The piece's words, part by part, as plain text (for checks, the Writer and delivery) */
export const partsText = (id: string, parts: Record<string, Val> = {}) => fieldsOf(id).filter((x) => list(parts[x.key]).some((v) => v.trim())).map((x) => `${x.label}: ${list(parts[x.key]).filter((v) => v.trim()).join(' / ')}`).join('\n');

function Count({ v, x }: { v: string; x: WriterPart }) {
  if (!x.limit) return v ? <span className="tf-n">{countOf(v, x.unit)} {x.unit === 'words' ? 'words' : 'chars'}</span> : null;
  const n = countOf(v, x.unit); const over = n > x.limit;
  return <span className={'tf-n' + (over ? (x.soft ? ' soft' : ' over') : n > x.limit * .9 ? ' near' : '')} title={x.soft ? `${x.limit} is the recommended length: beyond it, the platform cuts it off` : `${x.limit} is the limit`}>{n}/{x.limit}{x.unit === 'words' ? ' words' : ''}</span>;
}

/** A short field (a headline, a subject line): a line to fill, with ideas for just this line */
function Short({ value, onChange, x, slug, brief, tone, template, placeholder }: { value: string; onChange: (v: string) => void; x: WriterPart; slug: string; brief: string; tone: number; template: string; placeholder: string }) {
  const [pop, setPop] = useState<{ lines: { text: string; why: string }[] | null; err?: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!pop) return; const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setPop(null); }; addEventListener('mousedown', c); return () => removeEventListener('mousedown', c); }, [pop]);
  const ideas = async () => {
    setPop({ lines: null });
    const steer = `a ${x.label.toLowerCase()} for a ${template}${x.limit ? `, ${x.soft ? 'about' : 'at most'} ${x.limit} ${x.unit === 'words' ? 'words' : 'characters'}` : ''}${x.hint ? ` (${x.hint})` : ''}`;
    const r = await fetch(`/api/p/${slug}/writer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'coach', action: value.trim() ? 'alts' : 'open', brief: brief || template, tone, template, text: value, line: value, steer }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setPop(r?.ok ? { lines: j.lines || [] } : { lines: [], err: j.error || 'The Writer didn’t answer. Try again.' });
  };
  return <div className="tf-short" ref={ref}>
    <textarea rows={1} className="tf-in" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))} ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />
    <button type="button" className="tf-ai" onClick={ideas} title={value.trim() ? 'Other ways to say this line' : 'Ideas for this line'} aria-label={value.trim() ? 'Other ways to say this line' : 'Ideas for this line'}><Sparkles size={13} strokeWidth={1.8} aria-hidden /></button>
    {pop ? <div className="co-pop tf-pop" role="dialog">
      <div className="co-pop-h"><Sparkles size={13} strokeWidth={1.9} aria-hidden /><span>{value.trim() ? 'Other ways' : 'Ideas'} for the {x.label.toLowerCase()}</span><button type="button" className="co-x" onClick={() => setPop(null)} aria-label="Close"><X size={13} aria-hidden /></button></div>
      {!pop.lines ? <div className="co-wait">{[0, 1, 2].map((k) => <i key={k} style={{ animationDelay: `${k * 120}ms` }} />)}</div> : null}
      {pop.err ? <p className="co-err">{pop.err}</p> : null}
      {pop.lines?.map((l, k) => <button type="button" key={k} className="co-alt" style={{ animationDelay: `${k * 70}ms` }} onClick={() => { onChange(l.text); setPop(null); }}><span className="co-alt-t">{l.text}</span><span className="co-alt-w">{l.why}{x.limit ? ` · ${countOf(l.text, x.unit)}/${x.limit}` : ''}</span><ArrowRight size={14} className="co-go" aria-hidden /></button>)}
      {pop.lines ? <div className="co-steers"><button type="button" onClick={ideas}><RefreshCw size={12} aria-hidden />Three more</button></div> : null}
    </div> : null}
  </div>;
}

export function TemplateFields({ template, parts, legacy, setParts, slug, brief, tone, others, say }: {
  template: string; parts: Record<string, Val>; legacy?: string; setParts: (p: Record<string, Val>) => void;
  slug: string; brief: string; tone: number; others: string; say: (t: string) => void;
}) {
  const t = templateById(template); const fs = fieldsOf(template);
  // An older piece written as one block of text: its words go in the first long field
  const vals: Record<string, Val> = Object.keys(parts).length || !legacy ? parts : { [(fs.find((x) => x.body) || fs[0]).key]: legacy };
  const empty = !fs.some((x) => list(vals[x.key]).some((v) => v.trim()));
  const [fill, setFill] = useState<{ busy: boolean; options?: Record<string, Val>[]; at?: number } | null>(null);
  const put = (k: string, v: Val) => setParts({ ...vals, [k]: v });
  const fillIn = async () => {
    setFill({ busy: true });
    const r = await fetch(`/api/p/${slug}/writer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      mode: 'write', count: 3, tone, template: t.label, templateNote: t.note,
      parts: fs.map((x) => ({ key: x.key, label: x.label, limit: x.limit, unit: x.unit, soft: x.soft, count: x.count ? Math.min(x.count, 5) : undefined, hint: x.hint, body: x.body })),
      brief: [others ? `THE COPY ALREADY WRITTEN FOR THIS CAMPAIGN (adapt it to this destination: same idea and messages, written for here)\n${others}` : '', brief].filter((x) => x.trim()).join('\n\n') || t.label
    }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !j.options?.length) { setFill(null); say(j.error || 'The Writer couldn’t fill it in. Try again.'); return; }
    setFill({ busy: false, options: j.options, at: 0 }); setParts(clean(j.options[0]));
  };
  const clean = (o: Record<string, Val>) => Object.fromEntries(fs.map((x) => [x.key, o[x.key] ?? (x.count && x.count > 1 ? [] : '')]));
  return <div className="tf">
    {empty && !fill?.busy ? <div className="tf-fill">
      <button type="button" className="co-startb" onClick={fillIn}><Sparkles size={14} strokeWidth={1.8} aria-hidden />{others ? `Fill in from your other pieces` : 'Fill this in from the brief'}</button>
      <span>{others ? `The Writer adapts what you’ve written to ${t.label === 'Something else' ? 'this' : `a ${t.label.toLowerCase()}`}. Then make it yours.` : 'Or start writing: the Writer helps line by line.'}</span>
    </div> : null}
    {fill?.busy ? <div className="co-wait tf-wait">{[0, 1, 2].map((k) => <i key={k} style={{ animationDelay: `${k * 120}ms` }} />)}</div> : null}
    {fill?.options && fill.options.length > 1 && !fill.busy ? <div className="tf-again"><Sparkles size={12} aria-hidden />Filled in by the Writer<button type="button" onClick={() => { const at = ((fill.at || 0) + 1) % fill.options!.length; setFill({ ...fill, at }); setParts(clean(fill.options![at])); }}><RefreshCw size={12} aria-hidden />Try another ({(fill.at || 0) + 1} of {fill.options.length})</button><button type="button" onClick={() => setFill(null)}>Keep this</button></div> : null}
    {fs.map((x) => {
      const multi = !!(x.count && x.count > 1);
      const vs = multi ? list(vals[x.key]) : [typeof vals[x.key] === 'string' ? vals[x.key] as string : list(vals[x.key]).join('\n')];
      const setAt = (i: number, v: string) => { if (!multi) { put(x.key, v); return; } const n = [...vs]; while (n.length <= i) n.push(''); n[i] = v; put(x.key, n); };
      // A part with several (scenes, headlines): one free text, one per line. A new line is a new one.
      if (multi) {
        const lines = vs.filter((v) => v.trim()); const one = x.label.toLowerCase().replace(/s$/, '');
        const over = x.limit ? vs.map((v, i) => [i, countOf(v, x.unit)] as const).filter(([i, n]) => vs[i].trim() && n > x.limit!) : [];
        return <div key={x.key} className="tf-f long multi">
          <div className="tf-h"><span className="tf-l" title={x.hint || undefined}>{x.label}</span><span className="tf-n">{lines.length ? `${lines.length} ${lines.length === 1 ? one : x.label.toLowerCase()}` : `One ${one} per line`}{x.limit ? ` · up to ${x.limit}${x.unit === 'words' ? ' words' : ''} each` : ''}</span></div>
          <CoText value={vs.join('\n')} onChange={(v) => put(x.key, v.split('\n'))} slug={slug} brief={brief} tone={tone} template={`${t.label}, ${x.label} (one per line)`} say={say} placeholder={template === 'video-script' ? 'Start writing the script…' : `Start writing: one ${one} per line…`} tips={tipsFor(template)} />
          {over.length ? <p className={'tf-warn' + (x.soft ? '' : ' over')}>{over.map(([i, n]) => `Line ${i + 1} is ${n}/${x.limit}`).join(' · ')}</p> : null}
          {lines.length > x.count! ? <p className="tf-warn">Only the first {x.count} are used here.</p> : null}
        </div>;
      }
      const long = !!x.body || (x.limit || 0) > 200;
      return <div key={x.key} className={'tf-f' + (long ? ' long' : '')}>
        <div className="tf-h"><span className="tf-l" title={x.hint || undefined}>{x.label}</span><Count v={vs[0] || ''} x={x} /></div>
        <div className="tf-row">
          {long ? <CoText value={vs[0] || ''} onChange={(v) => setAt(0, v)} slug={slug} brief={brief} tone={tone} template={`${t.label}, ${x.label}`} say={say} placeholder={`Start writing the ${x.label.toLowerCase()}…`} tips={tipsFor(template)} />
            : <Short value={vs[0] || ''} onChange={(v) => setAt(0, v)} x={x} slug={slug} brief={brief} tone={tone} template={t.label} placeholder={x.label} />}
        </div>
      </div>;
    })}
  </div>;
}
