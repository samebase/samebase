import {
  PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_SIDEBAR_AUTH_PLACEHOLDER_TEST_ID,
} from "@/lib/publicLanding";
import { AUTH_PROVIDER_STORAGE_KEY } from "@/lib/authStorageKeys";
import { appBuildConfig } from "@/lib/appBuildConfig";
import { Inlineable_createAppAuthPresentationRuntime } from "@/lib/appAuthPresentationRuntime";
import { PRODUCTION_PUBLIC_HOSTNAME } from "@/lib/prodUiMode";
import { type RouteEnvironment } from "@/routing/availability";

const APP_AUTH_PRESENTATION_PREHYDRATION_STYLE_ELEMENT_ID =
  "samebase-app-auth-presentation-prehydration";
const APP_AUTH_PRESENTATION_PREHYDRATION_ROOT_ATTRIBUTE = "data-app-auth-presentation-prehydrated";

export type AppAuthPresentationPrehydrationArgs = {
  accountSectionTestId: string;
  authProviderStorageKey: string;
  browserConvexProxyPath: string | null;
  envConvexUrl: string | null;
  ignoredPathnames: readonly string[];
  productionPublicHostname: string;
  rootAttribute: string;
  sidebarAuthPlaceholderTestId: string;
  staticRouteEnvironment: RouteEnvironment | null;
  styleElementId: string;
};

function readStaticRouteEnvironment(): RouteEnvironment | null {
  const routeEnvironment = import.meta.env.VITE_SAMEBASE_ROUTE_ENVIRONMENT;
  switch (routeEnvironment) {
    case "local":
    case "preview":
    case "production":
      return routeEnvironment;
    default:
      return null;
  }
}

const appAuthPresentationPrehydrationArgs = {
  accountSectionTestId: PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  authProviderStorageKey: AUTH_PROVIDER_STORAGE_KEY,
  browserConvexProxyPath: appBuildConfig.browserConvexProxyPath,
  envConvexUrl: import.meta.env.VITE_CONVEX_URL ?? null,
  ignoredPathnames: ["/visual-fixture"],
  productionPublicHostname: PRODUCTION_PUBLIC_HOSTNAME,
  rootAttribute: APP_AUTH_PRESENTATION_PREHYDRATION_ROOT_ATTRIBUTE,
  sidebarAuthPlaceholderTestId: PUBLIC_LANDING_SIDEBAR_AUTH_PLACEHOLDER_TEST_ID,
  staticRouteEnvironment: readStaticRouteEnvironment(),
  styleElementId: APP_AUTH_PRESENTATION_PREHYDRATION_STYLE_ELEMENT_ID,
} satisfies AppAuthPresentationPrehydrationArgs;

