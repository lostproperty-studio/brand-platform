'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, MessageSquare, X } from 'lucide-react';
import { LpAppIcon } from '@/components/panel/LpAppIcon';
import { LP_KIND, LP_STATUS, openLpChat, openLpSession, type LpThread } from '@/components/portal/LpChat';

// Settings → Lost Property: talk to the team, see every request as a ticket, and book a session.
const I = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function LpSupport({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const [list, setList] = useState<LpThread[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');
  useEffect(() => {
    const load = () => fetch(`/api/p/${slug}/lp`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { threads: [] })).then((j) => setList(j.threads)).catch(() => setList([]));
    load(); const t = setInterval(load, 20000); return () => clearInterval(t);
  }, [slug]);
  const shown = (list || []).filter((t) => filter === 'all' || (filter === 'done' ? ['done', 'declined'].includes(t.status) : !['done', 'declined'].includes(t.status)));
  const openCount = (list || []).filter((t) => !['done', 'declined'].includes(t.status)).length;
  return <div className="lps">
    <div className="lps-actions">
      <button type="button" className="lps-act" onClick={() => openLpChat()}>
        <span className="lps-ic"><MessageSquare {...I} /></span>
        <span className="lps-txt"><span>Message the team</span><span className="mute">Straight to the studio. Usually a reply within a working day.</span></span>
        <span className="lps-price">Included</span>
      </button>
      <button type="button" className="lps-act" onClick={openLpSession}>
        <span className="lps-ic"><CalendarDays {...I} /></span>
        <span className="lps-txt"><span>Book a session</span><span className="mute">A call to talk things through, or get feedback on your work.</span></span>
        <span className="lps-price">From £95</span>
      </button>
    </div>

    <div className="lps-tickets">
      <div className="lps-th">
        <h3>{isAdmin ? 'Requests from your team' : 'Your requests'}</h3>
        <div className="lps-filter" role="tablist">{([['open', `Open${openCount ? ` · ${openCount}` : ''}`], ['done', 'Done'], ['all', 'All']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
      </div>
      {list === null ? <p className="mute">Loading…</p> : !shown.length ? <p className="mute lps-none">{filter === 'open' ? 'Nothing open. Message the team any time.' : 'Nothing here yet.'}</p>
        : shown.map((t) => <button key={t.id} type="button" className="lps-row" onClick={() => openLpChat(t.id)}>
          <span className="lps-rt"><span>{t.title}</span><span className="mute">{LP_KIND[t.kind] || 'Request'}{t.name && !t.mine ? ` · ${t.name}` : ''} · {when(t.last_message_at || t.created_at)}</span></span>
          <span className={'lpc-st ' + t.status}>{LP_STATUS[t.status] || t.status}</span>
        </button>)}
    </div>
  </div>;
}

// ---------- Booking a session (a mock-up: no calendar, no payment yet)

const SESSIONS = [
  { id: 'checkin', name: 'Check-in', mins: 30, price: 95, about: 'Talk through how the brand is working for you, and anything you’re unsure about.' },
  { id: 'review', name: 'Work review', mins: 45, price: 150, about: 'Share something you’ve made. Clear, honest feedback against the brand, and what to change.' },
  { id: 'working', name: 'Working session', mins: 90, price: 295, about: 'Bring something new and shape it together with the studio.' }
];
const TIMES = ['10:00', '11:30', '14:00', '15:30'];

/** Mounted once (in the Ask bar), opened from anywhere with openLpSession() */
export function SessionBooking({ client }: { client: string }) {
  const [on, setOn] = useState(false);
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState(SESSIONS[1].id);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [link, setLink] = useState('');
  useEffect(() => { const f = () => { setOn(true); setStep(0); setDay(null); setTime(null); }; window.addEventListener('lp-session', f); return () => window.removeEventListener('lp-session', f); }, []);
  useEffect(() => { if (!on) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setOn(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [on]);
  const days = useMemo(() => { const out: Date[] = []; const d = new Date(); d.setDate(d.getDate() + 1); while (out.length < 10) { if (d.getDay() % 6) out.push(new Date(d)); d.setDate(d.getDate() + 1); } return out; }, []);
  // Pretend availability, steady for a given day
  const free = (d: Date, t: string) => (d.getDate() * 7 + TIMES.indexOf(t) * 3) % 5 !== 0;
  if (!on) return null;
  const s = SESSIONS.find((x) => x.id === pick)!;
  const dayLabel = day ? new Date(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  return <div className="plg-scrim" onClick={() => setOn(false)}>
    <div className="plg-modal lpb" role="dialog" aria-modal="true" aria-label="Book a session with Lost Property" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="plg-x plg-close" onClick={() => setOn(false)} aria-label="Close"><X size={14} strokeWidth={1.75} aria-hidden /></button>
      {step > 0 && step < 3 ? <button type="button" className="plg-x lpb-back" onClick={() => setStep(step - 1)} aria-label="Back"><ArrowLeft size={14} strokeWidth={1.75} aria-hidden /></button> : null}
      <div className="lpb-id"><LpAppIcon size={44} /><p className="lpb-steps" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className={i <= Math.min(step, 2) ? 'on' : ''} />)}</p></div>

      {step === 0 ? <>
        <h3 className="plg-title">Book a session</h3>
        <p className="mute plg-sub">Time with the Lost Property studio, for {client}.</p>
        <div className="lpb-opts">{SESSIONS.map((x) => <button key={x.id} type="button" className={'lpb-opt' + (pick === x.id ? ' on' : '')} onClick={() => setPick(x.id)}>
          <span className="lpb-ot"><span>{x.name}</span><span className="lpb-p">£{x.price}</span></span>
          <span className="mute">{x.mins} minutes · {x.about}</span>
        </button>)}</div>
        <button type="button" className="btn solid lpb-go" onClick={() => setStep(1)}>Choose a time</button>
      </> : null}

      {step === 1 ? <>
        <h3 className="plg-title">{s.name} · {s.mins} min</h3>
        <p className="mute plg-sub">Pick a time. All times are UK time, on a video call.</p>
        <div className="lpb-days">{days.map((d) => <button key={d.toISOString()} type="button" className={'lpb-day' + (day === d.toISOString() ? ' on' : '')} onClick={() => { setDay(d.toISOString()); setTime(null); }}>
          <span className="mute">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span><span>{d.getDate()}</span>
        </button>)}</div>
        {day ? <div className="lpb-times">{TIMES.map((t) => { const ok = free(new Date(day), t); return <button key={t} type="button" disabled={!ok} className={'lpb-time' + (time === t ? ' on' : '')} onClick={() => setTime(t)}>{t}</button>; })}</div> : <p className="mute lpb-hint">Choose a day.</p>}
        <button type="button" className="btn solid lpb-go" disabled={!day || !time} onClick={() => setStep(2)}>Continue</button>
      </> : null}

      {step === 2 ? <>
        <h3 className="plg-title">What’s it about?</h3>
        <p className="mute plg-sub">A few lines help the studio come prepared.</p>
        <textarea className="ta lpb-notes" rows={3} placeholder={s.id === 'review' ? 'What are you sharing, and what would you like feedback on?' : 'What would you like to talk about?'} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <input className="in" placeholder="A link to the work (optional)" value={link} onChange={(e) => setLink(e.target.value)} />
        <div className="lpb-sum">
          <div><span>{s.name}</span><span>£{s.price}</span></div>
          <div className="mute"><span>{dayLabel}, {time}</span><span>+ VAT</span></div>
        </div>
        <button type="button" className="btn solid lpb-go" onClick={() => setStep(3)}>Pay £{s.price} and book</button>
        <p className="mute lpb-fine">Free to move up to 24 hours before. Paid securely by card.</p>
      </> : null}

      {step === 3 ? <div className="lpb-done">
        <span className="lpb-tick"><Check size={20} strokeWidth={2} aria-hidden /></span>
        <h3 className="plg-title">You’re booked</h3>
        <p className="mute plg-sub">{s.name} with Lost Property · {dayLabel}, {time}. The invite and receipt are on their way by email.</p>
        <p className="lpb-mock">Mock-up: no payment taken and nothing booked yet.</p>
        <button type="button" className="btn lpb-go" onClick={() => setOn(false)}>Done</button>
      </div> : null}
    </div>
  </div>;
}
