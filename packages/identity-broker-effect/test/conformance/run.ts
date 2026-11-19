// One conformance run of the identity broker in Effect, on this machine:
//
//   node test/conformance/run.ts --work <empty folder> [--plans config,basic,rp] [--only <module>,...]
//
// (or `pnpm run conformance --work <folder>` in packages/identity-broker-effect), with Docker
// running. It makes the run's TLS certificate,
// signing keys and client secrets (mode-600 files in the work folder, never printed), starts the
// suite (compose.yml), the fake provider and the TLS proxy, starts the hub in workerd with
// `alchemy dev` (stack.ts), creates the clients, runs the plans, and compares each module with
// expected.json. It exits 1 when a module differs from its expectation, and 2 when the run broke.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:https";
import { setTimeout as sleep } from "node:timers/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Schema } from "effect";
import { createKeySet } from "../../src/core/keys.ts";
import {
  ADMIN_PORT,
  FAKE_CONNECTOR_CLIENT_ID,
  HOST,
  ISSUER,
  RP_DRIVER_REDIRECT_URI,
} from "./addresses.ts";
import { compare, type Row } from "./expected.ts";
import { makeHttps } from "./http.ts";
import { OP_CALLBACK, startFakeUpstream, startProxy, type PkceAdapter } from "./local-servers.ts";
import {
  BASIC_PLAN,
  BASIC_RP_MODULES,
  BASIC_RP_PLAN,
  CONFIG_PLAN,
  opConfig,
  RP_PLAN,
  runOpPlan,
  runRpPlan,
  type Client,
  type RpRun,
} from "./plans.ts";
import { makeSuite, type ModuleRun } from "./suite.ts";

const { values } = parseArgs({
  options: {
    work: { type: "string" },
    plans: { type: "string", default: "config,basic,rp" },
    only: { type: "string" },
  },
});
if (values.work === undefined) {
  throw new Error("--work <folder> is required");
}
const work = resolve(values.work);
/** packages/identity-broker-effect: `alchemy dev` and compose.yml take their paths from it. */
const packageDir = fileURLToPath(new URL("../..", import.meta.url));
const plans = new Set(values.plans.split(","));
const only = values.only === undefined ? undefined : new Set(values.only.split(","));
const results = `${work}/results`;
mkdirSync(results, { recursive: true, mode: 0o700 });
const secret = (name: string, value: string) => {
  writeFileSync(`${work}/${name}`, value, { mode: 0o600 });
  return value;
};
const startedAt = Date.now();
const log = (line: string) =>
  console.log(`[${((Date.now() - startedAt) / 1000).toFixed(0).padStart(4)} s] ${line}`);

/** `docker compose` on compose.yml, with the run's certificate folder. Its output goes to a file. */
function compose(args: ReadonlyArray<string>) {
  const output = openSync(`${work}/compose.log`, "a", 0o600);
  const result = spawnSync("docker", ["compose", "-f", "test/conformance/compose.yml", ...args], {
    stdio: ["ignore", output, output],
    cwd: packageDir,
    env: { ...process.env, IBE_CONFORMANCE_TLS: work },
  });
  if (result.status !== 0) {
    throw new Error(`docker compose ${args[0] ?? ""} failed; see compose.log in the work folder`);
  }
}

/**
 * A new certificate authority of this run and a server certificate for `localhost.emobix.co.uk`,
 * both valid for one day. workerd's TLS client (webpki) takes no self-signed server certificate:
 * it needs a CA and a leaf with the server-auth key usage.
 */
function makeCertificate() {
  const openssl = (args: ReadonlyArray<string>) => {
    if (spawnSync("openssl", args, { stdio: "ignore" }).status !== 0) {
      throw new Error(`openssl ${args[0] ?? ""} could not make the run's certificate`);
    }
  };
  const subject = (name: string) => ["-subj", `/CN=${name}`];
  openssl([
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-keyout",
    `${work}/ca-key.pem`,
    "-out",
    `${work}/ca.pem`,
    ...subject("ibe-conformance-ca"),
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign",
  ]);
  openssl([
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    `${work}/tls-key.pem`,
    "-out",
    `${work}/tls.csr`,
    ...subject(HOST),
  ]);
  writeFileSync(
    `${work}/tls.ext`,
    `basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:${HOST}
`,
  );
  openssl([
    "x509",
    "-req",
    "-in",
    `${work}/tls.csr`,
    "-CA",
    `${work}/ca.pem`,
    "-CAkey",
    `${work}/ca-key.pem`,
    "-set_serial",
    "1",
    "-days",
    "1",
    "-extfile",
    `${work}/tls.ext`,
    "-out",
    `${work}/tls-cert.pem`,
  ]);
  chmodSync(`${work}/ca-key.pem`, 0o600);
  chmodSync(`${work}/tls-key.pem`, 0o600);
  return {
    ca: readFileSync(`${work}/ca.pem`, "utf8"),
    key: readFileSync(`${work}/tls-key.pem`, "utf8"),
    cert: readFileSync(`${work}/tls-cert.pem`, "utf8"),
  };
}

