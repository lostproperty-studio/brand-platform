import type { MetadataRoute } from 'next';

// Installable as an app ("Platform") from Safari: Share → Add to Home Screen. It opens full screen; "/" takes the
// studio team to the studio and clients straight to their portal.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Platform',
    short_name: 'Platform',
    description: 'Your brand platform, by Lost Property.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
