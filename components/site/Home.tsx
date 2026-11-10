'use client';

import { createElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import homeData from '@/data/home.json';
import desktopLayouts from '@/data/home-layout-gf.json';
import phoneLayouts from '@/data/home-layout-kf.json';
import { NativeContent } from '@/components/content/NativeContent';
import { assertNativeNode, type NativeNode } from '@/lib/content/types';
import { DotVideo } from './DotVideo';
import { ReadNext, SocialLinks } from '@/components/case-study/ReadNext';
import './social-interactions.css';
import './home-interactions.css';

type View = 'selected' | 'all' | 'personal' | 'work';
type Tile = 'query' | 'nexa' | 'system' | 'gryphon' | 'design' | 'checkout' | 'password' | 'flex' | 'needs' | 'snap' | 'incluvie' | 'chaos';
type LayoutItem = [Tile, number, number, number, number];
type Layout = { rows: number; items: LayoutItem[] };
const root: NativeNode = (() => { const value: unknown = homeData.root; assertNativeNode(value); return value; })();
const featured = new Set<Tile>(['query', 'nexa', 'system', 'gryphon']);
const decorative = new Set<Tile>(['design', 'needs', 'chaos']);
const personal = new Set<Tile>(['nexa', 'system', 'flex', 'snap', 'incluvie']);
const work = new Set<Tile>(['query', 'gryphon', 'checkout', 'password']);
const destinations: Partial<Record<Tile, string>> = {
  query: 'findem-query-insights-hub', nexa: 'nexa', system: 'nexa-design-system', gryphon: 'gryphon-sales-analytics',
  checkout: 'findem-checkout-flow', password: 'findem-password-validator', flex: 'flexrent', snap: 'snapkart', incluvie: 'incluvie',
};

function activeTile(tile: Tile, view: View) {
  return decorative.has(tile) || view === 'all' || (view === 'selected' ? featured : view === 'personal' ? personal : work).has(tile);
}

export function bentoLayout(phone: boolean, view: View, expanded: Tile | null): Layout {
  const source = (phone ? phoneLayouts : desktopLayouts)[view];
  let items = source.items.filter((item) => item[0] !== 'motion').map((item) => [...item] as LayoutItem);
  if (!phone) {
    const last = items.filter((item) => item[2] === (view === 'personal' ? 5 : view === 'work' ? 9 : 8));
    const incluvie = last.find((item) => item[0] === 'incluvie');
    const chaos = last.find((item) => item[0] === 'chaos');
    if (incluvie && chaos) { incluvie[1] = 0; incluvie[3] = 3; chaos[1] = 3; chaos[3] = 3; }
  }
  if (phone) {
    const occupied = new Set<string>();
    let cursor = 0;
    items = items.map(([key, , , width, height]) => {
      if (key === expanded) { width = 2; height = 2; }
      if (key === 'chaos') width = 2;
      let x = 0, y = 0;
      for (;;) {
        x = cursor % 2; y = Math.floor(cursor / 2);
        let fits = x + width <= 2;
        for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++) if (occupied.has(`${column}:${row}`)) fits = false;
        if (fits) break;
        cursor++;
      }
      for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++) occupied.add(`${column}:${row}`);
      return [key, x, y, width, height];
    });
    return { rows: Math.max(...items.map((item) => item[2] + item[4])), items };
  }
  if (!expanded) return { rows: source.rows, items };
  const current = items.find((item) => item[0] === expanded);
  if (!current) return { rows: source.rows, items };
  let start = current[2], end = start + current[4], changed = true;
  while (changed) {
    changed = false;
    for (const item of items) if (item[2] < end && item[2] + item[4] > start) {
      const nextStart = Math.min(start, item[2]), nextEnd = Math.max(end, item[2] + item[4]);
      if (nextStart !== start || nextEnd !== end) { start = nextStart; end = nextEnd; changed = true; }
    }
  }
  const group = items.filter((item) => item[2] < end && item[2] + item[4] > start);
  let replacement: LayoutItem[];
  if (group.length === 5 && expanded === 'nexa') {
    replacement = [['query', 0, start, 1, 3], ['nexa', 1, start, 5, 3], ...group.filter((item) => item[0] !== 'query' && item[0] !== 'nexa').map((item, index): LayoutItem => [item[0], index * 2, start + 3, 2, 2])];
  } else if (group.length === 5 && expanded === 'gryphon') {
    replacement = [['query', 0, start, 4, 2], ['nexa', 4, start, 2, 2], ['system', 0, start + 2, 2, 2], ['gryphon', 2, start + 2, 4, 2], ['design', 0, start + 4, 6, 1]];
  } else if (group.length === 5 && expanded === 'system') {
    replacement = [['query', 0, start, 4, 2], ['nexa', 4, start, 2, 2], ['system', 0, start + 2, 4, 2], ['gryphon', 4, start + 2, 2, 2], ['design', 0, start + 4, 6, 1]];
  } else if (group.length === 5) {
    const width = expanded === 'query' ? 5 : 4;
    const companion: Tile = expanded === 'nexa' ? 'query' : 'nexa';
    replacement = [[expanded, 0, start, width, 3], [companion, width, start, 6 - width, 3], ...group.filter((item) => item[0] !== expanded && item[0] !== companion).map((item, index): LayoutItem => [item[0], index * 2, start + 3, 2, 2])];
  } else {
    const others = group.filter((item) => item[0] !== expanded);
    replacement = [[expanded, current[1] > 0 ? 2 : 0, start, 4, 2], ...others.map((item, index): LayoutItem => [item[0], current[1] > 0 ? 0 : 4, start + index * (2 / others.length), 2, 2 / others.length])];
  }
  const delta = Math.max(...replacement.map((item) => item[2] + item[4])) - end;
  return { rows: source.rows + delta, items: [...items.filter((item) => !group.includes(item)).map(([key, x, y, width, height]): LayoutItem => [key, x, y >= end ? y + delta : y, width, height]), ...replacement] };
}

