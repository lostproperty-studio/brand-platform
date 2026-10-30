/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }, { protocol: 'https', hostname: 'figma-alpha-api.s3.us-west-2.amazonaws.com' }] },
  experimental: { serverActions: { bodySizeLimit: '25mb' } }
};
export default nextConfig;
