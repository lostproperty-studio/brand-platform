import { GooglePanel } from './GooglePanel';

export const metadata = { title: 'Brand · Lost Property' };

// The LP panel inside Google Docs, Slides and Sheets (shown in the add-on's sidebar). Loads before sign-in.
export default async function GooglePanelPage({ searchParams }: { searchParams: Promise<{ p?: string; app?: string }> }) {
  const { p, app } = await searchParams;
  return <div className="lpx-page"><GooglePanel hint={p} app={app} /></div>;
}
