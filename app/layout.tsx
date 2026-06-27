import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Portal',
  description: 'Empower Building Agent Portal',
  manifest: '/manifest.json',
  themeColor: '#1a1a1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
