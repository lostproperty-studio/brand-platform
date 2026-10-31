'use client';
import { useState } from 'react';

// A colour swatch: click (or press Enter) to copy its HEX code.
export function Swatch({ name, hex, note, ink, className = 'gb-swc' }: { name: string; hex: string; note?: string; ink: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(hex); } catch { /* clipboard blocked */ } setCopied(true); setTimeout(() => setCopied(false), 1300); };
  return (
    <button type="button" className={className + ' sw-btn'} style={{ background: hex, color: ink }} onClick={copy} aria-label={`${name}, ${hex}. Copy HEX`}>
      <span className="gb-swn">{name}</span>
      <span className="sw-meta"><span className="sw-hex">{copied ? 'Copied' : hex}</span>{note ? <span style={{ opacity: .75 }}>{note}</span> : null}<span className="sw-hint">{copied ? '✓ on your clipboard' : 'Click to copy'}</span></span>
    </button>
  );
}