function Greeting() {
  const greetings = ['Hello', 'Hola', 'こんにちは', 'Bonjour', '안녕하세요', 'Olá', '你好', 'Namaste'];
  const [cycle, setCycle] = useState({ index: 0, previous: null as number | null });
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const advance = () => { setCycle((value) => ({ index: (value.index + 1) % greetings.length, previous: value.index })); timer = setTimeout(advance, 3750); };
    timer = setTimeout(advance, 1916.667);
    return () => clearTimeout(timer);
  }, [greetings.length]);
  function line(index: number, exiting: boolean) {
    const word = greetings[index];
    return <span className="portfolio-greeting-line" key={`${index}-${exiting}`}>
      {Array.from(word).map((letter, position) => <span key={position} className={cycle.previous === null ? undefined : exiting ? 'greeting-exit' : 'greeting-enter'} style={{ animationDelay: `${(exiting ? .4125 : .55) * position / Math.max(1, word.length - 1)}s` }}>{letter}</span>)}
    </span>;
  }
  return <div className="portfolio-greeting" aria-hidden="true" style={{ fontFeatureSettings: '"ss01" on, "ss10" on, "ss11" on, "ss02" on, "ss03" on, "ss04" on, "ss06" on, "ss05" on, "ss07" on, "ss08" on, "ss09" on, "salt" on' }}>{cycle.previous !== null ? line(cycle.previous, true) : null}{line(cycle.index, false)}</div>;
}

function LottieCharacter() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let destroyed = false;
    let animation: import('lottie-web').AnimationItem | undefined;
    void import('lottie-web').then(({ default: lottie }) => {
      if (!container.current || destroyed) return;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      animation = lottie.loadAnimation({ container: container.current, renderer: 'svg', loop: false, autoplay: !reduced, path: '/assets/c75abbcbc8d56cf7.json' });
      let direction: 1 | -1 = 1;
      animation.addEventListener('complete', () => { if (reduced) return; direction = direction === 1 ? -1 : 1; animation?.setDirection(direction); animation?.play(); });
    });
    return () => { destroyed = true; animation?.destroy(); };
  }, []);
  return <div ref={container} className="portfolio-lottie-character" aria-hidden="true" />;
}

