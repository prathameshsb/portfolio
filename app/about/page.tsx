import type { Metadata } from 'next';
import { About } from '@/components/site/About';

export const metadata: Metadata = { title: 'About | Prathamesh S B.' };
export default function AboutPage() { return <About />; }
