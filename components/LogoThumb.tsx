import type { LogoThumb as T } from '@/lib/projects/logoThumb';

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

/** The project's logo on its primary colour; the client's name in the brand's ink if there's no logo yet */
export function LogoThumb({ t, size = 'md' }: { t: T; size?: 'md' | 'lg' }) {
  return <span className={'lt lt-' + size} style={{ background: t.bg }}>
    {t.logo ? <img src={t.logo} alt="" /> : <span style={{ color: lum(t.bg) < 0.5 ? '#fff' : '#000' }}>{t.client}</span>}
  </span>;
}
