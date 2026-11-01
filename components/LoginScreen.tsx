import type { Branding } from '@/lib/branding';

const lum = (hex?: string) => { if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return 1; const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

// The client's sign-in screen. The studio chooses the look per project: the client's brand with a
// Lost Property credit, or Lost Property's own. Also rendered (without the form working) as a preview in the studio.
export function LoginScreen({ b, children, preview = false, heading }: { b: Branding; children?: React.ReactNode; preview?: boolean; heading?: string }) {
  const lp = b.look.style === 'lp';
  const brandBg = b.colours.find((c) => lum(c.hex) < 0.5 && lum(c.hex) > 0.02)?.hex || b.colours[0]?.hex || '#000000';
  const bg = lp ? '#ffffff' : b.look.background === 'dark' ? '#000000' : b.look.background === 'brand' ? brandBg : '#ffffff';
  const dark = lum(bg) < 0.5;
  const logo = lp ? '/lp-logo.svg' : dark ? b.logoLightUrl || b.logoUrl : b.logoUrl;
  return (
    <div className={'ls' + (dark ? ' dark' : '') + (preview ? ' preview' : '')} style={{ background: bg, color: dark ? '#fff' : '#000' }}>
      {!lp ? <style>{b.fontCss}</style> : null}
      <div className="ls-card">
        {lp ? <div className="ls-lp"><img src="/lp-logo.svg" alt="Lost Property" /><span>Brand Platform</span></div>
          : logo ? <img className="ls-logo" src={logo} alt={b.client} style={dark && !b.logoLightUrl ? { filter: 'invert(1)' } : undefined} /> : <p className="ls-name" style={b.displayFont ? { fontFamily: b.displayFont } : undefined}>{b.client}</p>}
        <h1 className="ls-h" style={!lp && b.displayFont ? { fontFamily: b.displayFont } : undefined}>{heading || (lp ? `${b.client} brand guidelines` : 'Brand guidelines')}</h1>
        {b.look.message ? <p className="ls-msg">{b.look.message}</p> : null}
        {children}
      </div>
      <p className="ls-credit">{lp ? `For ${b.client}` : <>Designed and built by <img src="/lp-logo.svg" alt="" className="ls-credit-logo" /> Lost Property Studio</>}</p>
    </div>
  );
}
