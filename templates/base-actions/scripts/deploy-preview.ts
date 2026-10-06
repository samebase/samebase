// The deploy:preview script: Workers Builds runs it on every branch other than
// main. It uploads the Worker Preview of the build, then records its URL for
// the pull request comment. scripts/build-worker.ts already wrote a Preview
// build, with the Convex URL of the preview deployment of the same branch
// baked in. Production deploys run `cf deploy --prebuilt` from package.json
// directly.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as Schema from "effect/Schema";

const run = promisify(execFile);
const cfEntrypoint = fileURLToPath(new URL("./bin/cf", import.meta.resolve("cf/package.json")));

// cf reads the preview name from the Workers Builds branch.
const { stdout } = await run(process.execPath, [
  cfEntrypoint,
  "previews",
  "deploy",
  "--prebuilt",
  ...process.argv.slice(2),
]);
const preview = Schema.decodeUnknownSync(
  Schema.Struct({
    preview_id: Schema.String,
    preview_name: Schema.String,
    preview_slug: Schema.String,
    preview_urls: Schema.NonEmptyArray(Schema.String),
    deployment_id: Schema.String,
    deployment_urls: Schema.Array(Schema.String),
  }),
)(lastJsonObject(stdout));

// Workers Builds reads this file for the preview URL on the pull request;
// cf does not write it yet. The entry is the one `wrangler preview` writes.
const outputFilePath = wranglerOutputFilePath();
if (outputFilePath) {
  await mkdir(path.dirname(outputFilePath), { recursive: true });
  const entry = {
    version: 1,
    type: "preview",
    worker_name: await deployedWorkerName(),
    ...preview,
    timestamp: new Date().toISOString(),
  };
  await appendFile(outputFilePath, `${JSON.stringify(entry)}\n`);
}
console.log(`Preview deployed: ${preview.preview_urls[0]}`);

// cf prints the result as a JSON object. Progress lines may come before it,
// so parse from the last line that opens an object.
function lastJsonObject(output: string): unknown {
  const start = output.lastIndexOf("\n{");
  return JSON.parse(output.slice(start === -1 ? output.indexOf("{") : start + 1));
}

// The name of the Worker that `cf previews deploy --prebuilt` uploaded, from
// the Build Output. cloudflare.config.ts would compute the name again from
// the environment of this command; the Build Output holds the name of the
// upload itself.
async function deployedWorkerName() {
  const file = new URL(
    "../.cloudflare/output/v0/workers/default/worker.config.json",
    import.meta.url,
  );
  return Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }))(
    JSON.parse(await readFile(file, "utf8")),
  ).name;
}

// Wrangler's output-file protocol (packages/workers-utils/src/output.ts in
// cloudflare/workers-sdk): one JSON object per line in the file that
// WRANGLER_OUTPUT_FILE_PATH names, or in a new file in the directory that
// WRANGLER_OUTPUT_FILE_DIRECTORY names. Neither variable set: no file.
function wranglerOutputFilePath() {
  const filePath = process.env["WRANGLER_OUTPUT_FILE_PATH"];
  if (filePath) return filePath;
  const directory = process.env["WRANGLER_OUTPUT_FILE_DIRECTORY"];
  if (!directory) return undefined;
  const date = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(".", "_")
    .replace("T", "_")
    .replace("Z", "");
  return path.resolve(directory, `wrangler-output-${date}-${randomBytes(3).toString("hex")}.json`);
}
