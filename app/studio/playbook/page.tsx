import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/supabase/server';
import { getPlaybook } from '@/lib/playbookStore';
import { PlaybookEditor } from '@/components/PlaybookEditor';

// The studio playbook: house rules for writing guidelines, what each tier contains, and the rules every kit gives AI.
export default async function PlaybookPage() {
  const st = await requireStaff();
  if (st instanceof Response) redirect('/');
  const playbook = await getPlaybook();
  return (
    <div className="pb">
      <div className="pj-head"><Link href="/studio" className="pj-bp" aria-label="Brand Platform home"><img src="/lp-logo.svg" alt="" /><span className="bp-sub">Brand Platform</span></Link><Link className="btn" href="/studio">← Projects</Link><span className="pj-client">Playbook</span></div>
      <main className="pb-main">
        <h1>Guidelines playbook</h1>
        <p className="mute" style={{ maxWidth: 680 }}>How Lost Property writes guidelines. Every project follows it: the scan and review use the house rules, the tier sets which sections a guide needs, and gaps are drafted to match. Changes apply the next time a project’s guidelines are checked.</p>
        <PlaybookEditor initial={playbook} />
      </main>
    </div>
  );
}
