'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// In the studio's Settings: what the client's Claude connector may hand out. Font files are off by default, since
// many font licences don't allow passing them on; when off, the connector says to ask Lost Property for them.
export function ConnectorSettings({ projectId, shareFontFiles }: { projectId: string; shareFontFiles: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(shareFontFiles);
  const [msg, setMsg] = useState('');
  async function flip() {
    const next = !on; setOn(next); setMsg('Saving…');
    const r = await fetch(`/api/projects/${projectId}/connector-settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shareFontFiles: next }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setOn(!next);
    setMsg(r.ok ? 'Saved.' : j.error || 'Couldn’t save.');
    router.refresh();
  }
  return (
    <div className="card psw">
      <div><p style={{ margin: 0 }}>Claude connector</p><p className="mute" style={{ margin: 0 }}>What the client’s own Claude can download from the published kit.</p></div>
      <ul className="psw-list">
        <li>
          <label className="psw-row">
            <span><span className="psw-name">Share font files</span><span className="mute psw-about">Gives download links to the licensed font files. Only switch on if the font licence allows the client to have them; otherwise the connector tells them to ask Lost Property.</span></span>
            <input type="checkbox" role="switch" className="psw-tog" checked={on} onChange={flip} aria-label="Share font files through the Claude connector" />
          </label>
        </li>
      </ul>
      <span className="mute" role="status">{msg}</span>
    </div>
  );
}
