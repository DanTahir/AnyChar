"use client";

import { useEffect } from "react";

/**
 * Mounts the marketing-page effects after hydration: scroll reveals
 * ([data-reveal]), the hero cursor spotlight ([data-spotlight]) and the about
 * page's table-of-contents scrollspy ([data-toc]). Renders no DOM.
 */
export function MarketingEffects() {
  useEffect(() => {
    document.documentElement.classList.add("js");
    const cleanups: Array<() => void> = [];
    const hasIO = "IntersectionObserver" in window;

    // Scroll reveal
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (hasIO) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("revealed");
              io.unobserve(entry.target);
            }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0 },
      );
      targets.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    } else {
      targets.forEach((el) => el.classList.add("revealed"));
    }

    // Cursor-follow spotlight
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll<HTMLElement>("[data-spotlight]").forEach((el) => {
        let frame = 0;
        const onMove = (ev: PointerEvent) => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect();
            el.style.setProperty("--x", `${((ev.clientX - rect.left) / rect.width) * 100}%`);
            el.style.setProperty("--y", `${((ev.clientY - rect.top) / rect.height) * 100}%`);
          });
        };
        el.addEventListener("pointermove", onMove);
        cleanups.push(() => {
          el.removeEventListener("pointermove", onMove);
          cancelAnimationFrame(frame);
        });
      });
    }

    // Table-of-contents scrollspy
    const toc = document.querySelector<HTMLElement>("[data-toc]");
    if (toc && hasIO) {
      const links = new Map<string, HTMLAnchorElement>();
      toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
        links.set(a.hash.slice(1), a);
      });
      const visible = new Set<string>();
      const spy = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target.id);
            else visible.delete(entry.target.id);
          }
          const active = [...links.keys()].find((id) => visible.has(id));
          if (!active) return;
          links.forEach((a, id) => {
            a.dataset.active = String(id === active);
          });
        },
        { rootMargin: "-20% 0px -55% 0px" },
      );
      links.forEach((_, id) => {
        const section = document.getElementById(id);
        if (section) spy.observe(section);
      });
      cleanups.push(() => spy.disconnect());
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
