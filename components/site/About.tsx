/* eslint-disable @next/next/no-css-tags, @next/next/no-img-element -- Captured scoped CSS and intrinsic source logos preserve exact rendering. */
'use client';

import { createElement, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import aboutData from '@/data/about.json';
import { NativeContent } from '@/components/content/NativeContent';
import { SocialLinks } from '@/components/case-study/ReadNext';
import { assertNativeNode, type NativeNode } from '@/lib/content/types';
import './about-interactions.css';
import './social-interactions.css';

const root: NativeNode = (() => { const value: unknown = aboutData.root; assertNativeNode(value); return value; })();
const nodes = (node: NativeNode): NativeNode[] => [node, ...(node.children ?? []).flatMap(child => typeof child === 'string' ? [] : nodes(child))];
const socialRows = new Set(['framer-1shf0da', 'framer-rv9l3i', 'framer-eq9peh']);
const bioCopy = [
  'I’m a Product Designer & Engineer based in the United States.',
  'I design complex workflows, collaborate closely with product and engineering, and carry thoughtful decisions through implementation.',
  'I’m ambitious about the work, but practical about how it gets done. I care about products that are thoughtful, accessible, and clear enough for people to trust.',
  'I care about systems, accessibility, and the details that make products feel clear.',
];

function BioButton({ node }: { node: NativeNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const updatePosition = useCallback(() => {
    const rect = button.current?.getBoundingClientRect();
    if (rect) setPosition({ position: 'fixed', left: Math.max(16, Math.min(window.innerWidth - 636, rect.right - 620 + 21.335949455737136)), top: Math.max(16, Math.min(window.innerHeight - 356, rect.bottom - 54.49999578297138)) });
  }, []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!dialog.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    window.addEventListener('resize', updatePosition); window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', keyboard);
    dialog.current?.querySelector('button')?.focus();
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', keyboard); };
  }, [open, updatePosition]);
  return <><button {...node.attrs} style={node.style} ref={button} data-analytics-target="about-bio-expand" aria-expanded={open} aria-haspopup="dialog" onClick={() => {
    updatePosition();
    setOpen(value => !value);
  }}>{node.children?.map((child, index) => typeof child === 'string' ? child : <NativeContent key={index} node={child} />)}</button>
    {open && createPortal(<div className="about-bio-popover" style={position} role="dialog" aria-label="Expanded bio" ref={dialog}>
      <div className="about-bio-heading"><h2>Hi, I’m Prathamesh.</h2><button data-analytics-target="about-bio-close" aria-label="Close bio" onClick={() => { setOpen(false); button.current?.focus(); }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      {bioCopy.map(copy => <p key={copy}>{copy}</p>)}
    </div>, document.body)}
  </>;
}

const experience = [
  { name: 'Patreon', role: 'Software Engineer Frontend', dates: 'June 2025 – Aug 2026', bg: 'linear-gradient(135deg, #616161 0%, #000000 100%)', logo: 'ce1fba7ec472ea56.png', logoBlend: 'screen' as const, href: 'https://www.patreon.com', current: false },
  { name: 'Findem', role: 'Product Designer, UX Engineer', dates: 'May 2024 – March 2025', bg: '#A862FF', logo: 'bffe2ea0882eee27.png' },
  { name: 'Adobe', role: 'SDE, UX Contributor', dates: 'March 2021 – June 2023', bg: '#EB1000', logo: 'a9a176dafb2a10ce.png' },
  { name: 'Gryphon.ai', role: 'UX Designer', dates: 'Jan 2020 – July 2020', bg: '#004C6D', logo: '54ea11f7978e8854.png' },
  { name: 'Northeastern Uni.', role: 'Graduate Teaching Assistant', dates: 'Sept 2019 – Dec 2020', bg: '#C8102E', logo: '8154cb1ddfcc7e15.png', href: 'https://www.northeastern.edu' },
  { name: 'Incluvie', role: 'Product Designer, UX Researcher | Capstone', dates: 'Jan 2019 – May 2019', bg: 'linear-gradient(135deg, #616161 0%, #000000 100%)', logo: 'fa5457050086cb00.png' },
  { name: 'Collegepond', role: 'UI/UX Designer', dates: 'Sept 2017 – Aug 2018', bg: '#00A3E0', logo: 'f202f6813d6933ed.jpeg' },
];

function WorkCard({ job, index, left }: { job: typeof experience[number]; index: number; left: number }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useReducedMotion();
  const active = hovered || focused;
  const angle = index % 2 ? 6 : -6;
  return <motion.div className="about-work-card" tabIndex={0} initial={false}
    onHoverStart={() => setHovered(true)} onHoverEnd={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    animate={{ rotate: active && !reduced ? 0 : angle, y: active && !reduced ? -16 : 0, scale: active && !reduced ? 1.08 : 1, zIndex: active ? 20 : index + 1, boxShadow: active ? '0 20px 40px rgba(0,0,0,0.7)' : '0 6px 20px rgba(0,0,0,0.5)' }}
    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 24 }}
    style={{ left, background: job.bg, zIndex: index + 1 }}>
    {job.href && <a href={job.href} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${job.name} website`} data-analytics-target={`external-${new URL(job.href).hostname.replace(/[^a-z0-9-]/g, '-')}`} className="about-work-link" />}
    <motion.div className="about-work-logo" animate={{ y: active && !reduced ? -8 : 0 }} transition={{ duration: reduced ? 0 : .16 }}><img src={`/assets/${job.logo}`} alt={job.name} style={{ mixBlendMode: job.logoBlend ?? 'normal' }} /></motion.div>
    <AnimatePresence>{active && <motion.div className="about-work-detail" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : 4 }} transition={{ duration: reduced ? 0 : .16 }}>
      <div className="about-work-name"><strong>{job.name}</strong>{job.current && <span>NOW</span>}</div><p>{job.role}</p><small>{job.dates}</small>
    </motion.div>}</AnimatePresence>
  </motion.div>;
}

export function workCapacity(width: number) { return Math.max(1, Math.floor((width - 240 - 150) / 106) + 1); }

/* Source logos retain their exact intrinsic rendering. */
function WorkExperience({ node }: { node: NativeNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(836);
  const [page, setPage] = useState(0);
  const capacity = workCapacity(width), pages = Math.ceil(experience.length / capacity), activePage = Math.min(page, pages - 1);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const group = experience.slice(activePage * capacity, (activePage + 1) * capacity);
  const start = (width - 240 - (group.length * 150 + (group.length - 1) * -44)) / 2;
  const arrows = nodes(node).filter(n => n.tag === 'button');
  const arrow = (direction: number) => <button className="about-work-arrow" data-analytics-target={direction < 0 ? "about-work-previous" : "about-work-next"} aria-label={direction < 0 ? 'Previous work experience' : 'Next work experience'} disabled={direction < 0 ? activePage === 0 : activePage === pages - 1} onClick={() => setPage(activePage + direction)}>{arrows[direction < 0 ? 0 : 1]?.children?.map((child, index) => typeof child === 'string' ? child : <NativeContent node={child} key={index} />)}</button>;
  return <div style={node.style} ref={container} className="about-work-carousel" aria-label="Work experience">
    <div className="about-work-row"><div className="about-work-arrow-slot">{arrow(-1)}</div><div className="about-work-inner"><div className="about-work-stage" key={activePage}>
      {group.map((job, index) => <WorkCard key={job.name} job={job} index={index} left={start + index * 106} />)}
    </div></div><div className="about-work-arrow-slot">{arrow(1)}</div></div>
    <div className="about-work-dots" aria-label="Work experience pages">{Array.from({ length: pages }, (_, index) => <button key={index} data-analytics-target={`about-work-page-${index + 1}`} aria-label={`Work experience page ${index + 1}`} aria-current={index === activePage ? 'true' : undefined} onClick={() => setPage(index)} />)}</div>
  </div>;
}

function LocationCarousel({ node }: { node: NativeNode }) {
  const host = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  const move = (next: number) => {
    const list = host.current?.querySelector('ul');
    if (!list) return;
    const index = Math.max(0, Math.min(1, next));
    list.scrollTo({ left: index * (list.clientWidth + 10), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    setSelected(index);
  };
  const override = (child: NativeNode): ReactNode | undefined => {
    if (child.tag === 'button') {
      const previous = child.attrs?.['aria-label'] === 'Previous';
      const disabled = previous ? selected === 0 : selected === 1;
      return <button {...child.attrs} data-analytics-target={previous ? "about-location-previous" : "about-location-next"} disabled={disabled} style={{ ...child.style, opacity: disabled ? 0 : 1, pointerEvents: disabled ? 'none' : 'auto', cursor: disabled ? 'default' : 'pointer' }} onClick={() => move(selected + (previous ? -1 : 1))}>{child.children?.map((item, index) => typeof item === 'string' ? item : <NativeContent key={index} node={item} />)}</button>;
    }
    if (child.tag === 'ul') return <ul {...child.attrs} style={child.style} onScroll={event => setSelected(Math.round(event.currentTarget.scrollLeft / (event.currentTarget.clientWidth + 10)))}>{child.children?.map((item, index) => typeof item === 'string' ? item : <NativeContent key={index} node={item} />)}</ul>;
    return undefined;
  };
  return <section {...node.attrs} style={node.style} ref={host} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(selected + (event.key === 'ArrowRight' ? 1 : -1)); } }}>{node.children?.map((child, index) => typeof child === 'string' ? child : <NativeContent key={index} node={child} renderOverride={override} />)}</section>;
}

export function About() {
  return <><link rel="stylesheet" href="/styles/about.css" precedence="portfolio-source" /><NativeContent node={root} renderOverride={node => {
    if (node.attrs?.['data-framer-name'] === 'Social Links' || socialRows.has(String(node.attrs?.className))) return <SocialLinks node={node} />;
    if (node.attrs?.['aria-label'] === 'Expand bio') return <BioButton node={node} />;
    if (node.style?.fontFamily === 'Inconsolata, monospace' && nodes(node).some(child => child.attrs?.['aria-label'] === 'Next work experience')) return <WorkExperience node={node} />;
    if (node.tag === 'section' && node.attrs?.['aria-roledescription'] === 'carousel') return <LocationCarousel node={node} />;
    if (node.tag === 'video' && node.attrs?.loop && node.attrs?.muted) return createElement('video', { ...node.attrs, style: node.style, autoPlay: true });
    return undefined;
  }} /></>;
}
