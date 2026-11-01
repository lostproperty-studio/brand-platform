'use server';
import { redirect } from 'next/navigation';
import { userClient } from '@/lib/supabase/server';

/** Signs out and goes back to the sign-in page */
export async function signOut() {
  const sb = await userClient();
  await sb.auth.signOut();
  redirect('/login');
}
