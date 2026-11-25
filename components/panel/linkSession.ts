// The panel's session when it signs in by link (Office, Google Workspace, Figma). No imports: the Figma plugin uses
// this file too. Tokens are kept in the app's own storage for the panel, never in the platform's cookies.

type Tokens = { access_token: string; refresh_token: string; expires_at: number };
export type LinkStart = { id: string; poll: string; words: string; url: string };

export class PanelSession {
  private key: string;
  constructor(private base: string, private host: 'office' | 'google' | 'figma', private store: { get(k: string): string | null; set(k: string, v: string | null): void } = browserStore) {
    this.key = `lp-panel:${host}`;
  }
  private read(): Tokens | null { try { return JSON.parse(this.store.get(this.key) || 'null'); } catch { return null; } }
  private write(t: Tokens | null) { this.store.set(this.key, t ? JSON.stringify(t) : null); }
  get signedIn() { return !!this.read(); }
  signOut() { this.write(null); }

  async start(hint?: string): Promise<LinkStart> {
    const r = await fetch(`${this.base}/api/panel/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: this.host, hint }) });
    if (!r.ok) throw new Error(await r.text() || 'Couldn’t reach the brand portal.');
    return r.json();
  }
  /** Waits for the person to approve on the platform. Resolves true when signed in, false if the link ran out. */
  async wait(link: LinkStart, cancelled: () => boolean): Promise<boolean> {
    const until = Date.now() + 10 * 60e3;
    while (Date.now() < until && !cancelled()) {
      await new Promise((ok) => setTimeout(ok, 2000));
      const r = await fetch(`${this.base}/api/panel/link/poll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: link.id, poll: link.poll }) }).catch(() => null);
      if (!r?.ok) continue;
      const j = await r.json();
      if (j.status === 'ready') { this.write({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + j.expires_in * 1000 - 60e3 }); return true; }
      if (j.status !== 'waiting') return false;
    }
    return false;
  }
  private async token(force = false) {
    const t = this.read(); if (!t) return null;
    if (!force && t.expires_at > Date.now()) return t.access_token;
    const r = await fetch(`${this.base}/api/panel/token/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh_token }) }).catch(() => null);
    if (!r?.ok) { this.write(null); return null; }
    const j = await r.json();
    this.write({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + j.expires_in * 1000 - 60e3 });
    return j.access_token as string;
  }
  /** A call to the panel API. Throws { signin: true } when the person needs to sign in again. */
  async api(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const tok = await this.token(!retry);
    if (!tok) throw Object.assign(new Error('signin'), { signin: true });
    const r = await fetch(`${this.base}/api/panel${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${tok}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (r.status === 401 && retry) return this.api(path, init, false);
    if (r.status === 401) { this.write(null); throw Object.assign(new Error('signin'), { signin: true }); }
    return r;
  }
}

const mem = new Map<string, string>();
const browserStore = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return mem.get(k) ?? null; } },
  set(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { if (v === null) mem.delete(k); else mem.set(k, v); } }
};
