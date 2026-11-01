import { redirect } from 'next/navigation';

// Tools now live in Resources, in the apps tray.
export default async function ToolsPage({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/p/${(await params).slug}/resources#apps`);
}
