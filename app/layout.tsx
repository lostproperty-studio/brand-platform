import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Lost Property · Brand platform', description: 'Client brand portals and AI-ready brand kits by Lost Property.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
