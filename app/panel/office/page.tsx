import { OfficePanel } from './OfficePanel';

export const metadata = { title: 'Brand · Lost Property' };

// The LP panel inside Word, PowerPoint, Excel and Outlook (an Office add-in task pane). Loads before sign-in.
export default async function OfficePanelPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return <div className="lpx-page"><OfficePanel hint={p} /></div>;
}
