/**
 * useLenis.ts — Verdant Finance: Smooth scroll initialization
 *
 * Initializes Lenis for buttery smooth inertia scrolling and integrates
 * it with GSAP's ticker so ScrollTrigger animations stay in sync with
 * the virtual scroll position (not the native browser scroll position).
 *
 * This hook lives here — not in App.tsx — so the animation setup stays
 * separate from business logic as required by code quality guidelines.
 */

import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useLenis(): void {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
    });

    // Wire Lenis into GSAP's RAF loop so ScrollTrigger reads Lenis's scroll
    // position instead of the native window.scrollY. Without this, GSAP
    // animations would trigger at wrong scroll positions.
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });

    gsap.ticker.lagSmoothing(0);

    // Tell ScrollTrigger to use Lenis for scroll position calculations
    ScrollTrigger.scrollerProxy(document.documentElement, {
      scrollTop(value) {
        if (arguments.length && value !== undefined) {
          lenis.scrollTo(value, { immediate: true });
        }
        return lenis.scroll;
      },
      getBoundingClientRect() {
        return {
          top: 0,
          left: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        };
      },
    });

    ScrollTrigger.addEventListener('refresh', () => lenis.resize());
    ScrollTrigger.refresh();

    return () => {
      lenis.destroy();
      gsap.ticker.remove(lenis.raf);
      ScrollTrigger.removeEventListener('refresh', () => lenis.resize());
    };
  }, []);
}

/**
 * Applies GSAP scroll-triggered fade+rise reveals to elements matching the
 * given selector. Call this after the target elements are mounted.
 *
 * Used by section components to register their own reveal animations
 * without cluttering the component render logic.
 */
export function applyScrollReveal(selector: string, stagger = 0.08): void {
  gsap.fromTo(
    selector,
    { opacity: 0, y: 20 },
    {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power2.out',
      stagger,
      scrollTrigger: {
        trigger: selector,
        start: 'top 85%',
        once: true,
      },
    }
  );
}
