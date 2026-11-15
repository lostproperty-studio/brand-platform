// The Lost Property app icons (Writer, Director, Designer, Photographer): Steffan's final artwork on a 256 grid,
// cropped to the shared cap height and baseline. Animated with CSS (app/globals.css, .lpi): once when `play` is set,
// and on hover of the icon or the link it sits in. Colour comes from currentColor.
import type { AppKey } from '@/lib/portalVersion';

const PARTS: Record<AppKey, [string, string][]> = {
  writer: [['l1', '95.84,93.00 182.86,93.00 176.38,112.94 89.36,112.94'], ['l2', '87.73,117.94 140.28,117.94 133.80,137.87 81.24,137.87'], ['l3', '79.62,142.87 154.88,142.87 148.40,162.81 73.13,162.81'], ['cur', '168.68,136.00 174.72,136.00 163.84,169.44 157.80,169.44']],
  director: [['body', '92.83,120.03 176.14,120.03 162.19,162.92 78.88,162.92'], ['arm', '177.12,99.25 97.91,73.43 97.90,89.21 177.11,115.03']],
  photographer: [['body', '94.35,104.80 180.53,104.80 161.65,162.92 75.47,162.92'], ['hump', '113.40,92.85 147.47,92.85 142.77,107.30 108.70,107.30']],
  designer: [['left', '95.70,93.08 138.35,93.08 115.63,162.92 72.98,162.92'], ['tr', '143.35,93.08 183.00,93.08 172.46,125.50 132.81,125.50'], ['br', '131.18,130.50 170.83,130.50 160.28,162.92 120.63,162.92']]
};
const LENS = '119.88,121.83 143.93,121.83 136.12,145.88 112.07,145.88';

export function AppIcon({ app, size = 18, play = false, still = false, label }: { app: AppKey; size?: number; play?: boolean; still?: boolean; label?: string }) {
  const cls = ['lpi', `lpi-${app}`, play ? 'lpi-load' : '', still ? 'lpi-still' : ''].filter(Boolean).join(' ');
  const shapes = PARTS[app].map(([p, pts]) => <polygon key={p} className={`p-${p}`} points={pts} />);
  const mask = `lpi-mask-${size}`;
  return <svg className={cls} width={size} height={size} viewBox="68 68 120 120" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {app === 'photographer' ? <>
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><rect width="256" height="256" fill="#fff" /><polygon className="p-lens" fill="#000" points={LENS} /></mask>
      <g mask={`url(#${mask})`}>{shapes}</g>
    </> : shapes}
  </svg>;
}
