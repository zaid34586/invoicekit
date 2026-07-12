/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PADDLE_CLIENT_TOKEN: string;
  readonly VITE_PADDLE_PRO_MONTHLY_PRICE_ID: string;
  readonly VITE_PADDLE_PRO_YEARLY_PRICE_ID: string;
  readonly VITE_PADDLE_BUSINESS_MONTHLY_PRICE_ID: string;
  readonly VITE_PADDLE_BUSINESS_YEARLY_PRICE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