function ReflectionStack({ node }: { node: NativeNode }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const cards = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    const shifts = new Map<HTMLElement, number>();
    let frame = 0;
    function keepHeadingBands() {
      frame = 0;
      const last = cards.at(-1);
      if (!last) return;
      const lastTop = last.getBoundingClientRect().top;
      const lastOffset = parseFloat(last.style.getPropertyValue('--reflection-offset')) || 0;
      const leaving = lastTop < parseFloat(getComputedStyle(last).top) - .5;
      for (const card of cards.slice(0, -1)) {
        const naturalTop = card.getBoundingClientRect().top - (shifts.get(card) || 0);
        const offset = parseFloat(card.style.getPropertyValue('--reflection-offset')) || 0;
        const shift = leaving ? Math.min(0, lastTop - lastOffset + offset - naturalTop) : 0;
        card.style.translate = `0 ${shift}px`;
        shifts.set(card, shift);
      }
    }
    function measure() {
      let offset = 0;
      for (const card of cards) {
        card.style.setProperty('--reflection-offset', `${offset}px`);
        const title = Array.from(card.querySelectorAll('p')).find((paragraph) => paragraph.getBoundingClientRect().height > 0);
        if (title) offset += parseFloat(getComputedStyle(card).paddingTop) + title.getBoundingClientRect().height + 16;
      }
      keepHeadingBands();
    }
    function scroll() { if (!frame) frame = requestAnimationFrame(keepHeadingBands); }
    const observer = new ResizeObserver(measure);
    cards.forEach((card) => observer.observe(card));
    measure();
    void document.fonts.ready.then(measure);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', scroll); cancelAnimationFrame(frame); };
  }, []);
  return <div {...node.attrs} ref={host} className={`${node.attrs?.className || ''} portfolio-reflection-stack`} style={node.style}>
    {node.children?.map((child, index) => typeof child === 'string' ? child : <NativeContent key={index} node={child} />)}
  </div>;
}

