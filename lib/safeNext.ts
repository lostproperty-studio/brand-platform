// Where to send someone after signing in (or any ?next= / ?to= / back value): only a path on this site. Plain
// "starts with /" isn't enough: //evil.com and /\evil.com both start with / and browsers treat them as another site.
// No imports, so it can be used on the server, in the browser and in tests.

/** A same-site path to go to, or the fallback */
export function safeNext(value: unknown, fallback = '/'): string {
  const s = String(value ?? '');
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\x00-\x1f\x7f]/.test(s)) return fallback;
  // Decode once to catch encoded slashes and backslashes (/%2F%2Fevil.com, /%5Cevil.com) as well
  let decoded = s;
  try { decoded = decodeURIComponent(s); } catch { return fallback; }
  if (decoded.startsWith('//') || decoded.includes('\\')) return fallback;
  try {
    const u = new URL(s, 'https://same.invalid');
    return u.origin === 'https://same.invalid' ? u.pathname + u.search + u.hash : fallback;
  } catch { return fallback; }
}

/** The sign-in page to come back to: only the sign-in pages and invite links */
export function safeBack(value: unknown, fallback = '/login'): string {
  const s = safeNext(value, '');
  return /^\/(login(\/[\w-]+)?|join\/[\w-]+)(\?[^#]*)?$/.test(s) ? s : fallback;
}
