import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { portalV2 } from '@/lib/portalVersion';
import { brandsFor, readLink } from '@/lib/plugins/panelLink';
import { HOST_NAME } from '@/lib/plugins/catalog';
import { LinkApprove } from './LinkApprove';

export const metadata = { title: 'Sign in to the brand panel · Lost Property' };

// Where the panel sends people to sign in: check the code matches, choose the brand, done
export default async function PanelLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!portalV2()) redirect('/');
  const link = await readLink(code);
  const user = await currentUser();
  if (!user) redirect(link?.hint ? `/login/${encodeURIComponent(link.hint)}?next=${encodeURIComponent(`/panel/link/${code}`)}` : `/login?next=${encodeURIComponent(`/panel/link/${code}`)}`);
  const brands = link ? await brandsFor(user.id) : [];
  return <main className="pk">
    <div className="pk-card">
      <span className="pk-mark" aria-hidden />
      {!link ? <>
        <h1>This sign-in link has run out</h1>
        <p className="mute">Links last ten minutes. Go back to the panel and choose Sign in again.</p>
      </> : !brands.length ? <>
        <h1>No brand to sign in to</h1>
        <p className="mute">You’re signed in, but none of your brand portals has the panel turned on yet. Ask your portal’s lead, or Lost Property.</p>
      </> : <LinkApprove id={link.id} words={link.words} host={HOST_NAME[link.host]} brands={brands} hint={link.hint} />}
      <p className="pk-foot mute">Lost Property</p>
    </div>
  </main>;
}