function ProjectFilter({ node, view, onView }: { node: NativeNode; view: View; onView: (view: View) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const categories = useRef<HTMLDivElement>(null);
  const scrolling = useRef<HTMLDivElement>(null);
  const hint = node.children?.find((child): child is NativeNode => typeof child !== 'string' && child.attrs?.className === 'portfolio-interaction-hint');
  useEffect(() => { if (open) scrolling.current?.scrollTo({ left: scrolling.current.scrollWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }, [open]);
  function close() { setOpen(false); scrolling.current?.scrollTo({ left: 0 }); }
  const buttons: [View, string][] = [['selected', 'Selected projects'], ['all', 'All projects']];
  return <nav {...node.attrs} id="projects" style={node.style} onKeyDown={(event) => { if (event.key === 'Escape' && open) { close(); toggle.current?.focus(); } }}>
    <div className="portfolio-filter-pill"><div className="portfolio-filter-scroll" ref={scrolling}>
      <div className="portfolio-primary-views">{buttons.map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => onView(id)} data-analytics-target={`filter-${id}`}>{label}</button>)}</div>
      {open ? <div role="group" aria-label="Project categories" id="project-categories" ref={categories} className="portfolio-filter-categories">{(['personal', 'work'] as const).map((id) => <button key={id} type="button" aria-pressed={view === id} onClick={() => onView(id)} data-analytics-target={`filter-${id}`}>{id === 'personal' ? 'Personal projects' : 'Work projects'}</button>)}</div> : null}
    </div><button ref={toggle} type="button" className="portfolio-filter-expand" aria-label={`${open ? 'Close' : 'Open'} project category filters${view === 'personal' || view === 'work' ? `, ${view} projects active` : ''}`} aria-expanded={open} aria-controls={open ? 'project-categories' : undefined} title="Filter by project category" onClick={(event) => { if (open) close(); else { setOpen(true); if (event.detail === 0) requestAnimationFrame(() => categories.current?.querySelector('button')?.focus()); } }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button></div><span className="visually-hidden" aria-live="polite" aria-atomic="true">{view === 'selected' ? 'Four selected projects highlighted.' : view === 'all' ? 'All projects highlighted.' : `${view === 'personal' ? 'Personal' : 'Work'} projects highlighted. Other projects remain in the grid.`}</span>
    {hint ? <NativeContent node={hint} /> : null}
  </nav>;
}

function BentoGrid({ node, view, renderMedia }: { node: NativeNode; view: View; renderMedia: (node: NativeNode) => ReactNode | undefined }) {
  const phone = node.attrs?.['data-bento-columns'] === '2';
  const columns = phone ? 2 : 6;
  const grid = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(phone ? 360 : String(node.attrs?.className).includes('framer-xikbaj') ? 704 : 1100);
  const [expansion, setExpansion] = useState<{ tile: Tile; view: View } | null>(null);
  const expanded = expansion?.view === view ? expansion.tile : null;
  function setExpanded(tile: Tile | null) { setExpansion(tile ? { tile, view } : null); }
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverBlocked = useRef(false);
  const hoverUnlockAt = useRef(0);
  const previousRects = useRef(new Map<string, DOMRect>());
  const touchIntent = useRef<{ key: Tile; alreadyExpanded: boolean } | null>(null);
  const layout = bentoLayout(phone, view, expanded);
  const placements = new Map(layout.items.map((item) => [item[0], item]));
  const rowHeight = phone ? Math.max(210, Math.min(280, (width - 10) / 2 * 1.15)) : (width - (columns - 1) * 10) / columns;
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(element);
    function blockHover() { clearTimeout(hoverTimer.current); hoverTimer.current = undefined; hoverBlocked.current = true; hoverUnlockAt.current = Date.now() + 200; }
    window.addEventListener('scroll', blockHover, { capture: true, passive: true });
    window.addEventListener('wheel', blockHover, { passive: true });
    return () => { observer.disconnect(); clearTimeout(hoverTimer.current); clearTimeout(leaveTimer.current); window.removeEventListener('scroll', blockHover, true); window.removeEventListener('wheel', blockHover); };
  }, []);
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    for (const element of grid.current?.querySelectorAll<HTMLElement>('[data-bento-key]') ?? []) {
      const key = element.dataset.bentoKey || '';
      const rect = element.getBoundingClientRect(), previous = previousRects.current.get(key);
      next.set(key, rect);
      if (previous && rect.width && rect.height && previous.width && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const x = previous.x - rect.x, y = previous.y - rect.y;
        if (Math.abs(x) + Math.abs(y) + Math.abs(previous.width - rect.width) > 1) element.animate([{ transformOrigin: '0 0', transform: `translate(${x}px,${y}px) scale(${previous.width / rect.width},${previous.height / rect.height})` }, { transformOrigin: '0 0', transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    }
    previousRects.current = next;
  });

  function override(child: NativeNode): ReactNode | undefined {
    const key = child.attrs?.['data-bento-key'] as Tile | undefined;
    if (!key) return renderMedia(child);
    const position = placements.get(key);
    if (!position) return null;
    const enabled = activeTile(key, view), interactive = enabled && !decorative.has(key);
    const [, x, y, tileWidth, tileHeight] = position;
    const attrs = { ...child.attrs, className: `${String(child.attrs?.className || '').replace(/\sportfolio-project-filter-dim/g, '')}${enabled ? '' : ' portfolio-project-filter-dim'}`, href: interactive ? `/projects/${destinations[key]}` : undefined,
      'aria-disabled': interactive ? undefined : child.tag === 'a' ? true : undefined, tabIndex: interactive ? 0 : -1,
      'data-card-locked': interactive ? 'false' : 'true', 'data-portfolio-hover-disabled': interactive ? 'false' : 'true',
      'data-card-expanded': expanded === key ? 'true' : 'false', 'data-card-compressed': expanded && expanded !== key ? 'true' : 'false',
      'data-portfolio-view': view, 'data-analytics-target': interactive ? `project-${destinations[key]}` : undefined };
    const style: CSSProperties = { ...child.style, gridColumn: `${x + 1} / span ${tileWidth}`, gridRow: `${y + 1} / span ${tileHeight}`, order: y * columns + x };
    const expand = (fromMove = false) => {
      if (!interactive) return;
      if (expanded === key) clearTimeout(leaveTimer.current);
      if (hoverBlocked.current) { if (!fromMove || Date.now() < hoverUnlockAt.current) return; hoverBlocked.current = false; }
      clearTimeout(leaveTimer.current);
      if (expanded !== key && hoverTimer.current === undefined) hoverTimer.current = setTimeout(() => { hoverTimer.current = undefined; setExpanded(key); }, 300);
    };
    function contentOverride(content: NativeNode): ReactNode | undefined {
      if (content.tag === 'a') {
        const safe = { ...content.attrs }; delete safe.href; delete safe.target; delete safe.rel; delete safe.download;
        return <NativeContent node={{ ...content, tag: 'span', attrs: safe }} renderOverride={contentOverride} />;
      }
      return renderMedia(content);
    }
    return createElement(interactive ? 'a' : child.tag, { ...attrs, style,
      onPointerDown: (event: React.PointerEvent) => { touchIntent.current = event.pointerType !== 'mouse' ? { key, alreadyExpanded: expanded === key } : null; },
      onPointerEnter: (event: React.PointerEvent) => { if (event.pointerType === 'mouse' && matchMedia('(hover: hover) and (pointer: fine)').matches) expand(); },
      onPointerMove: (event: React.PointerEvent) => { if (event.pointerType === 'mouse' && (event.movementX !== 0 || event.movementY !== 0) && matchMedia('(hover: hover) and (pointer: fine)').matches) expand(true); },
      onPointerLeave: (event: React.PointerEvent) => { if (event.pointerType === 'mouse') { clearTimeout(hoverTimer.current); hoverTimer.current = undefined; leaveTimer.current = setTimeout(() => setExpanded(null), 180); } },
      onFocus: (event: React.FocusEvent<HTMLElement>) => { if (interactive && event.currentTarget.matches(':focus-visible')) setExpanded(key); }, onBlur: () => setExpanded(null),
      onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setExpanded(null); } },
      onClick: (event: React.MouseEvent) => { if (!interactive) event.preventDefault(); else if (event.detail > 0 && matchMedia('(hover: none)').matches && !(touchIntent.current?.key === key && touchIntent.current.alreadyExpanded)) { event.preventDefault(); setExpanded(key); } },
    }, child.children?.map((content, index) => typeof content === 'string' ? content : <NativeContent key={index} node={content} renderOverride={contentOverride} />));
  }
  return <div {...node.attrs} ref={grid} data-bento-columns={columns} data-bento-rows={layout.rows} style={{ ...node.style, display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gridTemplateRows: `repeat(${layout.rows}, ${rowHeight}px)`, gap: 10, height: layout.rows * rowHeight + (layout.rows - 1) * 10 }}>
    {node.children?.map((child, index) => typeof child === 'string' ? child : <NativeContent key={index} node={child} renderOverride={override} />)}
  </div>;
}

