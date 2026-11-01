import Link from 'next/link';
import { ArrowLeft, Globe, Mail, Users } from 'lucide-react';
import { adminClient } from '@/lib/supabase/server';
import { AdminEmail } from '@/components/AdminEmail';
import { requireAdmin, listStaff } from '@/lib/admin';
import { env } from '@/lib/env';
import { AdminTeam } from '@/components/AdminTeam';
import { AdminDomain } from '@/components/AdminDomain';

// Admin settings for the studio: who's on the platform, and its domain
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
      <div className="adm-body">
        <section className="ov-card" aria-labelledby="adm-team">
          <h2 id="adm-team" className="ov-h"><Users size={16} strokeWidth={1.75} aria-hidden />Studio team</h2>
          <p className="mute" style={{ margin: '0 0 6px' }}>Members create projects, edit content and manage client access. Admins also manage this team and the domain. Who works on each project is set on that project’s Overview.</p>
          <AdminTeam initial={staff} me={st.user.id} />
        </section>
        <section className="ov-card" aria-labelledby="adm-domain">
          <h2 id="adm-domain" className="ov-h"><Globe size={16} strokeWidth={1.75} aria-hidden />Domain</h2>
          <AdminDomain appHost={new URL(env.appUrl()).host} />
        </section>
        <section className="ov-card" aria-labelledby="adm-email">
          <h2 id="adm-email" className="ov-h"><Mail size={16} strokeWidth={1.75} aria-hidden />Emails</h2>
          <AdminEmail projects={projects || []} />
        </section>
      </div>
    </div>
  );
}
