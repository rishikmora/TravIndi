'use client';

import { type CSSProperties, createElement, type ReactNode, useEffect, useRef } from 'react';

type RevealTag = 'div' | 'section' | 'li' | 'article' | 'header' | 'span';

interface RevealProps {
  as?: RevealTag;
  children: ReactNode;
  className?: string;
  /** Stagger in milliseconds. */
  delay?: number;
  id?: string;
}

/**
 * Reveals content once as it scrolls into view, using the shared
 * `[data-reveal]` motion primitive. Content is in the DOM (and readable by
 * assistive tech) from the start; only its presentation animates.
 */
export function Reveal({ as = 'div', children, className, delay = 0, id }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      element.dataset.reveal = 'in';
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          element.dataset.reveal = 'in';
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return createElement(
    as,
    {
      ref,
      id,
      className,
      'data-reveal': '',
      style: { '--reveal-delay': `${delay}ms` } as CSSProperties,
    },
    children,
  );
}
