import { SETTINGS_ROUTE } from "@/lib/settingsRoute";

const POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM = "customer_session_token";

type PolarCheckoutReturnPrehydrationArgs = {
  customerSessionTokenQueryParam: string;
  settingsRoute: string;
};

const polarCheckoutReturnPrehydrationArgs = {
  customerSessionTokenQueryParam: POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM,
  settingsRoute: SETTINGS_ROUTE,
} satisfies PolarCheckoutReturnPrehydrationArgs;

function InlineScript_stripPolarCustomerSessionToken(args: PolarCheckoutReturnPrehydrationArgs) {
  try {
    if (
      window.location.pathname !== args.settingsRoute &&
      window.location.pathname !== `${args.settingsRoute}/`
    ) {
      return;
    }

    const rawSearch = window.location.search.slice(1);
    const searchParts = rawSearch.length > 0 ? rawSearch.split("&") : [];
    const retainedSearchParts = searchParts.filter((part) => {
      const separatorIndex = part.indexOf("=");
      const encodedKey = separatorIndex === -1 ? part : part.slice(0, separatorIndex);
      try {
        return (
          decodeURIComponent(encodedKey.replace(/\+/g, " ")) !== args.customerSessionTokenQueryParam
        );
      } catch {
        return true;
      }
    });
    if (retainedSearchParts.length === searchParts.length) {
      return;
    }

    const serializedSearch = retainedSearchParts.join("&");
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${serializedSearch.length > 0 ? `?${serializedSearch}` : ""}${window.location.hash}`,
    );
  } catch {}
}

export function stripPolarCustomerSessionTokenBeforeHydration() {
  // Fallback for clients where the inline head script did not run before hydration.
  InlineScript_stripPolarCustomerSessionToken(polarCheckoutReturnPrehydrationArgs);
}

export const polarCheckoutReturnPrehydrationScript = `(${InlineScript_stripPolarCustomerSessionToken.toString()})(${JSON.stringify(polarCheckoutReturnPrehydrationArgs)});`;
