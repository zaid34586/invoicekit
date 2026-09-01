import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// GA4's own script only fires a page_view on the very first hard load.
// Since this is a single-page app, every route change after that (clicking
// between /dashboard, /invoices, /clients etc.) is client-side and GA never
// hears about it unless we tell it — so every visited page after the first
// would be invisible in Analytics without this.
export default function AnalyticsTracker() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_path: pathname + search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, search]);

  return null;
}
