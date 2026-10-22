import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import * as Schema from "effect/Schema";
import { api } from "./convex/_generated/api.ts";

process.chdir(import.meta.dirname);
const output = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      association: Schema.Struct({
        deployment: Schema.String,
        componentPath: Schema.String,
        resourceFqn: Schema.String,
        workerUrl: Schema.String,
      }),
    }),
  ),
)(readFileSync(".alchemy/state/component-binding-explicit/local/__stack_output__.json", "utf8"));
assert.equal(output.association.deployment, "http://127.0.0.1:33210");
assert.equal(output.association.componentPath, "jobs");
assert.equal(output.association.resourceFqn, "JobWorker");
const client = new ConvexHttpClient(output.association.deployment);
const id = await client.action(api.host.submit, { text: "  Explicit component binding  " });
const result = await client.query(api.host.result, { id });
assert.deepEqual(result, {
  input: "  Explicit component binding  ",
  output: "EXPLICIT COMPONENT BINDING",
});
const wrongSecret = await fetch(output.association.workerUrl, {
  method: "POST",
  headers: { authorization: "Bearer wrong-local-secret" },
  body: "must not be accepted",
});
assert.equal(wrongSecret.status, 401);
console.log(JSON.stringify({ ...output, result, wrongSecretStatus: wrongSecret.status }, null, 2));