const NewClient = Schema.fromJsonString(
  Schema.Struct({ client_id: Schema.String, client_secret: Schema.String }),
);

/** A client of the local hub, made by the fixture Worker (admin.ts). */
async function createClient(args: {
  stage: string;
  redirectUri: string;
  connector: string;
  method: "client_secret_post" | "client_secret_basic";
}): Promise<Client> {
  const response = await fetch(`http://127.0.0.1:${ADMIN_PORT}/`, {
    method: "POST",
    body: JSON.stringify({
      stage: args.stage,
      redirectUris: [args.redirectUri],
      connectors: [args.connector],
      tokenEndpointAuthMethod: args.method,
    }),
  });
  if (!response.ok) {
    throw new Error(`The fixture Worker refused the client ${args.stage}: ${response.status}`);
  }
  return Schema.decodeUnknownSync(NewClient)(await response.text());
}

const servers: Server[] = [];
let hub: ChildProcess | undefined;
let exitCode = 2;
let suiteStarted = false;
try {
  // One certificate for the hub's issuer, the fake provider and the suite.
  const tls = makeCertificate();
  const https = makeHttps(tls.ca);
  const suite = makeSuite(https, results);
  log("Starting the suite (compose.yml)");
  compose(["up", "-d", "--wait"]);
  suiteStarted = true;
  for (let attempt = 0; !(await suite.ready()); attempt++) {
    if (attempt > 120) {
      throw new Error("The suite's API did not answer");
    }
    await sleep(2000);
  }

  const fakeSecret = secret("FAKE_UPSTREAM_CLIENT_SECRET", randomBytes(32).toString("hex"));
  const suiteSecret = secret("SUITE_CONNECTOR_CLIENT_SECRET", randomBytes(32).toString("hex"));
  const keys = secret("IDENTITY_BROKER_KEYS", JSON.stringify(await createKeySet()));
  const adapter: PkceAdapter = { enabled: false };
  const serverTls = { key: tls.key, cert: tls.cert };
  servers.push(
    await startFakeUpstream(serverTls, 9446, { id: FAKE_CONNECTOR_CLIENT_ID, secret: fakeSecret }),
  );
  servers.push(await startProxy(serverTls, 9445, adapter));

  log("Starting the hub in workerd (alchemy dev)");
  const output = openSync(`${work}/alchemy-dev.log`, "w", 0o600);
  hub = spawn(
    process.execPath,
    [
      "node_modules/alchemy/bin/cli.js",
      "dev",
      "test/conformance/stack.ts",
      "--stage",
      "conformance",
      "--no-input",
    ],
    {
      stdio: ["ignore", output, output],
      cwd: packageDir,
      env: {
        ...process.env,
        IDENTITY_BROKER_KEYS: keys,
        FAKE_UPSTREAM_CLIENT_SECRET: fakeSecret,
        SUITE_CONNECTOR_CLIENT_SECRET: suiteSecret,
        // workerd trusts these for the hub's own fetches: the fake provider and the suite.
        NODE_EXTRA_CA_CERTS: `${work}/ca.pem`,
        // Nothing of the run leaves the machine, Alchemy's usage reports included.
        ALCHEMY_TELEMETRY_DISABLED: "1",
      },
    },
  );
  for (let attempt = 0; ; attempt++) {
    const ready = await https(`${ISSUER}/.well-known/openid-configuration`).then(
      (answer) => answer.status === 200,
      () => false,
    );
    const admin = await fetch(`http://127.0.0.1:${ADMIN_PORT}/`).then(
      (answer) => answer.status === 405,
      () => false,
    );
    if (ready && admin) {
      break;
    }
    if (hub.exitCode !== null || attempt > 120) {
      throw new Error("The hub did not start; see alchemy-dev.log in the work folder");
    }
    await sleep(1000);
  }
  log("The hub answers discovery");

  const rows: Row[] = [];
  const report = (run: ModuleRun | RpRun) => {
    const hubOutcome = "hub" in run ? ` hub=${run.hub.kind} (${run.hub.detail})` : "";
    log(
      `${run.module}: ${run.status} ${run.result ?? ""}${run.stopped === undefined ? "" : ` stopped: ${run.stopped}`}${hubOutcome}`,
    );
    rows.push({
      plan: run.plan,
      module: run.module,
      id: run.id,
      status: run.status,
      result: run.result,
      stopped: run.stopped,
      issues: run.issues,
      hub: "hub" in run ? run.hub : undefined,
    });
  };

  if (plans.has("config")) {
    log(`Plan ${CONFIG_PLAN}`);
    await runOpPlan({
      suite,
      plan: CONFIG_PLAN,
      variant: {},
      config: {
        alias: "ibe-op-config",
        server: { discoveryUrl: `${ISSUER}/.well-known/openid-configuration` },
      },
      only,
      report,
    });
  }
  if (plans.has("basic")) {
    const client = (stage: string, method: "client_secret_post" | "client_secret_basic") =>
      createClient({ stage, redirectUri: OP_CALLBACK, connector: "fake", method });
    const config = opConfig({
      basic: await client("op-basic-1", "client_secret_basic"),
      basic2: await client("op-basic-2", "client_secret_basic"),
      post: await client("op-post", "client_secret_post"),
    });
    adapter.enabled = true;
    log(`Plan ${BASIC_PLAN} (PKCE adapter on)`);
    await runOpPlan({
      suite,
      plan: BASIC_PLAN,
      variant: { server_metadata: "discovery", client_registration: "static_client" },
      config,
      only,
      report,
    });
    adapter.enabled = false;
  }
  if (plans.has("rp") || plans.has("rp-basic")) {
    const driverClient = await createClient({
      stage: "rp-driver",
      redirectUri: RP_DRIVER_REDIRECT_URI,
      connector: "suite",
      method: "client_secret_post",
    });
    // The Basic RP plan fixes the response type and mode and the client authentication.
    const variant = { client_registration: "static_client", request_type: "plain_http_request" };
    // The gate: the Basic RP plan's modules with the hub's client authentication.
    if (plans.has("rp")) {
      log(`Plan ${RP_PLAN}, the modules of ${BASIC_RP_PLAN}, client_secret_post`);
      await runRpPlan({
        suite,
        https,
        plan: RP_PLAN,
        modules: BASIC_RP_MODULES,
        connectorSecret: suiteSecret,
        driverClient,
        variant: {
          ...variant,
          response_type: "code",
          response_mode: "default",
          client_auth_type: "client_secret_post",
        },
        only,
        report,
      });
    }
    // Evidence only: the Basic RP plan as it is, with its fixed client_secret_basic.
    if (plans.has("rp-basic")) {
      log(`Plan ${BASIC_RP_PLAN}, as it is (client_secret_basic)`);
      await runRpPlan({
        suite,
        https,
        plan: BASIC_RP_PLAN,
        modules: undefined,
        connectorSecret: suiteSecret,
        driverClient,
        variant,
        only,
        report,
      });
    }
  }

  writeFileSync(`${work}/summary.json`, JSON.stringify(rows, null, 2));
  const verdict = compare(rows, only !== undefined);
  console.log(verdict.table);
  if (process.env["GITHUB_STEP_SUMMARY"] !== undefined) {
    writeFileSync(process.env["GITHUB_STEP_SUMMARY"], `${verdict.table}\n`, { flag: "a" });
  }
  log(`Run time ${((Date.now() - startedAt) / 1000).toFixed(0)} s`);
  exitCode = verdict.ok ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "The run broke");
} finally {
  for (const server of servers) {
    server.close();
  }
  if (hub !== undefined && hub.exitCode === null) {
    const exited = new Promise<boolean>((resolve) => hub?.once("exit", () => resolve(true)));
    // `alchemy dev` stops its workerd processes on SIGINT.
    hub.kill("SIGINT");
    if (!(await Promise.race([exited, sleep(15_000, false)]))) {
      hub.kill("SIGTERM");
    }
  }
  if (suiteStarted) {
    compose(["down", "--volumes"]);
  }
}
process.exit(exitCode);
