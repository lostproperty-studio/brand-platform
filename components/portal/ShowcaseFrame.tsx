import { codeDoc, type ShowcaseFrame } from '@/lib/showcase';

// One frame of the showcase: an image, a looping MP4, or a code snippet running in a sandbox.
export function ShowcaseMedia({ f, url, label }: { f: ShowcaseFrame; url?: string; label?: string }) {
  const style = { objectFit: f.fit || 'cover' } as React.CSSProperties;
  if (f.kind === 'image' && url) return <img src={url} alt={f.caption || label || ''} loading="lazy" style={style} />;
  if (f.kind === 'video' && url) return <video src={url} autoPlay muted loop playsInline preload="metadata" style={style} aria-label={f.caption || label} />;
  if (f.kind === 'code' && f.code) return <iframe title={f.caption || label || 'Code'} srcDoc={codeDoc(f.code)} sandbox="allow-scripts" />;
  return null;
}
