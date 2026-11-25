import Link from 'next/link';
import type { Delivery } from '@/components/DeliverPanel';
import type { GuideTodo } from '@/lib/mcp/gaps';
import {
  AlertCircle, ArrowUpRight, BookOpen, CheckCircle2, Clock, Download, ExternalLink, Eye, Figma, GitBranch, Github, Globe, MessageSquare,
  PenLine, Send, Sparkles, UserPlus, type LucideIcon
} from 'lucide-react';
import { CopyLink } from '@/components/CopyLink';
import { ProjectTeam } from '@/components/ProjectTeam';
import { LogoThumb } from '@/components/LogoThumb';
import { FigmaSources, type SourceRow } from '@/components/FigmaSources';
import type { AssetsReport } from '@/lib/portal/templateBuild';
import type { LogoThumb as Thumb } from '@/lib/projects/logoThumb';

export type OverviewData = {
  projectId: string; client: string; line: string; slug: string; status: 'draft' | 'live' | 'archived'; portalUrl: string;
  thumb: Thumb;
  published: { at: string; version: string; by: string | null } | null; changedSince: boolean;
  share: { links: number; linkUses: number; members: number; firstAt: string | null; pending: number };
  views: { total: number; viewers: number; last: { who: string; at: string } | null; days: number[]; recent: { who: string; what: string; at: string; kind: string }[] };
  edit: { who: string; at: string } | null; edits: { who: string; area: string; at: string }[];
  figma: { key: string; name?: string; thumb?: string; modified?: string } | null;
  sources: { assets: SourceRow; guidelines: SourceRow; report: AssetsReport | null };
  repo: { name: string; version: string } | null; ai: string | null; aiRejected?: boolean; chapters: number;
  checks: { ok: boolean; title: string; note?: string; href?: string; cta?: string }[];
  /** Changes and publishes: what's waiting to go live, and each published version with the areas it changed */
  versions: {
    live: { version: string; at: string; by: string } | null;
    pending: AreaRow[]; direct: AreaRow[];
    list: { version: string; at: string; by: string; areas: AreaRow[] }[];
  };
  /** Sections of the guidelines still holding stand-in text or missing an image, with what to write */
  todos?: GuideTodo[];
  delivery: Delivery;
};

