// The Brand Panel's app icon: the Lost Property monogram, white on a black tile. Inline, so it travels with the
// panel into Canva and Office without loading anything. No imports: the Canva app bundle uses this file too.
const MONO = 'M1179.9,243.2L1280,0h-562.3l-131.8,320h278.5l31.6-76.8h283.8ZM410.3,0H131.8L0,320h561.5s100.1-243.2,100.1-243.2h-283L410.3,0Z';

export function LpAppIcon({ size = 44, className }: { size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 120 120" aria-hidden>
    <rect width="120" height="120" rx="27" fill="#0a0a0a" />
    <path d={MONO} fill="#fff" fillRule="evenodd" transform="translate(22 50.5) scale(0.059375)" />
  </svg>;
}
