import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { slackCheck } from '@/lib/lp/slack';
import { nameOf } from '@/lib/guideVersions';

// Admin settings → Slack: send a test message and say what's wrong if it doesn't arrive
export async function POST() {
  const st = await requireAdmin(); if (st instanceof Response) return st;
  return NextResponse.json(await slackCheck(nameOf(st.user)));
}
