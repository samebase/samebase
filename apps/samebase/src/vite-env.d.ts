/// <reference types="vite/client" />

declare const __APP_BUILD_CONFIG__: import("./lib/appBuildConfig").AppBuildConfig;
declare var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;

interface Navigation extends EventTarget {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;

  back(): void;
  forward(): void;
}

type BeforeInstallPromptOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptChoice {
  readonly outcome: BeforeInstallPromptOutcome;
  readonly platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<BeforeInstallPromptChoice>;

  prompt(): Promise<BeforeInstallPromptChoice>;
}

interface Navigator {
  readonly standalone?: boolean;
}

interface WindowEventMap {
  readonly beforeinstallprompt: BeforeInstallPromptEvent;
  readonly "samebase:pwa-install-availability": Event;
}

interface Window {
  readonly navigation: Navigation;
  samebasePwaInstallPromptEvent?: BeforeInstallPromptEvent | null;
}

interface ImportMetaEnv {
  readonly VITE_LOCAL_WORKTREE_PASSWORD_EMAIL?: string;
  readonly VITE_LOCAL_WORKTREE_PASSWORD_VALUE?: string;
  readonly VITE_SAMEBASE_ROUTE_ENVIRONMENT?: string;
}