type AreaRow = { area: string; label: string; who: string[]; at: string };
const I = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
export function ago(d: string | null | undefined) {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  const m = s / 60, h = m / 60, dd = h / 24;
  if (m < 60) return `${Math.round(m)} min ago`;
  if (h < 24) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'} ago`;
  if (dd < 7) return `${Math.round(dd)} day${Math.round(dd) === 1 ? '' : 's'} ago`;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: new Date(d).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
const ACT: Record<string, LucideIcon> = { visit: Eye, download: Download, skill: Sparkles, tool: ArrowUpRight, ask: MessageSquare, join: UserPlus, upload: Download };

function Stat({ icon: Ic, label, tone, children, foot }: { icon: LucideIcon; label: string; tone?: 'good' | 'warn' | 'quiet'; children: React.ReactNode; foot?: React.ReactNode }) {
  return <div className={'ov-stat' + (tone ? ' ' + tone : '')}>
    <p className="ov-stat-h"><span className="ov-ic"><Ic {...I} /></span>{label}</p>
    <div className="ov-stat-b">{children}</div>
    {foot ? <div className="ov-stat-f">{foot}</div> : null}
  </div>;
}

/** Visits per day over the last 30 days, as small bars */
function Spark({ days }: { days: number[] }) {
  const max = Math.max(1, ...days);
  return <svg className="ov-spark" viewBox={`0 0 ${days.length * 6} 28`} preserveAspectRatio="none" role="img" aria-label={`Visits per day, last 30 days: ${days.reduce((a, b) => a + b, 0)} in total`}>
    {days.map((v, i) => <rect key={i} x={i * 6} y={28 - Math.max(v ? 3 : 1, (v / max) * 28)} width={4} height={Math.max(v ? 3 : 1, (v / max) * 28)} rx={1} className={v ? 'on' : ''} />)}
  </svg>;
}

// The project at a glance: is it live, has the client got the link and used it, who changed what last, who's on it,
// and where its files live.
export function Overview({ d, created, skipped }: { d: OverviewData; created?: boolean; skipped?: boolean }) {
  const shared = d.share.links > 0 || d.share.members > 0;
  const todo = d.checks.filter((c) => !c.ok);
  // One centred column, like Settings: a label above each module, everything stacked inside it
  const sec = (k: string, label: React.ReactNode, children: React.ReactNode, extra = '') => <section className={'ss-sec' + extra} id={k} aria-labelledby={`ovl-${k}`}><h2 className="ss-label" id={`ovl-${k}`}>{label}</h2><div className="ov-card">{children}</div></section>;
  return (
    <div className="ss ov">
      {created ? <div className="ov-banner"><CheckCircle2 {...I} />Project created and kit built. The portal stays in draft until you publish it.{skipped ? ' You skipped the review; pick it up from the checklist.' : ''}</div> : null}

      {/* The portal: preview, status and link */}
      {sec('portal', 'Client portal', <div className="ov-hero">
        <a className="ov-shot" href={`/p/${d.slug}`} aria-label={`Open the ${d.client} portal`}>
          <LogoThumb t={d.thumb} size="lg" />
          <span className={'ov-pill ' + d.status}><span className="ov-pip" />{d.status === 'live' ? 'Live' : d.status === 'archived' ? 'Archived' : 'Draft'}</span>
        </a>
        <div className="ov-hero-txt">
          <p className="ov-k"><Globe {...I} />Client portal</p>
          <p className="ov-url">{d.portalUrl.replace(/^https?:\/\//, '')}</p>
          <p className="mute">{d.status === 'live' && d.published ? `Live since ${new Date(d.published.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Version ${d.published.version}${d.published.by ? `, published by ${d.published.by}` : ''}.` : d.published ? `Published ${ago(d.published.at)} but not live.` : 'Not published yet. Clients can’t see anything until you publish.'}</p>
          <div className="ov-row"><a className="btn ic" href={`/p/${d.slug}`}><ExternalLink size={15} strokeWidth={1.75} aria-hidden />Open portal</a><CopyLink url={d.portalUrl} /></div>
        </div>
      </div>)}

      {/* Versions: what's waiting to go live, then each publish with what it changed. The latest is what clients see. */}
      {sec('versions', 'Changes and versions', <>
        <ul className="vs">
          {d.versions.pending.length || !d.versions.live ? <li className="vs-row pending">
            <span className="vs-ic" aria-hidden><span className="vs-dot" /></span>
            <div className="vs-t"><p><b>{d.versions.live ? 'Not published yet' : 'Never published'}</b><span className="vs-tag">Clients can’t see {d.versions.pending.length === 1 ? 'this' : 'these'}</span></p>
              {d.versions.pending.length ? <ul className="vs-areas">{d.versions.pending.map((a) => <li key={a.area}>{a.label}<span className="mute"> · {a.who.join(', ')} · {ago(a.at)}</span></li>)}</ul>
                : <p className="mute">Publish to give {d.client} the portal, the kit and the Claude connector.</p>}
              <p className="mute vs-how">Use Publish (top right) to put {d.versions.pending.length === 1 ? 'it' : 'them'} live.</p></div>
          </li> : null}
          {d.versions.list.map((v, k) => <li key={v.at} className={'vs-row' + (k === 0 ? ' live' : '')}>
            <span className="vs-ic" aria-hidden>{k === 0 ? <CheckCircle2 size={16} strokeWidth={1.75} /> : <Clock size={16} strokeWidth={1.75} />}</span>
            <div className="vs-t"><p><b>{v.by}</b>{k === 0 ? <span className="vs-tag live">Live</span> : null}<span className="mute"> · v{v.version}</span></p>
              <p className="mute">{v.areas.length ? v.areas.map((a) => a.label).join(', ') : 'Republished'}{v.areas.length ? ` · ${v.areas.length} area${v.areas.length === 1 ? '' : 's'} changed` : ''}</p></div>
            <span className="mute vs-at" title={new Date(v.at).toLocaleString('en-GB')}>{ago(v.at)}</span>
          </li>)}
        </ul>
        {d.versions.direct.length ? <p className="mute vs-direct">Also changed, and live straight away: {d.versions.direct.map((a) => a.label).join(', ')}.</p> : null}
      </>, ' ov-vers')}

      {/* Status at a glance */}
      {sec('glance', 'At a glance', <div className="ov-stats">
        <Stat icon={Send} label="Shared with the client" tone={shared ? 'good' : 'warn'} foot={<Link href="?tab=client" className="ov-more">{shared ? 'Manage access' : 'Invite the client'} →</Link>}>
          {shared ? <><p className="ov-big">{d.share.members}<span> {d.share.members === 1 ? 'person' : 'people'}</span></p><p className="mute">{d.share.links ? `${d.share.links} invite link${d.share.links === 1 ? '' : 's'}, used ${d.share.linkUses} time${d.share.linkUses === 1 ? '' : 's'}` : 'Invited by email'}{d.share.firstAt ? ` · first shared ${ago(d.share.firstAt)}` : ''}</p></>
            : <><p className="ov-big">Not yet</p><p className="mute">No invite links or client accounts.</p></>}
        </Stat>
        <Stat icon={Eye} label="Client views" tone={d.views.total ? 'good' : shared ? 'warn' : 'quiet'} foot={<Spark days={d.views.days} />}>
          {d.views.last ? <><p className="ov-big">{d.views.total}<span> visit{d.views.total === 1 ? '' : 's'} · {d.views.viewers} {d.views.viewers === 1 ? 'person' : 'people'}</span></p><p className="mute">Last viewed {ago(d.views.last.at)} by {d.views.last.who}</p></>
            : <><p className="ov-big">No views</p><p className="mute">{shared ? 'Shared, but nobody has opened it in the last 30 days.' : 'Nobody has the link yet.'}</p></>}
        </Stat>
        <Stat icon={PenLine} label="Last edited" tone="quiet" foot={d.edits.length ? <ul className="ov-mini">{d.edits.slice(0, 3).map((e, k) => <li key={k}><span className="av sm" aria-hidden>{e.who.slice(0, 1).toUpperCase()}</span>{e.who} · {e.area}<span className="mute"> {ago(e.at)}</span></li>)}</ul> : null}>
          {d.edit ? <><p className="ov-big">{ago(d.edit.at)}</p><p className="mute">by {d.edit.who}</p></> : <><p className="ov-big">—</p><p className="mute">No studio edits recorded yet.</p></>}
        </Stat>
      </div>)}

      {/* Before you publish */}
      {sec('checks', todo.length ? `Before you publish · ${todo.length} to do` : 'Ready to publish', <>
            <ul className="ov-ck">{d.checks.map((c) => <li key={c.title} className={c.ok ? 'ok' : 'todo'}>
              {c.ok ? <CheckCircle2 size={18} strokeWidth={1.75} aria-label="Done" /> : <AlertCircle size={18} strokeWidth={1.75} aria-label="To do" />}
              <div><p>{c.title}</p>{c.note ? <p className="mute">{c.note}</p> : null}</div>
              {c.href ? <Link className="btn" href={c.href}>{c.cta}</Link> : null}
            </li>)}</ul>
      </>)}

      {/* Guidelines to finish: each section with stand-in text, what it needs, a suggestion, and a way straight to it */}
      {d.todos?.length ? sec('finish', `Guidelines to finish · ${d.todos.length}`, <>
        <p className="mute td-intro">These parts of the guidelines still have stand-in text or a missing image. Claude skips them, so the client gets nothing there. Write in exact specs, then publish.</p>
        <ul className="td">{d.todos.slice(0, 12).map((t) => <li key={t.chapterId + (t.blockId || '') + t.section} className="td-item">
          <div className="td-top"><div className="td-where"><span className="td-ch">{t.chapter.charAt(0).toUpperCase() + t.chapter.slice(1)}</span><span className="td-sec">{t.section}</span></div>
            <Link className="btn td-go" href={`?tab=guidelines&ch=${encodeURIComponent(t.chapterId)}${t.blockId ? `&b=${encodeURIComponent(t.blockId)}` : ''}`}>Edit</Link></div>
          <p className="td-miss">{t.missing}</p>
          <p className="td-tip"><span>Suggestion</span>{t.suggestion}</p>
        </li>)}</ul>
        {d.todos.length > 12 ? <p className="mute">And {d.todos.length - 12} more in the guidelines.</p> : null}
      </>) : null}

      {/* Client activity */}
      {sec('activity', 'Client activity', <>
            {d.views.recent.length ? <ul className="ov-feed">{d.views.recent.map((a, k) => { const Ic = ACT[a.kind] || Eye; return <li key={k}><span className="ov-ic sm"><Ic size={14} strokeWidth={1.75} aria-hidden /></span><span className="ov-feed-t"><b>{a.who}</b> {a.what}</span><span className="mute">{ago(a.at)}</span></li>; })}</ul>
              : <p className="mute">Nothing yet. Visits, downloads and questions show here once the client starts using the portal.</p>}
            <Link href="?tab=client" className="ov-more">All client activity →</Link>
      </>)}

      {/* Studio team */}
      {sec('team', 'Studio team', <ProjectTeam projectId={d.projectId} />)}

      {/* Files and links */}
      {sec('links', 'Files and links', <>
            <div className="ov-links">
              <FigmaSources projectId={d.projectId} slug={d.slug} repo={d.repo?.name} assets={d.sources.assets} guidelines={d.sources.guidelines} thumb={d.figma?.thumb} report={d.sources.report} />
              {d.repo ? <a className="ov-link" href={`https://github.com/${d.repo.name}`} target="_blank" rel="noopener">
                <span className="ov-thumb dark"><Github size={20} strokeWidth={1.5} aria-hidden /></span>
                <span className="ov-link-t"><b><GitBranch size={13} strokeWidth={1.75} aria-hidden />{d.repo.name}</b><span className="mute">Brand kit · v{d.repo.version}</span></span><ArrowUpRight size={15} strokeWidth={1.75} aria-hidden />
              </a> : <div className="ov-link off"><span className="ov-thumb"><Github size={20} strokeWidth={1.5} aria-hidden /></span><span className="ov-link-t"><b>Kit not built yet</b><span className="mute">Build it from the actions below</span></span></div>}
              <a className="ov-link" href={`/p/${d.slug}/guidelines`} target="_blank" rel="noopener">
                <span className="ov-thumb"><BookOpen size={20} strokeWidth={1.5} aria-hidden /></span>
                <span className="ov-link-t"><b>Online guidelines</b><span className="mute">{d.chapters ? `${d.chapters} chapter${d.chapters === 1 ? '' : 's'}` : 'Not built yet'}</span></span><ArrowUpRight size={15} strokeWidth={1.75} aria-hidden />
              </a>
              <div className="ov-link off">
                <span className="ov-thumb"><Sparkles size={20} strokeWidth={1.5} aria-hidden /></span>
                <span className="ov-link-t"><b>Client AI</b><span className="mute">{d.ai ? (d.aiRejected ? `Key ending ${d.ai} was rejected by Anthropic; a client admin needs to paste a new one in the portal’s settings` : `Connected · key ending ${d.ai}`) : 'Not connected; the client adds their key in the portal’s settings'}</span></span>
              </div>
            </div>
      </>)}
    </div>
  );
}
