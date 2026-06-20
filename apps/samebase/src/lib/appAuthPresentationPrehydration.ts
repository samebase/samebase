import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { appBuildConfig } from "@/lib/appBuildConfig";
import { Inlineable_createAppAuthPresentationRuntime } from "@/lib/appAuthPresentationRuntime";

const APP_AUTH_PRESENTATION_PREHYDRATION_STYLE_ELEMENT_ID =
  "samebase-app-auth-presentation-prehydration";
const APP_AUTH_PRESENTATION_PREHYDRATION_ROOT_ATTRIBUTE = "data-app-auth-presentation-prehydrated";

export type AppAuthPresentationPrehydrationArgs = {
  accountSectionTestId: string;
  browserConvexProxyPath: string | null;
  envConvexUrl: string | null;
  ignoredPathnames: readonly string[];
  rootAttribute: string;
  styleElementId: string;
};

const appAuthPresentationPrehydrationArgs = {
  accountSectionTestId: PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  browserConvexProxyPath: appBuildConfig.browserConvexProxyPath,
  envConvexUrl: import.meta.env.VITE_CONVEX_URL ?? null,
  ignoredPathnames: ["/visual-fixture"],
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

  function installPrehydrationStyle(label: string) {
    if (document.getElementById(args.styleElementId) !== null) return;

    const accountSectionSelector =
      "[data-testid=" + cssStringLiteral(args.accountSectionTestId) + "]";
    const accountLabelSelector =
      accountSectionSelector + " [data-vault-dashboard-account-section-label]";
    const styleElement = document.createElement("style");
    styleElement.id = args.styleElementId;
    styleElement.textContent = `
html[${args.rootAttribute}] ${accountLabelSelector} {
  color: transparent !important;
  position: relative !important;
}

html[${args.rootAttribute}] ${accountLabelSelector}::after {
  color: hsl(var(--foreground));
  content: ${cssStringLiteral(label)};
  display: block;
  font-size: 0.875rem;
  inset-block-start: 0;
  inset-inline-end: 0;
  inset-inline-start: 0;
  line-height: 1.25rem;
  overflow-wrap: anywhere;
  position: absolute;
}
    `;
    document.head.append(styleElement);
    document.documentElement.setAttribute(args.rootAttribute, "");
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
      installPrehydrationStyle(authPresentationHint.label);
    } else if (authPresentationHint.kind === "signedOut") {
      installPrehydrationStyle("not logged in");
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
