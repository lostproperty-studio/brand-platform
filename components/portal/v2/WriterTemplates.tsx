'use client';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { AtSign, Bell, Clapperboard, FileText, Globe, Image, Instagram, Linkedin, Mail, Megaphone, MessageSquareText, Monitor, Music2, Newspaper, Package, PanelTop, Presentation, RectangleHorizontal, Search, ShoppingBag, Signpost, Smartphone, Sparkles, Type, Youtube, type LucideProps } from 'lucide-react';
import { TEMPLATE_GROUPS, WRITER_TEMPLATES, countOf, templateById, type WriterPart } from '@/lib/writerTemplates';
import { ArrowRight, Plus, RefreshCw, X } from 'lucide-react';
import { CoText } from '@/components/portal/v2/CoWriter';

// Pieces are templates: each one is copy for a destination (an Instagram caption, a Google search ad, a poster),
// with that destination's fields and limits. The picker says only what each is for; the card shows the rest.

type Ic = ComponentType<LucideProps>;
export const TEMPLATE_ICON: Record<string, Ic> = {
  'google-search': Search, 'google-pmax': Megaphone, 'meta-feed': AtSign, 'meta-reels': Smartphone, 'linkedin-ad': Linkedin, display: RectangleHorizontal,
  instagram: Instagram, 'instagram-story': Smartphone, linkedin: Linkedin, x: MessageSquareText, threads: AtSign, tiktok: Music2, 'video-script': Clapperboard, youtube: Youtube,
  email: Mail, newsletter: Newspaper, sms: MessageSquareText, push: Bell,
  hero: PanelTop, 'web-page': Globe, seo: Search, product: ShoppingBag, 'app-store': Smartphone,
  poster: Image, signage: Signpost, packaging: Package, press: FileText,
  tagline: Type, presentation: Presentation, custom: Monitor
};
/** One line on what each template is for: no limits or parts, just the job */
export const TEMPLATE_FOR: Record<string, string> = {
  'google-search': 'Text ads in Google search results', 'google-pmax': 'Google ads across Search, YouTube and more', 'meta-feed': 'A sponsored post on Facebook or Instagram', 'meta-reels': 'A full-screen vertical ad', 'linkedin-ad': 'A sponsored post on LinkedIn', display: 'A web banner',
  instagram: 'A feed post', 'instagram-story': 'Words over a story', linkedin: 'A post from the company page', x: 'A post on X', threads: 'A post on Threads', tiktok: 'Caption and on-screen words', 'video-script': 'A short film, scene by scene', youtube: 'Title and description',
  email: 'One email, subject to button', newsletter: 'A regular update', sms: 'One text message', push: 'A phone notification',
  hero: 'The top of a web page', 'web-page': 'A section of a web page', seo: 'How a page shows in search', product: 'A product page', 'app-store': 'An app’s store listing',
  poster: 'Read in a few seconds', signage: 'Signs around a place', packaging: 'Front and back of pack', press: 'News for journalists',
  tagline: 'One short line', presentation: 'A slide’s words', custom: 'Your own fields'
};
export const iconFor = (id: string): Ic => TEMPLATE_ICON[id] || Sparkles;

export function TemplatePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('mousedown', c); addEventListener('keydown', k); return () => { removeEventListener('mousedown', c); removeEventListener('keydown', k); }; }, [onClose]);
  const list = WRITER_TEMPLATES.filter((t) => !q || `${t.label} ${t.group} ${TEMPLATE_FOR[t.id] || ''}`.toLowerCase().includes(q.toLowerCase()));
  return <div className="tp" ref={ref} role="dialog" aria-label="Choose what you’re writing">
    <div className="tp-h"><strong>What are you writing?</strong><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: Instagram, email, poster…" onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) onPick(list[0].id); }} /></div>
    <div className="tp-body">
      {TEMPLATE_GROUPS.map((g) => { const ts = list.filter((t) => t.group === g); return ts.length ? <section key={g}><p className="tp-g">{g}</p><div className="tp-grid">
        {ts.map((t) => { const I = iconFor(t.id); return <button type="button" key={t.id} className="tp-t" onClick={() => onPick(t.id)}><span className="tp-i"><I size={18} strokeWidth={1.6} aria-hidden /></span><span><b>{t.label}</b><span>{TEMPLATE_FOR[t.id] || ''}</span></span></button>; })}
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
      const shown = multi ? Math.max(Math.min(3, x.count!), vs.filter((v) => v.trim()).length + (vs.length < x.count! ? 1 : 0)) : 1;
      const setAt = (i: number, v: string) => { if (!multi) { put(x.key, v); return; } const n = [...vs]; while (n.length <= i) n.push(''); n[i] = v; put(x.key, n); };
      const long = !!x.body || (x.limit || 0) > 200;
      return <div key={x.key} className={'tf-f' + (long ? ' long' : '')}>
        <div className="tf-h"><span className="tf-l" title={x.hint || undefined}>{x.label}</span>{!multi ? <Count v={vs[0] || ''} x={x} /> : null}</div>
        {Array.from({ length: shown }, (_, i) => <div key={i} className="tf-row">
          {multi ? <span className="tf-i">{i + 1}</span> : null}
          {long ? <CoText value={vs[i] || ''} onChange={(v) => setAt(i, v)} slug={slug} brief={brief} tone={tone} template={`${t.label}, ${x.label}`} say={say} placeholder={`Write the ${x.label.toLowerCase()}…`} />
            : <Short value={vs[i] || ''} onChange={(v) => setAt(i, v)} x={x} slug={slug} brief={brief} tone={tone} template={t.label} placeholder={multi ? `${x.label.replace(/s$/, '')} ${i + 1}` : x.label} />}
          {multi ? <Count v={vs[i] || ''} x={x} /> : null}
        </div>)}
        {multi && shown < x.count! ? <button type="button" className="tf-more" onClick={() => setAt(shown, '')}><Plus size={12} aria-hidden />Add another {x.label.toLowerCase().replace(/s$/, '')}</button> : null}
      </div>;
    })}
  </div>;
}
