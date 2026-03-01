/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_COMMIT__: string;
declare const __APP_REPO_URL__: string;

interface ImportMetaEnv {
  readonly VITE_PADDLE_ENV?: "sandbox" | "live";
  readonly VITE_PADDLE_CLIENT_TOKEN?: string;
  readonly VITE_PADDLE_PRICE_PRO_MONTHLY?: string;
  readonly VITE_PADDLE_PRICE_PRO_ANNUAL?: string;
  readonly VITE_PADDLE_PRICE_TEAM_MONTHLY?: string;
  readonly VITE_PADDLE_PRICE_TEAM_ANNUAL?: string;
}
