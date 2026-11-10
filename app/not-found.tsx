import Link from 'next/link';

export default function NotFound() {
  return <div className="page-not-found"><h1>Page not found</h1><p>This page isn’t available.</p><Link href="/">Back to the portfolio</Link></div>;
}
