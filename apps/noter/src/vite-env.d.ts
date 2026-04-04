/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  readonly VITE_PUBLIC_POSTHOG_TOKEN?: string;
}

declare const __APP_COMMIT__: string;
declare const __APP_COMMIT_NUMBER__: number | null;
declare const __APP_REPO_URL__: string;
declare const __DAYTONA_SDK_VERSION__: string;
declare const __DAYTONA_CONVEX_PROXY_PATH__: string | null;
