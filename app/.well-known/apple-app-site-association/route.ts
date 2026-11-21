import { NextResponse } from 'next/server';

// Universal links for the iOS app (mobile/): sign-in links and portal links open in LP Platform when it's installed,
// and in Safari when it isn't. Needs APPLE_TEAM_ID (Apple Developer → Membership) set in Vercel.
export function GET() {
  const team = process.env.APPLE_TEAM_ID;
  const appID = `${team || 'TEAMID'}.studio.lostproperty.platform`;
  return NextResponse.json({
    applinks: { details: [{ appIDs: [appID], components: [{ '/': '/auth/*' }, { '/': '/login*' }, { '/': '/p/*' }, { '/': '/join/*' }] }] },
    webcredentials: { apps: [appID] }
  }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
