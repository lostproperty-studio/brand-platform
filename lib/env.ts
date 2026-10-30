// Server-only environment access. Throws early with a clear message when something is missing.
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
  keySecret: () => need('KEY_ENCRYPTION_SECRET'),
  studioDomains: () => (process.env.STUDIO_EMAIL_DOMAINS || 'lostproperty.studio').split(',').map((d) => d.trim().toLowerCase()),
  figmaToken: () => need('FIGMA_TOKEN'),
  anthropicStudioKey: () => need('ANTHROPIC_API_KEY'),
  github: () => ({ appId: need('GITHUB_APP_ID'), privateKey: need('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'), installationId: Number(need('GITHUB_APP_INSTALLATION_ID')), org: need('GITHUB_ORG') })
};