export function Home() {
  const [view, setView] = useState<View>('selected');
  function mediaOverride(node: NativeNode): ReactNode | undefined {
    if (node.attrs?.className === 'framer-1avkvq3') return <div {...node.attrs}><Greeting /></div>;
    if (node.attrs?.className === 'framer-1rwpzs6-container' || node.attrs?.className === 'framer-12tomyq-container') return <div {...node.attrs} style={node.style}><LottieCharacter /></div>;
    if (node.tag === 'canvas' && node.attrs?.width === '0') return <DotVideo />;
    return undefined;
  }
  function override(node: NativeNode): ReactNode | undefined {
    if (node.attrs?.className === 'portfolio-project-filter') return <ProjectFilter node={node} view={view} onView={setView} />;
    if (node.attrs?.['data-framer-name'] === 'Bento Grid') return <BentoGrid node={node} view={view} renderMedia={mediaOverride} />;
    if (node.attrs?.className === 'framer-1ujpnbw') return <ReflectionStack node={node} />;
    if (node.attrs?.['data-framer-name'] === 'Social Links') return <SocialLinks node={node} />;
    if (node.attrs?.['data-framer-name'] === 'Next Section') return <ReadNext node={node} />;
    return mediaOverride(node);
  }
  return <><link rel="stylesheet" href="/styles/home.css" precedence="portfolio-source" /><NativeContent node={root} renderOverride={override} /></>;
}
