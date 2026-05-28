/// <reference types="vite/client" />

declare const __APP_COMMIT__: string;
declare const __APP_COMMIT_NUMBER__: number | null;
declare const __APP_REPO_URL__: string;
declare const __BROWSER_CONVEX_PROXY_PATH__: string | null;
declare const __LANDING_PAGE_SLOGAN__: string;

interface ImportMetaEnv {
  readonly VITE_LOCAL_WORKTREE_PASSWORD_EMAIL?: string;
  readonly VITE_LOCAL_WORKTREE_PASSWORD_VALUE?: string;
  readonly VITE_NOTER_ROUTE_SURFACE?: string;
}
