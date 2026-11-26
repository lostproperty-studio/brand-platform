/** @type {import('next').NextConfig} */
const nextConfig = {
  // next/image isn't used, so the image optimiser (/_next/image) is switched off: it can't be used to fetch and
  // process images from other sites, and its security bugs don't apply
  images: { unoptimized: true },
  // Don't announce the framework in every response
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  // The health check reads the migration file names
  outputFileTracingIncludes: { '/api/health': ['./supabase/migrations/*.sql'] }
};
export default nextConfig;
