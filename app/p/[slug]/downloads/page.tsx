import { redirect } from 'next/navigation';

// Downloads now live in Resources, as packages.
export default async function Downloads({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/p/${(await params).slug}/resources#brand`);
}
