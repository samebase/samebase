// The comment from recorded stages: the app and the sidebars example of samebase/samebase at its
// pull request 1829, and a bucket of samebase/scout. Secret values and `props.env` are not recorded.
import { readFileSync } from "node:fs";
import { inMemoryState } from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RUN_RECORD_KEY } from "@samebase/alchemy-kit/run-record";
import {
  readStackCards,
  renderStackComment,
  saveStackComment,
  type StackCard,
} from "../src/StackComment.ts";

interface RecordedStage {
  readonly stack: string;
  readonly stage: string;
  readonly rows: readonly { readonly fqn: string; readonly attr?: object }[];
  readonly output: unknown;
}

const recorded = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const stages = recorded("./fixtures/state/stack_comment_stages.json") as readonly RecordedStage[];

const repository = "samebase/samebase";

const stateOf = (recordedStages: readonly RecordedStage[]) => {
  const rows: Record<string, Record<string, Record<string, never>>> = {};
  const outputs: Record<string, Record<string, unknown>> = {};
  for (const { output, rows: stageRows, stack, stage } of recordedStages) {
    rows[stack] = {
      ...rows[stack],
      [stage]: Object.fromEntries(stageRows.map((row) => [row.fqn, row as never])),
    };
    outputs[stack] = { ...outputs[stack], [stage]: output };
  }
  return inMemoryState(rows, outputs);
};

const cardsAt = (stage: string, name = repository, recordedStages = stages) =>
  Effect.runPromise(
    readStackCards({ repository: name, repositoryId: "1021726325", stage }).pipe(
      Effect.provide(stateOf(recordedStages)),
    ),
  );

const workerBox = (cards: readonly StackCard[]) => cards[1]?.diagram.boxes[0];

describe("readStackCards", () => {
  it("gives a card for each stack of the repository with the stage", async () => {
    const cards = await cardsAt("pr-1829");

    expect(cards.map(({ name }) => name)).toEqual([
      "samebase/samebase/apps/samebase",
      "samebase/samebase/apps/sidebars-example",
    ]);
  });

  it("gives no card for a stack without the stage", async () => {
    expect(await cardsAt("pr-1")).toEqual([]);
  });

  it("does not read a repository whose name starts with the same text", async () => {
    expect(await cardsAt("pr-1829", "samebase/same")).toEqual([]);
  });

  it("selects a stage with a version 2 record by the repository id, under any stack name", async () => {
    // The recorded app stage, deployed before a rename of the repository, and a stage of another
    // repository under the current name.
    const [app] = stages;
    const recordOf = (repositoryId: string) => ({
      version: 2,
      repositoryId,
      repositoryOwnerId: "285392744",
      repositoryName: "samebase/old-name",
      stackFile: "apps/samebase/alchemy.run.ts",
    });
    const renamed = app
      ? [
          {
            ...app,
            stack: "samebase/old-name/apps/samebase",
            output: { [RUN_RECORD_KEY]: recordOf("1021726325") },
          },
          {
            ...app,
            stack: `${repository}/apps/other`,
            output: { [RUN_RECORD_KEY]: recordOf("5151") },
          },
        ]
      : [];

    const cards = await cardsAt("pr-1829", repository, renamed);

    expect(cards.map(({ name }) => name)).toEqual(["samebase/old-name/apps/samebase"]);
    expect(renderStackComment(cards)).toContain("<b>apps/samebase</b> <sub>pr-1829</sub>");
  });

  it("shows a deployment of two rows as one box, with its project folded in", async () => {
    const [app] = await cardsAt("pr-1829");

    expect(app?.diagram.boxes.map((box) => [box.name, box.folded.map((row) => row.fqn)])).toEqual([
      ["Preview, Site", ["Project"]],
    ]);
  });
});

