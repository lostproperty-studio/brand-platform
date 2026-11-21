import { FigmaPanel } from './FigmaPanel';

export const metadata = { title: 'Brand · Lost Property' };

// The LP panel inside Figma and FigJam (the plugin opens this page as its window). Loads before sign-in.
export default async function FigmaPanelPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return <div className="lpx-page"><FigmaPanel hint={p} /></div>;
}
