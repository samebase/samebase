import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import * as Redacted from "effect/Redacted";
import { api } from "./convex/_generated/api.js";
import { construct } from "./local-construction.ts";
import { componentName } from "./feature/name.ts";

const client = new ConvexHttpClient("http://127.0.0.1:33310");
const input = `  declaration ${Date.now()}  `;
const output = await client.action(api.jobs.run, { input });
assert.equal(output, input.trim().toUpperCase());
assert.deepEqual(await client.query(api.jobs.latest, {}), { input, output });
const denied = await fetch("http://127.0.0.1:33312", {
  method: "POST",
  headers: { authorization: "Bearer wrong-secret" },
  body: "reject this",
});
assert.equal(denied.status, 401);
const associationText = await readFile(
  new URL("./.local/association.json", import.meta.url),
  "utf8",
);
const declared = await construct("verification-only-secret", "http://127.0.0.1:33312");
assert.equal(associationText, JSON.stringify(declared.association, null, 2));
assert.deepEqual(
  Object.keys(declared.stack.resources).sort(),
  ["Site", `${componentName}/Transform`, `${componentName}/Secret`].sort(),
);
assert.equal(declared.worker, declared.workerAgain);
assert.equal(declared.secret, declared.secretAgain);
assert.equal(declared.deploymentProps.env?.TEXT_JOB_URL, "http://127.0.0.1:33312");
const convexSecret = declared.deploymentProps.env.TEXT_JOB_SECRET;
const workerSecret = declared.workerProps.env?.BRIDGE_SECRET;
assert(Redacted.isRedacted(convexSecret));
assert(Redacted.isRedacted(workerSecret));
assert.equal(Redacted.value(convexSecret), "verification-only-secret");
assert.equal(Redacted.value(workerSecret), Redacted.value(convexSecret));
assert.equal(associationText.includes("verification-only-secret"), false);
assert.equal(declared.association.componentPath, componentName);
console.log(
  JSON.stringify(
    {
      convexAction: "pass",
      componentStoredResult: "pass",
      hostQuery: "pass",
      wrongSecretStatus: denied.status,
      alchemyResources: Object.keys(declared.stack.resources),
      nativeResourceReuse: "pass",
      nativeOutputToDeployment: "pass",
      explicitComponentAssociation: "pass",
      cloudApply: "not run",
    },
    null,
    2,
  ),
);
