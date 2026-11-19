// The two local HTTPS servers of a conformance run, both with the run's self-signed certificate.
//
// - The TLS proxy: the hub's issuer. It forwards every request to the hub in workerd. With the PKCE
//   adapter on, it adds S256 PKCE to an authorization request that has none, and the matching
//   verifier to that code's token request: the OP plans of the suite send no PKCE, which the hub
//   requires. The adapter changes nothing else: no other parameter, no response, no suite check.
// - The fake OpenID provider: the hub's `fake` connector in the OP plans. It signs in one test user
//   with no password, and always as a fresh login, so `prompt=login` and `max_age` work. The OP
//   plans test the hub as a provider, not this upstream.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { createServer, type Server } from "node:https";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { FAKE_ISSUER, HUB_PORT, ISSUER, OP_ALIAS, SUITE_URL } from "./addresses.ts";

export type Tls = { readonly key: string; readonly cert: string };

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString();
};

const listen = (server: Server, port: number, host: string) =>
  new Promise<Server>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });

/** A request listener over an async handler: a handler that throws answers a bare 500. */
const served =
  (handle: (request: IncomingMessage, response: ServerResponse) => Promise<unknown>) =>
  (request: IncomingMessage, response: ServerResponse) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500);
      }
      response.end();
    });
  };

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** The proxy's PKCE adapter: on or off, switched per plan. */
export type PkceAdapter = { enabled: boolean };

/**
 * The hub's issuer, on all interfaces: the suite's containers reach it through the Docker host.
 * The path and query reach the hub unchanged; the hub reads only the path.
 */
export async function startProxy(tls: Tls, port: number, adapter: PkceAdapter) {
  const verifierByState = new Map<string, string>();
  const verifierByCode = new Map<string, string>();
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", ISSUER);
    let body = await readBody(request);
    const form = request.method === "POST";
    const params = form ? new URLSearchParams(body) : url.searchParams;
    let changed = false;
    if (adapter.enabled && url.pathname === "/authorize" && !params.has("code_challenge")) {
      const verifier = randomBytes(32).toString("base64url");
      verifierByState.set(params.get("state") ?? "", verifier);
      params.set("code_challenge", s256(verifier));
      params.set("code_challenge_method", "S256");
      changed = true;
    }
    if (adapter.enabled && url.pathname === "/token" && !params.has("code_verifier")) {
      const verifier = verifierByCode.get(params.get("code") ?? "");
      if (verifier !== undefined) {
        params.set("code_verifier", verifier);
        changed = true;
      }
    }
    if (changed && form) {
      body = params.toString();
    }
    const headers = { ...request.headers };
    if (form) {
      headers["content-length"] = String(Buffer.byteLength(body));
    }
    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: HUB_PORT,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers,
      },
      (answer) => {
        const location = answer.headers.location;
        if (adapter.enabled && location !== undefined) {
          // The hub's redirect to the suite's callback: remember the code's verifier.
          const target = new URL(location, ISSUER);
          const code = target.searchParams.get("code");
          const verifier = verifierByState.get(target.searchParams.get("state") ?? "");
          if (target.origin === SUITE_URL && code !== null && verifier !== undefined) {
            verifierByCode.set(code, verifier);
          }
        }
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      },
    );
    upstream.on("error", () => {
      response.writeHead(502);
      response.end("The local hub is not running.");
    });
    upstream.end(body);
  };
  return await listen(createServer(tls, served(handle)), port, "0.0.0.0");
}

const json = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
};

/** The callback of the hub's `fake` connector: the only return address the fake provider takes. */
const FAKE_CALLBACK = `${ISSUER}/connectors/fake/callback`;

/** The fake OpenID provider, on loopback: only the hub calls it. */
export async function startFakeUpstream(
  tls: Tls,
  port: number,
  client: { readonly id: string; readonly secret: string },
) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = { ...(await exportJWK(publicKey)), kid: "fake", alg: "RS256", use: "sig" };
  const codes = new Map<
    string,
    { nonce: string | null; challenge: string | null; authTime: number; scope: string }
  >();
  const secretMatches = (secret: string | null) =>
    secret !== null &&
    secret.length === client.secret.length &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(client.secret));
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", FAKE_ISSUER);
    if (url.pathname === "/.well-known/openid-configuration") {
      return json(response, 200, {
        issuer: FAKE_ISSUER,
        authorization_endpoint: `${FAKE_ISSUER}/authorize`,
        token_endpoint: `${FAKE_ISSUER}/token`,
        jwks_uri: `${FAKE_ISSUER}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      });
    }
    if (url.pathname === "/jwks") {
      return json(response, 200, { keys: [publicJwk] });
    }
    if (url.pathname === "/authorize") {
      const query = url.searchParams;
      if (query.get("client_id") !== client.id || query.get("redirect_uri") !== FAKE_CALLBACK) {
        return json(response, 400, { error: "invalid_request" });
      }
      const code = randomUUID();
      codes.set(code, {
        nonce: query.get("nonce"),
        challenge: query.get("code_challenge"),
        authTime: Math.floor(Date.now() / 1000),
        scope: query.get("scope") ?? "",
      });
      const callback = new URL(FAKE_CALLBACK);
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", query.get("state") ?? "");
      response.writeHead(302, { Location: callback.href });
      return response.end();
    }
    if (url.pathname === "/token" && request.method === "POST") {
      const form = new URLSearchParams(await readBody(request));
      const code = codes.get(form.get("code") ?? "");
      codes.delete(form.get("code") ?? "");
      if (form.get("client_id") !== client.id || !secretMatches(form.get("client_secret"))) {
        return json(response, 401, { error: "invalid_client" });
      }
      if (
        code === undefined ||
        form.get("redirect_uri") !== FAKE_CALLBACK ||
        code.challenge === null ||
        s256(form.get("code_verifier") ?? "") !== code.challenge
      ) {
        return json(response, 400, { error: "invalid_grant" });
      }
      const now = Math.floor(Date.now() / 1000);
      const idToken = await new SignJWT({
        ...(code.nonce === null ? {} : { nonce: code.nonce }),
        auth_time: code.authTime,
        email: "user@example.test",
        email_verified: true,
        name: "Conformance User",
      })
        .setProtectedHeader({ alg: "RS256", kid: "fake" })
        .setIssuer(FAKE_ISSUER)
        .setSubject("user-1")
        .setAudience(client.id)
        .setIssuedAt(now)
        .setExpirationTime(now + 300)
        .sign(privateKey);
      return json(response, 200, {
        access_token: randomBytes(16).toString("hex"),
        token_type: "Bearer",
        expires_in: 300,
        id_token: idToken,
      });
    }
    response.writeHead(404);
    return response.end();
  };
  return await listen(createServer(tls, served(handle)), port, "127.0.0.1");
}

/** The suite's callback of the OP plans' clients. */
export const OP_CALLBACK = `${SUITE_URL}/test/a/${OP_ALIAS}/callback`;