describe("renderStackComment", () => {
  it("starts with the marker that finds the comment again", async () => {
    const body = renderStackComment(await cardsAt("pr-1829"));

    expect(body.startsWith("<!-- samebase-stacks -->\n")).toBe(true);
  });

  it("names each stack by its folder, with its address and its run", async () => {
    const body = renderStackComment(await cardsAt("pr-1829"));

    expect(body).toContain("<b>apps/samebase</b> <sub>pr-1829</sub>");
    expect(body).toContain("<b>apps/sidebars-example</b> <sub>pr-1829</sub>");
    expect(body).toContain('">adventurous-dog-484.convex.site</a>');
    expect(body).toContain(">7b23daa</a> 2026-10-31");
  });

  it("shows the two rows of one deployment once", async () => {
    const [app] = await cardsAt("pr-1829");

    const body = renderStackComment(app ? [app] : []);

    expect(body.match(/convex\.svg/g)).toHaveLength(1);
  });

  it("does not repeat the address of a Worker in its row", async () => {
    const body = renderStackComment(await cardsAt("pr-1829"));

    expect(body.match(/<br><sub><a href="https:\/\/samebase-monorepo/g)).toBeNull();
  });

  it("shows another URL of a Worker below its name", async () => {
    const cards = await cardsAt("pr-1829");
    const box = workerBox(cards);
    const [app] = cards;

    const body = renderStackComment(
      app && box
        ? [{ ...app, diagram: { ...app.diagram, boxes: [...app.diagram.boxes, box] } }]
        : [],
    );

    expect(body).toContain(
      '<br><sub><a href="https://samebase-monorepo-sidebars-example-pr-1829.pfp.workers.dev">',
    );
  });

  it("links a bucket to the dashboard page of its jurisdiction", async () => {
    const cards = await cardsAt("prod", "samebase/scout");

    const body = renderStackComment(cards);

    expect(body).toMatch(
      /href="https:\/\/dash\.cloudflare\.com\/[0-9a-f]+\/r2\/default\/buckets\/[^"]+"/,
    );
  });

  it("names the root only when the repository has several cards", async () => {
    const [app] = await cardsAt("pr-1829");
    const root = app ? [{ ...app, name: repository, folder: "" }] : [];

    expect(renderStackComment(root)).not.toContain("<b>/</b>");
    expect(renderStackComment([...root, ...root])).toContain("<b>/</b>");
  });

  it("has a blank line between tables and none inside a table", async () => {
    const body = renderStackComment(await cardsAt("pr-1829"));

    expect(body.split("\n\n")).toHaveLength(2);
  });

  it("escapes the values of the state", async () => {
    const [bucket] = await cardsAt("prod", "samebase/scout");
    const [box] = bucket?.diagram.boxes ?? [];

    const body = renderStackComment(
      bucket && box
        ? [{ ...bucket, diagram: { ...bucket.diagram, boxes: [{ ...box, name: "<script>" }] } }]
        : [],
    );

    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;script&gt;");
  });

  it("names the boxes that a box uses, and shows no secret of a row", async () => {
    // The recorded sidebars Worker with a schedule, an R2 binding of the recorded scout bucket and
    // a secret binding, and that bucket with the Worker downstream.
    const [, worker, bucket] = stages;
    const workerRow = worker?.rows[0];
    const bucketRow = bucket?.rows[0];
    const rows =
      workerRow && bucketRow
        ? [
            {
              ...workerRow,
              attr: { ...workerRow.attr, crons: ["0 6 * * *"] },
              bindings: [
                {
                  sid: "WORKSPACES",
                  data: {
                    bindings: [
                      { type: "r2_bucket", name: "WORKSPACES", bucketName: "scout-workspaces" },
                    ],
                  },
                },
                {
                  sid: "TOKEN",
                  data: { bindings: [{ type: "secret_text", name: "TOKEN", text: "token-value" }] },
                },
              ],
            },
            { ...bucketRow, downstream: [workerRow.fqn] },
          ]
        : [];
    const stage = { stack: repository, stage: "pr-1", rows, output: null };

    const body = renderStackComment(await cardsAt("pr-1", repository, [stage]));

    // The bucket shows under the Worker that uses it, with the name of the binding.
    expect(body).toMatch(
      /Site<\/a> <sub>Worker, Daily at 06:00 UTC<\/sub>.*<ul><li>.*DevelopmentWorkspaceBucket<\/a> <code>WORKSPACES<\/code> <sub>R2 Bucket<\/sub><\/li><\/ul>/,
    );
    expect(body).not.toContain("token-value");
  });
});

describe("saveStackComment", () => {
  const comments = recorded("./fixtures/github/issue_comments.json");
  const save = saveStackComment({ token: "t", repository, pullRequest: 1829, body: "new" });

  const stubGitHub = (list: unknown, status = 200) => {
    const calls: { method: string; url: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        const method = init.method ?? "GET";
        calls.push({ method, url });
        return Promise.resolve(
          Response.json(
            method === "GET"
              ? list
              : { html_url: "https://github.com/samebase/samebase/pull/1829#issuecomment-1" },
            { status },
          ),
        );
      }),
    );
    return calls;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces the body of the comment with the marker", async () => {
    const calls = stubGitHub(comments);

    await Effect.runPromise(save);

    expect(calls.at(-1)).toEqual({
      method: "PATCH",
      url: "https://api.github.com/repos/samebase/samebase/issues/comments/6544860482",
    });
  });

  it("posts a comment when no comment has the marker", async () => {
    const calls = stubGitHub([{ id: 1, body: "Preview `pr-1829`: https://example.convex.site" }]);

    await Effect.runPromise(save);

    expect(calls.at(-1)).toEqual({
      method: "POST",
      url: "https://api.github.com/repos/samebase/samebase/issues/1829/comments",
    });
  });

  it("fails with the request, and never the token, when GitHub refuses", async () => {
    stubGitHub({ message: "Resource not accessible by integration" }, 403);

    const exit = await Effect.runPromiseExit(save);

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain("HTTP 403");
    expect(String(exit)).not.toContain("Bearer");
  });
});
