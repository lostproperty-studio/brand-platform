'use client';
import { Fragment, useState, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Check, Copy, Download, Package } from 'lucide-react';
import type { AskCatalog } from '@/lib/portal/askCatalog';

// An answer from Ask, rendered: short paragraphs and lists, with the brand's real things shown as cards where
// the answer names them: [[colour:…]] swatches, [[logo:…]] files, [[download:…]] packages, [[page:…]] chapters
// and [[font:…]] specimens. A token for something the catalog doesn't have is dropped, never guessed.

type Tok = { kind: 'colour' | 'logo' | 'download' | 'page' | 'font'; id: string };
const TOKEN = /\[\[(colour|color|logo|download|page|font):([^\]\n]{1,80})\]\]/gi;
const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`; };

function find(cat: AskCatalog | null, t: Tok) {
  if (!cat) return null;
  const id = norm(t.id);
  const by = <X extends { id: string }>(xs: X[], also?: (x: X) => string) => xs.find((x) => x.id === id) || xs.find((x) => also && norm(also(x)) === id) || xs.find((x) => x.id.startsWith(id) || id.startsWith(x.id));
  if (t.kind === 'colour') return by(cat.colours, (x) => x.hex);
  if (t.kind === 'logo') return by(cat.logos, (x) => x.name);
  if (t.kind === 'download') return by(cat.downloads, (x) => x.title);
  if (t.kind === 'page') return by(cat.pages, (x) => x.title);
  return by(cat.fonts, (x) => x.name);
}

function CopyHex({ hex, children, className }: { hex: string; children: ReactNode; className: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className={className} onClick={() => { navigator.clipboard?.writeText(hex).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); }).catch(() => {}); }} aria-label={`Copy ${hex}`}>{children}<span className="ak-copied" aria-live="polite">{ok ? 'Copied' : ''}</span></button>;
}

function Card({ t, cat }: { t: Tok; cat: AskCatalog | null }) {
  const x = find(cat, t);
  if (!x) return null;
  if (t.kind === 'colour') { const c = x as AskCatalog['colours'][number]; return <CopyHex hex={c.hex} className="ak-sw"><span className="ak-sw-chip" style={{ background: c.hex, color: c.ink }}>Aa</span><span className="ak-sw-t"><b>{c.name}</b><span>{c.hex}</span><span>RGB {rgb(c.hex)}</span>{c.role ? <span>{c.role}</span> : null}</span><Copy {...I} className="ak-sw-ic" /></CopyHex>; }
  if (t.kind === 'logo') { const l = x as AskCatalog['logos'][number]; return <figure className={'ak-logo ' + l.ground}><div className="ak-logo-art"><img src={l.url} alt={l.name} /></div><figcaption><span>{l.name}</span><a className="ak-mini" href={l.download} download><Download {...I} />Download</a></figcaption></figure>; }
  if (t.kind === 'download') { const d = x as AskCatalog['downloads'][number]; return <div className="ak-dl"><span className="ak-dl-ic"><Package size={18} strokeWidth={1.6} aria-hidden /></span><span className="ak-dl-t"><b>{d.title}</b><span>{d.detail}</span></span><a className="ak-mini" href={d.page}>See it</a><a className="ak-mini solid" href={d.href} download><Download {...I} />Download</a></div>; }
  if (t.kind === 'page') { const p = x as AskCatalog['pages'][number]; return <a className="ak-page" href={p.href}><BookOpen {...I} /><span>{p.title}</span><ArrowUpRight {...I} /></a>; }
  const f = x as AskCatalog['fonts'][number];
  return <div className="ak-font"><span className="ak-font-aa" style={{ fontFamily: f.family }}>Aa</span><span className="ak-font-t"><b style={{ fontFamily: f.family }}>{f.name}</b><span>{f.role}</span></span></div>;
}

/** A colour named inside a sentence: a small inline chip */
function Inline({ t, cat }: { t: Tok; cat: AskCatalog | null }) {
  const x = find(cat, t);
  if (!x) return null;
  if (t.kind === 'colour') { const c = x as AskCatalog['colours'][number]; return <CopyHex hex={c.hex} className="ak-ic"><i style={{ background: c.hex }} />{c.name}</CopyHex>; }
  if (t.kind === 'page') { const p = x as AskCatalog['pages'][number]; return <a className="ak-ic" href={p.href}><BookOpen size={12} strokeWidth={1.75} aria-hidden />{p.title}</a>; }
  if (t.kind === 'download') { const d = x as AskCatalog['downloads'][number]; return <a className="ak-ic" href={d.href} download><Download size={12} strokeWidth={1.75} aria-hidden />{d.title}</a>; }
  if (t.kind === 'logo') { const l = x as AskCatalog['logos'][number]; return <a className="ak-ic" href={l.download} download><Download size={12} strokeWidth={1.75} aria-hidden />{l.name}</a>; }
  const f = x as AskCatalog['fonts'][number];
  return <span className="ak-ic" style={{ fontFamily: f.family }}>{f.name}</span>;
}

/** **bold**, `code` and tokens inside a line */
function inline(text: string, cat: AskCatalog | null, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(`${TOKEN.source}|\\*\\*([^*]+)\\*\\*|\`([^\`]+)\``, 'gi');
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<Inline key={`${key}-${i++}`} t={{ kind: (m[1].toLowerCase() === 'color' ? 'colour' : m[1].toLowerCase()) as Tok['kind'], id: m[2] }} cat={cat} />);
    else if (m[3]) out.push(<strong key={`${key}-${i++}`}>{m[3]}</strong>);
    else if (m[4]) out.push(<code key={`${key}-${i++}`}>{m[4]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const onlyTokens = (line: string) => { const rest = line.replace(TOKEN, '').replace(/[\s,·•-]/g, ''); TOKEN.lastIndex = 0; return !rest && /\[\[/.test(line); };
const tokensIn = (line: string): Tok[] => [...line.matchAll(new RegExp(TOKEN.source, 'gi'))].map((m) => ({ kind: (m[1].toLowerCase() === 'color' ? 'colour' : m[1].toLowerCase()) as Tok['kind'], id: m[2].trim() }));

export function AskAnswer({ text, cat, streaming }: { text: string; cat: AskCatalog | null; streaming?: boolean }) {
  // While streaming, hold back a token that hasn't finished arriving
  const body = streaming ? text.replace(/\[\[[^\]]*\]?$/, '') : text;
  const lines = body.split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [], list: { ordered: boolean; items: string[] } | null = null, cards: Tok[] = [];
  const flushPara = () => { if (para.length) { const k = `p${blocks.length}`; blocks.push(<p key={k}>{para.map((l, i) => <Fragment key={i}>{i ? <br /> : null}{inline(l, cat, `${k}-${i}`)}</Fragment>)}</p>); para = []; } };
  const flushList = () => { if (list) { const k = `l${blocks.length}`; const L = list.ordered ? 'ol' : 'ul'; blocks.push(<L key={k}>{list.items.map((it, i) => <li key={i}>{inline(it, cat, `${k}-${i}`)}</li>)}</L>); list = null; } };
  const flushCards = () => {
    if (!cards.length) return;
    const k = `c${blocks.length}`;
    // Cards of a kind sit together: a palette, a row of logos, a list of downloads
    const groups: Tok[][] = [];
    for (const c of cards) { const g = groups[groups.length - 1]; if (g && g[0].kind === c.kind) g.push(c); else groups.push([c]); }
    blocks.push(<div key={k} className="ak-cards">{groups.map((g, gi) => <div key={gi} className={`ak-group ak-${g[0].kind}s`}>{g.map((t, i) => <Card key={i} t={t} cat={cat} />)}</div>)}</div>);
    cards = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/^#{1,6}\s+/, '').trimEnd();
    if (!line.trim()) { flushPara(); flushList(); flushCards(); continue; }
    if (onlyTokens(line)) { flushPara(); flushList(); cards.push(...tokensIn(line)); continue; }
    flushCards();
    const li = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    if (li) { flushPara(); const ordered = !!li[1]; if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; } list.items.push(li[2]); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList(); flushCards();
  return <div className="ak-answer">{blocks}</div>;
}

/** The thinking mark: still when idle, turning and breathing while Ask works */
export function AskMark({ active, size = 22 }: { active?: boolean; size?: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
  return <span className={'ak-mark' + (active ? ' on' : '')} style={{ width: size, height: size }} aria-hidden>
    <svg viewBox="0 0 24 24" width={size} height={size}>{rays.map((a, i) => <rect key={a} x="11" y="1.5" width="2" height="8.5" rx="1" transform={`rotate(${a} 12 12)`} style={{ animationDelay: `${i * 0.12}s` }} />)}</svg>
  </span>;
}

export function CopyAnswer({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  const plain = text.replace(TOKEN, (_m, k: string, id: string) => (k.toLowerCase().startsWith('col') ? id : '')).replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return <button type="button" className="ak-act" onClick={() => navigator.clipboard?.writeText(plain).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); })} aria-label="Copy answer">{ok ? <Check {...I} /> : <Copy {...I} />}{ok ? 'Copied' : 'Copy'}</button>;
}
