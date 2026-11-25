'use client';
import { useMemo } from 'react';
import { PanelShell } from '@/components/panel/PanelShell';
import { PanelSession } from '@/components/panel/linkSession';
import { googleHost, googleName, googleOpen } from '@/components/panel/hosts/google';

export function GooglePanel({ hint, app }: { hint?: string; app?: string }) {
  const session = useMemo(() => new PanelSession('', 'google'), []);
  const host = useMemo(() => googleHost(app), [app]);
  return <PanelShell session={session} where={googleName(app)} hint={hint} hostApi={host} openUrl={googleOpen} />;
}
