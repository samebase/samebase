// The fixture Worker of the conformance stack: it creates the suite's static clients. It binds the
// local hub's Durable Object (stack.ts) and runs the store command `github.createClient`, as
// `POST /register` does after it checked a GitHub Actions proof. A conformance run has no GitHub
// proof, so this Worker gives the facts of a fixed test repository instead, with an allow-list that
// names it, so the card offers what the fixture enrolls it in. It exists only in the local test
// stack; the deployed hub has no such Worker and no route that creates a client without a proof.
//
// POST / with `{ stage, redirectUris, connectors, tokenEndpointAuthMethod }` answers
// `{ client_id, client_secret }`. Each client is a preview deployment of the app `conformance`.
import { Schema } from "effect";

/** The Durable Object's RPC method (`HubObject.run` in src/hosts/cloudflare/hub.ts). */
interface HubRpc extends Rpc.DurableObjectBranded {
  run(name: string, args: string): string;
}

type Env = { readonly HUB: DurableObjectNamespace<HubRpc> };

const NewClient = Schema.Struct({
  stage: Schema.String,
  redirectUris: Schema.Array(Schema.String),
  connectors: Schema.Array(Schema.String),
  tokenEndpointAuthMethod: Schema.Literals(["client_secret_post", "client_secret_basic"]),
});
const decodeNewClient = Schema.decodeUnknownSync(Schema.fromJsonString(NewClient));
const CreateClientResult = Schema.Struct({ ok: Schema.Boolean });
const decodeResult = Schema.decodeUnknownSync(Schema.fromJsonString(CreateClientResult));

/** The test repository whose facts every client gets. */
const REPOSITORY_ID = "1";
const OWNER_ID = "65";
const APP = "conformance";

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (text: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const randomHex = (length: number) => hex(crypto.getRandomValues(new Uint8Array(length)));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    const body = decodeNewClient(await request.text());
    const clientId = `cl_${randomHex(16)}`;
    const clientSecret = randomHex(32);
    const args = {
      clientId,
      secretHash: await sha256Hex(clientSecret),
      registrationTokenHash: await sha256Hex(randomHex(32)),
      githubRepositoryDatabaseId: REPOSITORY_ID,
      githubOwnerId: OWNER_ID,
      githubRepository: "conformance/hub",
      githubActorId: "12",
      githubActorLogin: "conformance",
      commitSha: "conformance",
      proofIssuedAt: Math.floor(Date.now() / 1000),
      deployment: { type: "preview", stage: body.stage },
      connectors: body.connectors,
      app: APP,
      // `appIdOf` in src/layers/github/register.ts.
      appId: `gh-${REPOSITORY_ID}-${(await sha256Hex(APP)).slice(0, 32)}`,
      redirectUris: body.redirectUris,
      softwareVersion: "conformance",
      tokenEndpointAuthMethod: body.tokenEndpointAuthMethod,
      allowList: [{ repositoryId: REPOSITORY_ID, ownerId: OWNER_ID }],
      configured: body.connectors,
    };
    // `HUB_INSTANCE` of src/hosts/cloudflare/hub.ts, which this Worker does not bundle.
    const result = await env.HUB.getByName("connections").run(
      "github.createClient",
      JSON.stringify(args),
    );
    if (!decodeResult(result).ok) {
      return new Response(result, { status: 409 });
    }
    return Response.json({ client_id: clientId, client_secret: clientSecret });
  },
};
