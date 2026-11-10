import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  agentRules: false,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async redirects() {
    return [
      { source: '/projects/interaction-motion', destination: '/#projects', permanent: true },
      { source: '/projects', destination: '/#projects', permanent: true },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ] },
      ...['/owner', '/owner/:path*', '/api/owner/:path*'].map((source) => ({ source, headers: [
        { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        { key: 'CDN-Cache-Control', value: 'no-store' },
        { key: 'Netlify-CDN-Cache-Control', value: 'no-store' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      ] })),
    ];
  },
};

export default nextConfig;
