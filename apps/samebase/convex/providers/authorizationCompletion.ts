import {
  buildAuthorizationErrorUrl,
  type AuthorizationErrorCode,
  type AuthorizationProvider,
} from "../../shared/authorizationError";
import type { ProviderOAuthStoreResult } from "../organization/providerCredentialModel";

export type AuthorizationCompletionEventType =
  | "convex-oauth-complete"
  | "cloudflare-oauth-complete"
  | "cloudflare-mcp-oauth-complete"
  | "github-app-setup-complete";

export function classifyAuthorizationCallbackError(
  providerError: string,
): Extract<AuthorizationErrorCode, "canceled" | "failed"> {
  return providerError === "access_denied" ? "canceled" : "failed";
}

export function buildAuthorizationCompletionResponse(args: {
  eventType: AuthorizationCompletionEventType;
  returnUrl: string;
  title: string;
}): Response {
  const returnOrigin = new URL(args.returnUrl).origin;
  const serializedReturnUrl = JSON.stringify(args.returnUrl).replace(/</g, "\\u003c");
  const serializedReturnOrigin = JSON.stringify(returnOrigin);
  const serializedEventType = JSON.stringify(args.eventType);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${args.title}</title>
  </head>
  <body>
    <script>
      (function () {
        const returnTo = ${serializedReturnUrl};
        const returnOrigin = ${serializedReturnOrigin};
        try {
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.location.replace(returnTo);
            } catch (error) {
              window.opener.postMessage(
                { type: ${serializedEventType}, returnTo },
                returnOrigin
              );
            }
            window.close();
            return;
          }
        } catch (error) {
          // Fall through to redirect.
        }
        window.location.replace(returnTo);
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function buildProviderOAuthStoreReturnUrl(args: {
  provider: Extract<AuthorizationProvider, "convex" | "cloudflare">;
  returnUrl: string;
  storeResult: ProviderOAuthStoreResult;
}): string {
  switch (args.storeResult.status) {
    case "stored":
      return args.returnUrl;
    case "access_lost":
      return buildAuthorizationErrorUrl(args.returnUrl, {
        provider: args.provider,
        code: "access-changed",
      });
    case "configuration_changed":
      return buildAuthorizationErrorUrl(args.returnUrl, {
        provider: args.provider,
        code: "configuration-changed",
      });
    case "target_mismatch":
      return buildAuthorizationErrorUrl(args.returnUrl, {
        provider: args.provider,
        code: "target-mismatch",
      });
    default:
      args.storeResult satisfies never;
      throw new Error("Unsupported provider OAuth result.");
  }
}
