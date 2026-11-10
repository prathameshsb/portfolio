// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SectionRenderer } from '@/components/case-study/SectionRenderer';
import { ReadNext, SocialLinks } from '@/components/case-study/ReadNext';
import { parseProject } from '@/lib/content/types';
import queryData from '@/data/projects/findem-query-insights-hub.json';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('adds stable hooks to every responsive related link and removes nested keyboard link targets', () => {
  vi.stubGlobal('React', React);
  const project = parseProject(queryData);
  for (const section of project.sections.filter(section => section.kind === 'related')) render(<ReadNext node={section.node} />);
  const links = screen.getAllByRole('link');
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/projects/findem-checkout-flow');
    expect(link.hasAttribute('data-read-next-link')).toBe(true);
    expect(link.querySelector('[role="link"]')).toBeNull();
    expect(link.querySelector('[tabindex]')).toBeNull();
  }
});
it('marks social groups without changing their destinations', () => {
  vi.stubGlobal('React', React);
  const { container } = render(<SocialLinks node={{ tag: 'div', children: [{ tag: 'a', attrs: { href: 'mailto:owner@example.com' }, children: ['@'] }] }} />);
  expect(container.querySelector('[data-portfolio-social]')).toBeTruthy();
  expect(screen.getByRole('link').getAttribute('href')).toBe('mailto:owner@example.com');
});

it('limits Read Next hooks to related sections instead of other narrative or hero links', () => {
  vi.stubGlobal('React', React);
  const project = parseProject(queryData);
  const { container } = render(<>{project.sections.map(section => <SectionRenderer key={section.id} section={section} />)}</>);
  expect(container.querySelectorAll('[data-portfolio-read-next]').length).toBe(project.sections.filter(section => section.kind === 'related').length);
  for (const link of container.querySelectorAll('[data-read-next-link]')) expect(link.getAttribute('href')).toBe('/projects/findem-checkout-flow');
});
