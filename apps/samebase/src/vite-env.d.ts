/// <reference types="vite/client" />

declare const __APP_BUILD_CONFIG__: import("./lib/appBuildConfig").AppBuildConfig;
declare var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;

interface Navigation extends EventTarget {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;

  back(): void;
  forward(): void;
}

interface Window {
  readonly navigation: Navigation;
}

interface ImportMetaEnv {
  readonly VITE_LOCAL_WORKTREE_PASSWORD_EMAIL?: string;
  readonly VITE_LOCAL_WORKTREE_PASSWORD_VALUE?: string;
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  readonly VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?: string;
  readonly VITE_SAMEBASE_ROUTE_ENVIRONMENT?: string;
}
