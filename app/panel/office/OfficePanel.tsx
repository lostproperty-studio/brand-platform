'use client';
import { useMemo, useState } from 'react';
import Script from 'next/script';
import { PanelShell } from '@/components/panel/PanelShell';
import { PanelSession } from '@/components/panel/linkSession';
import { officeHost, officeName, openInBrowser } from '@/components/panel/hosts/office';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Office: any;

// The task pane Office opens from the Home tab. Waits for Office to be ready, then shows the panel.
export function OfficePanel({ hint }: { hint?: string }) {
  const [ready, setReady] = useState(false), [where, setWhere] = useState('Office');
  const session = useMemo(() => new PanelSession('', 'office'), []);
  return <>
    <Script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js" strategy="afterInteractive" onLoad={() => Office.onReady(() => { setWhere(officeName()); setReady(true); })} />
    {ready ? <PanelShell session={session} where={where} hint={hint} hostApi={officeHost} openUrl={openInBrowser} /> : <div className="lpx lpx-gate"><span className="lpx-mark" aria-hidden /><p className="lpx-sub">Opening…</p></div>}
  </>;
}
