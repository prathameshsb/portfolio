// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import queryData from '@/data/projects/findem-query-insights-hub.json';
import { Gallery } from '@/components/case-study/Gallery';
import { OwnershipTabs } from '@/components/case-study/OwnershipTabs';
import { parseProject, visitNativeNodes, type NativeNode } from '@/lib/content/types';

const project = parseProject(queryData);
function moduleNode(kind: string): NativeNode {
  let found: NativeNode | undefined;
  for (const section of project.sections) visitNativeNodes(section.node, node => { if (!found && node.attrs?.['data-content-module'] === kind) found = node; });
  if (!found) throw new Error(`Missing source module ${kind}`);
  return found;
}
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('cycles all source gallery slides and respects keyboard boundaries with distinct analytics scope', () => {
  render(<Gallery node={moduleNode('gallery')} analyticsId="query-gallery-1" />);
  expect(screen.getByText('Slide 1 of 4')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(screen.getByText('Slide 4 of 4')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Scroll to page 2' }));
  expect(screen.getByText('Slide 2 of 4')).toBeTruthy();
  const selectedDot = screen.getByRole('button', { name: 'Scroll to page 2' });
  expect(selectedDot.style.backgroundColor).toBe('transparent');
  expect((selectedDot.firstElementChild as HTMLElement).style.opacity).toBe('1');
  expect((screen.getByRole('button', { name: 'Scroll to page 1' }).firstElementChild as HTMLElement).style.opacity).toBe('0.5');
  expect(screen.getByRole('button', { name: 'Scroll to page 2' }).getAttribute('data-analytics-target')).toBe('query-gallery-1-slide-2');
  fireEvent.keyDown(screen.getByRole('region', { name: 'Case study image gallery' }), { key: 'Home' });
  expect(screen.getByText('Slide 1 of 4')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('region', { name: 'Case study image gallery' }), { key: 'End' });
  expect(screen.getByText('Slide 4 of 4')).toBeTruthy();
});

it('switches source ownership panels through click and keyboard with exact implementation copy', () => {
  render(<OwnershipTabs node={moduleNode('ownership-tabs')} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Implementation' }));
  expect(screen.getByRole('tabpanel').textContent).toContain('reusable React and TypeScript patterns');
  expect(screen.getByRole('tab', { name: 'Implementation' }).getAttribute('data-analytics-target')).toBe('ownership-build');
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Implementation' }), { key: 'Home' });
  expect(screen.getByRole('tab', { name: 'Product Design' }).getAttribute('aria-selected')).toBe('true');
});
