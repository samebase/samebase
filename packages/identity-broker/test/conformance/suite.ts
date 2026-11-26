// The suite's HTTP API (https://gitlab.com/openid/conformance-suite, `/api`): plans, test
// modules, their state and their logs. Each answer is decoded; a member this code does not read is
// ignored.
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { Schema } from "effect";
import { SUITE_URL } from "./addresses.ts";
import type { Https } from "./http.ts";

const Plan = Schema.Struct({
  id: Schema.String,
  modules: Schema.Array(
    Schema.Struct({ testModule: Schema.String, variant: Schema.optionalKey(Schema.Unknown) }),
  ),
});
const Created = Schema.Struct({ id: Schema.String });
const Info = Schema.Struct({
  status: Schema.String,
  result: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
const LogEntry = Schema.Struct({
  src: Schema.optionalKey(Schema.String),
  result: Schema.optionalKey(Schema.String),
  msg: Schema.optionalKey(Schema.String),
  // A number in some entries, a string such as "400 BAD_REQUEST" in others.
  response_status_code: Schema.optionalKey(Schema.Union([Schema.Number, Schema.String])),
});
const Logs = Schema.Array(LogEntry);
const Browser = Schema.Struct({ runners: Schema.Array(Schema.Unknown) });

export type Issue = { readonly result: string; readonly src: string; readonly msg: string };
export type ModuleRun = {
  readonly plan: string;
  readonly module: string;
  readonly id: string;
  /** FINISHED or INTERRUPTED; a module that did not finish in time is stopped by the driver. */
  readonly status: string;
  /** The suite's result: PASSED, FAILED, WARNING, REVIEW or SKIPPED; absent when interrupted. */
  readonly result: string | undefined;
  /** Why the driver stopped the module, if it did. */
  readonly stopped: string | undefined;
  readonly issues: ReadonlyArray<Issue>;
};

const decodeJson = <A>(schema: Schema.Codec<A>, text: string) =>
  Schema.decodeUnknownSync(Schema.fromJsonString(schema))(text);

export function makeSuite(https: Https, resultsDir: string) {
  const api = async (path: string, method = "GET", body?: unknown) => {
    const answer = await https(`${SUITE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (answer.status < 200 || answer.status >= 300) {
      // The answer can echo the configuration with its client secrets: a private file only.
      await writeFile(`${resultsDir}/last-api-error.txt`, answer.text, { mode: 0o600 });
      throw new Error(`Suite API ${method} ${path.split("?")[0]} answered ${answer.status}`);
    }
    return answer.text;
  };
  const info = async (id: string) => decodeJson(Info, await api(`/api/info/${id}`));
  const logs = async (id: string) => decodeJson(Logs, await api(`/api/log/${id}`));
  const done = (status: string) => status === "FINISHED" || status === "INTERRUPTED";

  return {
    ready: async () => {
      try {
        await api("/api/server");
        return true;
      } catch {
        return false;
      }
    },
    createPlan: async (name: string, variant: unknown, config: unknown) =>
      decodeJson(
        Plan,
        await api(
          `/api/plan?planName=${name}&variant=${encodeURIComponent(JSON.stringify(variant))}`,
          "POST",
          config,
        ),
      ),
    startModule: async (planId: string, module: string, variant: unknown) =>
      decodeJson(
        Created,
        await api(
          `/api/runner?plan=${planId}&test=${module}&variant=${encodeURIComponent(JSON.stringify(variant ?? {}))}`,
          "POST",
        ),
      ).id,
    info,
    /** Waits until the module is WAITING for its client, or ended. */
    waitUntilWaiting: async (id: string) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const state = await info(id);
        if (state.status === "WAITING" || done(state.status)) {
          return state.status;
        }
        await sleep(200);
      }
      throw new Error(`Module ${id} did not reach WAITING`);
    },
    /**
     * Polls until the module ends or `shouldStop` names a reason, then stops it if it is still
     * running, and records its logs privately (they hold client secrets and tokens).
     */
    finish: async (args: {
      plan: string;
      module: string;
      id: string;
      deadlineMs: number;
      shouldStop: () => Promise<string | undefined>;
    }): Promise<ModuleRun> => {
      const deadline = Date.now() + args.deadlineMs;
      let state = await info(args.id);
      let stopped: string | undefined;
      while (!done(state.status)) {
        stopped = Date.now() > deadline ? "deadline" : await args.shouldStop();
        if (stopped !== undefined) {
          break;
        }
        await sleep(300);
        state = await info(args.id);
      }
      if (!done(state.status)) {
        await api(`/api/runner/${args.id}`, "DELETE");
        for (let attempt = 0; attempt < 30 && !done(state.status); attempt++) {
          await sleep(200);
          state = await info(args.id);
        }
      }
      const entries = await logs(args.id);
      await writeFile(
        `${resultsDir}/${args.plan}--${args.module}--${args.id}.json`,
        JSON.stringify({ info: state, logs: entries }, null, 2),
        { mode: 0o600 },
      );
      return {
        plan: args.plan,
        module: args.module,
        id: args.id,
        status: state.status,
        result: state.status === "FINISHED" ? (state.result ?? undefined) : undefined,
        stopped,
        issues: entries.flatMap((entry) =>
          entry.result === "FAILURE" || entry.result === "WARNING" || entry.result === "REVIEW"
            ? [{ result: entry.result, src: entry.src ?? "", msg: entry.msg ?? "" }]
            : [],
        ),
      };
    },
    /**
     * Whether the suite's browser has nothing left to do and its last page was an HTTP 4xx or 5xx
     * page: the module waits for a callback that the broker's error page will never send.
     */
    browserStalledOnErrorPage: async (id: string) => {
      const browser = decodeJson(Browser, await api(`/api/runner/browser/${id}`));
      if (browser.runners.length > 0) {
        return false;
      }
      const last = (await logs(id)).findLast(
        (entry) =>
          entry.src === "WebRunner" &&
          entry.msg === "Scripted browser HTTP response" &&
          entry.response_status_code !== undefined,
      );
      return Number.parseInt(String(last?.response_status_code ?? "0"), 10) >= 400;
    },
  };
}

export type Suite = ReturnType<typeof makeSuite>;
