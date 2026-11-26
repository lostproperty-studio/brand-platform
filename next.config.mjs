// What pages may load, reported (not enforced) for now: see headers() below
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://appsforoffice.microsoft.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src 'self' blob: data: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // next/image isn't used, so the image optimiser (/_next/image) is switched off: it can't be used to fetch and
  // process images from other sites, and its security bugs don't apply
  images: { unoptimized: true },
  // Don't announce the framework in every response
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  // The health check reads the migration file names
  // Security headers on every response. Pages can only be framed by this site, except the brand panel, which Office,
  // Google and Figma load in their own frames. The content security policy reports problems in the browser console
  // without blocking anything, so it can be tightened once it's quiet.
  async headers() {
    const base = [
      { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
      { key: 'Content-Security-Policy-Report-Only', value: CSP }
    ];
    return [
      { source: '/:path*', headers: base },
      // Everything but the panel: only this site may frame it
      { source: '/((?!panel/).*)', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self'" }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] }
    ];
  },
  outputFileTracingIncludes: { '/api/health': ['./supabase/migrations/*.sql'] }
};
export default nextConfig;
