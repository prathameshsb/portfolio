'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

export const RESUME_URL = 'https://drive.google.com/file/d/1mRxWlgFx4Yw4Yr17BZpjx7ZqhYDj6psQ/view?usp=sharing';

export function PublicShell() {
  const pathname = usePathname();
  if (!(pathname === '/' || pathname === '/about' || pathname.startsWith('/projects/'))) return null;
  return <nav className="site-floating-nav" aria-label="Main navigation">
    <Link href="/" data-analytics-target="nav-home" aria-current={pathname === '/' ? 'page' : undefined}>home</Link>
    <Link href="/about" data-analytics-target="nav-about" aria-current={pathname === '/about' ? 'page' : undefined}>about</Link>
    <a href={RESUME_URL} target="_blank" rel="noopener noreferrer" data-analytics-target="nav-resume"><span className="resume-shimmer">resume</span></a>
  </nav>;
}
