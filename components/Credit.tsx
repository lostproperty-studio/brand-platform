// The studio credit, as in the Lost Property design system. Wherever it appears, it's the same and links to the studio.
export function Credit({ className }: { className: string }) {
  return (
    <a className={className} href="https://lostproperty.studio" target="_blank" rel="noopener">
      Designed and built by <span className="credit-lp"><img src="/lp-logo.svg" alt="" /> Lost Property Studio</span>
    </a>
  );
}
