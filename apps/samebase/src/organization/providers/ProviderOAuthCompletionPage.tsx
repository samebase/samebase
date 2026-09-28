import { useRouter } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import { buildAuthorizationErrorUrl } from "../../../shared/authorizationError";
import {
  readProviderOAuthAuthorizationProvider,
  readProviderOAuthCompletionFragment,
} from "../../../shared/providerOAuthReturn";
import { ORGANIZATIONS_ROUTE } from "@/organization/organizationRoutes";

/**
The provider OAuth callback sends the browser that approved the grant here once,
with `provider`, `state`, and `code` in the URL fragment. The page removes the
fragment from the address bar before anything else runs, completes the
authorization as the signed-in user, and continues to the returned app URL.
*/
export function ProviderOAuthCompletionPage() {
  const completeProviderOAuth = useAction(api.providerOAuthCompletion.completeProviderOAuth);
  const router = useRouter();
  const startedRef = useRef(false);

  // Arriving here is the only completion trigger. The ref keeps Strict Mode's
  // effect replay from reading the already removed fragment a second time.
  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    const completion = readProviderOAuthCompletionFragment(window.location.hash);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    if (completion === null) {
      void router.navigate({ href: ORGANIZATIONS_ROUTE, replace: true });
      return;
    }

    const failedHref = buildAuthorizationErrorUrl(ORGANIZATIONS_ROUTE, {
      provider: readProviderOAuthAuthorizationProvider(completion.provider),
      code: "failed",
    });
    void completeProviderOAuth({
      provider: completion.provider,
      state: completion.state,
      code: completion.code,
    })
      .then((returnUrl) => {
        const url = new URL(returnUrl);
        void router.navigate({
          href:
            url.origin === window.location.origin
              ? `${url.pathname}${url.search}${url.hash}`
              : failedHref,
          replace: true,
        });
      })
      .catch(() => {
        void router.navigate({ href: failedHref, replace: true });
      });
  }, [completeProviderOAuth, router]);

  return null;
}
