import Link from 'next/link';
import { Suspense } from 'react';
import { StudioBar } from '@/components/StudioBar';
import { Sparkles, ArrowLeft, Globe, LayoutGrid, Mail, Rocket, Send, Users } from 'lucide-react';
import { adminClient } from '@/lib/supabase/server';
import { AdminEmail } from '@/components/AdminEmail';
import { requireAdmin, listStaff } from '@/lib/admin';
import { env } from '@/lib/env';
import { AdminTeam } from '@/components/AdminTeam';
import { AdminDomain } from '@/components/AdminDomain';
import { AdminSlack } from '@/components/AdminSlack';
import { AdminKrea } from '@/components/AdminKrea';
import { AdminReleases } from '@/components/AdminReleases';
import { AdminPortal } from '@/components/AdminPortal';
import { AdminAppPreviews } from '@/components/AdminAppPreviews';

// Admin settings for the studio: who's on the platform, releases and what clients see, and the domain
export default async function Admin() {
  const st = await requireAdmin();
  if (st instanceof Response) return <div className="ov-denied"><h1>Admin settings</h1><p className="mute">{await st.text()}</p><Link className="btn" href="/studio">← Projects</Link></div>;
  const staff = await listStaff();
  const { data: projects } = await adminClient().from('projects').select('slug, client').neq('status', 'archived').order('client');
  return (
    <div className="adm">
      <header className="pj-head">
        <div className="pj-bar"><Link href="/studio" className="pj-bp"><img src="/lp-logo.svg" alt="" /><span className="bp-sub">Brand Platform</span></Link><Link className="btn ic" href="/studio"><ArrowLeft size={15} strokeWidth={1.75} aria-hidden />Projects</Link></div>
        <h1 className="pj-title">Admin settings</h1>
      </header>
      <Suspense><StudioBar requests={0} admin email={st.user.email || ''} /></Suspense>
      <div className="adm-body">
        <section className="ov-card" aria-labelledby="adm-team">
          <h2 id="adm-team" className="ov-h"><Users size={16} strokeWidth={1.75} aria-hidden />Studio team</h2>
          <p className="mute" style={{ margin: '0 0 6px' }}>Members create projects, edit content and manage client access. Admins also manage this team and the domain. Who works on each project is set on that project’s Overview.</p>
          <AdminTeam initial={staff} me={st.user.id} />
        </section>
        <section className="ov-card" aria-labelledby="adm-pv">
          <h2 id="adm-pv" className="ov-h"><Rocket size={16} strokeWidth={1.75} aria-hidden />Portal versions</h2>
          <p className="mute" style={{ margin: '0 0 6px' }}>Build the next portal as a beta without touching what clients see. Try it on any client’s portal in Staging, give it to a client when it’s ready for them, then make it the main portal for everyone.</p>
          <AdminPortal />
        </section>
        <section className="ov-card" aria-labelledby="adm-rel">
          <h2 id="adm-rel" className="ov-h"><Rocket size={16} strokeWidth={1.75} aria-hidden />Releases</h2>
          <AdminReleases />
        </section>
        <section className="ov-card" aria-labelledby="adm-apv">
          <h2 id="adm-apv" className="ov-h"><LayoutGrid size={16} strokeWidth={1.75} aria-hidden />App previews</h2>
          <AdminAppPreviews example={(projects || []).find((x) => x.slug === 'lost-property-studio')?.slug || projects?.[0]?.slug || null} />
        </section>
        <section className="ov-card" aria-labelledby="adm-slack">
          <h2 id="adm-slack" className="ov-h"><Send size={16} strokeWidth={1.75} aria-hidden />Slack</h2>
          <p className="mute" style={{ margin: '0 0 6px' }}>Client requests and messages to Lost Property post to the studio’s Slack channel, one thread each. Send a test to check it’s set up; if it doesn’t arrive, this says why.</p>
          <AdminSlack />
        </section>
        <section className="ov-card" aria-labelledby="adm-domain">
          <h2 id="adm-domain" className="ov-h"><Globe size={16} strokeWidth={1.75} aria-hidden />Domain</h2>
          <AdminDomain appHost={new URL(env.appUrl()).host} />
        </section>
        <section className="ov-card" aria-labelledby="adm-krea">
          <h2 id="adm-krea" className="ov-h"><Sparkles size={16} strokeWidth={1.75} aria-hidden />Krea</h2>
          <AdminKrea />
        </section>
        <section className="ov-card" aria-labelledby="adm-email">
          <h2 id="adm-email" className="ov-h"><Mail size={16} strokeWidth={1.75} aria-hidden />Emails</h2>
          <AdminEmail projects={projects || []} />
        </section>
      </div>
    </div>
  );
}
