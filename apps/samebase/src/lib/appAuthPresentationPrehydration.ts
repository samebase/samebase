import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY } from "@/lib/authStorageKeys";
import { appBuildConfig } from "@/lib/appBuildConfig";
import { Inlineable_createAppAuthPresentationRuntime } from "@/lib/appAuthPresentationRuntime";
import { PRODUCTION_PUBLIC_HOSTNAMES } from "@/lib/prodUiMode";

const APP_AUTH_PRESENTATION_PREHYDRATION_STYLE_ELEMENT_ID =
  "samebase-app-auth-presentation-prehydration";
const APP_AUTH_PRESENTATION_PREHYDRATION_ROOT_ATTRIBUTE = "data-app-auth-presentation-prehydrated";

export type AppAuthPresentationPrehydrationArgs = {
  accountSectionTestId: string;
  browserConvexProxyPath: string | null;
  envConvexUrl: string | null;
  ignoredPathnames: readonly string[];
  passwordAuthModeStorageKey: string;
  productionPublicHostnames: readonly string[];
  rootAttribute: string;
  styleElementId: string;
};

const appAuthPresentationPrehydrationArgs = {
  accountSectionTestId: PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  browserConvexProxyPath: appBuildConfig.browserConvexProxyPath,
  envConvexUrl: import.meta.env.VITE_CONVEX_URL ?? null,
  ignoredPathnames: ["/visual-fixture"],
  passwordAuthModeStorageKey: PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY,
  productionPublicHostnames: PRODUCTION_PUBLIC_HOSTNAMES,
  rootAttribute: APP_AUTH_PRESENTATION_PREHYDRATION_ROOT_ATTRIBUTE,
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
    if (provider === "password") return "Password";
    return null;
  }

  function readAuthProviderLabel(profile: { authProvider?: string }) {
    const provider = profile.authProvider?.trim();
    if (provider && provider.length <= 64) {
      const providerLabel = formatAuthProviderLabel(provider);
      if (providerLabel !== null) {
        return providerLabel;
      }
    }

    const passwordAuthMode = window.localStorage.getItem(args.passwordAuthModeStorageKey);
    if (passwordAuthMode === "local_worktree_seed" || passwordAuthMode === "preview_seed") {
      return "Password";
    }
    if (passwordAuthMode !== null) {
      return null;
    }

    const hostname = window.location.hostname.trim().toLowerCase();
    const productionPublicHostname = args.productionPublicHostnames.some(
      (productionHostname) => productionHostname === hostname,
    );
    return productionPublicHostname ? null : "Password";
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
    const loadingAccountSelector =
      accountSectionSelector + " [data-app-auth-prehydration-loading-account]";
    const signedInSelector = accountSectionSelector + " [data-app-auth-prehydration-signed-in]";
    const signedInEmailSelector = accountSectionSelector + " [data-app-auth-prehydration-email]";
    const signedInProviderSelector =
      accountSectionSelector + " [data-app-auth-prehydration-provider]";
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

html[${args.rootAttribute}="signed-in"] ${accountLabelSelector} {
  display: none !important;
}

html[${args.rootAttribute}="signed-in"] ${loadingAccountSelector} {
  display: none !important;
}

html[${args.rootAttribute}="signed-in"] ${accountContentSelector} {
  display: block !important;
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
        providerLabel: readAuthProviderLabel(authPresentationHint.profile),
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
