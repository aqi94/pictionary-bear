"use client";

import { useEffect } from "react";

/**
 * Keeps the game shell exactly as tall as the *visible* viewport.
 *
 * - Sets `--app-height` on <html> from `visualViewport.height`, so the layout also shrinks when a
 *   phone's on-screen keyboard opens (iOS never resizes the layout viewport for the keyboard).
 * - Sets `data-kb="open"` while the keyboard is up so secondary UI can get out of the way.
 * - iOS scrolls the page to reveal a focused input; because our shell already fits the visible
 *   area we pin the page back to the top.
 */
export function useAppViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let tallest = 0;
    let lastWidth = 0;

    const update = () => {
      const width = vv ? vv.width : window.innerWidth;
      const height = vv ? vv.height : window.innerHeight;
      if (Math.abs(width - lastWidth) > 1) {
        // rotation / window resize: forget the old baseline
        tallest = 0;
        lastWidth = width;
      }
      tallest = Math.max(tallest, height);
      const keyboardOpen = tallest - height > 140;
      root.style.setProperty("--app-height", `${Math.round(height)}px`);
      root.dataset.kb = keyboardOpen ? "open" : "closed";
      if (keyboardOpen && (window.scrollY !== 0 || (vv && vv.offsetTop > 0))) window.scrollTo(0, 0);
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      root.style.removeProperty("--app-height");
      delete root.dataset.kb;
    };
  }, []);
}
