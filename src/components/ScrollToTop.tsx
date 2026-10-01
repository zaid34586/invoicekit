import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const scroll = () => {
      if (hash) {
        const target = document.getElementById(hash.slice(1));
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          return true;
        }
        return false;
      }

      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return true;
    };

    // Landing sections live inside a lazily-loaded route — the target element
    // often doesn't exist on the first frame after navigating from another
    // page. Retry briefly before falling back to scroll-to-top, otherwise
    // links like /#features silently land at the top of the homepage.
    if (hash && !scroll()) {
      let attempts = 0;
      const interval = window.setInterval(() => {
        attempts += 1;
        if (scroll() || attempts > 20) {
          window.clearInterval(interval);
          if (attempts > 20) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
      }, 50);
      return () => window.clearInterval(interval);
    }

    const frame = window.requestAnimationFrame(scroll);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, hash]);

  return null;
}
