import { describe, expect, it } from 'vitest';
import { nativeAnalyticsTarget } from '@/components/content/NativeContent';

describe('native content analytics targets', () => {
  it('uses semantic destinations without URL query values', () => {
    expect(nativeAnalyticsTarget({ tag: 'a', attrs: { href: '/projects/nexa?private=secret' } })).toBe('project-nexa');
    expect(nativeAnalyticsTarget({ tag: 'a', attrs: { href: 'https://www.figma.com/proto/private?token=secret' } })).toBe('external-www-figma-com');
    expect(nativeAnalyticsTarget({ tag: 'a', attrs: { href: 'mailto:private@example.com' } })).toBe('contact-email');
    expect(nativeAnalyticsTarget({ tag: 'a', attrs: { href: '/resume.pdf' } })).toBe('resume-download');
  });
  it('preserves explicit targets and ignores non-links', () => {
    expect(nativeAnalyticsTarget({ tag: 'a', attrs: { href: '/', 'data-analytics-target': 'read-next' } })).toBe('read-next');
    expect(nativeAnalyticsTarget({ tag: 'button', attrs: { 'aria-label': 'Private form value' } })).toBeUndefined();
    expect(nativeAnalyticsTarget({ tag: 'a', attrs: { href: '/' } })).toBe('nav-home');
  });
});
