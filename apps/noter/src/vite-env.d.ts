/// <reference types="vite/client" />

declare const __APP_COMMIT__: string;
declare const __APP_COMMIT_NUMBER__: number | null;
declare const __APP_REPO_URL__: string;
declare const __DAYTONA_CONVEX_PROXY_PATH__: string | null;

interface ImportMetaEnv {
  readonly VITE_LOCAL_WORKTREE_PASSWORD_EMAIL?: string;
  readonly VITE_LOCAL_WORKTREE_PASSWORD_VALUE?: string;
}
