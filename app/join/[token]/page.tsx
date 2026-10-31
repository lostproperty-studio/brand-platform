import { redirect } from 'next/navigation';
import { adminClient, currentUser } from '@/lib/supabase/server';
import { addMember, findInvite, ROLE_HELP, ROLE_LABEL } from '@/lib/team';
import { projectBranding } from '@/lib/branding';
import { LoginScreen } from '@/components/LoginScreen';
import { sendSignInLink } from '@/lib/auth/sendLink';
import { logActivity } from '@/lib/activity';

// Joining a portal from an invite link: sign in with your email, then you're added with the link's role.
export default async function Join({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const inv = await findInvite(token);
  const b = inv.project ? await projectBranding(inv.project.slug) : null;
  if (!b) return <main className="auth"><div style={{ maxWidth: 320 }}><img src="/lp-logo.svg" alt="Lost Property" width={64} /><p>{'error' in inv ? inv.error : 'This invite link doesn’t exist.'}</p></div></main>;
  if (!('link' in inv) || !inv.link) return <LoginScreen b={b} heading="Invite link not valid"><p className="ls-msg">{(inv as { error: string }).error} Ask your team’s admin for a new one.</p></LoginScreen>;

  const user = await currentUser();
  if (user) {
    const sb = adminClient();
    const { data: existing } = await sb.from('project_members').select('role').eq('project_id', inv.link.projectId).eq('user_id', user.id).maybeSingle();
    const { data: staff } = await sb.from('staff').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!existing && !staff) {
      await addMember(inv.link.projectId, user.id, inv.link.role, user.email || null, null);
      await sb.from('invite_links').update({ uses: inv.link.uses + 1 }).eq('id', inv.link.id);
      await logActivity(inv.link.projectId, user.id, 'join', ROLE_LABEL[inv.link.role]);
    }
    redirect(`/p/${b.slug}`);
  }
  return (
    <LoginScreen b={b} heading={`You’re invited to the ${b.client} brand guidelines`}>
      <p className="ls-msg">You’ll join as a <strong>{ROLE_LABEL[inv.link.role]}</strong>. {ROLE_HELP[inv.link.role]}</p>
      {sp.sent ? <p className="ls-msg">Check your email for a sign-in link. Open it on this device to finish joining.</p> : <form action={sendSignInLink} className="ls-form">
        <label htmlFor="email">Your work email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="ls-in" />
        <input type="hidden" name="next" value={`/join/${token}`} /><input type="hidden" name="back" value={`/join/${token}`} />
        <button className="ls-btn" type="submit">Join</button>
        {sp.error ? <p className="ls-msg">That didn’t work. Check the address and try again.</p> : null}
      </form>}
    </LoginScreen>
  );
}
