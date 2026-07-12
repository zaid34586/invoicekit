// Single source of truth for the app's public URL used in auth email links.
// Never hardcode localhost or the Vercel URL anywhere else in the project —
// import SITE_URL from here instead.
//
// import.meta.env.DEV is set automatically by Vite:
//   true  -> when running `npm run dev` (localhost)
//   false -> when running the production build (`vite build`, what Vercel runs)

const SITE_URLS = {
  development: "http://localhost:5173",
  production: "https://getrivox.vercel.app",
};

export const SITE_URL = import.meta.env.DEV
  ? SITE_URLS.development
  : SITE_URLS.production;