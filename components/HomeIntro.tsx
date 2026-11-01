'use client';
import { useState } from 'react';

// The welcome paragraph on the client's home page. Left empty, the platform writes a standard one.
export function HomeIntro({ projectId, value, fallback }: { projectId: string; value: string; fallback: string }) {
  const [msg, setMsg] = useState('');
  async function save(v: string) {
    if (v === value) return;
    setMsg('Saving…');
    const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { homeIntro: v.trim() || null } }) });
    setMsg(r.ok ? 'Saved · publish isn’t needed, it shows straight away' : 'Couldn’t save.');
  }
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div><p style={{ margin: 0 }}>Home page welcome</p><p className="mute" style={{ margin: 0 }}>The paragraph under the brand name. Leave it empty to use the standard welcome.</p></div>
      <label className="sr" htmlFor="hi">Home page welcome</label>
      <textarea id="hi" className="in" rows={3} defaultValue={value} placeholder={fallback} onBlur={(e) => save(e.target.value)} style={{ height: 'auto', padding: '8px 10px', font: 'inherit', resize: 'vertical' }} />
      <span className="mute" role="status">{msg}</span>
    </div>
  );
}
