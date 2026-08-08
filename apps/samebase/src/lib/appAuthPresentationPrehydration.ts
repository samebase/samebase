import {
  APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
} from "@/lib/publicLanding";
import { appBuildConfig } from "@/lib/appBuildConfig";
import { Inlineable_createAppAuthPresentationRuntime } from "@/lib/appAuthPresentationRuntime";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";

const APP_AUTH_PRESENTATION_PREHYDRATION_STYLE_ELEMENT_ID =
  "samebase-app-auth-presentation-prehydration";
const APP_AUTH_PRESENTATION_PREHYDRATION_ROOT_ATTRIBUTE = "data-app-auth-presentation-prehydrated";

export type AppAuthPresentationPrehydrationArgs = {
  accountSectionTestId: string;
  browserConvexProxyPath: string | null;
  envConvexUrl: string | null;
  ignoredPathnames: readonly string[];
  mcpConsentPathname: string;
  rootAttribute: string;
  styleElementId: string;
  staticAccountSectionTestId: string;
};

const appAuthPresentationPrehydrationArgs = {
  accountSectionTestId: PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  browserConvexProxyPath: appBuildConfig.browserConvexProxyPath,
  envConvexUrl: import.meta.env["VITE_CONVEX_URL"] ?? null,
  ignoredPathnames: ["/visual-fixture"],
  mcpConsentPathname: MCP_CONSENT_APP_PATH,
  rootAttribute: APP_AUTH_PRESENTATION_PREHYDRATION_ROOT_ATTRIBUTE,
  styleElementId: APP_AUTH_PRESENTATION_PREHYDRATION_STYLE_ELEMENT_ID,
  staticAccountSectionTestId: APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
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

  function installPrehydrationStyle(presentation: {
    kind: "signed-in" | "signed-out";
    label: string;
  }) {
    if (document.getElementById(args.styleElementId) !== null) return;

    const accountSectionSelector =
      "[data-testid=" + cssStringLiteral(args.accountSectionTestId) + "]";
    const accountLabelSelector =
      accountSectionSelector + " [data-vault-dashboard-account-section-label]";
    const staticAccountSectionSelector =
      "[data-testid=" + cssStringLiteral(args.staticAccountSectionTestId) + "]";
    const staticAccountLabelSelector =
      staticAccountSectionSelector + " [data-vault-dashboard-account-section-label]";
    const staticAccountContentSelector =
      staticAccountSectionSelector + " [data-vault-dashboard-account-section-content]";
    const signedOutSelector =
      staticAccountSectionSelector + " [data-app-auth-prehydration-signed-out]";
    const signedOutLabelSelector =
      staticAccountSectionSelector + " [data-app-auth-prehydration-signed-out-label]";
    const signedInSelector =
      staticAccountSectionSelector + " [data-app-auth-prehydration-signed-in]";
    const signedInAccountLabelSelector =
      staticAccountSectionSelector + " [data-app-auth-prehydration-account-label]";
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

html[${args.rootAttribute}="signed-out"] ${staticAccountLabelSelector} {
  display: none !important;
}

html[${args.rootAttribute}="signed-out"] ${staticAccountSectionSelector} {
  border-bottom: 0 !important;
}

html[${args.rootAttribute}="signed-out"] ${staticAccountContentSelector} {
  display: block !important;
  margin-top: 0 !important;
}

html[${args.rootAttribute}="signed-out"] ${signedOutSelector} {
  display: block !important;
}

html[${args.rootAttribute}="signed-out"] ${signedOutLabelSelector}::after {
  content: ${cssStringLiteral(presentation.label)};
  display: block;
  overflow-wrap: anywhere;
}

html[${args.rootAttribute}="signed-in"] ${accountLabelSelector} {
  color: transparent !important;
  position: relative !important;
}

html[${args.rootAttribute}="signed-in"] ${accountLabelSelector}::after {
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

html[${args.rootAttribute}="signed-in"] ${staticAccountLabelSelector} {
  display: none !important;
}

html[${args.rootAttribute}="signed-in"] ${staticAccountContentSelector} {
  display: block !important;
  margin-top: 0 !important;
}

html[${args.rootAttribute}="signed-in"] ${signedInSelector} {
  display: block !important;
}

html[${args.rootAttribute}="signed-in"] ${signedInAccountLabelSelector}::after {
  content: ${cssStringLiteral(presentation.label)};
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
      });
    } else if (authPresentationHint.kind === "signedOut") {
      const signup = new URL(window.location.href).searchParams.get("signup");
      if (
        window.location.pathname !== args.mcpConsentPathname &&
        (signup === "google" || signup === "github")
      ) {
        return;
      }
      installPrehydrationStyle({
        kind: "signed-out",
        label: "Sign in or create an account",
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
