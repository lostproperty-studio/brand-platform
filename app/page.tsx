import { redirect } from 'next/navigation';
import { adminClient, currentUser } from '@/lib/supabase/server';

// Staff land on the studio; client users go straight to their portal (or a list if they have several).
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const sb = adminClient();
  const { data: staff } = await sb.from('staff').select('user_id').eq('user_id', user.id).maybeSingle();
  if (staff) redirect('/studio');
  const { data: m } = await sb.from('project_members').select('projects(slug, client)').eq('user_id', user.id);
  const list = (m || []).map((r) => r.projects as unknown as { slug: string; client: string }).filter(Boolean);
  if (list.length === 1) redirect(`/p/${list[0].slug}`);
  return (
    <main className="auth"><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500 }}>Your brand portals</h1>
      {list.length ? list.map((p) => <a key={p.slug} className="btn" href={`/p/${p.slug}`}>{p.client}</a>) : <p className="mute">You haven’t been added to a project yet. Ask Lost Property for an invite.</p>}
    </div></main>
  );
}