function InlineScript_prehydrateAppAuthPresentation(
  createRuntime: typeof Inlineable_createAppAuthPresentationRuntime,
  args: AppAuthPresentationPrehydrationArgs,
) {
  const runtime = createRuntime();
  function readBrowserConvexUrl() {
    if (args.browserConvexProxyPath !== null) {
      return new URL(args.browserConvexProxyPath, window.location.origin).toString();
    }

    return args.envConvexUrl;
  }

  function cssStringLiteral(value: string) {
    let escaped = "";
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (character === '"' || character === "\\") {
        escaped += "\\" + character;
        continue;
      }

      const characterCode = character.charCodeAt(0);
      if (characterCode < 32 || characterCode === 127) {
        escaped += "\\" + characterCode.toString(16) + " ";
        continue;
      }

      escaped += character;
    }

    return '"' + escaped + '"';
  }

  function formatAuthProviderLabel(provider: string) {
    if (provider === "google") return "Google";
    if (provider === "github") return "GitHub";
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function readAuthProviderLabel() {
    const provider = window.localStorage.getItem(args.authProviderStorageKey)?.trim();
    if (!provider || provider.length > 64) {
      return null;
    }

    return formatAuthProviderLabel(provider);
  }

  function normalizeHostname(hostname: string) {
    const normalizedHostname = hostname.trim().toLowerCase();
    if (normalizedHostname.startsWith("[") && normalizedHostname.endsWith("]")) {
      return normalizedHostname.slice(1, -1);
    }

    return normalizedHostname;
  }

  function readRouteEnvironment() {
    if (args.staticRouteEnvironment !== null) {
      return args.staticRouteEnvironment;
    }

    const hostname = normalizeHostname(window.location.hostname);
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) {
      return "local";
    }

    if (hostname === args.productionPublicHostname) {
      return "production";
    }

    return "preview";
  }

  function readSidebarPasswordAuthSurface() {
    const searchParams = new window.URLSearchParams(window.location.search);
    if (searchParams.has("prod-ui")) {
      return null;
    }

    const routeEnvironment = readRouteEnvironment();
    if (routeEnvironment === "local") {
      return "local_worktree";
    }
    if (routeEnvironment === "preview") {
      return "preview";
    }
    return null;
  }

  function readSidebarAuthPrehydrationFlow() {
    if (window.location.pathname !== "/") {
      return null;
    }

    const searchParams = new window.URLSearchParams(window.location.search);
    if (searchParams.has("sign-in")) {
      return "signIn";
    }
    if (searchParams.has("create-account")) {
      return "signUp";
    }
    return null;
  }

  function installPrehydrationStyle(presentation: {
    kind: "signed-in" | "signed-out";
    label: string;
    providerLabel: string | null;
  }) {
    if (document.getElementById(args.styleElementId) !== null) return;

    const accountSectionSelector =
      "[data-testid=" + cssStringLiteral(args.accountSectionTestId) + "]";
    const accountLabelSelector =
      accountSectionSelector + " [data-vault-dashboard-account-section-label]";
    const accountContentSelector =
      accountSectionSelector + " [data-vault-dashboard-account-section-content]";
    const signedOutSelector = accountSectionSelector + " [data-app-auth-prehydration-signed-out]";
    const signedInSelector = accountSectionSelector + " [data-app-auth-prehydration-signed-in]";
    const signedInEmailSelector = accountSectionSelector + " [data-app-auth-prehydration-email]";
    const signedInProviderSelector =
      accountSectionSelector + " [data-app-auth-prehydration-provider]";
    const sidebarAuthPlaceholderSelector =
      "[data-testid=" + cssStringLiteral(args.sidebarAuthPlaceholderTestId) + "]";
    const sidebarAuthPrehydrationFlow = readSidebarAuthPrehydrationFlow();
    const sidebarPasswordAuthSurface = readSidebarPasswordAuthSurface();
    const sidebarAuthSurface =
      sidebarPasswordAuthSurface ??
      (sidebarAuthPrehydrationFlow === "signIn" ? "google_only" : null);
    const sidebarAuthPlaceholderStyle =
      presentation.kind === "signed-out" &&
      sidebarAuthPrehydrationFlow !== null &&
      sidebarAuthSurface !== null
        ? `
html[${args.rootAttribute}="signed-out"] ${sidebarAuthPlaceholderSelector} {
  display: block !important;
  pointer-events: none !important;
}

html[${args.rootAttribute}="signed-out"] ${sidebarAuthPlaceholderSelector} [data-app-auth-prehydration-sidebar-auth=${cssStringLiteral(`${sidebarAuthPrehydrationFlow}-${sidebarAuthSurface}`)}] {
  display: block !important;
}

`
        : "";
    const styleElement = document.createElement("style");
    styleElement.id = args.styleElementId;
    styleElement.textContent = `
html[${args.rootAttribute}="signed-out"] ${accountLabelSelector} {
  color: transparent !important;
  position: relative !important;
}

html[${args.rootAttribute}="signed-out"] ${accountLabelSelector}::after {
  color: hsl(var(--foreground));
  content: ${cssStringLiteral(presentation.label)};
  display: block;
  font-size: 0.875rem;
  inset-block-start: 0;
  inset-inline-end: 0;
  inset-inline-start: 0;
  line-height: 1.25rem;
  overflow-wrap: anywhere;
  position: absolute;
}

html[${args.rootAttribute}="signed-out"] ${signedOutSelector} {
  display: block !important;
}

html[${args.rootAttribute}="signed-in"] ${accountLabelSelector} {
  display: none !important;
}

html[${args.rootAttribute}="signed-in"] ${accountContentSelector} {
  margin-top: 0 !important;
}

html[${args.rootAttribute}="signed-in"] ${signedInSelector} {
  display: block !important;
}

html[${args.rootAttribute}="signed-in"] ${signedInEmailSelector}::after {
  content: ${cssStringLiteral(presentation.label)};
}
${
  presentation.kind === "signed-in" && presentation.providerLabel !== null
    ? `
html[${args.rootAttribute}="signed-in"] ${signedInProviderSelector} {
  display: block !important;
}

html[${args.rootAttribute}="signed-in"] ${signedInProviderSelector}::after {
  content: ${cssStringLiteral(`Signed in with ${presentation.providerLabel}`)};
}
`
    : ""
}
${sidebarAuthPlaceholderStyle}
    `;
    document.head.append(styleElement);
    document.documentElement.setAttribute(args.rootAttribute, presentation.kind);
    if (typeof window.MutationObserver !== "function") return;

    const observer = new window.MutationObserver(() => {
      if (document.documentElement.hasAttribute(args.rootAttribute)) return;

      styleElement.remove();
      observer.disconnect();
    });
    observer.observe(document.documentElement, {
      attributeFilter: [args.rootAttribute],
      attributes: true,
    });
  }

  try {
    if (args.ignoredPathnames.includes(window.location.pathname)) return;

    const convexUrl = readBrowserConvexUrl();
    if (convexUrl === null) return;

    const authPresentationHint = runtime.readLocalAppAuthPresentationHint({
      search: window.location.search,
      storage: window.localStorage,
      storageNamespace: convexUrl,
    });

    if (authPresentationHint.kind === "present") {
      installPrehydrationStyle({
        kind: "signed-in",
        label: authPresentationHint.label,
        providerLabel: readAuthProviderLabel(),
      });
    } else if (authPresentationHint.kind === "signedOut") {
      installPrehydrationStyle({
        kind: "signed-out",
        label: "not logged in",
        providerLabel: null,
      });
    }
  } catch {}
}

export function buildAppAuthPresentationPrehydrationScript(
  args: AppAuthPresentationPrehydrationArgs,
) {
  return `(${InlineScript_prehydrateAppAuthPresentation.toString()})(${Inlineable_createAppAuthPresentationRuntime.toString()}, ${JSON.stringify(args)});`;
}

export const appAuthPresentationPrehydrationScript = buildAppAuthPresentationPrehydrationScript(
  appAuthPresentationPrehydrationArgs,
);

export function clearAppAuthPresentationPrehydration() {
  document.documentElement.removeAttribute(APP_AUTH_PRESENTATION_PREHYDRATION_ROOT_ATTRIBUTE);
  document.getElementById(APP_AUTH_PRESENTATION_PREHYDRATION_STYLE_ELEMENT_ID)?.remove();
}
