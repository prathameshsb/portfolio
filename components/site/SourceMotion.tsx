'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const properties = ['opacity', 'rotate', 'rotateX', 'rotateY', 'scale', 'skewX', 'skewY', 'transformPerspective', 'x', 'y'] as const;
type SourceFrame = Partial<Record<(typeof properties)[number], number>>;
interface SourceAnimation { default: { initial: SourceFrame; animate: SourceFrame & { transition?: Record<string, unknown> } } }

export function SourceMotion() {
  const pathname = usePathname();
  useEffect(() => {
    if (!(pathname === '/' || pathname === '/about')) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;
    let active = true;
    const controls: Array<{ stop(): void }> = [];
    const elements = new Set<HTMLElement>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || reduced.matches) continue;
        observer.unobserve(entry.target);
        const element = entry.target as HTMLElement;
        try {
          const config = JSON.parse(element.dataset.contentEnter || '{}') as SourceAnimation;
          const state = config.default;
          if (!state?.initial || !state.animate) continue;
          const transition: unknown = (state.animate as Record<string, unknown>).transition;
          const spring = transition && typeof transition === 'object' ? transition as Record<string, unknown> : {};
          const frames: Record<string, [number, number]> = {};
          for (const property of properties) {
            const from = state.initial[property], to = state.animate[property];
            if (typeof from === 'number' && typeof to === 'number' && Number.isFinite(from) && Number.isFinite(to) && Math.abs(from) <= 10_000 && Math.abs(to) <= 10_000) frames[property] = [from, to];
          }
          void import('motion').then(({ animate }) => {
            if (!active || reduced.matches) return;
            elements.add(element);
            controls.push(animate(element, frames, {
              type: 'spring',
              damping: typeof spring.damping === 'number' ? spring.damping : 60,
              mass: typeof spring.mass === 'number' ? spring.mass : 1.2,
              stiffness: typeof spring.stiffness === 'number' ? spring.stiffness : 200,
              delay: typeof spring.delay === 'number' ? spring.delay : 0,
            }));
          }).catch(() => undefined);
        } catch { /* Static content remains visible when enhancement data is unavailable. */ }
      }
    }, { threshold: 0.05 });
    document.querySelectorAll<HTMLElement>('[data-content-enter]').forEach((element) => observer.observe(element));
    function stop() { controls.forEach((control) => control.stop()); elements.forEach((element) => { element.style.opacity = '1'; element.style.transform = 'none'; }); }
    reduced.addEventListener('change', stop);
    return () => { active = false; observer.disconnect(); stop(); reduced.removeEventListener('change', stop); };
  }, [pathname]);
  return null;
}
