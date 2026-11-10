// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { About, workCapacity } from '@/components/site/About';

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('About source interactions', () => {
  it('opens exact bio copy and dismisses with Escape, outside pointer, and close', () => {
    render(<About />);
    const expand = screen.getByRole('button', { name: 'Expand bio' });
    fireEvent.click(expand);
    const dialog = screen.getByRole('dialog', { name: 'Expanded bio' });
    expect(within(dialog).getByText('Hi, I’m Prathamesh.')).toBeTruthy();
    expect(within(dialog).getByText('I care about systems, accessibility, and the details that make products feel clear.')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(expand);
    fireEvent.click(expand); fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(expand); fireEvent.click(screen.getByRole('button', { name: 'Close bio' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps first/last work arrows bounded and shows the remaining two source jobs', () => {
    render(<About />);
    const next = screen.getAllByRole('button', { name: 'Next work experience' })[0];
    const previous = screen.getAllByRole('button', { name: 'Previous work experience' })[0];
    expect(previous.hasAttribute('disabled')).toBe(true);
    fireEvent.click(next);
    const carousel = next.closest('.about-work-carousel') as HTMLElement;
    expect(within(carousel).getByAltText('Incluvie')).toBeTruthy();
    expect(within(carousel).getByAltText('Collegepond')).toBeTruthy();
    expect(next.hasAttribute('disabled')).toBe(true);
    fireEvent.click(previous);
    expect(within(carousel).getByAltText('Patreon')).toBeTruthy();
    expect(previous.hasAttribute('disabled')).toBe(true);
  });
  it('reveals work details for keyboard focus when reduced motion is enabled', () => {
    render(<About />);
    const carousel = screen.getAllByLabelText('Work experience')[0];
    const card = within(carousel).getByAltText('Patreon').closest('.about-work-card') as HTMLElement;
    expect(within(card).queryByText('Software Engineer Frontend')).toBeNull();
    fireEvent.focus(card);
    expect(within(card).getByText('Software Engineer Frontend')).toBeTruthy();
    expect(within(card).getByText('June 2025 – Aug 2026')).toBeTruthy();
    expect(within(card).queryByText('NOW')).toBeNull();
  });
  it('marks the Connect and footer links with the shared social hook', () => {
    render(<About />);
    for (const name of ['@', 'in', 'be', 'git', 'fb', 'ig', 'psn']) {
      for (const link of screen.getAllByRole('link', { name })) expect(link.closest('[data-portfolio-social]')).toBeTruthy();
    }
  });
  it('derives group capacity from source card/overlap/padding geometry', () => {
    expect(workCapacity(836)).toBe(5);
    expect(workCapacity(624)).toBe(3);
    expect(workCapacity(300)).toBe(1);
  });
});
