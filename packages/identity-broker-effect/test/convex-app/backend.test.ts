// The adapter steps and a sign-in through the component, on a real Convex backend: the anonymous
// local deployment that `npx convex dev` runs for this package (convex.json names this app). With
// it running, `pnpm run test:convex` runs this file. The test empties the app's step tables and
// the component's tables, so it refuses any deployment that is not anonymous and local.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { Schema } from "effect";
import fc from "fast-check";
import { beforeEach, expect, test } from "vite-plus/test";
import {
  dyingStep,
  edgeStep,
  foundOf,
  longStep,
  memoryPlayer,
  memorySignIn,
  negativeZero,
  play,
  playSignIn,
  sameKey,
  signInCleanup,
  stepLists,
  type Player,
} from "../../src/hosts/convex/testing.ts";
import { StepOutput } from "../../src/store/testing.ts";
import { api } from "./convex/_generated/api.js";

const packageDir = fileURLToPath(new URL("../..", import.meta.url));
const local = parseEnv(readFileSync(join(packageDir, ".env.local"), "utf8"));
const deployment = local["CONVEX_DEPLOYMENT"];
const url = local["CONVEX_URL"];
if (
  deployment === undefined ||
  !deployment.startsWith("anonymous:") ||
  url === undefined ||
  new URL(url).hostname !== "127.0.0.1"
) {
  throw new Error(
    "Run `npx convex dev` in packages/identity-broker-effect first: no local backend",
  );
}

const client = new ConvexHttpClient(url);
const decodeOutput = Schema.decodeUnknownSync(StepOutput);

const player: Player = async (input) =>
  decodeOutput(await client.mutation(api.ops.step, { step: input }));

const same = (after: unknown, before: unknown) => expect(after).toEqual(before);

/** Empties the component's tables: an import of a snapshot with no tables, as `--replace-all`. */
const emptyComponent = () => {
  const dir = mkdtempSync(join(tmpdir(), "identity-broker-effect-"));
  try {
    const zip = join(dir, "empty.zip");
    // A zip file with no entries is its end-of-central-directory record alone.
    writeFileSync(zip, Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("CONVEX_")),
    );
    const result = spawnSync(
      process.execPath,
      [
        join(packageDir, "node_modules/convex/bin/main.js"),
        "import",
        "--component",
        "identityBroker",
        "--replace-all",
        "--yes",
        zip,
      ],
      { cwd: packageDir, env: { ...env, CONVEX_DEPLOYMENT: deployment }, stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error("The import that empties the component failed");
    }
  } finally {
    rmSync(dir, { recursive: true });
  }
};

beforeEach(async () => {
  await client.mutation(api.ops.reset, {});
});

test("random operation lists give the memory adapter's results", async () => {
  await fc.assert(
    fc.asyncProperty(stepLists, async (steps) => {
      await client.mutation(api.ops.reset, {});
      const fromMemory = await play(steps, memoryPlayer(), same);
      expect(await play(steps, player, same)).toEqual(fromMemory);
    }),
    { numRuns: 100 },
  );
}, 600_000);

test("equal index keys keep insertion order, and a replace keeps the row's place", async () => {
  expect((await player(sameKey.step)).log).toEqual(sameKey.log);
});

test("fixed steps at the edges give the memory adapter's results, and a step that dies writes nothing", async () => {
  const steps = [longStep, edgeStep, dyingStep];
  const fromMemory = await play(steps, memoryPlayer(), same);
  expect(fromMemory.at(-2)).toBe("rolled back");
  expect(fromMemory.slice(0, -2)).not.toContain("rolled back");
  expect(await play(steps, player, same)).toEqual(fromMemory);
}, 60_000);

test("-0 and 0 are one index value", async () => {
  expect(foundOf(await player(negativeZero.step))).toEqual(negativeZero.found);
});

test("a sign-in through the component's run gives the memory host's results", async () => {
  emptyComponent();
  const fromConvex = await playSignIn((name, args, now) =>
    client.mutation(api.ops.command, { name, args, now }),
  );
  expect(fromConvex).toEqual(memorySignIn());
  expect(fromConvex.at(-1)).toEqual(signInCleanup);
}, 60_000);
