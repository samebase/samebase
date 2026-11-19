import { Effect } from "effect";
import { invalidToken } from "../../core/responses.ts";
import { HubConfig } from "../../core/services.ts";
import { insufficientScope, managementRequest, readAnswer } from "../clientRegistration.ts";
import { command, GithubSettings } from "./settings.ts";

// Client management (RFC 7592) of the GitHub layer's clients. Each client holds its own
// registration access token for its own record, so a client can read or delete only itself.

/**
 * `GET <prefix>/register/<client>`: a deploy of a client reads it (RFC 7592 section 2.1), which
 * also renews it and writes its card again from the settings and the rows of that step.
 */
export const readClient = Effect.fn("readClient")(function* (request: Request) {
  const target = yield* managementRequest(request);
  if (target instanceof Response) {
    return target;
  }
  const hub = yield* HubConfig;
  const { allowList } = yield* GithubSettings;
  const result = yield* command("github.renew", {
    clientId: target.clientId,
    registrationTokenHash: target.registrationTokenHash,
    allowList,
    configured: hub.configured,
  });
  if (!result.ok) {
    // RFC 7592 section 2.1: a client that is gone answers 401, one that may not read answers 403.
    return result.error === "suspended"
      ? insufficientScope("This client is suspended.")
      : invalidToken();
  }
  return readAnswer(
    {
      issuer: hub.issuer,
      clientId: target.clientId,
      createdAt: result.createdAt,
      redirectUris: result.redirectUris,
      clientName: result.clientName,
      softwareId: `${result.tenantId}/${result.app}`,
      softwareVersion: result.softwareVersion,
      tokenEndpointAuthMethod: result.tokenEndpointAuthMethod,
      connectors: result.connectors,
    },
    target.token,
  );
});

/**
 * `DELETE <prefix>/register/<client>`: a preview or development client deletes itself (RFC 7592
 * section 2.3). A production client cannot: a stack destroy can leave a production deployment
 * running, and the hub cannot know that it stopped.
 */
export const deleteClient = Effect.fn("deleteClient")(function* (request: Request) {
  const target = yield* managementRequest(request);
  if (target instanceof Response) {
    return target;
  }
  const result = yield* command("github.remove", {
    clientId: target.clientId,
    registrationTokenHash: target.registrationTokenHash,
  });
  if (!result.ok) {
    return result.error === "production"
      ? insufficientScope("A production client cannot delete itself.")
      : invalidToken();
  }
  return new Response(null, { status: 204 });
});
