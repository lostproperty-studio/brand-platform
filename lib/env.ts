// Server-only environment access. Throws early with a clear message when something is missing.
// GitHub private keys get mangled when pasted (newlines lost or turned into spaces, or stored base64). Rebuild a clean PEM.
export function normalisePem(raw: string) {
  let v = raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  if (!v.includes('-----BEGIN')) { try { v = Buffer.from(v, 'base64').toString('utf8').trim(); } catch { /* leave as is */ } }
  const m = v.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) return v;
  const body = m[2].replace(/\s+/g, '');
  return `-----BEGIN ${m[1]}-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END ${m[1]}-----\n`;
}
const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing environment variable ${k}. See .env.example.`);
  return v;
};
export const env = {
  supabaseUrl: () => need('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnon: () => need('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseService: () => need('SUPABASE_SERVICE_ROLE_KEY'),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  studioDomains: () => (process.env.STUDIO_EMAIL_DOMAINS || 'lostproperty.studio').split(',').map((d) => d.trim().toLowerCase()),
  figmaToken: () => need('FIGMA_TOKEN'),
  anthropicStudioKey: () => need('ANTHROPIC_API_KEY'),
  // Needed when the studio key isn't tied to one workspace (newer Anthropic keys). Not secret.
  anthropicWorkspace: () => process.env.ANTHROPIC_WORKSPACE_ID || '',
  github: () => ({ appId: need('GITHUB_APP_ID'), privateKey: normalisePem(need('GITHUB_APP_PRIVATE_KEY')), installationId: Number(need('GITHUB_APP_INSTALLATION_ID')), org: need('GITHUB_ORG') })
};
