// The plans of a conformance run.
//
// OP plans: the suite is the client and the hub the OpenID Provider. The suite's browser opens the
// hub's sign-in page, clicks "Continue with Fake", and the fake provider sends it straight back.
//
// RP plan: the suite is the OpenID Provider and the hub's `suite` connector the client under test.
// The driver below plays the user's browser: it starts a sign-in at the hub, follows the hub to the
// suite and back, and reads where the hub sends the user: a code (the hub accepted the suite's
// answer) or an error (the hub refused it).
import { createHash, randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  ISSUER,
  OP_ALIAS,
  RP_ALIAS,
  RP_DRIVER_REDIRECT_URI,
  SUITE_CONNECTOR_CLIENT_ID,
  SUITE_URL,
} from "./addresses.ts";
import { header, type Https } from "./http.ts";
import type { ModuleRun, Suite } from "./suite.ts";

export type Client = { readonly client_id: string; readonly client_secret: string };

export const CONFIG_PLAN = "oidcc-config-certification-test-plan";
export const BASIC_PLAN = "oidcc-basic-certification-test-plan";
/** The Basic RP plan. It fixes `client_secret_basic` for every module and refuses another. */
export const BASIC_RP_PLAN = "oidcc-client-basic-certification-test-plan";
/** The general RP plan, whose client authentication is a choice: run with `client_secret_post`. */
export const RP_PLAN = "oidcc-client-test-plan";
/**
 * The modules of the Basic RP plan (OIDCCClientBasicTestPlan of the suite), which the gate runs
 * from the general plan with the hub's `client_secret_post`. Not `oidcc-client-test-client-secret-
 * basic`: it requires `client_secret_basic`, which the hub's connectors do not send.
 */
export const BASIC_RP_MODULES = [
  "oidcc-client-test",
  "oidcc-client-test-invalid-iss",
  "oidcc-client-test-missing-sub",
  "oidcc-client-test-invalid-aud",
  "oidcc-client-test-missing-iat",
  "oidcc-client-test-kid-absent-single-jwks",
  "oidcc-client-test-kid-absent-multiple-jwks",
  "oidcc-client-test-idtoken-sig-rs256",
  "oidcc-client-test-idtoken-sig-none",
  "oidcc-client-test-invalid-sig-rs256",
  "oidcc-client-test-userinfo-invalid-sub",
  "oidcc-client-test-nonce-invalid",
  "oidcc-client-test-scope-userinfo-claims",
];

/** The hub's error pages whose text the suite's browser captures as the expected result. */
const EXPECTED_ERROR_PAGES: Readonly<Record<string, string>> = {
  "oidcc-response-type-missing": "Invalid sign-in request|Sign-in refused",
  "oidcc-ensure-registered-redirect-uri": "Invalid redirect URI",
  "oidcc-ensure-request-object-with-redirect-uri":
    "Invalid redirect URI|Invalid sign-in request|Sign-in refused",
};

const capturePage = (pattern: string) => ({
  browser: [
    {
      match: `${ISSUER}/authorize*`,
      tasks: [
        {
          task: "Capture the expected error page",
          match: `${ISSUER}/*`,
          commands: [["wait", "xpath", "//*", 5, pattern, "update-image-placeholder-optional"]],
        },
      ],
    },
  ],
});

/** The OP plans' configuration: three static clients and the browser's steps. */
export const opConfig = (clients: {
  basic: Client;
  basic2: Client;
  post: Client;
}): Record<string, unknown> => {
  const scope = "openid email profile";
  return {
    alias: OP_ALIAS,
    description: "identity-broker-effect, local workerd",
    server: { discoveryUrl: `${ISSUER}/.well-known/openid-configuration` },
    client: { ...clients.basic, scope },
    client2: { ...clients.basic2, scope },
    client_secret_post: { ...clients.post, scope },
    browser: [
      {
        match: `${ISSUER}/authorize*`,
        tasks: [
          {
            task: "Continue with Fake",
            match: `${ISSUER}/authorize*`,
            commands: [
              // A module that asks for a screenshot of a second login (prompt=login, max_age)
              // gets the hub's sign-in page; a module that asks for none skips this.
              ["wait", "xpath", "//*", 5, "[\\s\\S]*", "update-image-placeholder-optional"],
              ["click", "xpath", "//a[contains(@href,'/continue?')]", "optional"],
            ],
          },
          {
            task: "Wait for callback submission",
            optional: true,
            match: `${SUITE_URL}/test/*`,
            commands: [["wait", "id", "submission_complete", 10]],
          },
        ],
      },
    ],
    override: Object.fromEntries(
      Object.entries(EXPECTED_ERROR_PAGES).map(([module, pattern]) => [
        module,
        capturePage(pattern),
      ]),
    ),
  };
};

/** Runs every module of an OP plan, one after the other. */
export async function runOpPlan(args: {
  suite: Suite;
  plan: string;
  variant: Record<string, string>;
  config: Record<string, unknown>;
  only: ReadonlySet<string> | undefined;
  report: (run: ModuleRun) => void;
}): Promise<ModuleRun[]> {
  const plan = await args.suite.createPlan(args.plan, args.variant, args.config);
  const runs: ModuleRun[] = [];
  for (const module of plan.modules) {
    if (args.only !== undefined && !args.only.has(module.testModule)) {
      continue;
    }
    const id = await args.suite.startModule(plan.id, module.testModule, module.variant);
    let stalledSince: number | undefined;
    const run = await args.suite.finish({
      plan: args.plan,
      module: module.testModule,
      id,
      // oidcc-codereuse-30seconds waits 30 s on purpose.
      deadlineMs: 120_000,
      shouldStop: async () => {
        const state = await args.suite.info(id);
        if (state.status !== "WAITING" || !(await args.suite.browserStalledOnErrorPage(id))) {
          stalledSince = undefined;
          return undefined;
        }
        stalledSince ??= Date.now();
        return Date.now() - stalledSince > 3000 ? "hub error page, no callback" : undefined;
      },
    });
    args.report(run);
    runs.push(run);
  }
  return runs;
}

