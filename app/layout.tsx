import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PublicShell } from '@/components/site/PublicShell';
import { AnalyticsCollector } from '@/components/analytics/AnalyticsCollector';
import { SourceMotion } from '@/components/site/SourceMotion';
import './globals.css';

export const metadata: Metadata = {
  title: 'Prathamesh S Borgharkar | Portfolio',
  description: 'Product Designer turning complex workflows into clear, thoughtful product experiences.',
  icons: {
    icon: '/icon-placeholder.svg',
    shortcut: '/icon-placeholder.svg',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="stylesheet" href="/styles/fonts.css" precedence="portfolio-fonts" /></head><body>
    <a className="skip-link" href="#main">Skip to content</a>
    <main id="main">{children}</main>
    <PublicShell />
    <SourceMotion />
    <Suspense fallback={null}><AnalyticsCollector /></Suspense>
  </body></html>;
}
