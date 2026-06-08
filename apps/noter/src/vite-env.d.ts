/// <reference types="vite/client" />

declare const __NOTER_BUILD_CONFIG__: import("./lib/noterBuildConfig").NoterBuildConfig;

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
  readonly VITE_NOTER_ROUTE_SURFACE?: string;
}