/** What the hub did with one sign-in through the `suite` connector. */
export type HubOutcome =
  | { readonly kind: "accepted"; readonly detail: string }
  | { readonly kind: "rejected"; readonly detail: string }
  | { readonly kind: "stuck"; readonly detail: string };

const cookiePairs = (setCookie: string | string[] | undefined) =>
  (Array.isArray(setCookie) ? setCookie : setCookie === undefined ? [] : [setCookie]).map(
    (line) => line.split(";")[0] ?? "",
  );

const pageTitle = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "no title";

/** One sign-in at the hub with the RP driver's client, as a browser with a cookie jar does. */
export async function signInThroughSuite(https: Https, client: Client): Promise<HubOutcome> {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const authorize = new URL(`${ISSUER}/authorize`);
  authorize.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: RP_DRIVER_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce: randomBytes(16).toString("base64url"),
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  const page = await https(authorize.href);
  const cookies = cookiePairs(page.headers["set-cookie"]);
  const href = /href="(\/continue\?[^"]+)"/.exec(page.text)?.[1];
  if (page.status !== 200 || href === undefined) {
    return { kind: "stuck", detail: `sign-in page: ${page.status} ${pageTitle(page.text)}` };
  }
  let next = new URL(href.replaceAll("&amp;", "&"), ISSUER).href;
  for (let hop = 0; hop < 6; hop++) {
    const answer = await https(
      next,
      next.startsWith(ISSUER) ? { headers: { Cookie: cookies.join("; ") } } : {},
    );
    const location = header(answer, "location");
    if (answer.status !== 302 && answer.status !== 303) {
      return { kind: "stuck", detail: `${new URL(next).pathname}: ${answer.status}` };
    }
    if (location === undefined) {
      return { kind: "stuck", detail: `${new URL(next).pathname}: redirect without location` };
    }
    next = new URL(location, next).href;
    if (!next.startsWith(RP_DRIVER_REDIRECT_URI)) {
      continue;
    }
    const back = new URL(next).searchParams;
    if (back.get("state") !== state) {
      return { kind: "stuck", detail: "the return address has another state" };
    }
    const code = back.get("code");
    if (code === null) {
      return {
        kind: "rejected",
        detail: `${back.get("error") ?? "no error"}: ${back.get("error_description") ?? ""}`,
      };
    }
    const tokens = await https(`${ISSUER}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: RP_DRIVER_REDIRECT_URI,
        code_verifier: verifier,
        client_id: client.client_id,
        client_secret: client.client_secret,
      }).toString(),
    });
    return tokens.status === 200
      ? { kind: "accepted", detail: "code exchanged for tokens" }
      : { kind: "stuck", detail: `token exchange: ${tokens.status}` };
  }
  return { kind: "stuck", detail: "too many redirects" };
}

export type RpRun = ModuleRun & { readonly hub: HubOutcome };

/** The RP plan: one module, then one sign-in at the hub, then the suite's verdict. */
export async function runRpPlan(args: {
  suite: Suite;
  https: Https;
  plan: string;
  /** The modules of the plan to run, in the plan's order. */
  modules: ReadonlyArray<string> | undefined;
  connectorSecret: string;
  driverClient: Client;
  variant: Record<string, string>;
  only: ReadonlySet<string> | undefined;
  report: (run: RpRun) => void;
}): Promise<RpRun[]> {
  const plan = await args.suite.createPlan(args.plan, args.variant, {
    alias: RP_ALIAS,
    description: "identity-broker-effect suite connector, local workerd",
    client: {
      client_id: SUITE_CONNECTOR_CLIENT_ID,
      client_secret: args.connectorSecret,
      redirect_uri: `${ISSUER}/connectors/suite/callback`,
    },
    waitTimeoutSeconds: 5,
  });
  const runs: RpRun[] = [];
  for (const module of plan.modules) {
    if (
      (args.only !== undefined && !args.only.has(module.testModule)) ||
      (args.modules !== undefined && !args.modules.includes(module.testModule))
    ) {
      continue;
    }
    const id = await args.suite.startModule(plan.id, module.testModule, module.variant);
    await args.suite.waitUntilWaiting(id);
    const hub = await signInThroughSuite(args.https, args.driverClient);
    // A module that waits for a UserInfo request after the hub is done never gets one: the hub's
    // connector reads the identity from the id_token. Its own 5 s timeout (`waitTimeoutSeconds`)
    // ends the modules that expect no further request.
    const doneAt = Date.now() + 7_000;
    const run = await args.suite.finish({
      plan: args.plan,
      module: module.testModule,
      id,
      deadlineMs: 15_000,
      shouldStop: async () => {
        await sleep(0);
        return Date.now() > doneAt ? "the hub made no further request" : undefined;
      },
    });
    const rpRun = { ...run, hub };
    args.report(rpRun);
    runs.push(rpRun);
  }
  return runs;
}
